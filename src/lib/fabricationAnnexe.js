import { supabase } from './supabase'

/**
 * L'arbre de l'annexe, tel qu'Odoo le décrit : ce qui s'y fabrique vraiment
 * (ordres terminés sur 90 jours) et de quoi chaque chose est faite.
 * → { racines: [nom], combien: {nom: nbFournées}, recettes: {nom: {...}} }
 */
export async function loadArbreAnnexe(frais = false) {
  // `frais` : on vient de créer un ordre dans Odoo, la réponse mise en cache
  // 3 minutes ne le connaît pas encore et l'écran réclamerait de le recréer.
  const r = await fetch('/api/freezer-list?mode=annexe' + (frais ? '&cb=' + Date.now() : ''))
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return await r.json()
}

/** Les articles que l'équipe ne fait jamais et qu'on a rangés hors de l'écran. */
export async function loadMasques(atelier = 'annexe') {
  const { data, error } = await supabase.from('prod_masques').select('nom').eq('atelier', atelier)
  if (error) return []
  return (data || []).map(x => x.nom)
}

export async function masquer(nom, userId, atelier = 'annexe') {
  const { error } = await supabase.from('prod_masques')
    .upsert({ atelier, nom, cache_par: userId || null }, { onConflict: 'atelier,nom' })
  if (error) throw error
}

export async function demasquer(nom, atelier = 'annexe') {
  const { error } = await supabase.from('prod_masques').delete().eq('atelier', atelier).eq('nom', nom)
  if (error) throw error
}
