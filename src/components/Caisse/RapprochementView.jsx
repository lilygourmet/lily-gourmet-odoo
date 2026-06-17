import { useState, useEffect, useRef, Fragment } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { loadRapproVerifies, setRapproVerified, unsetRapproVerified, saveRapproBank, loadRapproBank, clearRapproBank, loadRapproLinks, setRapproLink, unsetRapproLink } from '../../lib/caisse'
import { toast } from '../../lib/toast'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Rapprochement bancaire : on dépose les relevés carte CMI (.xlsx + .pdf).
// L'Excel sert de base (il a l'heure → matching précis). Le PDF (complet, mais
// sans heure) sert à compléter les lignes que CMI a oubliées dans l'Excel
// (repérées par STAN). On compare le tout aux paiements POS d'Odoo et on signale
// chaque carte enregistrée en caisse autrement qu'en « Carte ».

const LABEL = { e: 'Espèces', k: 'Compte client', q: 'Chèque', v: 'Virement', r: 'Avoir/Crédit', a: 'Autre' }
const norm = s => (s == null ? '' : s.toString()).toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n))
const isoOf = dstr => { const m = dstr.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : dstr }
const frOf = iso => { const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso }
const hhmm = ms => new Date(ms).toISOString().slice(11, 19)
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const monthLabel = ym => { const [y, m] = ym.split('-'); return `${MONTHS_FR[+m - 1]} ${y}` }

async function ensureXLSX() {
  if (window.XLSX) return window.XLSX
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  return window.XLSX
}

