import { describe, it, expect } from 'vitest'
import { reconcileEnvelopes } from './releveBmci'

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
  const remiseMars = { credit: 364, dateIso: '2026-03-17', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 46264440' }
  const remiseFev  = { credit: 364, dateIso: '2026-02-05', type: 'cheque_depot', label: 'REMISE CHEQUE A ENC 45888840' }

  it('ne valide plus tout seul une remise à plus de 45 jours', () => {
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
