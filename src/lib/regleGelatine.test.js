// ============================================================
// LA GÉLATINE : ce qu'on pèse n'est pas ce qu'Odoo compte.
//
// `MP- Gelatine en poudre` se pèse en MASSE — une part de poudre pour six
// d'eau, donc ×7. Odoo ne connaît que la poudre ; sur la balance, c'est la
// masse qu'on fait. C'est une règle de Layla, et elle vaut pour toutes les
// recettes.
//
// ⚠️ SAUF SUR LA FICHE DE LA MASSE ELLE-MÊME. « Est-ce que la masse gélatine a
// été demandée pour bloquer ? » (Layla, 2026-09-21) : la fiche de « SM. Masse
// Gélatine » réclamait parmi ses ingrédients 1 000 g… de masse gélatine. La
// règle se mordait la queue — pour fabriquer la masse, on pèse la POUDRE.
// ============================================================
import { describe, it, expect } from 'vitest'
import { nomAtelier, facteurAtelier } from './ecranSimple'

describe('dans une recette ordinaire', () => {
  it('la poudre devient de la masse, et se pèse sept fois plus', () => {
    expect(nomAtelier('MP- Gelatine en poudre', 'SM. Mousse Cheese Passion')).toBe('Masse gélatine')
    expect(facteurAtelier('MP- Gelatine en poudre', 'SM. Mousse Cheese Passion')).toBe(7)
  })

  it('sans savoir pour quel article, la règle s’applique quand même', () => {
    expect(nomAtelier('MP- Gelatine en poudre')).toBe('Masse gélatine')
    expect(facteurAtelier('MP- Gelatine en poudre')).toBe(7)
  })

  it('les autres ingrédients ne bougent pas', () => {
    expect(nomAtelier('MP- Eau robinet', 'SM. Masse Gélatine')).toBe('Eau robinet')
    expect(facteurAtelier('MP- Crème whipping', 'SM. Mousse Pistache')).toBe(1)
  })
})

describe('sur la fiche de la masse gélatine elle-même', () => {
  it('on pèse la POUDRE, telle qu’Odoo la compte', () => {
    expect(nomAtelier('MP- Gelatine en poudre', 'SM. Masse Gélatine')).toBe('Gelatine en poudre')
    expect(facteurAtelier('MP- Gelatine en poudre', 'SM. Masse Gélatine')).toBe(1)
  })

  // 143 g de poudre pour 1 000 g de masse : ×7 aurait affiché « 1 000 g de
  // masse gélatine » dans la recette de la masse gélatine.
  it('143 g de poudre restent 143 g, pas 1 001', () => {
    expect(143 * facteurAtelier('MP- Gelatine en poudre', 'SM. Masse Gélatine')).toBe(143)
    expect(143 * facteurAtelier('MP- Gelatine en poudre', 'SM. Mousse Pistache')).toBe(1001)
  })

  it('l’accent et la casse ne changent rien', () => {
    expect(facteurAtelier('MP- Gelatine en poudre', 'SM. MASSE GELATINE')).toBe(1)
    expect(facteurAtelier('MP- Gelatine en poudre', 'sm. masse gélatine')).toBe(1)
  })
})
