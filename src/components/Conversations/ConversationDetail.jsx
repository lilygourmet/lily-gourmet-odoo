import { useState, useEffect, useRef } from 'react'
import { loadConversation, loadMessages, assignConversation, sendMessage, uploadConversationMedia, getMediaSignedUrl, closeConversation, reopenConversation, loadQuickReplies, suggestReplies } from '../../lib/conversations'
import { formatRelativeTime } from '../../lib/auth'
import ForwardModal from './ForwardModal'
import { supabase } from '../../lib/supabase'

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const TONE_LABEL = { formelle: 'Formelle', amicale: 'Amicale', directe: 'Directe' }

// Choisit un format d'enregistrement supporté par le navigateur
// (ogg/opus sur Firefox, mp4 sur Safari, webm sur Chrome).
function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c } catch (_) { /* ignore */ }
  }
  return ''
}

// Compte les occurrences d'un terme dans un texte (insensible à la casse).
function countOccurrences(text, term) {
  const s = text.toLowerCase(); const t = term.toLowerCase()
  let n = 0, from = 0
  while (true) { const i = s.indexOf(t, from); if (i === -1) break; n++; from = i + t.length }
  return n
}

// Surligne chaque occurrence ; nextIndex() attribue un id global pour la navigation.
function renderHighlighted(text, term, nextIndex, activeIndex) {
  const out = []; const s = text.toLowerCase(); const t = term.toLowerCase()
  let from = 0, key = 0
  while (true) {
    const i = s.indexOf(t, from)
    if (i === -1) { out.push(text.slice(from)); break }
    if (i > from) out.push(text.slice(from, i))
    const idx = nextIndex()
    out.push(
      <mark key={`m${key++}`} id={`tmatch-${idx}`} className={idx === activeIndex ? 'bg-amber-300 ring-2 ring-amber-500 rounded px-0.5' : 'bg-amber-200 rounded px-0.5'}>
        {text.slice(i, i + t.length)}
      </mark>
    )
    from = i + t.length
  }
  return out
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
  const [statusBusy, setStatusBusy] = useState(false)
  const [headerTop, setHeaderTop] = useState(0)
  const [suggestions, setSuggestions] = useState([])
  const [suggesting, setSuggesting] = useState(false)
  // Photo d'une phrase type, préparée pour l'envoi (option B)
  const [stagedMediaPath, setStagedMediaPath] = useState(null)
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState(null)
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  const [threadSearch, setThreadSearch] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [mediaUrls, setMediaUrls] = useState({}) // messageId -> URL signée
  const [showEmoji, setShowEmoji] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [quickReplies, setQuickReplies] = useState([])
  const [forwardMsg, setForwardMsg] = useState(null)
  // Dernière visite capturée au montage (pour colorer les nouveaux messages reçus)
  const visitedAtRef = useRef(user?.last_visited_conversations || null)
  const textareaRef = useRef(null)
  const threadRef = useRef(null)
  const emojiContainerRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const recordStreamRef = useRef(null)
  const recordMimeRef = useRef('')
  const sendOnStopRef = useRef(false)

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

  // Temps réel : ajoute les nouveaux messages de cette conversation sans recharger.
  // Pas de filtre serveur (peu fiable) -> on filtre côté app par conversation_id.
  useEffect(() => {
    const channel = supabase
      .channel(`conv-thread-${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          if (!m || Number(m.conversation_id) !== Number(conversationId)) return
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [conversationId])

  // Mesure la hauteur du bandeau de l'app pour poser l'en-tête juste en dessous
  useEffect(() => {
    function measure() { setHeaderTop(document.getElementById('app-header')?.offsetHeight || 0) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Affiche les derniers messages en bas (comme WhatsApp). On remonte pour
  // voir les anciens. On ne scrolle pas pendant une recherche dans le fil.
  useEffect(() => {
    if (threadSearch.trim() || messages.length === 0) return
    requestAnimationFrame(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight })
  }, [messages, threadSearch])

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

  // Insère un texte à la position du curseur dans la zone d'écriture
  function insertAtCursor(snippet) {
    const el = textareaRef.current
    if (!el) { setText(t => t + snippet); return }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    setText(el.value.slice(0, start) + snippet + el.value.slice(end))
    requestAnimationFrame(() => { el.focus(); const p = start + snippet.length; el.setSelectionRange(p, p) })
  }

  async function openReplies() {
    setShowReplies(o => !o)
    if (quickReplies.length === 0) {
      try { setQuickReplies(await loadQuickReplies()) } catch (_) { /* ignore */ }
    }
  }

  // Choisir une phrase type : insère le texte + prépare la photo (si présente)
  async function pickQuickReply(q) {
    setShowReplies(false)
    if (q.body) insertAtCursor(q.body)
    if (q.media_path) {
      setStagedMediaPath(q.media_path)
      try { setStagedPreviewUrl(await getMediaSignedUrl(q.media_path)) } catch (_) { setStagedPreviewUrl(null) }
    }
  }

  async function handleSend() {
    if (!conv) return
    const trimmed = text.trim()
    if (!trimmed && !file && !stagedMediaPath) return
    setSending(true)
    setSendError('')
    try {
      let mediaPath = null
      if (file) mediaPath = await uploadConversationMedia(file, user.id)
      else if (stagedMediaPath) mediaPath = stagedMediaPath
      const msg = await sendMessage({
        conversationId,
        clientPhone: conv.client_phone,
        userId: user.id,
        text: trimmed || null,
        mediaPath,
      })
      setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg])
      setText('')
      setFile(null)
      setStagedMediaPath(null)
      setStagedPreviewUrl(null)
      setSuggestions([])
      if (conv.status === 'fermee') {
        try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ }
      }
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  // Nettoyage si on quitte la conversation en plein enregistrement
  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    if (recordStreamRef.current) recordStreamRef.current.getTracks().forEach(t => t.stop())
  }, [])

  async function sendVoice(audioFile) {
    if (!conv) return
    setSending(true)
    setSendError('')
    try {
      const mediaPath = await uploadConversationMedia(audioFile, user.id)
      const msg = await sendMessage({
        conversationId,
        clientPhone: conv.client_phone,
        userId: user.id,
        text: null,
        mediaPath,
        mediaType: 'audio',
      })
      setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg])
      setSuggestions([])
      if (conv.status === 'fermee') {
        try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ }
      }
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function handleRecordStop() {
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach(t => t.stop())
      recordStreamRef.current = null
    }
    const chunks = chunksRef.current
    chunksRef.current = []
    if (!sendOnStopRef.current || chunks.length === 0) return
    const mime = recordMimeRef.current || 'audio/webm'
    const cleanType = mime.split(';')[0]
    const ext = cleanType.includes('ogg') ? 'ogg' : cleanType.includes('mp4') ? 'mp4' : 'webm'
    const f = new File([new Blob(chunks, { type: cleanType })], `vocal-${Date.now()}.${ext}`, { type: cleanType })
    await sendVoice(f)
  }

  async function startRecording() {
    if (!conv) return
    setSendError('')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSendError("L'enregistrement vocal n'est pas supporté par ce navigateur.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordStreamRef.current = stream
      const mime = pickAudioMime()
      recordMimeRef.current = mime
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = handleRecordStop
      mediaRecorderRef.current = mr
      mr.start()
      sendOnStopRef.current = false
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch (e) {
      setSendError('Micro non autorisé ou indisponible.')
    }
  }

  function finishRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop() // déclenche handleRecordStop
    setRecording(false)
  }

  function stopAndSend() { sendOnStopRef.current = true; finishRecording() }
  function cancelRecording() { sendOnStopRef.current = false; finishRecording() }

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

  async function handleClose() {
    setStatusBusy(true)
    try { setConv(await closeConversation(conversationId, user.id)) }
    catch (e) { alert('Erreur : ' + e.message) }
    finally { setStatusBusy(false) }
  }

  async function handleReopen() {
    setStatusBusy(true)
    try { setConv(await reopenConversation(conversationId, user.id)) }
    catch (e) { alert('Erreur : ' + e.message) }
    finally { setStatusBusy(false) }
  }

  async function handleSuggest() {
    if (!conv) return
    setSuggesting(true)
    setSendError('')
    try {
      const s = await suggestReplies(conversationId, user.id)
      if (s.length === 0) setSendError('Aucune suggestion.')
      setSuggestions(s)
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSuggesting(false)
    }
  }

  // Recherche dans le fil : remet à zéro la position quand le terme change
  useEffect(() => { setMatchIndex(0) }, [threadSearch])
  // Défile jusqu'à l'occurrence active
  useEffect(() => {
    if (!threadSearch.trim()) return
    const el = document.getElementById(`tmatch-${matchIndex}`)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [matchIndex, threadSearch, messages])

  const threadTerm = threadSearch.trim()
  const threadMatches = threadTerm
    ? messages.reduce((acc, m) => acc + (m.sender_type !== 'system' && m.body ? countOccurrences(m.body, threadTerm) : 0), 0)
    : 0
  function nextMatch() { if (threadMatches) setMatchIndex(i => (i + 1) % threadMatches) }
  function prevMatch() { if (threadMatches) setMatchIndex(i => (i - 1 + threadMatches) % threadMatches) }
  let matchCounter = 0
  const nextHl = () => matchCounter++

  return (
    <div className="flex flex-col mx-auto w-full max-w-3xl" style={{ height: `calc(100dvh - ${headerTop}px)` }}>
      {/* En-tête : retour + infos contact + bouton Je prends */}
      <div className="bg-bordeaux text-cream flex items-center gap-2 flex-wrap px-4 py-2 shadow-sm flex-shrink-0">
        <button
          onClick={onBack}
          className="md:hidden w-9 h-9 rounded-full border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          title="Retour à la liste"
        >←</button>
        <button
          onClick={() => setThreadSearchOpen(o => !o)}
          className="w-9 h-9 rounded-full border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          title="Rechercher dans la conversation"
        >🔍</button>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium text-cream truncate">{conv?.client_name || conv?.client_phone || '…'}</div>
          {conv?.client_name && <div className="font-mono text-[11px] text-cream/70">{conv.client_phone}</div>}
        </div>
        {conv && (
          conv.assigned_to ? (
            <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-cream/15 text-cream flex-shrink-0">
              {conv.assigned_to === user.id ? 'À moi' : `Pris par ${conv.assigned?.full_name || conv.assigned?.username || '?'}`}
            </span>
          ) : (
            <button
              onClick={handleAssign}
              disabled={assigning}
              className="px-4 py-1.5 bg-cream text-bordeaux hover:bg-cream-warm rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-60"
            >
              {assigning ? '…' : 'Je prends'}
            </button>
          )
        )}
        {conv && (
          conv.status === 'fermee' ? (
            <button
              onClick={handleReopen}
              disabled={statusBusy}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux transition-all flex-shrink-0 disabled:opacity-60"
            >Rouvrir</button>
          ) : (
            <button
              onClick={handleClose}
              disabled={statusBusy}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux transition-all flex-shrink-0 disabled:opacity-60"
            >Clôturer</button>
          )
        )}
      </div>

      {threadSearchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-line flex-shrink-0">
          <input
            type="text"
            value={threadSearch}
            onChange={e => setThreadSearch(e.target.value)}
            autoFocus
            placeholder="Chercher dans la conversation…"
            className="flex-1 px-3 py-1.5 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux"
          />
          <span className="text-[11px] font-mono text-ink-mute flex-shrink-0">{threadMatches ? `${matchIndex + 1}/${threadMatches}` : '0/0'}</span>
          <button onClick={prevMatch} disabled={!threadMatches} className="w-8 h-8 rounded-full border border-line text-ink-soft hover:bg-cream-warm disabled:opacity-40 flex-shrink-0" title="Précédent">↑</button>
          <button onClick={nextMatch} disabled={!threadMatches} className="w-8 h-8 rounded-full border border-line text-ink-soft hover:bg-cream-warm disabled:opacity-40 flex-shrink-0" title="Suivant">↓</button>
          <button onClick={() => { setThreadSearch(''); setThreadSearchOpen(false) }} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex-shrink-0" title="Fermer">✕</button>
        </div>
      )}

      {/* Fil de discussion (zone qui défile, l'en-tête et la réponse restent fixes) */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3">
      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}

      {!loading && !error && messages.length === 0 && (
        <div className="text-center py-8 text-ink-mute italic">Aucun message.</div>
      )}

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
          const isNewClient = !isAgent && m.sent_at && (!visitedAtRef.current || m.sent_at > visitedAtRef.current)
          return (
            <div key={m.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                isAgent ? 'bg-bordeaux text-cream' : isNewClient ? 'bg-amber-100 text-ink border border-amber-300' : 'bg-cream-warm text-ink border border-line'
              }`}>
                {m.media_url && (() => {
                  const href = m.media_url.startsWith('http') ? m.media_url : mediaUrls[m.id]
                  const mt = m.media_type || ''
                  const isAudio = /audio|voice|ptt/i.test(mt) || /\.(ogg|opus|webm|mp4|m4a|mp3|aac|amr)$/i.test(m.media_url)
                  const isImage = /image/i.test(mt) || /\.(jpe?g|png|gif|webp)$/i.test(m.media_url)
                  if (!href) return <span className="block text-[11px] mb-1 opacity-70">{isAudio ? '🎤 Vocal…' : isImage ? '🖼 Image…' : '📎 Pièce jointe…'}</span>
                  if (isAudio) return <audio controls src={href} className="block max-w-full mb-1" />
                  if (isImage) return (
                    <a href={href} target="_blank" rel="noopener noreferrer" title="Ouvrir en grand">
                      <img src={href} alt="" className="block max-w-[160px] max-h-[160px] object-cover rounded mb-1" />
                    </a>
                  )
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="block text-[11px] underline mb-1 opacity-90">
                      📎 Pièce jointe
                    </a>
                  )
                })()}
                {m.body && <div className="text-[13px] whitespace-pre-wrap break-words">{threadTerm ? renderHighlighted(m.body, threadTerm, nextHl, matchIndex) : m.body}</div>}
                <div className={`flex items-center gap-2 mt-1 ${isAgent ? 'justify-end' : ''}`}>
                  <span className={`text-[9px] ${isAgent ? 'text-cream/70' : 'text-ink-mute'}`}>
                    {isAgent && m.sender?.full_name ? `${m.sender.full_name} · ` : ''}{fmtTime(m.sent_at)}
                  </span>
                  <button
                    onClick={() => setForwardMsg(m)}
                    className={`text-[11px] leading-none ${isAgent ? 'text-cream/70 hover:text-cream' : 'text-ink-mute hover:text-bordeaux'}`}
                    title="Transférer ce message"
                  >↪</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {/* Zone de réponse (toujours fixée en bas) */}
      <div className="bg-cream px-4 pt-2 pb-3 border-t border-line flex-shrink-0">
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setText(s.text); setSuggestions([]); requestAnimationFrame(() => textareaRef.current?.focus()) }}
                className="text-left rounded-lg border border-bordeaux/30 bg-bordeaux/5 px-3 py-2 hover:border-bordeaux transition-colors"
              >
                <div className="text-[9px] font-mono uppercase tracking-wider text-bordeaux mb-0.5">✨ {TONE_LABEL[s.tone] || s.tone}</div>
                <div className="text-[12px] text-ink">{s.text}</div>
              </button>
            ))}
          </div>
        )}
        {sendError && <div className="text-[11px] text-bordeaux mb-1">{sendError}</div>}
        {file && (
          <div className="flex items-center gap-2 mb-1.5 text-[11px] text-ink-soft">
            <span className="truncate">📎 {file.name}</span>
            <button onClick={() => setFile(null)} className="text-bordeaux font-bold" title="Retirer">×</button>
          </div>
        )}
        {stagedMediaPath && (
          <div className="flex items-center gap-2 mb-1.5">
            {stagedPreviewUrl && <img src={stagedPreviewUrl} alt="" className="w-10 h-10 object-cover rounded border border-line" />}
            <span className="text-[11px] text-ink-soft">📷 Photo jointe</span>
            <button onClick={() => { setStagedMediaPath(null); setStagedPreviewUrl(null) }} className="text-bordeaux font-bold" title="Retirer">×</button>
          </div>
        )}
        {recording ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-bordeaux animate-pulse text-[14px]">●</span>
            <span className="font-mono text-[13px] text-ink flex-1">Enregistrement… {fmtDuration(recordSeconds)}</span>
            <button
              type="button"
              onClick={cancelRecording}
              className="w-9 h-9 flex-shrink-0 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Annuler"
            >✕</button>
            <button
              type="button"
              onClick={stopAndSend}
              disabled={sending}
              className="px-4 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-50"
              title="Envoyer le vocal"
            >{sending ? '…' : 'Envoyer ➤'}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px' }}
              rows={1}
              placeholder="Écrire une réponse…"
              className="w-full resize-none max-h-32 px-3 py-2 rounded-2xl border border-line bg-cream-warm text-[13px] text-ink focus:outline-none focus:border-bordeaux"
            />
            <div className="flex items-center gap-2">
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
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={openReplies}
                  className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
                  title="Phrases types"
                >💬</button>
                {showReplies && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setShowReplies(false)} />
                    <div className="absolute bottom-11 left-0 z-[100] w-64 max-w-[80vw] bg-cream border border-line rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto">
                      {quickReplies.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-ink-mute italic">Aucune phrase. Ajoute-en via « 💬 Phrases » dans la liste.</div>
                      ) : quickReplies.map(q => (
                        <button
                          key={q.id}
                          onClick={() => pickQuickReply(q)}
                          className="w-full text-left px-3 py-2 hover:bg-cream-warm transition-colors"
                        >
                          <div className="text-[12px] font-medium text-ink">{q.media_path ? '📷 ' : ''}{q.label}</div>
                          <div className="text-[10px] text-ink-mute truncate">{q.body}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggesting || sending}
                className="w-9 h-9 flex-shrink-0 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all disabled:opacity-50"
                title="Suggérer 3 réponses (IA)"
              >{suggesting ? '…' : '✨'}</button>
              <button
                type="button"
                onClick={startRecording}
                disabled={sending}
                className="w-9 h-9 flex-shrink-0 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all disabled:opacity-50"
                title="Message vocal"
              >🎤</button>
              <button
                onClick={handleSend}
                disabled={sending || (!text.trim() && !file && !stagedMediaPath)}
                className="ml-auto px-4 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-50"
              >
                {sending ? '…' : 'Envoyer'}
              </button>
            </div>
          </div>
        )}
      </div>

      {forwardMsg && (
        <ForwardModal
          sourceMessage={forwardMsg}
          currentConversationId={conversationId}
          user={user}
          onClose={() => setForwardMsg(null)}
        />
      )}
    </div>
  )
}
