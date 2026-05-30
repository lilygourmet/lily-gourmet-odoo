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
// FUZZY MATCHING (similarité de chaînes)
// ============================================================

/**
 * Calcule un score de similarité entre 0 (différent) et 1 (identique).
 * Algorithme : Dice coefficient sur bigrammes (simple et efficace).
 */
function similarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = (s) => {
    const set = new Set()
    for (let i = 0; i < s.length - 1; i++) set.add(s.substring(i, i + 2))
    return set
  }
  const aB = bigrams(a)
  const bB = bigrams(b)
  let common = 0
  for (const bg of aB) if (bB.has(bg)) common++
  return (2 * common) / (aB.size + bB.size)
}

/**
 * Normalisation des noms (préfixe, accents, casse, espaces).
 */
function normNomCommon(s) {
  if (!s) return ''
  let n = String(s).trim()
  if (n.includes('-')) {
    const idx = n.indexOf('-')
    const prefix = n.substring(0, idx).trim()
    if (prefix.length <= 4) n = n.substring(idx + 1)
  }
  return n.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Trouve le meilleur match d'un nom Odoo dans la liste des employés.
 * Retourne null si rien de raisonnable.
 */
function findBestMatch(nomOdoo, employes, seuilFuzzy = 0.70) {
  const normOdoo = normNomCommon(nomOdoo)
  if (!normOdoo) return null

  // 1) Match exact d'abord
  for (const e of employes) {
    for (const v of [e.nom, e.nom_odoo, e.nom_odoo_match]) {
      if (v && normNomCommon(v) === normOdoo) {
        return { employe: e, score: 1.0, type: 'exact' }
      }
    }
  }

  // 2) Match fuzzy (similarité maximale)
  let best = null
  for (const e of employes) {
    for (const v of [e.nom, e.nom_odoo, e.nom_odoo_match]) {
      if (!v) continue
      const score = similarity(normOdoo, normNomCommon(v))
      if (score >= seuilFuzzy && (!best || score > best.score)) {
        best = { employe: e, score, type: 'fuzzy', via: v }
      }
    }
  }
  return best
}

// ============================================================
// Action : sync-attendance (pointages d'un mois)
// ============================================================

async function actionSyncAttendance({ mois, annee }) {
  if (!mois || !annee) throw new Error('mois et annee requis')

  const debut = `${annee}-${String(mois).padStart(2, '0')}-01 00:00:00`
  const nextMonth = mois === 12 ? 1 : mois + 1
  const nextYear  = mois === 12 ? annee + 1 : annee
  const fin = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`

  const uid = await odooAuth()

  // Récupérer TOUS les pointages du mois (pagination si > 5000)
  const attendances = await odooExec(uid, 'hr.attendance', 'search_read', [
    [['check_in', '>=', debut], ['check_in', '<', fin]],
    ['id', 'employee_id', 'check_in', 'check_out']
  ], { limit: 10000 })

  // Charger les employés en base
  const { data: employesDb, error: empErr } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)
  if (empErr) throw empErr

  // Cache : nom Odoo -> employe (pour ne pas refaire fuzzy à chaque ligne)
  const cacheMatch = new Map()
  // Stats des matchs fuzzy pour les apprendre dans nom_odoo_match
  const newMatches = new Map()  // employe_id -> nom_odoo_brut

  function matchEmploye(nomOdoo) {
    if (cacheMatch.has(nomOdoo)) return cacheMatch.get(nomOdoo)
    const result = findBestMatch(nomOdoo, employesDb, 0.70)
    cacheMatch.set(nomOdoo, result)
    if (result && result.type === 'fuzzy' && !result.employe.nom_odoo_match) {
      // Mémoriser pour update plus tard
      newMatches.set(result.employe.id, nomOdoo)
    }
    return result
  }

  const rows = []
  let unmatched = 0
  const unmatchedNames = new Set()
  const matchedFuzzy = []
  const matchedExact = []

  for (const att of attendances) {
    if (!att || !att.employee_id) continue
    const empNameOdoo = Array.isArray(att.employee_id) ? att.employee_id[1] : null
    if (!empNameOdoo) continue

    const match = matchEmploye(empNameOdoo)
    if (!match) {
      unmatched++
      unmatchedNames.add(empNameOdoo)
      continue
    }
    if (match.type === 'fuzzy') matchedFuzzy.push({ odoo: empNameOdoo, db: match.employe.nom, score: match.score })
    else matchedExact.push({ odoo: empNameOdoo, db: match.employe.nom })

    const checkIn = att.check_in
    if (!checkIn) continue
    const dateOnly = checkIn.slice(0, 10)
    rows.push({
      employe_id: match.employe.id,
      date_pointage: dateOnly,
      arrivee: checkIn,
      depart: att.check_out || null,
      source: 'odoo',
      odoo_id: att.id,
    })
  }

  // Mémoriser les matches fuzzy dans nom_odoo_match pour accélérer les prochains syncs
  for (const [empId, nomOdoo] of newMatches.entries()) {
    await sb.from('employes').update({ nom_odoo_match: nomOdoo }).eq('id', empId)
  }

  // Supprimer les pointages existants (sauf manuels)
  await sb.from('pointages')
    .delete()
    .gte('date_pointage', `${annee}-${String(mois).padStart(2, '0')}-01`)
    .lt('date_pointage',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
    .neq('source', 'manuel')

  // Insérer par batches
  let inserted = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await sb.from('pointages').insert(batch)
    if (error) console.error('insert pointages batch error:', error)
    else inserted += batch.length
  }

  // Stats de matching uniques (déduplication)
  const uniqueFuzzy = Array.from(new Map(matchedFuzzy.map(m => [m.odoo, m])).values())
  const uniqueExact = Array.from(new Map(matchedExact.map(m => [m.odoo, m])).values())

  return {
    ok: true,
    total_odoo: attendances.length,
    inserted,
    unmatched,
    unmatched_names: Array.from(unmatchedNames),
    nb_employes_matches: cacheMatch.size - unmatchedNames.size,
    matched_exact: uniqueExact,
    matched_fuzzy: uniqueFuzzy,
    new_matches_saved: newMatches.size,
    employes_db_count: employesDb.length,
    noms_db: employesDb.map(e => e.nom).sort(),
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

  const leaves = await odooExec(uid, 'hr.leave', 'search_read', [
    [
      ['state', '=', 'validate'],
      ['date_from', '<', fin],
      ['date_to', '>=', debut],
    ],
    ['id', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'name']
  ], { limit: 2000 })

  const { data: employesDb } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)

  // Supprimer les congés existants du mois
  await sb.from('conges')
    .delete()
    .or(`date_debut.lte.${fin},date_fin.gte.${debut}`)
    .not('odoo_id', 'is', null)

  const rows = []
  let unmatched = 0
  for (const lv of leaves) {
    if (!lv.employee_id) continue
    const empNameOdoo = Array.isArray(lv.employee_id) ? lv.employee_id[1] : null
    const match = findBestMatch(empNameOdoo, employesDb, 0.70)
    if (!match) { unmatched++; continue }
    const typeName = Array.isArray(lv.holiday_status_id) ? lv.holiday_status_id[1] : null
    rows.push({
      employe_id: match.employe.id,
      date_debut: (lv.date_from || '').slice(0, 10),
      date_fin: (lv.date_to || '').slice(0, 10),
      type_conge: typeName,
      odoo_id: lv.id,
      notes: lv.name,
      statut: 'valide',
      source: 'odoo',
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
// Action : sync-leaves-year — import initial Jan 1 → aujourd'hui.
// Pratique pour la transition Odoo → app : on rapatrie tous les congés
// déjà pris cette année. Les congés Odoo existants dans la fourchette
// sont remplacés (idempotent côté Odoo) ; les congés saisis dans l'app
// (odoo_id NULL) ne sont jamais touchés.
// ============================================================
async function actionSyncLeavesYear({ annee }) {
  const year = annee || new Date().getFullYear()
  const debut = `${year}-01-01`
  const today = new Date().toISOString().slice(0, 10)
  const fin   = today.slice(0, 4) === String(year) ? today : `${year}-12-31`
  // borne exclusive en interrogeant Odoo
  const finExcl = (() => { const d = new Date(fin + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()

  const uid = await odooAuth()

  const leaves = await odooExec(uid, 'hr.leave', 'search_read', [
    [
      ['state', '=', 'validate'],
      ['date_from', '<', finExcl],
      ['date_to', '>=', debut],
    ],
    ['id', 'employee_id', 'date_from', 'date_to', 'holiday_status_id', 'name']
  ], { limit: 5000 })

  const { data: employesDb } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)

  // On purge les congés Odoo existants de l'année (idempotence)
  await sb.from('conges')
    .delete()
    .gte('date_fin', debut)
    .lte('date_debut', fin)
    .not('odoo_id', 'is', null)

  const rows = []
  let unmatched = 0
  for (const lv of leaves) {
    if (!lv.employee_id) continue
    const empNameOdoo = Array.isArray(lv.employee_id) ? lv.employee_id[1] : null
    const match = findBestMatch(empNameOdoo, employesDb, 0.70)
    if (!match) { unmatched++; continue }
    const typeName = Array.isArray(lv.holiday_status_id) ? lv.holiday_status_id[1] : null
    rows.push({
      employe_id: match.employe.id,
      date_debut: (lv.date_from || '').slice(0, 10),
      date_fin:   (lv.date_to   || '').slice(0, 10),
      type_conge: typeName,
      odoo_id:    lv.id,
      notes:      lv.name,
      statut:     'valide',
      source:     'odoo',
    })
  }

  let inserted = 0
  if (rows.length > 0) {
    const { error } = await sb.from('conges').insert(rows)
    if (!error) inserted = rows.length
  }

  return { ok: true, year, total_odoo: leaves.length, inserted, unmatched, range: [debut, fin] }
}

// ============================================================
// Action : list-allocations — allocations de congés Odoo pour une année.
// Renvoie l'allocation totale (number_of_days) par employé matché côté app
// + le détail des allocations Odoo. Permet de voir à quoi chaque employé
// a eu droit cette année dans Odoo (avant qu'on bascule sur les calculs app).
// ============================================================
async function actionListAllocations({ annee } = {}) {
  const year = annee || new Date().getFullYear()
  const debut = `${year}-01-01`
  const fin   = `${year}-12-31`
  const uid = await odooAuth()

  // États « validate » uniquement (allocations effectivement accordées).
  // Filtre sur date_from / date_to si présent, sinon on prend l'allocation
  // qui chevauche l'année.
  const allocs = await odooExec(uid, 'hr.leave.allocation', 'search_read', [
    [['state', '=', 'validate']],
    ['id', 'employee_id', 'holiday_status_id', 'number_of_days', 'date_from', 'date_to', 'state', 'name'],
  ], { limit: 5000 })

  // Filtre côté serveur léger : on garde celles dont la période chevauche l'année.
  // date_from est parfois NULL : on garde par défaut.
  const inYear = allocs.filter(a => {
    const df = a.date_from ? a.date_from.slice(0, 10) : null
    const dt = a.date_to   ? a.date_to.slice(0, 10)   : null
    if (df && df > fin)   return false
    if (dt && dt < debut) return false
    return true
  })

  const { data: employesDb } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)

  // Agrégat par employé (matché)
  const byEmp = new Map()
  let unmatched = 0
  const details = []
  for (const a of inYear) {
    if (!a.employee_id) continue
    const empNameOdoo = Array.isArray(a.employee_id) ? a.employee_id[1] : null
    const match = findBestMatch(empNameOdoo, employesDb, 0.70)
    const typeName = Array.isArray(a.holiday_status_id) ? a.holiday_status_id[1] : null
    const row = {
      odoo_alloc_id: a.id,
      odoo_employee: empNameOdoo,
      match_employe_id: match ? match.employe.id : null,
      match_employe_nom: match ? match.employe.nom : null,
      type: typeName,
      jours: Number(a.number_of_days || 0),
      date_from: a.date_from ? a.date_from.slice(0, 10) : null,
      date_to:   a.date_to   ? a.date_to.slice(0, 10)   : null,
      name: a.name || null,
    }
    details.push(row)
    if (!match) { unmatched++; continue }
    const empId = match.employe.id
    if (!byEmp.has(empId)) byEmp.set(empId, { employe_id: empId, nom: match.employe.nom, total_jours: 0, lignes: [] })
    const agg = byEmp.get(empId)
    agg.total_jours += Number(a.number_of_days || 0)
    agg.lignes.push(row)
  }

  return {
    ok: true,
    year,
    total_odoo: inYear.length,
    unmatched,
    par_employe: Array.from(byEmp.values()).sort((a, b) => a.nom.localeCompare(b.nom)),
    details,
  }
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

async function actionDebugAttendance({ mois, annee }) {
  const uid = await odooAuth()
  const debug = { uid_odoo: uid, tests: [] }

  // TEST 1 : count total hr.attendance sans filtre
  try {
    const count_total = await odooExec(uid, 'hr.attendance', 'search_count', [[]], {})
    debug.tests.push({ test: 'search_count hr.attendance (total)', result: count_total })
  } catch (e) {
    debug.tests.push({ test: 'search_count hr.attendance (total)', error: e.message })
  }

  // TEST 2 : récupérer les 5 derniers pointages sans filtre date
  try {
    const last5 = await odooExec(uid, 'hr.attendance', 'search_read',
      [[]], { limit: 5, order: 'check_in desc', fields: ['id', 'employee_id', 'check_in', 'check_out'] }
    )
    debug.tests.push({ test: 'derniers 5 pointages (sans filtre)', result: last5 })
  } catch (e) {
    debug.tests.push({ test: 'derniers 5 pointages (sans filtre)', error: e.message })
  }

  // TEST 3 : count attendance pour le mois demandé
  if (mois && annee) {
    const debut = `${annee}-${String(mois).padStart(2, '0')}-01 00:00:00`
    const nextMonth = mois === 12 ? 1 : mois + 1
    const nextYear  = mois === 12 ? annee + 1 : annee
    const fin = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`
    try {
      const count_mois = await odooExec(uid, 'hr.attendance', 'search_count',
        [[['check_in', '>=', debut], ['check_in', '<', fin]]], {}
      )
      debug.tests.push({ test: `count pour ${mois}/${annee}`, periode: { debut, fin }, result: count_mois })
    } catch (e) {
      debug.tests.push({ test: `count pour ${mois}/${annee}`, error: e.message })
    }
  }

  // TEST 4 : list employees count
  try {
    const count_emp = await odooExec(uid, 'hr.employee', 'search_count', [[]], {})
    debug.tests.push({ test: 'count hr.employee', result: count_emp })
  } catch (e) {
    debug.tests.push({ test: 'count hr.employee', error: e.message })
  }

  // TEST 5 : list 5 employees
  try {
    const emps = await odooExec(uid, 'hr.employee', 'search_read',
      [[['active', '=', true]]], { limit: 5, fields: ['id', 'name'] }
    )
    debug.tests.push({ test: 'liste 5 employés', result: emps })
  } catch (e) {
    debug.tests.push({ test: 'liste 5 employés', error: e.message })
  }

  return debug
}

export default async function handler(req, res) {
  try {
    const action = req.query?.action || req.body?.action
    const params = req.body || req.query || {}

    let result
    if (action === 'sync-attendance')         result = await actionSyncAttendance(params)
    else if (action === 'sync-leaves')        result = await actionSyncLeaves(params)
    else if (action === 'sync-leaves-year')   result = await actionSyncLeavesYear(params)
    else if (action === 'list-allocations')   result = await actionListAllocations(params)
    else if (action === 'list-employees')     result = await actionListEmployees()
    else if (action === 'debug-attendance')   result = await actionDebugAttendance(params)
    else return res.status(400).json({ error: 'Unknown action: ' + action })

    return res.status(200).json(result)
  } catch (e) {
    console.error('pointage-api error:', e)
    return res.status(500).json({
      error: e.message || String(e),
      stack: e.stack ? e.stack.slice(0, 500) : undefined,
    })
  }
}
