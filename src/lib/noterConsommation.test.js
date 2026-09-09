import { describe, it, expect, vi, afterEach } from 'vitest'
import { noterConsommation } from './fabrication'

// Le carnet de saisies, tel que le voient les deux écrans « À valider ».
function faussetteFetch(dejaGarde = {}) {
  const ecrit = []
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const corps = JSON.parse(opts.body)
    if (corps.valeurs) { ecrit.push(corps); return { ok: true, json: async () => ({}) } }
    return { ok: true, json: async () => ({ valeurs: dejaGarde }) }
  }))
  return ecrit
}

afterEach(() => vi.unstubAllGlobals())

describe('noterConsommation', () => {
  it('écrit en GRAMMES pour « À valider » CD quand la ligne d’Odoo est en kg', async () => {
    const ecrit = faussetteFetch()
    await noterConsommation('WHLVP/MO/123', [{ id: 7, qty: 1.59, unite: 'kg' }])
    expect(ecrit[0].cle).toBe('valider_saisies')
    expect(ecrit[0].valeurs.notes['WHLVP/MO/123']).toEqual({ 7: '1590' })
  })

  it('garde l’unité de la ligne pour l’annexe', async () => {
    const ecrit = faussetteFetch()
    await noterConsommation('WHPDX/MO/456', [{ id: 7, qty: 1.59, unite: 'kg' }])
    expect(ecrit[0].cle).toBe('valider_annexe_saisies')
    expect(ecrit[0].valeurs.notes['WHPDX/MO/456']).toEqual({ 7: '1.59' })
  })

  it('laisse les grammes tels quels', async () => {
    const ecrit = faussetteFetch()
    await noterConsommation('WHLVP/MO/123', [{ id: 9, qty: 1590, unite: 'g' }])
    expect(ecrit[0].valeurs.notes['WHLVP/MO/123']).toEqual({ 9: '1590' })
  })

  it('n’efface pas ce qu’un autre écran avait déjà noté', async () => {
    const ecrit = faussetteFetch({
      faites: { 'WHLVP/MO/999': 8 },
      notes: { 'WHLVP/MO/999': { 1: '10' }, 'WHLVP/MO/123': { 2: '20' } },
    })
    await noterConsommation('WHLVP/MO/123', [{ id: 7, qty: 300, unite: 'g' }])
    const v = ecrit[0].valeurs
    expect(v.faites).toEqual({ 'WHLVP/MO/999': 8 })
    expect(v.notes['WHLVP/MO/999']).toEqual({ 1: '10' })
    expect(v.notes['WHLVP/MO/123']).toEqual({ 2: '20', 7: '300' })
  })

  it('accepte zéro — « il ne reste rien, tout est passé »', async () => {
    const ecrit = faussetteFetch()
    await noterConsommation('WHLVP/MO/123', [{ id: 7, qty: 0, unite: 'g' }])
    expect(ecrit[0].valeurs.notes['WHLVP/MO/123']).toEqual({ 7: '0' })
  })
})
