import { useState, useEffect } from 'react'
import { loadFacturesAll, loadFacturesStats, marquerFactureRecuperee } from '../../../lib/caisse'
import { currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
import MarquerFactureRecupereeModal from '../modals/MarquerFactureRecupereeModal'

export default function MeriemFactures({ user }) {
  const [year, setYear] = useState(currentYear())
  const [filter, setFilter] = useState('pending')
  const [factures, setFactures] = useState([])
  const [stats, setStats] = useState({ total: 0, recovered: 0, pending: 0, countAll: 0, countPending: 0, countRecovered: 0 })
  const [marquerEnv, setMarquerEnv] = useState(null)

  useEffect(() => { reload() }, [year])

  async function reload() {
    const [list, st] = await Promise.all([loadFacturesAll(), loadFacturesStats(year)])
    setFactures(list); setStats(st)
  }

  const filtered = factures.filter(f => {
    if (filter === 'pending')   return f.facture_status === 'pending'
    if (filter === 'recovered') return f.facture_status === 'recovered'
    return true
  })

  async function handleMarquer(recoveredDate) {
    await marquerFactureRecuperee({ mouvementId: marquerEnv.id, recoveredDate, userId: user.id })
    setMarquerEnv(null); reload()
  }

  return (
    <div>
      <div style={{ background: '#E6F1FB', border: '0.5px solid #378ADD', color: '#0C447C', padding: '12px 16px', borderRadius: 8, marginBottom: 18, fontSize: 13 }}>
        ℹ️ L'argent récupéré sur les factures est versé dans la <strong>caisse Layla LG</strong>.
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
        <Chip active={filter === 'all'}       onClick={() => setFilter('all')}>Toutes</Chip>
      </div>

      {filtered.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>Aucune facture dans ce filtre.</div>}
      {filtered.map(f => (
        <div key={f.id} style={{
          display: 'grid', gridTemplateColumns: '90px 1fr 110px 130px 150px', gap: 12, alignItems: 'center',
          padding: '12px 16px', borderRadius: 8, marginBottom: 5, background: 'white', border: '0.5px solid #E8E2D8',
          opacity: f.facture_status === 'recovered' ? 0.6 : 1,
        }}>
          <div style={{ fontSize: 11, color: '#6F6A60' }}>{fmtDateCourte(f.mvt_date)}</div>
          <div>
            <div style={{ fontSize: 13 }}>{f.label}</div>
            <div style={{ fontSize: 11, color: '#6F6A60', marginTop: 2 }}>{f.category}</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtMoney(f.amount)}</div>
          <div>
            <span style={f.facture_status === 'recovered' ? statusDone : statusPending}>
              {f.facture_status === 'recovered' ? 'Récupérée' : 'À récupérer'}
            </span>
          </div>
          <div>
            {f.facture_status === 'pending' && (
              <button onClick={() => setMarquerEnv(f)} style={{ fontSize: 12, padding: '7px 12px', width: '100%', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }}>✓ Marquer récupérée</button>
            )}
            {f.facture_status === 'recovered' && (
              <div style={{ fontSize: 11, color: '#6F6A60', textAlign: 'center' }}>{f.facture_recovered_at ? fmtDateCourte(f.facture_recovered_at) : ''}</div>
            )}
          </div>
        </div>
      ))}

      {marquerEnv && (
        <MarquerFactureRecupereeModal facture={marquerEnv}
          onClose={() => setMarquerEnv(null)} onConfirm={handleMarquer} />
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
const statusPending = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#FCE9E8', color: '#99201E' }
const statusDone    = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#E1F5EE', color: '#085041' }
