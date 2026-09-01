import { describe, it, expect } from 'vitest'
import { calculer } from './inventaire'

describe('calculer — la case de saisie fait aussi calculatrice', () => {
  it('lit un nombre simple', () => {
    expect(calculer('2500')).toBe(2500)
    expect(calculer('12.5')).toBe(12.5)
    expect(calculer('12,5')).toBe(12.5)     // virgule française
  })

  it('additionne plusieurs pesées', () => {
    expect(calculer('2500+1800+400')).toBe(4700)
    expect(calculer('2500 + 1800')).toBe(4300)   // espaces tolérés
  })

  it('multiplie (3 boîtes de 500 g)', () => {
    expect(calculer('3*500')).toBe(1500)
    expect(calculer('3*500+250')).toBe(1750)
  })

  it('soustrait (retirer une tare)', () => {
    expect(calculer('2500-120')).toBe(2380)
  })

  it('refuse ce qui n\'est pas calculable', () => {
    expect(calculer('')).toBe(null)
    expect(calculer('abc')).toBe(null)
    expect(calculer('2500+')).toBe(null)
    expect(calculer('2500++300')).toBe(null)
    expect(calculer('3*')).toBe(null)
  })

  it('ne laisse pas exécuter du code', () => {
    expect(calculer('alert(1)')).toBe(null)
    expect(calculer('1;2')).toBe(null)
  })
})
