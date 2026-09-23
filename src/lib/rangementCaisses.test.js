import { describe, it, expect } from 'vitest'

// Dans quelle liste tombe une caisse ? La règle vit dans loadEnveloppesForSuivi, qui parle
// à Supabase — on la reprend ici telle quelle pour la figer.
//
// Deux vécus qu'elle doit respecter :
//   - une caisse « à confirmer » reste EN ATTENTE : l'import lui a attaché le PDF du relevé
//     comme preuve, mais elle attend toujours un clic (elle passait pour versée) ;
//   - une caisse RAPPROCHÉE sort de la liste, même sans preuve : sa ligne peut venir de
//     « 🔎 Vérifier un relevé », qui relit le PDF sans le téléverser, donc sans URL.
//     Vécu : Zoubida El bousserghini, 1 000 dh du 4 juin, verte et pourtant « en attente ».
const aConfirmer = e => e.releve_status === 'a_confirmer'
const rapprochee = e => e.releve_status === 'trouve'
const estEnAttente = e => !!(!rapprochee(e) && (!e.proof_url || aConfirmer(e)) && !e.releve_ignore)
const estVersee = e => !!(rapprochee(e) || (e.proof_url && !aConfirmer(e)))

const RIEN = {}
const A_CONFIRMER = { releve_status: 'a_confirmer', proof_url: 'releves/juin.pdf' }
const VERTE_SANS_PREUVE = { releve_status: 'trouve', proof_url: null }
const VERTE_AVEC_PREUVE = { releve_status: 'trouve', proof_url: 'releves/juin.pdf' }
const PHOTO = { releve_status: null, proof_url: 'env_1/bordereau.jpg' }
const IGNOREE = { releve_ignore: true }

describe('rangement d’une caisse', () => {
  it('en attente : rien fait, ou « à confirmer »', () => {
    expect(estEnAttente(RIEN)).toBe(true)
    expect(estEnAttente(A_CONFIRMER)).toBe(true)
  })

  it('rapprochée : sortie de « en attente », même sans preuve', () => {
    expect(estEnAttente(VERTE_SANS_PREUVE)).toBe(false)
    expect(estVersee(VERTE_SANS_PREUVE)).toBe(true)
  })

  it('les deux listes ne se chevauchent jamais', () => {
    for (const e of [RIEN, A_CONFIRMER, VERTE_SANS_PREUVE, VERTE_AVEC_PREUVE, PHOTO]) {
      expect(estEnAttente(e) && estVersee(e)).toBe(false)
    }
  })

  it('une caisse ignorée n’est nulle part en attente', () => {
    expect(estEnAttente(IGNOREE)).toBe(false)
  })
})
