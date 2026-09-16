// ============================================================
// LE CRÉNEAU PROMIS AU CLIENT — ET POURQUOI IL N'ARRIVAIT JAMAIS.
//
// « Les livraisons et battement de 2 h ne se voit pas chez le livreur, et le
// client ne reçoit pas le message » (Layla, 2026-09-15).
//
// Deux bugs, trouvés en remontant 12 000 commandes d'historique où il
// n'existait PAS UN SEUL créneau de 2 h :
//
//   1. Odoo POSSÈDE `livraison_hour` et le recalcule tout seul depuis l'heure
//      de préparation — heure arrondie, créneau d'une heure. Notre créneau
//      était écrasé à chaque écriture. On le garde donc chez nous.
//
//   2. Odoo écrit les noms de ligne avec un retour à la ligne DEVANT —
//      « \n  Livraison (Souissi) ». Le code faisait `split('\n')[0]`, obtenait
//      une chaîne vide, ne reconnaissait pas la livraison, et ne décalait donc
//      pas l'heure de préparation quand on changeait l'heure.
// ============================================================
import { describe, it, expect } from 'vitest'
import { estLigneLivraison, heurePreparation, creneauClient, heureLisible,
  texteCreneauClient, estCreneau2h, CRENEAUX_LIVRAISON, libelleCreneau } from './creneau'

describe('reconnaître une ligne de livraison', () => {
  it('⚠️ le nom tel qu’Odoo l’écrit vraiment : un retour à la ligne devant', () => {
    // Relevé sur S52682, S52653, S52142… le 2026-09-15.
    expect(estLigneLivraison('\n  Livraison (Souissi)')).toBe(true)
    expect(estLigneLivraison('\n  Livraison (Hassan / Centre Ville)')).toBe(true)
  })

  it('⚠️ c’est exactement ce que `split("\\n")[0]` cassait', () => {
    const premiereLigne = n => String(n || '').split('\n')[0]
    expect(premiereLigne('\n  Livraison (Souissi)')).toBe('')      // la cause du bug
    expect(estLigneLivraison(premiereLigne('\n  Livraison (Souissi)'))).toBe(false)
  })

  it('le nom sans retour à la ligne marche toujours', () => {
    expect(estLigneLivraison('Livraison (Souissi)')).toBe(true)
    expect(estLigneLivraison('Livraison')).toBe(true)
  })

  it('un autre article ne passe pas pour une livraison', () => {
    expect(estLigneLivraison('Livraison express')).toBe(false)
    expect(estLigneLivraison('SM- Flan Vanille 20 cm')).toBe(false)
  })
})

describe('le pâtissier travaille 30 min avant le créneau', () => {
  it('le client attend à 13h → la commande est prête à 12h30', () => {
    expect(heurePreparation('13:00')).toBe('12:30')
    expect(creneauClient('12:30')).toEqual({ debut: '13:00', fin: '15:00' })
  })

  it('l’aller-retour ne perd rien', () => {
    const saisi = '16:00'
    const prep = heurePreparation(saisi)
    expect(creneauClient(prep).debut).toBe(saisi)
  })

  it('le créneau dure bien 2 h', () => {
    const c = creneauClient(heurePreparation('09:30'))
    expect(c).toEqual({ debut: '09:30', fin: '11:30' })
  })
})

describe('ce que le client lit', () => {
  const creneauDe = prep => { const c = creneauClient(prep)
    return `${heureLisible(c.debut)}-${heureLisible(c.fin)}` }

  it('« entre 13h et 15h », à partir du créneau gardé chez nous', () => {
    expect(texteCreneauClient('16/09/2026', creneauDe('12:30')))
      .toBe('16/09/2026 entre 13h et 15h')
  })

  it('les demi-heures se lisent aussi', () => {
    expect(texteCreneauClient('16/09/2026', creneauDe('13:00')))
      .toBe('16/09/2026 entre 13h30 et 15h30')
  })

  it('⚠️ le créneau d’1 h qu’Odoo recalcule ne dit RIEN au client', () => {
    // C'est ce qui se passait : « 12h-13h » → texte vide → le message parlait
    // de RETRAIT, à l'heure de préparation. Le client venait 30 min trop tôt.
    expect(estCreneau2h('16-09-26 12h-13h')).toBe(false)
    expect(texteCreneauClient('16/09/2026', '16-09-26 12h-13h')).toBe('')
  })

  it('le créneau gardé chez nous, lui, est bien un créneau de 2 h', () => {
    expect(estCreneau2h('13h-15h')).toBe(true)
    expect(estCreneau2h('09h30-11h30')).toBe(true)
  })
})

describe('la ligne reste reconnue quoi qu’Odoo y mette', () => {
  it('une note ajoutée sous le nom ne la cache plus', () => {
    expect(estLigneLivraison('Livraison (Agdal)\n⚠️ Sonner au portail')).toBe(true)
    expect(estLigneLivraison('\n  Livraison (Agdal)\n⚠️ 3e étage')).toBe(true)
  })

  it('mais un article dont la livraison n’est qu’une note ne compte pas', () => {
    expect(estLigneLivraison('Royal Chocolat 20 cm\nLivraison (Agdal)')).toBe(false)
  })

  it('vide ou blanc : ce n’est pas une livraison', () => {
    expect(estLigneLivraison('')).toBe(false)
    expect(estLigneLivraison('\n   \n')).toBe(false)
  })
})


describe('les créneaux qu’on propose', () => {
  // « Je dois choisir l'horaire de livraison à chaque fois que je clique
  // livraison » (Layla, 2026-09-16). Ce sont les MÊMES que ceux que voit le
  // client sur son lien de commande — sinon on lui promet autre chose.
  it('cinq créneaux de 2 h, écrits comme sur la page client', () => {
    expect(CRENEAUX_LIVRAISON.map(libelleCreneau)).toEqual([
      '10h – 12h', '12h – 14h', '14h – 16h', '16h – 18h', '18h – 20h',
    ])
  })

  it('chacun dure bien deux heures, et la cuisine part 30 min avant', () => {
    for (const c of CRENEAUX_LIVRAISON) {
      expect(creneauClient(heurePreparation(c))).toEqual({ debut: c, fin: finDe(c) })
    }
    expect(heurePreparation('10:00')).toBe('09:30')
    expect(heurePreparation('18:00')).toBe('17:30')
  })
})
const finDe = h => `${String(Number(h.slice(0, 2)) + 2).padStart(2, '0')}:00`
