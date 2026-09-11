// @vitest-environment jsdom
// ============================================================
// LE CHEMIN COMPLET, DU DOIGT À ODOO.
//
// « Attention quand tu changes, que ce qu'on a fait ne tombe pas en panne »
// (Layla, 2026-09-11). Les autres tests vérifient les RÈGLES une par une ;
// celui-ci vérifie le CÂBLAGE — ouvrir un article, dire « c'est fait », dire
// combien il en est sorti, et regarder ce qui part vraiment.
//
// C'est là qu'ont vécu les bugs les plus chers de la semaine : la mauvaise
// unité envoyée à Odoo, le chiffre prévu qui retombait, la crème déclarée
// alors qu'elle était au frigo. Chacun a maintenant sa garde ici.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const declarer = vi.fn(async () => ({ produit: 'x', qty: 1, ordre: null, erreur: null }))
const envoyerAValider = vi.fn(async () => ({ produit: 'x', qty: 1, ordre: null, erreur: null }))
const repartirCuve = vi.fn(async () => [])

// Le sirop : compté en KILOS chez Odoo, fournée de 5,55 kg.
const sirop = {
  produit: 'SM. sirop Imbibage production KG', libelle: 'Sirop imbibage', unite: 'kg',
  tournee: 5.55, stock: 0, dejaFait: 0, reste: 5.55, mini: 0, maxi: 0,
  figes: [], figesNom: 'Monté sur place', ajustements: {}, tailles: [],
  photo: 'E- Tiramisu', etat: 'rupture',
  composants: [{ produit: 'MP- Sucre Granule', unite: 'g', besoin: 2000, stock: 0,
    dejaFait: 0, fabrique: false, ok: true }],
}

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/auth', () => ({ hasValidJwt: () => true }))
vi.mock('../lib/fabrication', () => ({ dernierEcran: () => null, garderEcran: () => {} }))
vi.mock('../lib/fabAnnexe', async importOriginal => {
  const vrai = await importOriginal()
  return {
    ...vrai,                                   // les VRAIES règles de calcul
    loadFabAnnexe: async () => [sirop],
    loadToutFabAnnexe: async () => [],
    loadArticlesFabAnnexe: async () => [sirop],
    loadHistoriqueAnnexe: async () => [],
    declarer: (...a) => declarer(...a),
    envoyerAValider: (...a) => envoyerAValider(...a),
    repartirCuve: (...a) => repartirCuve(...a),
  }
})

const { default: FabAnnexe2SimpleView } = await import('./FabAnnexe2SimpleView')

beforeEach(() => { localStorage.clear(); declarer.mockClear(); envoyerAValider.mockClear() })
afterEach(cleanup)

const ouvrirLaFiche = async () => {
  render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
  await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
  fireEvent.click(screen.getByText('Sirop imbibage'))
  await waitFor(() => expect(screen.getByText("C'est fait")).toBeTruthy())
}

describe('le chemin complet', () => {
  it('la fiche s’ouvre sur la fournée, écrite en GRAMMES', async () => {
    await ouvrirLaFiche()
    // 5,55 kg chez Odoo → 5 550 g à l'écran, et le mot « g ».
    expect(screen.getByText(/5.550/)).toBeTruthy()
    expect(screen.getByText('g à faire')).toBeTruthy()
  })

  it('« c’est fait » demande ce qui est sorti, puis déclare dans l’unité de l’ARTICLE', async () => {
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Il en est sorti combien ?')).toBeTruthy())
    fireEvent.click(screen.getByText("C'est bon"))
    await waitFor(() => expect(envoyerAValider).toHaveBeenCalled())
    const [article, sortie] = envoyerAValider.mock.calls[0]
    expect(article.unite).toBe('kg')        // ⚠️ jamais 'g' : c'est l'unité d'Odoo
    expect(sortie).toBeCloseTo(5.55, 3)     // ⚠️ jamais 5 550 : ce serait mille fois trop
  })

  it('le chiffre corrigé au clavier repart juste — en kilos', async () => {
    await ouvrirLaFiche()
    fireEvent.click(screen.getByLabelText('Changer à faire'))
    const touche = t => fireEvent.click(screen.getAllByText(t).find(e => e.tagName === 'BUTTON'))
    touche('3'); touche('0'); touche('0'); touche('0')          // 3 000 g
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Il en est sorti combien ?')).toBeTruthy())
    fireEvent.click(screen.getByText("C'est bon"))
    await waitFor(() => expect(envoyerAValider).toHaveBeenCalled())
    expect(envoyerAValider.mock.calls[0][1]).toBeCloseTo(3, 6)
  })

  it('le chiffre décidé est gardé, et « réinitialiser » le rend', async () => {
    await ouvrirLaFiche()
    fireEvent.click(screen.getByLabelText('Plus à faire'))         // 5 550 → 5 600 g
    expect(JSON.parse(localStorage.getItem('lg:annexe2-prevu')).par['SM. sirop Imbibage production KG'].q)
      .toBeCloseTo(5.6, 6)
    fireEvent.click(screen.getByText('réinitialiser'))
    expect(JSON.parse(localStorage.getItem('lg:annexe2-prevu')).par['SM. sirop Imbibage production KG'])
      .toBeUndefined()
  })

  it('rien ne part tant que le travail n’est pas dit fait', async () => {
    await ouvrirLaFiche()
    expect(declarer).not.toHaveBeenCalled()
    expect(envoyerAValider).not.toHaveBeenCalled()
  })
})
