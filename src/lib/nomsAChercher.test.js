// Le pré-chargement des articles ne doit JAMAIS perdre un ingrédient.
//
// Bug du 2026-09-11 : « SM. Biscuit a la cuillere (plaque) » est un vrai nom
// d'article, pas une variante de « SM. Biscuit a la cuillere » (archivé, lui).
// On ne demandait que la base à Odoo, qui ne renvoyait rien — et la PLAQUE
// disparaissait de la recette du biscuit 5 pers.
import { describe, it, expect } from 'vitest'
import { nomsAChercher } from '../../api/fab-annexe.js'

describe('nomsAChercher', () => {
  it('demande le nom EXACT, parenthèses comprises', () => {
    expect(nomsAChercher(['SM. Biscuit a la cuillere (plaque)']))
      .toContain('SM. Biscuit a la cuillere (plaque)')
  })

  it('demande aussi la base, pour les vraies variantes', () => {
    // « SM- 20 cm Vitrine (Citron) » est une variante de « SM- 20 cm Vitrine ».
    const l = nomsAChercher(['SM- 20 cm Vitrine (Citron)'])
    expect(l).toContain('SM- 20 cm Vitrine (Citron)')
    expect(l).toContain('SM- 20 cm Vitrine')
  })

  it('ne demande pas deux fois la même chose', () => {
    expect(nomsAChercher(['SM. Caramel', 'SM. Caramel'])).toEqual(['SM. Caramel'])
  })

  it('laisse tranquille un nom sans parenthèses', () => {
    expect(nomsAChercher(['SM. Ganache Gold'])).toEqual(['SM. Ganache Gold'])
  })

  it('tient devant du vide', () => {
    expect(nomsAChercher(null)).toEqual([])
    expect(nomsAChercher(['', null])).toEqual([])
  })
})
