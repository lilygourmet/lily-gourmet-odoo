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
  // 0,2 kg de mini et 1,4 kg de tournée : l'atelier, lui, lit 200 g et 1 400 g.
  { produit: 'SM. Masse Gélatine', libelle: 'Masse gélatine', mini: 0.2, maxi: 1,
    tournee: 1.4, actif: true, figes: [] },
]
// Ce qu'Odoo sait faire : le crémeux sert un gâteau vendu, la vieille recette
// d'essai ne sert plus à rien.
const tout = [
  { produit: 'SM. Crémeux Pistache', unite: 'g', stock: 230, pour: ['E- Pistache fleur d’oranger'] },
  // ⚠️ Compté en KILOS chez Odoo — c'est là que le facteur mille se glissait.
  { produit: 'SM. Masse Gélatine', unite: 'kg', stock: 1.4, pour: ['E- Pistache fleur d’oranger'] },
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
let cochesAFinir = []
vi.mock('../lib/miseEnForme', () => ({
  loadMiseEnForme: async () => cochesAFinir, setMiseEnForme: async () => true,
}))
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
beforeEach(() => { vi.clearAllMocks(); cochesAFinir = [] })
afterEach(cleanup)

describe('ce que la liste montre', () => {
  it('range sous le gâteau vendu, et cache ce qui ne sert à personne', async () => {
    poser()
    expect(await screen.findByText(/Pistache fleur d’oranger/)).toBeTruthy()
    // ⚠️ « Le reste » (ce qui ne remonte à aucun gâteau vendu) reste dehors.
    // ⚠️ Et on ne l'annonce plus : « enlève 192 articles · 48 gâteaux · 86 sans
    // gâteau » (Layla, 2026-09-21). La recherche, elle, les retrouve toujours.
    expect(screen.queryByText('Le reste')).toBeNull()
    expect(screen.queryByText(/sans gâteau/)).toBeNull()
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

// ⚠️ « Crée un filtre pour voir les à finir dans mini/maxi annexe » (Layla,
// 2026-09-21). Une fois la liste cochée, rien ne permettait de la relire :
// il fallait rouvrir chaque gâteau et repérer les pastilles une par une.
describe('le filtre « À finir »', () => {
  it('ne garde que les articles cochés 🍮, et dit combien', async () => {
    cochesAFinir = ['SM. Crémeux Pistache']
    poser()
    const bouton = await screen.findByText(/Voir les « À finir »/)
    expect(screen.getByText('(1)')).toBeTruthy()

    fireEvent.click(bouton)
    // Le dossier s'ouvre tout seul, et la ligne cochée est là…
    expect(await screen.findByText('Crémeux pistache')).toBeTruthy()
    // …sans celle qui n'est pas cochée.
    expect(screen.queryByText(/Pistache Fleur d’Oranger 10 pers/)).toBeNull()
  })

  it('dit quand rien n’est coché, au lieu d’un écran vide', async () => {
    poser()
    fireEvent.click(await screen.findByText(/Voir les « À finir »/))
    expect(await screen.findByText(/aucun article coché/)).toBeTruthy()
  })

  it('se relâche quand on le rappuie', async () => {
    cochesAFinir = ['SM. Crémeux Pistache']
    poser()
    const b = await screen.findByText(/Voir les « À finir »/)
    fireEvent.click(b)
    fireEvent.click(await screen.findByText(/Que les « À finir »/))
    expect(await screen.findByText(/Voir les « À finir »/)).toBeTruthy()
  })
})

describe('les réglages d’une ligne', () => {
  const ouvrirLeGateau = async () => {
    poser()
    fireEvent.click(await screen.findByText(/Pistache fleur d’oranger/))
    return screen.findByText('Crémeux pistache')
  }

  // ⚠️ LE FACTEUR MILLE, ET IL A VRAIMENT MORDU (Layla, 2026-09-21) : ces
  // cases prenaient l'unité d'Odoo, donc « 1400 » sur un article en kilos
  // voulait dire 1 400 kg. L'écran a proposé 14 000 000 g de masse gélatine à
  // fabriquer, avec 1,2 tonne d'eau. L'atelier tape des GRAMMES, partout.
  it('les trois cases se tapent en grammes, même sur un article en kilos', async () => {
    await ouvrirLeGateau()
    expect(screen.getAllByText('mini (g)').length).toBe(2)
    expect(screen.getAllByText('tournée (g)').length).toBe(2)
    // 1,4 kg chez Odoo → 1 400 dans la case.
    expect(screen.getByLabelText('tournée de Masse gélatine').value).toBe('1400')
    expect(screen.getByLabelText('mini de Masse gélatine').value).toBe('200')
    // L'article compté en grammes, lui, ne bouge pas.
    expect(screen.getByLabelText('tournée de Crémeux pistache').value).toBe('1200')
  })

  it('et ce qu’on tape repart en kilos chez Odoo', async () => {
    await ouvrirLeGateau()
    const champ = screen.getByLabelText('tournée de Masse gélatine')
    fireEvent.change(champ, { target: { value: '2000' } })
    fireEvent.blur(champ)
    await waitFor(() => expect(save).toHaveBeenCalled())
    // 2 000 g tapés → 2 kg enregistrés.
    expect(save.mock.calls.at(-1)[0]).toMatchObject({ produit: 'SM. Masse Gélatine', tournee: 2 })
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
