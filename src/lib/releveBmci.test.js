import { describe, it, expect } from 'vitest'
import { reconcileEnvelopes, parseBmciReleve } from './releveBmci'

// Une enveloppe déjà justifiée par une PREUVE PHOTO manuelle (proof_url sans
// releve_status) ne doit pas être re-rapprochée à l'import du relevé, et son
// dépôt doit être « réservé » pour ne pas être proposé à une autre enveloppe.
describe('reconcileEnvelopes — anti-doublon preuve photo', () => {
  const ligne500 = { credit: 500, dateIso: '2026-06-11', label: 'VIR INST RECU CLIENT X', type: 'virement_recu' }

  const envPhoto = {
    id: 'A', amount_cash: 500, amount_proof: 500, payment_method: 'virement',
    releve_status: null, proof_url: 'photo.jpg', proof_date: '2026-06-10',
    session_date: '2026-06-09', virement_client: 'Client X',
  }
  const envPending = {
    id: 'B', amount_cash: 500, payment_method: 'virement',
    releve_status: null, proof_url: null,
    session_date: '2026-06-09', virement_client: 'Client X',
  }

  it("n'ajoute pas l'enveloppe à preuve photo dans les résultats", () => {
    const { results } = reconcileEnvelopes([envPhoto], [ligne500], {})
    expect(results.find(r => r.env.id === 'A')).toBeUndefined()
  })

  it('réserve le dépôt : il ne part pas dans les lignes non liées', () => {
    const { unmatched } = reconcileEnvelopes([envPhoto], [ligne500], {})
    expect(unmatched).toHaveLength(0)
  })

  it("ne propose pas le dépôt réservé à une autre enveloppe du même montant", () => {
    const { results } = reconcileEnvelopes([envPhoto, envPending], [ligne500], {})
    const b = results.find(r => r.env.id === 'B')
    expect(b.status).toBe('absent')   // la seule ligne 500 est prise par la preuve photo
  })

  it('sans preuve photo, la même enveloppe se rapproche normalement', () => {
    const { results } = reconcileEnvelopes([{ ...envPhoto, proof_url: null, amount_proof: undefined }], [ligne500], {})
    const a = results.find(r => r.env.id === 'A')
    expect(a.status).toBe('trouve')
  })
})

// Ré-import d'un relevé qui recouvre une période DÉJÀ rapprochée : la même opération y
// est écrite autrement selon le format de la banque. Elle doit rester reconnue comme
// prise, sinon elle repart dans « à lier » (cas du 07/08 : 175 fausses lignes).
describe('reconcileEnvelopes — ré-import, libellé écrit autrement', () => {
  // Ce que le 2e relevé imprime : mêmes date et montant, libellé plus détaillé.
  const ligne883 = {
    credit: 883, dateIso: '2026-05-11', type: 'virement_recu',
    label: 'VIR INST RECU MLE 2027184 000010999370 SAMIA CHERKAOUI',
  }
  const envVerte = {
    id: 3363, amount_cash: 883, payment_method: 'virement',
    releve_status: 'trouve', session_date: '2026-05-11',
    note_proof: '2026-05-11 · VIR INST RECU MLE SAMIA CHERKA',
  }

  it('ne renvoie pas dans « à lier » un dépôt déjà rapproché', () => {
    const { unmatched } = reconcileEnvelopes([envVerte], [ligne883], {})
    expect(unmatched).toHaveLength(0)
  })

  it("ne propose pas ce dépôt à une autre enveloppe du même montant", () => {
    const autre = {
      id: 'C', amount_cash: 883, payment_method: 'virement',
      releve_status: null, session_date: '2026-05-11', virement_client: 'Samia Cherkaoui',
    }
    const { results } = reconcileEnvelopes([envVerte, autre], [ligne883], {})
    expect(results.find(r => r.env.id === 'C').status).toBe('absent')
  })
})

