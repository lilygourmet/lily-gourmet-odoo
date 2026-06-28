import { useState, useEffect, useRef } from 'react'
import { loadConversation, loadMessages, assignConversation, sendMessage, uploadConversationMedia, getMediaSignedUrl, closeConversation, reopenConversation, loadQuickReplies, suggestReplies, correctText, deleteMessage, markPaymentProof, unmarkPaymentProof, updateConversationClientName, setConversationNameFromOdoo, setConversationUnread, searchOrders, CONV_LABELS, loadConvLabels, setConversationLabels, reorderQuickReplies, recordDevisTraitement, confirmDevis, cancelDevis, loadClosedBy } from '../../lib/conversations'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'
import { formatRelativeTime, canMarkPaymentProof } from '../../lib/auth'
import ForwardModal from './ForwardModal'
import { createModification } from '../../lib/modifications'
import NewConversationModal from './NewConversationModal'
import OrderEditModal from '../OrderEditModal'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Search, Phone, Forward, Banknote, Paperclip, Sparkles, Mic, Smile, MessageSquareText, Send, Image as ImageIcon, Check, X } from 'lucide-react'

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const TONE_LABEL = { formelle: 'Formelle', amicale: 'Amicale', directe: 'Directe' }

// Ordre d'affichage des phrases : si aucun classement manuel (tous les "ordre" égaux),
// on trie par ordre alphabétique par défaut. Sinon on respecte l'ordre enregistré.
function orderQuickReplies(list) {
  if (!list || list.length === 0) return []
  const allSame = list.every(q => (q.ordre || 0) === (list[0].ordre || 0))
  if (allSame) return [...list].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr'))
  return list
}

// Devine un émoji selon le sujet d'une phrase type (pour repérer les chips d'un coup d'œil).
function chipEmoji(q) {
  const t = ((q?.label || '') + ' ' + (q?.body || '')).toLowerCase()
  if (/\b(rib|iban|virement|compte|paiement|payer|payment)\b/.test(t)) return '💳'
  if (/livr/.test(t)) return '🚚'
  if (/(localis|adresse|maps|google|fin\s+kayn|win\s+kayn)/.test(t)) return '📍'
  if (/(horaire|ouvert|ferm)/.test(t)) return '🕒'
  if (/(prix|tarif|devis|co[uû]t)/.test(t)) return '💰'
  if (/(acompte|avance|arrhes)/.test(t)) return '💵'
  if (/(commande|command)/.test(t)) return '🛒'
  if (/(g[âa]teau|cake|p[âa]tiss|dessert|tarte|pi[èe]ce\s+mont)/.test(t)) return '🎂'
  if (/(anniversaire|f[êe]te|mariage|baby)/.test(t)) return '🎉'
  if (/(bonjour|bonsoir|salam|salut|coucou|merhba)/.test(t)) return '👋'
  if (/(merci|remerci|d[ée]sol|excuse|pardon)/.test(t)) return '🙏'
  if (/(confirm|valid)/.test(t)) return '✅'
  if (/(dispo|disponible|stock|rupture)/.test(t)) return '📦'
  if (/(menu|catalogue|carte|photo|image)/.test(t)) return '📋'
  if (/(t[ée]l[ée]phone|appel|num[ée]ro)/.test(t)) return '📞'
  if (/(attente|patience|bient[ôo]t|d[ée]lai)/.test(t)) return '⏳'
  if (q?.media_path) return '🖼️'
  return '💬'
}

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

