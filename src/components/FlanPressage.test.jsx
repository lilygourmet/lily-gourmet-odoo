// @vitest-environment jsdom
// ============================================================
// LE FLAN, DU DOIGT À ODOO.
//
// « Tu as validé flan ; le crispy y est, combien de base tu as coupé ? »
// (Layla, 2026-09-11.) Avant, il fallait entrer dans « base de flan », dire
// « c'est fait », ressortir, redire « c'est fait ». Maintenant la question se
// pose en validant le flan.
//
// Ce test garde les deux choses qui comptent : le bouton n'est plus verrouillé,
// et la BASE part chez Odoo AVANT le flan — sinon l'ordre du flan consomme des
// bases qui n'existent pas, et le sablé crispy reste éternellement en stock.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const envoyes = []
const declarer = vi.fn(async a => { envoyes.push(['declarer', a.produit, a.qty]); return { erreur: null } })
const envoyerAValider = vi.fn(async (a, q) => { envoyes.push(['valider', a.produit, q]); return { erreur: null } })

// La vraie fiche du flan, relevée le 2026-09-11.
const flan = {
  produit: 'SM- flan vanille 20 cm', unite: 'u',
  tournee: 1, stock: 0, dejaFait: 0, reste: 2, mini: 0, maxi: 0,
  figes: [], figesNom: 'Monté sur place', ajustements: {}, tailles: [],
  photo: 'E- Flan Vanille Pécan', etat: 'rupture',
  composants: [
    { produit: 'MP- Lait UHT', unite: 'kg', besoin: 0.5, stock: 40.82,
      dejaFait: 0, fabrique: false, ok: true },
    { produit: 'SM- base flan vanille 20 cm', unite: 'u', besoin: 1, stock: 0,
      dejaFait: 0, fabrique: true, ok: false, tourneeTaille: 1,
      recette: [{ produit: 'SM. Sable Crispy', qty: 290, unite: 'g' }],
      enfants: [{ produit: 'SM. Sable Crispy', unite: 'g', besoin: 290, stock: 2576,
        dejaFait: 0, fabrique: true, ok: true }] },
  ],
}

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/auth', () => ({ hasValidJwt: () => true }))
vi.mock('../lib/fabrication', () => ({ dernierEcran: () => null, garderEcran: () => {} }))
vi.mock('../lib/fabAnnexe', async importOriginal => {
  const vrai = await importOriginal()
  return {
    ...vrai,                                   // les VRAIES règles de calcul
    loadFabAnnexe: async () => [flan],
    loadToutFabAnnexe: async () => [],
    loadArticlesFabAnnexe: async () => [flan],
    loadHistoriqueAnnexe: async () => [],
    declarer: (...a) => declarer(...a),
    envoyerAValider: (...a) => envoyerAValider(...a),
    repartirCuve: async () => [],
  }
})

const { default: FabAnnexe2SimpleView } = await import('./FabAnnexe2SimpleView')

beforeEach(() => { localStorage.clear(); envoyes.length = 0; declarer.mockClear(); envoyerAValider.mockClear() })
afterEach(cleanup)

const ouvrirLeFlan = async () => {
  render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
  await waitFor(() => expect(screen.getByText('flan vanille 20 cm')).toBeTruthy())
  fireEvent.click(screen.getByText('flan vanille 20 cm'))
  await waitFor(() => expect(screen.getByText("C'est fait")).toBeTruthy())
}

describe('le flan et sa base', () => {
  it('la base ne verrouille plus le bouton', async () => {
    await ouvrirLeFlan()
    expect(screen.getByText("C'est fait").disabled).toBe(false)
  })

  it('elle s’annonce « à presser en validant », pas en rouge', async () => {
    await ouvrirLeFlan()
    expect(screen.getByText('à presser en validant')).toBeTruthy()
  })

  it('valider le flan demande d’abord combien de bases ont été pressées', async () => {
    await ouvrirLeFlan()
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Tu en as pressé combien ?')).toBeTruthy())
    // Le nombre qu'il faut est déjà rempli : une base pour un flan.
    expect(screen.getByText('base flan vanille 20 cm')).toBeTruthy()
  })

  it('⚠️ la BASE part chez Odoo AVANT le flan', async () => {
    await ouvrirLeFlan()
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Tu en as pressé combien ?')).toBeTruthy())
    fireEvent.click(screen.getByText("C'est bon"))
    await waitFor(() => expect(envoyerAValider).toHaveBeenCalled())
    expect(envoyes).toEqual([
      ['declarer', 'SM- base flan vanille 20 cm', 1],
      ['valider', 'SM- flan vanille 20 cm', 1],
    ])
  })

  it('la base part réservée au flan, pour que le sablé se décompte', async () => {
    await ouvrirLeFlan()
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Tu en as pressé combien ?')).toBeTruthy())
    fireEvent.click(screen.getByText("C'est bon"))
    await waitFor(() => expect(declarer).toHaveBeenCalled())
    expect(declarer.mock.calls[0][0].pour).toBe('SM- flan vanille 20 cm')
    expect(declarer.mock.calls[0][0].unite).toBe('u')
  })
})
