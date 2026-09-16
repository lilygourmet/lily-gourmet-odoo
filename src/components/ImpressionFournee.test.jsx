// @vitest-environment jsdom
// ============================================================
// LE PANNEAU « TU IMPRIMES QUOI ? ».
//
// « tout ce qui manque la cascade entière ; ce qui est déjà en stock s'écrit
// en vert et non cliqué » (Layla, 2026-09-15). Même langage que les cases de
// « À faire » : le vert dit qu'il y en a, et on ne réimprime pas ce qu'on a.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ChoixImpression } from './ImpressionFournee'

afterEach(cleanup)

// Deux composants et la tête, comme les rend `feuillesAImprimer`.
//
// ⚠️ `qty` (ce qu'on propose de faire) et `manque` (ce qui fait vraiment
// défaut) ne disent PAS la même chose : le sirop, il en reste 11,51 kg pour
// 8,12 de besoin — il n'en manque rien — mais l'app propose quand même une
// fournée de 11,1, pour en faire d'avance. C'est `manque` qui décide du vert.
const feuilles = [
  { produit: 'SM. Creme Citron Production', libelle: 'Creme Citron Production',
    unite: 'g', stock: 0, besoin: 7270, manque: 7270, qty: 7270,
    chemin: ['SM- 20 cm Vitrine (Citron)', 'SM. Creme Citron Production'],
    pour: [{ nom: 'SM- 20 cm Vitrine (Citron)', qty: 3480 },
           { nom: 'SM. Creme au Beurre Citron Production', qty: 3790 }], ingredients: [] },
  { produit: 'SM. Sirop Imbibage Production KG', libelle: 'Sirop Imbibage Production KG',
    unite: 'kg', stock: 11.51, besoin: 8.12, manque: 0, qty: 11.1,
    chemin: ['SM- 20 cm Vitrine (Citron)', 'SM. Sirop Imbibage Production KG'],
    pour: [], ingredients: [] },
  { produit: 'SM- 20 cm Vitrine (Citron)', libelle: 'Vitrine citron · 20 cm',
    unite: 'u', stock: 0, besoin: 29, manque: 29, qty: 29,
    chemin: ['SM- 20 cm Vitrine (Citron)'],
    pour: [], ingredients: [] },
]

const coches = { 'SM. Creme Citron Production': true,
  'SM. Sirop Imbibage Production KG': false, 'SM- 20 cm Vitrine (Citron)': true }

const poser = (extra = {}) => render(
  <ChoixImpression feuilles={feuilles} mode="tout" coches={coches} tapes={{}}
    onMode={() => {}} onCoche={() => {}} onQuantite={() => {}} onRendre={() => {}}
    onImprimer={() => {}} onFermer={() => {}} {...extra} />)

const nomDe = t => [...document.querySelectorAll('span')].find(e => e.textContent === t)

describe('le panneau « Tu imprimes quoi ? »', () => {
  it('ce qu’on a DÉJÀ s’écrit en vert, même si l’app propose d’en refaire', () => {
    poser()
    expect(nomDe('Sirop Imbibage Production KG').className).toMatch(/text-ok/)
    // ⚠️ Sa quantité proposée vaut 11 100 g : c'est bien `manque` qui décide,
    // pas `qty`. Avant, la ligne restait rouge et cochée.
    expect(screen.getByLabelText(/Quantité de Sirop/).value.replace(/\u202f|\u00a0/g, ' '))
      .toBe('11 100')
  })

  it('et n’est PAS coché', () => {
    poser()
    expect(screen.getByLabelText('Sirop Imbibage Production KG')
      .getAttribute('aria-checked')).toBe('false')
  })

  it('ce qui manque reste coché, et pas en vert', () => {
    poser()
    expect(screen.getByLabelText('Creme Citron Production')
      .getAttribute('aria-checked')).toBe('true')
    expect(nomDe('Creme Citron Production').className).not.toMatch(/text-ok/)
  })

  it('dit quand une fournée sert à deux recettes', () => {
    poser()
    expect(screen.getByText(/pour 2 recettes/)).toBeTruthy()
  })

  it('compte les feuilles avant d’imprimer', () => {
    poser()
    expect(screen.getByText('Imprimer 2 feuilles')).toBeTruthy()
  })

  it('« juste cette fiche » n’en garde qu’une, sans case à cocher', () => {
    poser({ mode: 'seule' })
    expect(screen.getByText('Imprimer 1 feuille')).toBeTruthy()
    expect(screen.queryByLabelText('Creme Citron Production')).toBeNull()
    expect(screen.getByLabelText('Vitrine citron · 20 cm').disabled).toBe(true)
  })

  it('le ↺ ne se montre que sur un chiffre tapé à la main', () => {
    const onRendre = vi.fn()
    poser({ tapes: { 'SM. Creme Citron Production': 5000 }, onRendre })
    const b = screen.getByLabelText(/Rendre le chiffre proposé pour Creme Citron/)
    expect(b.className).not.toMatch(/invisible/)
    fireEvent.click(b)
    expect(onRendre).toHaveBeenCalledWith('SM. Creme Citron Production')
    expect(screen.getByLabelText(/Rendre le chiffre proposé pour Sirop/).className)
      .toMatch(/invisible/)
  })
})

