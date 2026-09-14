// UNE FOURNÉE DE 1 g N'EN EST PAS UNE.
//
// « les amandes caramélisées sortent la recette pas ok » (Layla, 2026-09-14).
//
// Dans « Mini / maxi Annexe », une tournée à 1 sur un article qui se PÈSE ne
// veut pas dire « une fournée fait un gramme » : c'est la façon de dire « pas
// de fournée décidée », pour que ce composant se fasse à la quantité juste.
// Mais la FICHE prenait ce 1 au pied de la lettre et calculait tout pour un
// gramme : 0,00037 kg de sucre, 0,09 g d'eau, 0,00075 kg d'amandes.
//
// Deux articles ACTIFS étaient dans ce cas le 2026-09-14 :
//   · SM. Amandes Caramelisees Production  — la recette en fait 2 654 g
//   · SM. Crème Légère Vanille Citron      — la recette en fait 5 492 g
import { describe, it, expect } from 'vitest'
import { fourneeFiche } from '../../api/fab-annexe.js'

describe('la quantité qu’une fiche propose', () => {
  it('LE BUG : une tournée de 1 g laisse place à la fournée de la recette', () => {
    expect(fourneeFiche(1, 'g', 2654)).toBe(2654)     // amandes caramélisées
    expect(fourneeFiche(1, 'g', 5492)).toBe(5492)     // crème légère vanille citron
    expect(fourneeFiche(0, 'g', 1925)).toBe(1925)     // craquant royal
    expect(fourneeFiche(1, 'kg', 5.55)).toBe(5.55)
  })

  it('une vraie fournée réglée au catalogue prime toujours', () => {
    expect(fourneeFiche(5.55, 'kg', 5.55)).toBe(5.55)
    expect(fourneeFiche(880, 'g', 445)).toBe(880)     // le catalogue décide
    expect(fourneeFiche(3040, 'g', 6080)).toBe(3040)
  })

  it('ce qui se compte à la PIÈCE n’est pas concerné', () => {
    // Une tournée d'un seul gâteau existe : on n'y touche pas.
    expect(fourneeFiche(1, 'u', 100)).toBe(1)
    expect(fourneeFiche(105, 'u', 105)).toBe(105)
    expect(fourneeFiche(0, 'u', 88)).toBe(1)
  })

  it('sans recette lisible, on garde ce qu’on a', () => {
    expect(fourneeFiche(1, 'g', 0)).toBe(1)
    expect(fourneeFiche(1, 'g', null)).toBe(1)
    expect(fourneeFiche(0, 'g', undefined)).toBe(1)
  })
})