function parseBank(rows) {
  const hi = rows.findIndex(r => Array.isArray(r) && r.some(c => norm(c).includes('montant brut')))
  if (hi < 0) throw new Error("Colonne « Montant brut TTC » introuvable — est-ce bien un relevé CMI ?")
  const H = rows[hi].map(norm)
  const col = kw => H.findIndex(h => h.includes(kw))
  const ci = {
    date: col('date de transaction') >= 0 ? col('date de transaction') : col('transaction'),
    heure: col('heure'), stan: col('stan'), montant: col('montant brut'), net: col('montant net'), sys: col('systeme'), pdv: col('pdv'),
  }
  // Montant robuste : nombre Excel → tel quel ; texte « 1 234,56 » → enlève les espaces
  // (et les points de milliers quand la virgule est le séparateur décimal) sans casser « 1234.56 ».
  const num = x => {
    if (typeof x === 'number') return x
    const s = String(x).trim()
    if (!s) return 0
    return (s.includes(',')
      ? parseFloat(s.replace(/[\s.]/g, '').replace(',', '.'))
      : parseFloat(s.replace(/\s/g, ''))) || 0
  }
  const bank = []
  for (const r of rows.slice(hi + 1)) {
    if (!Array.isArray(r)) continue
    const m = String(r[ci.date] || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!m) continue
    const heure = String(r[ci.heure] || '12:00:00')
    const t = Date.parse(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${heure}Z`)
    const amt = Math.round(num(r[ci.montant]) * 100) / 100
    if (!amt) continue
    const net = ci.net >= 0 ? Math.round(num(r[ci.net]) * 100) / 100 : amt
    const stan = String(r[ci.stan] || '').replace(/\D/g, '')
    const stanNorm = String(parseInt(stan || '0', 10))
    const dateStr = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
    const term = ci.pdv >= 0 ? String(r[ci.pdv] || '').replace(/\D/g, '') : ''
    bank.push({ t, amt, net, online: stan.length === 6, sys: String(r[ci.sys] || ''), heureStr: heure, dateStr, hasTime: true, term, stanN: parseInt(stan || '0', 10), mergeKey: `${stanNorm}|${dateStr}|${amt}`, key: `${dateStr}|${heure}|${amt}|${stan}` })
  }
  if (!bank.length) throw new Error("Aucune ligne de paiement lue dans le fichier.")
  return bank
}

// Lit un PDF de relevé CMI : renvoie chaque transaction (sans heure).
// Ligne type : "24/05/26 016236 M L 534971******7372 430.00"
async function parsePDF(file) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).slice() }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    text += ' ' + tc.items.map(it => it.str).join(' ')
  }
  // Terminal (point de vente) par position : chaque transaction prend le N° du
  // dernier en-tête « POINT DE VENTE N° … » qui la précède dans le flux.
  const venues = []; let vm
  const vrx = /POINT\s+DE\s+VENTE[^\d]{0,15}(\d{6,})/gi
  while ((vm = vrx.exec(text))) venues.push({ idx: vm.index, term: vm[1] })
  const termAt = i => { let t = ''; for (const v of venues) { if (v.idx <= i) t = v.term; else break } return t }
  // Ordre réel des colonnes dans le flux pdfjs : date STAN carte MONTANT type(V/M) L/I
  const rx = /(\d{2})\/(\d{2})\/(\d{2})\s+(\d{6})\s+[\d*][\d*\s]*?([\d.,]+\.\d{2})(?:\s+([VMDJCU]))?/g
  const out = []; let m
  while ((m = rx.exec(text))) {
    const [, dd, mm, yy, stan, amtStr, type] = m
    const amt = Math.round((parseFloat(amtStr.replace(/,/g, '')) || 0) * 100) / 100
    if (!amt) continue
    const dateStr = `${dd}/${mm}/20${yy}`
    const stanNorm = String(parseInt(stan, 10))
    out.push({
      amt, dateStr, online: stanNorm.length === 6,
      sys: type === 'M' ? 'MASTERCARD' : type === 'V' ? 'VISA' : (type || 'Carte'),
      heureStr: '—', hasTime: false, term: termAt(m.index), stanN: parseInt(stan, 10),
      t: Date.parse(`20${yy}-${mm}-${dd}T12:00:00Z`),
      mergeKey: `${stanNorm}|${dateStr}|${amt}`, key: `pdf|${stanNorm}|${dateStr}|${amt}`,
    })
  }
  if (!out.length) throw new Error('Aucune transaction lue dans le PDF — est-ce bien un relevé CMI ?')
  return out
}

function detectOffset(bank, byAmt) {
  const deltas = []
  for (const b of bank) {
    let best = null
    for (const p of (byAmt.get(b.amt) || [])) {
      const d = p.t - b.t
      if (Math.abs(d) < 6 * 3600e3 && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
    if (best !== null) deltas.push(best)
  }
  if (!deltas.length) return -60 * 60e3
  deltas.sort((a, b) => a - b)
  return Math.round(deltas[Math.floor(deltas.length / 2)] / (60 * 60e3)) * 60 * 60e3
}

// Subset-sum 0/1 : renvoie les indices d'un sous-ensemble de `arr` (entiers) sommant
// exactement à `target`, ou null. Chaque élément utilisé au plus une fois.
function subsetSum(arr, target) {
  if (!Number.isInteger(target) || target <= 0 || target > 2_000_000) return null
  const dp = new Array(target + 1).fill(null)
  dp[0] = { prev: -1, idx: -1 }
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    if (c <= 0 || c > target) continue
    for (let s = target; s >= c; s--) {
      if (dp[s] === null && dp[s - c] !== null) dp[s] = { prev: s - c, idx: i }
    }
  }
  if (dp[target] === null) return null
  const idxs = []; let s = target
  while (s > 0) { idxs.push(dp[s].idx); s = dp[s].prev }
  return idxs
}

function runMatch(bank, raw) {
  const odoo = raw.map(a => ({ a: a[0], t: a[1], c: a[2], ref: a[3] || '', pos: a[4] || '', used: false }))
  const dOf = ms => frOf(new Date(ms).toISOString().slice(0, 10)) // date locale (jj/mm/aaaa) d'un instant Odoo
  const byAmt = new Map()
  for (const p of odoo) { if (!byAmt.has(p.a)) byAmt.set(p.a, []); byAmt.get(p.a).push(p) }
  const OFFg = detectOffset(bank, byAmt) // décalage global (secours)
  // Décalage détecté JOUR PAR JOUR (gère les changements d'heure / Ramadan).
  const dayOff = {}
  {
    const byDay = {}
    for (const b of bank) { if (b.hasTime === false) continue; const d = isoOf(b.dateStr); (byDay[d] = byDay[d] || []).push(b) }
    for (const d in byDay) {
      const deltas = []
      for (const b of byDay[d]) {
        let best = null
        for (const p of (byAmt.get(b.amt) || [])) { const dd = p.t - b.t; if (Math.abs(dd) < 6 * 3600e3 && (best === null || Math.abs(dd) < Math.abs(best))) best = dd }
        if (best !== null) deltas.push(best)
      }
      if (deltas.length >= 3) { deltas.sort((a, b) => a - b); dayOff[d] = Math.round(deltas[Math.floor(deltas.length / 2)] / (60 * 60e3)) * 60 * 60e3 }
    }
  }
  const offOf = b => (dayOff[isoOf(b.dateStr)] ?? OFFg)
  const W = 20 * 60e3, D3 = 3 * 86400e3
  const withTime = bank.filter(b => b.hasTime !== false)
  const noTime = bank.filter(b => b.hasTime === false) // lignes venues du PDF (pas d'heure)
  const tpe = withTime.filter(b => !b.online), onl = withTime.filter(b => b.online)

  let okC = 0, suspects = [], intro = []; const okList = []
  for (const b of tpe) {
    const off = offOf(b)
    const cands = (byAmt.get(b.amt) || []).filter(p => !p.used && Math.abs(p.t - (b.t + off)) <= W)
    const cartes = cands.filter(p => p.c === 'c')
    const pool = cartes.length ? cartes : cands
    let best = null
    for (const p of pool) { const d = Math.abs(p.t - (b.t + off)); if (!best || d < best.d) best = { p, d } }
    if (best) { best.p.used = true; if (best.p.c === 'c') { okC++; okList.push({ b, p: best.p }) } else suspects.push({ ...b, m: best.p.c, odooHeure: hhmm(best.p.t - off), odooDate: dOf(best.p.t - off), ref: best.p.ref, pos: best.p.pos, _p: best.p }) }
    else {
      // Classement : cherche le même montant à ±3 jours pour comprendre.
      let fc = false, other = null
      for (const p of (byAmt.get(b.amt) || [])) { if (Math.abs(p.t - (b.t + off)) <= D3) { if (p.c === 'c') fc = true; else if (!other) other = p.c } }
      intro.push({ ...b, cls: fc ? 'online' : other || 'none' })
    }
  }

  let oOk = 0, oNone = []; const oSusp = []
  for (const b of onl) {
    const off = offOf(b)
    const bDay = isoOf(b.dateStr)
    const cands = (byAmt.get(b.amt) || []).filter(p => !p.used && Math.abs(p.t - (b.t + off)) <= D3)
    // En ligne : on privilégie une carte le MÊME jour ; on n'élargit à ±3 j que
    // s'il n'y a aucune carte ce jour-là (saisie caisse en retard), en prenant
    // alors la plus proche dans le temps.
    const cartes = cands.filter(p => p.c === 'c')
    const sameDay = cartes.filter(p => new Date(p.t - off).toISOString().slice(0, 10) === bDay)
    const pool = sameDay.length ? sameDay : cartes
    let carte = null
    for (const p of pool) { const d = Math.abs(p.t - (b.t + off)); if (!carte || d < carte.d) carte = { p, d } }
    carte = carte && carte.p
    if (carte) { carte.used = true; oOk++; okList.push({ b, p: carte }) }
    else { const other = cands.find(p => p.c !== 'c'); if (other) { other.used = true; oSusp.push({ ...b, m: other.c, odooHeure: hhmm(other.t - off), odooDate: dOf(other.t - off), ref: other.ref, pos: other.pos, _p: other }) } else oNone.push(b) }
  }

  // Lignes Excel (avec heure) groupées par terminal et triées par STAN : servent
  // à encadrer dans le temps les lignes PDF voisines (le STAN augmente en continu).
  const byTerm = {}
  for (const e of withTime) { if (e.term) (byTerm[e.term] = byTerm[e.term] || []).push(e) }
  for (const k in byTerm) byTerm[k].sort((x, y) => x.stanN - y.stanN)

  // Lignes du PDF (complément, sans heure) : la date PDF = date de transaction.
  // Magasin (TPE) → fenêtre = la journée, resserrée au créneau [STAN d'avant,
  // STAN d'après] du même terminal quand on les connaît (Excel) ; en ligne
  // (saisi en caisse plus tard) → marge ±3 j. Carte d'abord.
  for (const b of noTime) {
    const off = offOf(b)
    let lo, hi, target
    if (b.online) { lo = b.t - D3; hi = b.t + D3; target = b.t }
    else {
      lo = b.t - 12 * 3600e3; hi = b.t + 12 * 3600e3 // par défaut : la journée
      const seq = b.term ? byTerm[b.term] : null
      if (seq) {
        let prev = null, next = null
        for (const e of seq) { if (e.stanN < b.stanN) prev = e; else if (e.stanN > b.stanN) { next = e; break } }
        if (prev) lo = Math.max(lo, prev.t) // borne basse = STAN précédent (même jour)
        if (next) hi = Math.min(hi, next.t) // borne haute = STAN suivant
      }
      target = (lo + hi) / 2
    }
    const cands = (byAmt.get(b.amt) || []).filter(p => { const bl = p.t - off; return !p.used && bl >= lo && bl <= hi })
    const cartes = cands.filter(p => p.c === 'c')
    const pool = cartes.length ? cartes : cands
    let best = null
    for (const p of pool) { const d = Math.abs((p.t - off) - target); if (!best || d < best.d) best = { p, d } }
    if (best) { best.p.used = true; if (best.p.c === 'c') { okC++; okList.push({ b, p: best.p }) } else suspects.push({ ...b, m: best.p.c, odooHeure: hhmm(best.p.t - off), odooDate: dOf(best.p.t - off), ref: best.p.ref, pos: best.p.pos, _p: best.p }) }
    else intro.push({ ...b, cls: 'none' })
  }

  // Décalage à appliquer à un paiement Odoo (selon son jour) pour l'afficher en heure locale.
  const offForP = p => { const d = new Date(p.t - OFFg).toISOString().slice(0, 10); return dayOff[d] ?? OFFg }

  // 🔗 Paiements partagés : plusieurs cartes banque non-matchées qui s'additionnent
  // pour faire exactement une carte Odoo non-matchée (même jour, créneau proche).
  const splits = []
  {
    const cents = x => Math.round(x * 100)
    const freeBank = [...suspects, ...intro, ...oNone]
    for (const b of freeBank) b._consumed = false
    const byDayFree = {}
    for (const b of freeBank) (byDayFree[isoOf(b.dateStr)] = byDayFree[isoOf(b.dateStr)] || []).push(b)
    const odooFree = odoo.filter(p => p.c === 'c' && !p.used).sort((a, b) => a.t - b.t)
    for (const p of odooFree) {
      const target = cents(p.a)
      if (!Number.isFinite(target) || target <= 0 || target > 300000) continue // ignore remboursements/avoirs (négatifs) et gros montants
      const day = new Date(p.t - offForP(p)).toISOString().slice(0, 10)
      const pool = (byDayFree[day] || []).filter(b => !b._consumed &&
        (b.hasTime === false || Math.abs((b.t + offOf(b)) - p.t) <= 15 * 60e3))
      if (pool.length < 2 || pool.length > 40) continue
      const poolCents = pool.map(b => cents(b.amt))
      if (poolCents.reduce((s, c) => s + c, 0) < target) continue // somme insuffisante
      const idxs = subsetSum(poolCents, target)
      if (!idxs || idxs.length < 2) continue
      const parts = idxs.map(i => pool[i])
      p.used = true
      for (const b of parts) { b._consumed = true; if (b._p) b._p.used = false } // libère l'espèces faussement matchée
      splits.push({ amount: p.a, dateStr: frOf(day), odooHeure: hhmm(p.t - offForP(p)), parts })
    }
    suspects = suspects.filter(b => !b._consumed)
    intro = intro.filter(b => !b._consumed)
    oNone = oNone.filter(b => !b._consumed)
  }

  // Annulations Carte : un « -X » Carte non apparié dans Odoo = un encaissement
  // carte (présent au relevé banque) que le caissier a remboursé pour ré-encaisser
  // autrement (souvent en espèces). On apparie ce « -X » avec la ligne carte « +X »
  // du relevé du MÊME jour (classée « suspect » ou « absent d'Odoo ») : les deux
  // s'annulent → « 🔁 Annulation », et le ré-encaissement redevient normal (le
  // suspect espèces disparaît).
  const annulations = []
  for (const neg of odoo.filter(p => p.c === 'c' && !p.used && p.a < 0)) {
    const d = new Date(neg.t - offForP(neg)).toISOString().slice(0, 10)
    const want = Math.round(-neg.a * 100) / 100
    const match = b => Math.abs(b.amt - want) < 0.005 && isoOf(b.dateStr) === d
    let bankLine = null
    const si = suspects.findIndex(match)
    if (si >= 0) { bankLine = suspects[si]; if (bankLine._p) bankLine._p.used = false; suspects.splice(si, 1) }
    else { const ii = intro.findIndex(match); if (ii >= 0) { bankLine = intro[ii]; intro.splice(ii, 1) } }
    if (!bankLine) continue
    neg.used = true
    annulations.push({ bank: bankLine, neg })
  }

  const days = [...new Set(bank.map(b => isoOf(b.dateStr)))].sort()

  // Sens inverse : cartes notées dans Odoo mais sans paiement carte dans le relevé
  // (sur la plage de jours du relevé seulement).
  const minDay = days[0], maxDay = days[days.length - 1]
  const reverse = []
  for (const p of odoo) {
    if (p.c !== 'c' || p.used) continue
    const off = offForP(p)
    const loc = new Date(p.t - off), iso = loc.toISOString().slice(0, 10)
    if (iso < minDay || iso > maxDay) continue
    reverse.push({ t: p.t - off, amt: p.a, sys: 'Carte', heureStr: loc.toISOString().slice(11, 19), dateStr: frOf(iso), ref: p.ref, pos: p.pos, key: `odoo|${iso}|${p.t}|${p.a}` })
  }
  reverse.sort((a, b) => a.t - b.t)

  // Résumé par jour, vue RÉCONCILIATION : chaque carte est attribuée au jour du
  // relevé qui lui correspond (et NON aux totaux bruts, qui peuvent s'équilibrer
  // alors qu'une ligne n'a pas trouvé de match). « relevé » = cartes du relevé,
  // « caisse » = cartes Odoo correspondantes, écart = caisse − relevé. Une ligne
  // non appariée fait donc bien apparaître un écart. Annulations exclues (neutres).
  // « Carte relevé » = total carte du relevé (par jour du relevé), pour la colonne de gauche.
  const dRel = {}
  const addRel = (dstr, v) => { const d = isoOf(dstr); dRel[d] = (dRel[d] || 0) + v }
  for (const o of okList) addRel(o.b.dateStr, o.b.amt)
  for (const sp of splits) for (const b of sp.parts) addRel(b.dateStr, b.amt)
  for (const b of [...intro, ...oNone]) addRel(b.dateStr, b.amt)
  for (const s of [...suspects, ...oSusp]) addRel(s.dateStr, s.amt)
  // « Carte caisse (Odoo) » = total carte TEL QU'ENREGISTRÉ DANS ODOO, à sa DATE DE VENTE
  // et détaillé par caisse. AUCUN lien avec le relevé bancaire.
  const odooD = {}, odooPos = {}
  for (const p of odoo) {
    if (p.c !== 'c') continue
    const d = new Date(p.t - offForP(p)).toISOString().slice(0, 10)
    odooD[d] = (odooD[d] || 0) + p.a
    ;(odooPos[d] ||= {}); const k = p.pos || '(sans caisse)'; odooPos[d][k] = (odooPos[d][k] || 0) + p.a
  }
  const r2 = n => Math.round(n * 100) / 100
  const days2 = [...new Set([...days, ...Object.keys(odooD)])].sort()
  const daily = days2.map(d => ({ date: d, bank: r2(dRel[d] || 0), odoo: r2(odooD[d] || 0), gap: r2((odooD[d] || 0) - (dRel[d] || 0)), posBreak: odooPos[d] || {} }))

  // Grand livre unifié : CMI ↔ Odoo côte à côte (côté vide si pas de correspondance).
  const ledger = []
  const cmiRow = (b, status, p) => ({
    t: b.t, dateStr: b.dateStr, heureStr: b.heureStr, online: b.online,
    cmiAmt: b.amt, cmiSys: b.sys,
    odooAmt: p ? b.amt : null, odooCat: p ? (typeof p === 'string' ? p : p.c) : null,
    odooHeure: p && typeof p !== 'string' ? hhmm(p.t - offOf(b)) : (typeof p === 'string' ? b.odooHeure : ''),
    odooDate: p && typeof p !== 'string' ? dOf(p.t - offOf(b)) : '',
    ref: p && typeof p !== 'string' ? p.ref : '', pos: p && typeof p !== 'string' ? p.pos : '',
    status, amt: b.amt, key: b.key,
  })
  for (const o of okList) ledger.push(cmiRow(o.b, 'ok', o.p))
  for (const s of suspects) ledger.push({ t: s.t, dateStr: s.dateStr, heureStr: s.heureStr, online: false, cmiAmt: s.amt, cmiSys: s.sys, odooAmt: s.amt, odooCat: s.m, odooHeure: s.odooHeure, odooDate: s.odooDate, ref: s.ref, pos: s.pos, status: 'mismatch', amt: s.amt, key: s.key })
  for (const s of oSusp) ledger.push({ t: s.t, dateStr: s.dateStr, heureStr: s.heureStr, online: true, cmiAmt: s.amt, cmiSys: s.sys, odooAmt: s.amt, odooCat: s.m, odooHeure: s.odooHeure, odooDate: s.odooDate, ref: s.ref, pos: s.pos, status: 'mismatch', amt: s.amt, key: s.key })
  for (const b of [...intro, ...oNone]) ledger.push({ t: b.t, dateStr: b.dateStr, heureStr: b.heureStr, online: b.online, cmiAmt: b.amt, cmiSys: b.sys, odooAmt: null, odooCat: null, odooHeure: '', odooDate: '', ref: '', pos: '', status: 'cmi-only', amt: b.amt, key: b.key })
  for (const r of reverse) ledger.push({ t: r.t, dateStr: r.dateStr, heureStr: r.heureStr, online: false, cmiAmt: null, cmiSys: '', odooAmt: r.amt, odooCat: 'c', odooHeure: r.heureStr, odooDate: r.dateStr, ref: r.ref, pos: r.pos, status: 'odoo-only', amt: r.amt, key: r.key })
  for (const sp of splits) for (const b of sp.parts) ledger.push({ t: b.t, dateStr: b.dateStr, heureStr: b.heureStr, online: b.online, cmiAmt: b.amt, cmiSys: b.sys, odooAmt: sp.amount, odooCat: 'c', odooHeure: sp.odooHeure, odooDate: sp.dateStr, ref: '', pos: '', status: 'split', amt: b.amt, key: b.key })
  for (const an of annulations) { const off = offForP(an.neg); ledger.push({ t: an.bank.t, dateStr: an.bank.dateStr, heureStr: an.bank.heureStr, online: an.bank.online, cmiAmt: an.bank.amt, cmiSys: an.bank.sys, odooAmt: an.neg.a, odooCat: 'c', odooHeure: hhmm(an.neg.t - off), odooDate: dOf(an.neg.t - off), ref: an.neg.ref, pos: an.neg.pos, status: 'annul', amt: an.bank.amt, key: `annul|${an.bank.key}` }) }
  ledger.sort((a, b) => a.t - b.t)

  const totalBrut = bank.reduce((s, b) => s + b.amt, 0)
  const totalNet = bank.reduce((s, b) => s + (b.net ?? b.amt), 0)

  const times = bank.map(b => b.t)
  return {
    total: bank.length, okC, suspects, intro, onl, oOk, oSusp, oNone, daily, reverse, ledger, splits,
    pdfAdded: noTime.length,
    commission: Math.round((totalBrut - totalNet) * 100) / 100, totalBrut: Math.round(totalBrut),
    from: new Date(Math.min(...times)).toISOString().slice(0, 10),
    to: new Date(Math.max(...times)).toISOString().slice(0, 10),
  }
}

// Tableau regroupé par jour, avec sous-total. Colonnes selon le mode.
function GroupedTable({ list, odooHeure, methodCol, clsCol, verified, onSetStatus }) {
  const groups = {}
  for (const b of list) (groups[b.dateStr] = groups[b.dateStr] || []).push(b)
  const days = Object.keys(groups).sort((a, b) => isoOf(a).localeCompare(isoOf(b)))
  const headers = ['Heure', odooHeure && 'Heure caisse', 'Montant', 'Réseau', methodCol && 'Tapé en caisse comme', clsCol && 'Classement', methodCol && 'Commande', methodCol && 'Caisse', onSetStatus && ''].filter(Boolean)
  const clsLabel = c => c === 'online' ? '🌐 Probable en ligne (jour ≠)' : c === 'none' ? '❓ Aucune trace' : `Tapé ${LABEL[c] || c} (autre jour)`
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr className="text-ink-mute text-[11px] uppercase tracking-wider">
          {headers.map((h, i) => <th key={i} className="text-left font-semibold py-1.5 px-2 border-b border-line">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {days.map(day => {
          const items = groups[day].slice().sort((a, b) => a.t - b.t)
          const sum = items.reduce((s, b) => s + b.amt, 0)
          return (
            <Fragment key={day}>
              <tr className="bg-cream-deep">
                <td colSpan={headers.length} className="py-1.5 px-2 text-[12px] font-semibold text-ink">
                  📅 {day} <span className="text-ink-mute font-normal">— {items.length} ligne{items.length > 1 ? 's' : ''} · {fmt(sum)} dh</span>
                </td>
              </tr>
              {items.map((b, i) => {
                const st = verified && verified.get(b.key)
                return (
                  <tr key={day + '-' + i} className={st === 'justifie' ? 'opacity-50 line-through' : ''}>
                    <td className="py-2 px-2 border-b border-cream-deep">{b.heureStr}</td>
                    {odooHeure && <td className="py-2 px-2 border-b border-cream-deep text-ink-mute whitespace-nowrap">{b.odooDate ? b.odooDate + ' ' : ''}{b.odooHeure}</td>}
                    <td className="py-2 px-2 border-b border-cream-deep font-semibold tabular-nums">{fmt(b.amt)} dh</td>
                    <td className="py-2 px-2 border-b border-cream-deep">{b.sys}</td>
                    {methodCol && <td className="py-2 px-2 border-b border-cream-deep"><span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger-bg text-danger">{LABEL[b.m] || b.m}</span></td>}
                    {clsCol && <td className="py-2 px-2 border-b border-cream-deep text-ink-mute text-[12px]">{clsLabel(b.cls)}</td>}
                    {methodCol && <td className="py-2 px-2 border-b border-cream-deep text-ink-mute text-[12px]">{b.ref || '—'}</td>}
                    {methodCol && <td className="py-2 px-2 border-b border-cream-deep text-ink-mute text-[12px]">{b.pos || '—'}</td>}
                    {onSetStatus && (
                      <td className="py-2 px-2 border-b border-cream-deep whitespace-nowrap no-underline">
                        <button onClick={() => onSetStatus(b, 'justifie')} title="Justifié : sort de l'écart" className={`px-2 py-1 rounded-md text-[11px] font-semibold no-underline mr-1 ${st === 'justifie' ? 'bg-success text-white' : 'bg-success-bg text-success'}`}>✓ Justifié</button>
                        <button onClick={() => onSetStatus(b, 'refuse')} title="Refusé : reste compté en écart" className={`px-2 py-1 rounded-md text-[11px] font-semibold no-underline ${st === 'refuse' ? 'bg-danger text-white' : 'bg-danger-bg text-danger'}`}>🚩 Écart</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// Grand livre : CMI et Odoo côte à côte, regroupé par jour.
const LEDGER_ST = {
  ok: ['✅ Carte = Carte', 'bg-success-bg text-success'],
  mismatch: ['🚨 Écart', 'bg-danger-bg text-danger'],
  'cmi-only': ['❔ Absent d’Odoo', 'bg-warn-bg text-warn-ink'],
  'odoo-only': ['🔄 Absent du relevé', 'bg-cream-deep text-ink'],
  split: ['🔗 Partagé', 'bg-success-bg text-success'],
  annul: ['🔁 Annulation', 'bg-cream-deep text-ink-mute'],
}
function methodLabel(c) { return c === 'c' ? 'Carte' : (LABEL[c] || '—') }
const LEDGER_ANOM = { mismatch: 1, 'cmi-only': 1, 'odoo-only': 1 } // lignes qui font un écart
function LedgerTable({ list, dayGap, verified, onSetStatus }) {
  const groups = {}
  for (const r of list) (groups[r.dateStr] = groups[r.dateStr] || []).push(r)
  const days = Object.keys(groups).sort((a, b) => isoOf(a).localeCompare(isoOf(b)))
  const th = 'text-left font-semibold py-1.5 px-2 border-b border-line'
  if (!list.length) return <p className="text-[13px] text-ink-mute italic">Aucune ligne pour ce filtre.</p>
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr className="text-ink-mute text-[11px] uppercase tracking-wider">
          <th className={th}>Heure</th><th className={th}>CMI</th><th className={th}>Réseau</th>
          <th className={th}>Odoo</th><th className={th}>Méthode</th><th className={th}>Heure caisse</th><th className={th}>Commande</th><th className={th}>Caisse</th><th className={th}>Statut</th>{onSetStatus && <th className={th}></th>}
        </tr>
      </thead>
      <tbody>
        {days.map(day => {
          const items = groups[day].slice().sort((a, b) => a.t - b.t)
          return (
            <Fragment key={day}>
              <tr className="bg-cream-deep"><td colSpan={onSetStatus ? 10 : 9} className="py-1.5 px-2 text-[12px] font-semibold text-ink">📅 {day} <span className="text-ink-mute font-normal">— {items.length} ligne{items.length > 1 ? 's' : ''}</span>{dayGap && dayGap[day] != null && <span className={`font-semibold ${dayGap[day] < 0 ? 'text-danger' : 'text-ink-mute'}`}> · écart {dayGap[day] >= 0 ? '+' : ''}{fmt(dayGap[day])} dh</span>}</td></tr>
              {items.map((r, i) => {
                const st = verified && verified.get(r.key)
                return (
                <tr key={i} className={st === 'justifie' ? 'opacity-50 line-through' : ''}>
                  <td className="py-2 px-2 border-b border-cream-deep">{r.heureStr}</td>
                  <td className="py-2 px-2 border-b border-cream-deep font-semibold tabular-nums">{r.cmiAmt != null ? fmt(r.cmiAmt) + ' dh' : '—'}</td>
                  <td className="py-2 px-2 border-b border-cream-deep text-ink-mute">{r.cmiSys || '—'}</td>
                  <td className="py-2 px-2 border-b border-cream-deep font-semibold tabular-nums">{r.odooAmt != null ? fmt(r.odooAmt) + ' dh' : '—'}</td>
                  <td className="py-2 px-2 border-b border-cream-deep">{r.odooCat ? methodLabel(r.odooCat) : '—'}</td>
                  <td className="py-2 px-2 border-b border-cream-deep text-ink-mute whitespace-nowrap">{r.odooDate ? r.odooDate + ' ' : ''}{r.odooHeure || (r.odooDate ? '' : '—')}</td>
                  <td className="py-2 px-2 border-b border-cream-deep text-ink-mute text-[12px]">{r.ref || '—'}</td>
                  <td className="py-2 px-2 border-b border-cream-deep text-ink-mute text-[12px]">{r.pos || '—'}</td>
                  <td className="py-2 px-2 border-b border-cream-deep"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${LEDGER_ST[r.status][1]}`}>{LEDGER_ST[r.status][0]}</span></td>
                  {onSetStatus && <td className="py-2 px-2 border-b border-cream-deep whitespace-nowrap no-underline">{LEDGER_ANOM[r.status] && (<>
                    <button onClick={() => onSetStatus(r, 'justifie')} title="Justifié : sort de l'écart" className={`px-2 py-1 rounded-md text-[11px] font-semibold no-underline mr-1 ${st === 'justifie' ? 'bg-success text-white' : 'bg-success-bg text-success'}`}>✓ Justifié</button>
                    <button onClick={() => onSetStatus(r, 'refuse')} title="Refusé : reste compté en écart" className={`px-2 py-1 rounded-md text-[11px] font-semibold no-underline ${st === 'refuse' ? 'bg-danger text-white' : 'bg-danger-bg text-danger'}`}>🚩 Écart</button>
                  </>)}</td>}
                </tr>
                )
              })}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// Cache local via IndexedDB (pas de limite de taille, contrairement à localStorage).
