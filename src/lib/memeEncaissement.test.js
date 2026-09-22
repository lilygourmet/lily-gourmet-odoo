import { describe, it, expect } from 'vitest'
import { memeEncaissement } from './releveDoublons'

// Cas réels du relevé de juin 2026. Le contrôle d'un relevé s'en sert pour décider s'il
// doit proposer d'ajouter une ligne — donc pour ne JAMAIS créer de doublon, sans pour
// autant masquer un encaissement vraiment absent.
const l = (label, amount, ligne_date) => ({ label, amount, ligne_date })

const RELEVE_MAROUANE = l('VIR INST RECU M 2118940 000011400383 0112026060100011400383 MAROUANE 011013MAD00000220260601', 1000, '2026-06-01')
const EXTRAIT_MAROUANE = l('VIR INST RECU M MAROUANE MOUTA', 1000, '2026-06-01')
const ZOUBIDA = l('VIR INST RECU ZOUBIDA EL BOUSS 2138384 260604167682', 1000, '2026-06-04')

describe('memeEncaissement', () => {
  it('reconnaît la même opération écrite par les deux documents', () => {
    expect(memeEncaissement(RELEVE_MAROUANE, EXTRAIT_MAROUANE)).toBe(true)
  })

  it('ne confond pas deux clientes du même montant à 3 jours d’écart', () => {
    expect(memeEncaissement(RELEVE_MAROUANE, ZOUBIDA)).toBe(false)
  })

  it('suppose le même quand un libellé ne porte aucun nom', () => {
    expect(memeEncaissement(l('VERSEMENT ESPECES 1249 0059748', 1000, '2026-06-04'), ZOUBIDA)).toBe(true)
  })

  it('sépare deux montants différents, et deux dates éloignées', () => {
    expect(memeEncaissement(RELEVE_MAROUANE, { ...EXTRAIT_MAROUANE, amount: 900 })).toBe(false)
    expect(memeEncaissement(RELEVE_MAROUANE, { ...EXTRAIT_MAROUANE, ligne_date: '2026-06-20' })).toBe(false)
  })
})
