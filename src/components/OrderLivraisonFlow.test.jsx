// @vitest-environment jsdom
// ============================================================
// AJOUTER UNE LIVRAISON À UNE COMMANDE : LE PARCOURS EN ENTIER.
//
// « Si je rajoute une livraison à un client déjà confirmé, qu'est-ce qui
// changera ? » (Layla, 2026-09-15) — rien, avant. Maintenant deux questions,
// dans cet ordre, et jamais rien d'automatique :
//
//   1. « Cette commande devient une livraison » → décaler l'heure ?
//   2. « Prévenir le client maintenant ? »      → envoyer le message ?
//
// ⚠️ Ce que ce test garde surtout : RIEN ne part au client sans un oui
// explicite. « L'envoi au client reste un choix » (Layla).
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const updateOrderDate = vi.fn(async () => ({}))
const addOrderLine = vi.fn(async () => ({}))
const sendTemplate = vi.fn(async () => ({}))
const reponses = []                       // ce que Layla répond aux questions
const confirmDialog = vi.fn(async () => (reponses.length ? reponses.shift() : false))

const lignes = []                         // ce que la commande contient
vi.mock('../lib/commande', () => ({
  loadOrderLines: async () => lignes.map(l => ({ ...l })),
  addOrderLine: (...a) => addOrderLine(...a),
  updateOrderLine: async () => ({}),
  deleteOrderLine: async () => ({}),
  addOrderWarning: async () => ({}),
  removeOrderWarning: async () => ({}),
  updateOrderDate: (...a) => updateOrderDate(...a),
  loadOrderCatalog: async () => [],
  loadOrderProduct: async () => null,
  loadWarehouses: async () => [],
  setOrderWarehouse: async () => ({}),
  removeOrderPhoto: async () => ({}),
  syncManufacturingOrders: async () => ({}),
}))
vi.mock('../lib/deliveries', () => ({
  loadLivreurs: async () => [], loadDeliveryStates: async () => ({}),
  assignDelivery: async () => ({}), setLivraisonLocalisation: async () => ({}),
}))
vi.mock('../lib/conversations', () => ({
  recordDevisTraitement: async () => ({}), loadDevisPhotos: async () => [],
  sendTemplate: (...a) => sendTemplate(...a),
}))
vi.mock('../lib/modifications', () => ({ createModification: async () => ({}) }))
vi.mock('./ProductConfigurator', () => ({ ConfiguratorModal: () => null, PRICE_EDITABLE: new Set() }))
vi.mock('./CakeDayPlanning', () => ({ default: () => null }))
vi.mock('./CopyableRef', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (...a) => confirmDialog(...a) }))
vi.mock('../lib/photoCompress', () => ({ filePhoto: async () => null }))
vi.mock('../lib/auth', () => ({ canSeeWatiInfo: () => true }))

const { default: OrderEditModal } = await import('./OrderEditModal')

// Une commande CONFIRMÉE, retrait à 15h, chez un client qui a WhatsApp.
const commande = {
  id: 42, name: 'S52797', state: 'sale', clientName: 'Mme Alaoui',
  clientPhone: '212661234567', deliveryAt: '2026-09-16 14:00:00',
  slotText: '', amountText: '450 MAD', productLines: [],
}
const user = { id: 'u1', role: 'admin' }

beforeEach(() => {
  lignes.length = 0
  reponses.length = 0
  updateOrderDate.mockClear(); sendTemplate.mockClear(); confirmDialog.mockClear()
})
afterEach(cleanup)

const ouvrir = async () => {
  render(<OrderEditModal order={commande} onClose={() => {}} onChanged={() => {}} user={user} embedded />)
  await waitFor(() => expect(screen.getByText('Mme Alaoui')).toBeTruthy())
}

/** ⚠️ Il y a DEUX boutons « Enregistrer » quand la commande a une livraison :
 *  celui du livreur, et celui de la commande. On vise le second, au texte exact. */
const boutonEnregistrer = () =>
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Enregistrer')

/** Touche la quantité de l'article : c'est ce qui rend « Enregistrer » actif.
 *  ⚠️ On vise la case sous le libellé « Qté » — l'écran a plusieurs champs
 *  numériques (prix, remise), et prendre le premier venu ne marquait rien. */
const toucherUneQuantite = () => {
  const label = [...document.querySelectorAll('label')].find(l => /Qté/.test(l.textContent))
  expect(label, 'la case « Qté » doit exister').toBeTruthy()
  fireEvent.change(label.querySelector('input'), { target: { value: '2' } })
}

