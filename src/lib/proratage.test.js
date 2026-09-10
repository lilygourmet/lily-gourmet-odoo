import { describe, it, expect } from 'vitest'
import { proratage } from '../../api/freezer-list.js'

// ====== Changer ce qu'un ordre doit produire ======
// Le réappro vise le maxi et lance 8 ; Layla n'en veut que 6. Les composants
// doivent suivre, sinon l'ordre de 6 consomme les ingrédients de 8.

const moves = [
  { id: 1, product_uom_qty: 2880 },   // crème au beurre
  { id: 2, product_uom_qty: 8 },      // génoises
]

describe('proratage', () => {
  it('met chaque composant au même rapport', () => {
    expect(proratage(moves, 8, 6)).toEqual([
      { id: 1, qty: 2160 },
      { id: 2, qty: 6 },
    ])
  })

  it('marche aussi vers le haut', () => {
    expect(proratage(moves, 8, 12)).toEqual([
      { id: 1, qty: 4320 },
      { id: 2, qty: 12 },
    ])
  })

  it('arrondit au millième, pas plus', () => {
    expect(proratage([{ id: 1, product_uom_qty: 1000 }], 3, 1)).toEqual([{ id: 1, qty: 333.333 }])
  })

  it('ne fait rien sur des quantités impossibles', () => {
    expect(proratage(moves, 0, 6)).toEqual([])
    expect(proratage(moves, 8, 0)).toEqual([])
    expect(proratage(null, 8, 6)).toEqual([])
  })
})
