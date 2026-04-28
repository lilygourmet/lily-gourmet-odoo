import { supabase } from './supabase'

// Charge les prod_done pour un set de odoo_line_id
export async function loadProdDoneForLines(odooLineIds) {
  if (!odooLineIds || odooLineIds.length === 0) return []
  const { data, error } = await supabase
    .from('prod_done')
    .select('*')
    .in('odoo_line_id', odooLineIds)
  if (error) {
    console.error('[loadProdDone]', error)
    return []
  }
  return data || []
}

// Marque une ligne comme faite
export async function markProdLineDone(odooLineId, userId) {
  const { data, error } = await supabase
    .from('prod_done')
    .upsert({ odoo_line_id: odooLineId, done_by: userId, done_at: new Date().toISOString() },
            { onConflict: 'odoo_line_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// Demarque une ligne (la remet en a faire)
export async function unmarkProdLineDone(odooLineId) {
  const { error } = await supabase
    .from('prod_done')
    .delete()
    .eq('odoo_line_id', odooLineId)
  if (error) throw error
  return true
}
