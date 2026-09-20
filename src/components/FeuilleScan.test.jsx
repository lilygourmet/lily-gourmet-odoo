// @vitest-environment jsdom
// ============================================================
// CE QUE FAIT VRAIMENT LE SCAN.
//
// « Tu as testé quand scanné ce que ça fait ? » (Layla, 2026-09-20) — et la
// réponse honnête était NON : j'avais vérifié l'API, pas le geste. Ce fichier
// suit les deux papiers depuis le QR :
//   • celui de l'économe ouvre un écran avec UN bouton, sans mot de passe ;
//   • celui du pâtissier n'ouvre rien : il l'emmène droit à la déclaration.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const ID = '11111111-2222-3333-4444-555555555555'
const feuille = {
  id: ID, jour: '2026-09-20', produit: 'SM. Creme Citron Gingembre',
  libelle: 'Crème citron gingembre', unite: 'g', qty_prevue: 11844,
  pour: 'SM- Tarte Citron Gin 23 cm', liasse: 'l1', sans_economat: false,
  chemin: ['SM- Tarte Citron Gin 23 cm', 'SM. Creme Citron Gingembre'],
  imprime_le: new Date(Date.now() - 12 * 60000).toISOString(),
  donne_le: null, donne_par: null, declare_le: null, pas_faite_le: null,
}

const donner = vi.fn(async () => ({ feuille: { ...feuille, donne_le: 'maintenant' }, reste: 2 }))
vi.mock('../lib/feuilles', async importOriginal => ({
  ...await importOriginal(),
  lireFeuille: async () => feuille,
  donner,
}))

const { default: FeuilleScanView } = await import('./FeuilleScanView')

/** Se mettre à l'adresse du QR, et rendre `location.replace` observable. */
const auQr = (don) => {
  const remplace = vi.fn()
  delete window.location
  window.location = {
    search: `?feuille=${ID}${don ? '&don=1' : ''}`,
    origin: 'https://lg.test',
    replace: remplace,
  }
  return remplace
}

beforeEach(() => { donner.mockClear() })
afterEach(cleanup)

describe('le QR de l’économe', () => {
  it('montre l’article, le gâteau, et UN seul bouton', async () => {
    auQr(true)
    render(<FeuilleScanView />)
    await screen.findByText('Crème citron gingembre')
    expect(screen.getByText(/Demande à l’économat/)).toBeTruthy()
    // (l'espace des milliers est une espace fine : on cherche les deux)
    expect(screen.getByText(/11[\u202f\u00a0 ]844/)).toBeTruthy()
    expect(screen.getByText('✓ Donné')).toBeTruthy()
    // ⚠️ Rien d'autre : pas de mot de passe, pas de quantité à taper, pas de
    // « pas faite ». Les mains sont farineuses.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/Pas faite/i)).toBeNull()
  })

  it('« Donné » enregistre, et dit ce qui reste à servir', async () => {
    auQr(true)
    render(<FeuilleScanView />)
    fireEvent.click(await screen.findByText('✓ Donné'))
    await waitFor(() => expect(donner).toHaveBeenCalledWith(ID, null))
    // Le compteur de la liasse : « ne referme pas le tiroir tout de suite ».
    expect(await screen.findByText(/Encore 2 demandes/)).toBeTruthy()
  })
})

describe('le QR du pâtissier', () => {
  it('n’ouvre AUCUNE page : il emmène droit à la déclaration', async () => {
    const remplace = auQr(false)
    render(<FeuilleScanView />)
    await waitFor(() => expect(remplace).toHaveBeenCalled())
    const url = remplace.mock.calls[0][0]
    // Le bon onglet, le bon article, et l'ordre d'aller droit au chiffre.
    expect(url).toMatch(/view=fabrication-annexe-2/)
    expect(url).toMatch(/declarer=1/)
    // ⚠️ LE CHEMIN ENTIER : une crème n'est pas au catalogue, elle ne s'ouvre
    // qu'en descendant depuis son gâteau. Le nommer seule renvoyait à l'accueil.
    const chemin = JSON.parse(decodeURIComponent(url.split('chemin=')[1]))
    expect(chemin).toEqual(['SM- Tarte Citron Gin 23 cm', 'SM. Creme Citron Gingembre'])
  })

  it('ne propose ni « pas faite » ni quantité à taper', async () => {
    auQr(false)
    render(<FeuilleScanView />)
    await waitFor(() => expect(screen.getByText(/On t’emmène/)).toBeTruthy())
    // Scanner VEUT DIRE « je l'ai faite » (Layla, 2026-09-20) : rien à choisir.
    expect(screen.queryByText(/Pas faite/i)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
