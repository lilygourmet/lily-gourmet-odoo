import { useState, useEffect, useRef } from 'react'
import { loadQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply, uploadConversationMedia, getMediaSignedUrl } from '../../lib/conversations'
import { confirmDialog } from '../../lib/confirmDialog'

// Émojis suggérés pour repérer une phrase d'un coup d'œil.
const EMOJI_SUGGESTIONS = ['💳', '🚚', '📍', '🕒', '💰', '💵', '🛒', '🎂', '🎉', '👋', '🙏', '✅', '📦', '📋', '📞', '⏳', '💬', '⭐', '❤️', '🔥', '😊', '📸']

// Écran de gestion des phrases types (communes à l'équipe).
export default function QuickRepliesModal({ onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('')
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mediaPath, setMediaPath] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const scrollRef = useRef(null)

  async function onPickPhoto(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Image uniquement.'); return }
    setUploadingPhoto(true); setError('')
    try {
      const path = await uploadConversationMedia(f, 'quick-replies')
      setMediaPath(path)
      setMediaPreview(await getMediaSignedUrl(path))
    } catch (e2) { setError(e2.message) }
    finally { setUploadingPhoto(false) }
  }

  async function refresh() {
    setLoading(true)
    try { setItems(await loadQuickReplies()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function startEdit(it) {
    setEditingId(it.id); setLabel(it.label); setBody(it.body); setEmoji(it.emoji || '')
    setMediaPath(it.media_path || null)
    setMediaPreview(null)
    // Remonter automatiquement vers le formulaire d'édition (pas besoin de scroller).
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
    if (it.media_path) {
      try { setMediaPreview(await getMediaSignedUrl(it.media_path)) } catch (_) { /* ignore */ }
    }
  }
  function resetForm() {
    setEditingId(null); setLabel(''); setBody(''); setEmoji(''); setMediaPath(null); setMediaPreview(null)
  }

  async function handleSave() {
    if (!label.trim() || (!body.trim() && !mediaPath)) return
    setBusy(true); setError('')
    try {
      if (editingId) await updateQuickReply(editingId, label, body, mediaPath, emoji)
      else await createQuickReply(label, body, mediaPath, emoji)
      resetForm()
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function handleDelete(id) {
    if (!await confirmDialog('Supprimer cette phrase ?', { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteQuickReply(id); if (editingId === id) resetForm(); await refresh() }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div ref={scrollRef} className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Émoji (optionnel)</label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text" value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4}
              placeholder="—"
              className="w-12 px-2 py-2 text-[18px] text-center bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux"
            />
            <div className="flex flex-wrap gap-1 flex-1">
              {EMOJI_SUGGESTIONS.map(e => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  className={`w-7 h-7 rounded-lg text-[15px] flex items-center justify-center transition-all ${emoji === e ? 'bg-bordeaux/15 ring-1 ring-bordeaux' : 'hover:bg-cream'}`}>{e}</button>
              ))}
              {emoji && (
                <button type="button" onClick={() => setEmoji('')} title="Aucun émoji"
                  className="w-7 h-7 rounded-lg text-[12px] text-ink-mute hover:bg-cream flex items-center justify-center">✕</button>
              )}
            </div>
          </div>

          <label className="block text-[11px] font-medium text-ink-soft mb-1">Texte du message</label>
          <textarea
            value={body} onChange={e => setBody(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux resize-y"
          />

          {/* Photo optionnelle */}
          <label className="block text-[11px] font-medium text-ink-soft mt-2 mb-1">Photo (optionnelle)</label>
          {mediaPreview ? (
            <div className="relative inline-block">
              <img src={mediaPreview} alt="" className="w-16 h-16 object-cover rounded border border-line" />
              <button type="button" onClick={() => { setMediaPath(null); setMediaPreview(null) }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-bordeaux text-cream text-[11px] flex items-center justify-center" title="Retirer">×</button>
            </div>
          ) : (
            <label className="inline-flex items-center px-3 py-1.5 text-[11px] border border-line rounded-lg text-ink-soft hover:border-bordeaux cursor-pointer">
              {uploadingPhoto ? 'Envoi…' : 'Ajouter une photo'}
              <input type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            </label>
          )}

          <div className="flex gap-2 mt-3">
            {editingId && (
              <button onClick={resetForm} className="px-3 py-1.5 text-[11px] border border-line rounded-lg text-ink-soft hover:bg-cream">Annuler</button>
            )}
            <button
              onClick={handleSave}
              disabled={busy || uploadingPhoto || !label.trim() || (!body.trim() && !mediaPath)}
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
                  <span className="text-[13px] font-medium text-ink">{it.emoji ? it.emoji + ' ' : ''}{it.label}</span>
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
