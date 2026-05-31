import { useState, useEffect, Fragment } from 'react'
import { loadRapproVerifies, setRapproVerified, unsetRapproVerified } from '../../lib/caisse'

// Rapprochement bancaire : on dépose un ou plusieurs relevés carte (CMI .xlsx),
// on les compare aux paiements POS d'Odoo (lus en direct via
// /api/caisse-api?action=pos-payments) et on signale chaque carte enregistrée
// en caisse autrement qu'en « Carte ».

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
    heure: col('heure'), stan: col('stan'), montant: col('montant brut'), net: col('montant net'), sys: col('systeme'),
  }
  const num = x => parseFloat(String(x).replace(',', '.')) || 0
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
    const dateStr = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
    bank.push({ t, amt, net, online: stan.length === 6, sys: String(r[ci.sys] || ''), heureStr: heure, dateStr, key: `${dateStr}|${heure}|${amt}|${stan}` })
  }
  if (!bank.length) throw new Error("Aucune ligne de paiement lue dans le fichier.")
  return bank
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

function runMatch(bank, raw) {
  const odoo = raw.map(a => ({ a: a[0], t: a[1], c: a[2], used: false }))
  const byAmt = new Map()
  for (const p of odoo) { if (!byAmt.has(p.a)) byAmt.set(p.a, []); byAmt.get(p.a).push(p) }
  const OFF = detectOffset(bank, byAmt)
  const W = 20 * 60e3, D3 = 3 * 86400e3
  const tpe = bank.filter(b => !b.online), onl = bank.filter(b => b.online)

  let okC = 0; const suspects = [], intro = []
  for (const b of tpe) {
    const cands = (byAmt.get(b.amt) || []).filter(p => !p.used && Math.abs(p.t - (b.t + OFF)) <= W)
    const cartes = cands.filter(p => p.c === 'c')
    const pool = cartes.length ? cartes : cands
    let best = null
    for (const p of pool) { const d = Math.abs(p.t - (b.t + OFF)); if (!best || d < best.d) best = { p, d } }
    if (best) { best.p.used = true; if (best.p.c === 'c') okC++; else suspects.push({ ...b, m: best.p.c, odooHeure: hhmm(best.p.t - OFF) }) }
    else {
      // Classement : cherche le même montant à ±3 jours pour comprendre.
      let fc = false, other = null
      for (const p of (byAmt.get(b.amt) || [])) { if (Math.abs(p.t - (b.t + OFF)) <= D3) { if (p.c === 'c') fc = true; else if (!other) other = p.c } }
      intro.push({ ...b, cls: fc ? 'online' : other || 'none' })
    }
  }

  let oOk = 0; const oSusp = [], oNone = []
  for (const b of onl) {
    const cands = (byAmt.get(b.amt) || []).filter(p => !p.used && Math.abs(p.t - (b.t + OFF)) <= D3)
    const carte = cands.find(p => p.c === 'c')
    if (carte) { carte.used = true; oOk++ }
    else { const other = cands.find(p => p.c !== 'c'); if (other) { other.used = true; oSusp.push({ ...b, m: other.c }) } else oNone.push(b) }
  }

  // Résumé par jour : carte relevé vs carte Odoo
  const dayBank = {}, dayOdoo = {}
  for (const b of bank) { const d = isoOf(b.dateStr); dayBank[d] = (dayBank[d] || 0) + b.amt }
  for (const p of odoo) if (p.c === 'c') { const d = new Date(p.t - OFF).toISOString().slice(0, 10); dayOdoo[d] = (dayOdoo[d] || 0) + p.a }
  const days = [...new Set(bank.map(b => isoOf(b.dateStr)))].sort()
  const daily = days.map(d => ({ date: d, bank: dayBank[d] || 0, odoo: dayOdoo[d] || 0 }))

  // Sens inverse : cartes notées dans Odoo mais sans paiement carte dans le relevé
  // (sur la plage de jours du relevé seulement).
  const minDay = days[0], maxDay = days[days.length - 1]
  const reverse = []
  for (const p of odoo) {
    if (p.c !== 'c' || p.used) continue
    const loc = new Date(p.t - OFF), iso = loc.toISOString().slice(0, 10)
    if (iso < minDay || iso > maxDay) continue
    reverse.push({ t: p.t - OFF, amt: p.a, sys: 'Carte', heureStr: loc.toISOString().slice(11, 19), dateStr: frOf(iso), key: `odoo|${iso}|${p.t}|${p.a}` })
  }
  reverse.sort((a, b) => a.t - b.t)

  const totalBrut = bank.reduce((s, b) => s + b.amt, 0)
  const totalNet = bank.reduce((s, b) => s + b.net, 0)

  const times = bank.map(b => b.t)
  return {
    total: bank.length, okC, suspects, intro, onl, oOk, oSusp, oNone, daily, reverse,
    commission: Math.round((totalBrut - totalNet) * 100) / 100, totalBrut: Math.round(totalBrut),
    from: new Date(Math.min(...times)).toISOString().slice(0, 10),
    to: new Date(Math.max(...times)).toISOString().slice(0, 10),
  }
}

