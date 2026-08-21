import { supabase } from './supabase'

// Modèles déjà paramétrés (liste « 🎯 À paramétrer » de Lily Studio).

/** Renvoie un Set des cake_key déjà paramétrés. */
export async function loadParametreDone() {
  const { data, error } = await supabase.from('ps_parametre').select('cake_key')
  if (error) return new Set()
  return new Set((data || []).map(r => r.cake_key))
}

/** Marque un modèle comme paramétré. */
export async function markParametre(cakeKey, orderRef, userId) {
  const { error } = await supabase.from('ps_parametre')
    .upsert({ cake_key: cakeKey, order_ref: orderRef || null, done_by: userId || null, done_at: new Date().toISOString() }, { onConflict: 'cake_key' })
  if (error) throw error
}

/** Annule (remet dans la liste). */
export async function unmarkParametre(cakeKey) {
  await supabase.from('ps_parametre').delete().eq('cake_key', cakeKey)
}

/** Historique des modèles paramétrés depuis N jours (par défaut 5), le plus récent d'abord. */
export async function loadParametreHistory(days = 5) {
  const since = new Date(); since.setDate(since.getDate() - days)
  const { data, error } = await supabase.from('ps_parametre')
    .select('cake_key, order_ref, done_by, done_at')
    .gte('done_at', since.toISOString())
    .order('done_at', { ascending: false })
  if (error) return []
  return data || []
}

/** Détail d'une commande (pour le panneau « à paramétrer ») : client, date, articles (CD/GM) + leurs infos. */
export async function loadOrderDetail(orderRef) {
  if (!orderRef) return null
  const { data } = await supabase.from('orders')
    .select('order_num, client_name, delivery_at, order_items(type, title, pers, parfums, theme, age, message, modele, impression, decor, fleurs, quantity, image_urls, warnings, polys)')
    .eq('order_num', orderRef).maybeSingle()
  return data || null
}
