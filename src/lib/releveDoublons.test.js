import { describe, it, expect } from 'vitest'
import { nomDeLigne, similarite, marquerDoublons } from './releveDoublons'

const L = (key, date, amount, label, created_at) => ({ key, ligne_date: date, amount, label, created_at })

describe('nom utile d\'un libellé', () => {
  it('ne garde que le nom du client', () => {
    expect(nomDeLigne('VIRT RECU MME SELMA BENOMAR')).toBe('BENOMAR SELMA')
    expect(nomDeLigne('VIR INST RECU 2378161 682183838646 BADRY FATIN')).toBe('BADRY FATIN')
    expect(nomDeLigne('VIREMENT RECU DE BSK FOODS')).toBe('BSK FOODS')
  })

  it('ignore l\'ordre des mots (il change d\'un relevé à l\'autre)', () => {
    expect(nomDeLigne('VIRT RECU SELMA BENOMAR')).toBe(nomDeLigne('VIRT RECU BENOMAR SELMA'))
  })
})

describe('ressemblance', () => {
  it('repère une orthographe proche', () => {
    expect(similarite('BENOMAR SELMA', 'BENNOMAR SELMA')).toBeGreaterThan(0.9)
  })

  it('sépare deux noms différents', () => {
    expect(similarite('BENOMAR SELMA', 'IRAQI YACOUT')).toBeLessThan(0.5)
  })
})

describe('doublons des lignes à lier', () => {
  it('retire la même opération vue sous 2 dates dans 2 imports (garde la plus ancienne)', () => {
    const out = marquerDoublons([
      L('a', '2026-05-14', 28710, 'VIREMENT RECU DE BSK FOODS', '2026-06-02T13:40:57'),
      L('b', '2026-05-15', 28710, 'VIREMENT RECU DE BSK FOODS', '2026-07-21T12:16:56'),
    ])
    expect(out.map(l => l.key)).toEqual(['a'])
  })

  it('garde deux VRAIS virements identiques du même relevé', () => {
    const out = marquerDoublons([
      L('a', '2026-03-09', 350, 'VIR INST RECU BERRADA ABLA', '2026-06-02T13:40:57'),
      L('b', '2026-03-10', 350, 'VIR INST RECU BERRADA ABLA', '2026-06-02T13:40:57'),
    ])
    expect(out).toHaveLength(2)
  })

  it('garde deux virements de même montant éloignés dans le temps', () => {
    const out = marquerDoublons([
      L('a', '2026-05-18', 77, 'VIRT RECU MME SELMA BENOMAR', '2026-06-02T13:40:57'),
      L('b', '2026-07-14', 77, 'VIRT RECU MME SELMA BENOMAR', '2026-07-21T12:16:56'),
    ])
    expect(out).toHaveLength(2)
  })

  it('signale (sans retirer) une orthographe qui se ressemble', () => {
    const out = marquerDoublons([
      L('a', '2026-06-05', 376, 'VIRT RECU MME SELMA BENOMAR', '2026-06-02T13:40:57'),
      L('b', '2026-06-06', 376, 'VIRT RECU MME SELMA BENNOMAR', '2026-07-21T12:16:56'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].doublon_probable.date).toBe('2026-06-06')
    expect(out[1].doublon_probable.date).toBe('2026-06-05')
  })

  it('ne signale rien pour deux clients différents du même montant', () => {
    const out = marquerDoublons([
      L('a', '2026-06-05', 376, 'VIRT RECU MME SELMA BENOMAR', '2026-06-02T13:40:57'),
      L('b', '2026-06-06', 376, 'VIRT RECU MLLE YACOUT IRAQI', '2026-07-21T12:16:56'),
    ])
    expect(out).toHaveLength(2)
    expect(out.some(l => l.doublon_probable)).toBe(false)
  })
})
