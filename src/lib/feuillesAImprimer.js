// ============================================================
// LES FEUILLES D'UNE FOURNÉE.
//
// « Une feuille par article, et que ça tienne en une page » (Layla,
// 2026-09-14). Depuis un gâteau, on imprime tout ce qu'il va falloir
// fabriquer : une feuille par chose qui a une recette, dans l'ordre du
// travail.
//
// Ce fichier ne dessine rien — il dit seulement QUELLES feuilles, avec quoi
// dessus. Le calcul des quantités est celui de l'écran, à la virgule près :
// `ingredientsPour` pour ce qu'il faut, `defautDe` pour ce qu'on propose de
// faire. Aucune règle nouvelle ici, sinon on aurait deux vérités.
// ============================================================

import { ingredientsPour, defautDe, enfantsDe } from './fabAnnexe'

/** Une feuille ne se fait que pour ce qui a une RECETTE : le reste se pèse. */
const aUneRecette = c => !!c.fabrique

/**
 * Les feuilles, de la plus profonde à la tête.
 *
 * L'ordre est celui du travail : on ne monte pas le crunchy avant d'avoir le
 * crumble. La tête est donc la DERNIÈRE feuille.
 *
 * `quantites` est la table de l'écran — un chiffre tapé à la main y prime sur
 * ce que l'app propose, exactement comme sur la fiche.
 */
export function feuillesAImprimer(tete, quantiteTete, quantites = {}) {
  if (!tete) return []
  const out = []
  // ⚠️ Un article déjà croisé plus haut ne se redescend pas : une recette qui
  // se contiendrait elle-même tournerait sans fin (vécu chez Odoo avec la
  // masse gélatine, le 2026-09-11).
  const vus = new Set()

  const descendre = (noeud, qty, chemin) => {
    if (vus.has(noeud.produit)) return
    vus.add(noeud.produit)
    const ingredients = ingredientsPour(noeud, qty)
    for (const c of ingredients) {
      if (!aUneRecette(c)) continue
      descendre(c, quantites[c.produit] ?? defautDe(c), [...chemin, c.produit])
    }
    out.push({
      produit: noeud.produit,
      libelle: noeud.libelle || noeud.produit,
      unite: noeud.unite,
      stock: Math.max(0, Number(noeud.stock) || 0),
      qty,
      chemin,
      ingredients: ingredients.map(c => ({
        produit: c.produit, unite: c.unite, besoin: c.besoin,
      })),
    })
  }

  descendre(tete, quantiteTete, [tete.produit])
  return out
}

/**
 * Ce que le panneau « Tu imprimes quoi ? » propose de cocher.
 *
 * Coché d'avance : ce dont il n'y a pas assez. Ce qu'on a en stock ne l'est
 * pas — mais la ligne reste, pour pouvoir la reprendre à la main. La TÊTE est
 * toujours cochée : c'est ce qu'on est venu faire.
 */
export function cocheesParDefaut(feuilles) {
  const out = {}
  for (const f of feuilles || []) out[f.produit] = f.qty > 0
  const tete = (feuilles || [])[feuilles.length - 1]
  if (tete) out[tete.produit] = true
  return out
}

/**
 * Ce qu'il manque d'un composant, pour l'écrire sous son nom dans le panneau.
 * Rend une phrase toute faite, ou '' quand il n'y a rien à dire.
 */
export function ditLeStock(f, dire) {
  if (!f) return ''
  if (f.stock <= 0.001) return 'rien en stock'
  return `il en reste ${dire(f.stock, f.unite)}`
}

/** Les articles fabricables juste sous celui-ci — pour les tests et le debug. */
export const fabricablesDe = noeud => enfantsDe(noeud).filter(aUneRecette)
