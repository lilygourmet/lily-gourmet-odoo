import { describe, it, expect } from 'vitest'
import { controleLecture } from './releveBmci'

// Un relevé se vérifie comme un compte : ancien solde + entrées − sorties = nouveau solde.
// C'est la seule preuve que la lecture du PDF est complète, et elle se lit dans le relevé
// lui-même — sans dépendre du nom des clientes ni de ce que l'app a enregistré avant.
const solde = (label, montant) => ({ label, type: 'solde', credit: montant, debit: null })
const recu = (montant) => ({ label: 'VIR INST RECU X', type: 'virement_recu', credit: montant, debit: null })
const sorti = (montant) => ({ label: 'VIR EMIS Y', type: 'virement_emis', credit: null, debit: montant })

describe('controleLecture', () => {
  it('confirme une lecture complète', () => {
    const r = controleLecture([
      solde('ANCIEN SOLDE AU 30/04/2026', 10000),
      recu(500), recu(300), sorti(200),
      solde('NOUVEAU SOLDE AU 31/05/2026', 10600),
    ])
    expect(r.possible).toBe(true)
    expect(r.ok).toBe(true)
    expect(r.credits).toBe(800)
    expect(r.debits).toBe(200)
    expect(r.nbCredits).toBe(2)
  })

  it('chiffre ce qui manque quand une ligne n’a pas été lue', () => {
    const r = controleLecture([
      solde('ANCIEN SOLDE', 10000),
      recu(500),                       // la banque en a reçu 800 : 300 dh n'ont pas été lus
      solde('NOUVEAU SOLDE', 10800),
    ])
    expect(r.ok).toBe(false)
    expect(r.ecart).toBe(300)
  })

  it('tolère l’arrondi de la banque, pas une ligne oubliée', () => {
    expect(controleLecture([solde('ANCIEN SOLDE', 0), recu(100.2), solde('NOUVEAU SOLDE', 100)]).ok).toBe(true)
    expect(controleLecture([solde('ANCIEN SOLDE', 0), recu(100), solde('NOUVEAU SOLDE', 101)]).ok).toBe(false)
  })

  it('reconnaît les mots des trois formats de relevé', () => {
    expect(controleLecture([solde('SOLDE PRECEDENT', 0), recu(50), solde('SOLDE AU 31/05/2026', 50)]).ok).toBe(true)
    expect(controleLecture([solde('SOLDE DEPART AU 01/05', 0), recu(50), solde('SOLDE FIN', 50)]).ok).toBe(true)
  })

  it('ne conclut RIEN quand les soldes sont absents', () => {
    const r = controleLecture([recu(500), recu(300)])
    expect(r.possible).toBe(false)
  })

  it('prend le DERNIER nouveau solde quand le relevé en imprime un par page', () => {
    const r = controleLecture([
      solde('ANCIEN SOLDE', 0), recu(100),
      solde('NOUVEAU SOLDE AU 15/05/2026', 100), recu(400),
      solde('NOUVEAU SOLDE AU 31/05/2026', 500),
    ])
    expect(r.ok).toBe(true)
  })
})
