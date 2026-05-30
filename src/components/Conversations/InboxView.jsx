import { useState, useEffect, useRef } from 'react'
import { loadConversations, conversationUrgency, searchMessageConversationIds } from '../../lib/conversations'
import { formatRelativeTime } from '../../lib/auth'
import { subscribeToPush } from '../../lib/pushNotif'
import { isDingEnabled, setDingEnabled } from '../../lib/ding'
import { supabase } from '../../lib/supabase'
import ConversationDetail from './ConversationDetail'
import NewConversationModal from './NewConversationModal'
import QuickRepliesModal from './QuickRepliesModal'
import { Search, Volume2, VolumeX, MessageSquareText, AlertCircle, Clock, Sparkles, CheckCircle2 } from 'lucide-react'

function UrgencyIcon({ code, size = 14 }) {
  if (code === 'urgent') return <AlertCircle size={size} className="text-bordeaux" />
  if (code === 'warn')   return <Clock size={size} className="text-amber-600" />
  if (code === 'new')    return <Sparkles size={size} className="text-bordeaux" />
  if (code === 'closed') return <CheckCircle2 size={size} className="text-ink-mute" />
  return null
}

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'mine', label: 'À moi' },
  { key: 'unassigned', label: 'Non assignées' },
  { key: 'waiting', label: 'En attente', code: 'urgent' },
  { key: 'followup', label: 'À relancer', code: 'warn' },
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
  const [soundOn, setSoundOn] = useState(isDingEnabled())
  const [search, setSearch] = useState('')
  const [contentMatchIds, setContentMatchIds] = useState(() => new Set())
  const [showNew, setShowNew] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [agentFilter, setAgentFilter] = useState('all')
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

  const waitingCount = conversations.filter(c => conversationUrgency(c)?.code === 'urgent').length
  const followupCount = conversations.filter(c => conversationUrgency(c)?.code === 'warn').length

  const term = search.trim().toLowerCase()
  let list = conversations
  if (filter === 'mine') list = list.filter(c => c.assigned_to === user.id)
  else if (filter === 'unassigned') list = list.filter(c => c.status === 'non_assignee')
  else if (filter === 'waiting') list = list.filter(c => conversationUrgency(c)?.code === 'urgent')
  else if (filter === 'followup') list = list.filter(c => conversationUrgency(c)?.code === 'warn')
  if (agentFilter !== 'all') list = list.filter(c => (c.assigned?.id || null) === agentFilter)
  const filtered = !term ? list : list.filter(c =>
    (c.client_name || '').toLowerCase().includes(term) ||
    (c.client_phone || '').toLowerCase().includes(term) ||
    contentMatchIds.has(c.id)
  )

  return (
    <div className="md:flex md:items-start" style={{ '--appbar': `${headerTop}px` }}>
      {/* COLONNE LISTE (gauche) — collante en desktop */}
      <div className={`${selectedId ? 'hidden md:block' : 'block'} md:w-[35%] md:max-w-[400px] md:flex-shrink-0 md:border-r border-line md:sticky md:top-[var(--appbar)] md:h-[calc(100dvh-var(--appbar))] md:overflow-y-auto`}>
        {/* En-tête figé : titre + son + actions + recherche + filtres */}
        <div className="md:sticky md:top-0 z-10 bg-cream px-4 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h1 className="font-fraunces italic text-[26px] text-ink leading-none">Conversations</h1>
            <button
              onClick={() => { const next = !soundOn; setDingEnabled(next); setSoundOn(next) }}
              className="w-9 h-9 flex-shrink-0 rounded-full border border-line text-ink-soft hover:border-bordeaux transition-colors flex items-center justify-center"
              title={soundOn ? 'Son des notifications activé (cliquer pour couper)' : 'Son des notifications coupé (cliquer pour activer)'}
            >{soundOn ? <Volume2 size={16} strokeWidth={1.8} /> : <VolumeX size={16} strokeWidth={1.8} />}</button>
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setShowNew(true)}
              className="px-3 py-1.5 bg-bordeaux text-cream rounded-full text-[12px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all"
            >+ Nouveau message</button>
            <button
              onClick={() => setShowReplies(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-bordeaux text-bordeaux rounded-full text-[12px] font-medium tracking-wider hover:bg-bordeaux hover:text-cream transition-all"
            ><MessageSquareText size={14} strokeWidth={1.8} /> Phrases</button>
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
                if (f.key === 'waiting' && waitingCount) label = `En attente (${waitingCount})`
                else if (f.key === 'followup' && followupCount) label = `À relancer (${followupCount})`
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors inline-flex items-center gap-1.5 ${
                      filter === f.key ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
                    }`}
                  >{f.code && <UrgencyIcon code={f.code} size={12} />}{label}</button>
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
          </div>
        </div>

        {/* Liste défilante */}
        <div className="px-4 py-3">

          {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
          {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}
          {!loading && !error && conversations.length === 0 && (
            <div className="text-center py-8 text-ink-mute italic">Aucune conversation.</div>
          )}
          {!loading && !error && conversations.length > 0 && filtered.length === 0 && (
            <div className="text-center py-8 text-ink-mute italic">Aucune conversation ne correspond à « {search} ».</div>
          )}

          <div className="space-y-2">
            {filtered.map(c => {
              const st = STATUS_LABEL[c.status] || STATUS_LABEL.non_assignee
              const u = conversationUrgency(c)
              const toneClass = u?.tone === 'urgent' ? 'text-bordeaux' : u?.tone === 'warn' ? 'text-amber-600' : 'text-ink-mute'
              const seenRef = seenAt[c.id] || visitedAtRef.current
              const isNew = c.last_inbound_at && (!seenRef || c.last_inbound_at > seenRef)
              const isSelected = c.id === selectedId
              return (
                <button
                  key={c.id}
                  onClick={() => { setSeenAt(prev => ({ ...prev, [c.id]: new Date().toISOString() })); setSelectedId(c.id) }}
                  className={`w-full text-left rounded-xl border p-3 transition-colors shadow-sm hover:border-bordeaux ${
                    isSelected ? 'bg-bordeaux/10 border-bordeaux' : isNew ? 'bg-bordeaux/5 border-bordeaux/40' : 'bg-cream-warm border-line'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-[14px] truncate flex items-center gap-1.5 min-w-0 ${isNew ? 'font-semibold text-bordeaux' : 'font-medium text-ink'}`}>
                      {isNew && <span className="w-2 h-2 rounded-full bg-bordeaux flex-shrink-0" />}
                      {u && <span className="flex-shrink-0 inline-flex"><UrgencyIcon code={u.code} size={13} /></span>}
                      <span className="truncate">{c.client_name || c.client_phone}</span>
                    </span>
                    <span className="font-mono text-[10px] text-ink-mute flex-shrink-0">{formatRelativeTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-ink-mute">{c.client_phone}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider flex-shrink-0 ${st.cls}`}>
                      {st.text}{c.assigned?.full_name ? ` · ${c.assigned.full_name}` : ''}
                    </span>
                  </div>
                  {u && u.text && (
                    <div className={`text-[11px] mt-1 ${toneClass}`}>{u.text}</div>
                  )}
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
    </div>
  )
}
