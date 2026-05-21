import { useState, useEffect } from 'react'
import { loadAuditLog } from '../../lib/caisse'
import { fmtMoney } from './_helpers'

const ENTITY_LABELS = {
  enveloppe: { label: 'Enveloppes', icon: '📊', color: '#993556' },
  mouvement: { label: 'Mouvements caisse', icon: '💰', color: '#27500A' },
  avance:    { label: 'Avances', icon: '💸', color: '#633806' },
  salaire:   { label: 'Salaires', icon: '💵', color: '#0C447C' },
  cloture:   { label: 'Clôtures mois', icon: '🔒', color: '#3A3733' },
}

const ACTION_LABELS = {
  assign:        { label: 'Affectation',         color: '#085041' },
  unassign:      { label: 'Désaffectation',      color: '#99201E' },
  proof_upload:  { label: 'Preuve déposée',      color: '#0C447C' },
  create:        { label: 'Création',            color: '#085041' },
  update:        { label: 'Modification',        color: '#B7771C' },
  delete:        { label: 'Suppression',         color: '#99201E' },
  refund:        { label: 'Remboursée',          color: '#085041' },
  unrefund:      { label: 'Remb. annulé',        color: '#99201E' },
  pay:           { label: 'Payé',                color: '#085041' },
  close_month:   { label: 'Clôture',             color: '#3A3733' },
}

export default function LogsView({ user }) {
  const [list, setList]         = useState([])
  const [filter, setFilter]     = useState('all')   // 'all' | entityType
  const [expanded, setExpanded] = useState({})       // { logId: true/false }
  const [loading, setLoading]   = useState(false)

  useEffect(() => { reload() }, [filter])

  async function reload() {
    setLoading(true)
    try {
      const entityType = filter === 'all' ? null : filter
      const data = await loadAuditLog({ entityType, limit: 200 })
      setList(data)
    } catch (e) {
      console.error(e); alert('Erreur chargement logs : ' + e.message)
    }
    setLoading(false)
  }

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#3A3733' }}>📜 Historique des actions Caisse</div>
        <div style={{ fontSize: 11, color: '#6F6A60', marginTop: 2 }}>
          Toutes les actions effectuées sur le module Caisse (200 dernières).
        </div>
      </div>

      {/* Filtres entity type */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Tout</FilterChip>
        {Object.entries(ENTITY_LABELS).map(([key, info]) => (
          <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)}>
            {info.icon} {info.label}
          </FilterChip>
        ))}
      </div>

      {loading && <div style={{ color: '#6F6A60', padding: 20 }}>Chargement…</div>}

      {!loading && list.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>
          Aucune action enregistrée.
        </div>
      )}

      {!loading && list.map(log => {
        const entity = ENTITY_LABELS[log.entity_type] || { label: log.entity_type, icon: '•', color: '#6F6A60' }
        const action = ACTION_LABELS[log.action] || { label: log.action, color: '#6F6A60' }
        const isOpen = !!expanded[log.id]
        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('fr-FR') : ''
        const actorName = log.actor?.username || log.actor?.full_name || '?'
        return (
          <div key={log.id} style={rowCard}>
            <div onClick={() => toggle(log.id)} style={{ display: 'grid', gridTemplateColumns: '24px 130px 140px 1fr 100px 90px', gap: 10, alignItems: 'center', cursor: 'pointer', padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#9B968D' }}>{isOpen ? '▾' : '▸'}</div>
              <div style={{ fontSize: 11, color: '#6F6A60' }}>{dateStr}</div>
              <div>
                <span style={{ display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 999, background: '#F4F0EA', color: entity.color, fontWeight: 500 }}>
                  {entity.icon} {entity.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#3A3733' }}>{log.description}</div>
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: log.amount && log.amount < 0 ? '#99201E' : '#3A3733' }}>
                {log.amount != null ? fmtMoney(log.amount) : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#6F6A60', textAlign: 'right' }}>
                <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4, background: '#FAF6F0' }}>
                  {action.label}
                </span>
              </div>
            </div>
            {isOpen && (
              <div style={{ background: '#FAF6F0', padding: '10px 14px 12px 50px', fontSize: 11, color: '#6F6A60', borderTop: '0.5px solid #E8E2D8' }}>
                <div><strong>Par :</strong> {actorName}</div>
                {log.entity_id && <div><strong>ID :</strong> <code style={{ fontSize: 10 }}>{log.entity_id}</code></div>}
                {log.before_value && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer' }}>Avant ⤵</summary>
                    <pre style={preStyle}>{JSON.stringify(log.before_value, null, 2)}</pre>
                  </details>
                )}
                {log.after_value && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer' }}>Après ⤵</summary>
                    <pre style={preStyle}>{JSON.stringify(log.after_value, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 500,
      background: active ? '#3A3733' : '#F4F0EA',
      color:      active ? 'white'   : '#6F6A60',
    }}>{children}</button>
  )
}

const rowCard = {
  background: 'white', border: '0.5px solid #E8E2D8', borderRadius: 8, marginBottom: 4, overflow: 'hidden',
}

const preStyle = {
  background: 'white', border: '0.5px solid #E8E2D8', borderRadius: 4,
  padding: 8, fontSize: 10, color: '#3A3733', marginTop: 4, maxHeight: 200, overflow: 'auto',
}
