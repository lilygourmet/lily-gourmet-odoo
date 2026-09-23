// ============================================================
// REFAIRE LA RECETTE AUTOUR D'UN INGRÉDIENT.
//
// « Les recettes s'affichent, je ne change rien. Je vois les quantités de
// chaque chose. Si j'ai l'habitude de bosser avec 1 000 g de sucre, je vais
// modifier ça et la suite suit, pour voir le ratio avec les autres »
// (Layla, 2026-09-23).
//
// C'est le geste du pâtissier, pas celui d'un tableur : on ne corrige pas une
// ligne, on RÈGLE LA RECETTE ENTIÈRE à partir de celle qu'on connaît. Mettre
// 1 000 g de sucre là où Odoo en écrit 250, c'est multiplier toute la recette
// par quatre — la farine, les œufs, et le nombre de gâteaux qui en sortent.
//
// ⚠️ RIEN N'EST ENREGISTRÉ. Odoo garde sa recette : on ne fait que la lire à
// une autre échelle.
// ============================================================

const nombre = v => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * La nouvelle quantité de l'ARTICLE quand on impose celle d'un ingrédient.
 *
 * `quantite`     : ce qu'on fabrique aujourd'hui (6 tartes)
 * `besoinActuel` : ce que la recette demande alors (250 g de sucre)
 * `besoinVoulu`  : ce qu'on veut y mettre (1 000 g)
 *   → 6 × (1 000 / 250) = 24 tartes, et tout le reste suit.
 *
 * Rend `null` quand le calcul n'a pas de sens — un ingrédient à zéro ne donne
 * aucune échelle, et une quantité vide n'est pas une demande.
 */
export function quantitePour({ quantite, besoinActuel, besoinVoulu }) {
  const q = nombre(quantite)
  const a = nombre(besoinActuel)
  const v = nombre(besoinVoulu)
  if (q === null || a === null || v === null) return null
  if (!(q > 0) || !(a > 0) || !(v > 0)) return null
  // Trois décimales : au-delà, c'est du bruit sur une balance de labo.
  return Math.round(q * (v / a) * 1000) / 1000
}
