// La découpe : une plaque de biscuit à la cuillère donne 13 « 5 pers », 70
// individuels ou 6 « 10 pers » (vérifié chez Odoo le 2026-09-10). C'est la
// seule étape de l'annexe qui porte DEUX décisions sur le même écran : combien
// je cuis, combien je coupe.
import { describe, it, expect } from 'vitest'
import { enNoeud, decoupeDe, partageDecoupe, ingredientsPour } from './fabAnnexe'

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
