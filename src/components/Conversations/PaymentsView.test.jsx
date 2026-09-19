// @vitest-environment jsdom
// ============================================================
// « ILS NE DOIVENT PAS LES MÉLANGER » (Layla, 2026-09-19).
//
// Un virement bancaire, il faut le retrouver sur le relevé de la banque ; une
// CB en ligne est déjà encaissée. Deux travaux différents, donc deux familles
// que l'écran ne montre jamais ensemble : **il n'y a pas de bouton « Tout »**.
//
// Et « la couleur seule ne suffit pas » : partout où la couleur apparaît, le
// mot est écrit à côté.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

// Deux virements (dont un à valider), une CB à valider, et une vieille preuve
// d'avant le 19/09 qui n'a aucun moyen enregistré.
const preuves = [
  { id: 'v1', payment_method: 'virement', payment_client_name: 'Meryem Alaoui',
    payment_order_ref: 'S48587', payment_amount: 450, sent_at: '2026-09-19T09:00:00Z',
    conversation: { client_phone: '06' } },
  { id: 'v2', payment_method: 'virement', payment_client_name: 'Nadia Idrissi',
    payment_order_ref: 'S48630', payment_amount: 2700, sent_at: '2026-09-19T08:00:00Z',
    payment_validated_at: '2026-09-19T10:00:00Z', conversation: { client_phone: '06' } },
  { id: 'c1', payment_method: 'cb', payment_client_name: 'Sofia Bennani',
    payment_order_ref: 'S48612', payment_amount: 1200, sent_at: '2026-09-19T07:00:00Z',
    conversation: { client_phone: '06' } },
  { id: 'x1', payment_method: null, payment_client_name: 'Preuve ancienne',
    payment_order_ref: 'S40000', payment_amount: 300, sent_at: '2026-05-01T07:00:00Z',
    conversation: { client_phone: '06' } },
]

vi.mock('../../lib/conversations', () => ({
  loadPaymentsToValidate: async () => preuves,
  validatePayment: vi.fn(), rejectPayment: vi.fn(),
  getMediaSignedUrl: async () => null,
  lirePreuvesPaiement: vi.fn(), loadPayeursLus: async () => ({}),
}))
vi.mock('../../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../../lib/auth', () => ({ canValidatePayments: () => true }))

const { default: PaymentsView } = await import('./PaymentsView')

afterEach(() => { cleanup(); localStorage.clear() })

const poser = async () => {
  render(<PaymentsView user={{ id: 'u1' }} />)
  await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull())
}

describe('Paiements à valider', () => {
  it('n’a PAS de bouton « Tout »', async () => {
    await poser()
    expect(screen.queryByText(/^Tout/)).toBeNull()
  })

  it('s’ouvre sur les virements, et ne montre QUE ceux-là', async () => {
    await poser()
    expect(screen.getByText('Meryem Alaoui')).toBeTruthy()
    // La CB et la vieille preuve ne sont pas là : on ne mélange pas.
    expect(screen.queryByText('Sofia Bennani')).toBeNull()
    expect(screen.queryByText('Preuve ancienne')).toBeNull()
  })

  it('bascule sur les CB, et les virements disparaissent', async () => {
    await poser()
    fireEvent.click(screen.getByText(/💳 CB \(/))
    await waitFor(() => expect(screen.getByText('Sofia Bennani')).toBeTruthy())
    expect(screen.queryByText('Meryem Alaoui')).toBeNull()
  })

  // ⚠️ Sans cette famille, les 570 preuves d'avant le 19/09 seraient devenues
  // INVISIBLES — aucune des deux familles ne les réclame.
  it('garde une famille pour les preuves d’avant, sans moyen enregistré', async () => {
    await poser()
    fireEvent.click(screen.getByText(/Non précisé \(/))
    await waitFor(() => expect(screen.getByText('Preuve ancienne')).toBeTruthy())
  })

  it('écrit le MOT sur chaque carte, pas seulement la couleur', async () => {
    await poser()
    const carte = screen.getByText('Meryem Alaoui').closest('div.rounded-2xl')
    expect(within(carte).getByText(/VIREMENT/)).toBeTruthy()
  })

  it('compte et totalise chaque famille à part', async () => {
    await poser()
    // À valider : un seul virement (l'autre est validé), une seule CB.
    expect(screen.getByText(/🏦 Virement \(1\)/)).toBeTruthy()
    expect(screen.getByText(/💳 CB \(1\)/)).toBeTruthy()
    // Et les deux totaux ne se mélangent pas non plus. On vise le cadre du
    // total, pas la carte : le même montant est écrit aux deux endroits.
    const totalDe = t => screen.getByText(t).parentElement
    expect(within(totalDe(/🏦 Virement à valider/)).getByText('450 DH')).toBeTruthy()
    expect(within(totalDe(/💳 CB à valider/)).getByText('1 200 DH')).toBeTruthy()
  })

  it('les comptes du haut suivent la famille choisie', async () => {
    await poser()
    // Virements : 1 à valider, 1 traité.
    expect(screen.getByText('À valider (1)')).toBeTruthy()
    expect(screen.getByText('Traités (1)')).toBeTruthy()
    fireEvent.click(screen.getByText(/💳 CB \(/))
    // CB : 1 à valider, aucune traitée.
    await waitFor(() => expect(screen.getByText('Traités (0)')).toBeTruthy())
  })
})
