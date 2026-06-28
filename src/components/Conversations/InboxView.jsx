import { useState, useEffect, useRef } from 'react'
import { loadConversations, conversationUrgency, conversationWaitingSince, searchMessageConversationIds, markConversationOpened, loadClientsCdCounts, markConversationsFidele, CONV_LABELS, loadConvLabels } from '../../lib/conversations'
import LabelsManager from './LabelsManager'
import { formatRelativeTime, isAdmin } from '../../lib/auth'
import { toast } from '../../lib/toast'
import { subscribeToPush } from '../../lib/pushNotif'
import { supabase } from '../../lib/supabase'
import Skeleton from '../Skeleton'
import ConversationDetail from './ConversationDetail'
import QuickRepliesModal from './QuickRepliesModal'
import ClientAvatar from './ClientAvatar'
import { Search, MessageSquareText } from 'lucide-react'

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'mine', label: 'À moi' },
  { key: 'unassigned', label: 'Non assignées' },
  { key: 'unread', label: 'Non lues' },
  { key: 'waiting', label: 'En attente' },
  { key: 'followup', label: 'À relancer' },
  { key: 'fermees', label: 'Fermées' },
]

const STATUS_LABEL = {
  non_assignee: { text: 'Non assignée', cls: 'bg-amber-100 text-amber-700' },
  en_cours:     { text: 'En cours',     cls: 'bg-bordeaux/10 text-bordeaux' },
  fermee:       { text: 'Fermée',       cls: 'bg-line/40 text-ink-mute' },
}

