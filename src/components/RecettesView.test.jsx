// @vitest-environment jsdom
// ============================================================
// L'écran du chef : on regarde, on met la recette à son échelle, on n'engage
// RIEN.
//
// « Si j'ai l'habitude de bosser avec 1 000 g de sucre, je vais modifier ça et
// la suite suit, pour voir le ratio avec les autres » (Layla, 2026-09-23).
//
// Le vrai danger de cet écran n'est pas un calcul faux, c'est la confusion :
// deux écrans qui se ressemblent, un seul qui lance la production. Un test
// tient cette frontière.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Une tarte : 6 pièces, 1 800 g de crème (qui se fabrique) et 300 g de sucre.
// ⚠️ PAS DE `libelle` SUR UN COMPOSANT : l'API n'en met pas (`composantsDe` ne
// pose que `produit`). Un mock qui invente une forme ne teste plus rien.
const tarte = {
  produit: 'SM. Tarte Citron 23 cm', libelle: 'Tarte citron 23 cm', unite: 'u',
  tournee: 6, stock: 0, pour: ['E- Tarte citron'],
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
  fireEvent.click(await screen.findByText('Tarte citron 23 cm'))
  await screen.findByText('Creme Citron')
}

/** Ce qui est écrit en face d'un ingrédient. */
const enFaceDe = nom => screen.getByText(nom).parentElement.textContent

describe('la liste', () => {
  it('montre les recettes', async () => {
    render(<RecettesView user={{ id: 'u1' }} />)
    expect(await screen.findByText('Tarte citron 23 cm')).toBeTruthy()
  })

  it('dit en toutes lettres que rien n’est enregistré', async () => {
    render(<RecettesView user={{ id: 'u1' }} />)
    expect(await screen.findByText(/Pour regarder seulement/)).toBeTruthy()
  })
})

describe('la fiche', () => {
  it('affiche la recette telle qu’Odoo l’écrit', async () => {
    await ouvrirLaTarte()
    expect(enFaceDe('Creme Citron')).toMatch(/1\s800 g/)
    expect(enFaceDe('Sucre Granule')).toMatch(/300 g/)
  })

  // ⚠️ LE GESTE DE LAYLA : on part du sucre, tout le reste suit.
  it('1 000 g de sucre au lieu de 300 : TOUTE la recette suit', async () => {
    await ouvrirLaTarte()
    fireEvent.click(screen.getByText('300 g'))
    const champ = await screen.findByLabelText('Quantité de Sucre Granule')
    fireEvent.change(champ, { target: { value: '1000' } })
    fireEvent.click(screen.getByText('OK'))

    await waitFor(() => expect(enFaceDe('Sucre Granule')).toMatch(/1\s000 g/))
    // 1 800 × (1 000 / 300) = 6 000
    expect(enFaceDe('Creme Citron')).toMatch(/6\s000 g/)
    // 6 × (1 000 / 300) = 20 tartes
    expect(screen.getByLabelText?.('pour') ?? document.getElementById('qte')).toBeTruthy()
    expect(document.getElementById('qte').value).toBe('20')
  })

  it('dit toujours d’où l’on est parti, et sait y revenir', async () => {
    await ouvrirLaTarte()
    fireEvent.click(screen.getByText('300 g'))
    fireEvent.change(await screen.findByLabelText('Quantité de Sucre Granule'),
      { target: { value: '1000' } })
    fireEvent.click(screen.getByText('OK'))

    const revenir = await screen.findByText('y revenir')
    expect(revenir.parentElement.textContent).toMatch(/La recette d’Odoo est pour 6 u/)
    fireEvent.click(revenir)
    await waitFor(() => expect(enFaceDe('Sucre Granule')).toMatch(/300 g/))
    expect(enFaceDe('Creme Citron')).toMatch(/1\s800 g/)
  })

  it('un chiffre impossible ne casse pas la recette', async () => {
    await ouvrirLaTarte()
    fireEvent.click(screen.getByText('300 g'))
    fireEvent.change(await screen.findByLabelText('Quantité de Sucre Granule'),
      { target: { value: '0' } })
    fireEvent.click(screen.getByText('OK'))
    await waitFor(() => expect(enFaceDe('Sucre Granule')).toMatch(/300 g/))
  })

  // ⚠️ LA FRONTIÈRE. Si un jour un bouton de déclaration apparaît ici, ce test
  // tombe — et c'est exactement ce qu'on veut.
  it('n’offre AUCUN moyen de déclarer ou de fabriquer', async () => {
    await ouvrirLaTarte()
    expect(document.body.textContent)
      .not.toMatch(/C'est fait|Il en est sorti|Imprimer la cascade/)
  })
})
