import { useState, Fragment } from 'react'

// Rapprochement bancaire : on dépose un ou plusieurs relevés carte (CMI .xlsx),
// on les compare aux paiements POS d'Odoo (lus en direct via
// /api/caisse-api?action=pos-payments) et on signale chaque carte enregistrée
// en caisse autrement qu'en « Carte ».

const LABEL = { e: 'Espèces', k: 'Compte client', q: 'Chèque', v: 'Virement', r: 'Avoir/Crédit', a: 'Autre' }
const norm = s => (s == null ? '' : s.toString()).toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n))
const isoOf = dstr => { const m = dstr.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : dstr }

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
    heure: col('heure'), stan: col('stan'), montant: col('montant brut'), sys: col('systeme'),
  }
  const bank = []
  for (const r of rows.slice(hi + 1)) {
    if (!Array.isArray(r)) continue
    const m = String(r[ci.date] || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!m) continue
    const heure = String(r[ci.heure] || '12:00:00')
    const t = Date.parse(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${heure}Z`)
    const amt = Math.round((parseFloat(String(r[ci.montant]).replace(',', '.')) || 0) * 100) / 100
    if (!amt) continue
    const stan = String(r[ci.stan] || '').replace(/\D/g, '')
    const dateStr = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
    bank.push({ t, amt, online: stan.length === 6, sys: String(r[ci.sys] || ''), heureStr: heure, dateStr, key: `${dateStr}|${heure}|${amt}|${stan}` })
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
    if (best) { best.p.used = true; if (best.p.c === 'c') okC++; else suspects.push({ ...b, m: best.p.c }) }
    else intro.push(b)
  }
  let oOk = 0; const oSusp = [], oNone = []
  for (const b of onl) {
    let fc = false, other = null
    for (const p of (byAmt.get(b.amt) || [])) {
      if (Math.abs(p.t - (b.t + OFF)) <= D3) { if (p.c === 'c') fc = true; else if (!other) other = p.c }
    }
    if (fc) oOk++; else if (other) oSusp.push({ ...b, m: other }); else oNone.push(b)
  }
  const times = bank.map(b => b.t)
  return {
    total: bank.length, okC, suspects, intro, onl, oOk, oSusp, oNone,
    from: new Date(Math.min(...times)).toISOString().slice(0, 10),
    to: new Date(Math.max(...times)).toISOString().slice(0, 10),
  }
}

// Tableau regroupé par jour, avec sous-total par jour.
function GroupedTable({ list, susp }) {
  const groups = {}
  for (const b of list) (groups[b.dateStr] = groups[b.dateStr] || []).push(b)
  const days = Object.keys(groups).sort((a, b) => isoOf(a).localeCompare(isoOf(b)))
  const cols = susp ? 4 : 3
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr className="text-ink-mute text-[11px] uppercase tracking-wider">
          <th className="text-left font-semibold py-1.5 px-2 border-b border-line">Heure</th>
          <th className="text-left font-semibold py-1.5 px-2 border-b border-line">Montant</th>
          <th className="text-left font-semibold py-1.5 px-2 border-b border-line">Réseau</th>
          {susp && <th className="text-left font-semibold py-1.5 px-2 border-b border-line">Tapé en caisse comme</th>}
        </tr>
      </thead>
      <tbody>
        {days.map(day => {
          const items = groups[day].slice().sort((a, b) => a.t - b.t)
          const sum = items.reduce((s, b) => s + b.amt, 0)
          return (
            <Fragment key={day}>
              <tr className="bg-cream-deep">
                <td colSpan={cols} className="py-1.5 px-2 text-[12px] font-semibold text-ink">
                  📅 {day} <span className="text-ink-mute font-normal">— {items.length} ligne{items.length > 1 ? 's' : ''} · {fmt(sum)} dh</span>
                </td>
              </tr>
              {items.map((b, i) => (
                <tr key={day + '-' + i}>
                  <td className="py-2 px-2 border-b border-cream-deep">{b.heureStr}</td>
                  <td className="py-2 px-2 border-b border-cream-deep font-semibold tabular-nums">{fmt(b.amt)} dh</td>
                  <td className="py-2 px-2 border-b border-cream-deep">{b.sys}</td>
                  {susp && <td className="py-2 px-2 border-b border-cream-deep"><span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger-bg text-danger">{LABEL[b.m] || b.m}</span></td>}
                </tr>
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

export default function RapprochementView() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState(null)
  const [fileNames, setFileNames] = useState([])
  const [over, setOver] = useState(false)
  const [search, setSearch] = useState('')

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

  async function exportXlsx() {
    if (!res) return
    const XLSX = await ensureXLSX()
    const wb = XLSX.utils.book_new()
    const shead = ['Date', 'Heure', 'Montant (dh)', 'Réseau', 'Tapé en caisse comme']
    const srows = [shead, ...res.suspects.slice().sort((a, b) => a.t - b.t).map(b => [b.dateStr, b.heureStr, b.amt, b.sys, LABEL[b.m] || b.m])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(srows), 'Suspects')
    const ihead = ['Date', 'Heure', 'Montant (dh)', 'Réseau']
    const irows = [ihead, ...res.intro.slice().sort((a, b) => a.t - b.t).map(b => [b.dateStr, b.heureStr, b.amt, b.sys])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(irows), 'Introuvables')
    XLSX.writeFile(wb, `rapprochement_${res.from}_${res.to}.xlsx`)
  }

  const q = search.trim()
  const flt = list => !q ? list : list.filter(b => String(b.amt).includes(q))
  const suspF = res ? flt(res.suspects) : []
  const introF = res ? flt(res.intro) : []
  const suspAmt = res ? res.suspects.reduce((s, b) => s + b.amt, 0) : 0
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
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
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
              <div className="text-[12px] text-ink-mute mt-1.5">🚨 tapées autrement · ~{fmt(suspAmt)} dh</div>
            </div>
            <div className="bg-warn-bg border border-warn/30 rounded-2xl p-4">
              <div className="font-fraunces text-[30px] font-semibold leading-none text-warn-ink">{res.intro.length}</div>
              <div className="text-[12px] text-ink-mute mt-1.5">❔ introuvables ±20 min</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher un montant (ex. 145)"
              className="flex-1 min-w-[200px] px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
            />
            <button onClick={exportXlsx} className="px-4 py-2 text-[12px] font-semibold tracking-wider uppercase bg-ink text-white rounded-lg hover:opacity-90">
              ⬇︎ Export Excel
            </button>
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🚨 Payées par carte, mais tapées autrement</h3>
            {res.suspects.length ? (
              <>
                <p className="text-[13px] text-ink-mute mb-3">Une carte est passée à la banque, et au même moment la caisse a enregistré le même montant sous une autre méthode. À vérifier dans Odoo.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(suspByMethod).map(([k, v]) => (
                    <span key={k} className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold text-ink">{LABEL[k] || k} : {v}</span>
                  ))}
                </div>
                {suspF.length ? <GroupedTable list={suspF} susp /> : <p className="text-[13px] text-ink-mute italic">Aucun suspect pour « {q} ».</p>}
              </>
            ) : (
              <p className="text-[13px] text-ink-mute">Aucune carte enregistrée autrement (espèces / chèque / compte client…) sur ce relevé. 🎉</p>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px] mb-4">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">❔ Introuvables à ±20 min ({res.intro.length})</h3>
            <p className="text-[13px] text-ink-mute mb-2">Pas de vente du même montant à l'heure proche : montant tapé différemment, paiement partagé, ou décalage &gt; 20 min.</p>
            {res.intro.length > 0 && (
              <details>
                <summary className="cursor-pointer text-bordeaux text-[13px] font-semibold">Voir le détail</summary>
                <div className="mt-2">{introF.length ? <GroupedTable list={introF} /> : <p className="text-[13px] text-ink-mute italic">Rien pour « {q} ».</p>}</div>
              </details>
            )}
          </div>

          <div className="bg-cream-warm border border-line rounded-2xl p-[18px]">
            <h3 className="font-fraunces italic text-[20px] text-ink mb-1">🌐 Paiements en ligne (STAN 6 chiffres) — {res.onl.length}</h3>
            <p className="text-[13px] text-ink-mute mb-2">Recherchés à ±3 jours (confirmés en caisse plus tard).</p>
            <div className="flex flex-wrap gap-2">
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">✅ carte : {res.oOk}</span>
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">🚨 autre méthode : {res.oSusp.length}</span>
              <span className="bg-cream-deep rounded-full px-3 py-1 text-[12px] font-semibold">❔ sans trace : {res.oNone.length}</span>
            </div>
            {res.oSusp.length > 0 && <div className="mt-3"><GroupedTable list={res.oSusp} susp /></div>}
          </div>
        </div>
      )}
    </div>
  )
}