// ⚠️ LA FEUILLE DE SORTIE N'EST PAS ICI. « non à l'extérieur de l'article, il
// n'est pas lié à l'article » (Layla, 2026-09-15) : elle s'imprime depuis
// l'accueil, par paquets, et n'appartient à aucune recette. Le panneau, lui,
// n'a que ses deux façons d'imprimer une fournée.
describe('les façons d’imprimer', () => {
  it('il y en a deux, et pas une de plus', () => {
    poser()
    expect(screen.getByText('Juste cette fiche')).toBeTruthy()
    expect(screen.getByText('Tout ce qui manque')).toBeTruthy()
    expect(screen.queryByText('Sortie de stock')).toBeNull()
  })
})

// « je veux pouvoir imprimer en cascade » (Layla, 2026-09-16) — depuis
// plusieurs gâteaux cochés, pas seulement depuis une fiche.
import { Assemblage } from './FabAnnexe2Simple'

const assemblees = [
  { produit: 'SM. Creme Citron Gingembre', libelle: 'Creme Citron Gingembre',
    unite: 'g', qty: 31787, stock: 0, besoin: 31787, manque: 31787, chemin: [], ingredients: [],
    pour: [{ nom: 'SM- Tarte Citron Gin 23 cm', qty: 11844 },
           { nom: 'SM- Tarte Citron Gin 18 cm', qty: 7146 },
           { nom: 'SM- Tarte Citron Gin Indiv', qty: 12797 }] },
  { produit: 'SM- Tarte Citron Gin 23 cm', libelle: 'Tarte · 23 cm', unite: 'u',
    qty: 18, stock: 1, besoin: 18, manque: 17, chemin: [], pour: [], ingredients: [] },
  { produit: 'SM- Tarte Citron Gin 18 cm', libelle: 'Tarte · 18 cm', unite: 'u',
    qty: 18, stock: 7, besoin: 18, manque: 11, chemin: [], pour: [], ingredients: [] },
]
const gateaux = ['SM- Tarte Citron Gin 23 cm', 'SM- Tarte Citron Gin 18 cm']

describe('assembler plusieurs gâteaux', () => {
  it('montre la crème additionnée, et ce que chaque tarte lui prend', () => {
    render(<Assemblage feuilles={assemblees} gateaux={gateaux}
      onOuvrir={() => {}} onFermer={() => {}} />)
    const lu = t => screen.getByText(t)
    expect(lu(/Creme Citron Gingembre/)).toBeTruthy()
    expect(screen.getByText(/31.787 g/)).toBeTruthy()
    expect(screen.getByText(/pour Tarte Citron Gin 23 cm/)).toBeTruthy()
    expect(screen.getByText(/pour Tarte Citron Gin Indiv/)).toBeTruthy()
  })

  it('les gâteaux cochés ne sont pas des préparations à monter', () => {
    render(<Assemblage feuilles={assemblees} gateaux={gateaux}
      onOuvrir={() => {}} onFermer={() => {}} />)
    expect(screen.queryByText('Tarte · 23 cm')).toBeNull()
  })

  it('un appui ouvre la préparation avec SON TOTAL', () => {
    const onOuvrir = vi.fn()
    render(<Assemblage feuilles={assemblees} gateaux={gateaux}
      onOuvrir={onOuvrir} onFermer={() => {}} />)
    fireEvent.click(screen.getByText(/Creme Citron Gingembre/))
    expect(onOuvrir).toHaveBeenCalled()
    expect(onOuvrir.mock.calls[0][0].qty).toBe(31787)
  })

  it('et on imprime toute la fournée d’un coup', () => {
    const onImprimer = vi.fn()
    render(<Assemblage feuilles={assemblees} gateaux={gateaux} aImprimer={3}
      onImprimer={onImprimer} onOuvrir={() => {}} onFermer={() => {}} />)
    fireEvent.click(screen.getByText(/Imprimer 3 feuilles/))
    expect(onImprimer).toHaveBeenCalled()
  })

  it('pas de bouton imprimer quand on ne le lui donne pas', () => {
    render(<Assemblage feuilles={assemblees} gateaux={gateaux}
      onOuvrir={() => {}} onFermer={() => {}} />)
    expect(screen.queryByText(/Imprimer/)).toBeNull()
  })
})
