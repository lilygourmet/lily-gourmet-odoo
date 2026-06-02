// Lecture d'un relevé bancaire BMCI (PDF) + rapprochement avec les enveloppes Banque.
// Tout côté navigateur (la limite de 12 fonctions API Vercel est atteinte).
//
// Méthode de lecture validée sur de vrais relevés : le montant est AU MILIEU de
// son libellé (en-tête au-dessus, suite en dessous). On rattache donc chaque
// fragment de libellé (colonne de gauche) au montant le plus proche en Y.
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/

// "1 234,56" ou "-2 593,99" -> nombre signé (null si pas un montant)
function parseAmount(s) {
  const m = s.replace(/\s/g, '').match(/^(-?)(\d+),(\d{2})$/)
  if (!m) return null
  const v = parseInt(m[2], 10) + parseInt(m[3], 10) / 100
  return m[1] === '-' ? -v : v
}

const frToISO = d => { const [j, m, a] = d.split('/'); return `${a}-${m}-${j}` }
export const daysBetween = (isoA, isoB) => Math.abs((new Date(isoA) - new Date(isoB)) / 86400000)

// Type d'une ligne d'après son libellé
function classify(label, isCredit) {
  if (/REMISE TPE/i.test(label)) return 'tpe'
  if (/Versement Esp/i.test(label)) return 'versement'
  if (/VIRT EMIS/i.test(label)) return 'virement_emis'
  if (/VIR(T)? (INST )?RECU/i.test(label)) return 'virement_recu'
  if (/CHEQUE/i.test(label)) return 'cheque'
  return isCredit ? 'credit_autre' : 'debit_autre'
}

// Lit le PDF -> liste de transactions { dateOp, dateIso, label, debit, credit, type }
export async function parseReleveBmci(file) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).slice() }).promise
  const items = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    for (const it of tc.items) {
      const str = (it.str || '').trim()
      if (str) items.push({ str, x: it.transform[4], y: it.transform[5], page: p })
    }
  }
  // Ancres de colonnes (en-têtes)
  const a = {}
  for (const it of items) {
    if (it.str === 'Débit' && a.debit == null) { a.debit = it.x; a.headerY = it.y }
    if (it.str === 'Crédit' && a.credit == null) a.credit = it.x
    if (it.str === 'Date valeur' && a.dateValeur == null) a.dateValeur = it.x
    if (it.str.startsWith('Détails') && a.details == null) a.details = it.x
    if (it.str.startsWith('Date op') && a.dateOp == null) a.dateOp = it.x
  }
  if (a.dateOp == null || a.dateValeur == null) throw new Error("Format BMCI non reconnu (en-têtes de colonnes introuvables).")
  const labelMaxX = a.details != null ? (a.details + a.dateValeur) / 2 - 40 : a.dateValeur - 200

  // Lignes-montant (1 montant = 1 transaction)
  const rowsMap = new Map()
  for (const it of items) {
    const k = `${it.page}:${Math.round(it.y)}`
    if (!rowsMap.has(k)) rowsMap.set(k, { page: it.page, y: it.y, items: [] })
    rowsMap.get(k).items.push(it)
  }
  const amountRows = []
  for (const row of rowsMap.values()) {
    let debit = null, credit = null, dateOp = null, dateValeur = null
    for (const it of row.items) {
      const amt = parseAmount(it.str)
      if (amt != null) { if (amt < 0) debit = -amt; else credit = amt; continue }
      if (DATE_RE.test(it.str)) {
        if (Math.abs(it.x - a.dateOp) <= Math.abs(it.x - a.dateValeur)) { if (dateOp == null) dateOp = it.str }
        else if (dateValeur == null) dateValeur = it.str
      }
    }
    if (debit != null || credit != null) amountRows.push({ page: row.page, y: row.y, dateOp, dateValeur, debit, credit, frags: [] })
  }
  // Fragments de libellé -> rattachés au montant le plus proche en Y (même page)
  const byPage = {}
  for (const ar of amountRows) (byPage[ar.page] || (byPage[ar.page] = [])).push(ar)
  for (const it of items) {
    if (it.y >= (a.headerY || Infinity)) continue   // ignore l'en-tête de page
    if (it.x >= labelMaxX) continue                 // hors colonne libellé
    if (DATE_RE.test(it.str) || parseAmount(it.str) != null) continue
    const cands = byPage[it.page]
    if (!cands || !cands.length) continue
    let best = cands[0], bd = Math.abs(it.y - best.y)
    for (const ar of cands) { const d = Math.abs(it.y - ar.y); if (d < bd) { bd = d; best = ar } }
    best.frags.push({ y: it.y, x: it.x, s: it.str })
  }
  return amountRows.map(ar => {
    const label = ar.frags.sort((p, q) => q.y - p.y || p.x - q.x).map(f => f.s).join(' ').replace(/\s+/g, ' ').trim()
    const dateOp = ar.dateOp || ar.dateValeur
    return {
      dateOp,
      dateIso: dateOp ? frToISO(dateOp) : null,
      label,
      debit: ar.debit,
      credit: ar.credit,
      type: classify(label, ar.credit != null),
    }
  })
}

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
const nameTokens = s => norm(s).split(/\s+/).filter(t => t.length >= 4)

// Quelles lignes du relevé sont candidates pour quel moyen de paiement
function candidatesFor(method, credits) {
  if (method === 'virement') return credits.filter(t => t.type !== 'tpe' && t.type !== 'versement')
  if (method === 'cash')     return credits.filter(t => t.type === 'versement')
  if (method === 'cheque')   return credits.filter(t => t.type === 'cheque')
  return []
}

// Rapproche les enveloppes Banque avec les lignes du relevé.
// Renvoie { results: [{ env, status, line }], refunds, period:{min,max}, stats }
// status: 'trouve' | 'a_confirmer' | 'absent'
export function reconcileEnvelopes(envelopes, txns, { windowDays = 5 } = {}) {
  const credits = txns.filter(t => t.credit != null && t.dateIso)
  const refunds = txns.filter(t => t.debit != null && t.type === 'virement_emis')
  const isos = credits.map(c => c.dateIso).sort()
  const period = { min: isos[0] || null, max: isos[isos.length - 1] || null }

  const used = new Set()
  const results = []
  // On traite par montant décroissant pour fiabiliser (gros montants moins ambigus)
  const sorted = [...envelopes].sort((a, b) => Number(b.amount_cash) - Number(a.amount_cash))
  for (const env of sorted) {
    const amt = Number(env.amount_cash)
    const cand = candidatesFor(env.payment_method, credits).filter(c =>
      !used.has(c) && Math.abs(c.credit - amt) < 0.005 && daysBetween(c.dateIso, env.session_date) <= windowDays)
    let status = 'absent', line = null
    if (cand.length === 1) { status = 'trouve'; line = cand[0] }
    else if (cand.length > 1) {
      const toks = nameTokens(env.virement_client)
      const named = toks.length ? cand.filter(c => { const L = norm(c.label); return toks.some(t => L.includes(t)) }) : []
      if (named.length === 1) { status = 'trouve'; line = named[0] }
      else { status = 'a_confirmer' }
    }
    if (line) used.add(line)
    results.push({ env, status, line })
  }
  const stats = {
    trouve: results.filter(r => r.status === 'trouve').length,
    a_confirmer: results.filter(r => r.status === 'a_confirmer').length,
    absent: results.filter(r => r.status === 'absent').length,
  }
  return { results, refunds, period, stats }
}
