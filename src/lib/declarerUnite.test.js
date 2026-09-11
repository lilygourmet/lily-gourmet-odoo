// « Pourquoi le poids final n'est pas le bon ? » (Layla, 2026-09-11).
//
// L'ordre WHPDX/MO/21427 disait 14,33 g de crème citron gingembre là où il
// fallait 14 328 g — mille fois trop peu — alors que les ingrédients consommés
// étaient justes (deux recettes entières). L'article se compte en KILOS chez
// Odoo, sa recette sort des GRAMMES : c'est ce mélange qui s'est perdu en
// route. Une seule convention voyage maintenant : des grammes, ou des pièces.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const addFabProd = vi.fn(async () => ({ id: 1 }))
const creerOfPrepa = vi.fn(async () => ({ name: 'WHPDX/MO/1' }))

vi.mock('./fabricationProd', () => ({
  addFabProd: (...a) => addFabProd(...a),
  rattacherOrdre: async () => {},
  loadFabProdDepuis: async () => [],
  loadNoms: async () => ({}),
}))
vi.mock('./fabrication', () => ({ creerOfPrepa: (...a) => creerOfPrepa(...a) }))

const { declarer } = await import('./fabAnnexe')
const attendre = () => new Promise(r => setTimeout(r, 0))
beforeEach(() => { creerOfPrepa.mockClear(); addFabProd.mockClear() })

describe('ce qui part chez Odoo', () => {
  it('un article compté en KILOS part en grammes', async () => {
    await declarer({ produit: 'SM. creme citron gingembre', qty: 14.328, unite: 'kg' }, 'u1')
    await attendre()
    const [, qty, , , unite] = creerOfPrepa.mock.calls[0]
    expect(qty).toBe(14328)
    expect(unite).toBe('g')
  })

  it('un article compté en grammes ne bouge pas', async () => {
    await declarer({ produit: 'SM. Ganache Gold', qty: 2700, unite: 'g' }, 'u1')
    await attendre()
    const [, qty, , , unite] = creerOfPrepa.mock.calls[0]
    expect(qty).toBe(2700)
    expect(unite).toBe('g')
  })

  it('des pièces restent des pièces', async () => {
    await declarer({ produit: 'SM- Tarte citron gin 23 cm', qty: 18, unite: 'u' }, 'u1')
    await attendre()
    const [, qty, , , unite] = creerOfPrepa.mock.calls[0]
    expect(qty).toBe(18)
    expect(unite).toBe('u')
  })

  it('le JOURNAL, lui, garde l’unité de l’article', async () => {
    await declarer({ produit: 'SM. creme citron gingembre', qty: 14.328, unite: 'kg' }, 'u1')
    const args = addFabProd.mock.calls[0]
    expect(args[2]).toBe(14.328)
    expect(args[3]).toBe('kg')
  })
})
