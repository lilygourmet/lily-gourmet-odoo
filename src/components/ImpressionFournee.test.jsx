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
const feuilles = [
  { produit: 'SM. Creme Citron Production', libelle: 'Creme Citron Production',
    unite: 'g', stock: 0, qty: 7270, chemin: ['SM- 20 cm Vitrine (Citron)', 'SM. Creme Citron Production'],
    pour: [{ nom: 'SM- 20 cm Vitrine (Citron)', qty: 3480 },
           { nom: 'SM. Creme au Beurre Citron Production', qty: 3790 }], ingredients: [] },
  { produit: 'SM. Sirop Imbibage Production KG', libelle: 'Sirop Imbibage Production KG',
    unite: 'kg', stock: 11.51, qty: 0, chemin: ['SM- 20 cm Vitrine (Citron)', 'SM. Sirop Imbibage Production KG'],
    pour: [], ingredients: [] },
  { produit: 'SM- 20 cm Vitrine (Citron)', libelle: 'Vitrine citron · 20 cm',
    unite: 'u', stock: 0, qty: 29, chemin: ['SM- 20 cm Vitrine (Citron)'],
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
  it('ce qu’on a DÉJÀ s’écrit en vert', () => {
    poser()
    expect(nomDe('Sirop Imbibage Production KG').className).toMatch(/text-ok/)
    expect(screen.getByText('il en reste 11 510 g'.replace(/ /g, ' ')) ||
      screen.getByText(/il en reste/)).toBeTruthy()
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
