// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Recette } from './FabAnnexe2View'

// ====== La recette d'un composant, telle que l'atelier la voit ======
// Écran refait plusieurs fois en deux jours ; à chaque fois quelque chose se
// cassait sans bruit — les deux listes fusionnées, la pastille déplacée, puis
// le clic qui n'ouvrait plus rien. Ces tests-là tiennent le rendu.

afterEach(cleanup)

// « SM- Fond Citron Framboise (5) » : deux morceaux déjà là, un qui manque.
const noeud = {
  produit: 'SM- Fond Citron Framboise (5)',
  unite: 'u',
  tourneeTaille: 13,
  recette: [
    { produit: 'SM. Biscuit amande gingembre', qty: 1820, unite: 'g' },
    { produit: 'MP- Sucre Granule', qty: 200, unite: 'g' },
    { produit: 'SM. crunchy ci-fr 5pers u.', qty: 13, unite: 'u' },
  ],
}
const enfants = [
  { produit: 'SM. Biscuit amande gingembre', unite: 'g', stock: 8800, besoin: 1820, produira: 0, fabrique: true, ok: true, dejaFait: 0 },
  { produit: 'SM. crunchy ci-fr 5pers u.', unite: 'u', stock: 0, besoin: 13, produira: 26, fabrique: true, ok: false, dejaFait: 0 },
]

const poser = (extra = {}) => {
  const onOuvrir = vi.fn()
  const onFois = vi.fn()
  const { container } = render(<Recette noeud={noeud} lignes={noeud.recette} fois={2}
    onFois={onFois} enfants={enfants} faits={{}} onOuvrir={onOuvrir} {...extra} />)
  return { onOuvrir, onFois, container }
}

describe('la recette d’un composant', () => {
  it('montre UNE seule liste : ingrédients et morceaux à faire mélangés, dans l’ordre', () => {
    poser()
    const champs = screen.getAllByRole('textbox')
    // trois lignes + la ligne « obtenu »
    expect(champs).toHaveLength(4)
    expect(screen.getByText('Biscuit amande gingembre')).toBeTruthy()
    expect(screen.getByText('Sucre Granule')).toBeTruthy()
    expect(screen.getByText('crunchy ci-fr 5pers u.')).toBeTruthy()
    expect(screen.getByText(/obtenu/)).toBeTruthy()
  })

  it('met les quantités à l’échelle du nombre de fois', () => {
    poser()
    // 1 820 g × 2 = 3 640 ; 13 u × 2 = 26 ; 13 × 2 = 26 obtenus
    expect(screen.getByLabelText(/Biscuit amande gingembre/).value.replace(/\s/g, '')).toBe('3640')
    expect(screen.getByLabelText(/crunchy ci-fr/).value).toBe('26')
  })

  it('OUVRE le composant quand on clique son NOM, pas seulement le petit « recette › »', () => {
    const { onOuvrir } = poser()
    fireEvent.click(screen.getByText('crunchy ci-fr 5pers u.'))
    expect(onOuvrir).toHaveBeenCalledWith('SM. crunchy ci-fr 5pers u.')
  })

  it('ouvre aussi depuis la ligne du stock, juste dessous', () => {
    const { onOuvrir } = poser()
    fireEvent.click(screen.getByText(/à faire/))
    expect(onOuvrir).toHaveBeenCalledWith('SM. crunchy ci-fr 5pers u.')
  })

  it('un ingrédient qu’on pèse ne s’ouvre pas : rien à fabriquer dessous', () => {
    const { onOuvrir } = poser()
    fireEvent.click(screen.getByText('Sucre Granule'))
    expect(onOuvrir).not.toHaveBeenCalled()
  })

  it('dit ce qui manque et ce qui est là', () => {
    poser()
    expect(screen.getByText(/stock 8 800 g/)).toBeTruthy()
    expect(screen.getByText(/stock 0 u · à faire 26 u/)).toBeTruthy()
  })

  it('aligne tous les noms sur le même axe : les lignes sans pastille gardent la place', () => {
    const { container } = poser()
    // 4 lignes en tout, 2 portent une pastille → 2 gouttières vides.
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('pas de gouttière du tout quand aucune ligne n’a de pastille', () => {
    const { container } = poser({ enfants: [] })
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0)
  })

  it('retaper une quantité remet toute la recette à l’échelle', () => {
    const { onFois } = poser()
    const champ = screen.getByLabelText(/Biscuit amande gingembre/)
    fireEvent.change(champ, { target: { value: '1820' } })
    fireEvent.blur(champ)
    expect(onFois).toHaveBeenCalledWith(1)      // 1 820 g = une fois la recette
  })
})
