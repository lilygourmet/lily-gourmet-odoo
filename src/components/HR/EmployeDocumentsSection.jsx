import { useState, useEffect } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { listEmployeeDocuments, uploadEmployeeDocument, deleteEmployeeDocument, getEmployeeDocumentUrl } from '../../lib/hrDocuments'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

const TYPES = ['CIN', 'Contrat', 'CNSS', 'Diplôme', 'Attestation', 'Autre']

// Section "Documents" d'un employé (CIN, contrat…) dans la fiche.
export default function EmployeDocumentsSection({ employeId, user }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('CIN')
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    setDocs(await listEmployeeDocuments(employeId))
    setLoading(false)
  }
  useEffect(() => { reload() }, [employeId])

  async function onPick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      await uploadEmployeeDocument(f, employeId, type, user?.id)
      await reload()
      toast.success('Document ajouté ✓')
    } catch (err) { toast.error('Erreur : ' + (err?.message || err)) }
    finally { setBusy(false) }
  }

  async function open(d) {
    const url = await getEmployeeDocumentUrl(d.storage_path)
    if (url) window.open(url, '_blank'); else toast.error('Impossible d\'ouvrir le document')
  }

  async function remove(d) {
    if (!await confirmDialog(`Supprimer « ${d.original_filename} » ?`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteEmployeeDocument(d.id, d.storage_path); await reload() }
    catch (err) { toast.error('Erreur : ' + (err?.message || err)) }
  }

  return (
    <div style={{ background: '#F4F0EA', padding: 12, borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <FileText size={14} /> Documents (CIN, contrat…)
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ padding: '7px 9px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8, background: 'white' }}>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #993556', color: '#993556', borderRadius: 8, cursor: 'pointer', background: 'white' }}>
          {busy ? 'Envoi…' : '+ Ajouter un fichier'}
          <input type="file" accept="image/*,application/pdf" onChange={onPick} style={{ display: 'none' }} disabled={busy} />
        </label>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: '#8a7a70' }}>Chargement…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 12, color: '#8a7a70', fontStyle: 'italic' }}>Aucun document.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #eee4d4', borderRadius: 8, padding: '7px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#993556', background: '#F7E3EA', padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>{d.type}</span>
              <button type="button" onClick={() => open(d)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#1456a0', fontSize: 12, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.original_filename}
              </button>
              <button type="button" onClick={() => remove(d)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', flexShrink: 0, display: 'inline-flex' }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
