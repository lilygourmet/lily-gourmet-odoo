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

  // Supprimer UNIQUEMENT les pointages venant d'Odoo (on préserve 'manuel' ET
  // 'pointeuse' : la nouvelle pointeuse écrit dans l'app, pas dans Odoo).
  await sb.from('pointages')
    .delete()
    .gte('date_pointage', `${annee}-${String(mois).padStart(2, '0')}-01`)
    .lt('date_pointage',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
    .eq('source', 'odoo')

  // Ne pas ré-importer les pointages Odoo déjà « adoptés » par la pointeuse
  // (une entrée badgeuse fermée par la pointeuse → source 'pointeuse', odoo_id gardé).
  const { data: adopted } = await sb.from('pointages')
    .select('odoo_id')
    .gte('date_pointage', `${annee}-${String(mois).padStart(2, '0')}-01`)
    .lt('date_pointage',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
    .neq('source', 'odoo').not('odoo_id', 'is', null)
  const adoptedIds = new Set((adopted || []).map(a => a.odoo_id))
  const rowsToInsert = rows.filter(r => !adoptedIds.has(r.odoo_id))

  // Insérer par batches
  let inserted = 0
  for (let i = 0; i < rowsToInsert.length; i += 100) {
    const batch = rowsToInsert.slice(i, i + 100)
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

  // Supprimer les congés existants du mois (chevauchement réel : début < fin ET fin >= début)
  await sb.from('conges')
    .delete()
    .lt('date_debut', fin)
    .gte('date_fin', debut)
    .not('odoo_id', 'is', null)

  // Anti-doublon : ne pas réinsérer un congé déjà présent (ex. congé verrouillé, odoo_id vidé)
  const { data: dejaLa } = await sb.from('conges')
    .select('employe_id, date_debut, date_fin')
    .lt('date_debut', fin)
    .gte('date_fin', debut)
  const clesExistantes = new Set((dejaLa || []).map(c => `${c.employe_id}|${c.date_debut}|${c.date_fin}`))

  const rows = []
  let unmatched = 0
  for (const lv of leaves) {
    if (!lv.employee_id) continue
    const empNameOdoo = Array.isArray(lv.employee_id) ? lv.employee_id[1] : null
    const match = findBestMatch(empNameOdoo, employesDb, 0.70)
    if (!match) { unmatched++; continue }
    const dd = (lv.date_from || '').slice(0, 10)
    const df = (lv.date_to || '').slice(0, 10)
    if (clesExistantes.has(`${match.employe.id}|${dd}|${df}`)) continue
    const typeName = Array.isArray(lv.holiday_status_id) ? lv.holiday_status_id[1] : null
    rows.push({
      employe_id: match.employe.id,
      date_debut: dd,
      date_fin: df,
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

  // Anti-doublon : ne pas réinsérer un congé déjà présent (ex. congé verrouillé, odoo_id vidé)
  const { data: dejaLa } = await sb.from('conges')
    .select('employe_id, date_debut, date_fin')
    .gte('date_fin', debut)
    .lte('date_debut', fin)
  const clesExistantes = new Set((dejaLa || []).map(c => `${c.employe_id}|${c.date_debut}|${c.date_fin}`))

  const rows = []
  let unmatched = 0
  for (const lv of leaves) {
    if (!lv.employee_id) continue
    const empNameOdoo = Array.isArray(lv.employee_id) ? lv.employee_id[1] : null
    const match = findBestMatch(empNameOdoo, employesDb, 0.70)
    if (!match) { unmatched++; continue }
    const dd = (lv.date_from || '').slice(0, 10)
    const df = (lv.date_to   || '').slice(0, 10)
    if (clesExistantes.has(`${match.employe.id}|${dd}|${df}`)) continue
    const typeName = Array.isArray(lv.holiday_status_id) ? lv.holiday_status_id[1] : null
    rows.push({
      employe_id: match.employe.id,
      date_debut: dd,
      date_fin:   df,
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
// Action : import-allocations — copie les allocations Odoo de l'année
// dans la table conges_allocations (source='odoo'). Idempotent : on
// remplace systématiquement les lignes 'odoo' de l'année ; les lignes
// 'manuel' et 'auto' ne sont jamais touchées.
// ============================================================
function mapOdooAllocType(odooTypeName) {
  if (!odooTypeName) return 'autre'
  const t = String(odooTypeName).toLowerCase()
  if (t.includes('annuel') || t.includes('payé') || t.includes('paid'))    return 'annuel'
  if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) return 'maladie_courte'
  if (t.includes('mariage') || t.includes('marriage'))                     return 'mariage'
  if (t.includes('naissance') || t.includes('birth'))                      return 'naissance'
  if (t.includes('décès') || t.includes('deces') || t.includes('death'))   return 'deces'
  if (t.includes('circoncis'))                                             return 'circoncision'
  if (t.includes('reliquat') || t.includes('report'))                       return 'reliquat'
  return 'autre'
}

async function actionImportAllocations({ annee } = {}) {
  const year = annee || new Date().getFullYear()
  const debut = `${year}-01-01`
  const fin   = `${year}-12-31`
  const uid = await odooAuth()

  const allocs = await odooExec(uid, 'hr.leave.allocation', 'search_read', [
    [['state', '=', 'validate']],
    ['id', 'employee_id', 'holiday_status_id', 'number_of_days', 'date_from', 'date_to', 'state', 'name'],
  ], { limit: 5000 })

  // Garde celles qui chevauchent l'année
  const inYear = allocs.filter(a => {
    const df = a.date_from ? a.date_from.slice(0, 10) : null
    const dt = a.date_to   ? a.date_to.slice(0, 10)   : null
    if (df && df > fin)   return false
    if (dt && dt < debut) return false
    return true
  })

  const { data: employesDb } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)

  // Purge les allocations odoo de l'année (idempotence)
  await sb.from('conges_allocations')
    .delete()
    .eq('annee', year)
    .eq('source', 'odoo')

  let unmatched = 0
  let inserted = 0
  const rows = []
  for (const a of inYear) {
    if (!a.employee_id) continue
    const empNameOdoo = Array.isArray(a.employee_id) ? a.employee_id[1] : null
    const match = findBestMatch(empNameOdoo, employesDb, 0.70)
    if (!match) { unmatched++; continue }
    const typeOdoo = Array.isArray(a.holiday_status_id) ? a.holiday_status_id[1] : null
    rows.push({
      employe_id: match.employe.id,
      annee:      year,
      type:       mapOdooAllocType(typeOdoo),
      jours:      Number(a.number_of_days || 0),
      source:     'odoo',
      raison:     a.name || typeOdoo || null,
      date_evt:   a.date_from ? a.date_from.slice(0, 10) : null,
      statut:     'valide',
    })
  }
  if (rows.length > 0) {
    const { error } = await sb.from('conges_allocations').insert(rows)
    if (!error) inserted = rows.length
    else console.warn('[import-allocations] insert error:', error.message)
  }

  return { ok: true, year, total_odoo: inYear.length, inserted, unmatched }
}

// ============================================================
// Action : list-employees (récupérer tous les employés Odoo)
// ============================================================

// Importe les photos des employés depuis Odoo (hr.employee.image_256) → bucket
// public 'photos-employes' + employes.photo_url. Match par nom (comme la synchro).
async function actionImportPhotosOdoo() {
  const uid = await odooAuth()
  const emps = await odooExec(uid, 'hr.employee', 'search_read',
    [[['active', '=', true]], ['id', 'name', 'image_256']], { limit: 1000 })
  const { data: employesDb } = await sb
    .from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)

  let updated = 0, unmatched = 0, sansImage = 0
  const noms = []
  const unmatchedNoms = []
  for (const e of emps || []) {
    const img = e.image_256
    if (!img || typeof img !== 'string') { sansImage++; continue }
    const match = findBestMatch(e.name, employesDb, 0.70)
    if (!match) { unmatched++; unmatchedNoms.push(e.name); continue }
    try {
      const buf = Buffer.from(img, 'base64')
      const path = `${match.employe.id}/odoo.png`
      const up = await sb.storage.from('photos-employes').upload(path, buf, { contentType: 'image/png', upsert: true })
      if (up.error) throw up.error
      const { data: pub } = sb.storage.from('photos-employes').getPublicUrl(path)
      await sb.from('employes').update({ photo_url: pub.publicUrl }).eq('id', match.employe.id)
      updated++; noms.push(match.employe.nom)
    } catch (err) { console.error('[photo odoo]', e.name, err.message) }
  }
  return {
    ok: true, total_odoo: emps?.length || 0, updated, unmatched, sans_image: sansImage,
    noms: noms.slice(0, 80),
    unmatched_noms: unmatchedNoms,
    db_noms: (employesDb || []).map(e => e.nom).sort(),
  }
}

async function actionListEmployees() {
  const uid = await odooAuth()
  const employees = await odooExec(uid, 'hr.employee', 'search_read', [
    [['active', '=', true]],
    ['id', 'name', 'work_email', 'job_title']
  ], { limit: 500 })
  return { ok: true, employees }
}

// ============================================================
// Action : audit-maladie-courte — vérifie que chaque employé actif a une
// allocation 'maladie_courte' (6 j) pour l'année. Avec fix=1 : crée les
// manquantes (source 'auto'). Lecture seule sans fix.
// ============================================================
async function actionAuditMaladieCourte({ annee, fix, only } = {}) {
  const year = Number(annee) || new Date().getFullYear()
  const { data: emps, error: e1 } = await sb
    .from('employes').select('id, nom, date_entree').eq('actif', true)
  if (e1) throw e1
  const { data: allocs, error: e2 } = await sb
    .from('conges_allocations').select('employe_id, jours, statut')
    .eq('annee', year).eq('type', 'maladie_courte')
  if (e2) throw e2
  const have = new Map()
  for (const a of allocs || []) {
    if (a.statut === 'annule') continue
    have.set(a.employe_id, (have.get(a.employe_id) || 0) + Number(a.jours || 0))
  }
  const sans = (emps || []).filter(e => !((have.get(e.id) || 0) > 0))
  // only = liste de noms (séparés par virgule) → on ne corrige QUE ceux-là.
  let toGrant = sans
  if (only) {
    const set = new Set(String(only).split(',').map(s => s.trim().toLowerCase()))
    toGrant = sans.filter(s => set.has((s.nom || '').trim().toLowerCase()))
  }
  let granted = 0
  if (fix && toGrant.length) {
    const rows = toGrant.map(s => ({ employe_id: s.id, annee: year, type: 'maladie_courte', jours: 6, source: 'auto', statut: 'valide' }))
    const { error: e3 } = await sb.from('conges_allocations').insert(rows)
    if (e3) throw e3
    granted = rows.length
  }
  return {
    ok: true, year,
    total_actifs: emps?.length || 0,
    avec: (emps?.length || 0) - sans.length,
    sans_count: sans.length,
    sans_noms: sans.map(s => s.nom).sort(),
    granted,
    granted_noms: toGrant.map(s => s.nom).sort(),
  }
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

// ============================================================
// RÉCEPTEUR POINTEUSE ZKTeco (protocole PUSH / ADMS)
// L'appareil (ex. SenseFace 2A) pousse ici via /iclock/* (routé par vercel.json).
// v1 : on JOURNALISE tout (pour observer le format réel) et on répond aux
// handshakes. L'écriture Odoo hr.attendance viendra en v2, une fois le format vu.
// ============================================================
// Parse le corps d'un POST rtlog : lignes de paires clé=valeur séparées par TAB.
// Ex. "time=2026-07-30 14:23:05\tpin=3\tcardno=0\teventaddr=1\tevent=3"
function parseRtlog(body) {
  const out = []
  for (const line of String(body || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    const kv = {}
    for (const part of t.split('\t')) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      kv[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim()
    }
    if (kv.pin && kv.time) out.push({ pin: kv.pin, time: kv.time })
  }
  return out
}

// Heure Maroc (UTC+1) → heure UTC pour Odoo (hr.attendance stocke en UTC).
// ⚠️ Suppose UTC+1 toute l'année. Pendant le Ramadan le Maroc passe à UTC+0 :
// les pointages de cette période seraient décalés de 1 h → à ajuster ce mois-là.
function localMarocToUtc(s) {
  const d = new Date(String(s).replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return s
  d.setUTCHours(d.getUTCHours() - 1)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// Écrit un pointage dans Odoo par BASCULE : s'il y a une entrée ouverte (sans
// sortie) → ce pointage la ferme (sortie) ; sinon → il ouvre une entrée.
// Gère la course « déjà entré » (pointages rapprochés) : si Odoo refuse la
// création car une entrée existe déjà, on la ferme au lieu de planter.
// Odoo échoue parfois à SÉRIALISER sa réponse XML-RPC (None/allow_none) alors que
// l'opération (create/write) a bien eu lieu → on tolère ce cas précis.
function isSerQuirk(e) { return /allow_none|dumps/i.test(String(e && e.message)) }

async function odooWriteCheckout(uid, id, utc) {
  try { await odooExec(uid, 'hr.attendance', 'write', [[id], { check_out: utc }]) }
  catch (e) { if (!isSerQuirk(e)) throw e }   // sérialisation ratée = l'écriture a eu lieu
}

async function odooToggleAttendance(uid, empId, utc) {
  const findOpen = () => odooExec(uid, 'hr.attendance', 'search_read',
    [[['employee_id', '=', empId], ['check_out', '=', false]], ['id', 'check_in']],
    { limit: 1, order: 'check_in desc' })

  let open = await findOpen()
  if (open && open.length) {
    if (utc > open[0].check_in) {
      await odooWriteCheckout(uid, open[0].id, utc)
      return { odooId: open[0].id, action: 'out' }
    }
    return { odooId: open[0].id, action: 'skip' }   // pointage <= entrée ouverte : doublon
  }
  try {
    const id = await odooExec(uid, 'hr.attendance', 'create', [{ employee_id: empId, check_in: utc }])
    return { odooId: id, action: 'in' }
  } catch (e) {
    if (isSerQuirk(e)) {
      // création probablement faite mais réponse ratée → on retrouve l'id de l'entrée ouverte
      const found = await findOpen()
      return { odooId: found?.[0]?.id || null, action: 'in' }
    }
    if (/already checked in/i.test(String(e.message))) {
      open = await findOpen()   // une entrée a été ouverte entre-temps → on la ferme
      if (open && open.length && utc > open[0].check_in) {
        await odooWriteCheckout(uid, open[0].id, utc)
        return { odooId: open[0].id, action: 'out' }
      }
      return { odooId: open?.[0]?.id || null, action: 'skip' }
    }
    throw e
  }
}

// Écrit les pointages en attente dans Odoo hr.attendance (entrée/sortie par bascule).
// N'AJOUTE que des pointages « pointeuse » : ne touche jamais à l'import de l'ancien
// système. Idempotent : chaque punch stocké n'est traité qu'une fois (status→done).
// statuses = quels punchs (re)traiter. Temps réel = ['pending'] ; relance manuelle
// (après avoir rempli la correspondance) = ['pending','unmapped','error'].
// Écrit les pointages dans l'APP (table `pointages`, source 'pointeuse') — PAS
// dans Odoo. Aucune interférence avec la badgeuse existante (qui, elle, remplit
// Odoo). Bascule entrée/sortie sur nos propres sessions, anti-doublon inclus.
async function pushPunchesToPointages({ statuses = ['pending'] } = {}) {
  const { data: pend } = await sb.from('pointeuse_punches')
    .select('*').in('status', statuses).order('punch_local', { ascending: true }).limit(500)
  if (!pend || !pend.length) return { processed: 0, done: 0, unmapped: 0, dups: 0, errors: 0 }

  const { data: mapRows } = await sb.from('pointeuse_users').select('sn, pin, employe_odoo_id, employe_nom')
  const map = new Map((mapRows || []).map(m => [`${m.sn}|${m.pin}`, m]))

  // Résolution nom (Odoo) → employé de l'app (même logique que la synchro Odoo).
  const { data: employesDb } = await sb.from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)
  const empCache = new Map()
  const resolveEmp = (nom) => {
    if (empCache.has(nom)) return empCache.get(nom)
    const m = findBestMatch(nom, employesDb, 0.70)
    const id = m ? m.employe.id : null
    empCache.set(nom, id); return id
  }

  const batchLast = new Map()
  let done = 0, unmapped = 0, dups = 0, errors = 0
  for (const p of pend) {
    // Verrou atomique : un seul traitement prend ce pointage.
    const { data: claimed } = await sb.from('pointeuse_punches')
      .update({ status: 'processing' }).eq('id', p.id).eq('status', p.status).select('id')
    if (!claimed || !claimed.length) continue

    const m = map.get(`${p.sn}|${p.pin}`)
    const empId = m ? resolveEmp(m.employe_nom) : null
    if (!empId) {
      await sb.from('pointeuse_punches').update({ status: 'unmapped' }).eq('id', p.id)
      unmapped++; continue
    }

    // Anti-doublon : ignorer un pointage trop proche du dernier ACCEPTÉ de ce numéro.
    const key = `${p.sn}|${p.pin}`
    let last = batchLast.get(key)
    if (last === undefined) {
      const { data: prev } = await sb.from('pointeuse_punches')
        .select('punch_local').eq('sn', p.sn).eq('pin', p.pin)
        .in('odoo_action', ['in', 'out']).lt('punch_local', p.punch_local)
        .order('punch_local', { ascending: false }).limit(1)
      last = prev?.[0]?.punch_local || null
    }
    if (last && secondsBetween(last, p.punch_local) < DEDUP_SECONDS) {
      await sb.from('pointeuse_punches').update({
        status: 'dup', odoo_action: 'dup', employe_odoo_id: m.employe_odoo_id, processed_at: new Date().toISOString(), err: null,
      }).eq('id', p.id)
      dups++; continue
    }

    try {
      const utc = localMarocToUtc(p.punch_local)
      // Bascule sur la dernière session OUVERTE de l'employé, PEU IMPORTE la source
      // (badgeuse/odoo OU pointeuse) → timeline unifié : entrée badgeuse le matin +
      // sortie pointeuse le soir se rejoignent.
      const { data: openS } = await sb.from('pointages')
        .select('id, arrivee, source').eq('employe_id', empId).is('depart', null)
        .order('arrivee', { ascending: false }).limit(1)
      let action
      // Comparer de VRAIS instants (arrivee revient en ISO tz depuis la base ;
      // utc est "YYYY-MM-DD HH:MM:SS" en UTC → on ajoute 'Z').
      const utcMs = new Date(utc.replace(' ', 'T') + 'Z').getTime()
      if (openS && openS.length && utcMs > new Date(openS[0].arrivee).getTime()) {
        const upd = { depart: utc }
        // Si on ferme une entrée venant d'Odoo, on l'« adopte » (source pointeuse)
        // pour qu'elle survive à la synchro Odoo (qui ne touche que source='odoo').
        if (openS[0].source === 'odoo') upd.source = 'pointeuse'
        await sb.from('pointages').update(upd).eq('id', openS[0].id)
        action = 'out'
      } else {
        await sb.from('pointages').insert({
          employe_id: empId, date_pointage: utc.slice(0, 10), arrivee: utc, depart: null, source: 'pointeuse',
        })
        action = 'in'
      }
      await sb.from('pointeuse_punches').update({
        status: 'done', odoo_action: action, employe_odoo_id: m.employe_odoo_id,
        processed_at: new Date().toISOString(), err: null,
      }).eq('id', p.id)
      if (action === 'in' || action === 'out') batchLast.set(key, p.punch_local)
      done++
    } catch (e) {
      await sb.from('pointeuse_punches').update({
        status: 'error', err: String(e.message || e).slice(0, 300),
      }).eq('id', p.id)
      errors++
    }
  }
  return { processed: pend.length, done, unmapped, dups, errors }
}

// Écart en secondes entre deux heures "YYYY-MM-DD HH:MM:SS".
function secondsBetween(a, b) {
  return Math.abs(new Date(String(b).replace(' ', 'T')) - new Date(String(a).replace(' ', 'T'))) / 1000
}

// Deux pointages du même numéro à moins de DEDUP_SECONDS = double-clic → on ignore.
const DEDUP_SECONDS = 120

async function pushPunchesToOdoo({ statuses = ['pending'] } = {}) {
  const { data: pend } = await sb.from('pointeuse_punches')
    .select('*').in('status', statuses).order('punch_local', { ascending: true }).limit(300)
  if (!pend || !pend.length) return { processed: 0, done: 0, unmapped: 0, dups: 0, errors: 0 }

  const { data: mapRows } = await sb.from('pointeuse_users').select('sn, pin, employe_odoo_id')
  // Correspondance PAR MACHINE : clé = "sn|pin" (le même numéro sur 2 machines = 2 personnes).
  const map = new Map((mapRows || []).map(m => [`${m.sn}|${m.pin}`, m.employe_odoo_id]))

  const batchLast = new Map()   // sn|pin -> heure du dernier pointage ACCEPTÉ (ancre anti-doublon)
  let uid = null
  let done = 0, unmapped = 0, dups = 0, errors = 0
  for (const p of pend) {
    // Verrou atomique : un seul traitement prend ce pointage (évite les courses
    // entre l'envoi temps réel des machines et une relance manuelle).
    const { data: claimed } = await sb.from('pointeuse_punches')
      .update({ status: 'processing' }).eq('id', p.id).eq('status', p.status).select('id')
    if (!claimed || !claimed.length) continue

    const empId = map.get(`${p.sn}|${p.pin}`)
    if (!empId) {
      await sb.from('pointeuse_punches').update({ status: 'unmapped' }).eq('id', p.id)
      unmapped++; continue
    }

    // Anti-doublon : ignorer un pointage trop proche du dernier ACCEPTÉ de ce numéro.
    const key = `${p.sn}|${p.pin}`
    let last = batchLast.get(key)
    if (last === undefined) {
      const { data: prev } = await sb.from('pointeuse_punches')
        .select('punch_local').eq('sn', p.sn).eq('pin', p.pin)
        .in('odoo_action', ['in', 'out']).lt('punch_local', p.punch_local)
        .order('punch_local', { ascending: false }).limit(1)
      last = prev?.[0]?.punch_local || null
    }
    if (last && secondsBetween(last, p.punch_local) < DEDUP_SECONDS) {
      await sb.from('pointeuse_punches').update({
        status: 'dup', odoo_action: 'dup', employe_odoo_id: empId, processed_at: new Date().toISOString(), err: null,
      }).eq('id', p.id)
      dups++; continue   // on NE met PAS à jour l'ancre (= dernier accepté)
    }

    try {
      if (!uid) uid = await odooAuth()
      const utc = localMarocToUtc(p.punch_local)
      const { odooId, action } = await odooToggleAttendance(uid, empId, utc)
      await sb.from('pointeuse_punches').update({
        status: 'done', odoo_attendance_id: odooId, odoo_action: action,
        employe_odoo_id: empId, processed_at: new Date().toISOString(), err: null,
      }).eq('id', p.id)
      if (action === 'in' || action === 'out') batchLast.set(key, p.punch_local)
      done++
    } catch (e) {
      await sb.from('pointeuse_punches').update({
        status: 'error', err: String(e.message || e).slice(0, 300),
      }).eq('id', p.id)
      errors++
    }
  }
  return { processed: pend.length, done, unmapped, dups, errors }
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
    try { return JSON.stringify(req.body) } catch { return '' }
  }
  return await new Promise(resolve => {
    let data = ''; let done = false
    const finish = () => { if (!done) { done = true; resolve(data) } }
    req.on('data', c => { data += c })
    req.on('end', finish); req.on('error', finish)
    setTimeout(finish, 1000)
  })
}

async function handleIclock(req, res) {
  const seg = String(req.query?.iclock || '').split('/')[0].toLowerCase()
  const sn = req.query?.SN || req.query?.sn || ''
  const method = req.method || 'GET'
  let body = ''
  if (method === 'POST' || method === 'PUT') body = await readRawBody(req)

  // On NE journalise QUE les événements utiles (connexion + vrais pointages rtlog).
  // On ignore le bruit : poll /getrequest toutes les 3s, /ping, et l'état rtstate.
  const table = req.query?.table || ''
  const noise = seg === 'getrequest' || seg === 'ping' || table === 'rtstate'
  if (!noise) {
    try {
      await sb.from('zk_events').insert({
        sn, method, path: String(req.query?.iclock || ''),
        query: req.query || {},
        body: body ? body.slice(0, 20000) : null,
      })
    } catch (e) { console.error('[iclock] log:', e.message) }
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  // VRAIS POINTAGES (temps réel) : POST /iclock/cdata?table=rtlog.
  // On les stocke (durable, anti-doublon) puis on les pousse dans Odoo. L'envoi
  // Odoo est protégé (try/catch) : il ne bloque JAMAIS la réponse à la pointeuse.
  if (table === 'rtlog' && method === 'POST') {
    const punches = parseRtlog(body)
    if (punches.length) {
      const rows = punches.map(p => ({ sn, pin: p.pin, punch_local: p.time, status: 'pending' }))
      try {
        await sb.from('pointeuse_punches').upsert(rows, { onConflict: 'sn,pin,punch_local', ignoreDuplicates: true })
        await pushPunchesToPointages({ statuses: ['pending'] })
      } catch (e) { console.error('[iclock] rtlog:', e.message) }
    }
    return res.status(200).send('OK')
  }

  // /registry → RegistryCode NUMÉRIQUE (MMddHHmmss), comme les serveurs qui marchent.
  if (seg === 'registry') {
    const d = new Date(), p = n => String(n).padStart(2, '0')
    const code = p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    return res.status(200).send('RegistryCode=' + code + '\n')
  }
  // Config version SÉCURISÉE (pushver présent) ou /push : EXACTEMENT les champs
  // d'une implémentation Security PUSH qui fonctionne (AdvacSys), rien de plus.
  if (seg === 'push' || (seg === 'cdata' && method === 'GET' && req.query.pushver)) {
    const cfg = [
      'ServerVersion=3.0.1',
      'ServerName=ADMS',
      'PushVersion=3.0.1',
      'ErrorDelay=10',
      'RequestDelay=3',
      'TransInterval=1',
      'TransTables=User Transaction Facev7 templatev10',
      'TimeZone=1',
      'RealTime=1',
      'TimeoutSec=10',
    ].join('\r\n') + '\r\n'
    return res.status(200).send(cfg)
  }
  // Config version CLASSIQUE (cdata GET sans pushver).
  if (seg === 'cdata' && method === 'GET') {
    const opt = [
      `GET OPTION FROM: ${sn}`,
      'Stamp=0', 'OpStamp=0', 'ErrorDelay=30', 'Delay=10',
      'TransTimes=00:00;23:59', 'TransInterval=1', 'TransFlag=1111111111',
      'Realtime=1', 'Encrypt=0',
    ].join('\r\n') + '\r\n'
    return res.status(200).send(opt)
  }
  // Reste (querydata = données, getrequest, ping, devicecmd, cdata POST…) → OK
  return res.status(200).send('OK')
}

// État des pointages pointeuse (debug, protégé par clé). À retirer plus tard.
async function actionPointeuseStatus(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  const { data } = await sb.from('pointeuse_punches')
    .select('*').order('created_at', { ascending: false }).limit(Number(params.limit) || 60)
  const counts = {}
  for (const p of data || []) counts[p.status] = (counts[p.status] || 0) + 1
  const erreurs = (data || []).filter(p => p.status === 'error')
    .map(p => ({ pin: p.pin, t: p.punch_local, emp: p.employe_odoo_id, err: p.err }))
  return {
    counts,
    erreurs: erreurs.slice(0, 15),
    derniers: (data || []).slice(0, 20).map(p => ({ pin: p.pin, t: p.punch_local, status: p.status, action: p.odoo_action })),
  }
}

// Efface tous les pointages de test (clé requise). Reset avant la vraie mise en service.
// Avec odoo=1 : supprime aussi les hr.attendance de test créés dans Odoo.
async function actionPointeuseClear(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  let odooDeleted = 0
  if (params.odoo === '1' || params.odoo === 1) {
    const { data: done } = await sb.from('pointeuse_punches')
      .select('odoo_attendance_id').eq('status', 'done').not('odoo_attendance_id', 'is', null)
    const ids = [...new Set((done || []).map(d => d.odoo_attendance_id))]
    if (ids.length) {
      const uid = await odooAuth()
      try { await odooExec(uid, 'hr.attendance', 'unlink', [ids]); odooDeleted = ids.length }
      catch (e) {
        // Odoo échoue parfois à SÉRIALISER sa réponse (None/allow_none) alors que
        // la suppression a bien eu lieu. On tolère ce cas précis.
        if (/allow_none|dumps/i.test(String(e.message))) odooDeleted = ids.length
        else return { error: 'odoo unlink: ' + String(e.message).slice(0, 200) }
      }
    }
  }
  const { error } = await sb.from('pointeuse_punches').delete().neq('id', 0)
  return error ? { error: error.message } : { ok: true, cleared: true, odooDeleted }
}

// Reconstruction propre : supprime dans Odoo les pointages déjà créés par la
// pointeuse (ids connus + entrées ouvertes orphelines des employés reliés), puis
// remet TOUS les pointages reçus en file d'attente pour un ré-envoi propre (avec
// l'anti-doublon). Ne touche qu'aux employés reliés à la pointeuse. Clé requise.
async function actionPointeuseReprocess(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  const uid = await odooAuth()
  const rmOne = async (id) => {
    try { await odooExec(uid, 'hr.attendance', 'unlink', [[id]]); return true }
    catch (e) { return /allow_none|dumps|does not exist/i.test(String(e.message)) }
  }

  // 1) Supprimer les hr.attendance créés par la pointeuse (ids enregistrés)
  const { data: tracked } = await sb.from('pointeuse_punches')
    .select('odoo_attendance_id').not('odoo_attendance_id', 'is', null)
  const ids = [...new Set((tracked || []).map(d => d.odoo_attendance_id))]
  let deleted = 0
  for (const id of ids) { if (await rmOne(id)) deleted++ }

  // 2) Supprimer les entrées OUVERTES orphelines (serQuirk) des employés reliés
  const { data: mrows } = await sb.from('pointeuse_users').select('employe_odoo_id')
  const emps = [...new Set((mrows || []).map(m => m.employe_odoo_id))]
  let orphans = 0
  if (emps.length) {
    const open = await odooExec(uid, 'hr.attendance', 'search',
      [[['employee_id', 'in', emps], ['check_out', '=', false]]], {})
    for (const id of (Array.isArray(open) ? open : [])) { if (await rmOne(id)) orphans++ }
  }

  // 3) Remettre tous les pointages reçus en attente (les lignes brutes restent)
  await sb.from('pointeuse_punches').update({
    status: 'pending', odoo_attendance_id: null, odoo_action: null,
    employe_odoo_id: null, err: null, processed_at: null,
  }).neq('id', 0)

  return { ok: true, odooDeleted: deleted, orphansDeleted: orphans, reset: true }
}

// Nettoyage CIBLÉ dans Odoo : pour chaque employé relié, supprime UNIQUEMENT les
// hr.attendance dont l'heure d'entrée correspond EXACTEMENT à un pointage reçu de
// la pointeuse (donc créés par la pointeuse/mes tests), et ROUVRE les anciennes
// entrées que la pointeuse aurait fermées. Ne touche à AUCUN autre enregistrement.
// dry=1 : essai à blanc (ne modifie rien, montre seulement). Clé requise.
async function actionPointeuseCleanupOdoo(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  const dry = params.dry === '1' || params.dry === 1
  const uid = await odooAuth()

  const { data: mrows } = await sb.from('pointeuse_users').select('sn, pin, employe_odoo_id')
  const map = new Map((mrows || []).map(m => [`${m.sn}|${m.pin}`, m.employe_odoo_id]))
  const empIds = [...new Set((mrows || []).map(m => m.employe_odoo_id))]

  // Heures (UTC, format Odoo) des pointages reçus, par employé
  const { data: punches } = await sb.from('pointeuse_punches').select('sn, pin, punch_local')
  const timesByEmp = new Map()
  for (const p of punches || []) {
    const e = map.get(`${p.sn}|${p.pin}`); if (!e) continue
    if (!timesByEmp.has(e)) timesByEmp.set(e, new Set())
    timesByEmp.get(e).add(localMarocToUtc(p.punch_local))
  }

  let deleted = 0, reopened = 0
  const details = []
  for (const e of empIds) {
    const times = timesByEmp.get(e) || new Set()
    const att = await odooExec(uid, 'hr.attendance', 'search_read',
      [[['employee_id', '=', e]], ['id', 'check_in', 'check_out']], { limit: 300, order: 'check_in desc' })
    for (const a of att || []) {
      const ci = a.check_in ? String(a.check_in).slice(0, 19) : null
      const co = a.check_out ? String(a.check_out).slice(0, 19) : null
      if (ci && times.has(ci)) {
        if (!dry) { try { await odooExec(uid, 'hr.attendance', 'unlink', [[a.id]]) } catch (err) { if (!/allow_none|dumps|does not exist/i.test(String(err.message))) throw err } }
        deleted++; if (details.length < 60) details.push({ emp: e, supprime: a.id, entree: ci })
      } else if (co && times.has(co)) {
        if (!dry) { try { await odooExec(uid, 'hr.attendance', 'write', [[a.id], { check_out: false }]) } catch (err) { if (!isSerQuirk(err)) throw err } }
        reopened++; if (details.length < 60) details.push({ emp: e, rouvert: a.id, sortie_enlevee: co })
      }
    }
  }
  return { ok: true, dry, deleted, reopened, details }
}

// Diagnostic ciblé d'un numéro : ses pointages reçus + son état côté Odoo. Clé requise.
async function actionPointeuseDebugPin(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  const pin = String(params.pin || '')
  const { data: punches } = await sb.from('pointeuse_punches')
    .select('sn, pin, punch_local, status, odoo_action, err').eq('pin', pin)
    .order('punch_local', { ascending: true })
  const { data: mrows } = await sb.from('pointeuse_users').select('sn, pin, employe_odoo_id, employe_nom').eq('pin', pin)
  const empIds = [...new Set((mrows || []).map(m => m.employe_odoo_id))]
  let odooAtt = []
  if (empIds.length) {
    const uid = await odooAuth()
    odooAtt = await odooExec(uid, 'hr.attendance', 'search_read',
      [[['employee_id', 'in', empIds]], ['id', 'check_in', 'check_out']],
      { limit: 50, order: 'check_in desc' })
  }
  // Pointages de l'app pour l'employé résolu (par nom)
  let appPointages = []
  if (mrows && mrows.length) {
    const { data: employesDb } = await sb.from('employes').select('id, nom, nom_odoo, nom_odoo_match').eq('actif', true)
    const m = findBestMatch(mrows[0].employe_nom, employesDb, 0.70)
    if (m) {
      const { data: pts } = await sb.from('pointages')
        .select('date_pointage, arrivee, depart, source').eq('employe_id', m.employe.id)
        .order('arrivee', { ascending: false }).limit(15)
      appPointages = pts || []
    }
  }
  return {
    mapping: mrows || [],
    nb_punches: punches?.length || 0,
    punches: (punches || []).map(p => ({ t: p.punch_local, s: p.status, a: p.odoo_action, err: p.err ? p.err.slice(0, 80) : null })),
    app_pointages: appPointages,
    odoo_attendances: odooAtt,
  }
}

// Remet TOUS les pointages reçus en file d'attente (sans toucher Odoo). Sert à
// reconstruire proprement dans l'app. Clé requise.
async function actionPointeuseResetStatus(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  // Efface les lignes déjà écrites par la pointeuse (pour reconstruire propre).
  // ⚠️ inclut les entrées badgeuse « adoptées » : elles reviendront via la synchro Odoo.
  await sb.from('pointages').delete().eq('source', 'pointeuse')
  const { error } = await sb.from('pointeuse_punches').update({
    status: 'pending', odoo_action: null, odoo_attendance_id: null,
    employe_odoo_id: null, err: null, processed_at: null,
  }).neq('id', 0)
  return error ? { error: error.message } : { ok: true, reset: true }
}

// Nommer une machine (sn → nom), pour la poser tout de suite. Clé requise.
async function actionPointeuseSetDevice(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  if (!params.sn) return { error: 'sn requis' }
  const { error } = await sb.from('pointeuse_devices')
    .upsert({ sn: params.sn, nom: params.nom || null }, { onConflict: 'sn' })
  return error ? { error: error.message } : { ok: true, sn: params.sn, nom: params.nom || null }
}

// Lecture du journal ZK (debug, protégé par clé). À retirer plus tard.
async function actionZkLog(params) {
  if (params.key !== 'zklog2026') return { error: 'unauthorized' }
  const { data, error } = await sb.from('zk_events')
    .select('*').order('id', { ascending: false }).limit(Number(params.limit) || 30)
  if (error) return { error: error.message }
  return { count: data?.length || 0, events: data || [] }
}

export default async function handler(req, res) {
  try {
    // Pointeuse ZKTeco (push ADMS) : routes /iclock/* → réponse texte, pas JSON.
    if (req.query?.iclock !== undefined) return await handleIclock(req, res)

    const action = req.query?.action || req.body?.action
    const params = req.body || req.query || {}

    let result
    if (action === 'zk-log')                  result = await actionZkLog(params)
    else if (action === 'push-pointeuse')     result = await pushPunchesToPointages({ statuses: ['pending', 'unmapped', 'error'] })
    else if (action === 'pointeuse-status')   result = await actionPointeuseStatus(params)
    else if (action === 'pointeuse-clear')    result = await actionPointeuseClear(params)
    else if (action === 'pointeuse-set-device') result = await actionPointeuseSetDevice(params)
    else if (action === 'pointeuse-reprocess') result = await actionPointeuseReprocess(params)
    else if (action === 'pointeuse-debug-pin') result = await actionPointeuseDebugPin(params)
    else if (action === 'pointeuse-cleanup-odoo') result = await actionPointeuseCleanupOdoo(params)
    else if (action === 'pointeuse-reset-status') result = await actionPointeuseResetStatus(params)
    else if (action === 'sync-attendance')    result = await actionSyncAttendance(params)
    else if (action === 'sync-leaves')        result = await actionSyncLeaves(params)
    else if (action === 'sync-leaves-year')   result = await actionSyncLeavesYear(params)
    else if (action === 'list-allocations')   result = await actionListAllocations(params)
    else if (action === 'import-allocations') result = await actionImportAllocations(params)
    else if (action === 'list-employees')     result = await actionListEmployees()
    else if (action === 'import-photos-odoo') result = await actionImportPhotosOdoo()
    else if (action === 'debug-attendance')   result = await actionDebugAttendance(params)
    else if (action === 'audit-maladie-courte') result = await actionAuditMaladieCourte(params)
    else return res.status(400).json({ error: 'Unknown action: ' + action })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(result)
  } catch (e) {
    console.error('pointage-api error:', e)
    return res.status(500).json({
      error: e.message || String(e),
      stack: e.stack ? e.stack.slice(0, 500) : undefined,
    })
  }
}
