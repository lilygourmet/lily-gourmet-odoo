import { useState } from 'react'
import { Landmark, User, Cloud, Paperclip, Clock } from 'lucide-react'
import { fmtMoney, fmtDateLongue, todayISO, COLOR_PALETTE } from '../_helpers'
export default function UploadPreuveModal({ env, kind, onClose, onUpload }) {
  const [date, setDate] = useState(env.proof_date || todayISO())
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [amountProof, setAmountProof] = useState(env.amount_proof != null ? String(env.amount_proof) : String(env.amount_cash))
  const [noteProof, setNoteProof] = useState(env.note_proof || '')

  async function submit() {
    if (!file) { alert('Sélectionnez un fichier'); return }
    const amt = parseFloat(amountProof)
    if (isNaN(amt) || amt < 0) { alert('Montant invalide'); return }
    setUploading(true)
    try {
      await onUpload(file, date, amt, noteProof.trim() || null)
    } catch (e) { alert(e.message) }
    setUploading(false)
  }
  const c = COLOR_PALETTE[env.destinataire?.color_key] || COLOR_PALETTE.gris

  // Calcul écart en direct
  const amt = parseFloat(amountProof)
  const diff = isNaN(amt) ? 0 : (amt - Number(env.amount_cash))
  const hasDiff = !isNaN(amt) && Math.abs(diff) > 0.001

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%', border: '0.5px solid #e5d8c3', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Ajouter une preuve</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }}>✕</button>
        </div>
        <div style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 12 }}>{fmtDateLongue(env.session_date)} · {env.source}</div>
          <div style={{ fontSize: 22, fontWeight: 500, margin: '4px 0' }}>{fmtMoney(env.amount_cash)}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>{kind === 'banque' ? <><Landmark size={14} /> Versement bancaire</> : <><User size={14} /> Remboursement perso</>}</div>
        </div>

        <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 8 }}>Montant réellement {kind === 'banque' ? 'versé à la banque' : 'remboursé'}</div>
        <input type="number" step="0.01" value={amountProof} onChange={(e) => setAmountProof(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 14, marginBottom: hasDiff ? 6 : 16, boxSizing: 'border-box' }} />
        {hasDiff && (
          <div style={{ fontSize: 12, color: diff > 0 ? '#0E7C2E' : '#993556', marginBottom: 16, fontStyle: 'italic' }}>
            {diff > 0 ? '↑' : '↓'} Écart : {fmtMoney(Math.abs(diff))} {diff > 0 ? 'en plus' : 'en moins'}
          </div>
        )}

        <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 8 }}>Date du {kind === 'banque' ? 'versement' : 'remboursement'}</div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }} />

        {hasDiff && (
          <>
            <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 8 }}>Raison de l'écart (optionnel)</div>
            <input type="text" value={noteProof} onChange={(e) => setNoteProof(e.target.value)} placeholder="ex : ajout cash perso, regroupé avec autre dépôt..."
              style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }} />
          </>
        )}

        <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 8 }}>Preuve (photo ou PDF)</div>
        <label style={{ display: 'block', border: '1.5px dashed #C4BFB6', borderRadius: 8, padding: '24px 16px', textAlign: 'center', cursor: 'pointer', background: '#F9F6F1', marginBottom: 24 }}>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} style={{ display: 'none' }} />
          <div style={{ color: '#8a7a70', display: 'flex', justifyContent: 'center' }}><Cloud size={28} /></div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4a3a30', marginTop: 6 }}>{file ? <><Paperclip size={14} /> {file.name}</> : 'Cliquez pour sélectionner'}</div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>JPG, PNG, PDF — max 5 Mo</div>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, fontSize: 13, padding: 12, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }}>Annuler</button>
          <button onClick={submit} disabled={uploading || !file} style={{ flex: 2, fontSize: 13, padding: 12, borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', opacity: (uploading || !file) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {uploading ? <><Clock size={14} /> Upload…</> : '✓ Valider la preuve'}
          </button>
        </div>
      </div>
    </div>
  )
}
