import { describe, it, expect } from 'vitest'
import {
  estLigneLivraison, heurePreparation, finCreneau, creneauClient,
  estCreneau2h, creneauDepuisSlot, texteCreneauClient, texteCreneau, heureLisible,
} from './creneau'

describe('créneau de livraison', () => {
  it('reconnaît la ligne Livraison du panier', () => {
    expect(estLigneLivraison('Livraison')).toBe(true)
    expect(estLigneLivraison(' livraison ')).toBe(true)
    expect(estLigneLivraison('Livraison express')).toBe(false)   // autre article
    expect(estLigneLivraison('E- Citron meringué')).toBe(false)
  })

  it('13:00 saisi → prête pour 12:30, client entre 13h et 15h', () => {
    expect(heurePreparation('13:00')).toBe('12:30')
    expect(finCreneau('13:00')).toBe('15:00')
    expect(texteCreneau('12:30')).toBe('entre 13h et 15h')
  })

  it('garde les minutes', () => {
    expect(heurePreparation('13:45')).toBe('13:15')
    expect(texteCreneau('13:15')).toBe('entre 13h45 et 15h45')
    expect(heureLisible('09:00')).toBe('9h')
  })

  it('aller-retour saisie → Odoo → écran de modification (pas de cumul)', () => {
    const prep = heurePreparation('16:00')          // ce qu'Odoo enregistre
    expect(creneauClient(prep).debut).toBe('16:00')  // ce que le champ réaffiche
    expect(heurePreparation(creneauClient(prep).debut)).toBe(prep)   // 2e enregistrement : identique
  })

  it('ne décale pas une commande sans heure (sinon elle bascule la veille)', () => {
    expect(heurePreparation('00:00')).toBe('00:00')
    expect(heurePreparation('')).toBe('')
  })

  it('distingue une commande prise avant la règle (créneau d\'1 h)', () => {
    expect(estCreneau2h('22-08-26 13h-15h')).toBe(true)
    expect(estCreneau2h('22-08-26 13h-14h')).toBe(false)   // ancienne commande
    expect(estCreneau2h(null)).toBe(false)
    expect(creneauDepuisSlot('22-08-26 13h30-15h30')).toBe('13h30-15h30')
    expect(creneauDepuisSlot('22-08-26 13h-14h')).toBe('')
  })

  it('compose le texte envoyé au client', () => {
    expect(texteCreneauClient('22/08/2026', '22-08-26 13h-15h')).toBe('22/08/2026 entre 13h et 15h')
    expect(texteCreneauClient('22/08/2026', '22-08-26 13h-14h')).toBe('')   // retrait : phrase inchangée
  })
})
