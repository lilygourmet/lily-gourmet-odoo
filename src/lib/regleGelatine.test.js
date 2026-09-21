// ============================================================
// LA GÉLATINE : Odoo compte enfin ce que l'atelier pèse.
//
// Pendant des mois, `MP- Gelatine en poudre` se pesait en MASSE (une part de
// poudre pour six d'eau) : l'écran renommait la ligne « masse gélatine » et
// multipliait par sept.
//
// « x7 plus besoin, parce que les recettes ont changé dans fabrication annexe.
// Maintenant l'article s'appelle masse gélatine et non gélatine en poudre »
// (Layla, 2026-09-21). Vérifié : 55 recettes utilisent « SM. Masse Gélatine »,
// et des 10 qui nomment encore la poudre, une seule est vivante — la masse
// elle-même, où la règle n'avait rien à faire (elle s'y réclamait 1 000 g de
// masse gélatine pour fabriquer 1 000 g de masse gélatine).
//
// Ce test garde donc l'inverse de ce qu'il gardait : plus AUCUNE conversion.
// ============================================================
import { describe, it, expect } from 'vitest'
import { nomAtelier, facteurAtelier } from './ecranSimple'

describe('plus aucune conversion', () => {
  it('la poudre se pèse telle qu’Odoo la compte, partout', () => {
    expect(nomAtelier('MP- Gelatine en poudre', 'SM. Mousse Cheese Passion')).toBe('Gelatine en poudre')
    expect(facteurAtelier('MP- Gelatine en poudre', 'SM. Mousse Cheese Passion')).toBe(1)
    expect(facteurAtelier('MP- Gelatine en poudre')).toBe(1)
  })

  it('143 g de poudre restent 143 g — plus de 1 001', () => {
    expect(143 * facteurAtelier('MP- Gelatine en poudre', 'SM. Mousse Pistache')).toBe(143)
  })

  it('et la masse gélatine ne se demande plus à elle-même', () => {
    expect(nomAtelier('MP- Gelatine en poudre', 'SM. Masse Gélatine')).toBe('Gelatine en poudre')
    expect(facteurAtelier('MP- Gelatine en poudre', 'SM. Masse Gélatine')).toBe(1)
  })

  it('les autres ingrédients n’ont jamais bougé', () => {
    expect(nomAtelier('MP- Eau robinet', 'SM. Masse Gélatine')).toBe('Eau robinet')
    expect(facteurAtelier('MP- Crème whipping', 'SM. Mousse Pistache')).toBe(1)
  })
})
