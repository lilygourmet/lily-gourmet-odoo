import { supabase } from './supabase'

// ============================================================
// DEMANDES DE MODIFICATION DE COMMANDE
// Le commercial déclenche depuis une conversation (bouton « Modification »).
// L'équipe perm_modification les traite dans l'onglet « Modifications ».
// ============================================================

export async function createModification({ order_ref, client_name, client_phone, conversation_id, requested_by, description = null, justificatif_path = null }) {
  const { data, error } = await supabase
    .from('modifications')
    .insert({ order_ref, client_name, client_phone, conversation_id, requested_by, status: 'a_traiter', description, justificatif_path })
    .select().single()
  if (error) throw error
  return data
}

export async function loadModificationsATraiter() {
  const { data, error } = await supabase
    .from('modifications')
    .select('*')
    .eq('status', 'a_traiter')
    .order('requested_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function markModificationFaite(id, note, userId) {
  const { data, error } = await supabase
    .from('modifications')
    .update({ status: 'fait', note: note || null, done_by: userId, done_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function countModificationsATraiter() {
  const { count, error } = await supabase
    .from('modifications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'a_traiter')
  if (error) return 0
  return count || 0
}

// Historique : les modifications déjà traitées (les plus récentes d'abord).
export async function loadModificationsFaites(limit = 100) {
  const { data, error } = await supabase
    .from('modifications')
    .select('*')
    .eq('status', 'fait')
    .order('done_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
