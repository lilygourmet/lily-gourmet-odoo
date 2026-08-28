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

// Certains PDF ont le texte écrit en DOUBLE (deux couches superposées) : les mots du
// libellé ressortent répétés (« VIRT RECU MME VIRT RECU MME X X »). On garde le 1er
// passage de chaque mot — sinon le même virement réimporté crée un doublon « à lier ».
function flatLabel(s) {
  const out = []
  for (const w of (s || '').split(/\s+/)) if (w && !out.includes(w)) out.push(w)
  return out.join(' ')
}

// Type d'une opération d'après son libellé
function classify(label) {
  const L = (label || '').toUpperCase()
  if (/VERSEMENT|VERST\s*ESP/.test(L)) return 'versement'        // dépôt espèces (crédit)
  if (/REMISE\s*(DE\s+)?(CHEQUE|CHQ)/.test(L)) return 'cheque_depot'  // remise de chèque (crédit)
  if (/REMISE\s*TPE/.test(L)) return 'tpe'                       // carte (à ignorer)
  // VIR / VIREMENT / VIRT, avec ou sans point, INST optionnel
  if (/VIR(EMENT|T)?\.?\s*(INST\s*)?EMIS/.test(L)) return 'virement_emis'   // sortant / remboursement
  if (/VIR(EMENT|T)?\.?\s*(INST\s*)?RECU/.test(L)) return 'virement_recu'   // virement reçu
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

// Comme groupRows mais TOLÈRE un décalage vertical de quelques pixels sur une même
// ligne. Sur certains relevés Attijariwafa, le libellé et le montant d'une opération
// sont à ~1px d'écart en Y ; l'arrondi strict les mettait dans 2 lignes différentes
// → le montant se retrouvait sans son libellé (versement espèce classé « autre »).
function groupRowsTol(items, tol = 3) {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y)
  const rows = []
  for (const it of sorted) {
    const last = rows[rows.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tol) last.items.push(it)
    else rows.push({ page: it.page, y: it.y, items: [it] })
  }
  return rows
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
  // Plafond des libellés, PAR PAGE : au-dessus, c'est l'en-tête, pas une opération.
  // L'en-tête de colonnes (« Débit ») n'est imprimé que sur la 1re page ; les pages
  // suivantes n'ont que le bandeau (qui se termine par « Période du: »). Appliquer le
  // plafond de la page 1 à toutes les pages jetait le haut de chaque page → 50 libellés
  // perdus sur un relevé de 26 pages (lignes « — » dans « à lier »).
  const hyByPage = {}
  let bandeauY = null
  for (const it of items) {
    if (it.str === 'Débit' && hyByPage[it.page] == null) hyByPage[it.page] = it.y
    if (it.str.startsWith('Période du')) bandeauY = bandeauY == null ? it.y : Math.min(bandeauY, it.y)
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
    const hy = hyByPage[it.page] ?? bandeauY ?? a.hy
    if ((hy != null && it.y >= hy) || it.x >= lmax || DR.test(it.str) || parseAmount(it.str) != null) continue
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
  const ops = []       // lignes avec un montant (les opérations)
  const refRows = []   // lignes sans montant = codes de référence (imprimés sous chaque opération)
  for (const r of groupRows(items)) {
    let deb = null, cre = null, date = null
    const lab = []
    for (const it of r.items) {
      const m = parseAmount(it.str)
      if (m != null && it.x > 340) { if (it.x > 470) cre = Math.abs(m); else deb = Math.abs(m); continue }
      if (DR.test(it.str) && it.x < 90) { if (date == null) date = it.str; continue }
      if (it.x >= 90 && it.x < 290) lab.push({ x: it.x, s: it.str })
    }
    const label = lab.sort((a, b) => a.x - b.x).map(p => p.s).join(' ')
    if (deb == null && cre == null) { if (label) refRows.push({ page: r.page, y: r.y, s: label }); continue }
    const mm = (date || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
    ops.push({ page: r.page, y: r.y, dateIso: mm ? isoDate(mm[1], mm[2], mm[3]) : null, label, debit: deb, credit: cre, type: classify(label) })
  }
  // Référence unique = les codes imprimés JUSTE SOUS chaque opération (jusqu'à l'opération suivante).
  // Sert à distinguer 2 virements identiques (même nom/montant/date) et reste identique d'un relevé à l'autre.
  ops.sort((a, b) => a.page - b.page || b.y - a.y)
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i], next = ops[i + 1]
    const yBot = next && next.page === o.page ? next.y : -Infinity
    o.ref = refRows.filter(f => f.page === o.page && f.y < o.y && f.y > yBot).map(f => f.s).join(' ')
  }
  return ops.map(({ page, y, ...t }) => t)
}

