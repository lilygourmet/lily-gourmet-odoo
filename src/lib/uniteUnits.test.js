// ============================================================
// « Units », LE MOT D'ODOO, N'EST PAS UNE UNITÉ QUE L'APP SAIT CONVERTIR.
//
// « Base Tarte CBS 23 cm — 2 u / Son ordre est en train de partir dans Odoo…
// sans ordre » (Layla, 2026-09-21).
//
// Le chemin du bug, en entier : `grapheConsommateurs` (le seul endroit du
// serveur qui ne passait pas par `uniteDe`) renvoyait « Units » ; « À finir »
// déclarait donc `unite: 'Units'` ; `declarer()` ne reconnaissait pas des
// pièces et convertissait en grammes ; `enGrammes(1, 'Units')` vaut NULL ;
// l'ordre partait sans quantité et Odoo le refusait, en silence.
//
// Deux déclarations sont restées « sans ordre » ce soir-là.
// ============================================================
import { describe, it, expect } from 'vitest'
import { enGrammes } from './unites'

// Les deux règles telles qu'elles vivent dans le code, gardées ici pour être
// testées seules.
const uniteOdoo = u => (u ? String(u).replace(/^Units?$/i, 'u') : null)
const enPieces = unite => /^units?$|^u$/i.test(String(unite || '').trim())

describe('le serveur normalise l’unité d’Odoo', () => {
  it('« Units » et « Unit » deviennent « u »', () => {
    expect(uniteOdoo('Units')).toBe('u')
    expect(uniteOdoo('Unit')).toBe('u')
    expect(uniteOdoo('units')).toBe('u')
  })

  it('les vraies unités ne bougent pas', () => {
    expect(uniteOdoo('kg')).toBe('kg')
    expect(uniteOdoo('g')).toBe('g')
  })

  it('rien reste rien', () => {
    expect(uniteOdoo(null)).toBe(null)
    expect(uniteOdoo(undefined)).toBe(null)
  })
})

describe('déclarer reconnaît les pièces quel que soit le mot', () => {
  it('« u » comme « Units » comptent des pièces', () => {
    expect(enPieces('u')).toBe(true)
    expect(enPieces('Units')).toBe(true)
    expect(enPieces('Unit')).toBe(true)
    expect(enPieces(' u ')).toBe(true)
  })

  it('un poids n’est pas une pièce', () => {
    expect(enPieces('g')).toBe(false)
    expect(enPieces('kg')).toBe(false)
  })
})

// ⚠️ LA RAISON POUR LAQUELLE LE SILENCE ÉTAIT TOTAL.
describe('pourquoi l’ordre partait vide', () => {
  it('« Units » n’est pas convertible en grammes : enGrammes rend null', () => {
    expect(enGrammes(1, 'Units')).toBe(null)
  })

  it('alors que « u » reconnu comme pièce n’a rien à convertir', () => {
    expect(enPieces('Units')).toBe(true)      // on ne passe donc plus par là
  })
})
