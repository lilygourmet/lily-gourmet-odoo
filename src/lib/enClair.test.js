import { describe, it, expect } from 'vitest'
import { poidsRecette, estEtapeCreuse, enClair as enClairBrut } from './fabAnnexe'

// Le français met une espace FINE dans les milliers : on la ramène à une
// espace normale pour que les tests restent lisibles.
const enClair = (...a) => enClairBrut(...a).replace(/[\u202f\u00a0]/g, ' ')

// ====== Dire les choses comme à l'atelier ======
// « Ils ne vont pas comprendre que 13 = une plaque de combien de grammes. »
// Les données ci-dessous sont celles d'Odoo, relevées le 2026-09-10.

// La plaque : sa recette en fait QUATRE, avec cinq matières premières.
const plaque = {
  produit: 'SM. Biscuit a la cuillere (plaque)',
  unite: 'u',
  tourneeTaille: 4,
  recette: [
    { produit: 'MP- Oeufs blanc', qty: 0.75, unite: 'kg' },
    { produit: 'MP- Sucre Granule', qty: 0.75, unite: 'kg' },
    { produit: 'MP- Oeufs jaune', qty: 0.55, unite: 'kg' },
    { produit: 'MP- Farine', qty: 0.375, unite: 'kg' },
    { produit: 'MP- Maizena', qty: 0.375, unite: 'kg' },
  ],
}

// Le biscuit 5 pers : 13 biscuits pour UNE plaque. Une décision, pas une étape creuse.
const biscuit = {
  produit: 'SM. Biscuit a la cuillere 5 pers',
  unite: 'u',
  tourneeTaille: 13,
  recette: [{ produit: 'SM. Biscuit a la cuillere (plaque)', qty: 1, unite: 'u' }],
}

// La génoise CD : une tournée de commune, rien d'autre. Là, il n'y a rien à décider.
const genoise = {
  produit: 'SM Genoise Vanille KG CD',
  unite: 'kg',
  tourneeTaille: 3,
  recette: [{ produit: 'SM. Genoise Vanille KG commun', qty: 3, unite: 'kg' }],
}

describe('poidsRecette', () => {
  it('additionne les grammes et les kilos', () => {
    expect(poidsRecette(plaque)).toBe(2800)          // 750+750+550+375+375
  })

  it('ne dit RIEN quand la recette compte en pièces', () => {
    // 1 plaque + rien : additionner des plaques et des grammes n'a pas de sens.
    expect(poidsRecette(biscuit)).toBeNull()
  })

  it('ne dit rien sur une recette vide', () => {
    expect(poidsRecette({ recette: [] })).toBeNull()
    expect(poidsRecette(null)).toBeNull()
  })
})

describe('estEtapeCreuse', () => {
  it('reconnaît le changement d’étiquette : un pour un, même unité', () => {
    expect(estEtapeCreuse(genoise)).toBe(true)
  })

  it('la découpe N’EST PAS creuse : combien on coupe est une décision', () => {
    expect(estEtapeCreuse(biscuit)).toBe(false)      // 1 plaque → 13 biscuits
  })

  it('une vraie recette n’est jamais creuse', () => {
    expect(estEtapeCreuse(plaque)).toBe(false)
  })

  it('ne se laisse pas avoir par une unité qui se ressemble', () => {
    // 3 kg de commune → 3 « u » de CD : ce n'est pas un pour un.
    expect(estEtapeCreuse({ ...genoise, unite: 'u' })).toBe(false)
  })
})

describe('enClair', () => {
  it('traduit en poids ce qui se compte en pièces', () => {
    expect(enClair(plaque, 4)).toBe('2 800 g en tout')
    expect(enClair(plaque, 1)).toBe('700 g en tout')
    expect(enClair(plaque, 8)).toBe('5 600 g en tout')
  })

  it('ne répète pas le poids d’un article DÉJÀ compté en grammes', () => {
    // Le caramel : 3 920 g de sortie pour 4 840 g d'ingrédients. Lui dire
    // « 4 840 g » n'apprend rien et sème le doute.
    const caramel = {
      produit: 'SM. caramel beurre sale production', unite: 'g', tourneeTaille: 3920,
      recette: [{ produit: 'MP- Sucre Granule', qty: 2000, unite: 'g' },
        { produit: 'MP- Crème whipping', qty: 2840, unite: 'g' }],
    }
    expect(enClair(caramel, 3920)).toBe('')
  })

  it('traduit les biscuits en plaques', () => {
    expect(enClair(biscuit, 13)).toBe('1 plaque')
    expect(enClair(biscuit, 26)).toBe('2 plaques')
  })

  it('ne meuble pas quand il n’y a rien à dire', () => {
    expect(enClair({ tourneeTaille: 0, recette: [] }, 5)).toBe('')
    expect(enClair(plaque, 0)).toBe('')
  })
})

describe('le poids ne se dit pas d’un montage', () => {
  it('« 9 000 g en tout » sous un tiramisu n’aiderait personne', () => {
    // Un montage assemble des morceaux déjà faits ; ce n'est pas une masse
    // qu'on prépare d'un bloc, contrairement à la pâte d'une plaque.
    const tiramisu = {
      produit: 'SM- Tiramisu 15cm', unite: 'u', tourneeTaille: 13,
      composants: [
        { produit: 'SM. Biscuit', unite: 'g', besoin: 780, fabrique: true },
        { produit: 'MP- Sucre', unite: 'g', besoin: 300, fabrique: false },
      ],
      recette: [
        { produit: 'SM. Biscuit', qty: 780, unite: 'g' },
        { produit: 'MP- Sucre', qty: 300, unite: 'g' },
      ],
    }
    expect(enClair(tiramisu, 13)).toBe('')
  })
})
