// « Ça dépend de ce qui a été décidé dans le mini et maxi ; s'il y a tournée
// ou pas » (Layla, 2026-09-10). Le catalogue décide : une tournée réglée dans
// « Mini / maxi Annexe » = des fournées entières ; pas de tournée = on fait
// exactement ce qu'il faut.
import { describe, it, expect } from 'vitest'
import { aProduire } from '../../api/fab-annexe.js'

describe('aProduire', () => {
  it('ce qui manque, quand il manque quelque chose', () => {
    // Ganache Gold : le 23 cm en demande 1 900 g, il n'y en a pas.
    expect(aProduire(1900, 1900, 'g')).toBe(1900)
  })

  it('JAMAIS zéro : en stock, on propose ce que la recette demande', () => {
    // Le zeste de citron : la recette en demande 12 g, il y en a 800.
    // L'écran proposait 1 000 g — une tournée entière pour 12 g.
    expect(aProduire(-788, 12, 'g')).toBe(12)
    expect(aProduire(0, 12, 'g')).toBe(12)
  })

  it('les pièces s’arrondissent au-dessus : pas 1,4 fond de tarte', () => {
    expect(aProduire(1.4, 10, 'u')).toBe(2)
    expect(aProduire(0, 9.2, 'u')).toBe(10)
  })

  it('rend zéro quand il n’y a vraiment rien à faire', () => {
    expect(aProduire(0, 0, 'g')).toBe(0)
  })

  it('garde les grammes au millième, pas plus', () => {
    expect(aProduire(1966.6666, 3300, 'g')).toBe(1966.667)
  })
})
