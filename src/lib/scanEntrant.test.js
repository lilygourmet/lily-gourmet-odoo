// @vitest-environment jsdom
// ============================================================
// LE SCAN SURVIT-IL AU NETTOYAGE D'ADRESSE ?
//
// C'était LE bug de Layla (2026-09-20) : « scanne pour déclarer n'emmène pas
// vers l'article direct, ça emmène vers tous les articles à faire ».
//
// Au démarrage, `App.jsx` range l'onglet dans l'adresse
// (`replaceState('?view=…')`) et emportait avec lui le `?article=` du QR.
// L'écran de fabrication, chargé à la demande, arrivait APRÈS et ne trouvait
// plus rien. Ce test rejoue exactement cet ordre-là.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest'

/** Charge le module comme au premier instant, à une adresse donnée. */
const demarrerA = async (search) => {
  window.history.replaceState({}, '', search)
  vi.resetModules()
  return import('./scanEntrant')
}

beforeEach(() => { vi.resetModules() })

describe('ce que le QR demandait', () => {
  it('survit à l’adresse effacée juste après', async () => {
    const m = await demarrerA('/?view=fabrication-annexe-2&article=SM.%20Creme&declarer=1')

    // ⚠️ L'app range son onglet — et emporte le reste. C'est le geste qui
    // cassait tout.
    window.history.replaceState({}, '', '?view=fabrication-annexe-2')
    expect(window.location.search).not.toMatch(/article/)

    // L'écran arrive maintenant, bien après : il doit quand même savoir.
    expect(m.prendreLeScan()).toEqual({ article: 'SM. Creme', declarer: true })
  })

  it('ne se sert qu’UNE fois', async () => {
    const m = await demarrerA('/?article=SM.%20Creme&declarer=1')
    expect(m.prendreLeScan()).toBeTruthy()
    // Revenir sur l'écran plus tard ne doit pas rouvrir la déclaration.
    expect(m.prendreLeScan()).toBeNull()
  })

  it('ne demande rien quand on arrive normalement', async () => {
    const m = await demarrerA('/?view=fabrication-annexe-2')
    expect(m.prendreLeScan()).toBeNull()
  })

  it('ouvre l’article sans déclarer quand le QR ne le demande pas', async () => {
    const m = await demarrerA('/?article=SM.%20Creme')
    expect(m.prendreLeScan()).toEqual({ article: 'SM. Creme', declarer: false })
  })

  it('« À déclarer » peut poser sa demande sans passer par l’adresse', async () => {
    const m = await demarrerA('/?view=a-declarer')
    m.poserLeScan({ article: 'SM. Fond', declarer: true })
    expect(m.prendreLeScan()).toEqual({ article: 'SM. Fond', declarer: true })
    expect(m.prendreLeScan()).toBeNull()
  })
})
