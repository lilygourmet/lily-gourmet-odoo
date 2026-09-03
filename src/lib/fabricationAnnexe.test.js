import { describe, it, expect } from 'vitest'
import { enfantsARupture } from './fabricationAnnexe'

// Règle décidée par Layla le 2026-09-03 : à l'annexe, on ne peut pas dire
// « c'est fait » si un enfant FABRIQUÉ est à zéro. Les trois nuances ci-dessous
// sont le cœur de la décision — les casser reviendrait soit à ne rien bloquer,
// soit à murer l'atelier.
describe('enfantsARupture', () => {
  const recettes = {
    'Gateau': {
      lignes: [
        { produit: 'SM Craquant', fabrique: true },
        { produit: 'SM Creme', fabrique: true },
        { produit: 'SM Sirop CD', fabrique: true },
        { produit: 'MP- Sucre', fabrique: false },
      ],
    },
    'Sans recette': {},
  }
  const stocks = {
    'SM Craquant': 0,     // fabriqué, compté, à zéro   → bloque
    'SM Creme': 4.2,      // fabriqué, en stock          → ne bloque pas
    'MP- Sucre': 0,       // acheté, à zéro              → ne bloque pas
    // 'SM Sirop CD' absent : jamais compté à l'annexe   → ne bloque pas
  }

  it('bloque sur un enfant fabriqué compté à zéro', () => {
    expect(enfantsARupture(recettes, stocks, 'Gateau')).toEqual(['SM Craquant'])
  })

  it('ne bloque PAS sur un enfant jamais compté à l\'annexe', () => {
    // il est fabriqué et rangé à la boutique : le pâtissier d'ici ne pourra
    // jamais le compter, bloquer serait un mur définitif
    expect(enfantsARupture(recettes, stocks, 'Gateau')).not.toContain('SM Sirop CD')
  })

  it('ne bloque PAS sur une matière première achetée à zéro', () => {
    expect(enfantsARupture(recettes, stocks, 'Gateau')).not.toContain('MP- Sucre')
  })

  it('ne bloque JAMAIS sur une génoise ni sur un sirop', () => {
    // Layla, 2026-09-03 : faits des deux côtés, rarement à jour chez Odoo.
    // Accents et casse ne doivent pas laisser passer un cas.
    const r = { 'X': { lignes: [
      { produit: 'SM Genoise Chocolat KG CD', fabrique: true },
      { produit: 'SM. Génoise Vanille KG', fabrique: true },
      { produit: 'SM. sirop Imbibage production KG', fabrique: true },
      { produit: 'SM Craquant', fabrique: true },
    ] } }
    const zero = {
      'SM Genoise Chocolat KG CD': 0, 'SM. Génoise Vanille KG': 0,
      'SM. sirop Imbibage production KG': 0, 'SM Craquant': 0,
    }
    expect(enfantsARupture(r, zero, 'X')).toEqual(['SM Craquant'])
  })

  it('ne bloque pas un stock négatif ignoré ni un article sans recette', () => {
    expect(enfantsARupture(recettes, { 'SM Craquant': -3, 'SM Creme': 1 }, 'Gateau'))
      .toEqual(['SM Craquant'])
    expect(enfantsARupture(recettes, stocks, 'Sans recette')).toEqual([])
    expect(enfantsARupture(recettes, stocks, 'Inconnu')).toEqual([])
  })

  it('ne cite qu\'une fois un enfant présent sur plusieurs lignes', () => {
    const r = { 'X': { lignes: [
      { produit: 'SM A', fabrique: true }, { produit: 'SM A', fabrique: true },
    ] } }
    expect(enfantsARupture(r, { 'SM A': 0 }, 'X')).toEqual(['SM A'])
  })
})