// Attijariwafa : code | libellé | réf | date valeur | montant (crédit si x>500).
function parseAwb(items) {
  const DV = /^\d{2} \d{2} \d{4}$/
  const out = []
  for (const r of groupRowsTol(items)) {
    let amt = null, credit = false, dv = null, dop = null
    const lab = []
    for (const it of r.items) {
      const m = parseAmount(it.str)
      if (m != null && it.x > 360) { amt = Math.abs(m); credit = it.x > 500; continue }
      if (DV.test(it.str) && it.x > 270 && it.x < 360) { dv = it.str; continue }
      // Colonne de gauche : « 0016CP 14 05 » = code opération + date d'OPÉRATION (jour mois).
      if (it.x < 85) { const d = it.str.match(/(\d{2}) (\d{2})$/); if (d && !dop) dop = d; continue }
      if (it.x >= 85 && it.x < 270) lab.push({ x: it.x, s: it.str })
    }
    if (amt == null) continue
    const label = lab.sort((a, b) => a.x - b.x).map(p => p.s).join(' ')
    const mm = (dv || '').match(/(\d{2}) (\d{2}) (\d{4})/)
    // On garde TOUJOURS la date d'opération (comme les relevés BMCI) : sinon le même
    // virement apparaît 2 fois — une fois au jour de l'opération, une fois au jour de
    // valeur. L'année vient de la date de valeur (0-3 j plus tard).
    let dateIso = null
    if (mm) {
      const yv = Number(mm[3])
      dateIso = dop
        ? isoDate(dop[1], dop[2], String(dop[2] === '12' && mm[2] === '01' ? yv - 1 : yv))
        : isoDate(mm[1], mm[2], mm[3])
    }
    out.push({ dateIso, label, debit: credit ? null : amt, credit: credit ? amt : null, type: classify(label) })
  }
  return out
}

// Attijariwafa « Mouvement du compte / Relevé des opérations » : colonnes Débit/Crédit
// séparées. Le libellé est sur une ligne légèrement décalée du montant. Comme ce relevé
// est en 1 pour 1 (1 ligne = 1 libellé + 1 montant, jamais de vide), on apparie les
// libellés et les montants DANS L'ORDRE (haut → bas) plutôt qu'« au plus proche en Y »
// (qui décalait d'une ligne et laissait un libellé vide).
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
    if (deb != null || cre != null) ars.push({ page: r.page, y: r.y, dop, deb, cre, label: '' })
  }

  // Fragments de la colonne « libellé », groupés par page.
  const labFrags = {}
  for (const it of items) {
    if (it.y >= headerY || it.x < 100 || it.x >= 295 || DR.test(it.str) || parseAmount(it.str) != null) continue
    ;(labFrags[it.page] || (labFrags[it.page] = [])).push({ y: it.y, x: it.x, s: it.str })
  }
  // Regroupe les fragments d'une même ligne (même Y), triés haut → bas.
  function labelLines(frags) {
    const sorted = (frags || []).slice().sort((a, b) => b.y - a.y || a.x - b.x)
    const lines = []
    for (const f of sorted) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.y - f.y) < 4) last.parts.push(f)
      else lines.push({ y: f.y, parts: [f] })
    }
    return lines.map(l => ({ y: l.y, s: l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim() }))
  }

  const byPage = {}
  for (const ar of ars) (byPage[ar.page] || (byPage[ar.page] = [])).push(ar)
  for (const page in byPage) {
    const amounts = byPage[page].sort((a, b) => b.y - a.y)   // haut → bas
    const labels = labelLines(labFrags[page])                // déjà haut → bas
    if (labels.length === amounts.length) {
      // 1 pour 1 dans l'ordre (jamais de libellé vide) — corrige le décalage.
      amounts.forEach((ar, i) => { ar.label = labels[i].s })
    } else {
      // Repli (nombre différent, ex. libellé sur 2 lignes) : plus proche en Y.
      for (const lab of labels) {
        let b = amounts[0], bd = Math.abs(lab.y - b.y)
        for (const ar of amounts) { const d = Math.abs(lab.y - ar.y); if (d < bd) { bd = d; b = ar } }
        b.label = (b.label ? b.label + ' ' : '') + lab.s
      }
    }
  }

  return ars.map(ar => {
    const mm = (ar.dop || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
    return { dateIso: mm ? isoDate(mm[1], mm[2], mm[3]) : null, label: ar.label, debit: ar.deb, credit: ar.cre, type: classify(ar.label) }
  })
}

