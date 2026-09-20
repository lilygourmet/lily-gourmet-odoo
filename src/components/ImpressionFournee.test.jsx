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

// La tête et ses deux composants, DANS L'ORDRE OÙ `feuillesAImprimer` les rend.
//
// ⚠️ LE GÂTEAU EST EN PREMIER. Ce fixture le mettait en dernier — l'ordre
// d'avant le 16/09, « le plus profond d'abord ». La règle a changé ce jour-là
// (« le parent en premier », Layla) mais pas ce fixture, et il a alors couvert
// un vrai bug : « juste cette fiche » imprimait la DERNIÈRE feuille, c'est-à-
// dire l'ingrédient le plus enfoui au lieu du gâteau qu'on a sous les yeux.
// `src/lib/feuillesAImprimer.test.js` dit l'ordre vrai : `f[0]` est le parent.
//
// ⚠️ `qty` (ce qu'on propose de faire) et `manque` (ce qui fait vraiment
// défaut) ne disent PAS la même chose : le sirop, il en reste 11,51 kg pour
// 8,12 de besoin — il n'en manque rien — mais l'app propose quand même une
// fournée de 11,1, pour en faire d'avance. C'est `manque` qui décide du vert.
const feuilles = [
  { produit: 'SM- 20 cm Vitrine (Citron)', libelle: 'Vitrine citron · 20 cm',
    unite: 'u', stock: 0, besoin: 29, manque: 29, qty: 29,
    chemin: ['SM- 20 cm Vitrine (Citron)'],
    pour: [], ingredients: [] },
  { produit: 'SM. Creme Citron Production', libelle: 'Creme Citron Production',
    unite: 'g', stock: 0, besoin: 7270, manque: 7270, qty: 7270,
    chemin: ['SM- 20 cm Vitrine (Citron)', 'SM. Creme Citron Production'],
    pour: [{ nom: 'SM- 20 cm Vitrine (Citron)', qty: 3480 },
           { nom: 'SM. Creme au Beurre Citron Production', qty: 3790 }], ingredients: [] },
  { produit: 'SM. Sirop Imbibage Production KG', libelle: 'Sirop Imbibage Production KG',
    unite: 'kg', stock: 11.51, besoin: 8.12, manque: 0, qty: 11.1,
    chemin: ['SM- 20 cm Vitrine (Citron)', 'SM. Sirop Imbibage Production KG'],
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

  // ⚠️ LA GARDE DU BUG DU 16/09 : « juste cette fiche » doit sortir LE GÂTEAU,
  // celui qu'on a sous les yeux — pas l'ingrédient du fond de la cascade.
  it('« juste cette fiche » garde LE GÂTEAU, et lui seul', () => {
    poser({ mode: 'seule' })
    expect(screen.getByText('Imprimer 1 feuille')).toBeTruthy()
    expect(screen.getByLabelText('Vitrine citron · 20 cm').disabled).toBe(true)
    expect(screen.queryByLabelText('Creme Citron Production')).toBeNull()
    expect(screen.queryByLabelText('Sirop Imbibage Production KG')).toBeNull()
  })

  // ⚠️ Le panneau de l'ACCUEIL (plusieurs gâteaux cochés) n'offrait aucun
  // choix : « dans imprimer, ça donne maintenant toujours imprimer la cascade,
  // pas juste la page même » (Layla, 2026-09-20). « Juste les fiches » doit y
  // sortir LES GÂTEAUX, pas un seul.
  it('« juste les fiches » garde TOUTES les têtes, pas la première', () => {
    const deuxGateaux = [
      ...feuilles,
      { produit: 'SM- 23 cm Vitrine (Fraise)', libelle: 'Vitrine fraise · 23 cm',
        unite: 'u', stock: 0, besoin: 12, manque: 12, qty: 12,
        chemin: ['SM- 23 cm Vitrine (Fraise)'], pour: [], ingredients: [] },
    ]
    render(<ChoixImpression feuilles={deuxGateaux} mode="seule" coches={coches} tapes={{}}
      onMode={() => {}} onCoche={() => {}} onQuantite={() => {}} onRendre={() => {}}
      onImprimer={() => {}} onFermer={() => {}} />)
    expect(screen.getByLabelText('Vitrine citron · 20 cm')).toBeTruthy()
    expect(screen.getByLabelText('Vitrine fraise · 23 cm')).toBeTruthy()
    // Et pas les composants : ce sont bien les gâteaux seuls.
    expect(screen.queryByLabelText('Creme Citron Production')).toBeNull()
    expect(screen.getByText('Imprimer 2 feuilles')).toBeTruthy()
    // Le mot change au pluriel : ce ne sont plus « cette fiche » mais les deux.
    expect(screen.getByText('Juste les fiches')).toBeTruthy()
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

// « je dois choisir quoi imprimer comme la cascade » (Layla, 2026-09-16) :
// depuis plusieurs gâteaux cochés, le même panneau que depuis une fiche —
// mais sans les deux façons d'imprimer, qui n'ont plus de sens là.
describe('le panneau ouvert depuis l’assemblage', () => {
  it('n’a pas les deux façons d’imprimer', () => {
    render(<ChoixImpression feuilles={feuilles} mode="tout" coches={coches} tapes={{}}
      sous="pour 3 gâteaux"
      onCoche={() => {}} onQuantite={() => {}} onRendre={() => {}}
      onImprimer={() => {}} onFermer={() => {}} />)
    expect(screen.queryByText('Juste cette fiche')).toBeNull()
    expect(screen.queryByText('Tout ce qui manque')).toBeNull()
  })

  it('mais garde les cases et les quantités', () => {
    const onCoche = vi.fn()
    render(<ChoixImpression feuilles={feuilles} mode="tout" coches={coches} tapes={{}}
      sous="pour 3 gâteaux"
      onCoche={onCoche} onQuantite={() => {}} onRendre={() => {}}
      onImprimer={() => {}} onFermer={() => {}} />)
    expect(screen.getByText('pour 3 gâteaux')).toBeTruthy()
    expect(screen.getByLabelText(/Quantité de Creme Citron/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Creme Citron Production'))
    expect(onCoche).toHaveBeenCalledWith('SM. Creme Citron Production', false)
  })
})
