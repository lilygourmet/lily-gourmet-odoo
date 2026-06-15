// /api/caisse-api.js
// Endpoint unifié pour le module Caisse (action=sync-pos | list-pos)
// Fusionné pour rester sous la limite 12 fonctions Vercel Hobby plan

import { createClient } from '@supabase/supabase-js'

const ODOO_URL      = process.env.ODOO_URL
const ODOO_DB       = process.env.ODOO_DB
const ODOO_USERNAME = process.env.ODOO_USERNAME
const ODOO_PASSWORD = process.env.ODOO_PASSWORD
const SUPA_URL      = process.env.VITE_SUPABASE_URL
const SUPA_SR_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const CASH_METHOD   = process.env.ODOO_POS_CASH_METHOD_NAME || 'Espèces'
const CHEQUE_METHOD = process.env.ODOO_POS_CHEQUE_METHOD_NAME || 'Chèque'
const VIREMENT_METHOD = process.env.ODOO_POS_VIREMENT_METHOD_NAME || 'Virement bancaire'

const sb = createClient(SUPA_URL, SUPA_SR_KEY)

// ---- XML-RPC helpers ----
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
<param>${valueToXml(args)}</param>
<param>${valueToXml(kwargs)}</param>
</params></methodCall>`
  const res = await fetch(`${ODOO_URL}/xmlrpc/2/object`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body })
  const text = await res.text()
  if (text.includes('<fault>')) throw new Error('Odoo fault: ' + text.slice(0, 800))
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
  else if ((m = inner.match(/<i4>(-?\d+)<\/i4>/))) v = parseInt(m[1], 10)
  else if ((m = inner.match(/<double>(-?[\d.]+)<\/double>/))) v = parseFloat(m[1])
  else if ((m = inner.match(/<boolean>([01])<\/boolean>/))) v = m[1] === '1'
  else if ((m = inner.match(/<string>([\s\S]*?)<\/string>/))) v = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  else v = inner
  return { value: v, end }
}

// ---- Action: list-pos (récupérer les configs POS Odoo) ----
async function actionListPos() {
  const uid = await odooAuth()
  const ids = await odooExec(uid, 'pos.config', 'search', [[]])
  if (!ids || ids.length === 0) return { ok: true, configs: [] }
  const configs = await odooExec(uid, 'pos.config', 'read', [ids, ['id', 'name']])
  for (const cfg of configs) {
    await sb.from('caisse_pos_sessions_config').upsert({
      pos_config_id: cfg.id, name: cfg.name,
    }, { onConflict: 'pos_config_id' })
  }
  return { ok: true, configs }
}

// ---- Action: sync-pos (récupérer les sessions POS fermées et créer enveloppes) ----
async function actionSyncPos() {
  const uid = await odooAuth()

  const { data: cfgRows } = await sb
    .from('caisse_pos_sessions_config')
    .select('pos_config_id, name, active')
  const activeCfgIds = (cfgRows || []).filter(c => c.active).map(c => c.pos_config_id)
  const cfgNameById = Object.fromEntries((cfgRows || []).map(c => [c.pos_config_id, c.name]))
  const useFilter = activeCfgIds.length > 0

  // Filtre depuis janvier 2026 (date de mise en place de la caisse).
  // On se base sur la date d'OUVERTURE (start_at) : une caisse ouverte en 2025
  // (ex : 31/12/2025) est exclue même si elle a été clôturée en janvier 2026.
  const baseDomain = [['state', '=', 'closed'], ['start_at', '>=', '2026-01-01 00:00:00']]
  const sessionsDomain = useFilter
    ? [...baseDomain, ['config_id', 'in', activeCfgIds]]
    : baseDomain
  const sessionIds = await odooExec(uid, 'pos.session', 'search', [sessionsDomain], { limit: 2000, order: 'start_at asc' })
  if (!sessionIds || sessionIds.length === 0) {
    return { ok: true, created: 0, message: 'Aucune session fermée trouvée' }
  }

  const sessions = await odooExec(uid, 'pos.session', 'read', [sessionIds, ['id', 'name', 'state', 'start_at', 'config_id']])

  // Récupère l'ID du destinataire "Banque" pour auto-affecter les chèques
  const { data: banqueDest } = await sb
    .from('caisse_destinataires')
    .select('id, name')
    .ilike('name', '%banque%')
    .limit(1)
    .maybeSingle()
  const banqueId = banqueDest?.id || null

  let created = 0, skipped = 0
  for (const sess of sessions) {
    // On charge les enveloppes existantes pour CETTE session (cash + cheque + virements)
    const { data: existingRows } = await sb
      .from('caisse_enveloppes')
      .select('id, payment_method, odoo_payment_id')
      .eq('odoo_session_id', sess.id)
    const existingMethods = new Set((existingRows || []).map(r => r.payment_method))
    const existingPaymentIds = new Set((existingRows || []).filter(r => r.odoo_payment_id).map(r => r.odoo_payment_id))

    const paymentIds = await odooExec(uid, 'pos.payment', 'search', [[['session_id', '=', sess.id]]])
    if (!paymentIds || paymentIds.length === 0) continue

    const payments = await odooExec(uid, 'pos.payment', 'read', [paymentIds, ['amount', 'payment_method_id', 'pos_order_id']])
    let cashTotal = 0
    let chequeTotal = 0
    const virements = [] // { id, amount, orderId } — 1 enveloppe par virement client
    for (const p of payments) {
      const pmName = Array.isArray(p.payment_method_id) ? p.payment_method_id[1] : ''
      if (!pmName) continue
      const pmLower = pmName.toLowerCase()
      const cashLower = CASH_METHOD.toLowerCase()
      const chequeLower = CHEQUE_METHOD.toLowerCase()
      const virementLower = VIREMENT_METHOD.toLowerCase()
      // Match par début (3 lettres mini) — robuste aux variations Espèces/Especes/Cash/etc.
      if (pmLower.includes(cashLower.slice(0, 3))) {
        cashTotal += Number(p.amount) || 0
      } else if (pmLower.includes(chequeLower.slice(0, 3)) || pmLower.includes('check')) {
        chequeTotal += Number(p.amount) || 0
      } else if (pmLower.includes(virementLower.slice(0, 3))) {
        virements.push({ id: p.id, amount: Number(p.amount) || 0, orderId: Array.isArray(p.pos_order_id) ? p.pos_order_id[0] : null })
      }
    }

    // Nom du client (partenaire) de chaque commande virement (annulation + libellé)
    const virOrderIds = [...new Set(virements.map(v => v.orderId).filter(Boolean))]
    const nameByOrder = {}
    if (virOrderIds.length > 0) {
      const ords = await odooExec(uid, 'pos.order', 'read', [virOrderIds, ['partner_id']])
      for (const o of ords) nameByOrder[o.id] = Array.isArray(o.partner_id) ? o.partner_id[1] : null
    }

    // Annulation des virements erreur : une paire +X / -X de même montant ET
    // MÊME CLIENT (même commande) s'annule (correction caissier) -> aucune des deux.
    const virCancelled = new Set()
    {
      const byKey = {}
      for (const v of virements) {
        if (Math.abs(v.amount) < 0.005) continue
        const client = v.orderId ? nameByOrder[v.orderId] : null
        if (!client) continue // pas de client connu -> on n'annule pas
        const k = client + '|' + Math.abs(v.amount).toFixed(2)
        const slot = (byKey[k] = byKey[k] || { pos: [], neg: [] })
        slot[v.amount > 0 ? 'pos' : 'neg'].push(v)
      }
      for (const k in byKey) {
        const n = Math.min(byKey[k].pos.length, byKey[k].neg.length)
        for (let i = 0; i < n; i++) { virCancelled.add(byKey[k].pos[i].id); virCancelled.add(byKey[k].neg[i].id) }
      }
    }

    const cfgId = Array.isArray(sess.config_id) ? sess.config_id[0] : null
    const source = cfgNameById[cfgId] || (Array.isArray(sess.config_id) ? sess.config_id[1] : 'POS')
    const sessionDate = (sess.start_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10)

    // Créer l'enveloppe ESPÈCES si pas déjà créée et montant ≠ 0 (caisses négatives acceptées)
    if (cashTotal !== 0 && !existingMethods.has('cash')) {
      const { error: insErr } = await sb.from('caisse_enveloppes').insert({
        odoo_session_id: sess.id,
        source,
        session_date: sessionDate,
        amount_cash: cashTotal,
        payment_method: 'cash',
      })
      if (!insErr) created++
      else console.error('[sync-pos] cash insert:', insErr.message)
    } else if (cashTotal !== 0 && existingMethods.has('cash')) {
      skipped++
    }

    // Créer l'enveloppe CHÈQUE si pas déjà créée et montant ≠ 0 (auto-affectée à Banque)
    if (chequeTotal !== 0 && !existingMethods.has('cheque')) {
      const insertObj = {
        odoo_session_id: sess.id,
        source,
        session_date: sessionDate,
        amount_cash: chequeTotal,
        payment_method: 'cheque',
      }
      // Auto-affectation à Banque si le destinataire existe
      if (banqueId) {
        insertObj.destinataire_id = banqueId
        insertObj.assigned_at = new Date().toISOString()
      }
      const { error: insErr } = await sb.from('caisse_enveloppes').insert(insertObj)
      if (!insErr) created++
      else console.error('[sync-pos] cheque insert:', insErr.message)
    } else if (chequeTotal !== 0 && existingMethods.has('cheque')) {
      skipped++
    }

    // VIREMENTS : 1 enveloppe par paiement client (auto-affectée à Banque)
    const newVirements = virements.filter(v => v.amount !== 0 && !virCancelled.has(v.id) && !existingPaymentIds.has(v.id))
    if (newVirements.length > 0) {
      for (const v of newVirements) {
        const insertObj = {
          odoo_session_id: sess.id,
          odoo_payment_id: v.id,
          source,
          session_date: sessionDate,
          amount_cash: v.amount,
          payment_method: 'virement',
          virement_client: v.orderId ? (nameByOrder[v.orderId] || null) : null,
        }
        if (banqueId) {
          insertObj.destinataire_id = banqueId
          insertObj.assigned_at = new Date().toISOString()
        }
        const { error: insErr } = await sb.from('caisse_enveloppes').insert(insertObj)
        if (!insErr) created++
        else console.error('[sync-pos] virement insert:', insErr.message)
      }
    }
  }

  if (cfgRows && cfgRows.length > 0) {
    await sb.from('caisse_pos_sessions_config')
      .update({ last_synced_at: new Date().toISOString() }).gte('id', 0)
  }

  return { ok: true, created, skipped, totalSessions: sessions.length }
}

// ---- Handler principal ----
// Catégorise un nom de moyen de paiement Odoo en code court.
function catOfMethod(name) {
  if (/carte/i.test(name)) return 'c'           // Carte bancaire
  if (/esp/i.test(name)) return 'e'             // Espèces
  if (/customer|compte client/i.test(name)) return 'k' // Customer Account
  if (/ch[eè]/i.test(name)) return 'q'          // Chèque
  if (/vir/i.test(name)) return 'v'             // Virement bancaire
  if (/credit/i.test(name)) return 'r'          // Credit / avoir
  return 'a'
}

// ---- Action: pos-payments (lecture seule, pour le rapprochement bancaire) ----
// Renvoie les paiements POS d'une période sous forme compacte
// [montant, tMs, cat, refCommande, pointDeVente].
async function actionPosPayments(req) {
  const from = req.query?.from || req.body?.from
  const to   = req.query?.to   || req.body?.to
  if (!from || !to) throw new Error('Paramètres from et to requis (YYYY-MM-DD)')
  const uid = await odooAuth()
  const ids = await odooExec(uid, 'pos.payment', 'search',
    [[['payment_date', '>=', `${from} 00:00:00`], ['payment_date', '<=', `${to} 23:59:59`]]],
    { limit: 100000 })
  const raw = []
  for (let i = 0; i < ids.length; i += 2000) {
    const chunk = await odooExec(uid, 'pos.payment', 'read',
      [ids.slice(i, i + 2000), ['amount', 'payment_method_id', 'payment_date', 'pos_order_id']])
    raw.push(...chunk)
  }
  // Point de vente (caisse) de chaque commande → on lit le config_id des commandes.
  const orderIds = [...new Set(raw.map(p => Array.isArray(p.pos_order_id) ? p.pos_order_id[0] : null).filter(Boolean))]
  const posByOrder = {}
  for (let i = 0; i < orderIds.length; i += 2000) {
    const orders = await odooExec(uid, 'pos.order', 'read', [orderIds.slice(i, i + 2000), ['id', 'config_id']])
    for (const o of orders) posByOrder[o.id] = Array.isArray(o.config_id) ? o.config_id[1] : ''
  }
  const payments = []
  for (const p of raw) {
    const name = Array.isArray(p.payment_method_id) ? p.payment_method_id[1] : ''
    const ord = Array.isArray(p.pos_order_id) ? p.pos_order_id : null
    payments.push([
      Math.round((Number(p.amount) || 0) * 100) / 100,
      Date.parse(p.payment_date.replace(' ', 'T') + 'Z'),
      catOfMethod(name),
      ord ? ord[1] : '',                       // référence de la commande
      ord ? (posByOrder[ord[0]] || '') : '',   // point de vente (caisse)
    ])
  }
  return { payments }
}

export default async function handler(req, res) {
  try {
    const action = req.query?.action || req.body?.action || 'sync-pos'
    let result
    if (action === 'list-pos') result = await actionListPos()
    else if (action === 'sync-pos') result = await actionSyncPos()
    else if (action === 'pos-payments') result = await actionPosPayments(req)
    else return res.status(400).json({ error: 'Unknown action: ' + action })
    return res.status(200).json(result)
  } catch (e) {
    console.error('caisse-api error:', e)
    return res.status(500).json({ error: e.message || String(e) })
  }
}
