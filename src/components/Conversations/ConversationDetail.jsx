import { useState, useEffect } from 'react'
import { loadConversation, loadMessages, assignConversation } from '../../lib/conversations'
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
                {m.media_url && (
                  <a href={m.media_url} target="_blank" rel="noopener noreferrer" className="block text-[11px] underline mb-1 opacity-90">
                    📎 Pièce jointe
                  </a>
                )}
                {m.body && <div className="text-[13px] whitespace-pre-wrap break-words">{m.body}</div>}
                <div className={`text-[9px] mt-1 ${isAgent ? 'text-cream/70' : 'text-ink-mute'}`}>
                  {isAgent && m.sender?.full_name ? `${m.sender.full_name} · ` : ''}{fmtTime(m.sent_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
