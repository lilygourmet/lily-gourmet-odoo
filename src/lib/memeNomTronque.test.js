import { describe, it, expect } from 'vitest'
import { memeOperation } from './releveDoublons'

// Le relevé et l'extrait écrivent le MÊME virement différemment : le relevé intercale ses
// références et donne le nom en entier, l'extrait tronque. Sans règle pour ça, la version
// de l'extrait restait éternellement dans « Reçus banque non liés » alors que sa caisse
// était verte. Vécu : Andaloussi asmae, 330 dh du 20 juin.
const l = (label, amount, ligne_date, releve_url) => ({ label, amount, ligne_date, releve_url })

const RELEVE = l('VIR INST RECU IBN 2194929 212284886/1XXXXX ATTYA ANDALOUSSI', 330, '2026-06-20', 'releves/juin-releve.pdf')
const EXTRAIT = l('VIR INST RECU IBN ATTYA ANDALO', 330, '2026-06-20', 'releves/juin-extrait.pdf')

describe('memeOperation — nom tronqué par l’extrait', () => {
  it('reconnaît le virement d’Andaloussi vu dans les deux documents', () => {
    expect(memeOperation(RELEVE, EXTRAIT)).toBe(true)
  })

  it('ne rapproche pas deux clientes différentes du même montant le même jour', () => {
    const autre = l('VIR INST RECU MME SELMA BENOMAR', 330, '2026-06-20', 'releves/juin-extrait.pdf')
    expect(memeOperation(RELEVE, autre)).toBe(false)
  })

  it('n’accepte pas un seul mot commun comme preuve', () => {
    const court = l('VIR INST RECU ANDALO', 330, '2026-06-20', 'releves/juin-extrait.pdf')
    expect(memeOperation(RELEVE, court)).toBe(false)
  })
})
