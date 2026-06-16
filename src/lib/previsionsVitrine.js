// Prévisions vitrine du jour (saisies par la pâtissière) + quantités réservées (Odoo).
import { supabase } from './supabase'

/** Prévisions d'un jour : [{ id, day, variant_id, label, size_label, qty_prevue }]. */
export async function loadPrevisions(day) {
  const { data, error } = await supabase
    .from('vitrine_previsions')
    .select('*')
    .eq('day', day)
    .order('label')
  if (error) throw error
  return data || []
}

/** Ajoute / met à jour une prévision (1 par produit & jour). */
export async function savePrevision({ day, variantId, label, sizeLabel, qty, userId }) {
  const { error } = await supabase
    .from('vitrine_previsions')
    .upsert({
      day, variant_id: variantId, label, size_label: sizeLabel || null,
      qty_prevue: Number(qty) || 0, created_by: userId || null,
    }, { onConflict: 'day,variant_id' })
  if (error) throw error
}

/** Change juste la quantité prévue d'une ligne. */
export async function updatePrevisionQty(id, qty) {
  const { error } = await supabase.from('vitrine_previsions').update({ qty_prevue: Number(qty) || 0 }).eq('id', id)
  if (error) throw error
}

/** Supprime une prévision. */
export async function deletePrevision(id) {
  const { error } = await supabase.from('vitrine_previsions').delete().eq('id', id)
  if (error) throw error
}

/** Quantités réservées en vitrine ce jour, par variante Odoo : { [variantId]: qty }. */
export async function loadVitrineReserved(day) {
  const res = await fetch('/api/wati-webhook?action=vitrine-reserved', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d.reserved || {}
}

/** Détail des réservations vitrine du jour : [{ id, name, clientName, pickupText, lines:[{text,qty}] }]. */
export async function loadVitrineReservations(day) {
  const res = await fetch('/api/wati-webhook?action=vitrine-reservations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d.orders || []
}

/** IDs (Odoo) des réservations vitrine déjà rangées ce jour. */
export async function loadResaRangees(day) {
  const { data, error } = await supabase.from('vitrine_resa_rangee').select('order_id').eq('day', day)
  if (error) throw error
  return new Set((data || []).map(r => r.order_id))
}

/** Marque une réservation comme rangée (mise de côté). */
export async function markResaRangee({ day, orderId, orderName, clientName, userId }) {
  const { error } = await supabase.from('vitrine_resa_rangee')
    .upsert({ day, order_id: orderId, order_name: orderName || null, client_name: clientName || null, marked_by: userId || null }, { onConflict: 'day,order_id' })
  if (error) throw error
}

/** Annule le « rangé » d'une réservation. */
export async function unmarkResaRangee(day, orderId) {
  const { error } = await supabase.from('vitrine_resa_rangee').delete().eq('day', day).eq('order_id', orderId)
  if (error) throw error
}
