// @vitest-environment jsdom
// ============================================================
// « Recharge toutes les pages maintenant de tout le monde » (Layla,
// 2026-09-23). Le 23/09, « À finir » a rejoué un bug corrigé la veille : l'écran
// tournait encore sur l'ancien code, parce que la bannière ne faisait que
// PROPOSER la mise à jour.
//
// Ce fichier garde la règle du rechargement automatique — et surtout ses deux
// garde-fous : ne jamais couper une saisie, ne jamais boucler.
// ============================================================
import { describe, it, expect } from 'vitest'
import { decisionMaj } from './autoUpdate'

const AVANT = '/assets/main-AAAA1111.js'
const APRES = '/assets/main-BBBB2222.js'

describe('decisionMaj', () => {
  it('ne fait rien quand on est déjà sur la version servie', () => {
    expect(decisionMaj({ charge: AVANT, servi: AVANT })).toBe('rien')
  })

  it('recharge tout de suite quand une nouvelle version est en ligne', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES })).toBe('recharger')
  })

  it('NE COUPE PAS quelqu’un en train de taper — la bannière prend le relais', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES, enTrainDeTaper: true }))
      .toBe('banniere')
  })

  it('ne recharge qu’une fois par version : pas de boucle', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES, dejaRecharge: APRES }))
      .toBe('banniere')
  })

  it('mais une version ENCORE plus récente a droit à son rechargement', () => {
    expect(decisionMaj({ charge: AVANT, servi: '/assets/main-CCCC3333.js', dejaRecharge: APRES }))
      .toBe('recharger')
  })

  it('sans nom de bundle lisible, on ne touche à rien', () => {
    expect(decisionMaj({ charge: null, servi: APRES })).toBe('rien')
    expect(decisionMaj({ charge: AVANT, servi: null })).toBe('rien')
  })
})
