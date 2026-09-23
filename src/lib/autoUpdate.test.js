// @vitest-environment jsdom
// ============================================================
// « Recharge tout le matin au démarrage et après avec bannière » (Layla,
// 2026-09-23). Le 23/09, « À finir » a rejoué un bug corrigé la veille : l'écran
// tournait encore sur l'ancien code, parce que la bannière ne faisait que
// PROPOSER la mise à jour. Mais recharger à toute heure couperait l'atelier au
// milieu d'une fournée : la journée démarre sur du neuf, ensuite on propose.
//
// Ce fichier garde la règle — et surtout ses deux garde-fous : ne jamais couper
// une saisie, ne jamais recharger deux fois dans la journée.
// ============================================================
import { describe, it, expect } from 'vitest'
import { decisionMaj } from './autoUpdate'

const AVANT = '/assets/main-AAAA1111.js'
const APRES = '/assets/main-BBBB2222.js'

describe('decisionMaj', () => {
  it('ne fait rien quand on est déjà sur la version servie', () => {
    expect(decisionMaj({ charge: AVANT, servi: AVANT })).toBe('rien')
  })

  it('recharge au premier démarrage de la journée', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES, jour: '2026-09-24' }))
      .toBe('recharger')
  })

  it('NE COUPE PAS quelqu’un en train de taper — la bannière prend le relais', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES, enTrainDeTaper: true }))
      .toBe('banniere')
  })

  it('APRÈS le rechargement du matin, on ne fait que proposer', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES,
      jour: '2026-09-24', dernierJour: '2026-09-24' })).toBe('banniere')
  })

  it('même une DEUXIÈME version dans la journée ne coupe pas l’atelier', () => {
    expect(decisionMaj({ charge: AVANT, servi: '/assets/main-CCCC3333.js',
      jour: '2026-09-24', dernierJour: '2026-09-24' })).toBe('banniere')
  })

  it('le lendemain matin, on repart sur du neuf', () => {
    expect(decisionMaj({ charge: AVANT, servi: APRES,
      jour: '2026-09-25', dernierJour: '2026-09-24' })).toBe('recharger')
  })

  it('sans nom de bundle lisible, on ne touche à rien', () => {
    expect(decisionMaj({ charge: null, servi: APRES })).toBe('rien')
    expect(decisionMaj({ charge: AVANT, servi: null })).toBe('rien')
  })
})
