import { supabase } from './supabase'

// Recuperer tous les items "faits" pour une periode
export async function loadDoneByItemIds(itemIds) {
  if (!itemIds || itemIds.length === 0) return {}

  const { data, error } = await supabase
    .from('gm_done')
    .select('order_item_id, done_by, done_at')
    .in('order_item_id', itemIds)

  if (error) throw error

  const map = {}
  for (const d of data || []) map[d.order_item_id] = d
  return map
}

// Marquer un item comme fait
export async function markItemDone(orderItemId, userId) {
  const { data, error } = await supabase
    .from('gm_done')
    .upsert({
      order_item_id: orderItemId,
      done_by: userId,
      done_at: new Date().toISOString(),
    }, { onConflict: 'order_item_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

// Demarquer un item (le remettre dans "a faire")
export async function unmarkItemDone(orderItemId) {
  const { error } = await supabase
    .from('gm_done')
    .delete()
    .eq('order_item_id', orderItemId)

  if (error) throw error
  return true
}
