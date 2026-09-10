// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Recette, SortieStock } from './FabAnnexe2View'

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

// ====== « J'en ai fait 19 » — ce que la fournée consomme vraiment ======
// Tournée de 13 tiramisus, il en sort 19. La recette suit (« c'est toujours
// j'ai remis »), sauf la mousse. Et là où le stock ne suit pas, il faut le
// DIRE : c'est ce qui a mis le biscuit amande gingembre à −5 508 g.

const tiramisu = {
  produit: 'SM- Tiramisu 15cm',
  libelle: 'Tiramisu 15 cm',
  unite: 'u',
  tournee: 13,
  composants: [
    { produit: 'MP- Mascarpone', unite: 'kg', besoin: 1.04, stock: 20, dejaFait: 0, fige: true, fabrique: false },
    { produit: "SM. Sirop d'imbibage cafe Tiramisu", unite: 'g', besoin: 1300, stock: 9570, dejaFait: 0, fige: false, fabrique: true },
    { produit: 'SM. Biscuit a la cuillere 5 pers', unite: 'u', besoin: 13, stock: 13, dejaFait: 0, fige: false, fabrique: true },
  ],
}

describe('il manque pour aller au bout', () => {
  it('ne montre QUE ce qui manque — pas les lignes qui suivent', () => {
    render(<SortieStock article={tiramisu} sortie={19} />)
    // 19 biscuits demandés, 13 en stock → la seule ligne qui compte
    expect(screen.getByText('Biscuit a la cuillere 5 pers')).toBeTruthy()
    expect(screen.queryByText(/Sirop/)).toBeNull()        // 9 570 g en stock
    expect(screen.queryByText(/Mascarpone/)).toBeNull()   // figé, et 20 kg
  })

  it('compte le manque sur la sortie annoncée, pas sur la tournée', () => {
    render(<SortieStock article={tiramisu} sortie={19} />)
    expect(screen.getByText('manque 6 u')).toBeTruthy()
    expect(screen.getByText(/il en faut 19 u/)).toBeTruthy()
  })

  it('disparaît complètement quand tout suit', () => {
    const { container } = render(<SortieStock article={tiramisu} sortie={13} />)
    expect(container.textContent).toBe('')
  })

  it('laisse les figés à la fournée : ils ne manquent pas parce qu’il en sort plus', () => {
    const serre = {
      ...tiramisu,
      composants: tiramisu.composants.map(c => (
        c.fige ? { ...c, stock: 1.04 } : { ...c, stock: 1e6 })),
    }
    render(<SortieStock article={serre} sortie={19} />)
    // le mascarpone est pile à la fournée : rien ne manque, donc rien du tout
    expect(screen.queryByText(/Mascarpone/)).toBeNull()
  })

  it('ouvre la recette de ce qui manque, quand ça se fabrique', () => {
    const onOuvrir = vi.fn()
    render(<SortieStock article={tiramisu} sortie={19} onOuvrir={onOuvrir} />)
    fireEvent.click(screen.getByText(/à faire 6 u/))
    expect(onOuvrir).toHaveBeenCalledWith('SM. Biscuit a la cuillere 5 pers')
  })

  it('n’ouvre rien sur un ingrédient qu’on achète, mais le signale', () => {
    const onOuvrir = vi.fn()
    const achete = {
      ...tiramisu,
      composants: [{ produit: 'MP- Sucre Granule', unite: 'g', besoin: 900, stock: 0, dejaFait: 0, fige: false, fabrique: false }],
    }
    render(<SortieStock article={achete} sortie={19} onOuvrir={onOuvrir} />)
    const ligne = screen.getByText(/manque 1 315 g/)
    expect(ligne).toBeTruthy()
    fireEvent.click(ligne)
    expect(onOuvrir).not.toHaveBeenCalled()
  })

  it('compte ce qui a déjà été déclaré du jour', () => {
    const avecFait = {
      ...tiramisu,
      composants: tiramisu.composants.map(c => (
        c.produit.includes('Biscuit') ? { ...c, dejaFait: 6 } : c)),
    }
    const { container } = render(<SortieStock article={avecFait} sortie={19} />)
    expect(container.textContent).toBe('')
  })
})
