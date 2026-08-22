import { describe, it, expect, vi } from 'vitest'

// Ce module parle à Supabase ; on ne teste ici que le calcul des quantités.
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./watiInfo', () => ({ sendWatiInfo: vi.fn() }))

const { unitesPour, versUniteOdoo } = await import('./transfertsStock')

describe('unités proposées à la saisie', () => {
  it('propose grammes et kilos pour ce qui se pèse', () => {
    expect(unitesPour('kg')).toEqual(['g', 'kg'])
    expect(unitesPour('g')).toEqual(['g', 'kg'])
  })

  it('ne propose que la pièce pour ce qui se compte', () => {
    expect(unitesPour('Units')).toEqual(['u.'])
    expect(unitesPour('')).toEqual(['u.'])
  })
})

describe('quantité envoyée à Odoo', () => {
  it('convertit les grammes en kilos (sinon 500 g deviendraient 500 kg)', () => {
    expect(versUniteOdoo(500, 'g', 'kg')).toBe(0.5)
    expect(versUniteOdoo(2.5, 'kg', 'g')).toBe(2500)
  })

  it('ne touche à rien quand l\'unité est déjà la bonne', () => {
    expect(versUniteOdoo(3, 'kg', 'kg')).toBe(3)
    expect(versUniteOdoo(12, 'u.', 'Units')).toBe(12)
  })

  it('arrondit au lieu de traîner des décimales fausses', () => {
    expect(versUniteOdoo(1, 'g', 'kg')).toBe(0.001)
    expect(versUniteOdoo(333, 'g', 'kg')).toBe(0.333)
  })
})
