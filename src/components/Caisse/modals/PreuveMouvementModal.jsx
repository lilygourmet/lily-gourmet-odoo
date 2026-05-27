import { useState, useRef } from 'react'

/**
 * Modal pour :
 *  - uploader une preuve (photo / PDF) pour un mouvement sortie
 *  - visualiser la preuve existante
 *  - déclarer "pas de preuve"
 *  - réinitialiser le statut
 *
 * Props :
 *  - mvt : le mouvement
 *  - onClose() : fermer le modal
 *  - onUpload(file) : appeler quand un fichier est choisi
 *  - onDeclareNoProof() : appeler si "pas de preuve"
 *  - onReset() : appeler si reset
 */
export default function PreuveMouvementModal({ mvt, onClose, onUpload, onDeclareNoProof, onReset }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const status = mvt?.proof_status || 'legacy'
  const hasProof = !!mvt?.proof_url

  async function handleUpload() {
    if (!file) { setError('Choisis un fichier'); return }
    const maxSize = 10 * 1024 * 1024 // 10 Mo
    if (file.size > maxSize) { setError('Fichier trop gros (max 10 Mo)'); return }

    setUploading(true); setError(null)
    try {
      await onUpload(file)
    } catch (e) {
      setError(e?.message || 'Erreur lors de l\'upload')
      setUploading(false)
    }
  }

  function pickFile() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError(null) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1a0f0a' }}>
            📎 Preuve de paiement
          </h3>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        {/* Résumé mouvement */}
        <div style={{ padding: '10px 12px', background: '#F9F6F1', borderRadius: 6, fontSize: 12, color: '#1a0f0a', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span>{mvt.label}</span>
            <strong style={{ color: '#99201E' }}>− {Math.abs(mvt.amount)} dh</strong>
          </div>
          {mvt.category && <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 4 }}>{mvt.category}</div>}
        </div>

        {/* Preuve existante */}
        {hasProof && (
          <div style={{ marginBottom: 14, padding: 12, background: '#F0F8E8', border: '1px solid #C8E0AC', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#27500A', fontWeight: 500, marginBottom: 8 }}>✅ Preuve actuelle</div>
            <a href={mvt.proof_url} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-block', fontSize: 12, color: '#993556', textDecoration: 'underline'
            }}>🔗 Ouvrir la preuve dans un nouvel onglet</a>
            {mvt.proof_uploaded_at && (
              <div style={{ fontSize: 10, color: '#4a3a30', marginTop: 6 }}>
                Uploadée le {new Date(mvt.proof_uploaded_at).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
        )}

        {/* Statut "pas de preuve" */}
        {status === 'no_proof_declared' && !hasProof && (
          <div style={{ marginBottom: 14, padding: 12, background: '#F0EEEA', border: '1px solid #D8D4CC', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#4a3a30' }}>
              ⚠️ Tu as déclaré qu'il n'y avait pas de preuve pour ce mouvement.
            </div>
            <button onClick={onReset} style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', background: 'white', border: '1px solid #D8D4CC', borderRadius: 6, cursor: 'pointer', color: '#4a3a30' }}>
              Annuler ce statut
            </button>
          </div>
        )}

        {/* Section upload */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 8 }}>
            {hasProof ? 'Remplacer par une autre preuve' : 'Uploader une preuve'}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <button type="button" onClick={pickFile} style={{
            width: '100%', padding: '14px 12px', borderRadius: 8,
            border: '2px dashed #e5d8c3', background: '#FAFAF8', cursor: 'pointer',
            color: '#4a3a30', fontSize: 13
          }}>
            {file ? `📄 ${file.name}` : '📷 Choisir une photo ou un PDF'}
          </button>

          {file && (
            <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 6, textAlign: 'center' }}>
              {(file.size / 1024).toFixed(1)} Ko
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleUpload} disabled={!file || uploading} style={{
            ...btnPrimary, flex: 1, opacity: (!file || uploading) ? 0.5 : 1
          }}>
            {uploading ? 'Upload en cours…' : '📤 Uploader cette preuve'}
          </button>
        </div>

        {/* "Pas de preuve" disponible uniquement si statut = pending et pas d'image actuelle */}
        {status === 'pending' && !hasProof && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e5d8c3' }}>
            <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 6 }}>
              Pas de reçu disponible pour cet achat ?
            </div>
            <button onClick={onDeclareNoProof} disabled={uploading} style={{
              fontSize: 12, padding: '8px 14px', borderRadius: 8,
              background: 'white', border: '1px solid #e5d8c3', cursor: 'pointer', color: '#4a3a30'
            }}>
              ❌ Déclarer "Pas de preuve de paiement"
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 22, maxWidth: 480, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }
const btnPrimary = { fontSize: 13, padding: '10px 16px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
