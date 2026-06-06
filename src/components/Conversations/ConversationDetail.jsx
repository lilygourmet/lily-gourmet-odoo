import { useState, useEffect, useRef } from 'react'
import { loadConversation, loadMessages, assignConversation, sendMessage, uploadConversationMedia, getMediaSignedUrl, closeConversation, reopenConversation, loadQuickReplies, suggestReplies, correctText, deleteMessage, markPaymentProof, unmarkPaymentProof, updateConversationClientName, setConversationNameFromOdoo, setConversationUnread, searchOrders, CONV_LABELS, loadConvLabels, setConversationLabels } from '../../lib/conversations'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'
import { formatRelativeTime, canMarkPaymentProof } from '../../lib/auth'
import ForwardModal from './ForwardModal'
import ClientAvatar from './ClientAvatar'
import { createModification } from '../../lib/modifications'
import { uploadJustificatif } from '../../lib/conges'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Search, Pencil, Forward, Banknote, Paperclip, Sparkles, Mic, Smile, MessageSquareText, Send, Image as ImageIcon, Check, X } from 'lucide-react'

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const TONE_LABEL = { formelle: 'Formelle', amicale: 'Amicale', directe: 'Directe' }

// Choisit un format d'enregistrement supporté par le navigateur ET par WhatsApp.
// WhatsApp accepte officiellement : mp4/m4a, ogg/opus, mp3, aac, amr.
// PAS webm — donc on le met en DERNIER recours (mieux que rien).
function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/mp4',                  // Safari + Chrome macOS récent → .m4a (WhatsApp OK)
    'audio/ogg;codecs=opus',      // Firefox → .ogg (WhatsApp OK)
    'audio/webm;codecs=opus',     // Chrome (fallback, WhatsApp KO)
    'audio/webm',
  ]
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
  // Demande de modification de commande
  const [modifOpen, setModifOpen] = useState(false)
  const [modifRef, setModifRef] = useState('')
  const [modifDesc, setModifDesc] = useState('')
  const [modifFile, setModifFile] = useState(null)
  const [modifBusy, setModifBusy] = useState(false)
  // Preuve de paiement : message en cours de marquage + n° commande saisi
  const [paymentMsg, setPaymentMsg] = useState(null)
  const [orderRefInput, setOrderRefInput] = useState('')
  const [clientNameInput, setClientNameInput] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [markBusy, setMarkBusy] = useState(false)
  // Édition du nom du client
  const [nameEditing, setNameEditing] = useState(false)
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [clientOrders, setClientOrders] = useState(null)
  const [ordersBusy, setOrdersBusy] = useState(false)
  const [labelDefs, setLabelDefs] = useState(CONV_LABELS)
  useEffect(() => {
    loadConvLabels().then(setLabelDefs).catch(() => {})
    loadQuickReplies().then(setQuickReplies).catch(() => {})
  }, [])

  async function toggleLabel(key) {
    const cur = conv?.labels || []
    const next = cur.includes(key) ? cur.filter(l => l !== key) : [...cur, key]
    setConv(prev => prev ? { ...prev, labels: next } : prev)
    try { await setConversationLabels(conversationId, next) } catch { load() }
  }

  async function toggleClientOrders() {
    const next = !ordersOpen
    setOrdersOpen(next)
    if (next && clientOrders === null && conv?.client_phone) {
      setOrdersBusy(true)
      try { setClientOrders(await searchOrders(conv.client_phone)) }
      catch { setClientOrders([]) }
      finally { setOrdersBusy(false) }
    }
  }
  const [nameInput, setNameInput] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  // Dernière visite capturée au montage (pour colorer les nouveaux messages reçus)
  const visitedAtRef = useRef(user?.last_visited_conversations || null)
  const textareaRef = useRef(null)
  const threadRef = useRef(null)
  // Positionnement initial du fil : 1er message non lu (client) sinon tout en bas
  const initialDoneRef = useRef(false)
  const scrollModeRef = useRef('bottom')
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
      // Récupère le vrai nom depuis Odoo (devis/commande) si pas saisi à la main — non bloquant.
      if (c && !c.name_manual && c.client_phone) {
        setConversationNameFromOdoo(c.id, c.client_phone, c.client_name, c.name_manual)
          .then(updated => { if (updated) setConv(prev => (prev && prev.id === updated.id) ? updated : prev) })
          .catch(() => {})
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [conversationId])

  // Tentative de récupération de la photo client via WATI, une fois par
  // semaine au max (best-effort, ne bloque rien si WATI ne renvoie rien).
  useEffect(() => {
    if (!conv?.client_phone) return
    const fetchedAt = conv.client_photo_fetched_at ? new Date(conv.client_photo_fetched_at).getTime() : 0
    const stale = (Date.now() - fetchedAt) > 7 * 24 * 60 * 60 * 1000
    if (!stale) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/wati-webhook?action=fetch-photo&phone=${encodeURIComponent(conv.client_phone)}`)
        if (!r.ok || cancelled) return
        const d = await r.json()
        if (d?.photo) setConv(prev => prev ? { ...prev, client_photo_url: d.photo, client_photo_fetched_at: new Date().toISOString() } : prev)
        else setConv(prev => prev ? { ...prev, client_photo_fetched_at: new Date().toISOString() } : prev)
      } catch { /* silencieux */ }
    })()
    return () => { cancelled = true }
  }, [conv?.client_phone, conv?.client_photo_fetched_at])

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
    const el = document.getElementById('app-header')
    function measure() { setHeaderTop(el?.offsetHeight || 0) }
    measure()
    window.addEventListener('resize', measure)
    const ro = el ? new ResizeObserver(measure) : null
    if (el) ro.observe(el)
    return () => { window.removeEventListener('resize', measure); ro?.disconnect() }
  }, [])

  // Réinitialise le positionnement quand on change de conversation
  useEffect(() => { initialDoneRef.current = false; scrollModeRef.current = 'bottom' }, [conversationId])

  // Positionnement du fil. Au 1er affichage : si le client a des messages non
  // lus, on se place sur le 1er ; sinon (ex : c'est nous qui avons écrit en
  // dernier) on va tout en bas. Ensuite, les nouveaux messages ramènent en bas.
  useEffect(() => {
    if (threadSearch.trim() || messages.length === 0) return
    const el = threadRef.current
    if (!el) return
    const toBottom = () => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    if (initialDoneRef.current) { toBottom(); return }
    initialDoneRef.current = true
    const firstUnread = messages.find(m =>
      m.sender_type !== 'agent' && m.sender_type !== 'system' && !m.deleted_at &&
      m.sent_at && (!visitedAtRef.current || m.sent_at > visitedAtRef.current))
    if (firstUnread) {
      scrollModeRef.current = 'unread'
      requestAnimationFrame(() => {
        const node = document.getElementById(`msg-${firstUnread.id}`)
        if (node) node.scrollIntoView({ block: 'start' })
        else el.scrollTop = el.scrollHeight
      })
    } else {
      toBottom()
    }
  }, [messages, threadSearch])

  // Quand les images/audio finissent de charger, le contenu s'agrandit : on se
  // recolle en bas (mode bas uniquement, pour ne pas déplacer une lecture en cours).
  useEffect(() => {
    if (threadSearch.trim() || scrollModeRef.current !== 'bottom') return
    const el = threadRef.current
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [mediaUrls, threadSearch])

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

  // Envoi DIRECT d'une phrase type (chip) : pas de correction IA, envoi immédiat.
  async function sendQuickReply(q) {
    if (!conv || sending) return
    setSending(true); setSendError('')
    try {
      const msg = await sendMessage({
        conversationId,
        clientPhone: conv.client_phone,
        userId: user.id,
        text: q.body?.trim() || null,
        mediaPath: q.media_path || null,
      })
      setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg])
      if (conv.status === 'fermee') {
        try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ }
      }
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function handleSend() {
    if (!conv) return
    const trimmed = text.trim()
    if (!trimmed && !file && !stagedMediaPath) return

    // Étape 1 : si du texte ET l'IA n'est pas encore passée → corriger d'abord (preview)
    if (trimmed && !corrected) {
      setCorrecting(true)
      setSendError('')
      try {
        const c = await correctText(text, user.id)
        setCorrected(true)
        if (c && c.trim() && c !== text) {
          setText(c)
          setSendError('✨ Texte corrigé — relis, ajuste si besoin, puis re-clique « Envoyer ».')
          setCorrecting(false)
          return
        }
      } catch (_) {
        // Erreur IA silencieuse : on envoie quand même
      } finally {
        setCorrecting(false)
      }
    }

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
      setCorrected(false)
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
    // Avertir si le format n'est pas compatible WhatsApp (webm)
    if (/webm/i.test(audioFile.type)) {
      if (!await confirmDialog("⚠️ Ton navigateur a enregistré en WebM, format que WhatsApp ne lit pas toujours. Le client risque de ne pas recevoir l'audio.\n\nAstuce : utilise Safari (iPhone/Mac) ou Firefox pour des vocaux fiables.\n\nEnvoyer quand même ?", { confirmLabel: 'Envoyer' })) {
        return
      }
    }
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
      toast.error("Échec d'envoi de l'audio : " + e.message)
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
      toast.error('Erreur : ' + e.message)
    } finally {
      setAssigning(false)
    }
  }

  async function handleClose() {
    setStatusBusy(true)
    try { setConv(await closeConversation(conversationId, user.id)) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setStatusBusy(false) }
  }

  async function handleReopen() {
    setStatusBusy(true)
    try { setConv(await reopenConversation(conversationId, user.id)) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setStatusBusy(false) }
  }

  async function handleDeleteMessage(m) {
    if (!await confirmDialog("Supprimer ce message ?\n\nL'app va aussi tenter de l'effacer chez la cliente (WhatsApp accepte ~15 min après envoi). Si l'API refuse, le message reste visible chez elle mais marqué supprimé chez toi.", { danger: true, confirmLabel: 'Supprimer' })) return
    try {
      const r = await deleteMessage(m.id, user.id)
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), deleted_at_wati: !!r.deleted_at_wati } : x))
      if (!r.deleted_at_wati) {
        toast.error("Message marqué supprimé chez toi, mais WATI n'a pas pu l'effacer chez la cliente (fenêtre WhatsApp dépassée ou non supporté).")
      }
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Pose l'étiquette "non lu" sur cette conversation précise. Elle réapparaît
  // dans le filtre 'Non lues' et y reste jusqu'à ce qu'on la rouvre depuis la liste.
  async function handleMarkUnread() {
    try {
      await setConversationUnread(conversationId, true)
      setConv(prev => prev ? { ...prev, marked_unread: true } : prev)
      toast.info("Marquée non lue. Reviens sur la liste Conversations pour la retrouver dans 'Non lues'.")
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  function openNameEdit() { setNameInput(conv?.client_name || ''); setNameEditing(true) }

  // Demande de modification : prend le DERNIER n° S du fil et ouvre la fenêtre
  // (description + justificatif) avant d'envoyer à l'équipe Modification.
  function handleModification() {
    let ref = ''
    for (let i = messages.length - 1; i >= 0; i--) {
      const mS = (messages[i].body || '').match(/\bS\d{4,}\b/i)
      if (mS) { ref = mS[0].toUpperCase(); break }
    }
    if (!ref) { toast.error('Aucun n° de commande (S…) trouvé dans cette conversation.'); return }
    setModifRef(ref); setModifDesc(''); setModifFile(null); setModifOpen(true)
  }

  async function confirmModification() {
    if (!modifRef.trim()) { toast.error('Indique le n° de commande (S…).'); return }
    setModifBusy(true)
    try {
      let jp = null
      if (modifFile) jp = await uploadJustificatif(modifFile, user.id)
      await createModification({
        order_ref: modifRef.trim(),
        client_name: conv?.client_name || null,
        client_phone: conv?.client_phone || null,
        conversation_id: conversationId,
        requested_by: user.id,
        description: modifDesc.trim() || null,
        justificatif_path: jp,
      })
      setModifOpen(false)
      toast.success(`✅ Demande de modification envoyée pour ${modifRef}.`)
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setModifBusy(false) }
  }
  async function saveName() {
    setNameBusy(true)
    try { setConv(await updateConversationClientName(conversationId, nameInput)); setNameEditing(false) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setNameBusy(false) }
  }

  function openPaymentModal(m) {
    setPaymentMsg(m)
    // Auto-remplissage : n° de commande (S…) + nom depuis un message de
    // confirmation du fil (ex: « Bonjour Meryem, Votre commande numéro S48587… »).
    let autoRef = '', autoName = ''
    for (const msg of messages) {
      const b = msg.body || ''
      const mS = b.match(/\bS\d{4,}\b/i)
      if (mS) {
        autoRef = mS[0].toUpperCase()
        const mName = b.match(/Bonjour\s+\*?([^,*\n]+?)\*?\s*,/i)
        if (mName) autoName = mName[1].trim()
        break
      }
    }
    setOrderRefInput(m.payment_order_ref || autoRef || '')
    setClientNameInput(m.payment_client_name || autoName || '')
    setAmountInput(m.payment_amount != null ? String(m.payment_amount) : '')
  }

  async function confirmMarkPayment() {
    if (!paymentMsg) return
    setMarkBusy(true)
    try {
      const amount = amountInput.trim() ? Number(amountInput.replace(',', '.')) : null
      const updated = await markPaymentProof(paymentMsg.id, orderRefInput, clientNameInput, Number.isFinite(amount) ? amount : null)
      setMessages(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
      setPaymentMsg(null); setOrderRefInput(''); setClientNameInput(''); setAmountInput('')
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setMarkBusy(false) }
  }

  async function handleUnmarkPayment(m) {
    if (!await confirmDialog('Retirer cette preuve de paiement ?', { danger: true, confirmLabel: 'Retirer' })) return
    try {
      const updated = await unmarkPaymentProof(m.id)
      setMessages(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    } catch (e) { toast.error('Erreur : ' + e.message) }
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

  const [correcting, setCorrecting] = useState(false)
  const [corrected, setCorrected] = useState(false)   // IA déjà passée sur ce brouillon

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
        ><ArrowLeft size={18} strokeWidth={1.8} /></button>
        <button
          onClick={() => setThreadSearchOpen(o => !o)}
          className="w-9 h-9 rounded-full border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          title="Rechercher dans la conversation"
        ><Search size={16} strokeWidth={1.8} /></button>
        <ClientAvatar conv={conv} />
        <div className="min-w-0 flex-1">
          {nameEditing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setNameEditing(false) }}
                autoFocus
                placeholder="Nom du client"
                className="flex-1 min-w-0 px-2 py-1 text-[14px] text-ink bg-cream rounded border border-cream/40 focus:outline-none focus:border-cream"
              />
              <button onClick={saveName} disabled={nameBusy} title="Enregistrer" className="w-7 h-7 rounded-full bg-cream/15 text-cream hover:bg-cream/30 flex items-center justify-center transition-all"><Check size={14} /></button>
              <button onClick={() => setNameEditing(false)} disabled={nameBusy} title="Annuler" className="w-7 h-7 rounded-full bg-cream/15 text-cream hover:bg-cream/30 flex items-center justify-center transition-all"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="text-[16px] font-medium text-cream truncate">{conv?.client_name || conv?.client_phone || '…'}</div>
              {conv && (
                <button onClick={openNameEdit} title="Renommer le client" className="w-6 h-6 rounded-full text-cream/70 hover:text-cream hover:bg-cream/15 flex-shrink-0 flex items-center justify-center transition-all"><Pencil size={12} /></button>
              )}
              {conv && (
                <button onClick={handleModification} title="Demander la modification de la dernière commande (équipe Modification)" className="px-4 py-1.5 bg-cream text-bordeaux hover:bg-cream-warm rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0">MODIFICATION</button>
              )}
              {conv && (
                <button onClick={toggleClientOrders} title="Voir ses commandes / devis (Odoo)" className="px-3 py-1.5 bg-cream/15 text-cream hover:bg-cream/30 rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0">📦 Commandes</button>
              )}
            </div>
          )}
          {conv?.client_name && !nameEditing && <div className="font-mono text-[11px] text-cream/70">{conv.client_phone}</div>}
          {conv && !nameEditing && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {labelDefs.map(l => {
                const on = (conv.labels || []).includes(l.key)
                return (
                  <button key={l.key} type="button" onClick={() => toggleLabel(l.key)}
                    title={on ? "Retirer l'étiquette" : "Ajouter l'étiquette"}
                    className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full transition-all"
                    style={{ background: on ? l.bg : 'rgba(255,255,255,0.12)', color: on ? l.color : 'rgba(255,255,255,0.75)', border: '1px solid ' + (on ? l.color : 'rgba(255,255,255,0.25)') }}>
                    {on ? '✓ ' : ''}{l.label}
                  </button>
                )
              })}
            </div>
          )}
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
        {conv?.last_inbound_at && (
          <button
            onClick={handleMarkUnread}
            className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux transition-all flex-shrink-0"
            title="Faire réapparaître cette conversation dans 'Non lues'"
          >📩 Non lu</button>
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
          const isDeleted = !!m.deleted_at
          if (isDeleted) {
            return (
              <div key={m.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 italic text-[12px] opacity-70 ${
                  isAgent ? 'bg-bordeaux/20 text-bordeaux border border-bordeaux/30' : 'bg-cream-warm text-ink-mute border border-line'
                }`}>
                  🚫 Message supprimé{m.deleted_at_wati ? '' : ' (côté Lily uniquement)'}
                  <div className={`text-[9px] mt-1 ${isAgent ? 'text-bordeaux/70' : 'text-ink-mute'}`}>{fmtTime(m.sent_at)}</div>
                </div>
              </div>
            )
          }
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
              <div className={`relative max-w-[80%] rounded-lg px-3 py-2 pr-8 ${
                isAgent ? 'bg-bordeaux text-cream' : isNewClient ? 'bg-amber-100 text-ink border border-amber-300' : 'bg-cream-warm text-ink border border-line'
              }`}>
                <button
                  onClick={() => setForwardMsg(m)}
                  title="Transférer ce message"
                  className={`absolute top-1 right-1 rounded-full p-1 ${isAgent ? 'text-cream/70 hover:text-cream hover:bg-black/15' : 'text-ink-mute hover:text-bordeaux hover:bg-line/50'}`}
                ><Forward size={15} strokeWidth={1.8} /></button>
                {m.is_payment_proof && (
                  <div className={`flex items-center gap-1 text-[10px] font-medium mb-1 ${isAgent ? 'text-amber-200' : 'text-amber-700'}`}>
                    <Banknote size={12} strokeWidth={1.8} /> Preuve de paiement{m.payment_order_ref ? ` · Cmd ${m.payment_order_ref}` : ''}{m.payment_amount != null ? ` · ${m.payment_amount} DH` : ''}{m.payment_rejected_at ? ' · refusé' : m.payment_validated_at ? ' · validé' : ''}
                  </div>
                )}
                {m.media_url && (() => {
                  const href = m.media_url.startsWith('http') ? m.media_url : mediaUrls[m.id]
                  const mt = m.media_type || ''
                  const isAudio = /audio|voice|ptt/i.test(mt) || /\.(ogg|opus|webm|mp4|m4a|mp3|aac|amr)$/i.test(m.media_url)
                  const isImage = /image/i.test(mt) || /\.(jpe?g|png|gif|webp)$/i.test(m.media_url)
                  if (!href) return <span className="block text-[11px] mb-1 opacity-70">{isAudio ? 'Vocal…' : isImage ? 'Image…' : 'Pièce jointe…'}</span>
                  if (isAudio) return <audio controls src={href} className="block max-w-full mb-1" />
                  if (isImage) return (
                    <a href={href} target="_blank" rel="noopener noreferrer" title="Ouvrir en grand">
                      <img src={href} alt="" onLoad={() => { if (scrollModeRef.current === 'bottom' && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }} className="block max-w-[160px] max-h-[160px] object-cover rounded mb-1" />
                    </a>
                  )
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] underline mb-1 opacity-90">
                      <Paperclip size={12} strokeWidth={1.8} /> Pièce jointe
                    </a>
                  )
                })()}
                {m.body && <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{threadTerm ? renderHighlighted(m.body, threadTerm, nextHl, matchIndex) : m.body}</div>}
                <div className={`flex items-center gap-2 mt-1 ${isAgent ? 'justify-end' : ''}`}>
                  <span className={`text-[9px] ${isAgent ? 'text-cream/70' : 'text-ink-mute'}`}>
                    {isAgent && m.sender?.full_name ? `${m.sender.full_name} · ` : ''}{fmtTime(m.sent_at)}
                  </span>
                  {canMarkPaymentProof(user) && m.media_url && (
                    <button
                      onClick={() => m.is_payment_proof ? handleUnmarkPayment(m) : openPaymentModal(m)}
                      className={`leading-none transition-opacity ${m.is_payment_proof ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
                      title={m.is_payment_proof ? 'Retirer la preuve de paiement' : 'Marquer comme preuve de paiement'}
                    ><Banknote size={26} strokeWidth={1.8} /></button>
                  )}
                  {isAgent && (
                    <button
                      onClick={() => handleDeleteMessage(m)}
                      className="text-[11px] leading-none text-cream/70 hover:text-cream"
                      title="Supprimer ce message (tente aussi chez la cliente, fenêtre WhatsApp ~15 min)"
                    >🗑</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {/* Zone de réponse (toujours fixée en bas) */}
      <div className="bg-cream px-4 pt-2 pb-3 border-t border-line flex-shrink-0">
        {conv && conv.assigned_to !== user.id ? (
          <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
            <div className="text-[12px] text-ink-soft flex-1 min-w-0">
              {conv.assigned_to
                ? `Cette conversation est prise par ${conv.assigned?.full_name || conv.assigned?.username || '?'}.`
                : 'Prends la conversation pour pouvoir répondre.'}
            </div>
            {!conv.assigned_to && (
              <button
                onClick={handleAssign}
                disabled={assigning}
                className="px-4 py-1.5 bg-bordeaux text-cream hover:bg-bordeaux-deep rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-60"
              >
                {assigning ? '…' : 'Je prends'}
              </button>
            )}
          </div>
        ) : (
          <>
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setText(s.text); setSuggestions([]); requestAnimationFrame(() => textareaRef.current?.focus()) }}
                className="text-left rounded-lg border border-bordeaux/30 bg-bordeaux/5 px-3 py-2 hover:border-bordeaux transition-colors"
              >
                <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-bordeaux mb-0.5"><Sparkles size={10} strokeWidth={1.8} /> {TONE_LABEL[s.tone] || s.tone}</div>
                <div className="text-[12px] text-ink">{s.text}</div>
              </button>
            ))}
          </div>
        )}
        {sendError && <div className="text-[11px] text-bordeaux mb-1">{sendError}</div>}
        {file && (
          <div className="flex items-center gap-2 mb-1.5 text-[11px] text-ink-soft">
            <Paperclip size={12} strokeWidth={1.8} className="flex-shrink-0" />
            <span className="truncate">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-bordeaux font-bold" title="Retirer">×</button>
          </div>
        )}
        {stagedMediaPath && (
          <div className="flex items-center gap-2 mb-1.5">
            {stagedPreviewUrl && <img src={stagedPreviewUrl} alt="" className="w-10 h-10 object-cover rounded border border-line" />}
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft"><ImageIcon size={12} strokeWidth={1.8} /> Photo jointe</span>
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
            >{sending ? '…' : 'Envoyer'}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {quickReplies.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mt-1" title="Clic = envoi direct au client">
                {quickReplies.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => sendQuickReply(q)}
                    disabled={sending}
                    title={q.body}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border border-bordeaux/40 text-bordeaux bg-bordeaux/5 hover:bg-bordeaux hover:text-cream transition-all disabled:opacity-50"
                  >{q.media_path ? '🖼️ ' : ''}{q.label}</button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => { const v = e.target.value; setText(v); if (!v.trim()) setCorrected(false) }}
              onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }}
              rows={3}
              placeholder="Écrire une réponse…"
              className="w-full resize-none max-h-[200px] px-4 py-3 rounded-2xl border border-line bg-cream-warm text-[15px] leading-relaxed text-ink focus:outline-none focus:border-bordeaux"
            />
            <div className="flex items-center gap-2">
              <label className="w-9 h-9 flex-shrink-0 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center cursor-pointer transition-all" title="Joindre une image ou un PDF (max 5 MB)">
                <Paperclip size={16} strokeWidth={1.8} />
                <input type="file" accept="image/*,application/pdf" onChange={onPickFile} className="hidden" />
              </label>
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEmoji(v => !v)}
                  className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
                  title="Emojis"
                ><Smile size={16} strokeWidth={1.8} /></button>
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
                ><MessageSquareText size={16} strokeWidth={1.8} /></button>
                {showReplies && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setShowReplies(false)} />
                    <div className="absolute bottom-11 left-0 z-[100] w-64 max-w-[80vw] bg-cream border border-line rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto">
                      {quickReplies.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-ink-mute italic">Aucune phrase. Ajoute-en via « Phrases » dans la liste.</div>
                      ) : quickReplies.map(q => (
                        <button
                          key={q.id}
                          onClick={() => pickQuickReply(q)}
                          className="w-full text-left px-3 py-2 hover:bg-cream-warm transition-colors"
                        >
                          <div className="text-[12px] font-medium text-ink">{q.label}</div>
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
              >{suggesting ? '…' : <Sparkles size={16} strokeWidth={1.8} />}</button>
              <button
                type="button"
                onClick={startRecording}
                disabled={sending}
                className="w-9 h-9 flex-shrink-0 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all disabled:opacity-50"
                title="Message vocal"
              ><Mic size={16} strokeWidth={1.8} /></button>
              <button
                onClick={handleSend}
                disabled={sending || correcting || (!text.trim() && !file && !stagedMediaPath)}
                className="ml-auto px-4 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[12px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-50"
              >
                {correcting ? 'Correction…' : sending ? '…' : (text.trim() && corrected ? 'Confirmer' : 'Envoyer')}
              </button>
            </div>
          </div>
        )}
          </>
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

      {ordersOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={() => setOrdersOpen(false)}>
          <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-fraunces italic text-[18px] text-ink">📦 Commandes & devis</h3>
              <button onClick={() => setOrdersOpen(false)} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
            </div>
            <p className="text-[11px] text-ink-soft mb-3">{conv?.client_name || conv?.client_phone || ''}</p>
            {ordersBusy ? (
              <div className="text-center text-ink-mute py-8 text-[13px]">Chargement…</div>
            ) : !clientOrders || clientOrders.length === 0 ? (
              <div className="text-center text-ink-mute py-8 text-[13px]">Aucune commande/devis trouvé pour ce numéro.</div>
            ) : (
              <div className="space-y-2">
                {clientOrders.map(o => {
                  const isDevis = o.state === 'draft' || o.state === 'sent'
                  const stLabel = isDevis ? 'Devis' : (o.state === 'cancel' ? 'Annulé' : 'Confirmé')
                  const stCls = isDevis ? 'bg-amber-100 text-amber-800' : (o.state === 'cancel' ? 'bg-line/40 text-ink-mute' : 'bg-blue-100 text-blue-800')
                  return (
                    <div key={o.id} className="bg-white border border-line rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-semibold text-bordeaux">{o.name}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${stCls}`}>{stLabel}</span>
                      </div>
                      <div className="text-[11px] text-ink-soft mt-1 flex flex-wrap gap-x-3">
                        {o.pickupText && <span>🗓️ {o.pickupText}</span>}
                        {o.amountText && <span>💰 {o.amountText}</span>}
                      </div>
                      {Array.isArray(o.productLines) && o.productLines.length > 0 && (
                        <div className="text-[11px] text-ink mt-1 border-t border-line/60 pt-1">
                          {o.productLines.slice(0, 6).map((l, i) => <div key={i} className="truncate">• {typeof l === 'string' ? l : l.text}{l && l.qty && Number(l.qty) > 1 ? ` (×${l.qty})` : ''}</div>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {modifOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={() => !modifBusy && setModifOpen(false)}>
          <div className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-line p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-1">Demande de modification</h3>
            <p className="text-[12px] text-ink-soft mb-2">Client : {conv?.client_name || conv?.client_phone || ''}</p>
            <label className="block text-[11px] font-medium text-ink-soft mb-1">N° de commande (modifiable si c'en est une autre)</label>
            <input type="text" value={modifRef} onChange={e => setModifRef(e.target.value)} placeholder="ex : S49251"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3 font-mono" />
            <label className="block text-[11px] font-medium text-ink-soft mb-1">Que faut-il modifier ?</label>
            <textarea value={modifDesc} onChange={e => setModifDesc(e.target.value)} rows={3}
              placeholder="ex : changer la date de retrait au 12/06, ajouter un message sur le gâteau…"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3" />
            <label className="inline-flex items-center gap-2 text-[12px] text-ink-soft cursor-pointer mb-4 border border-line rounded-lg px-3 py-2" style={{ background: modifFile ? '#EAF3DE' : undefined }}>
              📎 {modifFile ? modifFile.name.slice(0, 22) : 'Joindre un justificatif (optionnel)'}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setModifFile(e.target.files?.[0] || null)} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setModifOpen(false)} disabled={modifBusy} className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all">Annuler</button>
              <button onClick={confirmModification} disabled={modifBusy} className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all disabled:opacity-50">{modifBusy ? 'Envoi…' : 'Envoyer'}</button>
            </div>
          </div>
        </div>
      )}

      {paymentMsg && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={() => !markBusy && setPaymentMsg(null)}>
          <div className="bg-cream rounded-2xl w-full max-w-xs shadow-2xl border border-line p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-1">Preuve de paiement</h3>
            <p className="text-[12px] text-ink-mute mb-3">Le nom et le numéro du client sont récupérés tout seuls. Ajoute le n° de commande (optionnel).</p>
            <label className="block text-[11px] font-medium text-ink-soft mb-1">N° de commande</label>
            <input
              type="text"
              value={orderRefInput}
              onChange={e => setOrderRefInput(e.target.value)}
              autoFocus
              placeholder="ex. S-1042"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3"
            />
            <label className="block text-[11px] font-medium text-ink-soft mb-1">Nom du client (si différent)</label>
            <input
              type="text"
              value={clientNameInput}
              onChange={e => setClientNameInput(e.target.value)}
              placeholder={conv?.client_name || 'ex. nom sur le virement'}
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3"
            />
            <label className="block text-[11px] font-medium text-ink-soft mb-1">Montant (DH)</label>
            <input
              type="number"
              inputMode="decimal"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              placeholder="ex. 450"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPaymentMsg(null)} disabled={markBusy} className="px-3 py-1.5 text-[12px] border border-line rounded-lg text-ink-soft hover:bg-cream-warm disabled:opacity-50">Annuler</button>
              <button onClick={confirmMarkPayment} disabled={markBusy} className="px-4 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50">{markBusy ? '…' : 'Transférer aux paiements'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
