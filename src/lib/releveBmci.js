// Lecture de relevés/extraits bancaires (PDF) + rapprochement avec les enveloppes Banque.
// Tout côté navigateur (limite de 12 fonctions API Vercel atteinte).
// Formats reconnus automatiquement :
//   - BMCI « Relevé de vos opérations »  (virements ; montant au milieu du libellé)
//   - BMCI « Relevé de compte » (extrait) (virements ; libellé sur la ligne du montant)
//   - Attijariwafa « Relevés de compte »  (espèces + chèques + virements)
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// "1 234,56" / "2.410,00" / "-2 593,99" -> nombre signé (null sinon).
// La virgule est toujours le décimal ; espaces et points = séparateurs de milliers.
function parseAmount(s) {
  const m = s.replace(/[\s.]/g, '').match(/^(-?)(\d+),(\d{2})$/)
  if (!m) return null
  const v = parseInt(m[2], 10) + parseInt(m[3], 10) / 100
  return m[1] === '-' ? -v : v
}
const isoDate = (j, m, a) => `${a}-${m.padStart(2, '0')}-${j.padStart(2, '0')}`
export const daysBetween = (isoA, isoB) => Math.abs((new Date(isoA) - new Date(isoB)) / 86400000)
const signedDays = (isoA, isoB) => (new Date(isoA) - new Date(isoB)) / 86400000

// Type d'une opération d'après son libellé
function classify(label) {
  const L = (label || '').toUpperCase()
  if (/VERSEMENT ESPECE/.test(L)) return 'versement'         // dépôt espèces (crédit)
  if (/REMISE CHEQUE/.test(L)) return 'cheque_depot'         // remise de chèque (crédit)
  if (/REMISE TPE/.test(L)) return 'tpe'                     // carte (à ignorer)
  if (/VIR(EMENT)? (INST )?EMIS|VIR\.EMIS/.test(L)) return 'virement_emis'   // sortant / remboursement
  if (/VIR(EMENT)? (INST )?RECU|VIR\.RECU/.test(L)) return 'virement_recu'   // virement reçu
  if (/CHEQUE/.test(L)) return 'cheque'
  return 'autre'
}

async function extractItems(file) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).slice() }).promise
  const items = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    for (const it of tc.items) {
      const str = (it.str || '').trim()
      if (str && str !== '栀') items.push({ str, x: it.transform[4], y: it.transform[5], page: p })
    }
  }
  return items
}

function groupRows(items) {
  const m = new Map()
  for (const it of items) {
    const k = `${it.page}:${Math.round(it.y)}`
    if (!m.has(k)) m.set(k, { page: it.page, y: it.y, items: [] })
    m.get(k).items.push(it)
  }
  return [...m.values()]
}

function detectFormat(items) {
  const head = items.slice(0, 120).map(i => i.str).join(' ')
  const all = items.map(i => i.str).join(' ')
  if (/Relevé de vos opérations/i.test(head)) return 'bmci_releve'
  if (/RELEVE DE COMPTE/i.test(head) && /SOLDE PRECEDENT/i.test(all)) return 'bmci_extrait'
  if (/SOLDE DEPART AU/i.test(all)) return 'awb'
  if (/Libellé Opération/i.test(all) || /Mouvement du compte du/i.test(all)) return 'awb_mvt'
  return 'inconnu'
}

const DR = /^\d{2}\/\d{2}\/\d{4}$/

