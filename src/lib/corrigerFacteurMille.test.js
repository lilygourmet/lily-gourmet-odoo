// Le garde-fou du facteur mille.
//
// L'ordre WHPDX/MO/21427 annonçait 14,33 g de crème citron gingembre tout en
// consommant deux recettes entières d'ingrédients (2 880 g de citron pour une
// recette qui en demande 1 440). Mille fois trop peu — et validé sans que
// personne ne s'en aperçoive. (Layla, 2026-09-11 : « assure-toi que ça ne se
// répète pas, et pour les autres recettes aussi ».)
import { describe, it, expect } from 'vitest'
import { corrigerFacteurMille } from '../../api/freezer-list.js'

// La vraie recette de la crème citron gingembre : sort 7 164 g.
const lignes = [
  { product_id: [1, 'SM. Citron liquide'], product_qty: 1440 },
  { product_id: [2, 'MP- Sucre Granule'], product_qty: 920 },
  { product_id: [3, 'F- Gingembre frais'], product_qty: 420 },
  { product_id: [4, 'MP- Oeufs entier'], product_qty: 2320 },
  { product_id: [5, 'MP- Beurre entremets'], product_qty: 1800 },
]
// Deux recettes pesées.
const deuxRecettes = {
  'SM. Citron liquide': 2880, 'MP- Sucre Granule': 1840, 'F- Gingembre frais': 840,
  'MP- Oeufs entier': 4640, 'MP- Beurre entremets': 3600,
}

describe('corrigerFacteurMille', () => {
  it('rattrape le cas vécu : 14,33 g pour deux recettes d’ingrédients', () => {
    const r = corrigerFacteurMille(14.328, 7164, lignes, deuxRecettes)
    expect(r.corrige).toBe(1000)
    expect(r.qty).toBeCloseTo(14328, 3)
  })

  it('ne touche à rien quand tout est cohérent', () => {
    expect(corrigerFacteurMille(14328, 7164, lignes, deuxRecettes).corrige).toBe(0)
  })

  it('laisse l’atelier peser autrement que la recette', () => {
    // Une demi-recette de sortie avec les ingrédients d'une recette entière :
    // c'est un rendement, pas une erreur d'unité.
    const uneRecette = Object.fromEntries(lignes.map(l => [l.product_id[1], l.product_qty]))
    expect(corrigerFacteurMille(3500, 7164, lignes, uneRecette).corrige).toBe(0)
  })

  it('rattrape aussi l’erreur dans l’autre sens', () => {
    const r = corrigerFacteurMille(14328000, 7164, lignes, deuxRecettes)
    expect(r.corrige).toBe(-1000)
    expect(r.qty).toBeCloseTo(14328, 3)
  })

  it('ne fait rien sans ingrédients imposés — il n’y a rien à comparer', () => {
    expect(corrigerFacteurMille(14.328, 7164, lignes, {}).corrige).toBe(0)
    expect(corrigerFacteurMille(14.328, 7164, lignes, null).corrige).toBe(0)
  })

  it('ignore un ingrédient qui n’est pas dans la recette', () => {
    const r = corrigerFacteurMille(14.328, 7164, lignes, { 'MP- Inconnu': 500 })
    expect(r.corrige).toBe(0)
  })

  it('retrouve l’ingrédient malgré la référence entre crochets', () => {
    const r = corrigerFacteurMille(14.328, 7164, lignes, { '[1234] SM. Citron liquide': 2880 })
    expect(r.corrige).toBe(1000)
  })

  it('prend la médiane : un seul ingrédient bizarre ne décide pas', () => {
    // Quatre ingrédients disent « deux recettes », un cinquième est aberrant.
    const r = corrigerFacteurMille(14328, 7164, lignes, { ...deuxRecettes, 'MP- Oeufs entier': 4 })
    expect(r.corrige).toBe(0)
  })
})
