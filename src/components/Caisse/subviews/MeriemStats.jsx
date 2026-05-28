import { useState, useEffect } from 'react'
import { loadCategoryStats } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney } from '../_helpers'

export default function MeriemStats() {
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [stats, setStats] = useState({})

  useEffect(() => {
    (async () => { try { setStats(await loadCategoryStats(year, month)) } catch (e) { console.error(e) } })()
  }, [year, month])

  const rows = Object.entries(stats).map(([cat, v]) => ({ cat, ...v })).sort((a, b) => b.total - a.total)
  const totals = rows.reduce((t, r) => ({ meriem: t.meriem + r.meriem, hamid: t.hamid + r.hamid, pions: t.pions + r.pions, total: t.total + r.total }), { meriem: 0, hamid: 0, pions: 0, total: 0 })

  return (
    <div>
      <div style={{ background: '#F4F0EA', color: '#4a3a30', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
        ℹ️ Dépenses réelles par catégorie (l'argent confié — avances Hamid/courses — n'est pas compté ; seule la dépense réelle l'est).
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={{
            padding: '8px 16px', borderRadius: 999,
            border: month === m.idx ? '1px solid #993556' : '1px solid #e5d8c3',
            background: month === m.idx ? '#993556' : 'white', color: month === m.idx ? '#faf7f2' : '#1a0f0a',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{m.label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 8, fontSize: 13 }}>Aucune dépense ce mois.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '0.5px solid #e5d8c3', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F4F0EA', color: '#1a0f0a' }}>
                <th style={{ ...th, textAlign: 'left' }}>Catégorie</th>
                <th style={th}>Meriem</th>
                <th style={th}>Hamid</th>
                <th style={th}>Pions</th>
                <th style={{ ...th, fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.cat} style={{ borderTop: '0.5px solid #efe7d8' }}>
                  <td style={{ ...td, textAlign: 'left' }}>{r.cat}</td>
                  <td style={td}>{r.meriem ? fmtMoney(r.meriem) : '—'}</td>
                  <td style={td}>{r.hamid ? fmtMoney(r.hamid) : '—'}</td>
                  <td style={td}>{r.pions ? fmtMoney(r.pions) : '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1.5px solid #1a0f0a', background: '#faf7f2' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>TOTAL</td>
                <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(totals.meriem)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(totals.hamid)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(totals.pions)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const th = { padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600 }
const td = { padding: '9px 12px', textAlign: 'right', color: '#1a0f0a' }
