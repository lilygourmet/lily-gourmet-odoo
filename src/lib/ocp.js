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
export async function removeOcpPhoto(category, label) {
  const { error } = await supabase.from('ocp_overrides').delete().eq('action', 'photo').eq('category', category).eq('label', label)
  if (error) throw error
}
// Active (on) / désactive le « choix de la taille » sur un article du lien OCP :
// le client pourra alors choisir la taille (comme les entremets) au lieu d'une taille par défaut.
export async function setOcpSizeSelect(category, label, on) {
  await supabase.from('ocp_overrides').delete().eq('action', 'size_on').eq('category', category).eq('label', label)
  if (on) await addOcpOverride({ action: 'size_on', category, label })
}