function idbDB() { return new Promise((res, rej) => { const r = indexedDB.open('rappro', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }) }
async function idbSet(key, val) { try { const db = await idbDB(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error) }) } catch { /* ignore */ } }
async function idbGet(key) { try { const db = await idbDB(); return await new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const rq = tx.objectStore('kv').get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error) }) } catch { return null } }
async function idbDel(key) { try { const db = await idbDB(); await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = res }) } catch { /* ignore */ } }

export default function RapprochementView({ user }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState(null)
  const [links, setLinks] = useState(new Map())   // cartes CMI liées manuellement (partagé serveur)
  const [linkFor, setLinkFor] = useState(null)    // carte en cours de liaison (sa key)
  const [fileNames, setFileNames] = useState([])
  const [over, setOver] = useState(false)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [view, setView] = useState('detail')
  const [hideOk, setHideOk] = useState(true)
  const [verified, setVerified] = useState(new Map())
  const excelRef = useRef([])  // lignes Excel accumulées (avec heure)
  const pdfRef = useRef([])    // lignes PDF accumulées (complément)

  // Analyse les lignes accumulées (Excel + complément PDF) contre Odoo, et sauvegarde.
  // useCache : réutilise les ventes Odoo déjà téléchargées (ouverture rapide, sans réseau).
  async function analyze(names, { useCache = false } = {}) {
    setBusy(true); setErr('')
    try {
      const no2025 = b => !/\/2025$/.test(b.dateStr) // on ignore les lignes de 2025
      const excel = excelRef.current.filter(no2025)
      const excelMerge = new Set(excel.map(b => b.mergeKey))
      const bank = [...excel]
      const seenPdf = new Set()
      for (const p of pdfRef.current) { if (!no2025(p) || excelMerge.has(p.mergeKey) || seenPdf.has(p.mergeKey)) continue; seenPdf.add(p.mergeKey); bank.push(p) }
      if (!bank.length) { setRes(null); return }
      const times = bank.map(b => b.t)
      const from = new Date(Math.min(...times) - 3 * 86400e3).toISOString().slice(0, 10)
      const to = new Date(Math.max(...times) + 3 * 86400e3).toISOString().slice(0, 10)
      let payments = null
      if (useCache) {
        const c = await idbGet('odoo2')
        if (c && c.from <= from && c.to >= to && Array.isArray(c.payments)) payments = c.payments
      }
      if (!payments) {
        const r = await fetch(`/api/caisse-api?action=pos-payments&from=${from}&to=${to}`, { method: 'POST' })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || `Erreur serveur ${r.status}`)
        payments = data.payments || []
        idbSet('odoo2', { payments, from, to })
      }
      setRes(runMatch(bank, payments))
      const bankPayload = { excel: excelRef.current, pdf: pdfRef.current, names }
      idbSet('bank', bankPayload)
      saveRapproBank(bankPayload).catch(e => setErr('⚠️ Le relevé n’a pas pu être partagé avec les autres admins : ' + (e?.message || e)))   // partagé entre admins
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    excelRef.current = []; pdfRef.current = []
    setRes(null); setFileNames([]); setErr(''); setSearch('')
    idbDel('bank'); idbDel('odoo'); idbDel('odoo2')
    clearRapproBank().catch(() => {})   // efface aussi le relevé partagé
    try { localStorage.removeItem('rappro_bank_v1'); localStorage.removeItem('rappro_odoo_v1') } catch { /* ancien cache */ }
  }

  useEffect(() => {
    loadRapproVerifies().then(setVerified).catch(() => {})
    loadRapproLinks().then(setLinks).catch(() => {})
    ;(async () => {
      // Priorité au relevé PARTAGÉ en base (visible par tous les admins). Repli : cache local.
      let saved = await loadRapproBank().catch(() => null)
      if (!saved || !((saved.excel || []).length || (saved.pdf || []).length)) saved = await idbGet('bank')
      if (saved && ((saved.excel || []).length || (saved.pdf || []).length)) {
        excelRef.current = saved.excel || []
        pdfRef.current = saved.pdf || []
        setFileNames(saved.names || [])
        analyze(saved.names || [], { useCache: true })
      }
    })()
  }, [])

  async function onFiles(fileList) {
    const arr = Array.from(fileList || [])
    if (!arr.length) return
    setBusy(true); setErr('')
    try {
      const XLSX = await ensureXLSX()
      const excelFiles = arr.filter(f => /\.(xlsx|xls)$/i.test(f.name))
      const pdfFiles = arr.filter(f => /\.pdf$/i.test(f.name))
      let newExcel = []
      for (const file of excelFiles) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
        newExcel = newExcel.concat(parseBank(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })))
      }
      let newPdf = []
      for (const file of pdfFiles) newPdf = newPdf.concat(await parsePDF(file))
      // Continuité : on AJOUTE aux lignes déjà chargées (dédoublonnées), sans tout effacer.
      const ek = new Set(excelRef.current.map(b => b.key))
      for (const b of newExcel) if (!ek.has(b.key)) { ek.add(b.key); excelRef.current.push(b) }
      const pk = new Set(pdfRef.current.map(p => p.mergeKey))
      for (const p of newPdf) if (!pk.has(p.mergeKey)) { pk.add(p.mergeKey); pdfRef.current.push(p) }
      const names = [...new Set([...fileNames, ...arr.map(f => f.name)])]
      setFileNames(names)
      await analyze(names, { useCache: true })
    } catch (e) {
      setErr(e.message); setBusy(false)
    }
  }

  async function setStatus(b, status) {
    const newStatus = verified.get(b.key) === status ? null : status // re-clic = annule
    const next = new Map(verified)
    if (newStatus) next.set(b.key, newStatus); else next.delete(b.key)
    setVerified(next)
    try {
      if (newStatus) await setRapproVerified({ txnKey: b.key, amount: b.amt, txnDate: isoOf(b.dateStr), userId: user?.id, status: newStatus })
      else await unsetRapproVerified(b.key)
    } catch (e) {
      setVerified(verified)
      toast.error('Erreur : ' + e.message + "\n(As-tu lancé la ligne SQL caisse_rappro_verifies ?)")
    }
  }

  async function exportXlsx() {
    if (!res) return
    const XLSX = await ensureXLSX()
    const wb = XLSX.utils.book_new()
    const srows = [['Date', 'Heure', 'Heure caisse', 'Montant (dh)', 'Réseau', 'Tapé en caisse comme', 'Vérifié'],
      ...res.suspects.slice().sort((a, b) => a.t - b.t).map(b => [b.dateStr, b.heureStr, b.odooHeure, b.amt, b.sys, LABEL[b.m] || b.m, verified.get(b.key) || ''])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(srows), 'Suspects')
    const irows = [['Date', 'Heure', 'Montant (dh)', 'Réseau', 'Classement'],
      ...res.intro.slice().sort((a, b) => a.t - b.t).map(b => [b.dateStr, b.heureStr, b.amt, b.sys, b.cls])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(irows), 'Introuvables')
    const drows = [['Jour', 'Carte relevé (dh)', 'Carte caisse Odoo (dh)', 'Écart'],
      ...res.daily.map(d => [frOf(d.date), Math.round(d.bank), Math.round(d.odoo), Math.round(d.gap)])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(drows), 'Résumé par jour')
    XLSX.writeFile(wb, `rapprochement_${res.from}_${res.to}.xlsx`)
  }

  const q = search.trim()
  const dateMatch = b => { const iso = isoOf(b.dateStr); if (day) return iso === day; if (month) return iso.startsWith(month); return true }
  const flt = list => list.filter(b => (!q || String(b.amt).includes(q)) && dateMatch(b))
  const suspF = res ? flt(res.suspects) : []
  const introF = res ? flt(res.intro) : []
  const reverseF = res ? flt(res.reverse) : []
  const ledgerCounts = res ? flt(res.ledger) : []        // filtré (sans hideOk) → sert aux compteurs
  const ledgerF = ledgerCounts.filter(r => !hideOk || r.status !== 'ok')
  const okF = ledgerCounts.filter(r => r.status === 'ok').length
  const totalF = ledgerCounts.filter(r => r.cmiAmt != null).length
  const onlineRows = ledgerCounts.filter(r => r.online)  // détail des paiements en ligne (filtré)
  const splitsF = res ? res.splits.filter(sp => sp.parts.some(p => (!q || String(p.amt).includes(q)) && dateMatch(p))) : []
  const dailyF = res ? res.daily.filter(d => (!day || d.date === day) && (!month || d.date.startsWith(month))) : []
  // Écart par ligne (caisse − relevé) : une carte Odoo sans relevé = +, une carte
  // au relevé absente/tapée autrement = −. Les lignes marquées « justifié »
  // sortent de l'écart ; « refusé » (ou non traité) y reste.
  // Cartes reliées à la main (kind='link') : on sort de l'écart la carte CMI ET le paiement Odoo lié.
  const linkedOdoo = new Set([...links.values()].filter(l => l.kind === 'link' && l.odooRef).map(l => l.odooRef))
  const isLinked = r => links.get(r.key)?.kind === 'link' || linkedOdoo.has(r.key)
  const lineGap = r => (verified.get(r.key) === 'justifie' || isLinked(r)) ? 0
    : r.status === 'odoo-only' ? r.odooAmt
      : (r.status === 'cmi-only' || r.status === 'mismatch') ? -r.cmiAmt : 0
  const dayGap = {}
  if (res) for (const r of res.ledger) { const c = lineGap(r); if (c) dayGap[r.dateStr] = Math.round(((dayGap[r.dateStr] || 0) + c) * 100) / 100 }
  const gapNow = res ? Math.round(res.ledger.reduce((s, r) => dateMatch(r) ? s + lineGap(r) : s, 0)) : 0 // écart carte (caisse − relevé) sur la période filtrée
  const months = res ? [...new Set(res.daily.map(d => d.date.slice(0, 7)))] : []
  const dayOptions = res ? res.daily.map(d => d.date).filter(d => !month || d.startsWith(month)) : []
  const suspAmt = suspF.reduce((s, b) => s + b.amt, 0)
  const nbVerif = suspF.filter(b => verified.get(b.key)).length
  const suspByMethod = suspF.reduce((acc, s) => { acc[s.m] = (acc[s.m] || 0) + 1; return acc }, {})

  return (
    <div className="max-w-[920px]">
      <h2 className="font-fraunces italic text-[22px] text-ink mb-1">Rapprochement bancaire</h2>
      <p className="text-[13px] text-ink-mute mb-4">
        Dépose les relevés carte CMI : les <b>.xlsx</b> (avec l'heure) <b>et</b> les <b>.pdf</b> (complets). Le PDF sert à rajouter
        les lignes que CMI oublie parfois dans l'Excel. Tu peux déposer en plusieurs fois : ça <b>s'accumule</b> et c'est <b>sauvegardé</b>.
        Le tout est comparé aux ventes de la caisse (Odoo) et chaque carte enregistrée autrement qu'en « Carte » est signalée.
      </p>

      <label
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={e => { e.preventDefault(); setOver(false) }}
        onDrop={e => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }}
        className={`block border-2 border-dashed rounded-2xl bg-cream-warm p-9 text-center cursor-pointer transition-colors ${over ? 'border-bordeaux' : 'border-line hover:border-bordeaux'}`}
      >
        <div className="text-[17px] font-semibold text-ink mb-1.5">📂 Glisse tes relevés ici, ou clique pour choisir</div>
        <div className="text-[13px] text-ink-mute">Fichiers .xlsx et .pdf — les nouveaux dépôts <b>s'ajoutent</b> aux précédents</div>
        <span className="inline-block mt-3.5 bg-bordeaux hover:bg-bordeaux-deep text-white rounded-full px-5 py-2.5 text-[12px] font-semibold tracking-wider uppercase">
          {busy ? 'Analyse…' : (fileNames.length ? 'Ajouter des fichiers' : 'Choisir des fichiers')}
        </span>
        <input type="file" accept=".xlsx,.xls,.pdf" multiple className="hidden" disabled={busy}
          onChange={e => onFiles(e.target.files)} />
      </label>

      {fileNames.length > 0 && (
        <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
          <div className="text-[12px] text-ink-mute">📄 {fileNames.length} fichier{fileNames.length > 1 ? 's' : ''} chargé{fileNames.length > 1 ? 's' : ''} · sauvegardé localement (reste après rafraîchissement)</div>
          <div className="flex gap-2">
            <button onClick={() => analyze(fileNames, { useCache: false })} disabled={busy} className="px-3 py-1.5 rounded-lg border border-line text-ink-soft hover:border-bordeaux hover:text-bordeaux text-[12px] font-semibold disabled:opacity-50">🔄 Actualiser (Odoo)</button>
            <button onClick={reset} disabled={busy} className="px-3 py-1.5 rounded-lg border border-line text-ink-soft hover:border-bordeaux hover:text-bordeaux text-[12px] font-semibold disabled:opacity-50">↺ Réinitialiser</button>
          </div>
        </div>
      )}

      {err && <div className="mt-4 rounded-xl border border-danger/30 bg-danger-bg text-danger p-3 text-[13px]">⚠️ {err}</div>}

      {res && (
        <div className="mt-5">
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <div className="bg-cream-warm border border-line rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-ink">{totalF}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">cartes dans le relevé</div>
            </div>
            <div className="bg-cream-warm border border-line rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-success">{okF}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">✅ retrouvées en carte</div>
            </div>
            <div className="bg-danger-bg border border-danger/20 rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-danger">{suspF.length}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">🚨 tapées autrement · ~{fmt(suspAmt)} dh{nbVerif ? ` · ${nbVerif} vérifié${nbVerif > 1 ? 's' : ''}` : ''}</div>
            </div>
            <div className="bg-warn-bg border border-warn/30 rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-warn-ink">{introF.length}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">❔ introuvables ±20 min</div>
            </div>
            <div className="bg-cream-warm border border-line rounded-2xl p-4">
              <div className={`font-fraunces text-[30px] font-semibold leading-none ${gapNow < 0 ? 'text-danger' : 'text-ink'}`}>{gapNow >= 0 ? '+' : ''}{fmt(gapNow)} dh</div>
              <div className="text-[12px] text-ink-mute mt-1.5">⚖️ écart carte (caisse − relevé)</div>
            </div>
          </div>

          <div className="text-[12px] text-ink-mute mb-4">💳 Commissions CMI sur la période : <b className="text-ink">{fmt(res.commission)} dh</b> (sur {fmt(res.totalBrut)} dh encaissés)</div>

          {res.pdfAdded > 0 && (
            <div className="text-[12px] text-warn-ink bg-warn-bg border border-warn/30 rounded-lg px-3 py-2 mb-4">
              🧩 <b>{res.pdfAdded}</b> ligne{res.pdfAdded > 1 ? 's' : ''} oubliée{res.pdfAdded > 1 ? 's' : ''} par l'Excel a{res.pdfAdded > 1 ? 'ont' : ''} été récupérée{res.pdfAdded > 1 ? 's' : ''} depuis le PDF (matchée{res.pdfAdded > 1 ? 's' : ''} par jour, sans l'heure).
            </div>
          )}

          <div className="flex gap-1 mb-4 p-1 bg-cream-deep rounded-lg w-fit">
            {[['detail', '📋 Détail (CMI ↔ Odoo)'], ['jour', '📊 Résumé par jour'], ['alier', '🔗 À lier']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${view === v ? 'bg-bordeaux text-white' : 'text-ink-soft hover:text-bordeaux'}`}>{l}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher un montant (ex. 145)"
              className="flex-1 min-w-[180px] px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
            />
            {view === 'detail' && (
              <label className="flex items-center gap-1.5 text-[12px] text-ink-soft px-2 cursor-pointer select-none">
                <input type="checkbox" checked={hideOk} onChange={e => setHideOk(e.target.checked)} /> Cacher les correspondances parfaites
              </label>
            )}
            {months.length > 1 && (
              <select value={month} onChange={e => { setMonth(e.target.value); setDay('') }}
                className="px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux">
                <option value="">Tous les mois</option>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            )}
            <select value={day} onChange={e => setDay(e.target.value)}
              className="px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux">
              <option value="">Tous les jours</option>
              {dayOptions.map(d => <option key={d} value={d}>{frOf(d)}</option>)}
            </select>
            <button onClick={exportXlsx} className="px-4 py-2 text-[12px] font-semibold tracking-wider uppercase bg-ink text-white rounded-lg hover:opacity-90">
              ⬇︎ Export Excel
            </button>
          </div>

          {view === 'alier' && (() => {
            const cmiOnly = ledgerCounts.filter(r => r.status === 'cmi-only')
            const odooOnly = (res.ledger || []).filter(r => r.status === 'odoo-only')
            const refreshLinks = () => loadRapproLinks().then(setLinks).catch(() => {})
            return (
              <div className="bg-cream-warm border border-line rounded-2xl p-[18px]">
                <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🔗 Cartes à lier</h3>
                <p className="text-[13px] text-ink-mute mb-3">Cartes du relevé CMI <b>non trouvées</b> dans Odoo. <b>Relie</b>-les au bon paiement Odoo, ou marque-les <b>à régulariser</b>.</p>
                {cmiOnly.length === 0 ? <p className="text-[13px] text-ink-mute italic">Aucune carte à lier 🎉</p> : (
                  <div className="space-y-2">
                    {cmiOnly.map(r => {
                      const lk = links.get(r.key)
                      const cands = odooOnly.filter(o => o.amt === r.amt).concat(odooOnly.filter(o => o.amt !== r.amt))
                      return (
                        <div key={r.key} className="bg-cream border border-line rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-[13px] text-ink"><b>{fmt(r.amt)} dh</b> · {r.dateStr}{r.heureStr !== '—' ? ' · ' + r.heureStr : ''}{r.online ? ' · 🌐 en ligne' : ''}</div>
                            {lk ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] text-success">{lk.kind === 'link' ? '✓ Relié à Odoo' : '📝 À régulariser' + (lk.note ? ' · ' + lk.note : '')}</span>
                                <button onClick={async () => { await unsetRapproLink(r.key); refreshLinks() }} className="text-[11px] text-danger underline">annuler</button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button onClick={() => setLinkFor(linkFor === r.key ? null : r.key)} className="px-2.5 py-1 rounded-md bg-bordeaux text-white text-[11px] font-semibold">🔗 Relier</button>
                                <button onClick={async () => { const note = window.prompt('Note (à régulariser) :', ''); if (note === null) return; await setRapproLink({ cmiKey: r.key, kind: 'regul', amount: r.amt, txnDate: isoOf(r.dateStr), note, userId: user?.id }); refreshLinks() }} className="px-2.5 py-1 rounded-md border border-line text-ink-soft text-[11px] font-semibold">📝 À régulariser</button>
                              </div>
                            )}
                          </div>
                          {!lk && linkFor === r.key && (
                            <div className="mt-2 border-t border-line pt-2">
                              <div className="text-[11px] text-ink-mute mb-1">Choisis le paiement Odoo correspondant :</div>
                              {cands.length === 0 ? <div className="text-[12px] text-ink-mute italic">Aucun paiement Odoo non rapproché.</div> : (
                                <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                                  {cands.slice(0, 30).map((o, i) => (
                                    <button key={i} onClick={async () => { await setRapproLink({ cmiKey: r.key, kind: 'link', amount: r.amt, txnDate: isoOf(r.dateStr), odooRef: o.key, userId: user?.id }); setLinkFor(null); refreshLinks() }}
                                      className={`text-left text-[12px] px-2 py-1 rounded border ${o.amt === r.amt ? 'border-success/40' : 'border-line'} bg-cream-warm hover:border-bordeaux`}>
                                      {fmt(o.amt)} dh · {o.odooDate || o.dateStr} {o.odooHeure || o.heureStr}{o.ref ? ' · ' + o.ref : ''}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {view === 'detail' && (
            <div className="bg-cream-warm border border-line rounded-2xl p-[18px]">
              <h3 className="font-fraunces italic text-[20px] text-ink mb-1">📋 Détail ligne par ligne (CMI ↔ Odoo)</h3>
              <p className="text-[13px] text-ink-mute mb-3">Chaque ligne du relevé et chaque vente carte Odoo, côte à côte, triées par jour et heure. Côté vide = pas de correspondance.</p>
              <LedgerTable list={ledgerF} dayGap={dayGap} verified={verified} onSetStatus={setStatus} />
            </div>
          )}

          {view === 'jour' && (
            <div className="bg-cream-warm border border-line rounded-2xl p-[18px]">
              <h3 className="font-fraunces italic text-[20px] text-ink mb-1">📊 Résumé par jour</h3>
              <p className="text-[13px] text-ink-mute mb-2">Total carte du relevé vs total carte enregistré dans la caisse (Odoo), par journée. Utilise les filtres mois/jour ci-dessus.</p>
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="text-ink-mute text-[11px] uppercase tracking-wider">
                    <th className="text-left font-semibold py-1.5 px-2 border-b border-line">Jour</th>
                    <th className="text-right font-semibold py-1.5 px-2 border-b border-line">Carte relevé</th>
                    <th className="text-right font-semibold py-1.5 px-2 border-b border-line">Carte caisse (Odoo)</th>
                    <th className="text-right font-semibold py-1.5 px-2 border-b border-line">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyF.map(d => {
                    const gap = dayGap[frOf(d.date)] || 0
                    return (
                      <tr key={d.date}>
                        <td className="py-2 px-2 border-b border-cream-deep">{frOf(d.date)}</td>
                        <td className="py-2 px-2 border-b border-cream-deep text-right tabular-nums">{fmt(d.bank)} dh</td>
                        <td className="py-2 px-2 border-b border-cream-deep text-right tabular-nums">{fmt(d.odoo)} dh</td>
                        <td className={`py-2 px-2 border-b border-cream-deep text-right tabular-nums font-semibold ${gap < 0 ? 'text-danger' : 'text-ink-mute'}`}>{gap >= 0 ? '+' : ''}{fmt(gap)} dh</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* Détail du total carte Odoo du jour, par caisse → pour voir si plusieurs caisses s'additionnent. */}
              {day && dailyF[0] && Object.keys(dailyF[0].posBreak).length > 0 && (
                <div className="mt-4 border-t border-line pt-3 text-[13px]">
                  <div className="text-[12px] font-semibold text-ink mb-1">🔎 « Carte caisse (Odoo) » du {frOf(day)} par caisse :</div>
                  {Object.entries(dailyF[0].posBreak).sort((a, b) => b[1] - a[1]).map(([pos, amt]) => (
                    <div key={pos} className="flex justify-between py-0.5 border-b border-cream-deep">
                      <span className="text-ink-soft">{pos}</span>
                      <span className="tabular-nums">{fmt(Math.round(amt))} dh</span>
                    </div>
                  ))}
                  {Object.keys(dailyF[0].posBreak).length > 1 && (
                    <div className="text-[11px] text-ink-mute mt-2">➡️ Plusieurs caisses s'additionnent : ton total Odoo ne couvre peut-être qu'une seule d'entre elles.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'synthese' && (
          <>
          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🚨 Payées par carte, mais tapées autrement ({suspF.length})</h3>
            {suspF.length ? (
              <>
                <p className="text-[13px] text-ink-mute mb-3">Une carte est passée à la banque, et au même moment la caisse a enregistré le même montant sous une autre méthode. Heure caisse = heure du ticket dans Odoo.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(suspByMethod).map(([k, v]) => (
                    <span key={k} className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold text-ink">{LABEL[k] || k} : {v}</span>
                  ))}
                </div>
                <details>
                  <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                  <div className="mt-2"><GroupedTable list={suspF} odooHeure methodCol verified={verified} onSetStatus={setStatus} /></div>
                </details>
              </>
            ) : (
              <p className="text-[13px] text-ink-mute">Aucune carte enregistrée autrement (espèces / chèque / compte client…) pour ce filtre. 🎉</p>
            )}
          </div>

          {splitsF.length > 0 && (
            <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
              <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🔗 Paiements partagés ({splitsF.length})</h3>
              <p className="text-[13px] text-ink-mute mb-2">Un ticket payé en plusieurs cartes : Odoo a un seul montant, la banque en a plusieurs qui s'additionnent. Réconciliés automatiquement.</p>
              <details>
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                <div className="flex flex-col gap-1.5 mt-2">
                  {splitsF.slice().sort((a, b) => isoOf(a.dateStr).localeCompare(isoOf(b.dateStr))).map((sp, i) => (
                    <div key={i} className="text-[13px] bg-cream-deep rounded-lg px-3 py-2">
                      <span className="text-ink-mute">📅 {sp.dateStr} · {sp.odooHeure} — </span>
                      <b className="text-success">{fmt(sp.amount)} dh</b>
                      <span className="text-ink"> = {sp.parts.slice().sort((a, b) => b.amt - a.amt).map(p => fmt(p.amt)).join(' + ')}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">❔ Introuvables à ±20 min ({introF.length})</h3>
            <p className="text-[13px] text-ink-mute mb-2">Pas de vente du même montant à l'heure proche. La colonne « Classement » dit ce qu'on a trouvé en cherchant à ±3 jours.</p>
            {introF.length > 0 && (
              <details>
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                <div className="mt-2"><GroupedTable list={introF} clsCol /></div>
              </details>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🔄 Cartes dans Odoo, absentes du relevé ({reverseF.length})</h3>
            <p className="text-[13px] text-ink-mute mb-2">Ventes notées « Carte » dans la caisse, sans paiement carte correspondant dans le relevé. ⚠️ Fiable seulement si tu as déposé <b>tous</b> les relevés du mois ; inclut le en-ligne s'il n'y est pas.</p>
            {reverseF.length > 0 && (
              <details>
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                <div className="mt-2"><GroupedTable list={reverseF} /></div>
              </details>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px]">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🌐 Paiements en ligne (STAN 6 chiffres) — {onlineRows.length}</h3>
            <p className="text-[13px] text-ink-mute mb-2">Recherchés à ±3 jours (confirmés en caisse plus tard).</p>
            <div className="flex flex-wrap gap-2">
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">✅ carte : {onlineRows.filter(r => r.status === 'ok').length}</span>
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">🚨 autre méthode : {onlineRows.filter(r => r.status === 'mismatch').length}</span>
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">❔ sans trace : {onlineRows.filter(r => r.status === 'cmi-only').length}</span>
            </div>
            {onlineRows.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail de chaque paiement</summary>
                <div className="mt-2"><LedgerTable list={onlineRows} verified={verified} onSetStatus={setStatus} /></div>
              </details>
            )}
          </div>
          </>
          )}
        </div>
      )}
    </div>
  )
}
