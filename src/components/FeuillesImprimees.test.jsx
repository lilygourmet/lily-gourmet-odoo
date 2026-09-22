// @vitest-environment jsdom
// ============================================================
// CE QUI SORT VRAIMENT DE L'IMPRIMANTE.
//
// « J'ai imprimé Voile ce matin, ça m'a sorti que la demande d'économat —
// pourquoi ? » (Layla, 2026-09-22).
//
// Jusqu'ici, RIEN ne vérifiait les pages imprimées : les tests couvraient le
// panneau « Tu imprimes quoi ? » et le calcul des quantités, jamais le papier.
// C'est pourtant le seul endroit où l'atelier lit.
//
// Une fournée qui réclame de la matière première doit sortir DEUX pages :
// la demande pour l'économe, puis la recette pour le pâtissier.
// ============================================================
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { FeuillesImpression } from './ImpressionFournee'

afterEach(cleanup)

// La vraie Voile Mangue Passion du 22/09 : 1 490 g, cinq ingrédients, tous
// achetés — donc tous à demander à l'économe.
const voile = {
  produit: 'SM. Voile Mangue Passion', libelle: 'Voile Mangue Passion',
  unite: 'g', qty: 1490, stock: 765, besoin: 1490, manque: 725,
  chemin: ['SM. Voile Mangue Passion'], pour: [], feuilleId: 'jeton-1',
  ingredients: [
    { produit: 'MP- Purée de Mangue', unite: 'g', besoin: 600, fabrique: false },
    { produit: 'MP- Purée de Passion', unite: 'g', besoin: 600, fabrique: false },
    { produit: 'MP- Sucre Granule', unite: 'kg', besoin: 0.2, fabrique: false },
    { produit: 'MP- Glucose Atomisé', unite: 'kg', besoin: 0.2, fabrique: false },
    { produit: 'MP- Pectine NH', unite: 'kg', besoin: 0.056, fabrique: false },
  ],
}

// Une fournée dont tout est déjà au frigo : rien à demander.
const monteSurPlace = {
  ...voile, produit: 'SM- Gianduja 10 pers', libelle: 'Gianduja 10 pers',
  unite: 'u', qty: 9, feuilleId: 'jeton-2',
  ingredients: [{ produit: 'SM. Mousse Gianduja', unite: 'g', besoin: 6228, fabrique: true }],
}

const pages = () => [...document.querySelectorAll('article.feuille-impr')]

describe('une fournée qui réclame de la matière première', () => {
  it('sort DEUX pages : la demande, puis la recette', () => {
    render(<FeuillesImpression feuilles={[voile]} />)
    expect(pages().length).toBe(2)
  })

  // ⚠️ « La demande passe avant sa recette : on ne fabrique pas ce qu'on n'a
  // pas encore été chercher » (Layla).
  it('la demande à l’économat vient en PREMIER', () => {
    render(<FeuillesImpression feuilles={[voile]} />)
    expect(pages()[0].classList.contains('feuille-economat')).toBe(true)
    expect(pages()[1].classList.contains('feuille-economat')).toBe(false)
  })

  it('la page de l’économe porte ce qu’il faut aller chercher', () => {
    render(<FeuillesImpression feuilles={[voile]} />)
    const eco = pages()[0]
    expect(eco.textContent).toMatch(/Demande à l['’]économat/)
    expect(eco.textContent).toContain('Purée de Mangue')
    expect(eco.textContent).toContain('Pectine NH')
  })

  // ⚠️ LA PAGE DU PÂTISSIER : le gros chiffre à faire et la recette entière.
  it('la page du labo porte « À faire », le chiffre et la recette', () => {
    render(<FeuillesImpression feuilles={[voile]} />)
    const labo = pages()[1]
    expect(labo.textContent).toContain('À faire')
    // ⚠️ L'espace des milliers est une ESPACE FINE INSÉCABLE, pas un blanc ordinaire.
    expect(labo.textContent).toMatch(/1[\u202f\u00a0 ]490 g/)
    expect(labo.textContent).toContain('Purée de Mangue')
  })

  // Deux papiers, deux gestes : ils ne doivent pas porter le même QR.
  it('chaque page a son carré, et ils ne disent pas la même chose', () => {
    render(<FeuillesImpression feuilles={[voile]} />)
    expect(pages()[0].textContent).toMatch(/L['’]économe scanne/)
    expect(pages()[1].textContent).toContain('Scanne pour déclarer')
  })
})

describe('une fournée qui n’a rien à aller chercher', () => {
  it('ne sort QU’UNE page : sa recette', () => {
    render(<FeuillesImpression feuilles={[monteSurPlace]} />)
    expect(pages().length).toBe(1)
    expect(pages()[0].classList.contains('feuille-economat')).toBe(false)
  })
})

describe('une cascade entière', () => {
  it('chaque article a sa page, la demande collée à sa recette', () => {
    render(<FeuillesImpression feuilles={[monteSurPlace, voile]} />)
    // 1 page pour le gâteau + 2 pour la voile
    expect(pages().length).toBe(3)
    expect(pages()[1].classList.contains('feuille-economat')).toBe(true)
  })
})
