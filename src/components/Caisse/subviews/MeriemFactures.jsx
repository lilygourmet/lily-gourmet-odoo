import { useState, useEffect } from 'react'
import { loadFacturesAll, loadFacturesStats, recupererFacturesParCheque } from '../../../lib/caisse'
import { currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'

export default function MeriemFactures({ user }) {
  const [year, setYear] = useState(currentYear())
  const [filter, setFilter] = useState('pending')
  const [factures, setFactures] = useState([])
  const [stats, setStats] = useState({ total: 0, recovered: 0, pending: 0, countAll: 0, countPending: 0, countRecovered: 0 })
  const [selected, setSelected] = useState(new Set())
  const [showCheque, setShowCheque] = useState(false)
  const [cheque, setCheque] = useState('')
  const [chequeDate, setChequeDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { reload() }, [year])

  async function reload() {
    const [list, st] = await Promise.all([loadFacturesAll(), loadFacturesStats(year)])
    setFactures(list); setStats(st); setSelected(new Set())
  }

  const pending = factures.filter(f => f.facture_status === 'pending')
  const recovered = factures.filter(f => f.facture_status === 'recovered')

  function toggle(id) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const selectedFactures = pending.filter(f => selected.has(f.id))
  const selectedTotal = selectedFactures.reduce((s, f) => s + Number(f.amount || 0), 0)

  async function confirmCheque() {
    if (selectedFactures.length === 0) return
    setBusy(true); setError('')
    try {
      await recupererFacturesParCheque({ factures: selectedFactures, cheque, date: chequeDate, userId: user.id })
      setShowCheque(false); setCheque(''); setChequeDate(todayISO())
      await reload()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  // Regroupement des récupérées par chèque
  const groups = {}
  for (const f of recovered) {
    const key = f.facture_cheque || '__none__'
    if (!groups[key]) groups[key] = { cheque: f.facture_cheque, date: f.facture_recovered_at, total: 0, items: [] }
    groups[key].items.push(f)
    groups[key].total += Number(f.amount || 0)
  }
  const groupList = Object.values(groups).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  return (
    <div>
      <div style={{ background: '#E6F1FB', border: '0.5px solid #378ADD', color: '#0C447C', padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontSize: 13 }}>
        ℹ️ Coche les factures retirées ensemble à la banque, puis « Récupérer par chèque » : elles sont regroupées sous un n° de chèque (le total est versé dans la caisse Layla LG).
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
        <StatCard label={`Total factures · ${year}`} value={stats.total} sub={`${stats.countAll} factures`} bg="#F4F0EA" text="#3A3733" border="#E8E2D8" />
        <StatCard label="À récupérer (reliquat)" value={stats.pending} sub={`${stats.countPending} en attente`} bg="#FCE9E8" text="#99201E" border="#E5BFB6" highlight />
        <StatCard label="Déjà récupéré" value={stats.recovered} sub={`${stats.countRecovered} · transféré Layla LG`} bg="#E1F5EE" text="#085041" border="#97C9B4" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <Chip active={filter === 'pending'}   onClick={() => setFilter('pending')}>À récupérer</Chip>
        <Chip active={filter === 'recovered'} onClick={() => setFilter('recovered')}>Récupérées</Chip>
      </div>

      {/* À RÉCUPÉRER : sélection + chèque */}
      {filter === 'pending' && (
        <>
          {pending.length === 0 && <div style={emptyBox}>Aucune facture à récupérer.</div>}
          {pending.map(f => (
            <label key={f.id} style={{
              display: 'grid', gridTemplateColumns: '30px 90px 1fr 110px', gap: 12, alignItems: 'center', cursor: 'pointer',
              padding: '12px 16px', borderRadius: 8, marginBottom: 5, background: 'white',
              border: selected.has(f.id) ? '1.5px solid #378ADD' : '0.5px solid #E8E2D8',
            }}>
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <div style={{ fontSize: 11, color: '#6F6A60' }}>{fmtDateCourte(f.mvt_date)}</div>
              <div>
                <div style={{ fontSize: 13 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#6F6A60', marginTop: 2 }}>{f.category}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, textAlign: 'right' }}>{fmtMoney(f.amount)}</div>
            </label>
          ))}

          {selected.size > 0 && (
            <div style={{
              position: 'sticky', bottom: 12, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, padding: '12px 16px', borderRadius: 10, background: '#0C447C', color: 'white', boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
            }}>
              <div style={{ fontSize: 13 }}>{selected.size} facture{selected.size > 1 ? 's' : ''} · <strong>{fmtMoney(selectedTotal)}</strong></div>
              <button onClick={() => { setError(''); setShowCheque(true) }} style={{
                fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'white', color: '#0C447C',
              }}>💳 Récupérer par chèque</button>
            </div>
          )}
        </>
      )}

      {/* RÉCUPÉRÉES : regroupées par chèque */}
      {filter === 'recovered' && (
        <>
          {groupList.length === 0 && <div style={emptyBox}>Aucune facture récupérée.</div>}
          {groupList.map((g, i) => (
            <div key={g.cheque || `none-${i}`} style={{ marginBottom: 16 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', borderRadius: 8, background: '#E1F5EE', color: '#085041', border: '0.5px solid #97C9B4', marginBottom: 6,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {g.cheque ? `💳 Chèque n° ${g.cheque}` : '📄 Sans chèque'}
                  {g.date ? <span style={{ fontWeight: 400, fontSize: 12 }}> · {fmtDateCourte(g.date)}</span> : ''}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(g.total)} · {g.items.length} fact.</div>
              </div>
              {g.items.map(f => (
                <div key={f.id} style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr 110px', gap: 12, alignItems: 'center',
                  padding: '9px 16px 9px 28px', borderRadius: 8, marginBottom: 4, background: 'white', border: '0.5px solid #E8E2D8',
                }}>
                  <div style={{ fontSize: 11, color: '#6F6A60' }}>{fmtDateCourte(f.mvt_date)}</div>
                  <div>
                    <div style={{ fontSize: 13 }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: '#6F6A60', marginTop: 2 }}>{f.category}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, textAlign: 'right' }}>{fmtMoney(f.amount)}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* Fenêtre n° de chèque */}
      {showCheque && (
        <div style={overlay} onClick={() => !busy && setShowCheque(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>💳 Récupérer par chèque</h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6F6A60' }}>{selected.size} facture{selected.size > 1 ? 's' : ''} · total <strong>{fmtMoney(selectedTotal)}</strong> (montant retiré à la banque)</p>
            <label style={lbl}>N° de chèque
              <input type="text" value={cheque} onChange={e => setCheque(e.target.value)} autoFocus placeholder="ex. 1234567" style={inp} />
            </label>
            <label style={lbl}>Date du retrait
              <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} style={inp} />
            </label>
            {error && <div style={{ color: '#99201E', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCheque(false)} disabled={busy} style={btnSec}>Annuler</button>
              <button onClick={confirmCheque} disabled={busy} style={btnPri}>{busy ? '…' : 'Valider'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, bg, text, border, highlight }) {
  return (
    <div style={{ padding: 20, borderRadius: 12, background: bg, border: `0.5px solid ${border}` }}>
      <div style={{ fontSize: 11, color: text, opacity: highlight ? 1 : 0.85 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 500, color: text, marginTop: 6 }}>{fmtMoney(value)}</div>
      <div style={{ fontSize: 11, color: text, opacity: 0.7, marginTop: 4 }}>{sub}</div>
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return <button onClick={onClick} style={{
    fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', border: 'none',
    background: active ? '#3A3733' : '#F4F0EA',
    color:      active ? 'white'   : '#6F6A60',
  }}>{children}</button>
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const emptyBox = { padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 22, maxWidth: 380, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 500, color: '#3A3733', marginBottom: 12 }
const inp = { display: 'block', width: '100%', padding: '9px 11px', marginTop: 5, fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6, boxSizing: 'border-box' }
const btnSec = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer', color: '#6F6A60' }
const btnPri = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0C447C', color: 'white', cursor: 'pointer', fontWeight: 500 }
