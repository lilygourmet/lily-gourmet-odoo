import { Calendar, BarChart3, ListTodo, MessageCircle, Banknote, Truck } from 'lucide-react'
import { isLivreur, canSeeCalendar, canRecaps, canSeeConversations, canSeeCaisse, canSeeLivraisons } from '../lib/auth'

// Barre de navigation en bas, visible UNIQUEMENT sur téléphone (sm:hidden).
// Additive : ne remplace pas le menu du haut. Montée une fois dans App.
export default function MobileBottomNav({ user, activeView, onNavigate }) {
  if (!user) return null

  const dest = []
  if (canSeeCalendar(user)) dest.push({ view: 'calendar', label: 'Agenda', Icon: Calendar })
  if (canSeeLivraisons(user)) dest.push({ view: 'livraisons', label: 'Livr.', Icon: Truck })
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
        return (
          <button key={it.view} onClick={() => onNavigate(it.view)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? 'text-bordeaux' : 'text-ink-mute'}`}>
            <it.Icon size={20} strokeWidth={1.8} />
            {it.label}
          </button>
        )
      })}
    </nav>
  )
}
