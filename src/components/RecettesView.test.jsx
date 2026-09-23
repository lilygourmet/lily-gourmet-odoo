// @vitest-environment jsdom
// ============================================================
// L'écran du chef : on regarde, on essaie, on n'engage RIEN.
//
// Le vrai danger de cet écran n'est pas un calcul faux, c'est la confusion :
// deux écrans qui se ressemblent, un seul qui lance la production. Ces tests
// tiennent la frontière — aucun bouton de déclaration, aucun appel à Odoo — et
// vérifient qu'on voit toujours ce que dit la vraie recette à côté de l'essai.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const tarte = {
  produit: 'SM. Tarte Citron 23 cm', libelle: 'Tarte citron 23 cm', unite: 'u',
  tournee: 6, stock: 0, pour: ['E- Tarte citron'],
  // ⚠️ PAS DE `libelle` SUR UN COMPOSANT : l'API n'en met pas (`composantsDe`
  // ne pose que `produit`). Un mock qui invente une forme ne teste plus rien.
  composants: [
    { produit: 'SM. Creme Citron', unite: 'g',
      besoin: 1800, stock: 0, dejaFait: 0, fabrique: true, ok: false },
    { produit: 'MP- Sucre Granule', unite: 'g',
      besoin: 300, stock: 0, dejaFait: 0, fabrique: false, ok: true },
  ],
}

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/fabAnnexe', async importOriginal => {
  const vrai = await importOriginal()
  return {
    ...vrai,                                   // les VRAIES règles de calcul
    loadToutFabAnnexe: async () => [tarte],
    loadArticleFabAnnexe: async () => tarte,
  }
})

const { default: RecettesView } = await import('./RecettesView')

beforeEach(() => { localStorage.clear() })
afterEach(() => cleanup())

const ouvrirLaTarte = async () => {
  render(<RecettesView user={{ id: 'u1' }} />)
  const ligne = await screen.findByText('Tarte citron 23 cm')
  fireEvent.click(ligne)
  await screen.findByText('Creme Citron')
}

describe('la liste', () => {
  it('montre les recettes', async () => {
    render(<RecettesView user={{ id: 'u1' }} />)
    expect(await screen.findByText('Tarte citron 23 cm')).toBeTruthy()
  })

  it('dit en toutes lettres que rien n’est enregistré', async () => {
    render(<RecettesView user={{ id: 'u1' }} />)
    expect(await screen.findByText(/Essai seulement/)).toBeTruthy()
  })
})

describe('la fiche', () => {
  it('ouvre la recette et montre ses ingrédients', async () => {
    await ouvrirLaTarte()
    expect(screen.getByText('Sucre Granule')).toBeTruthy()
  })

  // ⚠️ LA FRONTIÈRE. Si un jour un bouton de déclaration apparaît ici, ce test
  // tombe — et c'est exactement ce qu'on veut.
  it('n’offre AUCUN moyen de déclarer ou de fabriquer', async () => {
    await ouvrirLaTarte()
    const mots = document.body.textContent
    expect(mots).not.toMatch(/C'est fait|Il en est sorti|Imprimer la cascade/)
  })

  it('change une quantité, et garde la vraie sous les yeux', async () => {
    await ouvrirLaTarte()
    fireEvent.click(screen.getByText('Sucre Granule'))
    const champ = await screen.findByLabelText('Quantité')
    fireEvent.change(champ, { target: { value: '450' } })
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(screen.getByText(/Odoo dit/)).toBeTruthy())
    expect(screen.getByText(/Odoo dit/).textContent).toMatch(/300/)
  })

  it('« Remettre la vraie recette » efface l’essai', async () => {
    await ouvrirLaTarte()
    fireEvent.click(screen.getByText('Sucre Granule'))
    fireEvent.change(await screen.findByLabelText('Quantité'), { target: { value: '450' } })
    fireEvent.click(screen.getByText('OK'))
    await screen.findByText(/Odoo dit/)
    fireEvent.click(screen.getByText('Remettre la vraie recette'))
    await waitFor(() => expect(screen.queryByText(/Odoo dit/)).toBeNull())
  })
})
