import { useState } from 'react'
import { fmtMoney, fmtDateCourte } from '../_helpers'

/**
 * Modal qui s'ouvre au chargement de la caisse Meriem (ou Layla LG) 
 * pour valider les entrées automatiques en attente.
 *
 * Props :
 *  - receptions : array des mouvements en attente
 *  - onValidate(mvtId) : valider une réception
 *  - onClose() : fermer le popup (les non-validés restent en attente)
 */
export default function ValiderReceptionsModal({ receptions, onValidate, onClose }) {
  const [validating, setValidating] = useState(new Set())
  const [error, setError] = useState(null)

  async function handleValidate(mvtId) {
    if (validating.has(mvtId)) return
    setError(null)
    setValidating(prev => new Set([...prev, mvtId]))
    try {
      await onValidate(mvtId)
    } catch (e) {
      setError(`Erreur : ${e?.message || 'sauvegarde impossible'}`)
      setValidating(prev => {
        const next = new Set(prev)
        next.delete(mvtId)
        return next
      })
    }
  }

  const total = receptions.reduce((s, r) => s + Number(r.amount), 0)
  const remaining = receptions.filter(r => !validating.has(r.id)).length

  return (
    <div style={overlay}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg, #993556 0%, #B14A6F 100%)', color: 'white', padding: '20px 24px', borderRadius: '12px 12px 0 0' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            ⏳ Réceptions à valider
          </h3>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
            Confirme que tu as bien reçu ces montants pour qu'ils soient comptés dans ton solde.
          </div>
        </div>

        <div style={{ padding: 18, maxHeight: '60vh', overflowY: 'auto' }}>
          {receptions.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#4a3a30' }}>
              ✅ Toutes les réceptions sont validées !
            </div>
          )}

          {receptions.map(r => {
            const isValidating = validating.has(r.id)
            return (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 110px auto', gap: 12,
                alignItems: 'center', padding: '12px 10px',
                borderRadius: 8, marginBottom: 8,
                background: isValidating ? '#F0F0F0' : '#FAFAF8',
                border: `1px solid ${isValidating ? '#D8D8D8' : '#e5d8c3'}`,
                opacity: isValidating ? 0.5 : 1,
              }}>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>
                  {fmtDateCourte(r.mvt_date)}
                </div>
                <div style={{ fontSize: 13, color: '#1a0f0a' }}>
                  {r.label}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 500, color: '#1D7A5C', fontSize: 14 }}>
                  + {fmtMoney(Math.abs(r.amount)).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span>
                </div>
                <button
                  disabled={isValidating}
                  onClick={() => handleValidate(r.id)}
                  style={{
                    fontSize: 12, padding: '6px 12px', borderRadius: 6,
                    border: '1px solid #97C459', background: isValidating ? '#E8E8E8' : '#EAF3DE',
                    color: '#27500A', cursor: isValidating ? 'wait' : 'pointer',
                    fontWeight: 500, whiteSpace: 'nowrap'
                  }}>
                  {isValidating ? '⏳' : '✅ Reçu'}
                </button>
              </div>
            )
          })}

          {error && (
            <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 18px', borderTop: '1px solid #e5d8c3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#4a3a30' }}>
            Total à recevoir : <strong style={{ color: '#1a0f0a' }}>{fmtMoney(total)}</strong>
          </div>
          <button onClick={onClose} style={{
            fontSize: 13, padding: '8px 14px', borderRadius: 8,
            border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30'
          }}>
            {remaining > 0 ? 'Plus tard' : 'Fermer'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, maxWidth: 580, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }
