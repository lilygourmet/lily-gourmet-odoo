import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { countUnreadTasks } from './tasks'
import { countConversationBadges, countDevisInternetNonTraites } from './conversations'
import { countModificationsATraiter } from './modifications'
import { countLivraisonsARelancer } from './deliveries'

// Compteurs de notif pour le mini-rail de la bande gauche (desktop).
// Rafraîchis au montage + toutes les 180 s + au retour sur la fenêtre.
// Volontairement léger (pas de temps réel) : c'est juste un repère « il y a des notifs ».
export function useNavBadges(user) {
  const [badges, setBadges] = useState({})
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function refresh() {
      const out = {}
      const set = (k, v) => { out[k] = Number(v) || 0 }
      await Promise.all([
        countConversationBadges(user.last_visited_conversations).then(b => set('conversations', (b.unassigned || 0) + (b.unread || 0))).catch(() => {}),
        countUnreadTasks(user.id).then(n => set('tasks', n)).catch(() => {}),
        countLivraisonsARelancer().then(n => set('livraisons', n)).catch(() => {}),
        countModificationsATraiter().then(n => set('modifications', n)).catch(() => {}),
        countDevisInternetNonTraites().then(n => set('devis-internet', n)).catch(() => {}),
        (async () => {
          const [{ count: c1 }, { count: c2 }] = await Promise.all([
            supabase.from('conges').select('id', { count: 'exact', head: true }).eq('statut', 'demande'),
            supabase.from('conges_allocations').select('id', { count: 'exact', head: true }).eq('statut', 'attente'),
          ])
          set('hr', (c1 || 0) + (c2 || 0))
        })().catch(() => {}),
        (async () => {
          const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true })
            .eq('is_payment_proof', true).is('payment_validated_at', null).is('payment_rejected_at', null)
          set('paiements', count || 0)
        })().catch(() => {}),
      ])
      if (!cancelled) setBadges(out)
    }
    refresh()
    const t = setInterval(refresh, 180000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [user?.id])
  return badges
}
