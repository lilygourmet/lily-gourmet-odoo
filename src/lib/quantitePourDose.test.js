// « Retaper la dose d'un ingrédient remet toute la recette à l'échelle » —
// le choix A de Layla, réclamé à nouveau le 2026-09-11.
import { describe, it, expect } from 'vitest'
import { quantitePourDose } from './fabAnnexe'

describe('quantitePourDose', () => {
  it('une recette et demie : 1,5 kg de sucre là où elle en veut 1,2', () => {
    // Le glaçage : 5 458 g avec 1 200 g de sucre. On tape 1 800 g de sucre.
    expect(quantitePourDose({ quantite: 5458, besoin: 1200, saisi: 1800, unite: 'g' }))
      .toBe(8187)
  })

  it('la ligne comptée en kilos : l’écran écrit des grammes', () => {
    // 1,2 kg de sucre pour 5 458 g de glaçage ; on tape 600 g.
    expect(quantitePourDose({ quantite: 5458, besoin: 1.2, saisi: 600, unite: 'kg' }))
      .toBe(2729)
  })

  it('la MASSE gélatine : 560 g pesés valent 80 g chez Odoo', () => {
    // Doubler la masse (1 120 g) double la fournée.
    expect(quantitePourDose({ quantite: 5458, besoin: 80, saisi: 1120, unite: 'g', facteur: 7 }))
      .toBe(10916)
  })

  it('on ne fabrique pas 13,4 gâteaux', () => {
    expect(quantitePourDose({ quantite: 13, besoin: 780, saisi: 800, unite: 'g', enPieces: true }))
      .toBe(13)
    expect(quantitePourDose({ quantite: 13, besoin: 780, saisi: 1560, unite: 'g', enPieces: true }))
      .toBe(26)
  })

  it('jamais zéro, jamais de division par zéro', () => {
    expect(quantitePourDose({ quantite: 100, besoin: 0, saisi: 50, unite: 'g' })).toBe(100)
    expect(quantitePourDose({ quantite: 100, besoin: 50, saisi: 0, unite: 'g' })).toBe(100)
    expect(quantitePourDose({ quantite: 0, besoin: 50, saisi: 10, unite: 'g' })).toBe(0)
  })
})
