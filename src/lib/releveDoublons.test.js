import { describe, it, expect } from 'vitest'
import { nomDeLigne, similarite, marquerDoublons, signatureDepot, memeDepotSansNumero, memeOperation } from './releveDoublons'

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
      L('b', '2026-06-07', 376, 'VIRT RECU MME SELMA BENNOMAR', '2026-07-21T12:16:56'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].doublon_probable.date).toBe('2026-06-07')
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

// Une même opération s'écrit différemment selon le document : avec ou sans n°, tronquée,
// à la date d'opération ou de valeur. memeOperation tranche pour les deux comparaisons
// (lignes libres entre elles, et ligne libre contre ce qui est déjà rapproché).
describe('memeOperation', () => {
  // Cas vécu : la caisse est rapprochée au libellé court, l'autre document l'écrit en long.
  const court = { amount: 1320, ligne_date: '2026-07-26', label: 'VIR INST RECU BENGELLOUN MIA' }
  const long = { amount: 1320, ligne_date: '2026-07-26',
    label: 'VIR INST RECU 2359145 894406175674 02220260726894406175674 BENGELLOUN MIA 022013MAD00000120260727894406175674' }

  it('reconnaît le même client quand un seul libellé porte un n°', () => {
    expect(memeOperation(court, long)).toBe(true)
  })

  it('exige le même jour DANS un même document', () => {
    const a = { ...court, releve_url: 'releves/juillet.pdf' }
    const b = { ...long, ligne_date: '2026-07-27', releve_url: 'releves/juillet.pdf' }
    expect(memeOperation(a, b)).toBe(false)
  })

  // Une caisse rapprochée de longue date n'a gardé aucun PDF : on ne peut pas savoir si
  // les deux lignes viennent du même document, et les dates ne sont donc pas comparables.
  it('tolère 3 jours quand le document est inconnu', () => {
    expect(memeOperation(court, { ...long, ligne_date: '2026-07-29' })).toBe(true)
  })

  it('refuse deux clients différents du même montant le même jour', () => {
    expect(memeOperation(court, { ...long, label: 'VIR INST RECU 2359145 OUKHADDA AYA' })).toBe(false)
  })

  // Le n° prime : les deux documents datent la même opération différemment.
  it('reconnaît le même n° malgré des dates différentes', () => {
    const a = { amount: 5834, ligne_date: '2026-04-30', label: 'VERSEMENT ESPECE N° 1630293611' }
    const b = { amount: 5834, ligne_date: '2026-05-04', label: 'VERSEMENT ESPECE N 1630293611' }
    expect(memeOperation(a, b)).toBe(true)
  })

  // Corrigé après lecture du relevé papier : ce jour-là il n'y a qu'UN virement de 392 dh
  // de FARHANE HAJAR. Les deux libellés viennent du lecteur de PDF, qui a rattaché à cette
  // opération des références appartenant à sa voisine. Le nom, lui, est fiable.
  it('reconnaît un seul virement derrière deux n° différents, même client et même jour', () => {
    const a = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2321144 215469570 FARHANE HAJAR' }
    const b = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2324371 706376617404 FARHANE HAJAR' }
    expect(memeOperation(a, b)).toBe(true)
  })

  it('sépare deux clients différents, même montant et même jour', () => {
    const a = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2321144 FARHANE HAJAR' }
    const b = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2324371 OUKHADDA AYA' }
    expect(memeOperation(a, b)).toBe(false)
  })

  it('sépare deux jours différents du même document, même client', () => {
    const a = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2321144 FARHANE HAJAR', releve_url: 'releves/juillet.pdf' }
    const b = { amount: 392, ligne_date: '2026-07-18', label: 'VIR INST RECU 2324371 FARHANE HAJAR', releve_url: 'releves/juillet.pdf' }
    expect(memeOperation(a, b)).toBe(false)
  })

  it('refuse au-delà de 3 jours, document inconnu', () => {
    const a = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2321144 FARHANE HAJAR' }
    const b = { amount: 392, ligne_date: '2026-07-22', label: 'VIR INST RECU 2324371 FARHANE HAJAR' }
    expect(memeOperation(a, b)).toBe(false)
  })

  it('sans nom lisible, deux n° qui se contredisent restent deux opérations', () => {
    const a = { amount: 200, ligne_date: '2026-07-29', label: 'VIR INST RECU 2376336 260729308078' }
    const b = { amount: 200, ligne_date: '2026-07-29', label: 'VIR INST RECU 2378161 682183838646' }
    expect(memeOperation(a, b)).toBe(false)
  })

  it('reconnaît le libellé tronqué par l\'extrait', () => {
    const a = { amount: 1500, ligne_date: '2026-07-15', label: 'VIRT RECU ASS.SPORTIVE DES FAR RABA' }
    const b = { amount: 1500, ligne_date: '2026-07-15', label: 'VIRT RECU ASS.SPORTIVE DES FAR' }
    expect(memeOperation(a, b)).toBe(true)
  })

  it('refuse un montant différent d\'un dirham', () => {
    expect(memeOperation(court, { ...long, amount: 1321 })).toBe(false)
  })
})

