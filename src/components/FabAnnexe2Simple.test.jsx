// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CasesAFaire, Fiche } from './FabAnnexe2Simple'
import { propre } from '../lib/ecranSimple'

// ====== L'écran simplifié, lu par des gens qui lisent peu ======
// Ce qui compte : le gros chiffre est une QUANTITÉ, le stock reste visible,
// ce qui manque se voit et s'ouvre, et aucun mot ne traîne pour rien.

afterEach(cleanup)

const tiramisu = {
  produit: 'SM- Tiramisu 15cm', libelle: 'Tiramisu 15 cm', unite: 'u',
  tourneeTaille: 13, reste: 13, photo: 'E- Tiramisu',
  recette: [],
  enfants: [
    { produit: 'SM Amaretti orange Tiramisu', unite: 'g', besoin: 780, stock: 4200, dejaFait: 0, fabrique: true, ok: true },
    { produit: "SM. Sirop d'imbibage cafe Tiramisu", unite: 'g', besoin: 1300, stock: 9570, dejaFait: 0, fabrique: true, ok: true },
    { produit: 'SM. Biscuit a la cuillere 5 pers', unite: 'u', besoin: 13, stock: 0, dejaFait: 0, fabrique: true, ok: false },
  ],
}

const plaque = {
  produit: 'SM. Biscuit a la cuillere (plaque)', unite: 'u', tourneeTaille: 4,
  recette: [
    { produit: 'MP- Oeufs blanc', qty: 0.75, unite: 'kg' },
    { produit: 'MP- Sucre Granule', qty: 0.75, unite: 'kg' },
    { produit: 'MP- Oeufs jaune', qty: 0.55, unite: 'kg' },
    { produit: 'MP- Farine', qty: 0.375, unite: 'kg' },
    { produit: 'MP- Maizena', qty: 0.375, unite: 'kg' },
  ],
  enfants: [],
}

describe('les noms, débarrassés de ce qui ne se lit pas', () => {
  it('enlève les préfixes d’Odoo', () => {
    expect(propre('SM- Tiramisu 15cm')).toBe('Tiramisu 15cm')
    expect(propre('MP- Oeufs blanc')).toBe('Oeufs blanc')
    expect(propre('[178] E- Tiramisu')).toBe('Tiramisu')
    expect(propre('SM. Biscuit a la cuillere (plaque)')).toBe('Biscuit a la cuillere (plaque)')
  })
})

describe('l’accueil', () => {
  it('montre une case par article, avec le nombre à faire', () => {
    render(<CasesAFaire articles={[tiramisu]} onOuvrir={() => {}} />)
    expect(screen.getByText('Tiramisu 15 cm')).toBeTruthy()
    expect(screen.getByText('13')).toBeTruthy()
  })

  it('ouvre l’article quand on tape dessus', () => {
    const onOuvrir = vi.fn()
    render(<CasesAFaire articles={[tiramisu]} onOuvrir={onOuvrir} />)
    fireEvent.click(screen.getByText('Tiramisu 15 cm'))
    expect(onOuvrir).toHaveBeenCalledWith('SM- Tiramisu 15cm')
  })

  it('la pastille dit ce qu’on fait MAINTENANT, le besoin total va dessous', () => {
    // Cadre forêt noir : il en faut 352, la recette en fait 88 à la fois.
    const cadre = { produit: 'SM- cadre foret noir grand Production',
      libelle: 'Cadre forêt noir', reste: 352, tournee: 88 }
    render(<CasesAFaire articles={[cadre]} onOuvrir={() => {}} />)
    expect(screen.getByText('88')).toBeTruthy()
    expect(screen.getByText(/il en faut 352/)).toBeTruthy()
  })

  it('ne répète pas le besoin quand une fournée suffit', () => {
    const royal = { produit: 'SM- Royal Chocolat 15 cm', libelle: 'Royal 15 cm', reste: 13, tournee: 13 }
    render(<CasesAFaire articles={[royal]} onOuvrir={() => {}} />)
    expect(screen.queryByText(/il en faut/)).toBeNull()
  })

  it('le dit quand il n’y a rien, sans jargon', () => {
    render(<CasesAFaire articles={[]} onOuvrir={() => {}} />)
    expect(screen.getByText(/Rien à faire/)).toBeTruthy()
  })
})

describe('la fiche', () => {
  const poser = (noeud, q = 13, extra = {}) => {
    const onQuantite = vi.fn(); const onOuvrir = vi.fn(); const onFait = vi.fn()
    render(<Fiche noeud={noeud} quantite={q} onQuantite={onQuantite}
      faits={{}} onOuvrir={onOuvrir} onFait={onFait} {...extra} />)
    return { onQuantite, onOuvrir, onFait }
  }

  it('montre la QUANTITÉ en gros, jamais un nombre de tournées', () => {
    poser(tiramisu)
    expect(screen.getByText('13')).toBeTruthy()
    expect(screen.queryByText(/tournée/i)).toBeNull()
  })

  it('écrit dessous ce que ça veut dire en vrai', () => {
    poser(plaque, 4)
    expect(screen.getByText(/2\s*800 g en tout/)).toBeTruthy()
  })

  it('garde le stock sous les yeux — « on peut voir si erreur »', () => {
    poser(tiramisu)
    expect(screen.getByText(/en stock 4 200 g/)).toBeTruthy()
    expect(screen.getByText(/en stock 0 u/)).toBeTruthy()
  })

  it('montre TOUS les manques, chacun avec son bouton', () => {
    const deuxManques = {
      ...tiramisu,
      enfants: tiramisu.enfants.map(c => (c.produit.includes('Sirop') ? { ...c, ok: false, stock: 0 } : c)),
    }
    poser(deuxManques)
    expect(screen.getAllByText('à faire ›')).toHaveLength(2)
  })

  it('ouvre le morceau qui manque', () => {
    const { onOuvrir } = poser(tiramisu)
    fireEvent.click(screen.getByText('à faire ›'))
    expect(onOuvrir).toHaveBeenCalledWith('SM. Biscuit a la cuillere 5 pers')
  })

  it('« C’est fait » reste éteint tant qu’il manque quelque chose', () => {
    const { onFait } = poser(tiramisu)
    fireEvent.click(screen.getByText("C'est fait"))
    expect(onFait).not.toHaveBeenCalled()
  })

  it('… et s’allume quand tout est là', () => {
    const complet = { ...tiramisu, enfants: tiramisu.enfants.map(c => ({ ...c, ok: true })) }
    const { onFait } = poser(complet)
    fireEvent.click(screen.getByText("C'est fait"))
    expect(onFait).toHaveBeenCalled()
  })

  it('le + et le − avancent par pièce, ou par 50 g', () => {
    const { onQuantite } = poser(tiramisu, 13)
    fireEvent.click(screen.getByLabelText('Plus'))
    expect(onQuantite).toHaveBeenCalledWith(14)
    cleanup()
    const g = poser({ ...plaque, unite: 'g', tourneeTaille: 3920, enfants: [] }, 3920)
    fireEvent.click(screen.getByLabelText('Plus'))
    expect(g.onQuantite).toHaveBeenCalledWith(3970)
  })
})
