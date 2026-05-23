// /api/pointage-api.js
// Endpoint unifié pour le module Pointage (action=sync-attendance | sync-leaves | sync-employees)
// Utilise les credentials Odoo existants (mêmes que caisse-api.js)

import { createClient } from '@supabase/supabase-js'

const ODOO_URL      = process.env.ODOO_URL
const ODOO_DB       = process.env.ODOO_DB
const ODOO_USERNAME = process.env.ODOO_USERNAME
const ODOO_PASSWORD = process.env.ODOO_PASSWORD
const SUPA_URL      = process.env.VITE_SUPABASE_URL
const SUPA_SR_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

const sb = createClient(SUPA_URL, SUPA_SR_KEY)

// ============================================================
// XML-RPC helpers (même structure que caisse-api.js)
// ============================================================

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
  if (!m) throw new Error('Odoo auth failed: ' + text.slice(0, 500))
  return parseInt(m[1], 10)
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function valueToXml(v) {
  if (v === null || v === undefined) return `<value><nil/></value>`
  if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`
  if (typeof v === 'number') return Number.isInteger(v)
    ? `<value><int>${v}</int></value>`
    : `<value><double>${v}</double></value>`
  if (Array.isArray(v)) {
    return `<value><array><data>${v.map(valueToXml).join('')}</data></array></value>`
  }
  if (typeof v === 'object') {
    const members = Object.entries(v).map(([k, val]) =>
      `<member><name>${escXml(k)}</name>${valueToXml(val)}</member>`
    ).join('')
    return `<value><struct>${members}</struct></value>`
  }
  return `<value><string>${escXml(v)}</string></value>`
}

// Parser XML-RPC response (simple, sans dépendance)
function parseXmlValue(node) {
  const tag = node.tagName.toLowerCase()
  if (tag === 'value') {
    const child = Array.from(node.childNodes).find(n => n.nodeType === 1)
    if (!child) return node.textContent
    return parseXmlValue(child)
  }
  if (tag === 'string') return node.textContent
  if (tag === 'int' || tag === 'i4') return parseInt(node.textContent, 10)
  if (tag === 'double') return parseFloat(node.textContent)
  if (tag === 'boolean') return node.textContent === '1'
  if (tag === 'nil') return null
  if (tag === 'datetime.iso8601') return node.textContent
  if (tag === 'array') {
    const data = node.getElementsByTagName('data')[0]
    return Array.from(data.children).map(parseXmlValue)
  }
  if (tag === 'struct') {
    const obj = {}
    for (const m of node.getElementsByTagName('member')) {
      const name = m.getElementsByTagName('name')[0].textContent
      const val = m.getElementsByTagName('value')[0]
      obj[name] = parseXmlValue(val)
    }
    return obj
  }
  return node.textContent
}

// Parser XML-RPC sans DOM (regex-based, plus simple côté Node)
function parseRpcResponse(xml) {
  // Erreur ?
  const faultMatch = xml.match(/<fault>([\s\S]+?)<\/fault>/)
  if (faultMatch) {
    const msg = faultMatch[1].match(/<string>([\s\S]+?)<\/string>/)?.[1] || 'Unknown fault'
    throw new Error('Odoo fault: ' + msg.slice(0, 500))
  }
  // Le response contient <params><param><value>...</value></param></params>
  // Au lieu de parser manuellement, on utilise xml2js implicite via JSON
  // En pratique on aura besoin d'un parser minimal
  return parseXmlByHand(xml)
}

// Parser maison minimaliste (sans dépendance externe)
function parseXmlByHand(xml) {
  let pos = 0

  function skipWhitespace() {
    while (pos < xml.length && /\s/.test(xml[pos])) pos++
  }

  function expect(tag) {
    skipWhitespace()
    const open = `<${tag}>`
    if (xml.substr(pos, open.length) !== open) {
      throw new Error(`Expected ${open} at pos ${pos}: ${xml.substr(pos, 50)}`)
    }
    pos += open.length
  }

  function tryExpect(tag) {
    skipWhitespace()
    const open = `<${tag}>`
    if (xml.substr(pos, open.length) === open) {
      pos += open.length
      return true
    }
    return false
  }

  function expectClose(tag) {
    skipWhitespace()
    const close = `</${tag}>`
    if (xml.substr(pos, close.length) !== close) {
      throw new Error(`Expected ${close} at pos ${pos}`)
    }
    pos += close.length
  }

  function readUntil(end) {
    const idx = xml.indexOf(end, pos)
    if (idx === -1) throw new Error('Cannot find ' + end)
    const val = xml.substring(pos, idx)
    pos = idx
    return val
  }

  function readValue() {
    skipWhitespace()
    expect('value')
    skipWhitespace()
    let result
    if (tryExpect('int') || tryExpect('i4')) {
      const v = readUntil('</')
      result = parseInt(v, 10)
      pos = xml.indexOf('>', pos) + 1
    } else if (tryExpect('double')) {
      const v = readUntil('</')
      result = parseFloat(v)
      pos = xml.indexOf('>', pos) + 1
    } else if (tryExpect('boolean')) {
      const v = readUntil('</')
      result = v === '1' || v.trim() === '1'
      pos = xml.indexOf('>', pos) + 1
    } else if (tryExpect('string')) {
      const v = readUntil('</string>')
      result = unescapeXml(v)
      expectClose('string')
    } else if (tryExpect('nil/')) {
      // Already consumed
      result = null
    } else if (xml.substr(pos, 5) === '<nil/') {
      pos += 5
      // skip > and possible space
      pos = xml.indexOf('>', pos) + 1
      result = null
    } else if (tryExpect('dateTime.iso8601')) {
      const v = readUntil('</dateTime.iso8601>')
      result = v
      expectClose('dateTime.iso8601')
    } else if (tryExpect('array')) {
      skipWhitespace()
      expect('data')
      result = []
      skipWhitespace()
      while (xml.substr(pos, 7) === '<value>') {
        result.push(readValue())
        skipWhitespace()
      }
      expectClose('data')
      skipWhitespace()
      expectClose('array')
    } else if (tryExpect('struct')) {
      result = {}
      skipWhitespace()
      while (xml.substr(pos, 8) === '<member>') {
        pos += 8
        skipWhitespace()
        expect('name')
        const name = readUntil('</name>')
        expectClose('name')
        const val = readValue()
        result[unescapeXml(name)] = val
        skipWhitespace()
        expectClose('member')
        skipWhitespace()
      }
      expectClose('struct')
    } else {
      // texte brut entre <value> et </value>
      const idx = xml.indexOf('</value>', pos)
      result = xml.substring(pos, idx)
      pos = idx
    }
    skipWhitespace()
    expectClose('value')
    return result
  }

  function unescapeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  }

  // Cherche <params><param><value>...
  const startIdx = xml.indexOf('<params>')
  if (startIdx === -1) {
    // Peut-être réponse vide ou différente
    return null
  }
  pos = startIdx + '<params>'.length
  skipWhitespace()
  expect('param')
  const val = readValue()
  return val
}

async function odooExec(uid, model, method, args = [], kwargs = {}) {
  const body = `<?xml version="1.0"?>
<methodCall><methodName>execute_kw</methodName><params>
<param><value><string>${ODOO_DB}</string></value></param>
<param><value><int>${uid}</int></value></param>
<param><value><string>${ODOO_PASSWORD}</string></value></param>
<param><value><string>${model}</string></value></param>
<param><value><string>${method}</string></value></param>
<param>${valueToXml(args)}</param>
<param>${valueToXml(kwargs)}</param>
</params></methodCall>`

  const res = await fetch(`${ODOO_URL}/xmlrpc/2/object`, {
    method: 'POST', headers: { 'Content-Type': 'text/xml' }, body,
  })
  const text = await res.text()
  return parseRpcResponse(text)
}

// ============================================================
// Action : sync-attendance (pointages d'un mois)
// ============================================================

async function actionSyncAttendance({ mois, annee }) {
  if (!mois || !annee) throw new Error('mois et annee requis')

  // Calcul des bornes (premier jour 00:00, dernier jour 23:59)
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01 00:00:00`
  const nextMonth = mois === 12 ? 1 : mois + 1
  const nextYear  = mois === 12 ? annee + 1 : annee
  const fin = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`

  const uid = await odooAuth()

  // Récupérer tous les pointages du mois
  const attendances = await odooExec(uid, 'hr.attendance', 'search_read', [
    [
      ['check_in', '>=', debut],
      ['check_in', '<',  fin],
    ],
    ['id', 'employee_id', 'check_in', 'check_out', 'worked_hours']
  ], { limit: 5000 })

  // Charger les employés en base (pour matching nom Odoo)
  const { data: employesDb, error: empErr } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)
  if (empErr) throw empErr

  // Construire un index nom_odoo (sans préfixe et insensible casse) -> id
  function normNom(s) {
    if (!s) return ''
    // Enlever préfixe avant "-"
    let n = String(s).trim()
    if (n.includes('-')) {
      const parts = n.split('-')
      // Si premier part fait <=4 chars, c'est le préfixe (PA, PC, PCD, PP, PM)
      if (parts[0].trim().length <= 4) {
        n = parts.slice(1).join('-')
      }
    }
    return n.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // enlever accents
      .replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const empByName = new Map()
  for (const e of employesDb) {
    // Try nom + nom_odoo + nom_odoo_match
    for (const v of [e.nom, e.nom_odoo, e.nom_odoo_match]) {
      if (v) empByName.set(normNom(v), e.id)
    }
  }

  // Préparer les rows à insérer (groupées par employé+jour)
  const rows = []
  let unmatched = 0
  const unmatchedNames = new Set()

  for (const att of attendances) {
    if (!att || !att.employee_id) continue
    const empNameOdoo = Array.isArray(att.employee_id) ? att.employee_id[1] : null
    if (!empNameOdoo) continue
    const empId = empByName.get(normNom(empNameOdoo))
    if (!empId) {
      unmatched++
      unmatchedNames.add(empNameOdoo)
      continue
    }
    // check_in et check_out en datetime Odoo (UTC normalement)
    const checkIn = att.check_in
    const checkOut = att.check_out
    if (!checkIn) continue
    // Date du jour (basée sur check_in)
    const dateOnly = checkIn.slice(0, 10)  // "YYYY-MM-DD"
    rows.push({
      employe_id: empId,
      date_pointage: dateOnly,
      arrivee: checkIn,
      depart: checkOut || null,
      source: 'odoo',
      odoo_id: att.id,
    })
  }

  // Insertion : on supprime d'abord les pointages du mois existants (sauf ceux modifiés manuellement)
  await sb.from('pointages')
    .delete()
    .gte('date_pointage', `${annee}-${String(mois).padStart(2, '0')}-01`)
    .lt('date_pointage',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
    .neq('source', 'manuel')

  // Insertion par batches de 100
  let inserted = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await sb.from('pointages').insert(batch)
    if (error) console.error('insert pointages batch error:', error)
    else inserted += batch.length
  }

  return {
    ok: true,
    total_odoo: attendances.length,
    inserted,
    unmatched,
    unmatched_names: Array.from(unmatchedNames),
  }
}

// ============================================================
// Action : sync-leaves (congés d'un mois)
// ============================================================

async function actionSyncLeaves({ mois, annee }) {
  if (!mois || !annee) throw new Error('mois et annee requis')

  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const nextMonth = mois === 12 ? 1 : mois + 1
  const nextYear  = mois === 12 ? annee + 1 : annee
  const fin = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const uid = await odooAuth()

  // Récupérer les congés validés qui chevauchent le mois
  const leaves = await odooExec(uid, 'hr.leave', 'search_read', [
    [
      ['state', '=', 'validate'],
      ['date_from', '<', fin],
      ['date_to', '>=', debut],
    ],
    ['id', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'name']
  ], { limit: 2000 })

  // Match employés (même logique que attendance)
  const { data: employesDb } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)

  function normNom(s) {
    if (!s) return ''
    let n = String(s).trim()
    if (n.includes('-')) {
      const parts = n.split('-')
      if (parts[0].trim().length <= 4) n = parts.slice(1).join('-')
    }
    return n.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const empByName = new Map()
  for (const e of employesDb) {
    for (const v of [e.nom, e.nom_odoo, e.nom_odoo_match]) {
      if (v) empByName.set(normNom(v), e.id)
    }
  }

  // Supprimer les congés existants du mois (issus d'Odoo)
  await sb.from('conges')
    .delete()
    .or(`date_debut.lte.${fin},date_fin.gte.${debut}`)
    .not('odoo_id', 'is', null)

  const rows = []
  let unmatched = 0
  for (const lv of leaves) {
    if (!lv.employee_id) continue
    const empNameOdoo = Array.isArray(lv.employee_id) ? lv.employee_id[1] : null
    const empId = empByName.get(normNom(empNameOdoo))
    if (!empId) { unmatched++; continue }
    const typeName = Array.isArray(lv.holiday_status_id) ? lv.holiday_status_id[1] : null
    rows.push({
      employe_id: empId,
      date_debut: (lv.date_from || '').slice(0, 10),
      date_fin: (lv.date_to || '').slice(0, 10),
      type_conge: typeName,
      odoo_id: lv.id,
      notes: lv.name,
    })
  }

  let inserted = 0
  if (rows.length > 0) {
    const { error } = await sb.from('conges').insert(rows)
    if (!error) inserted = rows.length
  }

  return { ok: true, total_odoo: leaves.length, inserted, unmatched }
}

// ============================================================
// Action : list-employees (récupérer tous les employés Odoo)
// ============================================================

async function actionListEmployees() {
  const uid = await odooAuth()
  const employees = await odooExec(uid, 'hr.employee', 'search_read', [
    [['active', '=', true]],
    ['id', 'name', 'work_email', 'job_title']
  ], { limit: 500 })
  return { ok: true, employees }
}

// ============================================================
// Handler principal
// ============================================================

export default async function handler(req, res) {
  try {
    const action = req.query?.action || req.body?.action
    const params = req.body || req.query || {}

    let result
    if (action === 'sync-attendance')      result = await actionSyncAttendance(params)
    else if (action === 'sync-leaves')     result = await actionSyncLeaves(params)
    else if (action === 'list-employees')  result = await actionListEmployees()
    else return res.status(400).json({ error: 'Unknown action: ' + action })

    return res.status(200).json(result)
  } catch (e) {
    console.error('pointage-api error:', e)
    return res.status(500).json({ error: e.message || String(e) })
  }
}
