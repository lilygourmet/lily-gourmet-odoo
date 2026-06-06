import { useState, useEffect, useRef } from 'react'
import { loadConversations, conversationUrgency, conversationWaitingSince, searchMessageConversationIds, markConversationRead, batchUpdateNamesFromOdoo, CONV_LABELS, loadConvLabels } from '../../lib/conversations'
import LabelsManager from './LabelsManager'
import { formatRelativeTime, isAdmin } from '../../lib/auth'
import { toast } from '../../lib/toast'
import { subscribeToPush } from '../../lib/pushNotif'
import { supabase } from '../../lib/supabase'
import Skeleton from '../Skeleton'
import ConversationDetail from './ConversationDetail'
import NewConversationModal from './NewConversationModal'
import QuickRepliesModal from './QuickRepliesModal'
import ClientAvatar from './ClientAvatar'
import { Search, MessageSquareText } from 'lucide-react'

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'mine', label: 'À moi' },
  { key: 'unassigned', label: 'Non assignées' },
  { key: 'unread', label: '✉️ Non lues' },
  { key: 'waiting', label: '🔴 En attente' },
  { key: 'followup', label: '🟡 À relancer' },
  { key: 'fermees', label: 'Fermées' },
]

const STATUS_LABEL = {
  non_assignee: { text: 'Non assignée', cls: 'bg-amber-100 text-amber-700' },
  en_cours:     { text: 'En cours',     cls: 'bg-bordeaux/10 text-bordeaux' },
  fermee:       { text: 'Fermée',       cls: 'bg-line/40 text-ink-mute' },
}

