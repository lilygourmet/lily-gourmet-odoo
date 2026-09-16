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
    // Le plus PROFOND d'abord : le crumble est à deux étages du gâteau, les
    // trois autres à un seul, et la tête vient en dernier.
    expect(f.map(x => x.produit)).toEqual([
      'SM. Crumble Pistache',
      'SM. Crunchy Citron Passion',
      'SM. Mousse Cheese Passion',
      'SM. Marmelade Passion Mangue',
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

// ============================================================
// UN MÊME ARTICLE À DEUX ENDROITS : LES BESOINS S'ADDITIONNENT.
//
// « dans cette recette il manque 1/2 creme citron si j'imprime le tout. soit
// tu additionne les meme creme en laissant une explication » (Layla,
// 2026-09-15).
//
// Le vrai Vitrine citron 20 cm, 29 pièces, relevé dans Odoo :
//   · le gâteau demande 3 480 g de crème citron TOUT COURT
//   · il demande aussi 9 280 g de crème au beurre citron…
//   · …dont la recette contient 3 850 g de crème citron pour 9 425 g produits
//   → soit 3 790 g de plus. 7 270 g en tout, et non 3 480.
// ============================================================
const cremeCitron = (besoin, stock = 0) => c('SM. Creme Citron Production', 'g', besoin, stock, {
  fabrique: true, aLaQuantite: true, produira: besoin, tourneeTaille: besoin,
  pourQuantite: besoin, recette: [{ produit: 'SM. Citron Liquide', qty: 779, unite: 'g' }],
})

const vitrine = {
  produit: 'SM- 20 cm Vitrine (Citron)', libelle: 'Vitrine citron · 20 cm',
  unite: 'u', tournee: 29, tourneeTaille: 29, stock: 0, recette: [],
  composants: [
    // la crème au beurre : 9 425 g par fournée, dont 3 850 de crème citron
    c('SM. Creme au Beurre Citron Production', 'g', 9280, 0, {
      fabrique: true, aLaQuantite: true, produira: 9280,
      tourneeTaille: 9425, pourQuantite: 9280,
      recette: [{ produit: 'SM. Creme Citron Production', qty: 3850, unite: 'g' }],
      enfants: [cremeCitron(3790)],
    }),
    cremeCitron(3480),
  ],
}

describe('quand la même crème sert à deux endroits', () => {
  it('LE BUG : les deux besoins s’additionnent, une seule feuille', () => {
    const f = feuillesAImprimer(vitrine, 29)
    const citron = f.filter(x => x.produit === 'SM. Creme Citron Production')
    expect(citron).toHaveLength(1)
    // 3 480 pour le gâteau + 3 790 pour la crème au beurre
    expect(citron[0].qty).toBeCloseTo(7270, 0)
  })

  it('et la feuille DIT où ça va', () => {
    const f = feuillesAImprimer(vitrine, 29)
    const citron = f.find(x => x.produit === 'SM. Creme Citron Production')
    const par = Object.fromEntries(citron.pour.map(p => [p.nom, Math.round(p.qty)]))
    expect(par['SM- 20 cm Vitrine (Citron)']).toBe(3480)
    expect(par['SM. Creme au Beurre Citron Production']).toBe(3790)
  })

  it('et elle se fait AVANT la crème au beurre qui la contient', () => {
    const f = feuillesAImprimer(vitrine, 29).map(x => x.produit)
    expect(f.indexOf('SM. Creme Citron Production'))
      .toBeLessThan(f.indexOf('SM. Creme au Beurre Citron Production'))
    expect(f[f.length - 1]).toBe('SM- 20 cm Vitrine (Citron)')
  })
})

// ============================================================
// LA DEMANDE À L'ÉCONOMAT.
//
// « sortir une feuille par recette avec les ingrédients MP à demander à
// l'économe » (Layla, 2026-09-15).
// ============================================================
import { aDemander, aBesoinDeLEconomat } from './feuillesAImprimer'

const mousse = {
  produit: 'SM. Mousse Cheese Passion', libelle: 'Mousse Cheese Passion',
  unite: 'kg', qty: 2.88,
  ingredients: [
    { produit: 'MP- Crème whipping', unite: 'g', besoin: 1658, fabrique: false },
    { produit: 'MP- Fromage Milky food', unite: 'g', besoin: 1161, fabrique: false },
    { produit: 'SM. Masse Gélatine', unite: 'g', besoin: 122, fabrique: true },
    { produit: 'MP- Eau robinet', unite: 'g', besoin: 175, fabrique: false },
    { produit: 'MP- Sucre Granule', unite: 'g', besoin: 480, fabrique: false },
    { produit: 'F- Mangue', unite: 'g', besoin: 462, fabrique: false },
    { produit: 'MP- Pectine NH', unite: 'g', besoin: 0, fabrique: false },
  ],
}

describe('ce qu’on demande à l’économat', () => {
  it('tout ce que l’annexe ne fabrique PAS elle-même', () => {
    expect(aDemander(mousse).map(i => i.produit)).toEqual([
      'MP- Crème whipping', 'MP- Fromage Milky food', 'MP- Sucre Granule', 'F- Mangue',
    ])
  })

  it('jamais une préparation : elle a sa propre feuille dans la liasse', () => {
    expect(aDemander(mousse).some(i => /Masse Gélatine/.test(i.produit))).toBe(false)
  })

  it('jamais l’eau du robinet : elle sort du mur', () => {
    expect(aDemander(mousse).some(i => /Eau robinet/i.test(i.produit))).toBe(false)
  })

  it('les fruits, si : ils viennent de l’économat comme le reste', () => {
    expect(aDemander(mousse).some(i => i.produit === 'F- Mangue')).toBe(true)
  })

  it('ni les lignes à zéro', () => {
    expect(aDemander(mousse).some(i => /Pectine/.test(i.produit))).toBe(false)
  })

  it('pas de papier quand il n’y a rien à demander', () => {
    // La crème au beurre citron : sa recette n'est faite que de préparations.
    const toutMaison = { ingredients: [
      { produit: 'SM. Creme au Beurre Nature Production', besoin: 5425, fabrique: true },
      { produit: 'SM. Creme Citron Production', besoin: 3850, fabrique: true },
    ] }
    expect(aBesoinDeLEconomat(toutMaison)).toBe(false)
    expect(aBesoinDeLEconomat(mousse)).toBe(true)
  })
})
