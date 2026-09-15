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
const relireRecettes = vi.fn(async () => {})
let listesLues = 0

// Le sirop : compté en KILOS chez Odoo, fournée de 5,55 kg.
const sirop = {
  produit: 'SM. sirop Imbibage production KG', libelle: 'Sirop imbibage', unite: 'kg',
  tournee: 5.55, stock: 1.2, dejaFait: 0, reste: 5.55, mini: 0, maxi: 0,
  figes: [], figesNom: 'Monté sur place', ajustements: {}, tailles: [],
  photo: 'E- Tiramisu', etat: 'rupture',
  composants: [{ produit: 'MP- Sucre Granule', unite: 'g', besoin: 2000, stock: 0,
    dejaFait: 0, fabrique: false, ok: true }],
}

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/auth', () => ({ hasValidJwt: () => true, isAdmin: () => true }))
vi.mock('../lib/fabrication', () => ({ dernierEcran: () => null, garderEcran: () => {} }))
vi.mock('../lib/fabAnnexe', async importOriginal => {
  const vrai = await importOriginal()
  return {
    ...vrai,                                   // les VRAIES règles de calcul
    loadFabAnnexe: async () => { listesLues++; return [sirop] },
    loadToutFabAnnexe: async () => [{ ...sirop, pour: ['E- Tiramisu'] }],
    loadArticlesFabAnnexe: async () => [sirop],
    loadHistoriqueAnnexe: async () => [],
    declarer: (...a) => declarer(...a),
    envoyerAValider: (...a) => envoyerAValider(...a),
    repartirCuve: (...a) => repartirCuve(...a),
    relireRecettes: (...a) => relireRecettes(...a),
  }
})

const { default: FabAnnexe2SimpleView } = await import('./FabAnnexe2SimpleView')

beforeEach(() => {
  localStorage.clear(); declarer.mockClear(); envoyerAValider.mockClear()
  relireRecettes.mockClear(); listesLues = 0
})
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

// ============================================================
// LE BOUTON « METTRE À JOUR LES RECETTES ».
//
// « je ne veux pas attendre 30 min » (Layla, 2026-09-14). Le serveur garde les
// recettes une demi-heure ; le bouton les lui fait oublier. Mais vider le
// serveur ne suffit PAS : l'écran garde ses fiches déjà ouvertes de son côté.
// S'il ne les jette pas aussi, le bouton ne change rien à ce qu'on voit.
// ============================================================
describe('mettre à jour les recettes', () => {
  it('prévient le serveur ET rouvre la fiche chez Odoo', async () => {
    await ouvrirLaFiche()
    const avant = listesLues
    fireEvent.click(screen.getByText(/^← /))
    await waitFor(() => expect(screen.getByText('🔄 Mettre à jour les recettes')).toBeTruthy())
    fireEvent.click(screen.getByText('🔄 Mettre à jour les recettes'))
    await waitFor(() => expect(relireRecettes).toHaveBeenCalled())
    // et l'écran repart chercher les fiches au lieu de resservir les siennes
    await waitFor(() => expect(listesLues).toBeGreaterThan(avant))
  })
})

// « dans à faire montre le stock actuel des articles » (Layla, 2026-09-14),
// puis « si l'article existe, ne pas me dire "il existe" — avec une autre
// couleur » (2026-09-15) : le chiffre seul, et la couleur qui parle.
describe('la case « À faire »', () => {
  it('dit ce qu’il en reste, en grammes et en vert', async () => {
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
    // 1,2 kg chez Odoo → « 1 200 g » (les espaces fines varient)
    const vu = [...document.querySelectorAll('div')]
      .find(e => /^1.200 g$/.test((e.textContent || '').replace(/\u202f|\u00a0/g, ' ')))
    expect(vu).toBeTruthy()
    expect(vu.className).toMatch(/text-ok/)
  })
})

// « montrer l'article mère dans l'impression pour qu'on sache de quelle crème
// au beurre il s'agit » (Layla, 2026-09-14). Sur une feuille posée au plan de
// travail, le titre seul ne dit pas pour quel gâteau on travaille — l'écran,
// lui, a son fil d'Ariane juste au-dessus.
describe('l’impression de la fiche', () => {
  it('porte les gâteaux que l’article sert', async () => {
    await ouvrirLaFiche()
    await waitFor(() => expect(screen.getByText(/pour :/)).toBeTruthy())
    expect(screen.getByText(/pour :/).textContent).toBe('pour : Tiramisu')
  })
})

// ============================================================
// IMPRIMER LA FOURNÉE.
//
// « je veux avoir le choix de l'ancienne version et de la nouvelle. sauf que
// pour la nouvelle des fois j'aime bien modifier les quantités avant »
// (Layla, 2026-09-14).
// ============================================================
describe('le bouton imprimer', () => {
  it('ouvre le choix au lieu d’imprimer tout de suite', async () => {
    const print = vi.fn()
    window.print = print
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    await waitFor(() => expect(screen.getByText('🖨 Tu imprimes quoi ?')).toBeTruthy())
    expect(screen.getByText('Juste cette fiche')).toBeTruthy()
    expect(screen.getByText('Tout ce qui manque')).toBeTruthy()
    expect(print).not.toHaveBeenCalled()
  })

  it('« juste cette fiche » n’envoie qu’une feuille', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    await waitFor(() => expect(screen.getByText('Imprimer 1 feuille')).toBeTruthy())
  })

  it('la quantité se corrige AVANT d’imprimer, en grammes', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    const champ = await screen.findByLabelText(/Quantité de Sirop imbibage/)
    // 5,55 kg chez Odoo → 5 550 g dans le champ
    expect(champ.value.replace(/ | /g, ' ')).toBe('5 550')
    fireEvent.change(champ, { target: { value: '3000' } })
    await waitFor(() =>
      expect(screen.getByLabelText(/Quantité de Sirop imbibage/).value
        .replace(/ | /g, ' ')).toBe('3 000'))
  })
})