// Cas vécu (3 776 dh du 24/08) : la même remise de chèques, vue dans l'extrait et dans le
// relevé, ne porte PAS le même n° après « A ENC ». Seuls le montant et le jour l'identifient.
describe('remise de chèques — le n° change d\'un document à l\'autre', () => {
  const a = { amount: 3776, ligne_date: '2026-08-24', label: 'REMISE CHEQUE A ENC 47729339' }
  const b = { amount: 3776, ligne_date: '2026-08-24', label: 'REMISE CHEQUE A ENC 47729338' }

  it('reconnaît la même remise malgré deux n° différents', () => {
    expect(memeOperation(a, b)).toBe(true)
  })

  it('sépare deux remises de jours différents', () => {
    expect(memeOperation(a, { ...b, ligne_date: '2026-08-25' })).toBe(false)
  })

  it('sépare deux remises de montants différents', () => {
    expect(memeOperation(a, { ...b, amount: 3780 })).toBe(false)
  })

  it('ne touche pas aux virements de clients différents', () => {
    const v1 = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2321144 215469570 FARHANE HAJAR' }
    const v2 = { amount: 392, ligne_date: '2026-07-17', label: 'VIR INST RECU 2324371 706376617404 OUKHADDA AYA' }
    expect(memeOperation(v1, v2)).toBe(false)
  })

  it('fusionne aussi les deux lignes libres correspondantes', () => {
    const out = marquerDoublons([
      { key: 'x', ligne_date: '2026-08-24', amount: 3776, label: 'REMISE CHEQUE A ENC 47729339', releve_url: 'releves/1.pdf' },
      { key: 'y', ligne_date: '2026-08-24', amount: 3776, label: 'REMISE CHEQUE A ENC 47729338', releve_url: 'releves/2.pdf' },
    ])
    expect(out).toHaveLength(1)
  })
})

// Deux remises du même montant le même jour dans le MÊME fichier sont deux remises réelles :
// la tolérance ne vaut qu'ENTRE l'extrait et le relevé.
describe('remise de chèques — seulement entre deux fichiers', () => {
  const a = { amount: 3776, ligne_date: '2026-08-24', label: 'REMISE CHEQUE A ENC 47729339', releve_url: 'releves/1.pdf' }

  it('fusionne entre deux documents différents', () => {
    expect(memeOperation(a, { ...a, label: 'REMISE CHEQUE A ENC 47729338', releve_url: 'releves/2.pdf' })).toBe(true)
  })

  it('garde deux remises du MÊME document', () => {
    expect(memeOperation(a, { ...a, label: 'REMISE CHEQUE A ENC 47729338', releve_url: 'releves/1.pdf' })).toBe(false)
  })

  it('fusionne quand le document est inconnu d\'un côté', () => {
    expect(memeOperation(a, { ...a, label: 'REMISE CHEQUE A ENC 47729338', releve_url: null })).toBe(true)
  })
})

// Le n° identique prime sur tout : c'est la même opération, même dans un seul fichier.
describe('remise de chèques — le même n° reste décisif', () => {
  const a = { amount: 3776, ligne_date: '2026-08-24', label: 'REMISE CHEQUE A ENC 47729339', releve_url: 'releves/1.pdf' }

  it('fusionne deux remises au MÊME n°, même document', () => {
    expect(memeOperation(a, { ...a })).toBe(true)
  })

  it('fusionne deux remises au MÊME n° malgré des dates différentes', () => {
    expect(memeOperation(a, { ...a, ligne_date: '2026-08-26', releve_url: 'releves/2.pdf' })).toBe(true)
  })
})

// La fausse ligne fabriquée par le lecteur de PDF vient du MÊME fichier que la vraie :
// le garde-fou « deux lignes d'un même document sont deux opérations réelles » ne doit pas
// empêcher de les fusionner quand le nom du client, le montant et le jour concordent.
describe('marquerDoublons — jumeau fabriqué dans le même PDF', () => {
  const D = (key, label) => ({
    key, ligne_date: '2026-07-17', amount: 392, label,
    releve_url: 'releves/juillet.pdf', created_at: '2026-08-01T10:00:00',
  })

  it('fusionne les deux libellés du même virement', () => {
    const out = marquerDoublons([
      D('a', 'VIR INST RECU 2321144 215469570/1XXXXX FARHANE HAJAR'),
      D('b', 'VIR INST RECU 2324371 706376617404 00720260717706376617404 FARHANE HAJAR'),
    ])
    expect(out).toHaveLength(1)
  })

  it('garde deux clients différents du même fichier', () => {
    const out = marquerDoublons([
      D('a', 'VIR INST RECU 2321144 FARHANE HAJAR'),
      D('b', 'VIR INST RECU 2324371 OUKHADDA AYA'),
    ])
    expect(out).toHaveLength(2)
  })

  it('garde deux remises de chèques du même fichier (aucun nom pour trancher)', () => {
    const out = marquerDoublons([
      { ...D('a', 'REMISE CHEQUE A ENC 47729339'), amount: 3776 },
      { ...D('b', 'REMISE CHEQUE A ENC 47729338'), amount: 3776 },
    ])
    expect(out).toHaveLength(2)
  })
})

