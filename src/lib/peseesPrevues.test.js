// LES INGRÉDIENTS SUIVENT CE QU'ON A VOULU FAIRE, PAS CE QUI EST SORTI.
//
// « c la recette de 5537,7 mais ca ma sorti 5664. les ingredient doivent
// suivre 5537,7 » (Layla, 2026-09-14).
//
// LE CAS RÉEL — WHPDX/MO/21493, confit de framboise :
//   · la recette Odoo sort 9 450 g pour 10 500 g d'ingrédients
//   · la fournée du catalogue vaut 5 721 g
//   · l'atelier est parti pour 5 537,7 g, il en est sorti 5 664 g
//   · Odoo a donc remis les ingrédients au prorata de 5 664 : 1 798,1 g de
//     framboise, alors que 1 758 g seulement sont passés dans la bassine.
import { describe, it, expect } from 'vitest'
import { peseesPrevues } from './fabAnnexe'

// L'article tel que le serveur le rend : ses composants sont calculés pour UNE
// fournée (5 721 g), soit 9 450 → 5 721, un facteur 0,6054.
const confit = {
  produit: 'SM. Confit de Framboise Finition', unite: 'g', tournee: 5721,
  composants: [
    { produit: 'F- Framboise fruit', besoin: 1816.19, unite: 'g' },
    { produit: 'MP- Purée de Framboise', besoin: 1816.19, unite: 'g' },
    { produit: 'MP- Glucose', besoin: 484.32, unite: 'g' },
    { produit: 'MP- Pectine Jaune', besoin: 60.54, unite: 'g' },
    { produit: 'SM. Masse Gélatine', besoin: 363.24, unite: 'g' },
    { produit: 'MP- Sucre Granule', besoin: 1816.19, unite: 'g' },
  ],
}

describe('les ingrédients d’une préparation pesée', () => {
  it('LE CAS DU CONFIT : ils suivent les 5 537,7 prévus, pas les 5 664 sortis', () => {
    const p = peseesPrevues(confit, 5537.7)
    // 1 816,19 × (5 537,7 / 5 721) = 1 758,0 — et non 1 798,1
    expect(p['F- Framboise fruit']).toBeCloseTo(1758.02, 1)
    expect(p['MP- Purée de Framboise']).toBeCloseTo(1758.02, 1)
    expect(p['MP- Sucre Granule']).toBeCloseTo(1758.02, 1)
    expect(p['MP- Glucose']).toBeCloseTo(468.81, 1)
    expect(p['MP- Pectine Jaune']).toBeCloseTo(58.6, 1)
    expect(p['SM. Masse Gélatine']).toBeCloseTo(351.6, 1)
  })

  it('une fournée entière donne la recette entière', () => {
    const p = peseesPrevues(confit, 5721)
    expect(p['F- Framboise fruit']).toBeCloseTo(1816.19, 2)
  })

  it('NE TOUCHE PAS à ce qui se compte à la pièce', () => {
    // 128 tiramisus au lieu de 140 consomment vraiment 128 biscuits :
    // le prorata d'Odoo a raison, on le laisse faire.
    const tiramisu = { produit: 'SM- Tiramisu indiv', unite: 'u', tournee: 140,
      composants: [{ produit: 'SM. Biscuit cuillere', besoin: 140, unite: 'u' }] }
    expect(peseesPrevues(tiramisu, 128)).toEqual({})
  })

  it('sans prévu ou sans fournée, on ne décide rien', () => {
    expect(peseesPrevues(confit, 0)).toEqual({})
    expect(peseesPrevues({ ...confit, tournee: 0 }, 5537.7)).toEqual({})
    expect(peseesPrevues(null, 100)).toEqual({})
  })
})
