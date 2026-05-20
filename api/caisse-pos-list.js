// /api/caisse-pos-list.js
// Détecte les configurations POS Odoo (Café, Boutique, etc.) et les enregistre

import { createClient } from '@supabase/supabase-js'

const ODOO_URL      = process.env.ODOO_URL
const ODOO_DB       = process.env.ODOO_DB
const ODOO_USERNAME = process.env.ODOO_USERNAME
const ODOO_PASSWORD = process.env.ODOO_PASSWORD
const SUPA_URL      = process.env.VITE_SUPABASE_URL
const SUPA_SR_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

const sb = createClient(SUPA_URL, SUPA_SR_KEY)

async function odooAuth() {
  const body = `<?xml version="1.0"?>
<methodCall><methodName>authenticate</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><string>${ODOO_USERNAME}</string></value></param>
  <param><value><string>${ODOO_PASSWORD}</string></value></param>
  <param><value><struct></struct></value></param>
</params></methodCall>`
  const res = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body,
  })
  const text = await res.text()
  const m = text.match(/<int>(\d+)<\/int>/)
  if (!m) throw new Error('Odoo auth failed')
  return parseInt(m[1], 10)
}

function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function valueToXml(v) {
  if (v === null || v === undefined) return `<value><nil/></value>`
  if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`
  if (typeof v === 'number') return Number.isInteger(v) ? `<value><int>${v}</int></value>` : `<value><double>${v}</double></value>`
  if (typeof v === 'string') return `<value><string>${escXml(v)}</string></value>`
  if (Array.isArray(v)) return `<value><array><data>${v.map(valueToXml).join('')}</data></array></value>`
  if (typeof v === 'object') {
    const members = Object.entries(v).map(([k, val]) => `<member><name>${escXml(k)}</name>${valueToXml(val)}</member>`).join('')
    return `<value><struct>${members}</struct></value>`
  }
  return `<value><string>${escXml(String(v))}</string></value>`
}

async function odooExec(uid, model, method, args = [], kwargs = {}) {
  const body = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
  <param><value><string>${ODOO_DB}</string></value></param>
  <param><value><int>${uid}</int></value></param>
  <param><value><string>${ODOO_PASSWORD}</string></value></param>
  <param><value><string>${model}</string></value></param>
  <param><value><string>${method}</string></value></param>
  ${valueToXml(args).replace('<value>', '<param><value>').replace('</value>', '</value></param>')}
  ${valueToXml(kwargs).replace('<value>', '<param><value>').replace('</value>', '</value></param>')}
</params></methodCall>`
  const res = await fetch(`${ODOO_URL}/xmlrpc/2/object`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body })
  const text = await res.text()
  if (text.includes('<fault>')) throw new Error('Odoo fault: ' + text.slice(0, 500))
  return parseXmlResponse(text)
}

function parseXmlResponse(xml) { return parseValue(xml, xml.indexOf('<param>')).value }
function parseValue(xml, startIdx) {
  const open = xml.indexOf('<value>', startIdx)
  if (open === -1) return { value: null, end: startIdx }
  const after = open + '<value>'.length
  const first = xml.slice(after, after + 60).trim()
  if (first.startsWith('<array>')) {
    const arr = []; const dataStart = xml.indexOf('<data>', after) + '<data>'.length
    let pos = dataStart
    while (true) {
      const nv = xml.indexOf('<value>', pos); const de = xml.indexOf('</data>', pos)
      if (nv === -1 || nv > de) break
      const v = parseValue(xml, pos); arr.push(v.value); pos = v.end
    }
    const end = xml.indexOf('</value>', xml.indexOf('</array>', after)) + 8
    return { value: arr, end }
  }
  if (first.startsWith('<struct>')) {
    const obj = {}; let pos = after
    while (true) {
      const mo = xml.indexOf('<member>', pos); const se = xml.indexOf('</struct>', pos)
      if (mo === -1 || mo > se) break
      const ns = xml.indexOf('<name>', mo) + 6; const ne = xml.indexOf('</name>', ns)
      const name = xml.slice(ns, ne)
      const v = parseValue(xml, ne); obj[name] = v.value; pos = v.end
    }
    const end = xml.indexOf('</value>', xml.indexOf('</struct>', after)) + 8
    return { value: obj, end }
  }
  const closeIdx = xml.indexOf('</value>', after)
  const inner = xml.slice(after, closeIdx).trim()
  const end = closeIdx + 8
  let v = null, m
  if ((m = inner.match(/<int>(-?\d+)<\/int>/))) v = parseInt(m[1], 10)
  else if ((m = inner.match(/<double>(-?[\d.]+)<\/double>/))) v = parseFloat(m[1])
  else if ((m = inner.match(/<boolean>([01])<\/boolean>/))) v = m[1] === '1'
  else if ((m = inner.match(/<string>([\s\S]*?)<\/string>/))) v = m[1]
  else v = inner
  return { value: v, end }
}

export default async function handler(req, res) {
  try {
    const uid = await odooAuth()
    const ids = await odooExec(uid, 'pos.config', 'search', [[]])
    if (!ids || ids.length === 0) {
      return res.status(200).json({ ok: true, configs: [] })
    }
    const configs = await odooExec(uid, 'pos.config', 'read', [ids, ['id', 'name']])

    // Upsert dans Supabase
    for (const cfg of configs) {
      await sb.from('caisse_pos_sessions_config').upsert({
        pos_config_id: cfg.id,
        name: cfg.name,
      }, { onConflict: 'pos_config_id' })
    }

    return res.status(200).json({ ok: true, configs })
  } catch (e) {
    console.error('caisse-pos-list error:', e)
    return res.status(500).json({ error: e.message || String(e) })
  }
}