export default function InboxView({ user, initialConversationId, initialPhone, initialRelanceRef = null }) {
  const [filter, setFilter] = useState('all')
  const [conversations, setConversations] = useState([])
  const fideleCheckedRef = useRef(false)   // on ne vérifie les clients « pas encore fidèles » qu'une fois par chargement
  const [fideleSet, setFideleSet] = useState(new Set())   // affichage immédiat (9 derniers chiffres) même avant mémorisation
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(initialConversationId || null)
  const [search, setSearch] = useState('')
  const [contentMatchIds, setContentMatchIds] = useState(() => new Set())
  const [showReplies, setShowReplies] = useState(false)
  const [agentFilter, setAgentFilter] = useState('all')
  const [labelFilter, setLabelFilter] = useState('all')
  const [labels, setLabels] = useState(CONV_LABELS)
  const [showLabels, setShowLabels] = useState(false)
  // Dernière visite capturée au montage (pour repérer les nouveaux messages reçus)
  const visitedAtRef = useRef(user?.last_visited_conversations || null)
  // Conversations vues pendant cette session (id -> horodatage de la vue)
  const [seenAt, setSeenAt] = useState({})
  // Hauteur du bandeau de l'app (pour la colonne liste collante en desktop)
  const [headerTop, setHeaderTop] = useState(0)
  useEffect(() => {
    const el = document.getElementById('app-header')
    const measure = () => setHeaderTop(el?.offsetHeight || 0)
    measure()
    window.addEventListener('resize', measure)
    const ro = el ? new ResizeObserver(measure) : null
    if (el) ro.observe(el)
    return () => { window.removeEventListener('resize', measure); ro?.disconnect() }
  }, [])

  async function refresh(silent = false) {
    if (!silent) setLoading(true)
    setError('')
    try {
      // Tous les filtres se calculent côté app -> on charge tout (chiffres justes)
      const data = await loadConversations('all', user.id)
      setConversations(data)
    } catch (e) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [filter])
  useEffect(() => { loadConvLabels().then(setLabels).catch(() => {}) }, [])

  // Ouverture par téléphone (bouton « Relancer » depuis les Devis) : on
  // sélectionne le fil du client dès que la liste est chargée (match sur les 9 derniers chiffres).
  // Conversation ouverte via une relance depuis Devis : on retient son id pour
  // n'enregistrer « Relancé par » que sur CETTE conversation (pas une autre).
  const relanceConvIdRef = useRef(null)
  // Ouverture auto UNE SEULE FOIS : sinon le rafraîchissement temps réel relance cet effet
  // et te ramène de force sur le fil du lien à chaque nouveau message (impossible de naviguer).
  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current || !initialPhone || conversations.length === 0) return
    const target = String(initialPhone).replace(/\D/g, '').slice(-9)
    const found = conversations.find(c => String(c.client_phone || '').replace(/\D/g, '').slice(-9) === target)
    if (found) { autoSelectedRef.current = true; setSelectedId(found.id); if (initialRelanceRef) relanceConvIdRef.current = found.id }
  }, [initialPhone, conversations, initialRelanceRef])

  // Clients fidèles : l'étoile vient de la colonne mémorisée `c.fidele` (plus de re-check
  // une fois acquis). On vérifie via Odoo SEULEMENT les clients pas encore fidèles, une seule
  // fois par chargement, et on mémorise ceux qui le deviennent.
  const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
  useEffect(() => {
    if (fideleCheckedRef.current || conversations.length === 0) return
    fideleCheckedRef.current = true
    const candidats = conversations.filter(c => !c.fidele && last9(c.client_phone).length >= 8)
    const phones = [...new Set(candidats.map(c => last9(c.client_phone)))]
    if (!phones.length) return
    let cancelled = false
    loadClientsCdCounts(phones).then(async counts => {
      if (cancelled) return
      const fideleL9 = new Set(Object.entries(counts).filter(([, n]) => n >= 3).map(([l9]) => l9))
      if (!fideleL9.size) return
      setFideleSet(prev => new Set([...prev, ...fideleL9]))   // affichage immédiat
      const toMark = candidats.filter(c => fideleL9.has(last9(c.client_phone)))
      const ids = toMark.map(c => c.id)
      if (!ids.length) return
      try { await markConversationsFidele(ids) } catch { /* non bloquant */ }
      setConversations(prev => prev.map(c => ids.includes(c.id) ? { ...c, fidele: true } : c))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [conversations])

  // Temps réel : rafraîchit la liste quand une conversation change (nouveau message…).
  // Anti-rebond 1,5 s : une rafale de messages = UN seul rechargement (sinon ça rame).
  useEffect(() => {
    let timer = null
    const channel = supabase
      .channel('inbox-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => refresh(true), 1500)
      })
      .subscribe()
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Abonne ce user aux notifs push Conversations (1re ouverture = demande de permission)
  useEffect(() => {
    if (user?.id) subscribeToPush(user.id, 'conversations').catch(() => {})
  }, [user?.id])

  // Recherche dans le contenu des messages (temporisée 300 ms, dès 2 caractères)
  useEffect(() => {
    const t = search.trim()
    if (t.length < 2) { setContentMatchIds(new Set()); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const ids = await searchMessageConversationIds(t)
        if (!cancelled) setContentMatchIds(new Set(ids))
      } catch (_) { /* ignore */ }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  // Agents disponibles (déduits des conversations assignées)
  const agentOptions = [...new Map(
    conversations.filter(c => c.assigned).map(c => [c.assigned.id, c.assigned])
  ).values()]

  const waitingCount = conversations.filter(c => conversationUrgency(c)?.emoji === '🔴').length
  const followupCount = conversations.filter(c => conversationUrgency(c)?.emoji === '🟡').length
  // « Non lu » = on n'a pas encore répondu (le client a parlé en dernier), ou marqué manuellement.
  // → reste non lu même après ouverture ; part uniquement quand on répond.
  const unreadCount = conversations.filter(c => c.marked_unread || !!conversationWaitingSince(c)).length

  const term = search.trim().toLowerCase()
  let list = conversations
  // « À moi » = mes conversations + le pool des non assignées (à prendre par n'importe qui).
  // Dès qu'une non assignée est prise, elle devient « celle du preneur » → quitte le « À moi » des autres.
  if (filter === 'mine') list = list.filter(c => c.assigned_to === user.id || c.status === 'non_assignee')
  else if (filter === 'unassigned') list = list.filter(c => c.status === 'non_assignee')
  else if (filter === 'waiting') list = list.filter(c => conversationUrgency(c)?.emoji === '🔴')
  else if (filter === 'followup') list = list.filter(c => conversationUrgency(c)?.emoji === '🟡')
  else if (filter === 'fermees') list = list.filter(c => c.status === 'fermee')
  else if (filter === 'unread') {
    list = list.filter(c => c.marked_unread || !!conversationWaitingSince(c))
  }
  if (agentFilter !== 'all') list = list.filter(c => (c.assigned?.id || null) === agentFilter)
  if (labelFilter !== 'all') list = list.filter(c => (c.labels || []).includes(labelFilter))
  // Les conversations FERMÉES n'apparaissent que dans le filtre « Fermées ».
  // Exception : en recherche, elles remontent (pour pouvoir les retrouver).
  if (filter !== 'fermees' && !term) list = list.filter(c => c.status !== 'fermee')
  const filtered = !term ? list : list.filter(c =>
    (c.client_name || '').toLowerCase().includes(term) ||
    (c.client_phone || '').toLowerCase().includes(term) ||
    contentMatchIds.has(c.id)
  )

  // Tri "file d'attente" : les clients qui attendent une réponse en premier,
  // le plus ancien en attente tout en haut ; sinon par activité récente.
  const sorted = [...filtered].sort((a, b) => {
    // Les conversations fermées toujours regroupées en bas de la liste
    const ca = a.status === 'fermee' ? 1 : 0
    const cb = b.status === 'fermee' ? 1 : 0
    if (ca !== cb) return ca - cb
    const wa = conversationWaitingSince(a)
    const wb = conversationWaitingSince(b)
    // En haut : client en attente OU conversation marquée "non lue"
    const topA = (wa || a.marked_unread || a.link_order_at) ? 1 : 0
    const topB = (wb || b.marked_unread || b.link_order_at) ? 1 : 0
    if (topA !== topB) return topB - topA
    if (wa && wb) return wa - wb        // les deux attendent : le plus vieux d'abord
    if (wa) return -1                    // a attend, pas b -> a devant
    if (wb) return 1
    return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  })

  // Affichage plafonné (perf) : on dessine seulement les plus prioritaires (déjà triées en haut).
  // En recherche, on montre TOUS les résultats. Les autres restent accessibles via la recherche.
  const SHOWN_CAP = 80
  const visible = term ? sorted : sorted.slice(0, SHOWN_CAP)
  const hiddenCount = sorted.length - visible.length

  return (
    <div className="md:flex md:items-start" style={{ '--appbar': `${headerTop}px` }}>
      {/* COLONNE LISTE (gauche) — collante en desktop */}
      <div className={`${selectedId ? 'hidden md:block' : 'block'} md:w-[35%] md:max-w-[400px] md:flex-shrink-0 md:border-r border-line md:sticky md:top-[var(--appbar)] md:h-[calc(100dvh-var(--appbar))] md:overflow-y-auto`}>
        {/* En-tête figé : titre + son + actions + recherche + filtres */}
        <div className="md:sticky md:top-0 z-10 bg-cream px-4 pt-4 pb-3 border-b border-line">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="font-fraunces italic text-[20px] text-ink leading-none flex-shrink-0">Conversations</h1>
            <div className="relative flex-1 min-w-0">
              <Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-9 pr-8 py-1.5 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux"
              />
              {search && (
                <button onClick={() => setSearch('')} title="Effacer" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-bordeaux text-[13px]">✕</button>
              )}
            </div>
            <button onClick={() => setShowReplies(true)} title="Phrases types" className="w-9 h-9 flex-shrink-0 rounded-full border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream flex items-center justify-center transition-all"><MessageSquareText size={16} strokeWidth={1.8} /></button>
            {isAdmin(user) && (
              <button onClick={() => setShowLabels(true)} title="Étiquettes" className="w-9 h-9 flex-shrink-0 rounded-full border border-line text-ink-soft hover:border-bordeaux flex items-center justify-center transition-all">⚙️</button>
            )}
          </div>

          {/* Filtres + agents — une seule ligne qui défile (gain de place) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <div className="inline-flex bg-cream-warm rounded-full p-0.5 border border-line flex-nowrap flex-shrink-0">
              {FILTERS.map(f => {
                let label = f.label
                if (f.key === 'waiting' && waitingCount) label = `En attente (${waitingCount})`
                else if (f.key === 'followup' && followupCount) label = `À relancer (${followupCount})`
                else if (f.key === 'unread' && unreadCount) label = `Non lues (${unreadCount})`
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
                      filter === f.key ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
                    }`}
                  >{label}</button>
                )
              })}
            </div>
            {agentOptions.length > 0 && (
              <select
                value={agentFilter}
                onChange={e => setAgentFilter(e.target.value)}
                className="px-2 py-1 text-[11px] border border-line rounded-full bg-cream-warm focus:outline-none focus:border-bordeaux flex-shrink-0"
              >
                <option value="all">Tous les agents</option>
                {agentOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.full_name || a.username}</option>
                ))}
              </select>
            )}
            <select
              value={labelFilter}
              onChange={e => setLabelFilter(e.target.value)}
              className="px-2 py-1 text-[11px] border border-line rounded-full bg-cream-warm focus:outline-none focus:border-bordeaux flex-shrink-0"
            >
              <option value="all">Toutes étiquettes</option>
              {labels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Liste défilante */}
        <div className="px-4 py-3">

          {loading && <Skeleton rows={5} />}
          {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}
          {!loading && !error && conversations.length === 0 && (
            <div className="text-center py-8 text-ink-mute italic">Aucune conversation.</div>
          )}
          {!loading && !error && conversations.length > 0 && filtered.length === 0 && (
            <div className="text-center py-8 text-ink-mute italic">Aucune conversation ne correspond à « {search} ».</div>
          )}

          <div className="space-y-2">
            {visible.map(c => {
              const st = STATUS_LABEL[c.status] || STATUS_LABEL.non_assignee
              const u = conversationUrgency(c)
              const toneClass = u?.tone === 'urgent' ? 'text-bordeaux' : u?.tone === 'warn' ? 'text-amber-600' : 'text-ink-mute'
              // Statut : un point de couleur + texte (orange = non assignée, vert = en cours, gris = fermée).
              const statusColor = c.status === 'fermee' ? '#cbbfc4' : c.status === 'en_cours' ? '#5f9270' : '#e0a23a'
              const statusText = c.status === 'en_cours'
                ? `En cours${c.assigned?.full_name ? ' · ' + c.assigned.full_name : ''}`
                : st.text
              const seenRef = seenAt[c.id] || visitedAtRef.current
              // En avant aussi tant que le client attend une réponse (même déjà ouverte),
              // jusqu'à ce qu'un agent réponde (conversationWaitingSince repasse à null).
              const isNew = c.marked_unread || c.unread_count > 0 || !!c.link_order_at || conversationWaitingSince(c) || (c.last_inbound_at && (!seenRef || c.last_inbound_at > seenRef))
              const isSelected = c.id === selectedId
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSeenAt(prev => ({ ...prev, [c.id]: new Date().toISOString() }))
                    setSelectedId(c.id)
                    // On garde le compteur "non lu" (vert) tant que l'équipe n'a pas
                    // répondu : l'ouverture enlève seulement l'étiquette manuelle et le tag commande.
                    if (c.marked_unread || c.link_order_at) {
                      setConversations(prev => prev.map(x => x.id === c.id ? { ...x, marked_unread: false, link_order_at: null } : x))
                      markConversationOpened(c.id).catch(() => {})
                    }
                  }}
                  className={`w-full text-left rounded-xl border p-3 transition-colors shadow-sm hover:border-bordeaux ${
                    isSelected ? 'bg-line/50 border-ink' : isNew ? 'bg-bordeaux/5 border-bordeaux/40' : 'bg-cream-warm border-line'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ClientAvatar conv={c} size={42} variant="light" fidele={!!c.fidele || fideleSet.has(last9(c.client_phone))} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[15px] truncate flex items-center gap-1.5 min-w-0 ${isNew ? 'font-semibold text-bordeaux' : 'font-medium text-ink'}`}>
                          {c.unread_count > 0 && conversationWaitingSince(c)
                            ? <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#6f9171] text-white text-[10px] font-semibold flex items-center justify-center leading-none">{c.unread_count}</span>
                            : isNew && <span className="w-2 h-2 rounded-full bg-bordeaux flex-shrink-0" />}
                          <span className="truncate">{c.client_name || c.client_phone}</span>
                          {c.link_order_at && <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F7E3EA] text-[#993556]">Commande</span>}
                        </span>
                        <span className="text-[11.5px] text-ink-mute flex-shrink-0 tabular-nums">{formatRelativeTime(c.last_message_at)}</span>
                      </div>
                      {/* Ligne 2 : statut + étiquettes + urgence — passe à la ligne pour tout voir */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                          <span className="text-[12px] text-ink-soft">{statusText}</span>
                        </span>
                        {labels.filter(l => (c.labels || []).includes(l.key)).map(l => (
                          <span key={l.key} className="text-[10.5px] font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: l.bg, color: l.color }}>{l.label}</span>
                        ))}
                        {u && u.text && (
                          <span className={`text-[11.5px] break-words ${u.tone === 'urgent' ? 'font-semibold text-red-600' : toneClass}`}>{u.text}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
            {hiddenCount > 0 && (
              <div className="text-center py-3 text-[12px] text-ink-mute italic">
                + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''} — utilise la recherche pour les retrouver
              </div>
            )}
          </div>
        </div>
      </div>

      {/* COLONNE DÉTAIL (droite) */}
      <div className={`${selectedId ? 'block' : 'hidden md:block'} md:flex-1 md:min-w-0`}>
        {selectedId ? (
          <ConversationDetail
            conversationId={selectedId}
            user={user}
            onBack={() => { setSelectedId(null); refresh() }}
            relanceRef={initialRelanceRef && selectedId === relanceConvIdRef.current ? initialRelanceRef : null}
          />
        ) : (
          <div className="hidden md:flex items-center justify-center bg-cream-warm/30 md:h-[calc(100dvh-var(--appbar))]">
            <div className="text-center px-6">
              <img src="/Logo_LG.jpg" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-70" />
              <div className="text-[16px] font-medium text-ink">Sélectionnez une conversation</div>
              <div className="text-[12px] text-ink-mute mt-1">Choisissez un client dans la liste à gauche pour commencer</div>
            </div>
          </div>
        )}
      </div>

      {showReplies && <QuickRepliesModal onClose={() => setShowReplies(false)} />}
      {showLabels && <LabelsManager onClose={() => setShowLabels(false)} onSaved={() => loadConvLabels().then(setLabels).catch(() => {})} />}
    </div>
  )
}
