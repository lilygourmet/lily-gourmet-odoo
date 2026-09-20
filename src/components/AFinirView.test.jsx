// @vitest-environment jsdom
// ============================================================
// « À FINIR » : du vrac qui reste jusqu'aux ordres qui partent.
//
// « Quand je clique dessus, ça doit me donner son dispatch » (Layla,
// 2026-09-20) — combien en 10 pers, combien en indiv, et ce qu'il en reste.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const vrac = {
  produit: 'SM. Gélée Mangue Ananas Pistache', libelle: 'Gélée mangue ananas pistache',
  unite: 'g', stock: 2030, resteG: 2030, photo: 'E- Pistache fleur d’oranger',
  note: 'coulée — 10 pers, indiv',
}
const formats = [
  { produit: 'SM. Gélée Mangue Ananas Pistache 10 pers', libelle: 'Gélée 10 pers',
    unite: 'u', uniteVrac: 'g', parUnite: 140 },
  { produit: 'SM. Gélée Mangue Ananas Pistache Indiv', libelle: 'Gélée indiv',
    unite: 'u', uniteVrac: 'g', parUnite: 22 },
]

const declarer = vi.fn(async () => ({ produit: 'x', qty: 1, ordre: 'MO/1', erreur: null }))
// Ce que le moule demande en plus du vrac : par défaut, tout est là.
let composantsDuMoule = [
  { produit: 'SM. Biscuit Gianduja Indiv', unite: 'u', besoin: 10, stock: 50,
    dejaFait: 0, fabrique: true, ok: true },
]
let liste = [vrac]

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
const toasts = []
vi.mock('../lib/toast', () => ({
  toast: Object.assign(m => toasts.push(String(m)), { success: () => {}, error: () => {} }),
}))
vi.mock('../lib/auth', () => ({ hasValidJwt: () => true, isAdmin: () => true }))
vi.mock('../lib/fabAnnexe', async importOriginal => ({
  ...await importOriginal(),          // les VRAIES règles de verrou
  declarer: (...a) => declarer(...a),
  loadArticleFabAnnexe: async produit => ({
    produit, tourneeTaille: 10, composants: composantsDuMoule, recette: [],
  }),
}))
vi.mock('../lib/miseEnForme', async importOriginal => ({
  ...await importOriginal(),          // les VRAIS calculs de dispatch
  loadAFinir: async () => liste,
  loadFormats: async () => formats,
}))

const { default: AFinirView } = await import('./AFinirView')

beforeEach(() => {
  vi.clearAllMocks(); liste = [vrac]
  composantsDuMoule = [{ produit: 'SM. Biscuit Gianduja Indiv', unite: 'u', besoin: 10,
    stock: 50, dejaFait: 0, fabrique: true, ok: true }]
})
afterEach(cleanup)

/** Ouvre le vrac et attend ses moules. */
const ouvrir = async () => {
  render(<AFinirView user={{ id: 'u1' }} onNavigate={() => {}} />)
  fireEvent.click(await screen.findByText('Gélée mangue ananas pistache'))
  await screen.findByText('Tu en as fait combien ?')
}

describe('la liste de ce qui attend', () => {
  it('montre ce qu’il en reste et ce qu’on en fait', async () => {
    render(<AFinirView user={{ id: 'u1' }} onNavigate={() => {}} />)
    expect(await screen.findByText('Gélée mangue ananas pistache')).toBeTruthy()
    expect(screen.getByText(/2[\u00a0\u00a0 ]030 g/)).toBeTruthy()
    expect(screen.getByText('coulée — 10 pers, indiv')).toBeTruthy()
  })

  it('rien à finir se dit en deux mots', async () => {
    liste = []
    render(<AFinirView user={{ id: 'u1' }} onNavigate={() => {}} />)
    expect(await screen.findByText('Tout est fini')).toBeTruthy()
  })
})

describe('le dispatch', () => {
  it('propose ses moules, et refuse de partir à vide', async () => {
    await ouvrir()
    expect(screen.getByText('Gélée 10 pers')).toBeTruthy()
    expect(screen.getByText('Gélée indiv')).toBeTruthy()
    fireEvent.click(screen.getByText("C'est fait"))
    expect(declarer).not.toHaveBeenCalled()
  })

  it('compte ce que la recette prend, et ce qu’il restera', async () => {
    await ouvrir()
    // 10 pers × 5 = 700 g sur les 2 030 qui restent.
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByLabelText('Plus Gélée 10 pers'))
    expect(screen.getByText(/700 g/)).toBeTruthy()
    // Le reste suit tout seul : 2 030 − 700 = 1 330.
    expect(screen.getByText(/1[\u00a0\u00a0 ]330 g/)).toBeTruthy()
  })

  it('déclare un ordre par moule servi', async () => {
    await ouvrir()
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByLabelText('Plus Gélée 10 pers'))
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(declarer).toHaveBeenCalledTimes(1))
    expect(declarer.mock.calls[0][0]).toMatchObject({
      produit: 'SM. Gélée Mangue Ananas Pistache 10 pers', qty: 5, unite: 'u',
    })
    // La recette tombe juste : aucune consigne imposée à Odoo.
    expect(declarer.mock.calls[0][0].ajustements).toBeNull()
  })

  // ⚠️ LA RÈGLE DE LAYLA : « s'il ne reste rien, le reste de la crème théorique
  // doit rentrer dans le produit ».
  it('« rien » fait rentrer tout le vrac dans les gâteaux', async () => {
    await ouvrir()
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByLabelText('Plus Gélée 10 pers'))
    fireEvent.click(screen.getByText('rien'))
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(declarer).toHaveBeenCalled())
    expect(declarer.mock.calls[0][0].ajustements)
      .toEqual({ 'SM. Gélée Mangue Ananas Pistache': 2030 })
  })

  // ⚠️ LA PORTE DÉROBÉE QU'IL NE FAUT PAS LAISSER OUVERTE : un moule a
  // d'autres composants que le vrac qu'on répartit. Sans ce verrou, deux
  // doigts ici faisaient consommer à Odoo un crémeux qui n'existe pas — alors
  // que l'écran de fabrication l'interdit depuis toujours.
  it('refuse de couler dans un moule dont un composant manque', async () => {
    composantsDuMoule = [{ produit: 'SM. Cremeux Gianduja', libelle: 'Crémeux gianduja',
      unite: 'u', besoin: 10, stock: 0, dejaFait: 0, fabrique: true, ok: false }]
    await ouvrir()
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByLabelText('Plus Gélée 10 pers'))
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(toasts.at(-1)).toMatch(/manque/i))
    expect(declarer).not.toHaveBeenCalled()
  })

  // ⚠️ On ne coule pas plus que ce qu'on a : 20 × 140 g = 2 800 g pour 2 030.
  it('refuse d’en couler plus qu’il n’en reste', async () => {
    await ouvrir()
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByLabelText('Plus Gélée 10 pers'))
    expect(screen.getByText(/plus que ce qu’il te reste/)).toBeTruthy()
    fireEvent.click(screen.getByText("C'est fait"))
    expect(declarer).not.toHaveBeenCalled()
  })
})
