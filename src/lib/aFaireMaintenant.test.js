import { describe, it, expect } from 'vitest'
import { aFaireMaintenant } from './fabAnnexe'

// ====== Le chiffre de la pastille rouge ======
// « 352 cadres » quand la recette en fait 88 : le nombre est juste, mais il
// décourage et ne dit pas quoi faire aujourd'hui. On propose ce qui est
// faisable ; le besoin total s'écrit sous le nom. (Layla, 2026-09-10.)

describe('aFaireMaintenant', () => {
  it('s’arrête à une fournée quand le besoin la dépasse', () => {
    // Cheesecake Exotique indiv : il en faut 124, la recette en fait 80.
    expect(aFaireMaintenant({ produit: 'SM- Cheesecake Exotique indiv', reste: 124, tournee: 80 })).toBe(80)
  })

  it('propose le besoin exact quand il est plus petit', () => {
    // Citron Framboise (1) : il en faut 43, la recette en fait 58.
    expect(aFaireMaintenant({ produit: 'Sm- Le Citron Framboise (1)', reste: 43, tournee: 58 })).toBe(43)
  })

  it('tombe pile quand les deux se valent', () => {
    expect(aFaireMaintenant({ produit: 'SM- Royal Chocolat 15 cm', reste: 13, tournee: 13 })).toBe(13)
  })

  it('garde les fournées ENTIÈRES entières', () => {
    // Un cadre ne se remplit pas à moitié : 352 demandés, 88 par fournée → 88.
    expect(aFaireMaintenant({ produit: 'SM- cadre foret noir grand Production', reste: 352, tournee: 88 })).toBe(88)
    // Et jamais moins d'une, même si le besoin est plus petit.
    expect(aFaireMaintenant({ produit: 'SM. Biscuit a la cuillere (plaque)', reste: 2, tournee: 4 })).toBe(4)
  })

  it('propose une fournée quand rien n’est réclamé', () => {
    expect(aFaireMaintenant({ produit: 'SM- Tiramisu 15cm', reste: 0, tournee: 13 })).toBe(13)
  })

  it('ne rend jamais de nombre absurde', () => {
    expect(aFaireMaintenant({ produit: 'x', reste: 0, tournee: 0 })).toBe(0)
    expect(aFaireMaintenant(null)).toBe(0)
  })
})
