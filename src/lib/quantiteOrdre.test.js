// LES 54 TONNES DE GÉNOISE.
//
// « ordre 202912 a cree le poid en kg alors que c grammes » (Layla, 2026-09-13).
//
// L'atelier a déclaré 6 tournées de génoise chocolat, soit 18 kg. L'app a écrit
// 18 000 dans l'ordre — mais l'unité de sortie de cette recette est
// « Tournée (3 kg) ». 18 000 tournées = 54 000 kg, et l'ordre a été validé :
// 36 tonnes d'œufs et 15,8 tonnes de farine consommées sur le papier.
//
// La cause : le repli « si la recette ne sort pas des kg, alors c'est des g »
// (×1000). Il ne connaissait que deux unités, et la génoise en a une troisième.
import { describe, it, expect } from 'vitest'
import { quantiteOrdre } from '../../api/freezer-list.js'

describe('la quantité écrite dans l’ordre de fabrication', () => {
  it('LE BUG : 18 kg de génoise, ce sont 6 tournées, pas 18 000', () => {
    expect(quantiteOrdre(18, null, 'Tournée (3 kg)')).toBe(6)
  })

  it('et 6 kg de génoise vanille (WHLVP/MO/203046), 2 tournées', () => {
    expect(quantiteOrdre(6, null, 'Tournée (3 kg)')).toBe(2)
  })

  it('sans unité, la quantité du CD reste des kilos', () => {
    expect(quantiteOrdre(2.24, null, 'kg')).toBe(2.24)     // crème au beurre
    expect(quantiteOrdre(2.24, null, 'g')).toBe(2240)      // recette écrite en g
  })

  it('l’annexe, elle, dit toujours son unité', () => {
    expect(quantiteOrdre(6120, 'g', 'g')).toBe(6120)
    expect(quantiteOrdre(6120, 'g', 'kg')).toBe(6.12)
    expect(quantiteOrdre(9000, 'g', 'Tournée (3 kg)')).toBe(3)
  })

  it('ce qui se compte à la pièce n’est jamais multiplié', () => {
    // 191 pièces sont 191 pièces, pas 191 000.
    expect(quantiteOrdre(191, 'u', 'Units')).toBe(191)
    expect(quantiteOrdre(191, null, 'Units')).toBe(191)
    expect(quantiteOrdre(135, 'u', 'u')).toBe(135)
  })
})
