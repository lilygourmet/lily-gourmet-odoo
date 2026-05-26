import { useState, useEffect, useRef } from 'react'
import { loadConversation, loadMessages, assignConversation, sendMessage, uploadConversationMedia, getMediaSignedUrl } from '../../lib/conversations'
import { formatRelativeTime } from '../../lib/auth'

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ConversationDetail({ conversationId, user, onBack }) {
  const [conv, setConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [mediaUrls, setMediaUrls] = useState({}) // messageId -> URL signée
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef(null)
  const emojiContainerRef = useRef(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, msgs] = await Promise.all([
        loadConversation(conversationId),
        loadMessages(conversationId),
      ])
      setConv(c)
      setMessages(msgs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [conversationId])

  // Génère les URL signées pour les pièces jointes stockées (chemin = pas une URL http)
  useEffect(() => {
    let cancelled = false
    const toSign = messages.filter(m => m.media_url && !m.media_url.startsWith('http') && !mediaUrls[m.id])
    if (toSign.length === 0) return
    Promise.all(toSign.map(async m => {
      try { return [m.id, await getMediaSignedUrl(m.media_url)] } catch { return [m.id, null] }
    })).then(pairs => {
      if (cancelled) return
      setMediaUrls(prev => {
        const next = { ...prev }
        for (const [id, url] of pairs) next[id] = url
        return next
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // Picker emoji (emoji-mart "vanilla", chargé à l'ouverture pour rester léger)
  useEffect(() => {
    if (!showEmoji) return
    let picker = null
    let cancelled = false
    const handleSelect = (emoji) => {
      const native = emoji?.native || ''
      if (!native) return
      const el = textareaRef.current
      if (!el) { setText(prev => prev + native); return }
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      setText(el.value.slice(0, start) + native + el.value.slice(end))
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(start + native.length, start + native.length)
      })
    }
    Promise.all([import('emoji-mart'), import('@emoji-mart/data')])
      .then(([mart, dataMod]) => {
        if (cancelled || !emojiContainerRef.current) return
        picker = new mart.Picker({
          data: dataMod.default,
          onEmojiSelect: handleSelect,
          locale: 'fr',
          theme: 'light',
          previewPosition: 'none',
        })
        emojiContainerRef.current.appendChild(picker)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (picker && picker.parentNode) picker.parentNode.removeChild(picker)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEmoji])

  function onPickFile(e) {
    const f = e.target.files?.[0]
    e.target.value = '' // permet de re-choisir le même fichier
    if (!f) return
    const okType = f.type.startsWith('image/') || f.type === 'application/pdf'
    if (!okType) { setSendError('Seules les images et les PDF sont acceptés.'); return }
    if (f.size > 5 * 1024 * 1024) { setSendError('Fichier trop volumineux (max 5 MB).'); return }
    setSendError('')
    setFile(f)
  }

  async function handleSend() {
    if (!conv) return
    const trimmed = text.trim()
    if (!trimmed && !file) return
    setSending(true)
    setSendError('')
    try {
      let mediaPath = null
      if (file) mediaPath = await uploadConversationMedia(file, user.id)
      const msg = await sendMessage({
        conversationId,
        clientPhone: conv.client_phone,
        userId: user.id,
        text: trimmed || null,
        mediaPath,
      })
      setMessages(prev => [...prev, msg])
      setText('')
      setFile(null)
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function handleAssign() {
    setAssigning(true)
    try {
      const updated = await assignConversation(conversationId, user.id)
      setConv(updated)
    } catch (e) {
      alert('Erreur : ' + e.message)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-32">
      {/* En-tête : retour + infos contact + bouton Je prends */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          title="Retour à la liste"
        >←</button>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium text-ink truncate">{conv?.client_name || conv?.client_phone || '…'}</div>
          {conv?.client_name && <div className="font-mono text-[11px] text-ink-mute">{conv.client_phone}</div>}
        </div>
        {conv && (
          conv.assigned_to ? (
            <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-bordeaux/10 text-bordeaux flex-shrink-0">
              {conv.assigned_to === user.id ? 'À moi' : `Pris par ${conv.assigned?.full_name || conv.assigned?.username || '?'}`}
            </span>
          ) : (
            <button
              onClick={handleAssign}
              disabled={assigning}
              className="px-4 py-1.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-60"
            >
              {assigning ? '…' : 'Je prends'}
            </button>
          )
        )}
      </div>

      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}

      {!loading && !error && messages.length === 0 && (
        <div className="text-center py-8 text-ink-mute italic">Aucun message.</div>
      )}

      {/* Fil de discussion */}
      <div className="space-y-2">
        {messages.map(m => {
          if (m.sender_type === 'system') {
            return (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[10px] text-ink-mute italic px-3 py-1">{m.body}</span>
              </div>
            )
          }
          const isAgent = m.sender_type === 'agent'
          return (
            <div key={m.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                isAgent ? 'bg-bordeaux text-cream' : 'bg-cream-warm text-ink border border-line'
              }`}>
                {m.media_url && (() => {
                  const href = m.media_url.startsWith('http') ? m.media_url : mediaUrls[m.id]
                  return href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="block text-[11px] underline mb-1 opacity-90">
                      📎 Pièce jointe
                    </a>
                  ) : (
                    <span className="block text-[11px] mb-1 opacity-70">📎 Pièce jointe…</span>
                  )
                })()}
                {m.body && <div className="text-[13px] whitespace-pre-wrap break-words">{m.body}</div>}
                <div className={`text-[9px] mt-1 ${isAgent ? 'text-cream/70' : 'text-ink-mute'}`}>
                  {isAgent && m.sender?.full_name ? `${m.sender.full_name} · ` : ''}{fmtTime(m.sent_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Zone de réponse */}
      <div className="sticky bottom-0 bg-cream pt-2 pb-3 mt-3 border-t border-line">
        {sendError && <div className="text-[11px] text-bordeaux mb-1">{sendError}</div>}
        {file && (
          <div className="flex items-center gap-2 mb-1.5 text-[11px] text-ink-soft">
            <span className="truncate">📎 {file.name}</span>
            <button onClick={() => setFile(null)} className="text-bordeaux font-bold" title="Retirer">×</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="w-9 h-9 flex-shrink-0 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center cursor-pointer transition-all" title="Joindre une image ou un PDF (max 5 MB)">
            📎
            <input type="file" accept="image/*,application/pdf" onChange={onPickFile} className="hidden" />
          </label>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowEmoji(v => !v)}
              className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Emojis"
            >😊</button>
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-[90]" onClick={() => setShowEmoji(false)} />
                <div ref={emojiContainerRef} className="absolute bottom-11 left-0 z-[100]" />
              </>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px' }}
            rows={1}
            placeholder="Écrire une réponse…"
            className="flex-1 resize-none max-h-32 px-3 py-2 rounded-2xl border border-line bg-cream-warm text-[13px] text-ink focus:outline-none focus:border-bordeaux"
          />
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && !file)}
            className="px-4 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-50"
          >
            {sending ? '…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  )
}
