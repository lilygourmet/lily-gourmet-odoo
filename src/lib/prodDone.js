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

// Charge l'historique des actions prod_done (N derniers jours)
// Fetch separe pour profiles et sales_lines (plus fiable que join Supabase)
export async function loadProdLogs(daysBack = 7) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)

  // 1) Logs bruts
  const { data: logs, error } = await supabase
    .from('prod_done')
    .select('id, odoo_line_id, done_at, done_by')
    .gte('done_at', since.toISOString())
    .order('done_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[loadProdLogs] erreur:', error)
    return []
  }
  if (!logs || logs.length === 0) return []

  // 2) Fetch profiles en une fois
  const userIds = [...new Set(logs.map(l => l.done_by).filter(Boolean))]
  let profilesMap = new Map()
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .in('id', userIds)
    if (profs) {
      profilesMap = new Map(profs.map(p => [p.id, p]))
    }
  }

  // 3) Fetch sales_lines en une fois
  const lineIds = [...new Set(logs.map(l => l.odoo_line_id).filter(Boolean))]
  let linesMap = new Map()
  if (lineIds.length > 0) {
    const { data: lines } = await supabase
      .from('sales_lines')
      .select('odoo_line_id, product_name, quantity, client_name, order_num')
      .in('odoo_line_id', lineIds)
    if (lines) {
      linesMap = new Map(lines.map(l => [l.odoo_line_id, l]))
    }
  }

  // 4) Joindre cote JS
  return logs.map(log => ({
    ...log,
    profiles: profilesMap.get(log.done_by) || null,
    sales_lines: linesMap.get(log.odoo_line_id) || null,
  }))
}
