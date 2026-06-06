import { useState, useEffect } from 'react'
import { loadGroupes, createGroupe, renameGroupe, deleteGroupe } from '../../lib/hr'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

// Gestion des groupes d'employés (ajouter / renommer / supprimer).
// Renommer met aussi à jour tous les employés + comptes concernés.
export default function GroupesManager({ onClose, onSaved }) {
  const [groupes, setGroupes] = useState([])
  const [loading, setLoading] = useState(true)
  const [nouveau, setNouveau] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    setGroupes(await loadGroupes())
    setLoading(false)
  }
  useEffect(() => { reload() }, [])
  function notify() { onSaved?.() }

  async function add() {
    if (!nouveau.trim()) return
    setBusy(true)
    try { await createGroupe(nouveau); setNouveau(''); await reload(); notify() }
    catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
    finally { setBusy(false) }
  }
  async function rename(old, val) {
    if (!val.trim() || val.trim() === old) return
    try { await renameGroupe(old, val); await reload(); notify(); toast.success('Renommé ✓') }
    catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
  }
  async function remove(nom) {
    if (!await confirmDialog(`Supprimer le groupe « ${nom} » ?\n\nLes employés de ce groupe n'auront plus de groupe.`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteGroupe(nom); await reload(); notify() }
    catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1a0f0a' }}>⚙️ Gérer les groupes</h3>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        <div style={{ fontSize: 11, color: '#8a7a70', marginBottom: 12 }}>
          Renommer un groupe met aussi à jour tous les employés et comptes qui l'utilisent.
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: '#8a7a70' }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {groupes.map(g => <GroupeRow key={g} nom={g} onRename={rename} onDelete={remove} />)}
            {groupes.length === 0 && <div style={{ fontSize: 13, color: '#8a7a70' }}>Aucun groupe.</div>}
          </div>
        )}

        <div style={{ borderTop: '1px solid #eee4d4', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0f0a', marginBottom: 6 }}>Nouveau groupe</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder="Ex : Ménage" maxLength={40}
              style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
            <button onClick={add} disabled={busy || !nouveau.trim()}
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: '#993556', color: 'white', border: 'none', opacity: busy || !nouveau.trim() ? 0.5 : 1 }}>
              + Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupeRow({ nom, onRename, onDelete }) {
  const [val, setVal] = useState(nom)
  useEffect(() => { setVal(nom) }, [nom])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #eee4d4', borderRadius: 8, padding: '6px 8px' }}>
      <input value={val} onChange={e => setVal(e.target.value)} onBlur={() => onRename(nom, val)}
        style={{ flex: 1, minWidth: 0, padding: '6px 9px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6 }} />
      <button onClick={() => onDelete(nom)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 15, flexShrink: 0 }}>🗑️</button>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 20, maxWidth: 420, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }
