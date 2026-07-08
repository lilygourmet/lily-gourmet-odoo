import { useState, useEffect } from 'react'
import { loadConversations, sendMessage } from '../../lib/conversations'

// Transfère un message vers une conversation existante (choisie dans la liste).
export default function ForwardModal({ sourceMessage, currentConversationId, user, onClose, onDone }) {
  const [convs, setConvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [doneName, setDoneName] = useState('')

  useEffect(() => {
    loadConversations('all', user.id)
      .then(d => setConvs(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const term = search.trim().toLowerCase()
  const list = convs
    .filter(c => c.id !== currentConversationId)
    .filter(c => !term || (c.client_name || '').toLowerCase().includes(term) || (c.client_phone || '').toLowerCase().includes(term))

  async function handlePick(target) {
    setBusy(true); setError('')
    try {
      const mediaPath = (sourceMessage.media_url && !sourceMessage.media_url.startsWith('http')) ? sourceMessage.media_url : null
      if (!sourceMessage.body && !mediaPath) {
        setError('Ce message ne peut pas être transféré (média non disponible).')
        setBusy(false); return
      }
      await sendMessage({
        conversationId: target.id,
        clientPhone: target.client_phone,
        userId: user.id,
        text: sourceMessage.body || null,
        mediaPath,
        mediaType: sourceMessage.media_type || null,
      })
      setDoneName(target.client_name || target.client_phone)
      onDone?.(target.id)
      setTimeout(onClose, 900)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-fraunces italic text-[20px] text-ink">Transférer à…</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">✕</button>
        </div>

        <div className="text-[11px] text-ink-mute bg-cream-warm border border-line rounded-lg p-2 mb-3 truncate">
          {sourceMessage.body || (sourceMessage.media_url ? 'Pièce jointe' : '')}
        </div>

        {doneName ? (
          <div className="text-[13px] text-bordeaux py-3">Transféré à {doneName}</div>
        ) : (
          <>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un client…"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux mb-2"
            />
            {error && <div className="text-[12px] text-bordeaux mb-2">{error}</div>}
            {loading ? (
              <div className="text-[12px] text-ink-mute italic py-2">Chargement…</div>
            ) : (
              <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                {list.map(c => (
                  <button
                    key={c.id} onClick={() => handlePick(c)} disabled={busy}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-cream-warm transition-colors disabled:opacity-50"
                  >
                    <div className="text-[13px] text-ink truncate">{c.client_name || c.client_phone}</div>
                    {c.client_name && <div className="text-[10px] text-ink-mute">{c.client_phone}</div>}
                  </button>
                ))}
                {list.length === 0 && <div className="text-[12px] text-ink-mute italic py-2">Aucun client.</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
