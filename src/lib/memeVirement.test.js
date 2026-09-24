import { describe, it, expect } from 'vitest'
import { memeVirement } from './releveDoublons'

// Tous les cas RÉELS rencontrés sur les relevés de Layla, mai à août 2026.
// Ce fichier est le contrat : si une règle change, c'est ici qu'on le voit.
const l = (label, amount, ligne_date) => ({ label, amount, ligne_date })

describe('memeVirement — un seul virement écrit deux fois', () => {
  it('nom tronqué par l’extrait (ANDALOUSSI / ANDALO)', () => {
    expect(memeVirement(
      l('VIR INST RECU IBN 2194929 212284886/1XXXXX ATTYA ANDALOUSSI', 330, '2026-06-20'),
      l('VIR INST RECU IBN ATTYA ANDALO', 330, '2026-06-20'))).toBe(true)
  })

  it('dernière lettre perdue (LAAMOURI / LAAMOUR)', () => {
    expect(memeVirement(
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 500, '2026-06-02'),
      l('VIRT RECU MLLE AATIYAD LAAMOUR', 500, '2026-06-02'))).toBe(true)
  })

  it('lettres mal lues (WIJDAN / WUDANE)', () => {
    expect(memeVirement(
      l('VIR INST RECU CHLIH 2085718 260523936928 277814063421 WIJDAN', 3000, '2026-05-23'),
      l('VIR INST RECU CHLIH WUDANE', 3000, '2026-05-23'))).toBe(true)
  })

  it('une lettre d’écart dans le nom de famille (BERRADA / BERRAYA)', () => {
    expect(memeVirement(
      l('VIR INST RECU BERRADA ABLA', 500, '2026-05-02'),
      l('VIR INST RECU BERRAYA ABLA', 500, '2026-05-02'))).toBe(true)
  })

  it('références intercalées par le relevé (MAROUANE)', () => {
    expect(memeVirement(
      l('VIR INST RECU M 2118940 000011400383 0112026060100011400383 MAROUANE', 1000, '2026-06-01'),
      l('VIR INST RECU M MAROUANE MOUTA', 1000, '2026-06-01'))).toBe(true)
  })
})

describe('memeVirement — deux virements différents', () => {
  it('même montant, JOUR différent (ZOUBIDA le 4 / MAROUANE le 1er)', () => {
    expect(memeVirement(
      l('VIR INST RECU ZOUBIDA EL BOUSS 2138384', 1000, '2026-06-04'),
      l('VIR INST RECU M 2118940 MAROUANE', 1000, '2026-06-01'))).toBe(false)
  })

  it('même jour, même montant, noms sans rapport', () => {
    expect(memeVirement(
      l('VIR INST RECU MME ABOULFADL AI', 300, '2026-05-02'),
      l('VIRT RECU MME LILIA BENWAHOUD', 300, '2026-05-02'))).toBe(false)
  })

  it('montants différents', () => {
    expect(memeVirement(
      l('VIR INST RECU BERRADA ABLA', 500, '2026-05-02'),
      l('VIR INST RECU BERRADA ABLA', 700, '2026-05-02'))).toBe(false)
  })

  it('un centime d’écart reste le même montant (Odoo compte, la banque arrondit)', () => {
    expect(memeVirement(
      l('VIR INST RECU BERRADA ABLA', 500.2, '2026-05-02'),
      l('VIR INST RECU BERRADA ABLA', 500, '2026-05-02'))).toBe(true)
  })
})

describe('memeVirement — quand on ne peut rien affirmer', () => {
  it('aucun nom lisible : on suppose le même, pour ne pas dupliquer', () => {
    expect(memeVirement(
      l('VERSEMENT ESPECES 1249 0059748', 1000, '2026-07-10'),
      l('VERSEMENT ESPECES', 1000, '2026-07-10'))).toBe(true)
  })

  it('sans date, on ne conclut pas', () => {
    expect(memeVirement(
      l('VIR INST RECU BERRADA ABLA', 500, null),
      l('VIR INST RECU BERRADA ABLA', 500, '2026-05-02'))).toBe(false)
  })
})