export default function ConversationDetail({ conversationId, user, onBack, relanceRef = null }) {
  const [conv, setConv] = useState(null)
  const [linkedOrder, setLinkedOrder] = useState(null)   // commande liée (link_order_ref) complète
  const [confirmingOrder, setConfirmingOrder] = useState(false)
  const [waConfirm, setWaConfirm] = useState(null)       // commande pour laquelle envoyer le message de confirmation
  const [editOrder, setEditOrder] = useState(null)       // commande à modifier (✏️ Articles)
  const [linkMenuOpen, setLinkMenuOpen] = useState(false) // menu « 🔗 Lien » (cake / catalogue)
  const [messages, setMessages] = useState([])
  // Conversation réellement affichée à l'instant T (anti-fuite entre clients lors d'un
  // changement de conversation pendant qu'une requête async est en cours).
  const convIdRef = useRef(conversationId)
  // Ajoute un message au fil SEULEMENT s'il appartient à la conversation affichée.
  function appendMsg(msg) {
    setMessages(prev => (!msg || Number(msg.conversation_id) !== Number(convIdRef.current) || prev.some(x => x.id === msg.id)) ? prev : [...prev, msg])
  }
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
  // Brouillon de réponse préparé à la réception (IA) : pré-rempli à l'ouverture.
  const [prefilled, setPrefilled] = useState(false)
  // Photo d'une phrase type, préparée pour l'envoi (option B)
  const [stagedMediaPath, setStagedMediaPath] = useState(null)
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState(null)
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  const [threadSearch, setThreadSearch] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [mediaUrls, setMediaUrls] = useState({}) // messageId -> URL signée
  const [lightboxUrl, setLightboxUrl] = useState(null) // photo affichée en grand (modale)
  const relanceMarkedRef = useRef(false) // « Relancé par » enregistré une seule fois, au 1er envoi réel
  const [showEmoji, setShowEmoji] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [showPhone, setShowPhone] = useState(false)
  const [phoneCopied, setPhoneCopied] = useState(false)
  const [repliesDrawerOpen, setRepliesDrawerOpen] = useState(false)
  const repliesDrawerRef = useRef(null)
  const [quickReplies, setQuickReplies] = useState([])
  const [forwardMsg, setForwardMsg] = useState(null)
  // Demande de modification de commande
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
    loadQuickReplies().then(l => setQuickReplies(orderQuickReplies(l))).catch(() => {})
  }, [])

  // Glisser-déposer pour réordonner les chips de phrases (souris).
  const dragIdx = useRef(null)
  function onChipDragStart(i) { dragIdx.current = i }
  function onChipDragOver(e, i) {
    e.preventDefault()
    const from = dragIdx.current
    if (from === null || from === i) return
    setQuickReplies(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(from, 1)
      arr.splice(i, 0, moved)
      return arr
    })
    dragIdx.current = i
  }
  function onChipDrop() {
    dragIdx.current = null
    setQuickReplies(prev => { reorderQuickReplies(prev.map(q => q.id)).catch(() => {}); return prev })
  }

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
  // Ouvre « Nouvelle commande » (nouvel onglet) avec le nom + téléphone du client pré-remplis.
  function openNewOrder() {
    const params = new URLSearchParams({ newcmd: '1' })
    if (conv?.client_phone) params.set('cmdphone', conv.client_phone)
    if (conv?.client_name) params.set('cmdname', conv.client_name)
    const url = `/?${params.toString()}`
    // Nouvel onglet si possible ; si le navigateur/tablette bloque les pop-ups
    // (window.open renvoie null), on bascule dans le même onglet → marche toujours.
    const w = window.open(url, '_blank')
    if (!w) window.location.href = url
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
  // Qui a fermé la conversation (affiché quand elle est fermée)
  const [closedBy, setClosedBy] = useState(null)
  useEffect(() => {
    if (conv?.status === 'fermee') loadClosedBy(conversationId).then(setClosedBy).catch(() => {})
    else setClosedBy(null)
  }, [conv?.status, conversationId])
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const recordStreamRef = useRef(null)
  const recordMimeRef = useRef('')
  const sendOnStopRef = useRef(false)

  async function load() {
    const cid = conversationId
    convIdRef.current = cid
    setLoading(true)
    setError('')
    setPrefilled(false)
    setConv(null); setMessages([]) // efface IMMÉDIATEMENT l'ancienne conversation au clic (sinon elle reste affichée pendant un chargement lent)
    setLinkedOrder(null) // on efface la commande de la conversation précédente (sinon les boutons « sautent »)
    setText('') // on repart d'une zone vide à chaque conversation (pas de débordement entre conversations)
    relanceMarkedRef.current = false // nouvelle conversation → on pourra ré-enregistrer « Relancé par » si besoin
    try {
      const [c, msgs] = await Promise.all([
        loadConversation(cid),
        loadMessages(cid),
      ])
      if (convIdRef.current !== cid) return   // on a changé de conversation entre-temps → on ignore ce chargement
      setConv(c)
      setMessages(msgs)
      // Réponse préparée à la réception (IA) : on la met d'office dans la zone
      // d'écriture de CETTE conversation. On laisse corrected=false pour que
      // la correction orthographe s'applique normalement à l'envoi (comme un texte tapé).
      if (c?.suggested_reply) {
        setText(c.suggested_reply)
        setPrefilled(true)
      }
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

  // Commande liée (link_order_ref) : permet de la CONFIRMER directement depuis l'en-tête
  // de la conversation, sans aller dans l'onglet Commandes.
  useEffect(() => {
    if (!conv) { setLinkedOrder(null); return }
    const ref = conv.link_order_ref
    const q = ref || conv.client_phone
    if (!q) { setLinkedOrder(null); return }
    let cancelled = false
    searchOrders(q).then(orders => {
      if (cancelled) return
      const list = orders || []
      // Avec un lien explicite : cette commande. Sinon : la dernière commande non annulée du client.
      const o = ref ? (list.find(x => x.name === ref) || list[0]) : (list.find(x => x.state !== 'cancel') || list[0])
      setLinkedOrder(o || null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [conv?.link_order_ref, conv?.client_phone])

  async function handleConfirmOrder() {
    if (!linkedOrder?.id) return
    if (!(await confirmDialog(`Confirmer le devis ${linkedOrder.name} dans Odoo ?\n\nIl devient une commande confirmée (effet réel).`, { confirmLabel: 'Confirmer' }))) return
    setConfirmingOrder(true)
    try {
      await confirmDevis(linkedOrder.id, user?.id)
      recordDevisTraitement({ order_num: linkedOrder.name, action: 'confirme', user_id: user?.id, user_name: user?.full_name || user?.username }).catch(() => {})
      const confirmed = { ...linkedOrder, state: 'sale' }
      setLinkedOrder(confirmed)
      toast.success(`${linkedOrder.name} confirmée`)
      // Proposer d'envoyer le message de confirmation au client.
      if (await confirmDialog('Envoyer le message de confirmation au client sur WhatsApp ?', { confirmLabel: 'Envoyer' })) {
        setWaConfirm(confirmed)
      }
    } catch (e) { toast.error(e?.message || 'Échec de la confirmation') }
    finally { setConfirmingOrder(false) }
  }

  async function handleCancelOrder() {
    if (!linkedOrder?.id) return
    const isConfirmed = linkedOrder.state === 'sale'
    if (!(await confirmDialog(`Annuler ${isConfirmed ? 'la commande' : 'le devis'} ${linkedOrder.name} dans Odoo ?\n\n(Effet réel : ${isConfirmed ? 'la commande' : 'le devis'} sera annulé·e.)`, { danger: true, confirmLabel: 'Annuler dans Odoo' }))) return
    setConfirmingOrder(true)
    try {
      await cancelDevis(linkedOrder.id, user?.id)
      recordDevisTraitement({ order_num: linkedOrder.name, action: 'annulation', user_id: user?.id, user_name: user?.full_name || user?.username }).catch(() => {})
      // Commande confirmée annulée → on la trace dans l'onglet Modifications (comme l'onglet Devis).
      if (isConfirmed) {
        createModification({
          order_ref: linkedOrder.name,
          client_name: linkedOrder.clientName || conv?.client_name || null,
          client_phone: linkedOrder.clientPhone || conv?.client_phone || null,
          conversation_id: conversationId,
          requested_by: user?.id || null,
          description: `❌ ANNULATION — commande ${linkedOrder.name}${linkedOrder.amountText ? ` (${linkedOrder.amountText})` : ''} (annulée dans Odoo)`,
        }).catch(() => {})
      }
      setLinkedOrder(o => o ? { ...o, state: 'cancel' } : o)
      toast.success(`${linkedOrder.name} annulée`)
    } catch (e) { toast.error(e?.message || "Échec de l'annulation") }
    finally { setConfirmingOrder(false) }
  }

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
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new
          if (!m || Number(m.conversation_id) !== Number(conversationId)) return
          setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x))
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

  // Tiroir « Réponses » : se referme si on clique en dehors.
  useEffect(() => {
    if (!repliesDrawerOpen) return
    function onDocClick(e) {
      if (repliesDrawerRef.current && !repliesDrawerRef.current.contains(e.target)) {
        setRepliesDrawerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [repliesDrawerOpen])

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
  // Relance ouverte depuis un devis (nouvel onglet) : on enregistre « Relancé par »
  // UNIQUEMENT au 1er message réellement envoyé, et une seule fois.
  async function markRelanceIfNeeded() {
    if (!relanceRef || relanceMarkedRef.current) return
    relanceMarkedRef.current = true
    try { await recordDevisTraitement({ order_num: relanceRef, action: 'relance', user_id: user?.id, user_name: user?.full_name || user?.username }) } catch (_) { /* non bloquant */ }
  }

  async function sendQuickReply(q) {
    if (!conv || sending) return
    setRepliesDrawerOpen(false)   // referme le tiroir dès qu'un choix est cliqué
    setSending(true); setSendError('')
    try {
      const msg = await sendMessage({
        conversationId,
        clientPhone: conv.client_phone,
        userId: user.id,
        text: q.body?.trim() || null,
        mediaPath: q.media_path || null,
      })
      appendMsg(msg)
      markRelanceIfNeeded()
      if (conv.status === 'fermee') {
        try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ }
      }
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  // Envoie au client le LIEN de commande (page publique) pré-rempli avec son prénom + numéro.
  async function sendOrderLink() {
    if (!conv || sending) return
    // Prix par PART (cake design) : tu le fixes d'avance (après avoir vu le design) ;
    // la page client multipliera par le nombre de personnes. Optionnel (vide = prix normal).
    const partRaw = prompt('Prix de la PART pour un cake design (DH) ?\nLaisse vide si pas concerné.')
    if (partRaw === null) return   // annulé
    const part = partRaw.trim() === '' ? null : Number(partRaw.replace(',', '.'))
    if (part !== null && (!Number.isFinite(part) || part <= 0)) { toast.error('Prix de la part invalide.'); return }
    const prenom = (conv.client_name || '').trim().split(/\s+/)[0] || ''
    const params = new URLSearchParams()
    params.set('commande', '1')
    if (prenom) params.set('nom', prenom)
    if (conv.client_phone) params.set('tel', conv.client_phone)
    if (part) params.set('part', String(part))
    const link = `${window.location.origin}/?${params.toString()}`
    const body = `Si c'est possible et pour vous faciliter les choses, vous pouvez composer votre commande tranquillement ici 👇\n${link}\n(gâteau, parfum, thème, date…) — on s'occupe du reste avec plaisir 💛`
    if (!(await confirmDialog('Envoyer le lien de commande à ce client par WhatsApp ?'))) return
    setSending(true); setSendError('')
    try {
      const msg = await sendMessage({ conversationId, clientPhone: conv.client_phone, userId: user.id, text: body })
      appendMsg(msg)
      if (conv.status === 'fermee') { try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ } }
      toast.success('Lien de commande envoyé ✅')
    } catch (e) { setSendError(e.message); toast.error('Échec : ' + e.message) }
    finally { setSending(false) }
  }

  // 2ᵉ lien : catalogue (entremets, mignardises, salé, surgelés, boissons, gourmandises, gâteaux secs).
  async function sendCatalogueLink() {
    if (!conv || sending) return
    const prenom = (conv.client_name || '').trim().split(/\s+/)[0] || ''
    const params = new URLSearchParams()
    params.set('commande', '2')
    if (prenom) params.set('nom', prenom)
    if (conv.client_phone) params.set('tel', conv.client_phone)
    const link = `${window.location.origin}/?${params.toString()}`
    const body = `Pour vous faciliter les choses, vous pouvez composer votre commande ici 👇\n${link}\n(entremets, mignardises, salé, boissons, gourmandises…) — on s'occupe du reste avec plaisir 💛`
    if (!(await confirmDialog('Envoyer le lien « catalogue » à ce client par WhatsApp ?'))) return
    setSending(true); setSendError('')
    try {
      const msg = await sendMessage({ conversationId, clientPhone: conv.client_phone, userId: user.id, text: body })
      appendMsg(msg)
      if (conv.status === 'fermee') { try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ } }
      toast.success('Lien catalogue envoyé ✅')
    } catch (e) { setSendError(e.message); toast.error('Échec : ' + e.message) }
    finally { setSending(false) }
  }

  // Envoie une INFORMATION libre au client (modèle wati_info hors fenêtre 24h, sinon message normal).
  async function sendInfoToClient() {
    if (!conv || sending) return
    const raw = prompt('Information à envoyer au client (WhatsApp) :')
    if (raw === null) return
    let text = raw.trim()
    if (!text) return
    // Correction IA puis relecture (même logique que l'envoi normal)
    setCorrecting(true)
    try {
      const c = await correctText(text, user.id)
      if (c && c.trim() && c !== text) {
        const reviewed = prompt('✨ Texte corrigé — relis et ajuste si besoin :', c)
        if (reviewed === null) { setCorrecting(false); return }
        text = reviewed.trim()
        if (!text) { setCorrecting(false); return }
      }
    } catch (_) {
      // Erreur IA silencieuse : on garde le texte tapé
    } finally {
      setCorrecting(false)
    }
    setSending(true); setSendError('')
    try {
      const res = await fetch('/api/wati-webhook?action=send-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, clientPhone: conv.client_phone, templateName: 'wati_info', parameters: [{ name: '1', value: text }], freeText: text, bodyText: text, userId: user.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      const cid = conversationId
      try { const ms = await loadMessages(cid); if (convIdRef.current === cid) setMessages(ms) } catch (_) { /* ignore */ }
      if (conv.status === 'fermee') { try { setConv(await reopenConversation(conversationId, user.id)) } catch (_) { /* ignore */ } }
      toast.success('Information envoyée ✅')
    } catch (e) { setSendError(e.message); toast.error('Échec : ' + e.message) }
    finally { setSending(false) }
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
      appendMsg(msg)
      markRelanceIfNeeded()
      setText('')
      setCorrected(false)
      setPrefilled(false)
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
      appendMsg(msg)
      markRelanceIfNeeded()
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
    <div className="flex mx-auto w-full max-w-5xl" style={{ height: `calc(100dvh - ${headerTop}px)` }}>
      <div className="flex flex-col flex-1 min-w-0 relative">
      {/* Tiroir « Réponses rapides » : poignée à droite, s'ouvre/se ferme au CLIC (ne mange pas la largeur). */}
      {quickReplies.length > 0 && (
        <div ref={repliesDrawerRef} className="absolute top-0 right-0 h-full z-30 flex items-center">
          <button type="button" onClick={() => setRepliesDrawerOpen(o => !o)}
            className="flex-shrink-0 w-6 h-28 rounded-l-lg bg-bordeaux/15 border border-r-0 border-bordeaux/25 text-bordeaux flex items-center justify-center cursor-pointer hover:bg-bordeaux/25 transition-colors">
            <span className="text-[10px] font-medium tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Réponses</span>
          </button>
          <div className={`h-full bg-cream-warm border-l border-line shadow-2xl overflow-hidden transition-all duration-200 ${repliesDrawerOpen ? 'w-[210px]' : 'w-0'}`}>
            <div className="w-[210px] h-full overflow-y-auto p-2 flex flex-col gap-1.5">
              <div className="text-[10px] uppercase tracking-wider text-ink-mute px-1 pb-1 flex-shrink-0">Réponses rapides</div>
              {quickReplies.map(q => (
                <button key={q.id} type="button" onClick={() => sendQuickReply(q)} disabled={sending} title={q.body}
                  className="flex-shrink-0 text-left px-3 py-1.5 rounded-lg text-[12px] font-medium border border-bordeaux/30 text-bordeaux bg-white hover:bg-bordeaux hover:text-cream transition-all disabled:opacity-50">
                  <span className="line-clamp-2">{q.emoji || chipEmoji(q)} {q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* En-tête : retour + infos contact + bouton Je prends */}
      <div className="bg-bordeaux text-cream flex flex-col gap-1 px-3 py-1.5 shadow-sm flex-shrink-0">
        {/* Ligne 1 : nom (sans photo) + ✏️ + MODIF + Cmd + 🔍 + Je prends */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBack}
            className="md:hidden w-8 h-8 rounded-full border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux flex items-center justify-center transition-all flex-shrink-0"
            title="Retour à la liste"
          ><ArrowLeft size={18} strokeWidth={1.8} /></button>
          {nameEditing ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setNameEditing(false) }}
                autoFocus
                placeholder="Nom du client"
                className="flex-1 min-w-0 px-2 py-1 text-[14px] text-ink bg-cream rounded border border-cream/40 focus:outline-none focus:border-cream"
              />
              <button onClick={saveName} disabled={nameBusy} title="Enregistrer" className="w-7 h-7 rounded-full bg-cream/15 text-cream hover:bg-cream/30 flex items-center justify-center transition-all flex-shrink-0"><Check size={14} /></button>
              <button onClick={() => setNameEditing(false)} disabled={nameBusy} title="Annuler" className="w-7 h-7 rounded-full bg-cream/15 text-cream hover:bg-cream/30 flex items-center justify-center transition-all flex-shrink-0"><X size={14} /></button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <div className="text-[15px] font-medium text-cream truncate">{conv?.client_name || conv?.client_phone || '…'}</div>
                {conv?.client_phone && (
                  <div className="relative flex-shrink-0">
                    <button onClick={() => setShowPhone(v => !v)} title="Numéro de téléphone" className="w-6 h-6 rounded-full text-cream/70 hover:text-cream hover:bg-cream/15 flex items-center justify-center transition-all"><Phone size={12} /></button>
                    {showPhone && (
                      <>
                        <div className="fixed inset-0 z-[90]" onClick={() => setShowPhone(false)} />
                        <div className="absolute top-7 left-0 z-[100] bg-cream border border-line rounded-lg shadow-xl px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                          <span className="text-[13px] font-semibold text-ink">{conv.client_phone}</span>
                          <button onClick={() => { try { navigator.clipboard?.writeText(conv.client_phone) } catch { /* */ } setPhoneCopied(true); setTimeout(() => setPhoneCopied(false), 1400) }}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${phoneCopied ? 'bg-emerald-600 text-white' : 'border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream'} transition-all`}>
                            {phoneCopied ? '✓ Copié' : 'Copier'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 overflow-x-auto">
                {linkedOrder && (() => {
                  // « Modifier » (articles) TOUJOURS visible, quel que soit l'état/la date.
                  // Confirmer = seulement un devis ; Annuler = sauf commande passée/annulée.
                  const orderPast = linkedOrder.state === 'done' || linkedOrder.invoiceStatus === 'invoiced'
                  const isSale = linkedOrder.state === 'sale'
                  const isCancel = linkedOrder.state === 'cancel'
                  const confirmable = !orderPast && !isSale && !isCancel
                  return (
                    <>
                      {isSale && (
                        <span title={linkedOrder.name} className="flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-400/30 text-cream border border-emerald-200/40">Confirmée</span>
                      )}
                      {isCancel && (
                        <span title={linkedOrder.name} className="flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-cream/15 text-cream/70 border border-cream/30">Annulée</span>
                      )}
                      {confirmable && (
                        <button onClick={handleConfirmOrder} disabled={confirmingOrder} title={`Confirmer ${linkedOrder.name} dans Odoo`} className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wider bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-50">{confirmingOrder ? '…' : 'Confirmer'}</button>
                      )}
                      <button onClick={() => setEditOrder(linkedOrder)} title={`Modifier les articles de ${linkedOrder.name}`} className="flex-shrink-0 px-2 py-1 rounded-full text-[11px] font-medium tracking-wider bg-cream/15 text-cream border border-cream/30 hover:bg-cream/30 transition-all">Modifier</button>
                      {!orderPast && !isCancel && (
                        <button onClick={handleCancelOrder} disabled={confirmingOrder} title={`Annuler ${linkedOrder.name} dans Odoo`} className="flex-shrink-0 px-2 py-1 rounded-full text-[11px] font-medium tracking-wider bg-red-500/80 text-cream border border-red-300/40 hover:bg-red-600 transition-all disabled:opacity-50">Annuler</button>
                      )}
                    </>
                  )
                })()}
                {conv && (
                  <button onClick={toggleClientOrders} title="Voir l'historique des commandes / devis (Odoo)" className="px-2.5 py-1 bg-cream/15 text-cream hover:bg-cream/30 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0">Historique</button>
                )}
                {conv && (
                  <button onClick={openNewOrder} title="Créer une nouvelle commande pour ce client (nom + téléphone pré-remplis)" className="px-2.5 py-1 bg-cream text-bordeaux hover:bg-cream-warm rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 whitespace-nowrap">Nouvelle commande</button>
                )}
                {conv && (
                  <button onClick={() => setLinkMenuOpen(true)} disabled={sending} title="Envoyer un lien de commande en ligne" className="px-2.5 py-1 bg-cream/15 text-cream hover:bg-cream/30 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-50">🔗 Lien</button>
                )}
                {conv && (
                  <button onClick={sendInfoToClient} disabled={sending} title="Envoyer une information au client (WhatsApp)" className="px-2.5 py-1 bg-cream/15 text-cream hover:bg-cream/30 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-50">📢 Info</button>
                )}
                <button
                  onClick={() => setThreadSearchOpen(o => !o)}
                  className="w-8 h-8 rounded-full border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux flex items-center justify-center transition-all flex-shrink-0"
                  title="Rechercher dans la conversation"
                ><Search size={16} strokeWidth={1.8} /></button>
              </div>
            </>
          )}
        </div>

        {/* Ligne 2 : étiquettes (gauche) + 📩 Non lu + Clôturer (droite, sous Je prends) */}
        {conv && !nameEditing && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
              {labelDefs.map(l => {
                const on = (conv.labels || []).includes(l.key)
                return (
                  <button key={l.key} type="button" onClick={() => toggleLabel(l.key)}
                    title={on ? "Retirer l'étiquette" : "Ajouter l'étiquette"}
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition-all flex-shrink-0 whitespace-nowrap"
                    style={{ background: on ? l.bg : 'rgba(255,255,255,0.12)', color: on ? l.color : 'rgba(255,255,255,0.75)', border: '1px solid ' + (on ? l.color : 'rgba(255,255,255,0.25)') }}>
                    {on ? '✓ ' : ''}{l.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {conv.last_inbound_at && (
                <button onClick={handleMarkUnread} title="Faire réapparaître dans 'Non lues'" className="px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux transition-all flex-shrink-0 whitespace-nowrap">📩 Non lu</button>
              )}
              {conv.status === 'fermee' ? (
                <>
                  {closedBy?.name && <span className="text-[10px] text-cream/80 italic whitespace-nowrap flex-shrink-0">Fermé par {closedBy.name}</span>}
                  <button onClick={handleReopen} disabled={statusBusy} className="px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux transition-all flex-shrink-0 disabled:opacity-60">Rouvrir</button>
                </>
              ) : (
                <button onClick={handleClose} disabled={statusBusy} className="px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-cream/40 text-cream hover:bg-cream hover:text-bordeaux transition-all flex-shrink-0 disabled:opacity-60">Clôturer</button>
              )}
            </div>
          </div>
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
          <span className="text-[11px] text-ink-mute flex-shrink-0">{threadMatches ? `${matchIndex + 1}/${threadMatches}` : '0/0'}</span>
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
              <div className={`relative max-w-[80%] px-3 py-2 pr-8 rounded-2xl shadow-sm ${
                isAgent ? 'lg-grad text-cream rounded-br-sm' : isNewClient ? 'bg-amber-50 text-ink border border-amber-300 rounded-bl-sm' : 'bg-white text-ink border border-line rounded-bl-sm'
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
                  const isAudio = /audio|voice|ptt/i.test(mt) || (!/video|image/i.test(mt) && /\.(ogg|opus|m4a|mp3|aac|amr)$/i.test(m.media_url))
                  const isVideo = !isAudio && (/video/i.test(mt) || /\.(mp4|mov|m4v|3gp|webm)$/i.test(m.media_url))
                  const isImage = !isAudio && !isVideo && (/image/i.test(mt) || /\.(jpe?g|png|gif|webp)$/i.test(m.media_url))
                  if (!href) return <span className="block text-[11px] mb-1 opacity-70">{isAudio ? 'Vocal…' : isVideo ? 'Vidéo…' : isImage ? 'Image…' : 'Pièce jointe…'}</span>
                  if (isAudio) return <audio controls src={href} className="block max-w-full mb-1" />
                  if (isVideo) return (
                    <video controls src={href} onLoadedData={() => { if (scrollModeRef.current === 'bottom' && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }} className="block max-w-[220px] max-h-[280px] rounded mb-1" />
                  )
                  if (isImage) return (
                    <button type="button" onClick={() => setLightboxUrl(href)} title="Voir en grand" className="block mb-1">
                      <img src={href} alt="" onLoad={() => { if (scrollModeRef.current === 'bottom' && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }} className="block max-w-[160px] max-h-[160px] object-cover rounded" />
                    </button>
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
                  {isAgent && m.delivery_status && (
                    <span className="text-[10px] leading-none flex-shrink-0" title={
                      m.delivery_status === 'failed' ? 'Non reçu par la cliente'
                      : m.delivery_status === 'read' ? 'Lu'
                      : m.delivery_status === 'delivered' ? 'Reçu'
                      : 'Envoyé (réception pas encore confirmée)'
                    }>
                      {m.delivery_status === 'failed'
                        ? <span className="text-red-300 font-semibold">⚠ non reçu</span>
                        : m.delivery_status === 'read'
                          ? <span className="text-sky-300">✓✓</span>
                          : m.delivery_status === 'delivered'
                            ? <span className="text-cream/90">✓✓</span>
                            : <span className="text-cream/55">✓</span>}
                    </span>
                  )}
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
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-bordeaux mb-0.5"><Sparkles size={10} strokeWidth={1.8} /> {TONE_LABEL[s.tone] || s.tone}</div>
                <div className="text-[12px] text-ink">{s.text}</div>
              </button>
            ))}
          </div>
        )}
        {prefilled && text.trim() && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px] text-bordeaux bg-bordeaux/5 border border-bordeaux/20 rounded-lg px-3 py-1.5">
            <Sparkles size={12} strokeWidth={1.8} className="flex-shrink-0" />
            <span>Réponse préparée à la réception — relis et ajuste avant d'envoyer.</span>
            <button onClick={() => { setText(''); setPrefilled(false); setCorrected(false) }} className="ml-auto text-ink-mute hover:text-bordeaux flex-shrink-0" title="Effacer">✕</button>
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
            <span className="text-[13px] text-ink flex-1">Enregistrement… {fmtDuration(recordSeconds)}</span>
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
            {/* Réponses rapides : déplacées dans le tiroir à droite (survol). */}
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
                <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={onPickFile} className="hidden" />
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
      </div>{/* fin colonne conversation */}

      {waConfirm && (
        <NewConversationModal
          user={user}
          initialOrder={waConfirm}
          initialPhone={waConfirm.clientPhone || conv?.client_phone}
          initialName={waConfirm.clientName || conv?.client_name || ''}
          onClose={() => setWaConfirm(null)}
          onSent={() => setWaConfirm(null)}
        />
      )}

      {editOrder && (
        <OrderEditModal
          order={editOrder}
          user={user}
          onClose={() => setEditOrder(null)}
          onChanged={() => { const ref = conv?.link_order_ref; if (ref) searchOrders(ref).then(os => { const o = (os || []).find(x => x.name === ref) || (os || [])[0]; if (o) setLinkedOrder(o) }).catch(() => {}) }}
        />
      )}

      {linkMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setLinkMenuOpen(false)}>
          <div className="bg-white rounded-2xl p-4 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="text-[13px] font-semibold text-ink mb-3">Quel lien envoyer au client ?</div>
            <button onClick={() => { setLinkMenuOpen(false); sendOrderLink() }} className="w-full text-left px-3 py-3 rounded-xl text-[13px] text-ink hover:bg-cream/40 border border-line mb-2">🎂 Cake design <span className="text-ink-mute">(prix par part)</span></button>
            <button onClick={() => { setLinkMenuOpen(false); sendCatalogueLink() }} className="w-full text-left px-3 py-3 rounded-xl text-[13px] text-ink hover:bg-cream/40 border border-line">🧁 Catalogue <span className="text-ink-mute">(salé, boissons, plateaux…)</span></button>
          </div>
        </div>
      )}

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
              <h3 className="font-fraunces italic text-[18px] text-ink">Commandes & devis</h3>
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
                    <div
                      key={o.id}
                      onClick={() => window.open(`/?devis=${encodeURIComponent(o.name)}&dstate=${encodeURIComponent(o.state || '')}&dday=${encodeURIComponent((o.deliveryAt || '').slice(0, 10))}`, '_blank')}
                      title="Ouvrir cette commande dans l'onglet Commandes"
                      className="bg-white border border-line rounded-xl p-3 cursor-pointer hover:border-bordeaux transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-bordeaux">{o.name} ↗</span>
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

      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <button onClick={() => setLightboxUrl(null)} title="Fermer"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/90 text-ink rounded-full hover:bg-white shadow-lg">
            <X size={22} strokeWidth={2} />
          </button>
          <img src={lightboxUrl} alt="" onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  )
}
