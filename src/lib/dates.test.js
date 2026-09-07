import { describe, it, expect } from 'vitest'
import { jourLocal, todayISO } from './dates'

describe('jourLocal : le jour vu d ici, pas celui d UTC', () => {
  it('rend le jour local d un horodatage de la base', () => {
    // 00h30 le 8 au Maroc (UTC+1) s ecrit 23h30 le 7 en UTC : la tranche
    // brute donnait le 7, et « les comptages d aujourd hui » n en voyait aucun.
    const d = new Date(2026, 8, 8, 0, 30)      // 8 septembre, 00h30, heure locale
    expect(jourLocal(d.toISOString())).toBe('2026-09-08')
  })
  it('un comptage fait a l instant est du jour', () => {
    expect(jourLocal(new Date().toISOString())).toBe(todayISO())
  })
  it('ne casse pas sur du vide ou du n importe quoi', () => {
    expect(jourLocal(null)).toBe('')
    expect(jourLocal('')).toBe('')
    expect(jourLocal('pas une date')).toBe('pas une da')
  })
})
