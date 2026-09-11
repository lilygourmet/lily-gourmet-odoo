// « Marquer comme fait rame beaucoup, hyper lent » (Layla, 2026-09-11).
//
// Créer l'ordre chez Odoo demande sept allers-retours, et un montage en
// déclare deux d'un coup. Le travail de l'atelier, lui, tient dans une seule
// écriture : c'est elle qu'on attend, l'ordre part derrière.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const addFabProd = vi.fn(async () => ({ id: 7 }))
let resoudreOrdre
const creerOfPrepa = vi.fn(() => new Promise(r => { resoudreOrdre = r }))
const rattacherOrdre = vi.fn(async () => {})

vi.mock('./fabricationProd', () => ({
  addFabProd: (...a) => addFabProd(...a),
  rattacherOrdre: (...a) => rattacherOrdre(...a),
  loadFabProdDepuis: async () => [],
  loadNoms: async () => ({}),
}))
vi.mock('./fabrication', () => ({ creerOfPrepa: (...a) => creerOfPrepa(...a) }))

const { declarer } = await import('./fabAnnexe')

beforeEach(() => { addFabProd.mockClear(); creerOfPrepa.mockClear(); rattacherOrdre.mockClear() })

describe('declarer', () => {
  it('rend la main sans attendre Odoo', async () => {
    // L'ordre n'est pas encore créé (la promesse pend), et pourtant c'est fini.
    const r = await declarer({ produit: 'SM. Ganache Gold', qty: 2700, unite: 'g' }, 'u1')
    expect(r.produit).toBe('SM. Ganache Gold')
    expect(addFabProd).toHaveBeenCalled()
    expect(creerOfPrepa).toHaveBeenCalled()
  })

  it('le JOURNAL est écrit avant tout : c’est le travail de l’atelier', async () => {
    await declarer({ produit: 'SM. Ganache Gold', qty: 2700, unite: 'g', pour: 'SM- Base CBS 23 cm' }, 'u1')
    const args = addFabProd.mock.calls[0]
    expect(args[1]).toBe('SM. Ganache Gold')
    expect(args[2]).toBe(2700)
    expect(args[9]).toBe('SM- Base CBS 23 cm')     // le lien « pour »
  })

  it('et l’ordre se rattache quand il arrive, après coup', async () => {
    await declarer({ produit: 'SM. Ganache Gold', qty: 2700, unite: 'g' }, 'u1')
    expect(rattacherOrdre).not.toHaveBeenCalled()
    resoudreOrdre({ name: 'WHPDX/MO/21410' })
    await new Promise(r => setTimeout(r, 0))
    expect(rattacherOrdre).toHaveBeenCalledWith(7, 'WHPDX/MO/21410', true)
  })
})
