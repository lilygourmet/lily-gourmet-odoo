// « J'ai marqué comme fait la base du flan, et systématiquement ça m'a mis la
// production du sablé crispy alors que j'en avais déjà en stock » (Layla,
// 2026-09-11). Chiffres réels : 2 576 g de sablé au frigo, 290 g demandés.
import { describe, it, expect } from 'vitest'
import { aCuireParDefaut } from './fabAnnexe'

const sable = { produit: 'SM. Sable Crispy', unite: 'g', besoin: 290, stock: 2576,
  dejaFait: 0, fabrique: true, ok: true, tourneeTaille: 5598, produira: 290 }

describe('aCuireParDefaut', () => {
  it('rien à cuire quand il y en a au frigo', () => {
    expect(aCuireParDefaut(sable)).toBe(0)
  })

  it('ce qui manque quand il n’y en a plus', () => {
    expect(aCuireParDefaut({ ...sable, stock: 0, ok: false, produira: 2900 })).toBe(2900)
  })

  it('ce qui a été fait À L’INSTANT compte comme du stock', () => {
    expect(aCuireParDefaut({ ...sable, stock: 0, dejaFait: 500, ok: true })).toBe(0)
  })

  it('juste ce qu’il faut quand il en manque un peu', () => {
    // 200 g au frigo, 290 demandés : il en manque 90, le serveur en propose 90.
    expect(aCuireParDefaut({ ...sable, stock: 200, ok: false, produira: 90 })).toBe(90)
  })

  it('tient devant du vide', () => {
    expect(aCuireParDefaut(null)).toBe(0)
    expect(aCuireParDefaut({})).toBe(0)
  })
})