// BMCI relevé : le montant est au milieu de son libellé (en-tête au-dessus, suite en dessous).
function parseBmciReleve(items) {
  const a = {}
  for (const it of items) {
    if (it.str === 'Débit' && a.debit == null) { a.debit = it.x; a.hy = it.y }
    if (it.str === 'Crédit' && a.credit == null) a.credit = it.x
    if (it.str === 'Date valeur' && a.dv == null) a.dv = it.x
    if (it.str.startsWith('Détails') && a.det == null) a.det = it.x
    if (it.str.startsWith('Date op') && a.dop == null) a.dop = it.x
  }
  if (a.dop == null || a.dv == null) return []
  const lmax = (a.det + a.dv) / 2 - 40
  const ars = []
  for (const r of groupRows(items)) {
    let deb = null, cr = null, dop = null
    for (const it of r.items) {
      const m = parseAmount(it.str)
      if (m != null) { if (m < 0) deb = -m; else cr = m; continue }
      if (DR.test(it.str) && Math.abs(it.x - a.dop) <= Math.abs(it.x - a.dv) && dop == null) dop = it.str
    }
    if (deb != null || cr != null) ars.push({ page: r.page, y: r.y, dop, deb, cr, frags: [] })
  }
  const bp = {}
  for (const ar of ars) (bp[ar.page] || (bp[ar.page] = [])).push(ar)
  for (const it of items) {
    if (it.y >= (a.hy || Infinity) || it.x >= lmax || DR.test(it.str) || parseAmount(it.str) != null) continue
    const c = bp[it.page]; if (!c) continue
    let b = c[0], bd = Math.abs(it.y - b.y)
    for (const ar of c) { const d = Math.abs(it.y - ar.y); if (d < bd) { bd = d; b = ar } }
    b.frags.push({ y: it.y, x: it.x, s: it.str })
  }
  return ars.map(ar => {
    const label = ar.frags.sort((p, q) => q.y - p.y || p.x - q.x).map(f => f.s).join(' ').replace(/\s+/g, ' ').trim()
    const mm = (ar.dop || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
    return { dateIso: mm ? isoDate(mm[1], mm[2], mm[3]) : null, label, debit: ar.deb, credit: ar.cr, type: classify(label) }
  })
}

// BMCI extrait : libellé sur la ligne du montant ; débit/crédit par position X.
function parseBmciExtrait(items) {
  const out = []
  for (const r of groupRows(items)) {
    let deb = null, cre = null, date = null
    const lab = []
    for (const it of r.items) {
      const m = parseAmount(it.str)
      if (m != null && it.x > 340) { if (it.x > 470) cre = Math.abs(m); else deb = Math.abs(m); continue }
      if (DR.test(it.str) && it.x < 90) { if (date == null) date = it.str; continue }
      if (it.x >= 90 && it.x < 290) lab.push({ x: it.x, s: it.str })
    }
    if (deb == null && cre == null) continue
    const label = lab.sort((a, b) => a.x - b.x).map(p => p.s).join(' ')
    const mm = (date || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
    out.push({ dateIso: mm ? isoDate(mm[1], mm[2], mm[3]) : null, label, debit: deb, credit: cre, type: classify(label) })
  }
  return out
}

// Attijariwafa : code | libellé | réf | date valeur | montant (crédit si x>500).
function parseAwb(items) {
  const DV = /^\d{2} \d{2} \d{4}$/
  const out = []
  for (const r of groupRows(items)) {
    let amt = null, credit = false, dv = null
    const lab = []
    for (const it of r.items) {
      const m = parseAmount(it.str)
      if (m != null && it.x > 360) { amt = Math.abs(m); credit = it.x > 500; continue }
      if (DV.test(it.str) && it.x > 270 && it.x < 360) { dv = it.str; continue }
      if (it.x >= 85 && it.x < 270) lab.push({ x: it.x, s: it.str })
    }
    if (amt == null) continue
    const label = lab.sort((a, b) => a.x - b.x).map(p => p.s).join(' ')
    const mm = (dv || '').match(/(\d{2}) (\d{2}) (\d{4})/)
    out.push({ dateIso: mm ? isoDate(mm[1], mm[2], mm[3]) : null, label, debit: credit ? null : amt, credit: credit ? amt : null, type: classify(label) })
  }
  return out
}

// Attijariwafa « Mouvement du compte / Relevé des opérations » : colonnes Débit/Crédit
// séparées ; le libellé est décalé du montant (on rattache au montant le plus proche en Y).
function parseAwbMvt(items) {
  let headerY = Infinity
  for (const it of items) { if (/^Crédit$/i.test(it.str)) { headerY = it.y; break } }
  const ars = []
  for (const r of groupRows(items)) {
    let deb = null, cre = null, dop = null
    for (const it of r.items) {
      const m = parseAmount(it.str)
      if (m != null && it.x > 340) { const v = Math.abs(m); if (v < 0.005) continue; if (it.x < 405) deb = v; else cre = v; continue }
      if (DR.test(it.str) && it.x < 60 && dop == null) dop = it.str
    }
    if (deb != null || cre != null) ars.push({ page: r.page, y: r.y, dop, deb, cre, frags: [] })
  }
  const bp = {}
  for (const ar of ars) (bp[ar.page] || (bp[ar.page] = [])).push(ar)
  for (const it of items) {
    if (it.y >= headerY || it.x < 100 || it.x >= 295 || DR.test(it.str) || parseAmount(it.str) != null) continue
    const c = bp[it.page]; if (!c) continue
    let b = c[0], bd = Math.abs(it.y - b.y)
    for (const ar of c) { const d = Math.abs(it.y - ar.y); if (d < bd) { bd = d; b = ar } }
    b.frags.push({ y: it.y, x: it.x, s: it.str })
  }
  return ars.map(ar => {
    const label = ar.frags.sort((p, q) => q.y - p.y || p.x - q.x).map(f => f.s).join(' ').replace(/\s+/g, ' ').trim()
    const mm = (ar.dop || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
    return { dateIso: mm ? isoDate(mm[1], mm[2], mm[3]) : null, label, debit: ar.deb, credit: ar.cre, type: classify(label) }
  })
}

const BANK_LABEL = {
  bmci_releve: 'BMCI (relevé)',
  bmci_extrait: 'BMCI (extrait)',
  awb: 'Attijariwafa',
  awb_mvt: 'Attijariwafa (mouvement)',
}

// Lit le PDF et renvoie { format, bankLabel, transactions }
export async function parseStatement(file) {
  const items = await extractItems(file)
  const format = detectFormat(items)
  let transactions = []
  if (format === 'bmci_releve') transactions = parseBmciReleve(items)
  else if (format === 'bmci_extrait') transactions = parseBmciExtrait(items)
  else if (format === 'awb') transactions = parseAwb(items)
  else if (format === 'awb_mvt') transactions = parseAwbMvt(items)
  else throw new Error("Banque non reconnue (ni BMCI ni Attijariwafa). Vérifie que c'est bien un relevé/extrait PDF.")
  return { format, bankLabel: BANK_LABEL[format] || format, transactions }
}

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
const nameTokens = s => norm(s).split(/\s+/).filter(t => t.length >= 4)

// Lignes candidates pour un moyen de paiement
function candidatesFor(method, credits) {
  if (method === 'virement') return credits.filter(t => t.type === 'virement_recu' || t.type === 'autre')
  if (method === 'cheque')   return credits.filter(t => t.type === 'cheque_depot')
  if (method === 'cash')     return credits.filter(t => t.type === 'versement')
  return []
}

// Fenêtre de dates par moyen (en jours). Virement : ±5 (instantané/classique).
// Espèces/chèques : dépôt APRÈS la vente, souvent en retard (jusqu'à ~100 j).
function windowFor(method) {
  if (method === 'virement') return { min: -5, max: 5 }
  return { min: -2, max: 100 }
}

// Rapproche les enveloppes Banque avec les lignes du relevé.
// Ne touche pas aux enveloppes déjà 'trouve'. status: 'trouve' | 'a_confirmer' | 'absent'
export function reconcileEnvelopes(envelopes, txns, opts = {}) {
  const recompute = !!opts.recompute
  // Dédoublonnage : un même dépôt présent dans plusieurs relevés (formats/périodes qui se
  // recouvrent) → même montant + même référence (le numéro dans le libellé). On garde 1 ligne.
  const rawCredits = txns.filter(t => t.credit != null && t.dateIso)
  const seenC = new Set()
  const credits = []
  for (const c of rawCredits) {
    const ref = (c.label || '').match(/\d{5,}/)
    const key = `${Math.round(c.credit * 100)}|${ref ? ref[0] : (c.label || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24)}`
    if (seenC.has(key)) continue
    seenC.add(key); credits.push(c)
  }
  const refunds = txns.filter(t => t.debit != null && t.type === 'virement_emis')
  const isos = credits.map(c => c.dateIso).sort()
  const period = { min: isos[0] || null, max: isos[isos.length - 1] || null }

  // Moyens « couverts » par ce(s) fichier(s) (sécurité : ne pas toucher un moyen absent du relevé)
  const covered = {
    virement: credits.some(c => c.type === 'virement_recu' || c.type === 'autre'),
    cash: credits.some(c => c.type === 'versement'),
    cheque: credits.some(c => c.type === 'cheque_depot'),
  }

  // Gros montants d'abord (moins d'ambiguïté)
  const pending = [...envelopes.filter(e => recompute
    ? covered[e.payment_method || 'cash']           // tout recalculer (moyens présents seulement)
    : e.releve_status !== 'trouve')]                // normal : on ne retouche pas les vertes
    .sort((a, b) => Number(b.amount_cash) - Number(a.amount_cash))
  const used = new Set()

  // Pré-marquer comme PRISES les lignes déjà attribuées à des enveloppes vertes
  // (sauf en mode « tout recalculer » où on repart de zéro).
  if (!recompute) for (const env of envelopes) {
    if (env.releve_status !== 'trouve' || !env.note_proof) continue
    const sep = env.note_proof.indexOf(' · ')
    if (sep < 0) continue
    const npDate = env.note_proof.slice(0, sep)
    const npLabel = env.note_proof.slice(sep + 3, sep + 33)
    const amt = Number(env.amount_cash)
    const m = credits.find(c => !used.has(c) && Math.abs(c.credit - amt) < 0.005 && c.dateIso === npDate &&
      (c.label.startsWith(npLabel) || npLabel.startsWith(c.label.slice(0, 30))))
    if (m) used.add(m)
  }

  // Lignes disponibles pour une enveloppe (montant + fenêtre date, hors lignes déjà prises,
  // affinées par le nom du client pour les virements).
  const avail = (env) => {
    const method = env.payment_method || 'cash'
    const amt = Number(env.amount_cash)
    const w = windowFor(method)
    let c = candidatesFor(method, credits).filter(x =>
      !used.has(x) && Math.abs(x.credit - amt) < 0.005 &&
      signedDays(x.dateIso, env.session_date) >= w.min && signedDays(x.dateIso, env.session_date) <= w.max)
    c.sort((a, b) => Math.abs(signedDays(a.dateIso, env.session_date)) - Math.abs(signedDays(b.dateIso, env.session_date)))
    // Virement : priorité au NOM du client. Si aucune ligne ne porte le nom, repli sur un
    // virement INSTANTANÉ (INST) de la MÊME DATE exacte (l'instantané arrive le jour même → fiable).
    if (method === 'virement') {
      const toks = nameTokens(env.virement_client)
      if (toks.length) {
        const named = c.filter(x => { const L = norm(x.label); return toks.some(t => L.includes(t)) })
        if (named.length >= 1) return named
        return c.filter(x => /INST/i.test(x.label) && x.dateIso === env.session_date)
      }
    }
    return c
  }

  // 1) Propagation : on attribue les enveloppes qui n'ont qu'UNE seule ligne possible,
  //    en boucle (attribuer une ligne en libère d'autres / en exclut pour les voisines).
  const decided = new Map()
  let changed = true
  while (changed) {
    changed = false
    for (const env of pending) {
      if (decided.has(env.id)) continue
      const c = avail(env)
      if (c.length === 1) { used.add(c[0]); decided.set(env.id, { status: 'trouve', line: c[0], candidates: [] }); changed = true }
    }
  }
  // 2) Le reste : 0 ligne dispo → absent ; sinon → à confirmer (lignes restantes, hors déjà prises)
  for (const env of pending) {
    if (decided.has(env.id)) continue
    const c = avail(env)
    decided.set(env.id, c.length === 0 ? { status: 'absent', line: null, candidates: [] } : { status: 'a_confirmer', line: null, candidates: c })
  }
  const results = pending.map(env => ({ env, ...decided.get(env.id) }))
  // Lignes du relevé NON attribuées (argent reçu sans enveloppe correspondante)
  const RELEVANT = new Set(['virement_recu', 'autre', 'versement', 'cheque_depot'])
  const unmatched = credits
    .filter(c => !used.has(c) && RELEVANT.has(c.type))
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1))
  const stats = {
    trouve: results.filter(r => r.status === 'trouve').length,
    a_confirmer: results.filter(r => r.status === 'a_confirmer').length,
    absent: results.filter(r => r.status === 'absent').length,
  }
  return { results, refunds, period, stats, unmatched }
}
