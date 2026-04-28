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

// Charge l'historique des actions prod_done (14 derniers jours)
// Avec join sur profiles (qui a fait) + sales_lines (quoi)
export async function loadProdLogs(daysBack = 14) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('prod_done')
    .select(`
      id, odoo_line_id, done_at, done_by,
      profiles:done_by(full_name, username),
      sales_lines:odoo_line_id(product_name, quantity, client_name, order_num)
    `)
    .gte('done_at', since.toISOString())
    .order('done_at', { ascending: false })
    .limit(500)

  if (error) {
    console.warn('[loadProdLogs] join echec, fallback:', error)
    // Fallback : pas de join (peut arriver si FK mal definie)
    const { data: simple } = await supabase
      .from('prod_done')
      .select('*')
      .gte('done_at', since.toISOString())
      .order('done_at', { ascending: false })
      .limit(500)
    return simple || []
  }
  return data || []
}
