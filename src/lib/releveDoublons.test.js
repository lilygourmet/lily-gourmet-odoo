import { describe, it, expect } from 'vitest'
import { nomDeLigne, similarite, marquerDoublons, signatureDepot, memeDepotSansNumero } from './releveDoublons'

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
    expect(signatureDepot(200, 'VIR INST RECU 22334 1630293611')).toBe('200|1630293611')
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
    expect(signatureDepot(9946, '2026-05-26 · VERSEMENT ESPECE N 1694192637')).toBe('9946|1694192637')
  })
})

// Cas vécu (10 333 dh) : la caisse du 22/02 est justifiée par une PHOTO du bordereau,
// versement daté du 07/04 — pas de rapprochement relevé, donc aucun n° à comparer. Le
// dépôt du 08/04 au relevé est le sien : il ne doit pas rester dans « non liés ».
describe('memeDepotSansNumero — caisse justifiée par une preuve manuelle', () => {
  const caisse = { amount_cash: 10333, amount_proof: null, proof_date: '2026-04-07' }
  const ligne = { amount: 10333, ligne_date: '2026-04-08', label: 'VERSEMENT ESPECE N 1569672365' }

  it('reconnaît le dépôt : même montant, le lendemain du versement', () => {
    expect(memeDepotSansNumero(ligne, caisse)).toBe(true)
  })

  it('refuse un montant différent', () => {
    expect(memeDepotSansNumero({ ...ligne, amount: 10330 }, caisse)).toBe(false)
  })

  it('refuse un dépôt à plus de 7 jours du versement', () => {
    expect(memeDepotSansNumero({ ...ligne, ligne_date: '2026-04-16' }, caisse)).toBe(false)
  })

  it('accepte sur le seul montant quand la date du versement manque', () => {
    expect(memeDepotSansNumero({ ...ligne, ligne_date: '2026-11-30' }, { ...caisse, proof_date: null })).toBe(true)
  })

  it('utilise le montant du relevé quand il est renseigné', () => {
    const c = { amount_cash: 9000, amount_proof: 10333, proof_date: '2026-04-07' }
    expect(memeDepotSansNumero(ligne, c)).toBe(true)
  })
})

// Odoo compte les centimes, la banque arrondit. Une caisse à 10 333,20 dh et le versement
// bancaire de 10 333 dh sont le MÊME dépôt : au centime près ils ne se reconnaissaient pas,
// et le dépôt restait dans « Reçus banque non liés ».
describe('centimes Odoo face au montant rond de la banque', () => {
  it('même signature malgré les centimes', () => {
    expect(signatureDepot(10333.20, 'VERSEMENT ESPECE N 1569672365'))
      .toBe(signatureDepot(10333, 'VERSEMENT ESPECE N 1569672365'))
  })

  it('sépare toujours deux montants vraiment différents', () => {
    expect(signatureDepot(10333, 'VERSEMENT ESPECE N 1569672365'))
      .not.toBe(signatureDepot(10334, 'VERSEMENT ESPECE N 1569672365'))
  })

  it('reconnaît le dépôt d\'une caisse à preuve manuelle malgré les centimes', () => {
    const caisse = { amount_cash: 10333.20, amount_proof: 10333.20, proof_date: '2026-04-07' }
    const ligne = { amount: 10333, ligne_date: '2026-04-08', label: 'VERSEMENT ESPECE N 1569672365' }
    expect(memeDepotSansNumero(ligne, caisse)).toBe(true)
  })

  it('refuse encore un dirham entier d\'écart', () => {
    const caisse = { amount_cash: 10333, amount_proof: 10333, proof_date: '2026-04-07' }
    const ligne = { amount: 10334, ligne_date: '2026-04-08', label: 'VERSEMENT ESPECE N 1569672365' }
    expect(memeDepotSansNumero(ligne, caisse)).toBe(false)
  })
})

// Cas vécu (juillet) : le relevé et l'extrait BMCI, choisis ENSEMBLE dans le même import,
// portent le même instant d'import. Le garde-fou « même relevé » les croyait issus du même
// document et refusait de les comparer — tous les doublons entre les deux passaient.
describe('marquerDoublons — relevé et extrait importés ensemble', () => {
  const D = (key, date, amount, label, releve_url) =>
    ({ key, ligne_date: date, amount, label, releve_url, created_at: '2026-08-01T10:00:00' })

  it('fusionne la même opération vue dans le relevé et dans l\'extrait', () => {
    const out = marquerDoublons([
      D('a', '2026-07-15', 1500, 'VIRT RECU ASS.SPORTIVE DES FAR RABA', 'releves/1.pdf'),
      D('b', '2026-07-15', 1500, 'VIRT RECU ASS.SPORTIVE DES FAR', 'releves/2.pdf'),
    ])
    expect(out).toHaveLength(1)
  })

  it('garde deux opérations réelles du MÊME document', () => {
    const out = marquerDoublons([
      D('a', '2026-07-15', 1500, 'VIRT RECU ASS.SPORTIVE DES FAR RABA', 'releves/1.pdf'),
      D('b', '2026-07-15', 1500, 'VIRT RECU ASS.SPORTIVE DES FAR', 'releves/1.pdf'),
    ])
    expect(out).toHaveLength(2)
  })

  it('sans PDF connu, garde le repli sur l\'instant d\'import', () => {
    const out = marquerDoublons([
      D('a', '2026-07-15', 1500, 'VIRT RECU ASS.SPORTIVE DES FAR RABA', null),
      D('b', '2026-07-15', 1500, 'VIRT RECU ASS.SPORTIVE DES FAR', null),
    ])
    expect(out).toHaveLength(2)
  })
})