const ajouterLivraisonPuisEnregistrer = async () => {
  await ouvrir()
  const b = boutonEnregistrer()
  expect(b).toBeTruthy()
  return b
}

describe('les deux questions', () => {
  it('l’écran s’ouvre sur la commande confirmée', async () => {
    await ouvrir()
    expect(screen.getByText('Mme Alaoui')).toBeTruthy()
  })

  it('⚠️ sans ligne « Livraison », aucune question n’est posée', async () => {
    const b = await ajouterLivraisonPuisEnregistrer()
    fireEvent.click(b)
    await waitFor(() => expect(confirmDialog).not.toHaveBeenCalled())
    expect(updateOrderDate).not.toHaveBeenCalled()
    expect(sendTemplate).not.toHaveBeenCalled()
  })
})

describe('⚠️ rien ne part au client tout seul', () => {
  it('le message n’est JAMAIS envoyé sans un oui explicite', async () => {
    reponses.push(false)                       // « Non, laisser l'heure »
    const b = await ajouterLivraisonPuisEnregistrer()
    fireEvent.click(b)
    await waitFor(() => expect(sendTemplate).not.toHaveBeenCalled())
  })
})


describe('la commande contient une livraison', () => {
  // ⚠️ Le nom TEL QU'ODOO L'ÉCRIT : un retour à la ligne devant.
  const ligneLivraison = { id: 7, name: '\n  Livraison (Souissi)',
    rawName: '\n  Livraison (Souissi)', qty: 1, price: 50, discount: 0 }

  it('la première question est posée, avec le bon créneau', async () => {
    lignes.push(ligneLivraison)
    reponses.push(false)                          // on répond « non » pour l'instant
    await ouvrir()
    toucherUneQuantite()
    fireEvent.click(boutonEnregistrer())
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    const texte = confirmDialog.mock.calls[0][0]
    expect(texte).toContain('devient une livraison')
    expect(texte).toContain('entre 15h et 17h')   // retrait 15h → créneau 15h-17h
    expect(texte).toContain('14h30')              // la cuisine prépare 30 min avant
    expect(texte).toContain('ne sera pas prévenu')
  })

  it('« non » : rien ne bouge, ni l’heure ni le client', async () => {
    lignes.push(ligneLivraison)
    reponses.push(false)
    await ouvrir()
    toucherUneQuantite()
    fireEvent.click(boutonEnregistrer())
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    expect(updateOrderDate).not.toHaveBeenCalled()
    expect(sendTemplate).not.toHaveBeenCalled()
  })

  it('« oui » : l’heure est décalée, PUIS on demande pour le client', async () => {
    lignes.push(ligneLivraison)
    reponses.push(true, false)                    // oui décaler · pas de message
    await ouvrir()
    toucherUneQuantite()
    fireEvent.click(boutonEnregistrer())
    await waitFor(() => expect(updateOrderDate).toHaveBeenCalled())
    expect(updateOrderDate).toHaveBeenCalledWith(42, '2026-09-16', '15:00')
    expect(confirmDialog.mock.calls[1][0]).toContain('Prévenir le client')
    expect(sendTemplate).not.toHaveBeenCalled()   // ⚠️ elle a dit non
  })

  it('« oui » puis « envoyer » : le message part, en UNE seule ligne', async () => {
    lignes.push(ligneLivraison)
    reponses.push(true, true)
    await ouvrir()
    toucherUneQuantite()
    fireEvent.click(boutonEnregistrer())
    await waitFor(() => expect(sendTemplate).toHaveBeenCalled())
    const envoi = sendTemplate.mock.calls[0][0]
    expect(envoi.templateName).toBe('wati_info')  // le seul qui passe hors des 24 h
    expect(envoi.clientPhone).toBe('212661234567')
    const texte = envoi.parameters[0].value
    expect(texte).toContain('S52797')
    expect(texte).toContain('16/09/2026')
    expect(texte).toContain('entre 15h et 17h')
    // ⚠️ WATI refuse tout retour à la ligne dans une variable de modèle.
    expect(texte).not.toContain('\n')
  })
})