const BANK_LABEL = {
  bmci_releve: 'BMCI (relevé)',
  bmci_extrait: 'BMCI (extrait)',
  awb: 'Attijariwafa',
  awb_mvt: 'Attijariwafa (mouvement)',
}

// Rend chaque page du PDF en image (pour les relevés scannés, sans couche texte).
async function renderPagesToImages(file) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).slice() }).promise
  const images = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 2 })   // x2 = texte net pour l'IA
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    images.push(canvas.toDataURL('image/jpeg', 0.75))
    canvas.width = canvas.height = 0   // libère la mémoire
  }
  return images
}

// Lecture par IA d'un relevé SCANNÉ (image) : chaque page → l'IA renvoie les opérations.
// Envoi par petits lots pour éviter un envoi trop lourd / un délai trop long.
async function ocrStatement(file) {
  const images = await renderPagesToImages(file)
  const out = []
  const BATCH = 3
  for (let i = 0; i < images.length; i += BATCH) {
    const r = await fetch('/api/wati-webhook?action=releve-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: images.slice(i, i + BATCH) }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(`Lecture IA échouée (pages ${i + 1}+) : ${err.error || r.status}`)
    }
    const data = await r.json()
    for (const t of (data.transactions || [])) {
      out.push({ dateIso: t.date || null, label: t.label || '', debit: t.debit ?? null, credit: t.credit ?? null, type: classify(t.label || '') })
    }
  }
  return out
}

