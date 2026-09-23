// La découpe : une plaque de biscuit à la cuillère donne 13 « 5 pers », 70
// individuels ou 6 « 10 pers » (vérifié chez Odoo le 2026-09-10). C'est la
// seule étape de l'annexe qui porte DEUX décisions sur le même écran : combien
// je cuis, combien je coupe.
import { describe, it, expect } from 'vitest'
import { enNoeud, decoupeDe, partageDecoupe, ingredientsPour, parGateauMere } from './fabAnnexe'

const plaque = {
  produit: 'SM. Biscuit a la cuillere (plaque)', unite: 'u', fabrique: true,
  besoin: 1, stock: 0, tourneeTaille: 4, produira: 4, tournees: 1,
  recette: [{ produit: 'MP- Oeufs blanc', qty: 750, unite: 'g' }],
}
const cinqPers = {
  produit: 'SM. Biscuit a la cuillere 5 pers', unite: 'u', tournee: 13,
  composants: [plaque],
}

describe('enNoeud', () => {
  it('donne à l’article de tête la forme d’un nœud de recette', () => {
    const n = enNoeud(cinqPers)
    expect(n.tourneeTaille).toBe(13)
    expect(n.recette).toEqual([{ produit: plaque.produit, qty: 1, unite: 'u' }])
  })

  it('ne touche pas un nœud qui a déjà sa recette', () => {
    expect(enNoeud(plaque)).toBe(plaque)
  })
})

describe('decoupeDe', () => {
  it('reconnaît la plaque qu’on coupe en 13', () => {
    const d = decoupeDe(enNoeud(cinqPers))
    expect(d.parPiece).toBe(13)
    expect(d.enfant.produit).toBe(plaque.produit)
  })

  it('reconnaît aussi les 70 individuels', () => {
    const indiv = { ...cinqPers, tournee: 70, composants: [plaque] }
    expect(decoupeDe(enNoeud(indiv)).parPiece).toBe(70)
  })

  it('n’est pas une découpe quand un ingrédient s’achète', () => {
    const achete = { ...plaque, fabrique: false }
    expect(decoupeDe(enNoeud({ ...cinqPers, composants: [achete] }))).toBeNull()
  })

  it('n’est pas une découpe quand le vrac est « à finir » — il se coule', () => {
    // Mousse Meringue Citron Indiv : 120 unités coulées dans 800 g de mousse.
    const mousse = {
      produit: 'SM. Mousse Meringue Citron (kg)', unite: 'kg', fabrique: true,
      aFinir: true, besoin: 0.8, stock: 0, tourneeTaille: 1, produira: 1, tournees: 1,
      recette: [{ produit: 'SM. Masse Gelatine', qty: 0.14, unite: 'kg' }],
    }
    const indiv = { produit: 'SM. Mousse Meringue Citron Indiv', unite: 'u',
      tournee: 120, composants: [mousse] }
    expect(decoupeDe(enNoeud(indiv))).toBeNull()
  })

  it('n’est pas une découpe quand il y a deux ingrédients', () => {
    const deux = { ...cinqPers, composants: [plaque, { ...plaque, produit: 'autre' }] }
    expect(decoupeDe(enNoeud(deux))).toBeNull()
  })

  it('n’est pas une découpe quand ça se pèse', () => {
    // 3 920 g de caramel qui donnent 2 800 g de crème : pas de plaques.
    const creme = {
      produit: 'SM. Creme', unite: 'g', tournee: 2800,
      composants: [{ produit: 'SM. Caramel', unite: 'g', fabrique: true, besoin: 3920 }],
    }
    expect(decoupeDe(enNoeud(creme))).toBeNull()
  })

  it('n’est pas une découpe quand c’est un pour un (étape creuse)', () => {
    const creuse = { ...cinqPers, tournee: 1, composants: [{ ...plaque, besoin: 1 }] }
    expect(decoupeDe(enNoeud(creuse))).toBeNull()
  })
})

