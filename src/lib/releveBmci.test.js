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
