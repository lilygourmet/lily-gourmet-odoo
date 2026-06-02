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

const BANK_LABEL = {
  bmci_releve: 'BMCI (relevé)',
  bmci_extrait: 'BMCI (extrait)',
  awb: 'Attijariwafa',
}

// Lit le PDF et renvoie { format, bankLabel, transactions }
export async function parseStatement(file) {
  const items = await extractItems(file)
  const format = detectFormat(items)
  let transactions = []
  if (format === 'bmci_releve') transactions = parseBmciReleve(items)
  else if (format === 'bmci_extrait') transactions = parseBmciExtrait(items)
  else if (format === 'awb') transactions = parseAwb(items)
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
export function reconcileEnvelopes(envelopes, txns) {
  const credits = txns.filter(t => t.credit != null && t.dateIso)
  const refunds = txns.filter(t => t.debit != null && t.type === 'virement_emis')
  const isos = credits.map(c => c.dateIso).sort()
  const period = { min: isos[0] || null, max: isos[isos.length - 1] || null }

  const pending = envelopes.filter(e => e.releve_status !== 'trouve')
  const used = new Set()
  const results = []
  // Gros montants d'abord (moins d'ambiguïté)
  const sorted = [...pending].sort((a, b) => Number(b.amount_cash) - Number(a.amount_cash))
  for (const env of sorted) {
    const method = env.payment_method || 'cash'
    const amt = Number(env.amount_cash)
    const w = windowFor(method)
    let cand = candidatesFor(method, credits).filter(c =>
      !used.has(c) && Math.abs(c.credit - amt) < 0.005 &&
      signedDays(c.dateIso, env.session_date) >= w.min && signedDays(c.dateIso, env.session_date) <= w.max)
    // dépôt le plus proche en premier
    cand = cand.sort((a, b) => Math.abs(signedDays(a.dateIso, env.session_date)) - Math.abs(signedDays(b.dateIso, env.session_date)))
    let status = 'absent', line = null
    if (cand.length === 1) { status = 'trouve'; line = cand[0] }
    else if (cand.length > 1) {
      if (method === 'virement') {
        const toks = nameTokens(env.virement_client)
        const named = toks.length ? cand.filter(c => { const L = norm(c.label); return toks.some(t => L.includes(t)) }) : []
        if (named.length === 1) { status = 'trouve'; line = named[0] }
        else status = 'a_confirmer'
      } else {
        // espèces/chèques : montant exact suffit, on prend le plus proche
        status = 'a_confirmer'
      }
    }
    if (line) used.add(line)
    results.push({ env, status, line, candidates: cand })
  }
  const stats = {
    trouve: results.filter(r => r.status === 'trouve').length,
    a_confirmer: results.filter(r => r.status === 'a_confirmer').length,
    absent: results.filter(r => r.status === 'absent').length,
  }
  return { results, refunds, period, stats }
}
