import { describe, it, expect } from 'vitest'
import { buildLogin, buildPassword } from './users'

describe('buildLogin', () => {
  it('prénom + 3 premières lettres du nom de famille, minuscule sans accent', () => {
    expect(buildLogin('Asmae El Abbadi')).toBe('asmaeabb')
    expect(buildLogin('Mohamed Ben Ali')).toBe('mohamedali')
    expect(buildLogin('Souad Tazi')).toBe('souadtaz')
  })
  it('gère les accents et les espaces multiples', () => {
    expect(buildLogin('Yôûssef   Amine   Tâzi')).toBe('yousseftaz')
  })
  it('prénom seul (pas de nom de famille) → prénom seul', () => {
    expect(buildLogin('Karima')).toBe('karima')
  })
  it('vide → chaîne vide', () => {
    expect(buildLogin('')).toBe('')
    expect(buildLogin(null)).toBe('')
  })
})

describe('buildPassword', () => {
  it('prénom + année d\'entrée', () => {
    expect(buildPassword('Asmae El Abbadi', '2023-05-01')).toBe('asmae2023')
    expect(buildPassword('Souad Tazi', '2024-09-15')).toBe('souad2024')
  })
  it('sans date d\'entrée → prénom seul', () => {
    expect(buildPassword('Asmae El Abbadi', null)).toBe('asmae')
    expect(buildPassword('Asmae El Abbadi', '')).toBe('asmae')
  })
})
