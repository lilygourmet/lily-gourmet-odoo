// LES FEUILLES D'UNE FOURNÉE.
//
// « Une feuille par article et que ça fit en une page » (Layla, 2026-09-14).
//
// L'arbre ci-dessous est le vrai Cheesecake Exotique indiv, relevé dans Odoo
// le 14/09 : 80 par fournée, 36 en stock, trois composants dont deux à faire.
import { describe, it, expect } from 'vitest'
import { feuillesAImprimer, cocheesParDefaut } from './feuillesAImprimer'

const c = (produit, unite, besoin, stock, extra = {}) =>
  ({ produit, unite, besoin, stock, dejaFait: 0, fabrique: false, ...extra })

// Un composant qui se fabrique porte sa recette, ce qu'il produira, et ses
// propres enfants — comme le rend `/api/fab-annexe`.
//
// ⚠️ `aLaQuantite` : aucun de ces trois-là n'a de fournée décidée dans « Mini /
// maxi Annexe », donc le serveur les marque « à la quantité » — on en fait
// exactement ce qui manque, pas une fournée entière. Sans cet attribut le
// modèle de test ment, et c'est le test qui aurait eu tort.
const fab = (produit, unite, besoin, stock, produira, recette, enfants = []) =>
  c(produit, unite, besoin, stock, {
    fabrique: true, aLaQuantite: true, produira, tourneeTaille: produira,
    pourQuantite: produira, recette, enfants,
  })

const crunchy = fab('SM. Crunchy Citron Passion', 'kg', 2.4, 0, 2.4,
  [{ produit: 'SM. Crumble Pistache', qty: 2.4, unite: 'kg' },
   { produit: 'MP- Feuilletine', qty: 1.2, unite: 'kg' }],
  [fab('SM. Crumble Pistache', 'kg', 2.4, 0.05, 2.35,
    [{ produit: 'MP- Farine', qty: 588, unite: 'g' }])])

const gateau = {
  produit: 'SM- Cheesecake Exotique Indiv', libelle: 'Cheesecake Exotique indiv',
  unite: 'u', tournee: 80, tourneeTaille: 80, stock: 36,
  composants: [
    c('SM. Marmelade Passion Mangue', 'kg', 2, 3.4, { fabrique: true, produira: 0, recette: [] }),
    fab('SM. Mousse Cheese Passion', 'kg', 2.88, 0, 2.88,
      [{ produit: 'MP- Crème whipping', qty: 1.658, unite: 'kg' }]),
    crunchy,
  ],
  recette: [],
}

describe('les feuilles d’une fournée', () => {
  it('une feuille par chose qui a une RECETTE, jamais pour ce qui se pèse', () => {
    const f = feuillesAImprimer(gateau, 80)
    expect(f.map(x => x.produit)).toEqual([
      'SM. Marmelade Passion Mangue',
      'SM. Mousse Cheese Passion',
      'SM. Crumble Pistache',
      'SM. Crunchy Citron Passion',
      'SM- Cheesecake Exotique Indiv',
    ])
    // ni la farine, ni la feuilletine, ni la crème whipping : on ne les fabrique pas
    expect(f.some(x => /Farine|Feuilletine|whipping/.test(x.produit))).toBe(false)
  })

  it('dans l’ORDRE DU TRAVAIL : le crumble avant le crunchy, la tête en dernier', () => {
    const f = feuillesAImprimer(gateau, 80)
    expect(f.findIndex(x => x.produit === 'SM. Crumble Pistache'))
      .toBeLessThan(f.findIndex(x => x.produit === 'SM. Crunchy Citron Passion'))
    expect(f[f.length - 1].produit).toBe('SM- Cheesecake Exotique Indiv')
  })

  it('chaque feuille porte sa quantité, son stock et son chemin', () => {
    const f = feuillesAImprimer(gateau, 80)
    const mousse = f.find(x => x.produit === 'SM. Mousse Cheese Passion')
    expect(mousse.qty).toBe(2.88)
    expect(mousse.unite).toBe('kg')
    expect(mousse.chemin).toEqual(['SM- Cheesecake Exotique Indiv', 'SM. Mousse Cheese Passion'])
    const crumble = f.find(x => x.produit === 'SM. Crumble Pistache')
    expect(crumble.stock).toBe(0.05)
    expect(crumble.chemin).toEqual(['SM- Cheesecake Exotique Indiv',
      'SM. Crunchy Citron Passion', 'SM. Crumble Pistache'])
  })

  it('un chiffre TAPÉ À LA MAIN prime, et entraîne ce qu’il y a dessous', () => {
    const f = feuillesAImprimer(gateau, 80, { 'SM. Crunchy Citron Passion': 1.2 })
    expect(f.find(x => x.produit === 'SM. Crunchy Citron Passion').qty).toBe(1.2)
    // moitié moins de crunchy, donc moitié moins de crumble
    expect(f.find(x => x.produit === 'SM. Crumble Pistache').qty).toBeCloseTo(1.15, 2)
  })

  it('changer la tête refait tous les chiffres du dessous', () => {
    const f = feuillesAImprimer(gateau, 40)
    expect(f.find(x => x.produit === 'SM. Mousse Cheese Passion').qty).toBeCloseTo(1.44, 3)
    expect(f.find(x => x.produit === 'SM. Crunchy Citron Passion').qty).toBeCloseTo(1.2, 3)
  })

  it('la feuille dit ce qu’il faut peser, pas seulement ce qui se fabrique', () => {
    const f = feuillesAImprimer(gateau, 80)
    const crumble = f.find(x => x.produit === 'SM. Crumble Pistache')
    expect(crumble.ingredients.map(i => i.produit)).toContain('MP- Farine')
  })

  it('ne tourne pas en rond si une recette se contient elle-même', () => {
    const boucle = { produit: 'A', unite: 'g', tourneeTaille: 70, stock: 0,
      recette: [{ produit: 'A', qty: 70, unite: 'g' }],
      composants: [fab('A', 'g', 70, 0, 70, [])] }
    expect(() => feuillesAImprimer(boucle, 70)).not.toThrow()
    expect(feuillesAImprimer(boucle, 70)).toHaveLength(1)
  })
})

describe('ce qui est coché d’avance', () => {
  it('ce dont il n’y a pas assez, et toujours la tête', () => {
    const f = feuillesAImprimer(gateau, 80)
    const coches = cocheesParDefaut(f)
    expect(coches['SM. Mousse Cheese Passion']).toBe(true)      // rien en stock
    expect(coches['SM. Crumble Pistache']).toBe(true)           // 50 g sur 2 400
    expect(coches['SM. Marmelade Passion Mangue']).toBe(false)  // il en reste 3,4 kg
    expect(coches['SM- Cheesecake Exotique Indiv']).toBe(true)  // c'est ce qu'on vient faire
  })
})
