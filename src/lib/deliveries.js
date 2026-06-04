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
    .select('id, full_name, username, livreur_defaut')
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

// Assigne une livraison à un livreur (statut 'assignee') + le notifie par une tâche.
export async function assignDelivery({ orderNum, livreurId, byUserId, titre, description, dueDate }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({
      order_num: orderNum,
      livreur_id: livreurId || null,
      statut: livreurId ? 'assignee' : null,
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

// Le livreur accepte la livraison -> notifie celui qui l'a assignée.
export async function acceptDelivery({ orderNum, byUserId, label, livreurName }) {
  const { data: before } = await supabase.from('livraisons').select('assigned_by').eq('order_num', orderNum).maybeSingle()
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: byUserId, statut: 'acceptee', updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  const notifyId = before?.assigned_by
  if (notifyId && notifyId !== byUserId) {
    try {
      await createTask({ title: `✅ ${livreurName} a accepté la livraison · ${label}`, fromUserId: byUserId, toUserId: notifyId })
    } catch { /* notif non bloquante */ }
  }
}

// Le livreur refuse (pas dispo) -> livraison à réassigner + notifie celui qui l'a assignée.
export async function refuseDelivery({ orderNum, byUserId, label, livreurName }) {
  const { data: before } = await supabase.from('livraisons').select('assigned_by').eq('order_num', orderNum).maybeSingle()
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: null, statut: 'refusee', updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  const notifyId = before?.assigned_by
  if (notifyId && notifyId !== byUserId) {
    try {
      await createTask({ title: `⚠️ ${livreurName} PAS DISPO · ${label} — à réassigner`, fromUserId: byUserId, toUserId: notifyId, isUrgent: true })
    } catch { /* notif non bloquante */ }
  }
}

export async function setLivraisonFaite(orderNum, faite) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livraison_faite: faite, updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
}
