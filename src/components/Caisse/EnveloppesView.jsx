import { useState, useEffect, useMemo } from 'react'
import { loadEnveloppesByMonth, loadDestinataires, assignEnveloppe, reassignEnveloppe, unassignEnveloppe } from '../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, envStyle, COLOR_PALETTE } from './_helpers'
import AttributionModal from './modals/AttributionModal'
import DetailReaffecterModal from './modals/DetailReaffecterModal'

export default function EnveloppesView({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [enveloppes, setEnveloppes] = useState([])
  const [destinataires, setDestinataires] = useState([])
  const [filter, setFilter] = useState('all') // 'all' | 'unassigned' | dest.id
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('cash') // 'cash' | 'cheque'
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [attributionEnv, setAttributionEnv] = useState(null)
  const [detailEnv, setDetailEnv]       = useState(null)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => { (async () => {
    setDestinataires(await loadDestinataires())
  })() }, [])

  useEffect(() => { reload() }, [year, month])

  async function reload() {
    setLoading(true)
    try {
      const data = await loadEnveloppesByMonth(year, month)
      setEnveloppes(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/caisse-api?action=sync-pos', { method: 'POST' })
      const json = await res.json()
      setLastSync(new Date())
      if (json.error) console.error(json.error)
      await reload()
    } catch (e) { console.error(e); alert('Erreur sync : ' + e.message) }
    setSyncing(false)
  }

  // Enveloppes du mois filtrées par méthode de paiement (espèces ou chèques)
  const envByMethod = useMemo(() => {
    return enveloppes.filter(e => (e.payment_method || 'cash') === paymentMethodFilter)
  }, [enveloppes, paymentMethodFilter])

  // Sources distinctes du mois (Café, Boutique, etc.) sur les enveloppes filtrées par méthode
  const sources = useMemo(() => {
    const set = new Set(envByMethod.map(e => e.source))
    return Array.from(set).sort()
  }, [envByMethod])

  // Enveloppes filtrées (méthode + destinataire)
  const filteredEnveloppes = useMemo(() => {
    if (filter === 'all') return envByMethod
    if (filter === 'unassigned') return envByMethod.filter(e => !e.destinataire_id)
    return envByMethod.filter(e => String(e.destinataire_id) === String(filter))
  }, [envByMethod, filter])

  // Groupé par source
  const bySource = useMemo(() => {
    const map = {}
    sources.forEach(s => { map[s] = [] })
    filteredEnveloppes.forEach(e => {
      if (!map[e.source]) map[e.source] = []
      map[e.source].push(e)
    })
    Object.keys(map).forEach(s => {
      // Tri ascendant (plus ancien → plus récent)
      map[s].sort((a, b) => a.session_date.localeCompare(b.session_date))
    })
    return map
  }, [filteredEnveloppes, sources])

  async function handleAssign(envId, destId, assignedDate) {
    try {
      await assignEnveloppe(envId, destId, user.id, assignedDate)
      setAttributionEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  async function handleReassign(envId, destId, assignedDate) {
    try {
      await reassignEnveloppe(envId, destId, user.id, assignedDate)
      setDetailEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  async function handleUnassign(envId) {
    try {
      await unassignEnveloppe(envId)
      setDetailEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  const monthDisplay = MOIS_TABS.find(m => m.idx === month)?.label || ''

  return (
    <div>
      {/* Header année + sync */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
          <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
        </div>
        <button onClick={handleSync} disabled={syncing} style={btnNormal}>
          🔄 {syncing ? 'Sync…' : 'Synchroniser'}
        </button>
      </div>

      {/* Toggle Espèces / Chèques */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setPaymentMethodFilter('cash')}
          style={paymentMethodFilter === 'cash' ? toggleActiveStyle : toggleInactiveStyle}
        >
          💵 Espèces
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethodFilter('cheque')}
          style={paymentMethodFilter === 'cheque' ? toggleActiveStyle : toggleInactiveStyle}
        >
          📑 Chèques
        </button>
      </div>

      {/* Onglets mois */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: month === m.idx ? '#993556' : '#F4F0EA',
              color:      month === m.idx ? 'white'    : '#6F6A60',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>{m.label}</button>
        ))}
      </div>

      {/* Filtres rapides */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tout</Chip>
        <Chip active={filter === 'unassigned'} onClick={() => setFilter('unassigned')}>À affecter</Chip>
        {destinataires.map(d => (
          <Chip key={d.id} active={String(filter) === String(d.id)} onClick={() => setFilter(d.id)}>
            {d.name}
          </Chip>
        ))}
      </div>

      {loading && <div style={{ color: '#6F6A60', padding: 20 }}>Chargement…</div>}

      {!loading && sources.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>
          Aucune enveloppe {paymentMethodFilter === 'cheque' ? 'chèque' : 'espèces'} pour {monthDisplay} {year}.<br />
          Cliquez sur <strong>Synchroniser</strong> pour récupérer les sessions POS fermées d'Odoo.
        </div>
      )}

      {/* Grille N colonnes */}
      {!loading && sources.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${sources.length}, 1fr)`,
          gap: 14,
        }}>
          {sources.map(src => (
            <div key={src}>
              <div style={{
                fontSize: 13, fontWeight: 500, padding: '10px 12px', background: '#F4F0EA',
                borderRadius: 8, marginBottom: 8, color: '#6F6A60',
              }}>
                {src === 'Café' ? '☕' : src === 'Boutique' ? '🛍️' : '📍'} {src}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(bySource[src] || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9B968D', padding: 8 }}>Aucune enveloppe</div>
                ) : (bySource[src] || []).map(env => (
                  <EnveloppeCard key={env.id} env={env}
                    onClick={() => env.destinataire_id ? setDetailEnv(env) : setAttributionEnv(env)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Légende */}
      <div style={{ marginTop: 28, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#6F6A60' }}>
        {destinataires.map(d => {
          const c = COLOR_PALETTE[d.color_key]
          if (!c) return null
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 3, display: 'inline-block' }} />
              {d.name}
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: '#F4F0EA', border: '1.5px dashed #C4BFB6', borderRadius: 3, display: 'inline-block' }} />
          À affecter
        </div>
      </div>

      {attributionEnv && (
        <AttributionModal env={attributionEnv} destinataires={destinataires}
          onClose={() => setAttributionEnv(null)}
          onAssign={(destId, date) => handleAssign(attributionEnv.id, destId, date)} />
      )}
      {detailEnv && (
        <DetailReaffecterModal env={detailEnv} destinataires={destinataires}
          onClose={() => setDetailEnv(null)}
          onReassign={(destId) => handleReassign(detailEnv.id, destId)}
          onUnassign={() => handleUnassign(detailEnv.id)} />
      )}
    </div>
  )
}

function EnveloppeCard({ env, onClick }) {
  const style = envStyle(env.destinataire)
  return (
    <div onClick={onClick} style={{
      background: style.bg, borderColor: style.border, borderStyle: style.borderStyle, borderWidth: style.borderWidth,
      borderRadius: 8, padding: '8px 11px', cursor: 'pointer', color: style.text,
    }}>
      <div style={{ fontSize: 11, opacity: 0.85 }}>{fmtDateCourte(env.session_date)}</div>
      <div style={{ fontSize: 15, fontWeight: 500, margin: '2px 0 3px' }}>{fmtMoney(env.amount_cash)}</div>
      <div style={{ fontSize: 11, opacity: 0.95 }}>
        {env.destinataire ? env.destinataire.name : '👆 À affecter'}
      </div>
      {env.assigner && (
        <div style={{ fontSize: 9, opacity: 0.65, marginTop: 2, fontStyle: 'italic' }}>
          par {env.assigner.username || env.assigner.full_name || '?'}
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: 'none',
      background: active ? '#3A3733' : '#F4F0EA',
      color:      active ? 'white'   : '#6F6A60',
    }}>{children}</button>
  )
}

const btnSlim   = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }

const toggleActiveStyle = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 8,
  border: '1.5px solid #993556',
  background: '#993556',
  color: 'white',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const toggleInactiveStyle = {
  flex: 1,
  padding: '10px 14px',
  borderRadius: 8,
  border: '0.5px solid #C4BFB6',
  background: 'white',
  color: '#3E3A33',
  fontSize: 13,
  fontWeight: 400,
  cursor: 'pointer',
}
