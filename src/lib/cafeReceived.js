import { supabase } from './supabase'

// Module cafe_received : equivalent de prod_done mais pour le cafe.
// Une entree = "le cafe a recu/range cet article".
// L'absence d'entree => "le cafe doit encore le ranger".

// Charge toutes les entrees cafe_received pour un set de odoo_line_id
export async function loadCafeReceivedForLines(odooLineIds) {
  if (!odooLineIds || odooLineIds.length === 0) return []
  const { data, error } = await supabase
    .from('cafe_received')
    .select('*')
    .in('odoo_line_id', odooLineIds)
  if (error) {
    console.error('[loadCafeReceived]', error)
    return []
  }
  return data || []
}

// Marque une ligne comme "recu par le cafe"
export async function markCafeReceived(odooLineId, userId) {
  const { data, error } = await supabase
    .from('cafe_received')
    .upsert(
      {
        odoo_line_id: odooLineId,
        received_by: userId,
        received_at: new Date().toISOString(),
      },
      { onConflict: 'odoo_line_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Demarque une ligne (au cas ou erreur)
export async function unmarkCafeReceived(odooLineId) {
  const { error } = await supabase
    .from('cafe_received')
    .delete()
    .eq('odoo_line_id', odooLineId)
  if (error) throw error
  return true
}
