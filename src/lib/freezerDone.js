import { supabase } from './supabase'

// Charger les MO IDs deja faits
export async function loadFreezerDoneIds() {
  const { data, error } = await supabase
    .from('freezer_done')
    .select('odoo_mo_id, done_by, done_at, profiles:done_by(full_name, username)')
  if (error) {
    console.error('[freezerDone] load error:', error)
    return {}
  }
  const map = {}
  for (const row of (data || [])) {
    map[row.odoo_mo_id] = {
      done_by: row.done_by,
      done_at: row.done_at,
      doneByName: row.profiles?.full_name || row.profiles?.username || '',
    }
  }
  return map
}

// Marquer un MO comme fait
export async function markFreezerDone(odooMoId, userId) {
  const { data, error } = await supabase
    .from('freezer_done')
    .upsert({ odoo_mo_id: odooMoId, done_by: userId, done_at: new Date().toISOString() },
      { onConflict: 'odoo_mo_id' })
    .select()
    .single()
  if (error) {
    console.error('[freezerDone] mark error:', error)
    throw error
  }
  return data
}

// Annuler le marquage fait
export async function unmarkFreezerDone(odooMoId) {
  const { error } = await supabase
    .from('freezer_done')
    .delete()
    .eq('odoo_mo_id', odooMoId)
  if (error) {
    console.error('[freezerDone] unmark error:', error)
    throw error
  }
}
