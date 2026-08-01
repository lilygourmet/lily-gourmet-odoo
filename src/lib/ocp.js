import { supabase } from './supabase'

// Ajouts / retraits d'articles du lien OCP (gérés depuis l'app).
export async function loadOcpOverrides() {
  const { data } = await supabase.from('ocp_overrides').select('*').order('id')
  return data || []
}
export async function addOcpOverride(row) {
  const { error } = await supabase.from('ocp_overrides').insert(row)
  if (error) throw error
}
export async function removeOcpOverride(id) {
  const { error } = await supabase.from('ocp_overrides').delete().eq('id', id)
  if (error) throw error
}
export async function hideOcpItem(category, label) {
  return addOcpOverride({ action: 'hide', category, label })
}
// Photo mise à la main sur un article du lien OCP (remplace l'éventuelle photo existante).
export async function setOcpPhoto(category, label, image) {
  await supabase.from('ocp_overrides').delete().eq('action', 'photo').eq('category', category).eq('label', label)
  return addOcpOverride({ action: 'photo', category, label, image })
}
// ---- Facture OCP ----
// Commandes OCP à facturer sur une période (lecture seule côté Odoo).
export async function loadOcpFactureData(from, to) {
  const r = await fetch('/api/wati-webhook?action=ocp-facture-data', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Échec du chargement')
  return j.evenements || []
}

// Enregistre la facture émise : l'app se souvient des commandes déjà facturées.
export async function saveOcpFacture(row) {
  const { data, error } = await supabase.from('ocp_factures').insert(row).select().single()
  if (error) throw error
  return data
}

export async function loadOcpFactures() {
  const { data } = await supabase.from('ocp_factures')
    .select('id, numero, date_facture, periode_du, periode_au, total_ttc, order_ids')
    .order('date_facture', { ascending: false }).limit(50)
  return data || []
}

export async function removeOcpPhoto(category, label) {
  const { error } = await supabase.from('ocp_overrides').delete().eq('action', 'photo').eq('category', category).eq('label', label)
  if (error) throw error
}
