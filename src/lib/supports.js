import { supabase } from './supabase'
import { todayISO } from './dates'

// ============================================================
// SUPPORTS (consignes : verrines, plateaux, présentoirs…)
// Stock par type + sorties (OCP/client) + retours. Photo dans le bucket public 'supports'.
// ============================================================

const BUCKET = 'supports'

// Envoie une photo et renvoie son URL publique.
export async function uploadSupportPhoto(file) {
  if (!file) return null
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

// Liste des types AVEC le calcul « dehors » et « en stock ».
export async function loadSupports() {
  const [{ data: sups, error: e1 }, { data: sorties, error: e2 }] = await Promise.all([
    supabase.from('supports').select('*').order('name'),
    supabase.from('support_sorties').select('support_id, qty, qty_returned').is('returned_at', null),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const dehorsBy = {}
  for (const s of sorties || []) {
    const out = (s.qty || 0) - (s.qty_returned || 0)
    if (out > 0) dehorsBy[s.support_id] = (dehorsBy[s.support_id] || 0) + out
  }
  return (sups || []).map(s => ({
    ...s,
    dehors: dehorsBy[s.id] || 0,
    en_stock: (s.total_qty || 0) - (dehorsBy[s.id] || 0),
  }))
}

export async function addSupport({ name, totalQty, photoUrl }) {
  const { error } = await supabase.from('supports').insert({ name: name.trim(), total_qty: Number(totalQty) || 0, photo_url: photoUrl || null })
  if (error) throw error
}

export async function updateSupport(id, patch) {
  const { error } = await supabase.from('supports').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteSupport(id) {
  const { error } = await supabase.from('supports').delete().eq('id', id)
  if (error) throw error
}

// Sorties encore ouvertes (pas tout rendu), avec le type de support joint.
export async function loadOpenSorties() {
  const { data, error } = await supabase
    .from('support_sorties')
    .select('*, support:support_id(name, photo_url)')
    .is('returned_at', null)
    .order('date_sortie', { ascending: true })
  if (error) throw error
  return (data || []).filter(s => (s.qty || 0) - (s.qty_returned || 0) > 0)
}

export async function recordSortie({ support_id, qty, dest_type, client_name, order_num, date_sortie, note, created_by }) {
  const { error } = await supabase.from('support_sorties').insert({
    support_id, qty: Number(qty), dest_type,
    client_name: dest_type === 'ocp' ? 'OCP' : (client_name || null),
    order_num: order_num || null, note: note || null,
    date_sortie: date_sortie || todayISO(),
    created_by: created_by || null,
  })
  if (error) throw error
}

// Enregistre un retour (total ou partiel). Quand tout est rendu → returned_at.
export async function recordRetour(sortie, addQty) {
  const newReturned = Math.min((sortie.qty_returned || 0) + Number(addQty), sortie.qty)
  const patch = { qty_returned: newReturned }
  if (newReturned >= sortie.qty) patch.returned_at = new Date().toISOString()
  const { error } = await supabase.from('support_sorties').update(patch).eq('id', sortie.id)
  if (error) throw error
}

// ---- Règles de détection ----
export async function loadRules() {
  const { data, error } = await supabase
    .from('support_rules').select('*, support:support_id(id, name)').order('keyword')
  if (error) throw error
  return data || []
}
export async function addRule({ support_id, keyword, qty_mode, qty_value }) {
  const { error } = await supabase.from('support_rules').insert({
    support_id, keyword: keyword.trim(), qty_mode: qty_mode || 'line_qty', qty_value: Number(qty_value) || 1,
  })
  if (error) throw error
}
export async function deleteRule(id) {
  const { error } = await supabase.from('support_rules').delete().eq('id', id)
  if (error) throw error
}

// ---- « À préparer » : commandes à venir avec supports détectés par les règles ----
export async function loadAPreparer(days = 14) {
  const rules = await loadRules()
  if (!rules.length) return []
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + days)
  const { data: orders } = await supabase
    .from('orders').select('id, order_num, client_name, delivery_at, odoo_state')
    .gte('delivery_at', start.toISOString()).lt('delivery_at', end.toISOString())
    .neq('odoo_state', 'cancel').order('delivery_at', { ascending: true })
  if (!orders?.length) return []
  const orderIds = orders.map(o => o.id)
  const { data: items } = await supabase.from('order_items').select('order_id, title, quantity').in('order_id', orderIds)
  const nums = orders.map(o => o.order_num).filter(Boolean)
  const { data: existing } = await supabase.from('support_sorties').select('order_num, support_id').in('order_num', nums)
  const done = new Set((existing || []).map(e => `${e.order_num}|${e.support_id}`))
  const itemsByOrder = {}
  for (const it of items || []) { (itemsByOrder[it.order_id] ||= []).push(it) }

  const res = []
  for (const o of orders) {
    const detected = {}   // support_id -> { support, qty }
    for (const it of itemsByOrder[o.id] || []) {
      const title = (it.title || '').toLowerCase()
      for (const r of rules) {
        if (!r.keyword || !title.includes(r.keyword.toLowerCase())) continue
        const add = r.qty_mode === 'fixed'
          ? (Number(r.qty_value) || 1)
          : (Number(it.quantity) || 1) * (Number(r.qty_value) || 1)
        if (!detected[r.support_id]) detected[r.support_id] = { support: r.support, qty: 0 }
        detected[r.support_id].qty += add
      }
    }
    const supports = Object.values(detected).filter(d => d.support && !done.has(`${o.order_num}|${d.support.id}`))
    if (supports.length) res.push({ order: o, supports })
  }
  return res
}
