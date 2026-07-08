import { supabase } from './supabase'
import { computeSizesForCake } from './cakeSizes'

// Lit la valeur d'un poly (gère ancien format string et nouveau {value}).
const polyVal = p => (p == null ? null : (typeof p === 'object' ? p.value ?? null : p))

export async function loadPolyStock() {
  const { data, error } = await supabase
    .from('poly_stock')
    .select('*')
    .order('taille_cm', { ascending: true })
    .order('hauteur_cm', { ascending: false })
  if (error) throw error
  return data || []
}

// Pose un nouveau stock (inventaire OU découpe) : stock_base = X, base_date = maintenant.
export async function setStockBase(id, newBase, userId) {
  const { error } = await supabase.from('poly_stock')
    .update({ stock_base: newBase, base_date: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
  if (error) throw error
}

export async function setMinMax(id, min, max, userId) {
  const { error } = await supabase.from('poly_stock')
    .update({ min, max, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
  if (error) throw error
}

// Décompose les poly d'un gâteau en événements de consommation, datés à `date`.
function pushPolyEvents(events, it, date) {
  const polys = it.polys && typeof it.polys === 'object' ? it.polys : null
  if (!polys) return
  const sizes = computeSizesForCake(Number(it.pers), Math.max(1, Number(it.etages_count) || 1))
  for (const k of Object.keys(polys)) {
    const v = Number(polyVal(polys[k]))
    if (!Number.isFinite(v) || v <= 0) continue
    const idx = parseInt(k.replace('etage', ''), 10) - 1
    const cm = sizes && sizes[idx] != null ? sizes[idx] : (sizes && sizes[0] != null ? sizes[0] : null)
    if (cm == null) continue
    events.push({ date, cm, five: Math.floor(v), two: (v % 1) >= 0.5 ? 1 : 0 })
  }
}

// Consommation PRÉVUE (anticipation) : poly réglés sur des gâteaux livrés APRÈS `sinceISO`.
// Renvoie [{ date, cm, five, two }] : pour chaque étage, nb de morceaux 5 cm et 2 cm.
export async function loadPolyConsumption(sinceISO) {
  const events = []
  let off = 0
  const lim = 1000
  while (true) {
    const { data, error } = await supabase
      .from('order_items')
      .select('pers, etages_count, polys, orders!inner(delivery_at)')
      .gt('orders.delivery_at', sinceISO)
      .order('id', { ascending: true })
      .range(off, off + lim - 1)
    if (error || !data || !data.length) break
    for (const it of data) pushPolyEvents(events, it, it.orders?.delivery_at)
    if (data.length < lim) break
    off += lim
  }
  return events
}

// Consommation RÉELLE : poly des gâteaux dont l'étape « Couvert » a été cochée
// APRÈS `sinceISO`. La date de l'événement = date de couverture (item_steps.done_at).
export async function loadCoveredConsumption(sinceISO) {
  const covered = new Map()   // item_id → done_at
  let off = 0
  const lim = 1000
  while (true) {
    const { data, error } = await supabase
      .from('item_steps')
      .select('item_id, done_at')
      .eq('step_key', 'couvert')
      .eq('done', true)
      .gt('done_at', sinceISO)
      .order('item_id', { ascending: true })
      .range(off, off + lim - 1)
    if (error || !data || !data.length) break
    for (const s of data) covered.set(s.item_id, s.done_at)
    if (data.length < lim) break
    off += lim
  }
  const ids = [...covered.keys()]
  if (!ids.length) return []

  const events = []
  const chunk = 200
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const { data, error } = await supabase
      .from('order_items')
      .select('id, pers, etages_count, polys')
      .in('id', slice)
    if (error || !data) continue
    for (const it of data) pushPolyEvents(events, it, covered.get(it.id))
  }
  return events
}

// Consommation d'un article (taille × hauteur) depuis sa date de base.
export function consumptionFor(events, taille_cm, hauteur_cm, baseDateISO) {
  let n = 0
  for (const e of events) {
    if (e.cm !== taille_cm) continue
    if (baseDateISO && e.date && e.date <= baseDateISO) continue
    n += hauteur_cm === 5 ? e.five : e.two
  }
  return n
}
