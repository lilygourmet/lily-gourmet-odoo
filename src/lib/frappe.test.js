import { describe, it, expect } from 'vitest'
import { frappe } from './frappe'

// Le pavé se comporte comme une calculette : les chiffres poussent à droite.
describe('frappe', () => {
  it('remplace le zéro de départ au lieu de coller derrière', () => {
    expect(frappe('0', '5')).toBe('5')
    expect(frappe('5', '0')).toBe('50')
    expect(frappe('12', '3')).toBe('123')
  })

  it('n’accepte qu’une seule virgule', () => {
    expect(frappe('12', ',')).toBe('12.')
    expect(frappe('12.', ',')).toBe('12.')
    expect(frappe('12.5', ',')).toBe('12.5')
  })

  it('efface le dernier caractère, et retombe sur zéro plutôt que sur du vide', () => {
    expect(frappe('123', '←')).toBe('12')
    expect(frappe('1', '←')).toBe('0')
    expect(frappe('0', '←')).toBe('0')
  })

  it('part de zéro quand le champ est vide', () => {
    expect(frappe('', ',')).toBe('0.')
    expect(frappe('', '7')).toBe('7')
  })
})
