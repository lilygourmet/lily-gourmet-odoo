import { useState } from 'react'

/**
 * Modal pour modifier l'intitulé et la date d'un mouvement.
 * Le montant n'est PAS modifiable depuis ce modal (réservé à l'admin via le bouton 💰).
 */
export default function EditMouvementModal({ mvt, onClose, onSubmit }) {
  const [label, setLabel] = useState(mvt?.label || '')
  const [mvtDate, setMvtDate] = useState(mvt?.mvt_date || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!label.trim()) { setError('L\'intitulé ne peut pas être vide'); return }
    if (!mvtDate) { setError('La date est obligatoire'); return }

    setSaving(true); setError(null)
    try {
      await onSubmit({ label: label.trim(), mvt_date: mvtDate })
    } catch (e) {
      setError(e?.message || 'Erreur lors de la sauvegarde')
      setSaving(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#3A3733' }}>
            ✏️ Modifier le mouvement
          </h3>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: '#6F6A60', marginBottom: 14, padding: '8px 12px', background: '#F9F6F1', borderRadius: 6 }}>
          Montant : <strong style={{ color: mvt.type === 'entree' ? '#1D7A5C' : '#99201E' }}>
            {mvt.type === 'entree' ? '+' : '−'} {Math.abs(mvt.amount)} dh
          </strong>
          <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>(non modifiable ici)</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={lblStyle}>
            Intitulé
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
              style={inputStyle}
              placeholder="Description du mouvement"
            />
          </label>

          <label style={lblStyle}>
            Date du mouvement
            <input
              type="date"
              value={mvtDate}
              onChange={e => setMvtDate(e.target.value)}
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onClose} style={btnSecondary} disabled={saving}>
              Annuler
            </button>
            <button type="submit" style={btnPrimary} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 22, maxWidth: 440, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B968D' }
const lblStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#3A3733', marginBottom: 12 }
const inputStyle = { display: 'block', width: '100%', padding: '9px 11px', marginTop: 5, fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box' }
const btnSecondary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer', color: '#6F6A60' }
const btnPrimary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