describe('partageDecoupe', () => {
  it('le cas de Layla : 4 plaques cuites, 26 biscuits coupés', () => {
    const p = partageDecoupe({ cuites: 4, coupes: 26, parPiece: 13 })
    expect(p.utilisees).toBe(2)
    expect(p.gardees).toBe(2)
    expect(p.manque).toBe(0)
  })

  it('ne coupe rien : tout part au congélateur', () => {
    const p = partageDecoupe({ cuites: 4, coupes: 0, parPiece: 13 })
    expect(p.utilisees).toBe(0)
    expect(p.gardees).toBe(4)
  })

  it('compte les plaques déjà en stock', () => {
    const p = partageDecoupe({ cuites: 0, coupes: 13, parPiece: 13, stock: 3 })
    expect(p.utilisees).toBe(1)
    expect(p.gardees).toBe(2)
    expect(p.manque).toBe(0)
  })

  it('le brownie du 13 septembre : 3 040 g cuits, 15 biscuits déclarés', () => {
    // La recette Odoo : 3 040 g de plaque = 13 biscuits 5 pers. Quinze en
    // demandent 3 507,69 — il manque 467,69 g, et c'est ce trou qui a fait
    // partir le stock de travers.
    const p = partageDecoupe({ cuites: 3040, coupes: 15, parPiece: 13 / 3040, stock: 0 })
    expect(Math.round(p.utilisees)).toBe(3508)
    expect(Math.round(p.manque)).toBe(468)
    expect(p.gardees).toBe(0)
  })

  it('les 13 d’une plaque passent, eux, sans rien manquer', () => {
    const p = partageDecoupe({ cuites: 3040, coupes: 13, parPiece: 13 / 3040, stock: 0 })
    expect(p.manque).toBe(0)
    expect(p.gardees).toBe(0)
  })

  it('dit ce qui manque plutôt que d’afficher un négatif', () => {
    const p = partageDecoupe({ cuites: 1, coupes: 39, parPiece: 13 })
    expect(p.utilisees).toBe(3)
    expect(p.gardees).toBe(0)
    expect(p.manque).toBe(2)
  })

  it('une demi-plaque reste une demi-plaque, pas un entier menteur', () => {
    const p = partageDecoupe({ cuites: 4, coupes: 20, parPiece: 13 })
    expect(p.utilisees).toBe(1.54)
    expect(p.gardees).toBe(2.46)
  })
})

describe('ingredientsPour', () => {
  const noeud = {
    produit: 'SM. Biscuit a la cuillere (plaque)', unite: 'u', tourneeTaille: 4,
    pourQuantite: 4,
    recette: [
      { produit: 'MP- Oeufs blanc', qty: 750, unite: 'g' },
      { produit: 'MP- Farine', qty: 375, unite: 'g' },
    ],
    enfants: [],
  }

  it('donne les matières premières, que le serveur ne met que dans la recette', () => {
    const l = ingredientsPour(noeud, 4)
    expect(l.map(x => x.produit)).toEqual(['MP- Oeufs blanc', 'MP- Farine'])
    expect(l[0].besoin).toBe(750)
    expect(l[0].pese).toBe(true)
  })

  it('double les doses quand on double la quantité', () => {
    expect(ingredientsPour(noeud, 8).map(x => x.besoin)).toEqual([1500, 750])
  })

  it('ne compte pas deux fois un ingrédient qui est aussi un composant', () => {
    const mixte = {
      ...noeud, tourneeTaille: 13, pourQuantite: 13,
      enfants: [{ produit: 'SM. Plaque', unite: 'u', besoin: 1, fabrique: true, stock: 0 }],
      recette: [{ produit: 'SM. Plaque', qty: 1, unite: 'u' }],
    }
    const l = ingredientsPour(mixte, 13)
    expect(l.length).toBe(1)
    expect(l[0].fabrique).toBe(true)
  })

  it('met les composants à l’échelle sur leur propre base, pas sur la fournée', () => {
    // Le serveur a prévu 8 plaques (`pourQuantite`) alors que la recette en
    // sort 4 : demander 8 ne doit RIEN changer aux besoins déjà calculés.
    const deux = { ...noeud, pourQuantite: 8,
      enfants: [{ produit: 'SM. X', unite: 'g', besoin: 100, fabrique: true, stock: 0 }] }
    expect(ingredientsPour(deux, 8)[0].besoin).toBe(100)
    expect(ingredientsPour(deux, 4)[0].besoin).toBe(50)
  })
})