describe('le créneau se voit TOUT DE SUITE', () => {
  // « Quand je clique livraison, ça me donne pas quel créneau horaire ? »
  // (Layla, 2026-09-16). L'écran n'affichait le créneau que si la commande
  // en avait DÉJÀ un — donc jamais au moment où on ajoute la livraison.
  const ligneLivraison = { id: 7, name: '\n  Livraison (Souissi)',
    rawName: '\n  Livraison (Souissi)', qty: 1, price: 50, discount: 0 }
  const gateau = { id: 8, name: 'Royal Chocolat 20 cm',
    rawName: 'Royal Chocolat 20 cm', qty: 1, price: 400, discount: 0 }

  it('dès qu’il y a une ligne Livraison, le créneau s’affiche', async () => {
    lignes.push(ligneLivraison)
    await ouvrir()
    expect(screen.getByText(/entre 15h et 17h/)).toBeTruthy()
    expect(screen.getByText(/14h30/)).toBeTruthy()
    expect(screen.getByText('Livraison — début du créneau')).toBeTruthy()
  })

  it('il est annoncé comme « à confirmer » tant que ce n’est pas enregistré', async () => {
    lignes.push(ligneLivraison)
    await ouvrir()
    expect(screen.getByText(/à confirmer en enregistrant/)).toBeTruthy()
  })

  it('⚠️ sans ligne Livraison, pas de créneau : c’est un retrait', async () => {
    lignes.push(gateau)
    await ouvrir()
    expect(screen.queryByText(/entre 15h et 17h/)).toBeNull()
    expect(screen.getByText('Date / heure de retrait-livraison')).toBeTruthy()
  })
})

describe('le scénario exact de Layla', () => {
  // « La commande confirmée, je l'ai annulée et remise en devis, puis j'ai
  // ajouté un article livraison » (Layla, 2026-09-16) — et rien ne s'est passé.
  const ligneLivraison = { id: 7, name: 'Livraison\nzone : Souissi',
    rawName: 'Livraison\nzone : Souissi', qty: 1, price: 50, discount: 0 }

  it('⚠️ le nom TEL QUE L’APP L’ÉCRIT dans Odoo est reconnu', async () => {
    // Pas « Livraison (Souissi) » : l'attribut Odoo s'appelle « zone », donc la
    // ligne s'écrit « Livraison » + retour à la ligne + « zone : Souissi ».
    lignes.push(ligneLivraison)
    reponses.push(true, false)
    await ouvrir()
    toucherUneQuantite()
    fireEvent.click(boutonEnregistrer())
    await waitFor(() => expect(updateOrderDate).toHaveBeenCalled())
  })

  it('sur un DEVIS (brouillon) aussi, pas seulement sur une commande confirmée', async () => {
    lignes.push(ligneLivraison)
    reponses.push(true, false)
    render(<OrderEditModal order={{ ...commande, state: 'draft' }}
      onClose={() => {}} onChanged={() => {}} user={user} embedded />)
    await waitFor(() => expect(screen.getByText('Mme Alaoui')).toBeTruthy())
    toucherUneQuantite()
    fireEvent.click(boutonEnregistrer())
    await waitFor(() => expect(updateOrderDate).toHaveBeenCalled())
    expect(confirmDialog.mock.calls[0][0]).toContain('devient une livraison')
  })
})

describe('le bloc livreur + adresse', () => {
  // ⚠️ Il se cachait pour une ligne qu'Odoo écrit avec un retour à la ligne
  // devant : sa détection lisait `split('\n')[0]`, donc une chaîne vide.
  // Layla ne pouvait alors PAS assigner de livreur. (2026-09-16.)
  const commeOdooLEcrit = { id: 7, name: '\n  Livraison (Souissi)',
    rawName: '\n  Livraison (Souissi)', qty: 1, price: 50, discount: 0 }
  const commeLAppLEcrit = { id: 8, name: 'Livraison\nzone : Souissi',
    rawName: 'Livraison\nzone : Souissi', qty: 1, price: 50, discount: 0 }

  it('⚠️ il s’affiche AUSSI pour le nom écrit par Odoo', async () => {
    lignes.push(commeOdooLEcrit)
    await ouvrir()
    expect(screen.getByText(/Enregistrer le livreur/)).toBeTruthy()
  })

  it('et toujours pour le nom écrit par l’app', async () => {
    lignes.push(commeLAppLEcrit)
    await ouvrir()
    expect(screen.getByText(/Enregistrer le livreur/)).toBeTruthy()
  })

  it('mais pas sur un simple retrait', async () => {
    lignes.push({ id: 9, name: 'Royal Chocolat', rawName: 'Royal Chocolat', qty: 1, price: 400, discount: 0 })
    await ouvrir()
    expect(screen.queryByText(/Enregistrer le livreur/)).toBeNull()
  })
})
