import { supabase } from './supabase'
import { createTask } from './tasks'

// ============================================================
// DISPATCH DES LIVRAISONS AUX LIVREURS
// Assignation par NUMÉRO de commande (Sxxxx) -> table `livraisons`.
// (Certaines commandes n'ont pas d'order_id interne, mais TOUTES ont un n° S.)
// profiles.livreur_defaut = livreur par défaut (reçoit les non-assignées).
// ============================================================

export async function loadLivreurs() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, livreur_defaut, whatsapp')
    .eq('role', 'livreur')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw error
  return data || []
}

// État (livreur_id, livraison_faite, statut, assigned_by) pour une liste de n° de commande.
export async function loadDeliveryStates(orderNums) {
  const nums = (orderNums || []).filter(Boolean)
  if (nums.length === 0) return {}
  const { data, error } = await supabase
    .from('livraisons')
    .select('order_num, livreur_id, livraison_faite, statut, assigned_by')
    .in('order_num', nums)
  if (error) throw error
  const map = {}
  for (const o of (data || [])) map[o.order_num] = { livreur_id: o.livreur_id, livraison_faite: o.livraison_faite, statut: o.statut, assigned_by: o.assigned_by }
  return map
}

// Notifie TOUTES les personnes ayant accès aux Livraisons (admin / récap / livreurs),
// sauf l'auteur de l'action.
// Prévient UNIQUEMENT la personne qui a assigné la livraison (champ assigned_by).
async function notifyAssigner(orderNum, actorId, title, isUrgent) {
  const { data: row } = await supabase.from('livraisons').select('assigned_by').eq('order_num', orderNum).maybeSingle()
  const target = row?.assigned_by
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
  if (livreurId && byUserId) {
    try {
      await createTask({ title: titre || '🚚 Nouvelle livraison', description: description || null, fromUserId: byUserId, toUserId: livreurId, dueDate: dueDate || null })
    } catch { /* la notif ne doit pas bloquer l'assignation */ }
  }
}

// Le livreur accepte -> notifie toute l'équipe Livraisons.
export async function acceptDelivery({ orderNum, byUserId, label, livreurName }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: byUserId, statut: 'acceptee', updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  await notifyAssigner(orderNum, byUserId, `✅ ${livreurName} a accepté la livraison · ${label}`, false)
}

// Le livreur refuse (pas dispo) -> à réassigner + notif URGENTE à toute l'équipe Livraisons.
export async function refuseDelivery({ orderNum, byUserId, label, livreurName }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: null, statut: 'refusee', updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  await notifyAssigner(orderNum, byUserId, `⚠️ ${livreurName} PAS DISPO · ${label} — à réassigner`, true)
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
