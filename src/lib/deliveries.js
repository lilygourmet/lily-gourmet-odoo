import { supabase } from './supabase'
import { createTask } from './tasks'
import { memoCache } from './memoCache'

// ============================================================
// DISPATCH DES LIVRAISONS AUX LIVREURS
// Assignation par NUMÉRO de commande (Sxxxx) -> table `livraisons`.
// (Certaines commandes n'ont pas d'order_id interne, mais TOUTES ont un n° S.)
// profiles.livreur_defaut = livreur par défaut (reçoit les non-assignées).
// ============================================================

// Cache 5 min (liste quasi figée ; modifs de permissions livreur très rares).
async function _loadLivreurs() {
  // Livreurs = ancien rôle 'livreur' OU une des 2 permissions livreur.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, livreur_defaut, perm_livreur_defaut, perm_livreur_assigne, whatsapp')
    .or('role.eq.livreur,perm_livreur_defaut.eq.true,perm_livreur_assigne.eq.true')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw error
  return data || []
}
export const loadLivreurs = memoCache(_loadLivreurs, 5 * 60 * 1000)

// État (livreur_id, livraison_faite, statut, assigned_by) pour une liste de n° de commande.
export async function loadDeliveryStates(orderNums) {
  const nums = (orderNums || []).filter(Boolean)
  if (nums.length === 0) return {}
  let { data, error } = await supabase
    .from('livraisons')
    .select('order_num, livreur_id, livraison_faite, statut, assigned_by, preuve_path, localisation')
    .in('order_num', nums)
  if (error) {
    // Repli si une colonne (preuve_path / localisation) n'existe pas encore (SQL pas lancé) → on ne casse rien.
    ;({ data, error } = await supabase
      .from('livraisons')
      .select('order_num, livreur_id, livraison_faite, statut, assigned_by')
      .in('order_num', nums))
    if (error) throw error
  }
  const map = {}
  for (const o of (data || [])) map[o.order_num] = { livreur_id: o.livreur_id, livraison_faite: o.livraison_faite, statut: o.statut, assigned_by: o.assigned_by, preuve_path: o.preuve_path || null, localisation: o.localisation || null }
  return map
}

// Enregistre l'adresse / localisation de livraison (texte, lien Maps/WhatsApp ou GPS).
export async function setLivraisonLocalisation(orderNum, localisation) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, localisation: (localisation || '').trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
}

// Notifie TOUTES les personnes ayant accès aux Livraisons (admin / récap / livreurs),
// sauf l'auteur de l'action.
// Prévient UNIQUEMENT la personne qui a assigné la livraison (champ assigned_by).
async function notifyAssigner(orderNum, actorId, title, isUrgent, assignedBy = undefined) {
  // On privilégie l'assignateur fourni par l'appelant (déjà chargé à l'écran) pour
  // ne pas dépendre d'une relecture en base (qui peut être bloquée par les RLS du
  // livreur connecté → assigned_by revenait vide → aucune notif). Repli : relecture.
  let target = assignedBy
  if (target === undefined) {
    const { data: row } = await supabase.from('livraisons').select('assigned_by').eq('order_num', orderNum).maybeSingle()
    target = row?.assigned_by
  }
  if (!target || target === actorId) return
  try {
    await createTask({ title, fromUserId: actorId, toUserId: target, isUrgent: !!isUrgent })
  } catch { /* notif non bloquante */ }
}

// Assigne une livraison. Le livreur PAR DÉFAUT accepte d'office (statut 'acceptee').
// Un autre livreur doit confirmer (statut 'assignee').
export async function assignDelivery({ orderNum, livreurId, byUserId, titre, description, dueDate, autoAccept }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({
      order_num: orderNum,
      livreur_id: livreurId || null,
      statut: livreurId ? (autoAccept ? 'acceptee' : 'assignee') : null,
      assigned_by: livreurId ? byUserId : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_num' })
  if (error) throw error
  // Pas de tâche pour le livreur PAR DÉFAUT (il accepte d'office et voit tout dans Livraisons).
  // On garde la tâche pour un AUTRE livreur, qui doit confirmer.
  if (livreurId && byUserId && !autoAccept) {
    try {
      await createTask({ title: titre || '🚚 Nouvelle livraison', description: description || null, fromUserId: byUserId, toUserId: livreurId, dueDate: dueDate || null })
    } catch { /* la notif ne doit pas bloquer l'assignation */ }
  }
}

// Le livreur accepte -> notifie l'assignateur de la livraison.
export async function acceptDelivery({ orderNum, byUserId, label, livreurName, assignedBy }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: byUserId, statut: 'acceptee', updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  await notifyAssigner(orderNum, byUserId, `✅ ${livreurName} a accepté la livraison · ${label}`, false, assignedBy)
}

// Le livreur refuse (pas dispo) -> à réassigner + notif URGENTE à l'assignateur.
export async function refuseDelivery({ orderNum, byUserId, label, livreurName, assignedBy }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: null, statut: 'refusee', updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  await notifyAssigner(orderNum, byUserId, `⚠️ ${livreurName} PAS DISPO · ${label} — à réassigner`, true, assignedBy)
}

// Nombre de livraisons refusées en attente de réassignation (badge onglet).
export async function countLivraisonsARelancer() {
  const { count, error } = await supabase
    .from('livraisons')
    .select('order_num', { count: 'exact', head: true })
    .eq('statut', 'refusee')
  if (error) return 0
  return count || 0
}

export async function setLivraisonFaite(orderNum, faite) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livraison_faite: faite, updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
}

// Enregistre le chemin de la photo de preuve de livraison.
export async function setLivraisonPreuve(orderNum, path) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, preuve_path: path, updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
}
