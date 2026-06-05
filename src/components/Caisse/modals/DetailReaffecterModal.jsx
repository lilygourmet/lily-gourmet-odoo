import { useState } from 'react'
import { Calendar, RefreshCw, Landmark, User, Briefcase } from 'lucide-react'
import { fmtMoney, fmtDateLongue, COLOR_PALETTE } from '../_helpers'
import { toast } from '../../../lib/toast'
import { confirmDialog } from '../../../lib/confirmDialog'

export default function DetailReaffecterModal({ env, destinataires, onClose, onReassign, onUnassign, onUpdateDate }) {
  const [showReassign, setShowReassign] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState(env.assigned_date || env.session_date || new Date().toISOString().slice(0, 10))
  const [savingDate, setSavingDate] = useState(false)
  const c = COLOR_PALETTE[env.destinataire?.color_key] || COLOR_PALETTE.gris

  const sorted = [...destinataires].sort((a, b) => {
    const order = { caisse_geree: 1, perso: 2, banque: 3 }
    return (order[a.type] || 99) - (order[b.type] || 99) || a.position - b.position
  })

  async function handleSaveDate() {
    if (!dateValue) return
    setSavingDate(true)
    try {
      await onUpdateDate(dateValue)
      setEditingDate(false)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
    setSavingDate(false)
  }

  function handleReassign(destId) {
    // On passe aussi la date actuelle en cas de réaffectation (pour garder le mois d'effet)
    onReassign(destId, env.assigned_date || dateValue)
  }

  return (
    <Modal onClose={onClose} title={showReassign ? 'Réaffecter' : 'Détail de l\'enveloppe'}>
      {!showReassign && (
        <>
          <div style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, padding: '14px 16px', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Session POS : {fmtDateLongue(env.session_date)} · {env.source}</div>
            <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1, margin: '4px 0 8px' }}>{fmtMoney(env.amount_cash)}</div>
            <div style={{ fontSize: 13 }}>Affecté à <strong>{env.destinataire?.name}</strong></div>
          </div>

          {/* Date d'affectation modifiable */}
          <div style={{ background: '#F4F0EA', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4a3a30', marginBottom: 6 }}>
              <Calendar size={14} /> Date effective (mois où l'argent a été pris)
            </div>
            {!editingDate ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {env.assigned_date ? fmtDateLongue(env.assigned_date) : <em style={{ color: '#8a7a70' }}>Non défini (utilise la date Odoo)</em>}
                </div>
                <button onClick={() => setEditingDate(true)} style={btnSmall}>✎ Modifier</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={dateValue} onChange={e => setDateValue(e.target.value)} style={inputStyle} autoFocus />
                <button onClick={handleSaveDate} disabled={savingDate} style={btnPrimary}>
                  {savingDate ? '…' : '✓'}
                </button>
                <button onClick={() => { setEditingDate(false); setDateValue(env.assigned_date || env.session_date) }} style={btnSmall}>✕</button>
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: '#4a3a30', lineHeight: 1.7, marginBottom: 18 }}>
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
            <button onClick={() => setShowReassign(true)} style={{ ...btnNormal, display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> Réaffecter à un autre destinataire</button>
            <button onClick={async () => { if (await confirmDialog('Annuler l\'affectation ? L\'enveloppe redevient grise.', { danger: true, confirmLabel: 'Annuler' })) onUnassign() }} style={{ ...btnNormal, color: '#4a3a30' }}>↩ Retour à « À affecter »</button>
            <button onClick={onClose} style={btnNormal}>Fermer</button>
          </div>
        </>
      )}

      {showReassign && (
        <>
          <div style={{ background: '#F4F0EA', padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#4a3a30' }}>{fmtDateLongue(env.session_date)} · {env.source}</div>
            <div style={{ fontSize: 24, fontWeight: 500, marginTop: 4 }}>{fmtMoney(env.amount_cash)}</div>
          </div>
          <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 10 }}>Nouveau destinataire :</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {sorted.map(d => {
              const cc = COLOR_PALETTE[d.color_key] || COLOR_PALETTE.gris
              const fullWidth = d.type === 'banque' && sorted.filter(x => x.type === 'banque').length === 1
              const isCurrent = d.id === env.destinataire_id
              return (
                <button key={d.id} disabled={isCurrent} onClick={() => handleReassign(d.id)} style={{
                  background: cc.bg, color: cc.text, border: `0.5px solid ${cc.border}`,
                  fontSize: 14, fontWeight: 500, padding: '14px 12px', borderRadius: 8,
                  cursor: isCurrent ? 'not-allowed' : 'pointer', textAlign: 'left',
                  gridColumn: fullWidth ? 'span 2' : 'auto', opacity: isCurrent ? 0.4 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  {d.type === 'banque' ? <Landmark size={14} /> : d.type === 'perso' ? <User size={14} /> : <Briefcase size={14} />} {d.name}{isCurrent && ' (actuel)'}
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

const btnNormal = { fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnSmall  = { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 12, padding: '4px 12px', borderRadius: 6, border: 'none', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
const inputStyle = { flex: 1, padding: '5px 8px', fontSize: 12, border: '1px solid #C4BFB6', borderRadius: 6 }

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 460, width: '100%', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
