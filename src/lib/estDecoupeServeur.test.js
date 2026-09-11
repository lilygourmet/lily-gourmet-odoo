// « Les découpes paraissent toujours avec le nombre demandé du gâteau. On a
// parlé de tournée de découpe selon la taille » (Layla, 2026-09-11).
//
// Un biscuit taillé dans une plaque se fait par PLAQUES ENTIÈRES, même s'il
// n'a aucun réglage au catalogue : on ne coupe pas 90 individuels dans une
// plaque qui en donne 102. Le surplus part au congélo.
import { describe, it, expect } from 'vitest'
import { estDecoupeServeur } from '../../api/fab-annexe.js'

describe('estDecoupeServeur', () => {
  it('un biscuit en pièces, tiré d’un seul ingrédient', () => {
    expect(estDecoupeServeur('u', 1)).toBe(true)       // Biscuit Gianduja indiv
    expect(estDecoupeServeur('Units', 1)).toBe(false)  // déjà normalisé en amont
  })

  it('une crème pesée n’est pas une découpe', () => {
    expect(estDecoupeServeur('g', 1)).toBe(false)
    expect(estDecoupeServeur('kg', 1)).toBe(false)
  })

  it('un montage non plus : il a plusieurs ingrédients', () => {
    expect(estDecoupeServeur('u', 3)).toBe(false)
    expect(estDecoupeServeur('u', 0)).toBe(false)
  })

  it('tient devant du vide', () => {
    expect(estDecoupeServeur(null, 1)).toBe(false)
    expect(estDecoupeServeur('u', null)).toBe(false)
  })
})
