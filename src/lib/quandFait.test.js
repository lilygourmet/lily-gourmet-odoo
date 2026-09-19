// « quand ça marque comme fait dans fabrication annexe/CD et dans à valider,
// noter le jour et l'heure » (Layla, 2026-09-19).
//
// L'heure seule ne suffisait pas : un gâteau monté lundi se valide parfois
// mercredi, et « 14h02 » ne disait pas lequel des deux jours.
import { describe, it, expect } from 'vitest'
import { quandFait } from './jourLisible'

describe('quandFait', () => {
  it('donne le jour ET l’heure', () => {
    expect(quandFait('2026-09-19T13:02:00.000Z')).toBe('19/09 à 14h02')
  })

  it('compte à l’heure du MAROC : 23h30 UTC reste le même jour', () => {
    // Sans le fuseau, cette déclaration s'affichait le 20 à 23h30.
    expect(quandFait('2026-09-19T22:30:00.000Z')).toBe('19/09 à 23h30')
  })

  it('un fuseau déjà écrit dans la date est respecté', () => {
    expect(quandFait('2026-09-19T14:02:00+01:00')).toBe('19/09 à 14h02')
  })

  it('rien à dire quand il n’y a pas de date', () => {
    expect(quandFait(null)).toBe('')
    expect(quandFait('')).toBe('')
    expect(quandFait('n’importe quoi')).toBe('')
  })
})
