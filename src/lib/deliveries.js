import { supabase } from './supabase'
import { createTask } from './tasks'

// ============================================================
// DISPATCH DES LIVRAISONS AUX LIVREURS
// orders.livreur_id = livreur assigné ; orders.livraison_faite = livré.
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

// État livraison (livreur_id + livraison_faite) pour une liste de commandes.
export async function loadDeliveryStates(orderIds) {
  if (!orderIds || orderIds.length === 0) return {}
  const { data, error } = await supabase
    .from('orders')
    .select('id, livreur_id, livraison_faite')
    .in('id', orderIds)
  if (error) throw error
  const map = {}
  for (const o of (data || [])) map[o.id] = { livreur_id: o.livreur_id, livraison_faite: o.livraison_faite }
  return map
}

// Assigne une livraison à un livreur + le notifie par une tâche.
export async function assignDelivery({ orderId, livreurId, byUserId, titre }) {
  const { error } = await supabase.from('orders').update({ livreur_id: livreurId }).eq('id', orderId)
  if (error) throw error
  if (livreurId && byUserId) {
    try {
      await createTask({ title: titre || '🚚 Nouvelle livraison', description: null, fromUserId: byUserId, toUserId: livreurId })
    } catch { /* la notif ne doit pas bloquer l'assignation */ }
  }
}

export async function setLivraisonFaite(orderId, faite) {
  const { error } = await supabase.from('orders').update({ livraison_faite: faite }).eq('id', orderId)
  if (error) throw error
}
