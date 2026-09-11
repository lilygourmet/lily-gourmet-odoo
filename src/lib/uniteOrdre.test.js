// « Ça m'a créé encore une crème à 14,33 g » — en réalité l'ordre Odoo était
// juste (14 328 g), c'est l'écran « À valider » qui mélangeait deux unités :
// la quantité DÉCLARÉE (la crème citron gingembre se compte en kilos) avec
// l'unité de l'ORDRE (sa recette sort des grammes). (Layla, 2026-09-11.)
import { describe, it, expect } from 'vitest'
import { versUnite } from './unites'

describe('le journal et l’ordre ne comptent pas pareil', () => {
  it('14,328 kg déclarés valent 14 328 g dans l’ordre', () => {
    expect(versUnite(14.328, 'kg', 'g')).toBe(14328)
  })

  it('ce qui est déjà dans la même unité ne bouge pas', () => {
    expect(versUnite(9775, 'g', 'g')).toBe(9775)
    expect(versUnite(2.7, 'kg', 'kg')).toBe(2.7)
  })

  it('les pièces traversent sans conversion', () => {
    expect(versUnite(23, 'u', 'u')).toBe(23)
    expect(versUnite(23, 'u', '')).toBe(23)
  })

  it('sans unité connue, on ne touche à rien', () => {
    expect(versUnite(14.328, undefined, undefined)).toBe(14.328)
    expect(versUnite(14.328, 'kg', undefined)).toBe(14.328)
  })
})
