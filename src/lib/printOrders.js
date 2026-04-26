import { supabase } from './supabase'

// Marquer une commande comme imprimee
export async function markOrderPrinted(orderId, userId) {
  const { data, error } = await supabase
    .from('orders')
    .update({
      printed_at: new Date().toISOString(),
      printed_by: userId,
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Marquer plusieurs commandes en une fois (batch)
export async function markOrdersPrintedBatch(orderIds, userId) {
  if (!orderIds || orderIds.length === 0) return []
  const { data, error } = await supabase
    .from('orders')
    .update({
      printed_at: new Date().toISOString(),
      printed_by: userId,
    })
    .in('id', orderIds)
    .select()

  if (error) throw error
  return data || []
}

// Logique : une commande est "non imprimee" si :
// - pas de printed_at
// - OU modified_at > printed_at (modifie apres impression)
export function isOrderUnprinted(order) {
  if (!order.printed_at) return true
  if (order.modified_at) {
    const printedAt = new Date(order.printed_at).getTime()
    const modifiedAt = new Date(order.modified_at).getTime()
    if (modifiedAt > printedAt) return true
  }
  return false
}

// Filtrer une liste de commandes pour ne garder que les non-imprimees
export function filterUnprintedOrders(orders) {
  return (orders || []).filter(isOrderUnprinted)
}

// Filtrer pour ne garder que celles dont la livraison est dans la semaine en cours
// (lundi a dimanche selon une date de reference)
export function filterCurrentWeek(orders, referenceDate = new Date()) {
  const now = new Date(referenceDate)
  // Lundi de la semaine
  const day = now.getDay() // 0=dim 1=lun ... 6=sam
  const monday = new Date(now)
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return (orders || []).filter(order => {
    if (!order.delivery_at) return false
    const d = new Date(order.delivery_at)
    return d >= monday && d <= sunday
  })
}
