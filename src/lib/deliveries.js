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

// État (livreur_id + livraison_faite) pour une liste de n° de commande.
export async function loadDeliveryStates(orderNums) {
  const nums = (orderNums || []).filter(Boolean)
  if (nums.length === 0) return {}
  const { data, error } = await supabase
    .from('livraisons')
    .select('order_num, livreur_id, livraison_faite')
    .in('order_num', nums)
  if (error) throw error
  const map = {}
  for (const o of (data || [])) map[o.order_num] = { livreur_id: o.livreur_id, livraison_faite: o.livraison_faite }
  return map
}

// Assigne une livraison à un livreur + le notifie par une tâche.
export async function assignDelivery({ orderNum, livreurId, byUserId, titre, description, dueDate }) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livreur_id: livreurId, updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
  if (livreurId && byUserId) {
    try {
      await createTask({ title: titre || '🚚 Nouvelle livraison', description: description || null, fromUserId: byUserId, toUserId: livreurId, dueDate: dueDate || null })
    } catch { /* la notif ne doit pas bloquer l'assignation */ }
  }
}

export async function setLivraisonFaite(orderNum, faite) {
  const { error } = await supabase
    .from('livraisons')
    .upsert({ order_num: orderNum, livraison_faite: faite, updated_at: new Date().toISOString() }, { onConflict: 'order_num' })
  if (error) throw error
}