// Tableau regroupé par jour, avec sous-total. Colonnes selon le mode.
function GroupedTable({ list, odooHeure, methodCol, clsCol, verified, onToggle }) {
  const groups = {}
  for (const b of list) (groups[b.dateStr] = groups[b.dateStr] || []).push(b)
  const days = Object.keys(groups).sort((a, b) => isoOf(a).localeCompare(isoOf(b)))
  const headers = ['Heure', odooHeure && 'Heure caisse', 'Montant', 'Réseau', methodCol && 'Tapé en caisse comme', clsCol && 'Classement', onToggle && ''].filter(Boolean)
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
                const done = verified && verified.has(b.key)
                return (
                  <tr key={day + '-' + i} className={done ? 'opacity-50 line-through' : ''}>
                    <td className="py-2 px-2 border-b border-cream-deep">{b.heureStr}</td>
                    {odooHeure && <td className="py-2 px-2 border-b border-cream-deep text-ink-mute">{b.odooHeure}</td>}
                    <td className="py-2 px-2 border-b border-cream-deep font-semibold tabular-nums">{fmt(b.amt)} dh</td>
                    <td className="py-2 px-2 border-b border-cream-deep">{b.sys}</td>
                    {methodCol && <td className="py-2 px-2 border-b border-cream-deep"><span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger-bg text-danger">{LABEL[b.m] || b.m}</span></td>}
                    {clsCol && <td className="py-2 px-2 border-b border-cream-deep text-ink-mute text-[12px]">{clsLabel(b.cls)}</td>}
                    {onToggle && (
                      <td className="py-2 px-2 border-b border-cream-deep">
                        <button onClick={() => onToggle(b)} className={`px-2 py-1 rounded-md text-[11px] font-semibold no-underline ${done ? 'bg-cream-deep text-ink-mute' : 'bg-success-bg text-success'}`}>
                          {done ? 'Annuler' : '✓ Vérifié'}
                        </button>
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

export default function RapprochementView({ user }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState(null)
  const [fileNames, setFileNames] = useState([])
  const [over, setOver] = useState(false)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [verified, setVerified] = useState(new Set())

  useEffect(() => { loadRapproVerifies().then(setVerified).catch(() => {}) }, [])

  async function onFiles(fileList) {
    const arr = Array.from(fileList || [])
    if (!arr.length) return
    setErr(''); setRes(null); setBusy(true); setSearch(''); setFileNames(arr.map(f => f.name))
    try {
      const XLSX = await ensureXLSX()
      let bank = []
      for (const file of arr) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        bank = bank.concat(parseBank(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })))
      }
      const seen = new Set()
      bank = bank.filter(b => { if (seen.has(b.key)) return false; seen.add(b.key); return true })
      const times = bank.map(b => b.t)
      const from = new Date(Math.min(...times) - 3 * 86400e3).toISOString().slice(0, 10)
      const to = new Date(Math.max(...times) + 3 * 86400e3).toISOString().slice(0, 10)
      const r = await fetch(`/api/caisse-api?action=pos-payments&from=${from}&to=${to}`, { method: 'POST' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `Erreur serveur ${r.status}`)
      setRes(runMatch(bank, data.payments || []))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleVerified(b) {
    const has = verified.has(b.key)
    const next = new Set(verified)
    if (has) next.delete(b.key); else next.add(b.key)
    setVerified(next)
    try {
      if (has) await unsetRapproVerified(b.key)
      else await setRapproVerified({ txnKey: b.key, amount: b.amt, txnDate: isoOf(b.dateStr), userId: user?.id })
    } catch (e) {
      setVerified(verified)
      alert('Erreur : ' + e.message + "\n(As-tu lancé la ligne SQL caisse_rappro_verifies ?)")
    }
  }

  async function exportXlsx() {
    if (!res) return
    const XLSX = await ensureXLSX()
    const wb = XLSX.utils.book_new()
    const srows = [['Date', 'Heure', 'Heure caisse', 'Montant (dh)', 'Réseau', 'Tapé en caisse comme', 'Vérifié'],
      ...res.suspects.slice().sort((a, b) => a.t - b.t).map(b => [b.dateStr, b.heureStr, b.odooHeure, b.amt, b.sys, LABEL[b.m] || b.m, verified.has(b.key) ? 'oui' : ''])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(srows), 'Suspects')
    const irows = [['Date', 'Heure', 'Montant (dh)', 'Réseau', 'Classement'],
      ...res.intro.slice().sort((a, b) => a.t - b.t).map(b => [b.dateStr, b.heureStr, b.amt, b.sys, b.cls])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(irows), 'Introuvables')
    const drows = [['Jour', 'Carte relevé (dh)', 'Carte caisse Odoo (dh)', 'Écart'],
      ...res.daily.map(d => [frOf(d.date), Math.round(d.bank), Math.round(d.odoo), Math.round(d.odoo - d.bank)])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(drows), 'Résumé par jour')
    XLSX.writeFile(wb, `rapprochement_${res.from}_${res.to}.xlsx`)
  }

  const q = search.trim()
  const dateMatch = b => { const iso = isoOf(b.dateStr); if (day) return iso === day; if (month) return iso.startsWith(month); return true }
  const flt = list => list.filter(b => (!q || String(b.amt).includes(q)) && dateMatch(b))
  const suspF = res ? flt(res.suspects) : []
  const introF = res ? flt(res.intro) : []
  const reverseF = res ? flt(res.reverse) : []
  const months = res ? [...new Set(res.daily.map(d => d.date.slice(0, 7)))] : []
  const dayOptions = res ? res.daily.map(d => d.date).filter(d => !month || d.startsWith(month)) : []
  const suspAmt = res ? res.suspects.reduce((s, b) => s + b.amt, 0) : 0
  const nbVerif = res ? res.suspects.filter(b => verified.has(b.key)).length : 0
  const suspByMethod = res ? res.suspects.reduce((acc, s) => { acc[s.m] = (acc[s.m] || 0) + 1; return acc }, {}) : {}

  return (
    <div className="max-w-[920px]">
      <h2 className="font-fraunces italic text-[22px] text-ink mb-1">Rapprochement bancaire</h2>
      <p className="text-[13px] text-ink-mute mb-4">
        Dépose un ou plusieurs relevés carte (CMI, .xlsx). Ils sont comparés aux ventes de la caisse (Odoo) et chaque carte
        enregistrée autrement qu'en « Carte » (espèces, chèque, compte client, virement…) est signalée.
      </p>

      <label
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={e => { e.preventDefault(); setOver(false) }}
        onDrop={e => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }}
        className={`block border-2 border-dashed rounded-2xl bg-cream-warm p-9 text-center cursor-pointer transition-colors ${over ? 'border-bordeaux' : 'border-line hover:border-bordeaux'}`}
      >
        <div className="text-[17px] font-semibold text-ink mb-1.5">📂 Glisse tes relevés ici, ou clique pour choisir</div>
        <div className="text-[13px] text-ink-mute">Un ou plusieurs fichiers .xlsx (ex. relevé -1, -2, -3 du mois)</div>
        <span className="inline-block mt-3.5 bg-bordeaux hover:bg-bordeaux-deep text-white rounded-full px-5 py-2.5 text-[12px] font-semibold tracking-wider uppercase">
          {busy ? 'Analyse…' : 'Choisir des fichiers'}
        </span>
        <input type="file" accept=".xlsx,.xls" multiple className="hidden" disabled={busy}
          onChange={e => onFiles(e.target.files)} />
        {fileNames.length > 0 && <div className="text-[12px] text-ink-mute mt-3">📄 {fileNames.join(' · ')}</div>}
      </label>

      {err && <div className="mt-4 rounded-xl border border-danger/30 bg-danger-bg text-danger p-3 text-[13px]">⚠️ {err}</div>}

      {res && (
        <div className="mt-5">
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <div className="bg-cream-warm border border-line rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-ink">{res.total}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">cartes dans le relevé</div>
            </div>
            <div className="bg-cream-warm border border-line rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-success">{res.okC}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">✅ retrouvées en carte (magasin)</div>
            </div>
            <div className="bg-danger-bg border border-danger/20 rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-danger">{res.suspects.length}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">🚨 tapées autrement · ~{fmt(suspAmt)} dh{nbVerif ? ` · ${nbVerif} vérifié${nbVerif > 1 ? 's' : ''}` : ''}</div>
            </div>
            <div className="bg-warn-bg border border-warn/30 rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-warn-ink">{res.intro.length}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">❔ introuvables ±20 min</div>
            </div>
          </div>

          <div className="text-[12px] text-ink-mute mb-4">💳 Commissions CMI sur la période : <b className="text-ink">{fmt(res.commission)} dh</b> (sur {fmt(res.totalBrut)} dh encaissés)</div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher un montant (ex. 145)"
              className="flex-1 min-w-[180px] px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
            />
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

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🚨 Payées par carte, mais tapées autrement</h3>
            {res.suspects.length ? (
              <>
                <p className="text-[13px] text-ink-mute mb-3">Une carte est passée à la banque, et au même moment la caisse a enregistré le même montant sous une autre méthode. Heure caisse = heure du ticket dans Odoo, pour le retrouver vite.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(suspByMethod).map(([k, v]) => (
                    <span key={k} className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold text-ink">{LABEL[k] || k} : {v}</span>
                  ))}
                </div>
                {suspF.length ? <GroupedTable list={suspF} odooHeure methodCol verified={verified} onToggle={toggleVerified} /> : <p className="text-[13px] text-ink-mute italic">Aucun suspect pour « {q} ».</p>}
              </>
            ) : (
              <p className="text-[13px] text-ink-mute">Aucune carte enregistrée autrement (espèces / chèque / compte client…) sur ce relevé. 🎉</p>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">❔ Introuvables à ±20 min ({res.intro.length})</h3>
            <p className="text-[13px] text-ink-mute mb-2">Pas de vente du même montant à l'heure proche. La colonne « Classement » dit ce qu'on a trouvé en cherchant à ±3 jours.</p>
            {res.intro.length > 0 && (
              <details>
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                <div className="mt-2">{introF.length ? <GroupedTable list={introF} clsCol /> : <p className="text-[13px] text-ink-mute italic">Rien pour « {q} ».</p>}</div>
              </details>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🔄 Cartes dans Odoo, absentes du relevé ({res.reverse.length})</h3>
            <p className="text-[13px] text-ink-mute mb-2">Ventes notées « Carte » dans la caisse, sans paiement carte correspondant dans le relevé. ⚠️ Fiable seulement si tu as déposé <b>tous</b> les relevés du mois ; inclut les paiements en ligne s'ils ne sont pas dans le relevé déposé.</p>
            {res.reverse.length > 0 && (
              <details>
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                <div className="mt-2">{reverseF.length ? <GroupedTable list={reverseF} /> : <p className="text-[13px] text-ink-mute italic">Rien pour ce filtre.</p>}</div>
              </details>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">📊 Résumé par jour</h3>
            <p className="text-[13px] text-ink-mute mb-2">Total carte du relevé vs total carte enregistré dans la caisse (Odoo), par journée.</p>
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
                {res.daily.map(d => {
                  const gap = d.odoo - d.bank
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
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px]">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🌐 Paiements en ligne (STAN 6 chiffres) — {res.onl.length}</h3>
            <p className="text-[13px] text-ink-mute mb-2">Recherchés à ±3 jours (confirmés en caisse plus tard).</p>
            <div className="flex flex-wrap gap-2">
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">✅ carte : {res.oOk}</span>
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">🚨 autre méthode : {res.oSusp.length}</span>
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">❔ sans trace : {res.oNone.length}</span>
            </div>
            {res.oSusp.length > 0 && <div className="mt-3"><GroupedTable list={res.oSusp} methodCol /></div>}
          </div>
        </div>
      )}
    </div>
  )
}
