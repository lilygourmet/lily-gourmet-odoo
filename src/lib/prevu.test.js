// « Ça reste toujours 25. Si on décide de changer d'avis, il y a un bouton
// Réinitialiser » (Layla, 2026-09-11).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { prevusGardes, poserPrevu, figerPrevu, oublierPrevu } from './prevu'

function fausseMemoire() {
  const m = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  })
}
beforeEach(fausseMemoire)
afterEach(() => vi.unstubAllGlobals())

const TRONC = 'SM- Tronc framboise 15 cm'

describe('le prévu', () => {
  it('se pose, et se retrouve quand on revient', () => {
    poserPrevu(TRONC, 25)
    expect(prevusGardes()[TRONC].q).toBe(25)
  })

  it('n’est pas figé tant qu’on est sur sa fiche', () => {
    poserPrevu(TRONC, 25)
    expect(prevusGardes()[TRONC].fige).toBe(false)
    poserPrevu(TRONC, 30)              // on se reprend
    expect(prevusGardes()[TRONC].q).toBe(30)
  })

  it('se fige quand on quitte la fiche — le travail commence', () => {
    poserPrevu(TRONC, 25)
    figerPrevu(TRONC)
    expect(prevusGardes()[TRONC]).toEqual({ q: 25, fige: true })
  })

  it('« Réinitialiser » le rend libre', () => {
    poserPrevu(TRONC, 25)
    figerPrevu(TRONC)
    oublierPrevu(TRONC)
    expect(prevusGardes()[TRONC]).toBeUndefined()
  })

  it('ne change PAS de jour : hier vaut toujours aujourd’hui', () => {
    // « Si c'est le lendemain ou une semaine après, ça restera toujours le
    // 25 » (Layla, 2026-09-11) : une recette commencée le soir se finit le
    // lendemain.
    poserPrevu(TRONC, 25)
    figerPrevu(TRONC)
    expect(prevusGardes()[TRONC]).toEqual({ q: 25, fige: true })
  })

  it('relit l’ancien format, rangé par date', () => {
    localStorage.setItem('lg:annexe2-prevu',
      JSON.stringify({ jour: '2026-09-10', par: { [TRONC]: { q: 25, fige: true } } }))
    expect(prevusGardes()[TRONC].q).toBe(25)
  })

  it('garde chaque article à part', () => {
    poserPrevu(TRONC, 25)
    poserPrevu('SM- Royal Chocolat 15 cm', 13)
    expect(prevusGardes()[TRONC].q).toBe(25)
    expect(prevusGardes()['SM- Royal Chocolat 15 cm'].q).toBe(13)
  })

  it('tient devant une mémoire cassée', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'pas du json', setItem: () => {} })
    expect(prevusGardes()).toEqual({})
  })
})

describe('le chiffre proposé compte aussi', () => {
  // « Je suis sorti de la page, je suis revenu, le 25 a disparu » (Layla).
  // Il n'était gardé que si on l'avait tapé soi-même.
  it('poser puis figer : il reste au retour', () => {
    poserPrevu(TRONC, 25)          // ce que fait l'écran en quittant
    figerPrevu(TRONC)
    expect(prevusGardes()[TRONC]).toEqual({ q: 25, fige: true })
  })

  it('figer sans rien avoir posé ne crée rien', () => {
    figerPrevu(TRONC)
    expect(prevusGardes()[TRONC]).toBeUndefined()
  })

  it('et un composant garde sa quantité, lui aussi', () => {
    poserPrevu('SM. Chantilly à la Rose', 1050)
    expect(prevusGardes()['SM. Chantilly à la Rose'].q).toBe(1050)
  })
})
