import { describe, it, expect, beforeEach } from 'vitest'
import { joliNumero, lienTel, basculerFavori, lireFavoris } from './annuaire'

// Les tests tournent hors navigateur : on imite la mémoire du téléphone.
beforeEach(() => {
  const boite = new Map()
  globalThis.localStorage = {
    getItem: k => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => boite.set(k, String(v)),
    clear: () => boite.clear(),
  }
})

describe('annuaire', () => {
  it('affiche le numéro par paires', () => {
    expect(joliNumero('0661234567')).toBe('06 61 23 45 67')
    expect(joliNumero('06 61 23 45 67')).toBe('06 61 23 45 67')
  })

  it('ne fabrique pas de lien d\'appel sans numéro', () => {
    expect(lienTel('')).toBe(null)
    expect(lienTel(null)).toBe(null)
    expect(lienTel('06 61 23 45 67')).toBe('tel:0661234567')
    expect(lienTel('+212 661 23 45 67')).toBe('tel:+212661234567')
  })

  it('ajoute puis retire un favori, et s\'en souvient', () => {
    const avec = basculerFavori(7, new Set())
    expect([...avec]).toEqual([7])
    expect([...lireFavoris()]).toEqual([7])

    const sans = basculerFavori(7, avec)
    expect(sans.size).toBe(0)
    expect(lireFavoris().size).toBe(0)
    expect(avec.size).toBe(1)   // l'ancien Set n'est pas modifié
  })
})

describe('retraits écrits en dur', () => {
  it('retire les personnes nommées, accents, casse et ordre indifférents', async () => {
    const { estMasqueEnDur } = await import('./annuaire')
    expect(estMasqueEnDur('Badiaa Bahri')).toBe(true)
    expect(estMasqueEnDur('BAHRI BADIAA')).toBe(true)
    expect(estMasqueEnDur('Râchida Haimer')).toBe(true)
    expect(estMasqueEnDur('Layla El Amrani')).toBe(true)
    expect(estMasqueEnDur('Layla Amrani')).toBe(true)      // « el » facultatif
    expect(estMasqueEnDur('Nezha Aouad')).toBe(true)
  })

  it('garde les homonymes qui ne sont pas visés', async () => {
    const { estMasqueEnDur } = await import('./annuaire')
    expect(estMasqueEnDur('Fatima Bahri')).toBe(false)     // autre Bahri
    expect(estMasqueEnDur('Nezha Bennis')).toBe(false)     // autre Nezha
    expect(estMasqueEnDur('Rachida Naciri')).toBe(false)
    expect(estMasqueEnDur('Hamza El Idrissi')).toBe(false)
    expect(estMasqueEnDur('')).toBe(false)
  })
})

describe('appel WhatsApp', () => {
  it('met l\'indicatif marocain', async () => {
    const { lienWhatsApp } = await import('./annuaire')
    expect(lienWhatsApp('0661234567')).toBe('https://wa.me/212661234567')
    expect(lienWhatsApp('+212 661 23 45 67')).toBe('https://wa.me/212661234567')
    expect(lienWhatsApp('')).toBe(null)
  })
})
