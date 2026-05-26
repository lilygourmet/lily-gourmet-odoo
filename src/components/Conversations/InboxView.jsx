import { useState, useEffect } from 'react'
import { loadConversations } from '../../lib/conversations'
import { formatRelativeTime } from '../../lib/auth'
import { subscribeToPush } from '../../lib/pushNotif'
import ConversationDetail from './ConversationDetail'

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  { key: 'mine', label: 'À moi' },
  { key: 'unassigned', label: 'Non assignées' },
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

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await loadConversations(filter, user.id)
      setConversations(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [filter])

  // Abonne ce user aux notifs push Conversations (1re ouverture = demande de permission)
  useEffect(() => {
    if (user?.id) subscribeToPush(user.id, 'conversations').catch(() => {})
  }, [user?.id])

  // Vue détail : remplace la liste (retour via la flèche)
  if (selectedId) {
    return (
      <ConversationDetail
        conversationId={selectedId}
        user={user}
        onBack={() => { setSelectedId(null); refresh() }}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-32">
      <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">Conversations</h1>
      <p className="text-[12px] text-ink-mute mb-4 max-w-2xl">
        Messages WhatsApp reçus. Clique « Je prends » pour t'occuper d'un client.
      </p>

      {/* Filtres */}
      <div className="inline-flex bg-cream-warm rounded-full p-0.5 border border-line mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
              filter === f.key ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
            }`}
          >{f.label}</button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}
      {!loading && !error && conversations.length === 0 && (
        <div className="text-center py-8 text-ink-mute italic">Aucune conversation.</div>
      )}

      <div className="space-y-2">
        {conversations.map(c => {
          const st = STATUS_LABEL[c.status] || STATUS_LABEL.non_assignee
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="w-full text-left bg-cream-warm rounded-lg border border-line p-3 hover:border-bordeaux transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[14px] font-medium text-ink truncate">{c.client_name || c.client_phone}</span>
                <span className="font-mono text-[10px] text-ink-mute flex-shrink-0">{formatRelativeTime(c.last_message_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-ink-mute">{c.client_phone}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider flex-shrink-0 ${st.cls}`}>
                  {st.text}{c.assigned?.full_name ? ` · ${c.assigned.full_name}` : ''}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
