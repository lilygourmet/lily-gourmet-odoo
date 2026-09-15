// L'ORDRE DE « À FAIRE » : le plus urgent en haut.
//
// « classe moi à faire dans fabrication annexe 2 par ordre d'urgence selon le
// stock dans stock prod » (Layla, 2026-09-15). La liste sortait par ordre
// alphabétique, ce qui ne veut rien dire pour l'atelier.
import { describe, it, expect } from 'vitest'
import { urgence } from '../../api/fab-annexe.js'

describe('l’urgence d’un article', () => {
  it('rien en stock = urgence maximale', () => {
    expect(urgence({ mini: 30 }, 0)).toBe(0)
    expect(urgence({ mini: 3 }, 0)).toBe(0)
  })

  it('se compte en PART du mini, pas en nombre', () => {
    // 0 sur un mini de 3 et 0 sur un mini de 100 : même urgence.
    expect(urgence({ mini: 3 }, 0)).toBe(urgence({ mini: 100 }, 0))
    // 1 sur 3 (33 %) est plus urgent que 40 sur 100 (40 %), malgré le nombre.
    expect(urgence({ mini: 3 }, 1)).toBeLessThan(urgence({ mini: 100 }, 40))
  })

  it('ce qu’on a déclaré aujourd’hui compte comme présent', () => {
    // Le stock d'Odoo ne monte qu'à la validation.
    expect(urgence({ mini: 20 }, 0, 10)).toBeCloseTo(0.5, 3)
  })

  it('un stock négatif compte zéro — c’est un compteur faux, pas une dette', () => {
    expect(urgence({ mini: 20 }, -1390)).toBe(0)
  })

  it('pile sur le mini vaut 1, au-dessus ne dépasse pas', () => {
    expect(urgence({ mini: 20 }, 20)).toBe(1)
    expect(urgence({ mini: 20 }, 500)).toBe(1)
  })

  it('un mini à zéro ne se montre qu’à zéro : urgence maximale', () => {
    expect(urgence({ mini: 0 }, 0)).toBe(0)
  })

  it('l’ordre réel du 15/09, du plus urgent au moins', () => {
    const liste = [
      { nom: 'Base CBS 23 cm', mini: 10, stock: 0 },
      { nom: 'Cheesecake nature', mini: 30, stock: 23 },
      { nom: 'Gianduja 10 pers', mini: 3, stock: 2 },
      { nom: 'Base Tarte CBS indiv', mini: 100, stock: 50 },
    ]
    const trie = liste.slice()
      .sort((a, b) => urgence(a, a.stock) - urgence(b, b.stock))
      .map(x => x.nom)
    expect(trie).toEqual([
      'Base CBS 23 cm',        // 0 %
      'Base Tarte CBS indiv',  // 50 %
      'Gianduja 10 pers',      // 67 %
      'Cheesecake nature',     // 77 %
    ])
  })
})