// Cas vécu (enveloppe 283) : un chèque du 15/01 de 364 dh a été validé en vert sur la
// remise du 17/03 — la seule de ce montant dans le relevé de mars, importé seul. La vraie
// remise (05/02) est arrivée à l'import suivant, mais l'app ne retouche jamais une
// enveloppe verte : la ligne du 05/02 est restée « non liée » pour toujours.
describe('reconcileEnvelopes — chèque encaissé longtemps après', () => {
  const envCheque = {
    id: 283, amount_cash: 364, payment_method: 'cheque',
    releve_status: null, proof_url: null, session_date: '2026-01-15',
  }
  const remiseMars = { credit: 364, dateIso: '2026-04-20', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 46264440' }
  const remiseFev  = { credit: 364, dateIso: '2026-02-05', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 45888840' }

  it('ne valide plus tout seul une remise à plus de 90 jours', () => {
    const { results } = reconcileEnvelopes([envCheque], [remiseMars], {})
    const r = results.find(x => x.env.id === 283)
    expect(r.status).toBe('a_confirmer')
    expect(r.candidates).toHaveLength(1)
  })

  it('valide toujours en vert une remise dans le délai normal', () => {
    const { results } = reconcileEnvelopes([envCheque], [remiseFev], {})
    expect(results.find(x => x.env.id === 283).status).toBe('trouve')
  })

  it('avec les deux remises dans le même fichier, laisse choisir', () => {
    const { results } = reconcileEnvelopes([envCheque], [remiseFev, remiseMars], {})
    expect(results.find(x => x.env.id === 283).status).toBe('a_confirmer')
  })

  it('un versement espèces tardif reste validé automatiquement', () => {
    const envCash = { ...envCheque, id: 'E', payment_method: 'cash' }
    const versement = { credit: 364, dateIso: '2026-03-17', type: 'versement', label: 'VERSEMENT ESPECES' }
    const { results } = reconcileEnvelopes([envCash], [versement], {})
    expect(results.find(x => x.env.id === 'E').status).toBe('trouve')
  })
})

// Remise de chèques splittée par la banque : une caisse est rattachée à PLUSIEURS lignes du
// relevé. Au ré-import, chacune doit rester « prise » — sinon elle repart dans « à lier »
// ou, pire, est proposée à une autre caisse du même montant.
describe('reconcileEnvelopes — remise splittée en plusieurs encaissements', () => {
  const l7000 = { credit: 7000, dateIso: '2026-08-12', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 46160271' }
  const l5000 = { credit: 5000, dateIso: '2026-08-14', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 46160272' }
  const envSplit = {
    id: 900, amount_cash: 12000, amount_proof: 12000, payment_method: 'cheque',
    releve_status: 'trouve', session_date: '2026-08-10',
    note_proof: '2026-08-12 · REMISE CHEQUE A ENC 46160271  |  2026-08-14 · REMISE CHEQUE A ENC 46160272',
  }

  it('ne renvoie aucune des 2 lignes dans « à lier »', () => {
    const { unmatched } = reconcileEnvelopes([envSplit], [l7000, l5000], {})
    expect(unmatched).toHaveLength(0)
  })

  it("ne propose pas un morceau de la remise à une autre caisse du même montant", () => {
    const autre = {
      id: 901, amount_cash: 7000, payment_method: 'cheque',
      releve_status: null, proof_url: null, session_date: '2026-08-11',
    }
    const { results } = reconcileEnvelopes([envSplit, autre], [l7000, l5000], {})
    expect(results.find(r => r.env.id === 901).status).toBe('absent')
  })

  it('une ligne du même jour au libellé différent reste libre', () => {
    const autreDepot = { credit: 3000, dateIso: '2026-08-12', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 99999999' }
    const { unmatched } = reconcileEnvelopes([envSplit], [l7000, l5000, autreDepot], {})
    expect(unmatched.map(u => u.credit)).toEqual([3000])
  })
})

// « 🔗 2 virements = 1 ligne » : la banque a reçu 2 virements en une seule opération. La
// ligne vaut la somme des 2 caisses — aucune ne fait son montant — et doit rester prise au
// ré-import, sinon elle est proposée à une autre caisse du total.
describe('reconcileEnvelopes — 2 virements = 1 ligne', () => {
  const ligne700 = { credit: 700, dateIso: '2026-06-16', type: 'virement_recu', label: 'VIR INST RECU MME NAJAT IDRISSI' }
  const note = '2026-06-16 · VIR INST RECU MME NAJAT IDRISSI · 🔗 2 virements = 1 ligne (total 700 dh)'
  const envA = { id: 'A700', amount_cash: 350, payment_method: 'virement', releve_status: 'trouve', session_date: '2026-06-15', note_proof: note }
  const envB = { id: 'B700', amount_cash: 350, payment_method: 'virement', releve_status: 'trouve', session_date: '2026-06-15', note_proof: note }

  it('ne renvoie pas la ligne dans « à lier »', () => {
    const { unmatched } = reconcileEnvelopes([envA, envB], [ligne700], {})
    expect(unmatched).toHaveLength(0)
  })

  it("ne propose pas la ligne à une autre caisse du montant total", () => {
    const autre = { id: 'C700', amount_cash: 700, payment_method: 'virement', releve_status: null, session_date: '2026-06-15', virement_client: 'Najat Idrissi' }
    const { results } = reconcileEnvelopes([envA, envB, autre], [ligne700], {})
    expect(results.find(r => r.env.id === 'C700').status).toBe('absent')
  })
})

// Cas vécu (juillet : 86 caisses « pas trouvées ») : une session Odoo à 14 795,60 dh face
// au versement bancaire de 14 796 dh. Au demi-centime près, le rapprochement automatique
// ne les reconnaissait pas — et la caisse restait grise, la ligne « non liée ».
describe('reconcileEnvelopes — centimes Odoo face au montant rond de la banque', () => {
  const versement = { credit: 14796, dateIso: '2026-07-31', type: 'versement', label: 'VERSEMENT ESPECE N 1866575621' }
  const envCentimes = {
    id: 'J1', amount_cash: 14795.60, payment_method: 'cash',
    releve_status: null, proof_url: null, session_date: '2026-07-11',
  }

  it('rapproche malgré les centimes', () => {
    const { results } = reconcileEnvelopes([envCentimes], [versement], {})
    expect(results.find(r => r.env.id === 'J1').status).toBe('trouve')
  })

  it('ne rapproche toujours pas un écart d\'un dirham entier', () => {
    const { results } = reconcileEnvelopes([{ ...envCentimes, amount_cash: 14795 }], [versement], {})
    expect(results.find(r => r.env.id === 'J1').status).toBe('absent')
  })
})

// Ici les chèques sont couramment encaissés bien après la vente : une remise à 47 jours
// (vente du 08/07, remise du 24/08) doit se valider seule, pas partir « à confirmer ».
describe('reconcileEnvelopes — chèque encaissé un mois et demi après', () => {
  const envCheque = {
    id: 776, amount_cash: 3776, payment_method: 'cheque',
    releve_status: null, proof_url: null, session_date: '2026-07-08',
  }
  const remise = { credit: 3776, dateIso: '2026-08-24', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 47729339' }

  it('valide seul une remise à 47 jours', () => {
    const { results } = reconcileEnvelopes([envCheque], [remise], {})
    expect(results.find(r => r.env.id === 776).status).toBe('trouve')
  })
})

// Page réelle d'un relevé BMCI (17/07/2026) : chaque virement porte un libellé de 5 lignes
// SOUS sa ligne de montant. La dernière ligne (« 215469570/1XXXXX ») est donc plus proche
// de l'opération SUIVANTE — et se retrouvait collée sur elle. Vécu : cette référence, qui
// termine le virement de CHRYSTEL AMELIE, est apparue sur celui de FARHANE HAJAR.
describe('parseBmciReleve — le libellé reste sur son opération', () => {
  const X = { dop: 50, det: 160, dv: 400, deb: 500, cre: 600 }
  const items = [
    { page: 1, y: 800, x: X.dop, str: 'Date op' },
    { page: 1, y: 800, x: X.det, str: 'Détails' },
    { page: 1, y: 800, x: X.dv, str: 'Date valeur' },
    { page: 1, y: 800, x: X.deb, str: 'Débit' },
    { page: 1, y: 800, x: X.cre, str: 'Crédit' },
  ]
  // 3 virements, chacun suivi de ses 5 lignes de références.
  const ops = [
    { y: 700, nom: 'VIR INST RECU CHRYSTEL AMELIE', montant: '400,00',
      refs: ['2322373', '000215469570', '05020260717000215469570', '050013MAD00000120260720000215', '215469570/1XXXXX'] },
    { y: 640, nom: 'VIR INST RECU YASMINA IMANI', montant: '1.000,00',
      refs: ['2322777', '000215480541', '05020260717000215480541', '050013MAD00000120260720000215', '215480541/1XXXXX'] },
    { y: 580, nom: 'VIR INST RECU ASMAE SAIR', montant: '500,00',
      refs: ['2322947', '260717107600', '23020260717260717107600', '230013MAD00000120260720260717', '20260717143512679411'] },
  ]
  for (const o of ops) {
    items.push({ page: 1, y: o.y, x: X.dop, str: '17/07/2026' })
    items.push({ page: 1, y: o.y, x: X.det, str: o.nom })
    items.push({ page: 1, y: o.y, x: X.dv, str: '17/07/2026' })
    items.push({ page: 1, y: o.y, x: X.cre, str: o.montant })
    o.refs.forEach((r, i) => items.push({ page: 1, y: o.y - 10 * (i + 1), x: X.det, str: r }))
  }
  const parsed = parseBmciReleve(items)
  const par = m => parsed.find(t => t.credit === m)

  it('lit les 3 virements', () => {
    expect(parsed.map(t => t.credit).sort((a, b) => a - b)).toEqual([400, 500, 1000])
  })

  it('garde la dernière référence sur SON virement', () => {
    expect(par(400).label).toContain('215469570/1XXXXX')
    expect(par(1000).label).not.toContain('215469570/1XXXXX')
  })

  it("ne prend pas les références du virement suivant", () => {
    expect(par(400).label).not.toContain('2322777')
    expect(par(1000).label).not.toContain('2322947')
  })

  it('garde le nom du client sur chaque virement', () => {
    expect(par(400).label).toContain('CHRYSTEL AMELIE')
    expect(par(1000).label).toContain('YASMINA IMANI')
    expect(par(500).label).toContain('ASMAE SAIR')
  })
})

// Protection anti-doublon du rapprochement : une caisse DÉJÀ verte réserve une ligne libre
// de même date et même montant, pour qu'un ré-import ne la propose pas deux fois. Mais
// quand on rejoue le calcul sur les seules lignes LIBRES (bouton « Relancer »), la caisse
// verte a déjà la sienne : elle vole celle d'une autre caisse. D'où le filtre appliqué dans
// relancerRapprochement — ce test en fixe la raison.
describe('reconcileEnvelopes — une caisse verte réserve une ligne libre', () => {
  const ligne = { credit: 392, dateIso: '2026-07-17', type: 'virement_recu', label: 'VIR INST RECU 2324371 FARHANE HAJAR' }
  const verte = {
    id: 'V', amount_cash: 392, payment_method: 'virement', releve_status: 'trouve',
    session_date: '2026-07-17', note_proof: '2026-07-17 · VIR INST RECU 2321144 FARHANE HAJAR',
  }
  const grise = {
    id: 'G', amount_cash: 392, payment_method: 'virement', releve_status: null,
    proof_url: null, session_date: '2026-07-17', virement_client: 'Hajar farhane',
  }

  it('affame la caisse grise quand la verte est dans le lot', () => {
    const { results } = reconcileEnvelopes([verte, grise], [ligne], {})
    expect(results.find(r => r.env.id === 'G').status).toBe('absent')
  })

  it('rapproche la caisse grise quand on ne passe que les caisses en attente', () => {
    const { results } = reconcileEnvelopes([grise], [ligne], {})
    expect(results.find(r => r.env.id === 'G').status).toBe('trouve')
  })
})

// Une cliente vire son acompte AVANT la commande. Tant que la fenêtre virement était
// de ±5 jours, la caisse restait invisible et la ligne bloquée dans « non liées ».
describe('reconcileEnvelopes — acompte viré avant la commande', () => {
  const ligne = { credit: 500, dateIso: '2026-07-14', type: 'virement_recu', label: 'VIR INST RECU TAZI NYBELE' }
  const caisse = {
    id: 'T1', amount_cash: 500, payment_method: 'virement',
    releve_status: null, session_date: '2026-07-21', virement_client: 'Nybele Tazi',
  }

  it('rapproche un virement reçu 7 jours avant la commande', () => {
    const { results } = reconcileEnvelopes([caisse], [ligne], {})
    expect(results[0].status).toBe('trouve')
    expect(results[0].line.dateIso).toBe('2026-07-14')
  })

  it('accepte jusqu\'à 14 jours avant', () => {
    const { results } = reconcileEnvelopes([{ ...caisse, session_date: '2026-07-28' }], [ligne], {})
    expect(results[0].status).toBe('trouve')
  })

  it('refuse au-delà de 14 jours', () => {
    const { results } = reconcileEnvelopes([{ ...caisse, session_date: '2026-07-30' }], [ligne], {})
    expect(results[0].status).toBe('absent')
  })

  it('reste à ±5 jours quand le libellé ne porte pas le nom', () => {
    const anonyme = { ...ligne, label: 'VIR INST RECU 2378161 682183838646' }
    const { results } = reconcileEnvelopes([{ ...caisse, virement_client: null }], [anonyme], {})
    expect(results[0].status).toBe('absent')
  })
})

// Odoo dit « Bennomar Salma », le relevé écrit « SELMA BENOMAR » : un N et une voyelle
// d'écart suffisaient à ce que l'app ne reconnaisse plus la cliente.
describe('reconcileEnvelopes — orthographe proche du nom de la cliente', () => {
  const ligne = { credit: 306, dateIso: '2026-07-17', type: 'virement_recu', label: 'VIRT RECU MME SELMA BENOMAR' }
  const caisse = {
    id: 'B1', amount_cash: 306, payment_method: 'virement',
    releve_status: null, session_date: '2026-07-16', virement_client: 'Bennomar Salma',
  }

  it('rapproche malgré les deux fautes d\'orthographe', () => {
    const { results } = reconcileEnvelopes([caisse], [ligne], {})
    expect(results[0].status).toBe('trouve')
  })

  it('ne rapproche pas une cliente vraiment différente', () => {
    const autre = { ...caisse, virement_client: 'Iraqi Yacout' }
    const { results } = reconcileEnvelopes([autre], [ligne], {})
    expect(results[0].status).toBe('absent')
  })
})
