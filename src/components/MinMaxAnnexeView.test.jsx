// @vitest-environment jsdom
// ============================================================
// L'ÉCRAN « MINI / MAXI ANNEXE », tel qu'on le lit.
//
// Deux règles de Layla du 2026-09-20 :
//   • « Montrer que les composants des articles mère vendable » — ce qui ne
//     sert à aucun gâteau vendu encombrait la liste pour rien ;
//   • « Compliqué, le truc de suivi, pause » — l'état se voit maintenant sur
//     un interrupteur, plus dans un mot.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const catalogue = [
  { produit: 'SM. Crémeux Pistache', libelle: 'Crémeux pistache', mini: 600, maxi: 2400,
    tournee: 1200, actif: true, figes: [] },
]
// Ce qu'Odoo sait faire : le crémeux sert un gâteau vendu, la vieille recette
// d'essai ne sert plus à rien.
const tout = [
  { produit: 'SM. Crémeux Pistache', unite: 'g', stock: 230, pour: ['E- Pistache fleur d’oranger'] },
  // Même gâteau, mais un FORMAT (« SM- ») et non une préparation (« SM. »).
  { produit: 'SM- Pistache Fleur d’Oranger 10 pers', unite: 'u', stock: 4,
    pour: ['E- Pistache fleur d’oranger'] },
  { produit: 'SM. Essai Abandonné', unite: 'g', stock: 0, pour: [] },
]

const save = vi.fn(async () => {})
vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/auth', () => ({ canSeeMinMaxAnnexe: () => true, isAdmin: () => true }))
vi.mock('../lib/miseEnForme', () => ({ loadMiseEnForme: async () => [], setMiseEnForme: async () => true }))
vi.mock('../lib/fabAnnexe', async importOriginal => ({
  ...await importOriginal(),          // le VRAI rangement par gâteau
  loadCatalogueAnnexe: async () => catalogue,
  loadToutFabAnnexe: async () => tout,
  saveCatalogueAnnexe: (...a) => save(...a),
  retirerDuCatalogue: async () => {},
  saveFigesAnnexe: async () => {},
  loadArticleFabAnnexe: async () => ({ composants: [] }),
}))

const { default: MinMaxAnnexeView } = await import('./MinMaxAnnexeView')

const poser = () => render(<MinMaxAnnexeView user={{ id: 'u1' }} onNavigate={() => {}} />)
beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('ce que la liste montre', () => {
  it('range sous le gâteau vendu, et cache ce qui ne sert à personne', async () => {
    poser()
    expect(await screen.findByText(/Pistache fleur d’oranger/)).toBeTruthy()
    // ⚠️ « Le reste » (ce qui ne remonte à aucun gâteau vendu) reste dehors.
    expect(screen.queryByText('Le reste')).toBeNull()
    // …mais on dit qu'il existe, et comment le retrouver.
    expect(screen.getByText(/sans gâteau, tape un nom/)).toBeTruthy()
  })

  // ⚠️ « Si je tape SM- ça doit me sortir que les SM- » (Layla, 2026-09-20).
  // La recherche ordinaire aplatit la ponctuation : « SM- » et « SM. »
  // deviennent tous deux « sm ». Or le tiret EST l'information.
  it('« SM- » ne sort QUE les SM-', async () => {
    poser()
    fireEvent.click(await screen.findByText(/Pistache fleur d’oranger/))
    await screen.findByText('Crémeux pistache')

    fireEvent.change(screen.getByPlaceholderText(/chercher|Chercher/i), { target: { value: 'SM-' } })
    expect(await screen.findByText(/Pistache Fleur d’Oranger 10 pers/)).toBeTruthy()
    expect(screen.queryByText('Crémeux pistache')).toBeNull()

    // …et « SM. » fait l'inverse.
    fireEvent.change(screen.getByPlaceholderText(/chercher|Chercher/i), { target: { value: 'SM.' } })
    expect(await screen.findByText('Crémeux pistache')).toBeTruthy()
    expect(screen.queryByText(/Pistache Fleur d’Oranger 10 pers/)).toBeNull()
  })

  it('une recherche, elle, fouille partout', async () => {
    poser()
    await screen.findByText(/Pistache fleur d’oranger/)
    fireEvent.change(screen.getByPlaceholderText(/chercher|Chercher/i), { target: { value: 'essai' } })
    expect(await screen.findByText('Le reste')).toBeTruthy()
  })
})

describe('les réglages d’une ligne', () => {
  const ouvrirLeGateau = async () => {
    poser()
    fireEvent.click(await screen.findByText(/Pistache fleur d’oranger/))
    return screen.findByText('Crémeux pistache')
  }

  it('les trois cases portent leur unité — jamais convertie', async () => {
    await ouvrirLeGateau()
    // ⚠️ Le facteur mille : ces cases se tapent dans l'unité d'ODOO. Écrire
    // « g » au-dessus d'un champ qui attend des kilos, c'est l'erreur servie.
    expect(screen.getByText('mini (g)')).toBeTruthy()
    expect(screen.getByText('maxi (g)')).toBeTruthy()
    expect(screen.getByText('tournée (g)')).toBeTruthy()
  })

  it('l’interrupteur dit s’il est allumé, et l’éteindre s’enregistre', async () => {
    await ouvrirLeGateau()
    // Le gâteau porte plusieurs articles : on vise l'interrupteur DE CETTE
    // ligne, pas le premier venu.
    const ligne = screen.getByText('Crémeux pistache').closest('[class*="rounded-xl"]')
    const inter = within(ligne).getByRole('switch')
    expect(inter.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(inter)
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toMatchObject({ produit: 'SM. Crémeux Pistache', actif: false })
  })
})
