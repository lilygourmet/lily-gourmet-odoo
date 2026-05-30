import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { playDing } from '../../lib/ding'
import { MessageCircle } from 'lucide-react'

// Affiche un toast en haut à droite à chaque nouveau message CLIENT, sur toute
// l'app (pas seulement l'onglet Conversations). Empilable, auto-dismiss 5 s,
// clic → ouvre la conversation. Monté au niveau de App pour les users qui ont
// accès aux Conversations.
export default function ConversationNotifier({ user, onOpen }) {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    const channel = supabase
      .channel('conv-notifier')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const m = payload.new
          if (!m || m.sender_type !== 'client') return

          // Récupère le nom/numéro du client pour l'affichage
          let title = 'Nouveau message'
          try {
            const { data: conv } = await supabase
              .from('conversations')
              .select('client_name, client_phone')
              .eq('id', m.conversation_id)
              .maybeSingle()
            if (conv) title = conv.client_name || conv.client_phone
          } catch (_) { /* ignore */ }

          if (cancelled) return
          const preview = m.body ? m.body.slice(0, 60) : 'Pièce jointe'
          const id = `${m.id}-${Date.now()}`
          playDing()
          setToasts(prev => [...prev, { id, conversationId: m.conversation_id, title, preview }])
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
          }, 5000)
        })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  function dismiss(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function handleClick(t) {
    dismiss(t.id)
    onOpen(t.conversationId)
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-[90vw]">
      {toasts.map(t => (
        <button
          key={t.id}
          onClick={() => handleClick(t)}
          className="w-72 max-w-[90vw] text-left bg-cream border border-bordeaux/30 rounded-xl shadow-xl px-3 py-2.5 hover:border-bordeaux transition-colors animate-fadeIn"
        >
          <div className="flex items-start gap-2">
            <MessageCircle size={16} strokeWidth={1.8} className="flex-shrink-0 text-bordeaux mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink truncate">{t.title}</div>
              <div className="text-[11px] text-ink-mute truncate">{t.preview}</div>
            </div>
            <span
              onClick={(e) => { e.stopPropagation(); dismiss(t.id) }}
              className="text-ink-mute hover:text-bordeaux text-[14px] flex-shrink-0 cursor-pointer"
              title="Fermer"
            >×</span>
          </div>
        </button>
      ))}
    </div>
  )
}
