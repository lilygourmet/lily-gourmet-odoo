import { useState, useEffect } from 'react'
import { loadAuditLog } from '../../lib/caisse'
import { fmtMoney } from './_helpers'

const ACTION_LABELS = {
  assign:        { label: 'Affectation',       color: '#085041' },
  unassign:      { label: 'Désaffectation',    color: '#99201E' },
  proof_upload:  { label: 'Preuve déposée',    color: '#0C447C' },
  create:        { label: 'Création',          color: '#085041' },
  update:        { label: 'Modification',      color: '#B7771C' },
  delete:        { label: 'Suppression',       color: '#99201E' },
  refund:        { label: 'Remboursée',        color: '#085041' },
  unrefund:      { label: 'Remb. annulé',      color: '#99201E' },
  pay:           { label: 'Payé',              color: '#085041' },
  close_month:   { label: 'Clôture',           color: '#3A3733' },
  update_date:   { label: 'Date modifiée',     color: '#B7771C' },
}

/**
 * Panneau d'historique déroulable.
 * Props:
 *  - entityType: 'enveloppe' | 'mouvement' | 'avance' | 'salaire' | 'cloture' | null (tout)
 *  - title: titre optionnel
 *  - limit: max d'entrées chargées (défaut 50)
 */
export default function AuditLogPanel({ entityType = null, title = null, limit = 50 }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(null)

  // Quand on ouvre la première fois, on charge
  useEffect(() => {
    if (open && list.length === 0 && !loading) {
      reload()
    }
  }, [open])

  // Charger un compteur "léger" pour afficher (X actions) en bas
  useEffect(() => {
    (async () => {
      try {
        const data = await loadAuditLog({ entityType, limit: 1 })
        // Pour avoir le total approximatif on prend 'limit' rows et on dit "X+"
        const fullData = await loadAuditLog({ entityType, limit })
        setCount(fullData.length)
      } catch (e) { console.warn('AuditLogPanel count:', e) }
    })()
  }, [entityType, limit])

  async function reload() {
    setLoading(true)
    try {
      const data = await loadAuditLog({ entityType, limit })
      setList(data)
    } catch (e) {
      console.error('AuditLogPanel:', e)
    }
    setLoading(false)
  }

  const titleLabel = title || '📜 Historique des actions'
  const countLabel = count === null ? '' : (count >= limit ? `${count}+` : count)

  return (
    <div style={containerStyle}>
      <button onClick={() => setOpen(!open)} style={toggleBtn(open)}>
        <span>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1, textAlign: 'left' }}>{titleLabel}</span>
        {countLabel !== '' && (
          <span style={countBadge}>{countLabel} action{countLabel !== 1 && countLabel !== '1' ? 's' : ''}</span>
        )}
      </button>

      {open && (
        <div style={bodyStyle}>
          {loading && <div style={{ padding: 16, color: '#6F6A60', textAlign: 'center' }}>Chargement…</div>}
          {!loading && list.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#9B968D', fontSize: 12 }}>
              Aucune action enregistrée.
            </div>
          )}
          {!loading && list.map(log => <LogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  )
}

function LogRow({ log }) {
  const [showDetails, setShowDetails] = useState(false)
  const action = ACTION_LABELS[log.action] || { label: log.action, color: '#6F6A60' }
  const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : ''
  const actorName = log.actor?.username || log.actor?.full_name || '?'

  return (
    <div style={rowStyle}>
      <div onClick={() => setShowDetails(!showDetails)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px', gap: 8, alignItems: 'center', padding: '8px 12px', cursor: 'pointer', fontSize: 11 }}>
        <div style={{ color: '#9B968D' }}>{dateStr}</div>
        <div style={{ color: '#3A3733' }}>{log.description}</div>
        <div style={{ textAlign: 'right', color: log.amount && Number(log.amount) < 0 ? '#99201E' : '#3A3733', fontWeight: 500 }}>
          {log.amount != null ? fmtMoney(log.amount) : '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#FAF6F0', color: action.color }}>{action.label}</span>
        </div>
      </div>
      {showDetails && (
        <div style={detailsStyle}>
          <div>Par : <strong>{actorName}</strong></div>
          {log.before_value && (
            <details><summary style={{ cursor: 'pointer' }}>Avant</summary><pre style={preStyle}>{JSON.stringify(log.before_value, null, 2)}</pre></details>
          )}
          {log.after_value && (
            <details><summary style={{ cursor: 'pointer' }}>Après</summary><pre style={preStyle}>{JSON.stringify(log.after_value, null, 2)}</pre></details>
          )}
        </div>
      )}
    </div>
  )
}

const containerStyle = {
  marginTop: 32,
  borderTop: '1px solid #E8E2D8',
  paddingTop: 12,
}

const toggleBtn = (open) => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  background: open ? '#F4F0EA' : 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  color: '#6F6A60',
})

const countBadge = {
  fontSize: 10, padding: '2px 8px', borderRadius: 999, background: '#E8E2D8', color: '#6F6A60', fontWeight: 500,
}

const bodyStyle = {
  marginTop: 6,
  background: '#FAF6F0',
  borderRadius: 6,
  border: '0.5px solid #E8E2D8',
  maxHeight: 400,
  overflow: 'auto',
}

const rowStyle = {
  borderBottom: '0.5px solid #E8E2D8',
  background: 'white',
}

const detailsStyle = {
  padding: '6px 12px 10px 12px',
  background: '#FAF6F0',
  fontSize: 10,
  color: '#6F6A60',
  borderTop: '0.5px solid #E8E2D8',
}

const preStyle = {
  background: 'white', padding: 6, fontSize: 9, borderRadius: 4, marginTop: 4, maxHeight: 150, overflow: 'auto',
}
