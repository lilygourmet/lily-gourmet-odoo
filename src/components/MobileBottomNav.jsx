import { useState, useEffect } from 'react'
import { Calendar, BarChart3, ListTodo, MessageCircle, Banknote, Truck, Scissors } from 'lucide-react'
import { isLivreur, isLivreurDefaut, canSeeCalendar, canRecaps, canSeeConversations, canSeeCaisse, canSeeLivraisons, canSeeStockPoly } from '../lib/auth'
import { countConversationBadges } from '../lib/conversations'
import { countUnreadTasks } from '../lib/tasks'
import { countLivraisonsARelancer } from '../lib/deliveries'

// Barre de navigation en bas, visible UNIQUEMENT sur téléphone (sm:hidden).
// Additive : ne remplace pas le menu du haut. Montée une fois dans App.
export default function MobileBottomNav({ user, activeView, onNavigate }) {
  // Chiffres rouges de notification (comme le menu du haut).
  const [convCount, setConvCount] = useState(0)
  const [tasksCount, setTasksCount] = useState(0)
  const [livrCount, setLivrCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function refresh() {
      try { const b = await countConversationBadges(user.last_visited_conversations); if (!cancelled) setConvCount((b.unassigned || 0) + (b.unread || 0)) } catch { /* ignore */ }
      try { const t = await countUnreadTasks(user.id); if (!cancelled) setTasksCount(t || 0) } catch { /* ignore */ }
      try { const l = await countLivraisonsARelancer(); if (!cancelled) setLivrCount(l || 0) } catch { /* ignore */ }
    }
    refresh()
    function onVis() { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(refresh, 5 * 60 * 1000)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); clearInterval(iv) }
  }, [user?.id, user?.last_visited_conversations])

  if (!user) return null

  const badgeFor = { conversations: convCount, tasks: tasksCount, livraisons: livrCount }

  const dest = []
  if (canSeeCalendar(user)) dest.push({ view: 'calendar', label: 'Agenda', Icon: Calendar })
  if (canSeeLivraisons(user)) dest.push({ view: 'livraisons', label: 'Livr.', Icon: Truck })
  if (isLivreurDefaut(user)) dest.push({ view: 'caisse-livreur', label: 'Caisse', Icon: Banknote })
  if (canSeeStockPoly(user)) dest.push({ view: 'decoupe-poly', label: 'Découpe', Icon: Scissors })
  if (canRecaps(user)) dest.push({ view: 'recap', label: 'Récap', Icon: BarChart3 })
  if (canSeeConversations(user)) dest.push({ view: 'conversations', label: 'Chat', Icon: MessageCircle })
  if (canSeeCaisse(user)) dest.push({ view: 'caisse', label: 'Caisse', Icon: Banknote })
  if (!isLivreur(user)) dest.push({ view: 'tasks', label: 'Tâches', Icon: ListTodo })

  const items = dest.slice(0, 5)
  if (items.length < 2) return null // pas la peine d'une barre pour 1 onglet

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-cream border-t border-line flex shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map(it => {
        const active = activeView === it.view
        const n = badgeFor[it.view] || 0
        return (
          <button key={it.view} onClick={() => onNavigate(it.view)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? 'text-bordeaux' : 'text-ink-mute'}`}>
            <span className="relative">
              <it.Icon size={20} strokeWidth={1.8} />
              {n > 0 && (
                <span className="absolute -top-2 -right-3 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold bg-red-600 text-white rounded-full">
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </span>
            {it.label}
          </button>
        )
      })}
    </nav>
  )
}
