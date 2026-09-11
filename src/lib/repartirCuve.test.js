// La cuve ne se divise pas : on monte des 23 cm, ce qui reste finit en 18 cm
// et en individuels. Chaque taille porte alors SA part de crème — et l'écart
// retombe sur la taille lancée.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { repartirCuve } from './fabAnnexe'

afterEach(() => vi.unstubAllGlobals())

const repond = (ok, corps) => vi.stubGlobal('fetch', vi.fn(async () => ({
  ok, status: ok ? 200 : 500, json: async () => corps,
})))

describe('repartirCuve', () => {
  it('envoie la taille lancée ET les autres', async () => {
    repond(true, { ordres: [{ produit: 'SM- Tarte citron gin 23 cm', qty: 10, lance: true }] })
    await repartirCuve('SM- Tarte citron gin 23 cm', {
      'SM- Tarte citron gin 23 cm': 10, 'SM- Tarte citron gin 18 cm': 4,
    })
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('mode=repartir')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({
      lance: 'SM- Tarte citron gin 23 cm',
      quantites: { 'SM- Tarte citron gin 23 cm': 10, 'SM- Tarte citron gin 18 cm': 4 },
    })
  })

  it('rend les ordres, chacun avec sa part de cuve', async () => {
    repond(true, { ordres: [
      { produit: 'SM- Tarte citron gin 23 cm', qty: 10, ajustements: { 'MP- Beurre entremets': 1800 }, lance: true },
      { produit: 'SM- Tarte citron gin 18 cm', qty: 4, ajustements: { 'MP- Beurre entremets': 400 } },
    ] })
    const o = await repartirCuve('SM- Tarte citron gin 23 cm', {})
    expect(o.length).toBe(2)
    expect(o[1].ajustements['MP- Beurre entremets']).toBe(400)
  })

  it('ne laisse pas passer une erreur en silence', async () => {
    repond(false, {})
    await expect(repartirCuve('x', {})).rejects.toThrow(/Répartition impossible/)
    repond(true, { error: 'article inconnu : x' })
    await expect(repartirCuve('x', {})).rejects.toThrow(/article inconnu/)
  })
})
