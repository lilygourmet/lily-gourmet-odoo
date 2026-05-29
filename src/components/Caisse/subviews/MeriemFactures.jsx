import { useState, useEffect } from 'react'
import { loadFacturesAll, loadCourseFacturesAll, loadHamidFacturesAll, recupererFacturesParCheque } from '../../../lib/caisse'
import { fmtMoney, fmtDateCourte, todayISO } from '../_helpers'

export default function MeriemFactures({ user }) {
  const [filter, setFilter] = useState('pending')
  const [items, setItems] = useState([])   // factures normalisées (Meriem + courses)
  const [selected, setSelected] = useState(new Set())
  const [showCheque, setShowCheque] = useState(false)
  const [cheque, setCheque] = useState('')
  const [chequeDate, setChequeDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { reload() }, [])

  async function reload() {
    const [mvts, courseDeps, hamidDeps] = await Promise.all([loadFacturesAll(), loadCourseFacturesAll(), loadHamidFacturesAll()])
    const norm = [
      ...mvts.map(f => ({ key: `mvt-${f.id}`, kind: 'mvt', id: f.id, amount: Number(f.amount || 0), date: f.mvt_date, label: f.label, category: f.category, status: f.facture_status, cheque: f.facture_cheque, recoveredAt: f.facture_recovered_at })),
      ...courseDeps.map(d => ({ key: `course-${d.id}`, kind: 'course', id: d.id, amount: Number(d.amount || 0), date: d.course?.given_date, label: `🛒 ${d.course?.person || 'Courses'}${d.label ? ' · ' + d.label : ''}`, category: d.category, status: d.facture_status, cheque: d.facture_cheque, recoveredAt: d.facture_recovered_at })),
      ...hamidDeps.map(d => ({ key: `hamid-${d.id}`, kind: 'hamid', id: d.id, amount: Number(d.amount || 0), date: d.depense_date, label: `Hamid${d.label ? ' · ' + d.label : ''}`, category: d.category, status: d.facture_status, cheque: d.facture_cheque, recoveredAt: d.facture_recovered_at })),
    ]
    setItems(norm); setSelected(new Set())
  }

  const pending = items.filter(f => f.status === 'pending')
  const recovered = items.filter(f => f.status === 'recovered')
  const sum = arr => arr.reduce((s, f) => s + f.amount, 0)
  const stats = {
    total: sum(items), countAll: items.length,
    pending: sum(pending), countPending: pending.length,
    recovered: sum(recovered), countRecovered: recovered.length,
  }

  function toggle(key) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }
  const selectedFactures = pending.filter(f => selected.has(f.key))
  const selectedTotal = sum(selectedFactures)

  async function confirmCheque() {
    if (selectedFactures.length === 0) return
    setBusy(true); setError('')
    try {
      await recupererFacturesParCheque({ items: selectedFactures.map(f => ({ kind: f.kind, id: f.id, amount: f.amount })), cheque, date: chequeDate, userId: user.id })
      setShowCheque(false); setCheque(''); setChequeDate(todayISO())
      await reload()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  // Regroupement des récupérées par chèque
  const groups = {}
  for (const f of recovered) {
    const key = f.cheque || '__none__'
    if (!groups[key]) groups[key] = { cheque: f.cheque, date: f.recoveredAt, total: 0, items: [] }
    groups[key].items.push(f)
    groups[key].total += f.amount
  }
  const groupList = Object.values(groups).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  return (
    <div>
      <div style={{ background: '#E6F1FB', border: '0.5px solid #378ADD', color: '#0C447C', padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontSize: 13 }}>
        ℹ️ Coche les factures retirées ensemble à la banque, puis « Récupérer par chèque » : elles sont regroupées sous un n° de chèque (le total est versé dans la caisse Layla LG).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
        <StatCard label="Total factures" value={stats.total} sub={`${stats.countAll} factures`} bg="#F4F0EA" text="#1a0f0a" border="#e5d8c3" />
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
            <label key={f.key} style={{
              display: 'grid', gridTemplateColumns: '30px 90px 1fr 110px', gap: 12, alignItems: 'center', cursor: 'pointer',
              padding: '12px 16px', borderRadius: 8, marginBottom: 5, background: 'white',
              border: selected.has(f.key) ? '1.5px solid #378ADD' : '0.5px solid #e5d8c3',
            }}>
              <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(f.date)}</div>
              <div>
                <div style={{ fontSize: 13 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 2 }}>{f.category}</div>
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
                <div key={f.key} style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr 110px', gap: 12, alignItems: 'center',
                  padding: '9px 16px 9px 28px', borderRadius: 8, marginBottom: 4, background: 'white', border: '0.5px solid #e5d8c3',
                }}>
                  <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(f.date)}</div>
                  <div>
                    <div style={{ fontSize: 13 }}>{f.label}</div>
                    <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 2 }}>{f.category}</div>
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
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#4a3a30' }}>{selected.size} facture{selected.size > 1 ? 's' : ''} · total <strong>{fmtMoney(selectedTotal)}</strong> (montant retiré à la banque)</p>
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
    fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2' : '#1a0f0a',
    border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
  }}>{children}</button>
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const emptyBox = { padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 8 }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 22, maxWidth: 380, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 12 }
const inp = { display: 'block', width: '100%', padding: '9px 11px', marginTop: 5, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, boxSizing: 'border-box' }
const btnSec = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30' }
const btnPri = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0C447C', color: 'white', cursor: 'pointer', fontWeight: 500 }