// Lit le PDF et renvoie { format, bankLabel, transactions }
export async function parseStatement(file) {
  const items = await extractItems(file)
  const detected = detectFormat(items)
  let format = detected, transactions = [], bankLabel
  // PDF sans texte (scanné/photo) OU banque non reconnue → lecture par IA (OCR).
  if (items.length < 20 || detected === 'inconnu') {
    format = 'ocr'
    transactions = await ocrStatement(file)
    if (!transactions.length) throw new Error("Lecture impossible : l'IA n'a trouvé aucune opération dans ce PDF.")
    bankLabel = 'Relevé scanné (IA)'
  } else {
    if (format === 'bmci_releve') transactions = parseBmciReleve(items)
    else if (format === 'bmci_extrait') transactions = parseBmciExtrait(items)
    else if (format === 'awb') transactions = parseAwb(items)
    else if (format === 'awb_mvt') transactions = parseAwbMvt(items)
    bankLabel = BANK_LABEL[format] || format
  }
  // Exclure les lignes TPE (« Lanacash » ou sa forme abrégée « VIRT RECU LNC. ») :
  // ce sont des encaissements carte/TPE, pas des enveloppes (espèces/chèque/virement)
  // → on ne les rapproche pas.
  transactions = transactions.filter(t => !/lanacash|\bLNC\.\d/i.test(t.label || ''))
  transactions = transactions.map(t => ({ ...t, label: flatLabel(t.label) }))
  return { format, bankLabel, transactions }
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
// Espèces : dépôt le jour même ou APRÈS l'encaissement boutique — JAMAIS avant
// (on ne peut pas déposer un argent pas encore encaissé) → min 0.
// Chèque : dépôt après la vente, petite tolérance amont pour les dates de remise.
function windowFor(method) {
  if (method === 'virement') return { min: -5, max: 5 }
  if (method === 'cash')     return { min: 0, max: 100 }
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
    // Référence = 1er long numéro du libellé, sinon des codes lus sous l'opération (BMCI extrait), sinon le libellé.
    const ref = ((c.label || '') + ' ' + (c.ref || '')).match(/\d{5,}/)
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

  // Enveloppe déjà justifiée par une PREUVE PHOTO manuelle = proof_url posé sans
  // rapprochement relevé (releve_status vide). On n'y touche jamais (même en recompute).
  const isManualProof = e => !!e.proof_url && !e.releve_status
  // Gros montants d'abord (moins d'ambiguïté)
  const pending = [...envelopes.filter(e => !isManualProof(e) && (recompute
    ? covered[e.payment_method || 'cash']           // tout recalculer (moyens présents seulement)
    : e.releve_status !== 'trouve'))]               // normal : on ne retouche pas les vertes
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
    // Même date + même montant = c'est elle. Le libellé ne sert plus qu'à départager deux
    // lignes identiques du même jour : deux relevés de formats différents écrivent la même
    // opération autrement (« MLE SAMIA CHERKA » vs « MLE 2027184 000010999370 SAMIA
    // CHERKAOUI »), et l'exiger renvoyait dans « à lier » des dépôts déjà rapprochés.
    const memes = credits.filter(c => !used.has(c) && Math.abs(c.credit - amt) < 0.005 && c.dateIso === npDate)
    const m = memes.find(c => c.label.startsWith(npLabel) || npLabel.startsWith(c.label.slice(0, 30))) || memes[0]
    if (m) used.add(m)
  }

  // Réserver la ligne du relevé qui correspond à une PREUVE PHOTO manuelle (dans les 2
  // modes) : un même dépôt ne doit jamais être re-proposé à une autre enveloppe (anti-doublon).
  for (const env of envelopes) {
    if (!isManualProof(env)) continue
    const amt = Number(env.amount_proof ?? env.amount_cash)
    if (!(amt > 0)) continue
    const m = credits.find(c => !used.has(c) && Math.abs(c.credit - amt) < 0.005 &&
      (!env.proof_date || Math.abs(signedDays(c.dateIso, env.proof_date)) <= 7))
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
    // virement INSTANTANÉ (INST) du jour de la commande (J) ou de la veille (J-1) : l'instantané
    // est daté du jour réel sur le relevé, et la commande est saisie le jour même ou le lendemain.
    if (method === 'virement') {
      const toks = nameTokens(env.virement_client)
      if (toks.length) {
        const named = c.filter(x => { const L = norm(x.label); return toks.some(t => L.includes(t)) })
        if (named.length >= 1) return named
        return c.filter(x => /INST/i.test(x.label) &&
          signedDays(x.dateIso, env.session_date) >= -1 && signedDays(x.dateIso, env.session_date) <= 0)
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
  // 2bis) 2 virements = 1 ligne : 2 enveloppes virement absentes du MÊME client dont la
  //    SOMME = une ligne virement dispo (nom du client dans le libellé). On propose les
  //    deux « à confirmer » sur cette ligne (jamais vert auto → l'utilisateur valide).
  const absentVir = pending.filter(e => (e.payment_method || 'cash') === 'virement' && decided.get(e.id)?.status === 'absent')
  for (let i = 0; i < absentVir.length; i++) {
    const a = absentVir[i]
    if (decided.get(a.id)?.status !== 'absent') continue
    const ta = nameTokens(a.virement_client)
    if (!ta.length) continue
    for (let j = i + 1; j < absentVir.length; j++) {
      const b = absentVir[j]
      if (decided.get(b.id)?.status !== 'absent') continue
      const tb = nameTokens(b.virement_client)
      if (!tb.length || !ta.some(t => tb.includes(t))) continue   // même client
      const sum = Number(a.amount_cash) + Number(b.amount_cash)
      const w = windowFor('virement')
      const inWin = c => (signedDays(c.dateIso, a.session_date) >= w.min && signedDays(c.dateIso, a.session_date) <= w.max)
        || (signedDays(c.dateIso, b.session_date) >= w.min && signedDays(c.dateIso, b.session_date) <= w.max)
      const line = credits.find(x => !used.has(x) && (x.type === 'virement_recu' || x.type === 'autre')
        && Math.abs(x.credit - sum) < 0.005 && inWin(x) && ta.some(t => norm(x.label).includes(t)))
      if (line) {
        used.add(line)
        decided.set(a.id, { status: 'a_confirmer', line: null, candidates: [line], combined: true })
        decided.set(b.id, { status: 'a_confirmer', line: null, candidates: [line], combined: true })
        break
      }
    }
  }

  // 3) Filet anti-erreur de typage : une enveloppe restée 'absent' est aussi cherchée dans l'AUTRE
  //    moyen (virement ↔ espèces), même montant + fenêtre du moyen visé. Toujours 'à confirmer'
  //    (jamais vert auto) car les versements espèces n'ont pas de nom à vérifier.
  const OTHER = { virement: 'cash', cash: 'virement' }
  for (const env of pending) {
    const d = decided.get(env.id)
    if (!d || d.status !== 'absent') continue
    const other = OTHER[env.payment_method || 'cash']
    if (!other) continue
    const amt = Number(env.amount_cash)
    const w = windowFor(other)
    const c = candidatesFor(other, credits).filter(x =>
      !used.has(x) && Math.abs(x.credit - amt) < 0.005 &&
      signedDays(x.dateIso, env.session_date) >= w.min && signedDays(x.dateIso, env.session_date) <= w.max)
    if (c.length) decided.set(env.id, { status: 'a_confirmer', line: null, candidates: c, crossMethod: true })
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
