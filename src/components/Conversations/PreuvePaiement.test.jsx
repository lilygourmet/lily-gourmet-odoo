// @vitest-environment jsdom
// ============================================================
// « PAS DE POSSIBILITÉ DE TRANSFÉRER SI PAS DÉFINI » (Layla, 2026-09-19).
//
// Quand la commerciale attache une preuve de paiement, elle doit dire COMMENT
// le client a payé : virement bancaire, ou carte en ligne. Les deux ne
// demandent pas le même travail — le virement se retrouve sur le relevé de la
// banque, la CB est déjà encaissée — et l'écran des paiements les sépare.
//
// Deux règles à tenir, et ce fichier ne teste qu'elles :
//   • RIEN N'EST COCHÉ D'AVANCE (« ne définis pas une preuve ») ;
//   • tant que rien n'est coché, on ne peut pas transférer.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const markPaymentProof = vi.fn(async (id, ref, nom, montant, moyen) =>
  ({ id, is_payment_proof: true, payment_method: moyen }))
const dit = vi.fn()

// Une conversation d'un message, avec une pièce jointe : c'est la pièce jointe
// qui fait apparaître le bouton « marquer comme preuve de paiement ».
const message = {
  id: 'm1', conversation_id: 'c1', sender_type: 'client',
  body: 'Bonjour *Meryem*, Votre commande numéro S48587 est confirmée',
  media_url: 'recu.jpg', media_type: 'image/jpeg', sent_at: '2026-09-19T09:00:00Z',
}

vi.mock('../../lib/conversations', () => ({
  loadConversation: async () => ({ id: 'c1', client_name: 'Meryem', client_phone: '06', status: 'ouverte', assigned_to: 'u1' }),
  loadMessages: async () => [message],
  markPaymentProof,
  unmarkPaymentProof: vi.fn(),
  loadQuickReplies: async () => [],
  loadConvLabels: async () => [],
  loadClosedBy: async () => null,
  getMediaSignedUrl: async () => 'blob:recu',
  CONV_LABELS: [],
  assignConversation: vi.fn(), sendMessage: vi.fn(), uploadConversationMedia: vi.fn(),
  closeConversation: vi.fn(), reopenConversation: vi.fn(), suggestReplies: vi.fn(),
  correctText: vi.fn(), deleteMessage: vi.fn(), updateConversationClientName: vi.fn(),
  setConversationNameFromOdoo: vi.fn(), setConversationUnread: vi.fn(),
  searchOrders: async () => [], setConversationLabels: vi.fn(),
  reorderQuickReplies: vi.fn(), recordDevisTraitement: vi.fn(),
  confirmDevis: vi.fn(), cancelDevis: vi.fn(),
}))
vi.mock('../../lib/toast', () => ({
  toast: Object.assign((m) => dit(m), { success: () => {}, error: () => {}, info: () => {} }),
}))
vi.mock('../../lib/confirmDialog', () => ({ confirmDialog: async () => true }))
vi.mock('../../lib/auth', () => ({
  formatRelativeTime: () => '',
  canMarkPaymentProof: () => true,
}))
vi.mock('../../lib/modifications', () => ({ createModification: vi.fn() }))
// Le fil s'abonne aux changements en chaînant plusieurs `.on(...)` : le faux
// canal doit donc se rendre lui-même à chaque fois.
vi.mock('../../lib/supabase', () => {
  const canal = {}
  canal.on = () => canal
  canal.subscribe = () => canal
  return { supabase: { channel: () => canal, removeChannel: () => {} } }
})
vi.mock('./ForwardModal', () => ({ default: () => null }))
vi.mock('./NewConversationModal', () => ({ default: () => null }))
vi.mock('../OrderEditModal', () => ({ default: () => null }))
vi.mock('../ClientEditModal', () => ({ default: () => null }))

const { default: ConversationDetail } = await import('./ConversationDetail')

const ouvrirLeFormulaire = async () => {
  render(<ConversationDetail conversationId="c1" user={{ id: 'u1' }} onBack={() => {}} />)
  const b = await screen.findByTitle('Marquer comme preuve de paiement')
  fireEvent.click(b)
  await screen.findByText('Preuve de paiement')
}

// jsdom ne sait pas faire défiler : le fil s'y essaie au chargement.
Element.prototype.scrollIntoView = () => {}

beforeEach(() => { markPaymentProof.mockClear(); dit.mockClear() })
afterEach(cleanup)

describe('le formulaire « preuve de paiement »', () => {
  it('n’a RIEN de coché d’avance', async () => {
    await ouvrirLeFormulaire()
    // Les deux cases existent, aucune n'est choisie : c'est la commerciale qui
    // sait, pas nous. Un choix pré-coché se valide sans être lu.
    expect(screen.getByText('Virement').closest('button').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('CB').closest('button').getAttribute('aria-pressed')).toBe('false')
  })

  it('refuse de transférer tant que le moyen n’est pas dit', async () => {
    await ouvrirLeFormulaire()
    const transferer = screen.getByText('Transférer aux paiements')
    expect(transferer.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(transferer)
    // Rien n'est parti…
    expect(markPaymentProof).not.toHaveBeenCalled()
    // …et on dit POURQUOI, à voix haute : au doigt, l'infobulle n'existe pas.
    expect(dit).toHaveBeenCalledWith(expect.stringMatching(/virement ou CB/i))
  })

  it('transfère une fois le moyen choisi, et le transmet', async () => {
    await ouvrirLeFormulaire()
    fireEvent.click(screen.getByText('Virement').closest('button'))
    expect(screen.getByText('Transférer aux paiements').getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(screen.getByText('Transférer aux paiements'))
    await waitFor(() => expect(markPaymentProof).toHaveBeenCalled())
    // 5e argument : le moyen de paiement.
    expect(markPaymentProof.mock.calls[0][4]).toBe('virement')
  })

  it('et la CB passe pareil', async () => {
    await ouvrirLeFormulaire()
    fireEvent.click(screen.getByText('CB').closest('button'))
    fireEvent.click(screen.getByText('Transférer aux paiements'))
    await waitFor(() => expect(markPaymentProof).toHaveBeenCalled())
    expect(markPaymentProof.mock.calls[0][4]).toBe('cb')
  })
})
