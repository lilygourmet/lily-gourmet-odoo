// « Ça reste toujours 25. Si on décide de changer d'avis, il y a un bouton
// Réinitialiser » (Layla, 2026-09-11).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { prevusDuJour, poserPrevu, figerPrevu, oublierPrevu } from './prevu'

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

const JOUR = '2026-09-11'
const TRONC = 'SM- Tronc framboise 15 cm'

describe('le prévu', () => {
  it('se pose, et se retrouve quand on revient', () => {
    poserPrevu(JOUR, TRONC, 25)
    expect(prevusDuJour(JOUR)[TRONC].q).toBe(25)
  })

  it('n’est pas figé tant qu’on est sur sa fiche', () => {
    poserPrevu(JOUR, TRONC, 25)
    expect(prevusDuJour(JOUR)[TRONC].fige).toBe(false)
    poserPrevu(JOUR, TRONC, 30)              // on se reprend
    expect(prevusDuJour(JOUR)[TRONC].q).toBe(30)
  })

  it('se fige quand on quitte la fiche — le travail commence', () => {
    poserPrevu(JOUR, TRONC, 25)
    figerPrevu(JOUR, TRONC)
    expect(prevusDuJour(JOUR)[TRONC]).toEqual({ q: 25, fige: true })
  })

  it('« Réinitialiser » le rend libre', () => {
    poserPrevu(JOUR, TRONC, 25)
    figerPrevu(JOUR, TRONC)
    oublierPrevu(JOUR, TRONC)
    expect(prevusDuJour(JOUR)[TRONC]).toBeUndefined()
  })

  it('change de jour tout seul : hier ne décide pas d’aujourd’hui', () => {
    poserPrevu('2026-09-10', TRONC, 25)
    expect(prevusDuJour(JOUR)).toEqual({})
  })

  it('garde chaque article à part', () => {
    poserPrevu(JOUR, TRONC, 25)
    poserPrevu(JOUR, 'SM- Royal Chocolat 15 cm', 13)
    expect(prevusDuJour(JOUR)[TRONC].q).toBe(25)
    expect(prevusDuJour(JOUR)['SM- Royal Chocolat 15 cm'].q).toBe(13)
  })

  it('tient devant une mémoire cassée', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'pas du json', setItem: () => {} })
    expect(prevusDuJour(JOUR)).toEqual({})
  })
})

describe('le chiffre proposé compte aussi', () => {
  // « Je suis sorti de la page, je suis revenu, le 25 a disparu » (Layla).
  // Il n'était gardé que si on l'avait tapé soi-même.
  it('poser puis figer : il reste au retour', () => {
    poserPrevu(JOUR, TRONC, 25)          // ce que fait l'écran en quittant
    figerPrevu(JOUR, TRONC)
    expect(prevusDuJour(JOUR)[TRONC]).toEqual({ q: 25, fige: true })
  })

  it('figer sans rien avoir posé ne crée rien', () => {
    figerPrevu(JOUR, TRONC)
    expect(prevusDuJour(JOUR)[TRONC]).toBeUndefined()
  })

  it('et un composant garde sa quantité, lui aussi', () => {
    poserPrevu(JOUR, 'SM. Chantilly à la Rose', 1050)
    expect(prevusDuJour(JOUR)['SM. Chantilly à la Rose'].q).toBe(1050)
  })
})