export default function InboxView({ user, initialConversationId }) {
  const [filter, setFilter] = useState('all')
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(initialConversationId || null)
  const [search, setSearch] = useState('')
  const [contentMatchIds, setContentMatchIds] = useState(() => new Set())
  const [showNew, setShowNew] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [agentFilter, setAgentFilter] = useState('all')
  const [labelFilter, setLabelFilter] = useState('all')
  const [labels, setLabels] = useState(CONV_LABELS)
  const [showLabels, setShowLabels] = useState(false)
  const [syncingNames, setSyncingNames] = useState(false)

  async function handleSyncNames() {
    if (syncingNames) return
    setSyncingNames(true)
    try {
      const n = await batchUpdateNamesFromOdoo()
      toast.success(n > 0 ? `${n} nom(s) mis à jour depuis Odoo.` : 'Aucun nom à mettre à jour (déjà à jour ou pas de devis/commande).')
      await refresh(true)
    } catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
    finally { setSyncingNames(false) }
  }
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

  // Temps réel : rafraîchit la liste quand une conversation change (nouveau message…)
  useEffect(() => {
    const channel = supabase
      .channel('inbox-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => refresh(true))
      .subscribe()
    return () => supabase.removeChannel(channel)
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
  const unreadCount = conversations.filter(c => c.marked_unread || c.unread_count > 0 || (c.last_inbound_at && (!user?.last_visited_conversations || c.last_inbound_at > user.last_visited_conversations))).length

  const term = search.trim().toLowerCase()
  let list = conversations
  if (filter === 'mine') list = list.filter(c => c.assigned_to === user.id)
  else if (filter === 'unassigned') list = list.filter(c => c.status === 'non_assignee')
  else if (filter === 'waiting') list = list.filter(c => conversationUrgency(c)?.emoji === '🔴')
  else if (filter === 'followup') list = list.filter(c => conversationUrgency(c)?.emoji === '🟡')
  else if (filter === 'fermees') list = list.filter(c => c.status === 'fermee')
  else if (filter === 'unread') {
    const lv = user?.last_visited_conversations
    list = list.filter(c => c.marked_unread || c.unread_count > 0 || (c.last_inbound_at && (!lv || c.last_inbound_at > lv)))
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
    const topA = (wa || a.marked_unread) ? 1 : 0
    const topB = (wb || b.marked_unread) ? 1 : 0
    if (topA !== topB) return topB - topA
    if (wa && wb) return wa - wb        // les deux attendent : le plus vieux d'abord
    if (wa) return -1                    // a attend, pas b -> a devant
    if (wb) return 1
    return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
  })

  return (
    <div className="md:flex md:items-start" style={{ '--appbar': `${headerTop}px` }}>
      {/* COLONNE LISTE (gauche) — collante en desktop */}
      <div className={`${selectedId ? 'hidden md:block' : 'block'} md:w-[35%] md:max-w-[400px] md:flex-shrink-0 md:border-r border-line md:sticky md:top-[var(--appbar)] md:h-[calc(100dvh-var(--appbar))] md:overflow-y-auto`}>
        {/* En-tête figé : titre + son + actions + recherche + filtres */}
        <div className="md:sticky md:top-0 z-10 bg-cream px-4 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h1 className="font-fraunces italic text-[26px] text-ink leading-none">Conversations</h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowNew(true)}
                title="Nouveau message"
                className="w-9 h-9 rounded-full bg-bordeaux text-cream hover:bg-bordeaux-deep transition-all flex items-center justify-center text-[22px] leading-none pb-0.5"
              >+</button>
              <button
                onClick={() => setShowReplies(true)}
                title="Phrases types"
                className="w-9 h-9 rounded-full border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream transition-all flex items-center justify-center"
              ><MessageSquareText size={16} strokeWidth={1.8} /></button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {isAdmin(user) && (
              <button
                onClick={handleSyncNames}
                disabled={syncingNames}
                title="Mettre à jour tous les noms depuis Odoo (devis/commande), sans écraser les noms manuels"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-line text-ink-soft rounded-full text-[12px] font-medium hover:border-bordeaux transition-all disabled:opacity-50"
              >🔄 {syncingNames ? 'Maj noms…' : 'Noms Odoo'}</button>
            )}
            {isAdmin(user) && (
              <button
                onClick={() => setShowLabels(true)}
                title="Gérer les étiquettes (ajouter, renommer, couleur)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-line text-ink-soft rounded-full text-[12px] font-medium hover:border-bordeaux transition-all"
              >⚙️ Étiquettes</button>
            )}
          </div>

          {/* Recherche */}
          <div className="relative mb-3">
            <Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (nom, numéro, message…)"
              className="w-full pl-9 pr-9 py-2 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-bordeaux text-[14px]"
                title="Effacer"
              >✕</button>
            )}
          </div>

          {/* Filtres + agents (collés) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex bg-cream-warm rounded-full p-0.5 border border-line flex-wrap">
              {FILTERS.map(f => {
                let label = f.label
                if (f.key === 'waiting' && waitingCount) label = `🔴 En attente (${waitingCount})`
                else if (f.key === 'followup' && followupCount) label = `🟡 À relancer (${followupCount})`
                else if (f.key === 'unread' && unreadCount) label = `✉️ Non lues (${unreadCount})`
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
                className="px-2 py-1 text-[11px] border border-line rounded-full bg-cream-warm focus:outline-none focus:border-bordeaux"
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
              className="px-2 py-1 text-[11px] border border-line rounded-full bg-cream-warm focus:outline-none focus:border-bordeaux"
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
            {sorted.map(c => {
              const st = STATUS_LABEL[c.status] || STATUS_LABEL.non_assignee
              const u = conversationUrgency(c)
              const toneClass = u?.tone === 'urgent' ? 'text-bordeaux' : u?.tone === 'warn' ? 'text-amber-600' : 'text-ink-mute'
              // Étiquette à contour épais foncé (pas de couleur pleine, pour ne pas
              // confondre avec la surbrillance des non lus). Fermée = grisée.
              const badgeCls = c.status === 'fermee'
                ? 'border-2 border-line text-ink-mute'
                : 'border-2 border-ink text-ink'
              const seenRef = seenAt[c.id] || visitedAtRef.current
              // En avant aussi tant que le client attend une réponse (même déjà ouverte),
              // jusqu'à ce qu'un agent réponde (conversationWaitingSince repasse à null).
              const isNew = c.marked_unread || c.unread_count > 0 || conversationWaitingSince(c) || (c.last_inbound_at && (!seenRef || c.last_inbound_at > seenRef))
              const isSelected = c.id === selectedId
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSeenAt(prev => ({ ...prev, [c.id]: new Date().toISOString() }))
                    setSelectedId(c.id)
                    if (c.marked_unread || c.unread_count) {
                      setConversations(prev => prev.map(x => x.id === c.id ? { ...x, marked_unread: false, unread_count: 0 } : x))
                      markConversationRead(c.id).catch(() => {})
                    }
                  }}
                  className={`w-full text-left rounded-xl border p-3 transition-colors shadow-sm hover:border-bordeaux ${
                    isSelected ? 'bg-line/50 border-ink' : isNew ? 'bg-bordeaux/5 border-bordeaux/40' : 'bg-cream-warm border-line'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ClientAvatar conv={c} size={40} variant="light" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-[14px] truncate flex items-center gap-1.5 min-w-0 ${isNew ? 'font-semibold text-bordeaux' : 'font-medium text-ink'}`}>
                          {c.unread_count > 0
                            ? <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#6f9171] text-white text-[10px] font-semibold flex items-center justify-center leading-none">{c.unread_count}</span>
                            : isNew && <span className="w-2 h-2 rounded-full bg-bordeaux flex-shrink-0" />}
                          <span className="truncate">{c.client_name || c.client_phone}</span>
                        </span>
                        <span className="font-mono text-[10px] text-ink-mute flex-shrink-0">{formatRelativeTime(c.last_message_at)}</span>
                      </div>
                      {(c.labels || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {labels.filter(l => (c.labels || []).includes(l.key)).map(l => (
                            <span key={l.key} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: l.bg, color: l.color }}>{l.label}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-ink-mute">{c.client_phone}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider flex-shrink-0 ${badgeCls}`}>
                          {c.status === 'en_cours' && c.assigned?.full_name
                            ? c.assigned.full_name
                            : `${st.text}${c.assigned?.full_name ? ` · ${c.assigned.full_name}` : ''}`}
                        </span>
                      </div>
                      {u && u.text && (
                        u.tone === 'urgent' ? (
                          <div className="mt-1 text-[13px] font-bold text-red-600 flex items-center gap-1">
                            <span className="text-[16px]">⏰</span>
                            <span>{u.text.replace(/^⏰\s*/, '')}</span>
                          </div>
                        ) : (
                          <div className={`text-[11px] mt-1 ${toneClass}`}>{u.text}</div>
                        )
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
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

      {showNew && (
        <NewConversationModal
          user={user}
          onClose={() => setShowNew(false)}
          onSent={(id) => { setShowNew(false); if (id) setSelectedId(id); refresh() }}
        />
      )}
      {showReplies && <QuickRepliesModal onClose={() => setShowReplies(false)} />}
      {showLabels && <LabelsManager onClose={() => setShowLabels(false)} onSaved={() => loadConvLabels().then(setLabels).catch(() => {})} />}
    </div>
  )
}
