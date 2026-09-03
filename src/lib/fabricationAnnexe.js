import { supabase } from './supabase'

/**
 * L'arbre de l'annexe, tel qu'Odoo le décrit : ce qui s'y fabrique vraiment
 * (ordres terminés sur 90 jours) et de quoi chaque chose est faite.
 * → { racines: [nom], combien: {nom: nbFournées}, recettes: {nom: {...}} }
 */
export async function loadArbreAnnexe() {
  // Toujours frais : l'API ne met plus cet écran en cache, et le `cb` empêche
  // le navigateur d'en garder une copie. Layla doit voir ses ajustements
  // d'inventaire tout de suite, pas 3 minutes plus tard.
  const r = await fetch('/api/freezer-list?mode=annexe&cb=' + Date.now())
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

/**
 * Les enfants qui empêchent de dire « c'est fait » : un ingrédient QU'ON
 * FABRIQUE, dont l'annexe connaît le stock, et qui est à zéro. On ne peut pas
 * avoir fabriqué quelque chose avec un composant qu'Odoo dit absent — c'est
 * que le composant n'a pas été déclaré ou pas compté. Le pâtissier se débloque
 * en ouvrant l'enfant : il le déclare fait, ou il le compte.
 * (Demande de Layla, 2026-09-03.)
 *
 * ⚠️ Un stock INCONNU ne bloque pas : ces articles-là (génoise CD, sirop
 * imbibage…) sont fabriqués et rangés à la BOUTIQUE, jamais à l'annexe — le
 * pâtissier d'ici ne pourrait pas les compter, ce serait un mur définitif.
 * ⚠️ Un ingrédient ACHETÉ ne bloque pas non plus : la farine ou le sucre à zéro
 * chez Odoo n'empêche pas l'atelier de tourner.
 * ⚠️ Les GÉNOISES et les SIROPS ne bloquent jamais (Layla, 2026-09-03) : il y en
 * a treize dans les recettes, faits des deux côtés et rarement à jour chez
 * Odoo. Ils bloquaient à eux seuls 17 articles sur 30.
 * ⚠️ Un enfant DÉJÀ PRIS EN CHARGE ne bloque plus — déclaré aujourd'hui, ou
 * avec un ordre ouvert dans Odoo. Sans ça, c'est un cul-de-sac : déclarer
 * l'enfant crée un ORDRE, et le stock ne remonte qu'à la validation. Le
 * 2026-09-03 la pâte à croissant à −2265 a bloqué TOUTE la viennoiserie
 * (croissants, pains au chocolat, pains suisses, babka, pains aux raisins) et
 * l'atelier ne pouvait plus rien déclarer de la matinée.
 */
const SANS_BLOCAGE = /genoise|sirop/

const sansAccent = (n) => String(n || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function enfantsARupture(recettes, stocks, nom, enCours) {
  const r = (recettes || {})[nom]
  if (!r || !r.lignes) return []
  const pris = enCours instanceof Set ? enCours : new Set(enCours || [])
  const bloquants = new Set()
  for (const l of r.lignes) {
    if (!l.fabrique || bloquants.has(l.produit)) continue
    if (SANS_BLOCAGE.test(sansAccent(l.produit))) continue
    if (pris.has(l.produit)) continue                    // déjà déclaré ou en cours
    const st = (stocks || {})[l.produit]
    if (st !== undefined && (st || 0) <= 0) bloquants.add(l.produit)
  }
  return [...bloquants]
}
