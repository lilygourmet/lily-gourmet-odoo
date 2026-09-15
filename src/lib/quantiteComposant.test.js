// LA QUANTITÉ D'UN COMPOSANT SUIT SA RECETTE, RIEN D'AUTRE.
//
// « quand je clique sur crème au beurre nature de cette recette […] ça me sort
// cette quantité : 2 762,87 au lieu de l'autre. ou d'une crème au beurre
// nature d'une autre recette figé » (Layla, 2026-09-15).
//
// LE CAS RÉEL. Crème au Beurre Citron Production, fournée de 9 425 g, ramenée
// à 2 880 g. Sa crème au beurre nature : 5 425 g par fournée, donc 1 658 pour
// 2 880 — et il y en a 5 513 au congélateur, donc il n'en manque rien.
import { describe, it, expect } from 'vitest'
import { echelle, defautDe } from './fabAnnexe'

// Le composant tel que le serveur le rend pour une fournée entière.
const nature = {
  produit: 'SM. Creme au Beurre Nature Production', unite: 'g',
  besoin: 5425, stock: 5513, dejaFait: 0, fabrique: true,
  aLaQuantite: true, produira: 5425, pourQuantite: 5425, tourneeTaille: 1,
  recette: [{ produit: 'MP- Beurre entremets', qty: 2996, unite: 'g' }],
}

const fois = 2880 / 9425

describe('un composant ramené à l’échelle', () => {
  it('LE BUG : sa fiche proposait la dose de la fournée entière', () => {
    const e = echelle(nature, fois)
    expect(e.besoin).toBeCloseTo(1657.7, 1)
    // avant : 5 425, la dose d'avant la mise à l'échelle
    expect(defautDe(e)).toBeCloseTo(1657.7, 1)
  })

  it('même quand il y en a ASSEZ au congélateur', () => {
    const e = echelle(nature, fois)
    expect(e.ok).toBe(true)              // 5 513 en stock pour 1 658 à mettre
    expect(defautDe(e)).toBeLessThan(2000)
  })

  it('mais une FOURNÉE ENTIÈRE reste entière', () => {
    // Le sirop : 11,1 kg la tournée, pas « à la quantité ». Une demi-tournée
    // de sirop n'existe pas (règle de Layla, 2026-09-10).
    const sirop = { produit: 'SM. Sirop Imbibage Production KG', unite: 'kg',
      besoin: 8.12, stock: 11.51, dejaFait: 0, fabrique: true,
      produira: 11.1, pourQuantite: 11.1, tourneeTaille: 11.1, recette: [] }
    expect(defautDe(echelle(sirop, 0.5))).toBe(11.1)
  })

  it('ce qui se compte à la pièce s’arrondit au-dessus', () => {
    const fond = { produit: 'SM. Fond', unite: 'u', besoin: 10, stock: 40,
      dejaFait: 0, fabrique: true, aLaQuantite: true, produira: 10,
      pourQuantite: 10, tourneeTaille: 1, recette: [] }
    // 10 × 0,35 = 3,5 fonds → on en fait 4, jamais 3,5
    expect(defautDe(echelle(fond, 0.35))).toBe(4)
  })
})