describe('un ingrédient cité deux fois', () => {
  const gianduja = {
    produit: 'SM- Gianduja 10 pers', unite: 'u', tourneeTaille: 34, pourQuantite: 34,
    recette: [
      { produit: 'MP- Crème whipping', qty: 2704, unite: 'g' },
      { produit: 'MP- Crème whipping', qty: 4550, unite: 'g' },
    ],
    enfants: [],
  }

  it('garde ses DEUX lignes : ce sont deux usages dans la recette', () => {
    // « Des fois c'est utilisé dans la recette différemment » (Layla,
    // 2026-09-10) : la crème whipping va au crémeux ET à la mousse.
    const l = ingredientsPour(gianduja, 34)
    expect(l.length).toBe(2)
    expect(l.map(x => x.besoin)).toEqual([2704, 4550])
  })
})

describe('la recherche de « Déclarer »', () => {
  // Vérifié sur le vrai catalogue (284 articles, 2026-09-10) : le sirop
  // d'imbibage sert au cake citron ET au cake chocolat.
  const tout = [
    { produit: 'SM- Sirop Imbibage cake', pour: ['V- Cake Citron', 'V- Cake Chocolat'] },
    { produit: 'SM- Cake citron', pour: ['V- Cake Citron'] },
  ]

  it('un article qui sert à deux gâteaux ne fait qu’une case', () => {
    const groupes = parGateauMere(tout, 'sirop')
    const plat = groupes.flatMap(g => g.articles)
    expect(plat.length).toBe(2)          // deux fois, une par gâteau
    const cases = [...new Map(plat.map(a => [a.produit, a])).values()]
    expect(cases.length).toBe(1)         // mais une seule case à l'écran
  })
})

// ============================================================
// LA DÉCOUPE OUVERTE SEULE, depuis « Déclarer ».
//
// « Biscuit à la cuillère en stock, je veux le couper en 10 pers, comment
// faire ? » — puis « je ne le vois pas » (Layla, 2026-09-21).
//
// En DESCENDANT depuis le tiramisu, l'écran proposait bien « combien de
// plaques cuites » puis « à couper » par paliers. En ouvrant le MÊME article
// depuis « Déclarer », on tombait sur une fiche ordinaire : le serveur ne
// donnait `tourneeTaille` et la ligne de recette qu'aux COMPOSANTS. Il n'y
// avait donc aucun moyen de couper une plaque déjà au congélateur.
// ============================================================
describe('une découpe ouverte seule', () => {
  // Ce que le serveur renvoie maintenant pour « SM. Biscuit a la Cuillere
  // 10 pers » demandé tout seul (relevé en production le 2026-09-21).
  const dixPersSeul = {
    produit: 'SM. Biscuit a la Cuillere 10 pers', unite: 'u',
    stock: 6, tournee: 6, tourneeTaille: 6,
    recette: [{ produit: 'SM. Biscuit a la Cuillere (Plaque)', qty: 1, unite: 'u' }],
    composants: [{ produit: 'SM. Biscuit a la Cuillere (Plaque)', unite: 'u',
      besoin: 1, stock: 4, dejaFait: 0, fabrique: true, ok: true, entier: true }],
  }

  it('est reconnue comme une découpe, avec son compte par plaque', () => {
    const d = decoupeDe(dixPersSeul)
    expect(d).toBeTruthy()
    expect(d.enfant.produit).toBe('SM. Biscuit a la Cuillere (Plaque)')
    expect(d.parPiece).toBe(6)
  })

  // ⚠️ Le cas qu'elle décrit : les plaques sont DÉJÀ faites, au congélateur.
  // On ne cuit rien aujourd'hui, on coupe seulement.
  it('laisse couper ce qui est au congélateur sans rien cuire', () => {
    expect(partageDecoupe({ cuites: 0, coupes: 24, parPiece: 6, stock: 4 }))
      .toMatchObject({ utilisees: 4, manque: 0 })
  })

  it('mais jamais plus que ce qu’il y a de plaques', () => {
    expect(partageDecoupe({ cuites: 0, coupes: 30, parPiece: 6, stock: 4 }).manque)
      .toBeGreaterThan(0)
  })

  // ⚠️ ET ON NE POSE LA RECETTE QUE POUR UNE DÉCOUPE : un article à plusieurs
  // lignes afficherait sinon ses matières premières DEUX fois — une fois en
  // composants, une fois en « à peser ».
  it('n’ajoute pas de doublon dans les ingrédients', () => {
    expect(ingredientsPour(dixPersSeul, 6).map(x => x.produit))
      .toEqual(['SM. Biscuit a la Cuillere (Plaque)'])
  })
})
