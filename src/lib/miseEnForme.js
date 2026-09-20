// ============================================================
// CE QUI RESTE À METTRE EN FORME.
//
// « Quand une mousse, une crème, une chantilly, un crémeux se fait, j'ai
// besoin que ça parte dans À déclarer leur découpe » — la chantilly est PIPÉE,
// le crémeux COULÉ dans les moules, le voile DÉCOUPÉ (Layla, 2026-09-20). Une
// préparation n'est pas finie quand elle sort de la cuve.
//
// Et la règle du retour, qu'elle a tranchée le même jour : « quand une mousse
// reste en stock, elle revient dans À déclarer parce qu'elle doit être finie ».
// Ce n'est donc pas un rappel qu'on montre une fois : tant qu'il en reste au
// Stock Prod, la ligne revient — le lendemain, et les jours suivants.
//
// ⚠️ LA LISTE VIT EN BASE (`annexe_mise_en_forme`), pas dans le code : un
// article renommé chez Odoo casserait une liste écrite en dur, c'est déjà
// arrivé. Et on ne la devine pas depuis le nom : « SM. Base CBS 23 cm » et
// « SM- Base Tarte CBS 18 cm » sont la même chose écrite de deux façons.
// ============================================================

import { supabase } from './supabase'

/** Les vracs qui doivent être mis en forme. */
export async function loadMiseEnForme() {
  const { data, error } = await supabase.from('annexe_mise_en_forme')
    .select('produit, note').eq('actif', true).order('produit').limit(500)
  if (error) throw error
  return data || []
}

/**
 * Ce qui attend sa mise en forme MAINTENANT : un vrac de la liste dont il
 * reste quelque chose au Stock Prod.
 *
 * ⚠️ On ne compte pas les poussières. Un stock traîne toujours à 0,4 g après
 * une répartition — l'afficher, c'est une ligne qui ne part jamais et qu'on
 * apprend à ignorer. Sous le gramme (ou sous 5 pièces d'un article compté à
 * l'unité), on considère que c'est fini.
 */
export function aMettreEnForme(articles, liste) {
  const voulus = new Map((liste || []).map(l => [l.produit, l]))
  return (articles || [])
    .filter(a => voulus.has(a.produit))
    .map(a => ({ ...a, note: voulus.get(a.produit)?.note || null }))
    .filter(a => resteVraiment(a.stock, a.unite))
    .sort((a, b) => (a.libelle || a.produit).localeCompare(b.libelle || b.produit, 'fr'))
}

const resteVraiment = (stock, unite) => {
  const s = Number(stock) || 0
  if (/^kg$/i.test(String(unite || '').trim())) return s >= 0.001   // 1 g
  if (/^u$/i.test(String(unite || '').trim())) return s >= 1
  return s >= 1
}