// L'extrait et le relevé ne datent pas une opération pareil : le même virement de 500 dh
// de TAZI NYBELE est daté du 14/07 sur l'extrait et du 17/07 sur le relevé. Exiger le même
// jour empêchait de reconnaître la ligne dont la jumelle est déjà rattachée à une caisse.
describe('memeOperation — extrait et relevé datent différemment', () => {
  const extrait = { amount: 500, ligne_date: '2026-07-14', label: 'VIR INST RECU TAZI NYBELE', releve_url: 'releves/extrait.pdf' }
  const releve = { amount: 500, ligne_date: '2026-07-17', label: 'VIR INST RECU TAZI NYBELE 2320471 260717385317', releve_url: 'releves/releve.pdf' }

  it('reconnaît la même opération à 3 jours entre deux documents', () => {
    expect(memeOperation(extrait, releve)).toBe(true)
  })

  it('refuse au-delà de 3 jours', () => {
    expect(memeOperation(extrait, { ...releve, ligne_date: '2026-07-19' })).toBe(false)
  })

  it('exige le même jour à l\'intérieur d\'un même document', () => {
    expect(memeOperation(extrait, { ...releve, releve_url: 'releves/extrait.pdf' })).toBe(false)
  })

  it('refuse deux clients différents, même à 1 jour', () => {
    expect(memeOperation(extrait, { ...releve, ligne_date: '2026-07-15', label: 'VIR INST RECU OUKHADDA AYA' })).toBe(false)
  })
})

// Vécu : le même virement CITIBANK de 3 150 dh, vu le 11/05 sur le relevé BMCI (avec sa
// référence) et le 12/05 sur le relevé scanné (sans). Même nom de client mot pour mot :
// l'app le signalait en « doublon probable » et attendait un clic, sur des dizaines de cas.
describe('marquerDoublons — même nom exact à un jour d\'écart', () => {
  const L2 = (key, date, label, url) =>
    ({ key, ligne_date: date, amount: 3150, label, releve_url: url, created_at: '2026-06-01T10:00:00' })

  it('fusionne le même client écrit avec et sans sa référence', () => {
    const out = marquerDoublons([
      L2('a', '2026-05-11', 'VIRT RECU CITIBANK 2012323926 EUROPE PLC FI', 'releves/bmci.pdf'),
      L2('b', '2026-05-12', 'VIRT RECU CITIBANK EUROPE PLC', 'releves/scan.pdf'),
    ])
    expect(out).toHaveLength(1)
  })

  it('laisse en « probable » une orthographe proche à plus d\'un jour', () => {
    const out = marquerDoublons([
      L2('a', '2026-05-11', 'VIRT RECU MME SELMA BENOMAR', 'releves/bmci.pdf'),
      L2('b', '2026-05-13', 'VIRT RECU MME SELMA BENNOMAR', 'releves/scan.pdf'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].doublon_probable).toBeTruthy()
  })

  it('garde deux clients différents du même montant', () => {
    const out = marquerDoublons([
      L2('a', '2026-05-11', 'VIRT RECU CITIBANK EUROPE PLC', 'releves/bmci.pdf'),
      L2('b', '2026-05-12', 'VIRT RECU NOVACTUS MAROC', 'releves/scan.pdf'),
    ])
    expect(out).toHaveLength(2)
  })
})

// Orthographe proche mais dates voisines : c'est le même client, l'app fusionne sans
// demander. Au-delà d'un jour, le doute porte sur deux choses à la fois — elle signale.
describe('marquerDoublons — orthographe proche à un jour', () => {
  const L3 = (key, date, label) => ({
    key, ligne_date: date, amount: 376, label,
    releve_url: `releves/${key}.pdf`, created_at: '2026-07-01T10:00:00',
  })

  it('fusionne à un jour d\'écart', () => {
    const out = marquerDoublons([
      L3('a', '2026-06-05', 'VIRT RECU MME SELMA BENOMAR'),
      L3('b', '2026-06-06', 'VIRT RECU MME SELMA BENNOMAR'),
    ])
    expect(out).toHaveLength(1)
  })

  it('signale seulement à deux jours d\'écart', () => {
    const out = marquerDoublons([
      L3('a', '2026-06-05', 'VIRT RECU MME SELMA BENOMAR'),
      L3('b', '2026-06-07', 'VIRT RECU MME SELMA BENNOMAR'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].doublon_probable).toBeTruthy()
  })

  it('garde deux noms vraiment différents à un jour d\'écart', () => {
    const out = marquerDoublons([
      L3('a', '2026-06-05', 'VIRT RECU MME SELMA BENOMAR'),
      L3('b', '2026-06-06', 'VIRT RECU MR OMAR TAZI'),
    ])
    expect(out).toHaveLength(2)
  })
})
