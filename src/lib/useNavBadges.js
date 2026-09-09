import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { countUnreadTasks } from './tasks'
import { countConversationBadges, countDevisInternetNonTraites } from './conversations'
import { countModificationsATraiter } from './modifications'
import { countLivraisonsARelancer } from './deliveries'
import { compterCheckCd } from './checkCd'
import { canCheckCd, canValiderAnnexe, isAdmin } from './auth'
import { loadEnAttentePour, lieuxDe } from './transfertsStock'
import { loadFabProdDepuis, depuisJours } from './fabricationProd'
import { loadManques, loadFaits, loadEtats } from './fabrication'

// Compteurs de notif pour le mini-rail de la bande gauche (desktop).
// Rafraîchis au montage + toutes les 180 s + au retour sur la fenêtre.
// Volontairement léger (pas de temps réel) : c'est juste un repère « il y a des notifs ».
export function useNavBadges(user, activeView = '') {
  const [badges, setBadges] = useState({})
  // Dernier rafraîchissement : changer d'écran relit les pastilles, mais pas
  // plus d'une fois toutes les 20 secondes. Sans ça, « À valider » pouvait
  // afficher un chiffre vieux de trois minutes — le temps qu'on aille voir,
  // il ne correspondait plus à rien.
  const dernier = useRef(0)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function refresh(force = false) {
      if (!force && Date.now() - dernier.current < 20000) return
      dernier.current = Date.now()
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
          const journal = await loadFabProdDepuis(depuisJours(7), 'annexe')
          const noms = [...new Set((journal || []).map(d => d.ordre).filter(Boolean))]
          // ⚠️ Une déclaration dont l'ordre n'a PAS pu être créé dans Odoo reste
          // à l'écran, signalée « sans ordre » — et l'atelier attend qu'on s'en
          // occupe. La pastille ne comptait qu'un ordre par déclaration : elle
          // annonçait 1 là où l'écran montrait quatre lignes. L'écran les
          // regroupe par article : on compte pareil. (Layla, 2026-09-09.)
          const orphelins = new Set(
            (journal || []).filter(d => !d.ordre).map(d => d.article)).size
          if (!noms.length) { set('valider-annexe', orphelins); return }
          // On lit CES ordres-là seulement : l'arbre complet de l'annexe est
          // volontairement sans cache, bien trop lourd pour une pastille.
          const det = await loadManques(noms)
          const ouverts = det.filter(x => x.etat !== 'done' && x.etat !== 'cancel').length
          set('valider-annexe', ouverts + orphelins)
        })().catch(() => {}) : Promise.resolve(),
        // Le cake design : ce que l'équipe a marqué « fait » et qui attend sa
        // confirmation. Même lecture que l'écran, mais on s'arrête aux ordres
        // encore ouverts chez Odoo — inutile d'aller lire leurs composants pour
        // afficher un chiffre.
        (isAdmin(user) || user?.perm_valider_of) ? (async () => {
          // Les mêmes candidats que l'écran : les ordres nommés directement, et
          // ceux que couvre une préparation cochée par son nom.
          const f = await loadFaits()
          const noms = new Set()
          for (const [c, info] of Object.entries(f || {})) {
            if (/^WH.*\/MO\//i.test(c)) { noms.add(c); continue }
            if (!c.startsWith('PREP:')) continue
            for (const n of (info && info.ordres) || []) noms.add(n)
          }
          if (!noms.size) { set('fabrication-valider', 0); return }
          // ⚠️ Puis on demande leur ÉTAT à Odoo, et on écarte les validés et les
          // annulés — c'est ce que fait l'écran. Sans cette étape la pastille
          // annonçait « 2 » quand l'écran était vide (une coche restée sur un
          // ordre déjà validé). Et on ne se sert PAS de la liste des ordres
          // ouverts : elle s'arrête aux 500 plus récents sur plus de 5 000, ce
          // qui faisait rater les coches posées sur un ordre plus ancien.
          const etats = await loadEtats([...noms])
          const vivants = [...noms].filter(n => {
            const e = etats[n]
            return e && e !== 'done' && e !== 'cancel'
          })
          set('fabrication-valider', vivants.length)
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
    const t = setInterval(() => refresh(true), 180000)
    const onFocus = () => refresh(true)
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; clearInterval(t); window.removeEventListener('focus', onFocus) }
    // `activeView` : changer d'écran relit les pastilles (bridé à 20 s plus haut)
  }, [user?.id, activeView])
  return badges
}
