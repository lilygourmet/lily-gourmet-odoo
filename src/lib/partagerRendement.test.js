import { describe, it, expect } from 'vitest'
import { partagerRendement } from './fabrication'

// « Combien ça t'a sorti ? » (Layla, 2026-09-18). La quantité tapée est ce qui
// ENTRE en stock. Quand la coche couvre plusieurs ordres Odoo, il faut la
// partager — sinon chaque ordre ferait entrer la fournée entière.
describe('partagerRendement', () => {
  it('un seul ordre : il prend tout', () => {
    expect(partagerRendement([{ name: 'WHLVP/MO/1', qty: 5.43 }], 5.1))
      .toEqual({ 'WHLVP/MO/1': 5.1 })
  })

  it('NE MULTIPLIE PAS la fournée sur plusieurs ordres', () => {
    const r = partagerRendement([
      { name: 'A', qty: 1 }, { name: 'B', qty: 1 }, { name: 'C', qty: 1 },
    ], 5)
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBeCloseTo(5, 6)
  })

  it('partage au prorata de ce que chaque ordre demandait', () => {
    const r = partagerRendement([{ name: 'A', qty: 3 }, { name: 'B', qty: 1 }], 8)
    expect(r).toEqual({ A: 6, B: 2 })
  })

  it('la somme des parts fait EXACTEMENT ce qui est sorti, malgré les arrondis', () => {
    const r = partagerRendement([{ name: 'A', qty: 1 }, { name: 'B', qty: 1 }, { name: 'C', qty: 1 }], 1)
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBe(1)
  })

  it('sans plan chiffré, parts égales — et le total reste juste', () => {
    const r = partagerRendement([{ name: 'A', qty: 0 }, { name: 'B', qty: 0 }], 3.33)
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBeCloseTo(3.33, 6)
  })

  it('ne rend rien quand il n’y a pas d’ordre, ou rien de sorti', () => {
    expect(partagerRendement([], 5)).toEqual({})
    expect(partagerRendement([{ name: 'A', qty: 1 }], 0)).toEqual({})
    expect(partagerRendement(null, 5)).toEqual({})
    expect(partagerRendement([{ name: 'A', qty: 1 }], -2)).toEqual({})
  })

  it('ignore les entrées sans nom d’ordre', () => {
    expect(partagerRendement([{ qty: 5 }, { name: 'A', qty: 5 }], 4)).toEqual({ A: 4 })
  })
})
