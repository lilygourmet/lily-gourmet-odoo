import { describe, it, expect } from 'vitest'
import { nomDeLigne, similarite, marquerDoublons, signatureDepot } from './releveDoublons'

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

// Une opération s'identifie par sa DATE et son MONTANT — pas par son libellé, que chaque
// format de relevé écrit à sa façon (cas vécus le 2026-08-28).
describe('doublons — le libellé n\'est pas une identité', () => {
  it('fusionne la même opération écrite avec le n° d\'un côté et le nom de l\'autre', () => {
    const out = marquerDoublons([
      L('a', '2026-06-23', 300, 'VIR INST RECU 2203444 3751003105', '2026-07-22T16:00:00'),
      L('b', '2026-06-23', 300, 'VIRT RECU MLLE MERIAM MALEK', '2026-08-07T11:50:00'),
    ])
    expect(out).toHaveLength(1)
  })

  it('garde deux virements du même jour dont les n° d\'opération diffèrent', () => {
    const out = marquerDoublons([
      L('a', '2026-07-29', 200, 'VIR INST RECU EL 2376336 260729308078', '2026-07-30T10:00:00'),
      L('b', '2026-07-29', 200, 'VIR INST RECU 2378161 682183838646', '2026-08-07T11:50:00'),
    ])
    expect(out).toHaveLength(2)
  })

  it('garde deux clients différents du même montant à un jour d\'écart', () => {
    const out = marquerDoublons([
      L('a', '2026-06-05', 400, 'VIRT RECU MME SELMA BENOMAR', '2026-07-01T10:00:00'),
      L('b', '2026-06-06', 400, 'VIRT RECU MR OMAR TAZI', '2026-08-07T11:50:00'),
    ])
    expect(out).toHaveLength(2)
  })
})

// Cas vécu (versement de 5 834 dh, compte Attijariwafa) : le même dépôt sort sur le relevé
// à la date d'opération (30/04, « N° ») et sur le relevé de mouvements à la date de valeur
// (04/05, « N »). Deux lignes en base, un seul dépôt — c'est le n° qui les réunit.
describe('signatureDepot — un dépôt vu deux fois', () => {
  it('donne la même signature malgré la date et le « N° » / « N »', () => {
    const a = signatureDepot(5834, 'VERSEMENT ESPECE N° 1630293611')
    const b = signatureDepot('5834.00', 'VERSEMENT ESPECE N 1630293611')
    expect(a).toBe(b)
  })

  it('sépare deux versements de montants différents', () => {
    expect(signatureDepot(5834, 'VERSEMENT ESPECE N 1630293611'))
      .not.toBe(signatureDepot(5830, 'VERSEMENT ESPECE N 1630293611'))
  })

  it('sépare deux versements de n° différents', () => {
    expect(signatureDepot(5834, 'VERSEMENT ESPECE N 1630293611'))
      .not.toBe(signatureDepot(5834, 'VERSEMENT ESPECE N 1630293612'))
  })

  it('retient le n° le plus long, pas un code court', () => {
    expect(signatureDepot(200, 'VIR INST RECU 22334 1630293611')).toBe('20000|1630293611')
  })

  it('rend null sans numéro dans le libellé — on ne peut rien affirmer', () => {
    expect(signatureDepot(400, 'VIRT RECU MME SELMA BENOMAR')).toBeNull()
  })
})

// Rapprochement d'avant le marquage automatique : aucune ligne n'est mémorisée, le seul
// souvenir du dépôt est le libellé gardé sur la caisse (« date · libellé »). Il doit
// suffire à reconnaître la jumelle restée libre.
describe('signatureDepot — depuis le libellé gardé sur la caisse', () => {
  it('donne la même signature que la ligne du relevé', () => {
    expect(signatureDepot(9946, '2026-05-26 · VERSEMENT ESPECE N 1694192637'))
      .toBe(signatureDepot('9946.00', 'VERSEMENT ESPECE N° 1694192637'))
  })

  it("ne prend pas la date pour un n° d'opération", () => {
    expect(signatureDepot(9946, '2026-05-26 · VERSEMENT ESPECE N 1694192637')).toBe('994600|1694192637')
  })
})
