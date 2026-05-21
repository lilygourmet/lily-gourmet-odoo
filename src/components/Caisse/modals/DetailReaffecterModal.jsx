import { useState } from 'react'
import { fmtMoney, fmtDateLongue, COLOR_PALETTE } from '../_helpers'

export default function DetailReaffecterModal({ env, destinataires, onClose, onReassign, onUnassign }) {
  const [showReassign, setShowReassign] = useState(false)
  const c = COLOR_PALETTE[env.destinataire?.color_key] || COLOR_PALETTE.gris

  const sorted = [...destinataires].sort((a, b) => {
    const order = { caisse_geree: 1, perso: 2, banque: 3 }
    return (order[a.type] || 99) - (order[b.type] || 99) || a.position - b.position
  })

  return (
    <Modal onClose={onClose} title={showReassign ? 'Réaffecter' : 'Détail de l\'enveloppe'}>
      {!showReassign && (
        <>
          <div style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, padding: '14px 16px', borderRadius: 8, marginBottom: 18 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{fmtDateLongue(env.session_date)} · {env.source}</div>
            <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1, margin: '4px 0 8px' }}>{fmtMoney(env.amount_cash)}</div>
            <div style={{ fontSize: 13 }}>Affecté à <strong>{env.destinataire?.name}</strong></div>
          </div>
          <div style={{ fontSize: 12, color: '#6F6A60', lineHeight: 1.7, marginBottom: 18 }}>
            {env.assigned_at && (
              <div>
                Affecté le {fmtDateLongue(env.assigned_at)}
                {env.assigner && (
                  <span> par <strong>{env.assigner.username || env.assigner.full_name || '?'}</strong></span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setShowReassign(true)} style={btnNormal}>🔄 Réaffecter à un autre destinataire</button>
            <button onClick={() => { if (confirm('Annuler l\'affectation ? L\'enveloppe redevient grise.')) onUnassign() }} style={{ ...btnNormal, color: '#6F6A60' }}>↩ Retour à « À affecter »</button>
            <button onClick={onClose} style={btnNormal}>Fermer</button>
          </div>
        </>
      )}

      {showReassign && (
        <>
          <div style={{ background: '#F4F0EA', padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#6F6A60' }}>{fmtDateLongue(env.session_date)} · {env.source}</div>
            <div style={{ fontSize: 24, fontWeight: 500, marginTop: 4 }}>{fmtMoney(env.amount_cash)}</div>
          </div>
          <div style={{ fontSize: 13, color: '#6F6A60', marginBottom: 10 }}>Nouveau destinataire :</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {sorted.map(d => {
              const cc = COLOR_PALETTE[d.color_key] || COLOR_PALETTE.gris
              const fullWidth = d.type === 'banque' && sorted.filter(x => x.type === 'banque').length === 1
              const isCurrent = d.id === env.destinataire_id
              return (
                <button key={d.id} disabled={isCurrent} onClick={() => onReassign(d.id)} style={{
                  background: cc.bg, color: cc.text, border: `0.5px solid ${cc.border}`,
                  fontSize: 14, fontWeight: 500, padding: '14px 12px', borderRadius: 8,
                  cursor: isCurrent ? 'not-allowed' : 'pointer', textAlign: 'left',
                  gridColumn: fullWidth ? 'span 2' : 'auto', opacity: isCurrent ? 0.4 : 1,
                }}>
                  {d.type === 'banque' ? '🏦' : d.type === 'perso' ? '👤' : '💼'} {d.name}{isCurrent && ' (actuel)'}
                </button>
              )
            })}
          </div>
          <button onClick={() => setShowReassign(false)} style={{ ...btnNormal, marginTop: 14, width: '100%' }}>← Retour</button>
        </>
      )}
    </Modal>
  )
}

const btnNormal = { fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', border: '0.5px solid #E8E2D8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B968D' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
