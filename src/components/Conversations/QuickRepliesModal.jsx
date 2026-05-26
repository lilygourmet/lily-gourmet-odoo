import { useState, useEffect } from 'react'
import { loadQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply } from '../../lib/conversations'

// Écran de gestion des phrases types (communes à l'équipe).
export default function QuickRepliesModal({ onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setLoading(true)
    try { setItems(await loadQuickReplies()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  function startEdit(it) {
    setEditingId(it.id); setLabel(it.label); setBody(it.body)
  }
  function resetForm() {
    setEditingId(null); setLabel(''); setBody('')
  }

  async function handleSave() {
    if (!label.trim() || !body.trim()) return
    setBusy(true); setError('')
    try {
      if (editingId) await updateQuickReply(editingId, label, body)
      else await createQuickReply(label, body)
      resetForm()
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette phrase ?')) return
    try { await deleteQuickReply(id); if (editingId === id) resetForm(); await refresh() }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-fraunces italic text-[20px] text-ink">Phrases types</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">✕</button>
        </div>

        {error && <div className="text-[12px] text-bordeaux mb-2">{error}</div>}

        {/* Formulaire ajout / édition */}
        <div className="bg-cream-warm border border-line rounded-lg p-3 mb-4">
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Nom court (ex. « RIB »)</label>
          <input
            type="text" value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-2"
          />
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Texte du message</label>
          <textarea
            value={body} onChange={e => setBody(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux resize-y"
          />
          <div className="flex gap-2 mt-2">
            {editingId && (
              <button onClick={resetForm} className="px-3 py-1.5 text-[11px] border border-line rounded-lg text-ink-soft hover:bg-cream">Annuler</button>
            )}
            <button
              onClick={handleSave}
              disabled={busy || !label.trim() || !body.trim()}
              className="px-4 py-1.5 text-[11px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50"
            >{editingId ? 'Enregistrer' : 'Ajouter'}</button>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="text-[12px] text-ink-mute italic py-2">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="text-[12px] text-ink-mute italic py-2">Aucune phrase pour l'instant.</div>
        ) : (
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.id} className="bg-cream-warm border border-line rounded-lg p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] font-medium text-ink">{it.label}</span>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(it)} className="text-[11px] text-ink-soft hover:text-bordeaux px-1">Modifier</button>
                    <button onClick={() => handleDelete(it.id)} className="text-[11px] text-bordeaux hover:underline px-1">Suppr.</button>
                  </div>
                </div>
                <div className="text-[11px] text-ink-mute whitespace-pre-wrap">{it.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
