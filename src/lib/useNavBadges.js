import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { countUnreadTasks } from './tasks'
import { countConversationBadges, countDevisInternetNonTraites } from './conversations'
import { countModificationsATraiter } from './modifications'
import { countLivraisonsARelancer } from './deliveries'
import { compterCheckCd } from './checkCd'
import { canCheckCd, canValiderAnnexe, isAdmin } from './auth'
import { loadEnAttentePour, lieuxDe } from './transfertsStock'
import { loadFabProd } from './fabricationProd'
import { loadManques, loadOrdres, loadFaits } from './fabrication'
import { todayISO } from './dates'

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
        // Le double contrôle des sorties : combien d'étages attendent d'être
        // vérifiés. Seulement pour qui en a la charge — la lecture passe par
        // Odoo, inutile de la faire tourner pour tout le monde.
        canCheckCd(user) ? compterCheckCd().then(n => set('check-cd', n)).catch(() => {}) : Promise.resolve(),
        // Ce que l'annexe a déclaré aujourd'hui et qui attend sa validation :
        // on ne compte que les déclarations rattachées à un ordre ENCORE ouvert
        // dans Odoo, sinon le chiffre resterait allumé après la validation.
        canValiderAnnexe(user) ? (async () => {
          const journal = await loadFabProd(todayISO(), 'annexe')
          const noms = [...new Set((journal || []).map(d => d.ordre).filter(Boolean))]
          if (!noms.length) { set('valider-annexe', 0); return }
          // On lit CES ordres-là seulement : l'arbre complet de l'annexe est
          // volontairement sans cache, bien trop lourd pour une pastille.
          const det = await loadManques(noms)
          set('valider-annexe', det.filter(x => x.etat !== 'done' && x.etat !== 'cancel').length)
        })().catch(() => {}) : Promise.resolve(),
        // Le cake design : ce que l'équipe a marqué « fait » et qui attend sa
        // confirmation. Même lecture que l'écran, mais on s'arrête aux ordres
        // encore ouverts chez Odoo — inutile d'aller lire leurs composants pour
        // afficher un chiffre.
        (isAdmin(user) || user?.perm_valider_of) ? (async () => {
          const [tous, f] = await Promise.all([loadOrdres(), loadFaits()])
          const ouverts = new Set((tous || []).map(o => o.name))
          const noms = new Set()
          for (const [c, info] of Object.entries(f || {})) {
            if (/^WH.*\/MO\//i.test(c)) { if (ouverts.has(c)) noms.add(c); continue }
            if (!c.startsWith('PREP:')) continue
            for (const n of (info && info.ordres) || []) if (ouverts.has(n)) noms.add(n)
          }
          set('fabrication-valider', noms.size)
        })().catch(() => {}) : Promise.resolve(),
        // Les transferts qui attendent d'être réceptionnés PAR CET utilisateur.
        lieuxDe(user).length ? loadEnAttentePour(user).then(l => {
          set('transferts-mp', l.filter(t => t.famille === 'mp').length)
          set('transferts-sm', l.filter(t => t.famille !== 'mp').length)
        }).catch(() => {}) : Promise.resolve(),
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
