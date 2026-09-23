// ============================================================
// L'HEURE DU MAROC — un seul réglage, et des garde-fous.
//
// « Modifier l'heure sur le système, on est passé à GMT 0 », puis « c'est
// surtout pour les commandes » (Layla, 2026-09-23).
//
// MESURÉ le soir même, à trois sources :
//     son téléphone        20:02
//     UTC                  20:02   ← identique
//     Africa/Casablanca    21:02   ← une heure d'avance
//
// La base de fuseaux du serveur se trompait, et treize conversions la
// croyaient. Une livraison saisie pour 19 h partait à 18 h UTC : une heure
// d'avance sur toutes les commandes.
// ============================================================
import { describe, it, expect } from 'vitest'
import { DECALAGE_FORCE, FUSEAU_MAROC, decalageMaroc, heureMaroc, jourMaroc, marocVersUtc } from './fuseauMaroc'

describe('le réglage', () => {
  it('le Maroc est à GMT+0 depuis le 2026-09-23', () => {
    expect(DECALAGE_FORCE).toBe(0)
    expect(FUSEAU_MAROC).toBe('UTC')
  })

  it('et le décalage ne dépend pas de la base de fuseaux', () => {
    expect(decalageMaroc(new Date('2026-09-23T20:02:00Z'))).toBe(0)
    // Même en plein été, même en plein hiver : c'est le réglage qui décide.
    expect(decalageMaroc(new Date('2026-01-15T12:00:00Z'))).toBe(0)
    expect(decalageMaroc(new Date('2026-07-15T12:00:00Z'))).toBe(0)
  })
})

describe('lire l’heure', () => {
  it('20:02 UTC se lit 20:02 au Maroc', () => {
    expect(heureMaroc(new Date('2026-09-23T20:02:00Z'))).toBe('20:02')
  })

  // ⚠️ LE JOUR COMPTE AUTANT QUE L'HEURE : une commande passée à 23 h 30 ne
  // doit pas basculer au lendemain, ni l'inverse.
  it('le jour est celui du Maroc, pas celui d’UTC', () => {
    expect(jourMaroc(new Date('2026-09-23T23:30:00Z'))).toBe('2026-09-23')
    expect(jourMaroc(new Date('2026-09-24T00:10:00Z'))).toBe('2026-09-24')
  })
})

// ⚠️ LE CŒUR DU SUJET — « c'est surtout pour les commandes ».
describe('enregistrer une livraison', () => {
  it('19 h saisi au Maroc devient 19 h UTC', () => {
    expect(marocVersUtc('2026-09-24', '19:00').toISOString()).toBe('2026-09-24T19:00:00.000Z')
  })

  it('et minuit ne décale pas la date', () => {
    expect(marocVersUtc('2026-09-24', '00:30').toISOString()).toBe('2026-09-24T00:30:00.000Z')
  })

  it('l’aller-retour tombe juste', () => {
    const u = marocVersUtc('2026-12-31', '23:45')
    expect(heureMaroc(u)).toBe('23:45')
    expect(jourMaroc(u)).toBe('2026-12-31')
  })
})

// ⚠️ LE PIÈGE DU SIGNE : dans les noms `Etc/GMT`, le signe est INVERSÉ.
// `Etc/GMT-1` vaut UTC+1. Se tromper décale de deux heures au lieu d'une.
describe('le jour où le pays repassera à UTC+1', () => {
  const fuseauPour = d => (d === null ? 'Africa/Casablanca'
    : d === 0 ? 'UTC' : `Etc/GMT${d > 0 ? '-' : '+'}${Math.abs(d)}`)

  it('UTC+1 s’écrit Etc/GMT-1, pas Etc/GMT+1', () => {
    expect(fuseauPour(1)).toBe('Etc/GMT-1')
    const midi = new Date('2026-09-23T12:00:00Z')
    expect(midi.toLocaleTimeString('fr-FR', { timeZone: fuseauPour(1) })).toMatch(/^13:00/)
  })

  it('et remettre null rend la main à la base de fuseaux', () => {
    expect(fuseauPour(null)).toBe('Africa/Casablanca')
  })
})
