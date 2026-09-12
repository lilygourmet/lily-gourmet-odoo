import { describe, it, expect } from 'vitest'
import { bloqueSur } from './verrouCD'

// ============================================================
// LES DEUX GÂTEAUX QUI SONT PASSÉS LE 12 SEPTEMBRE.
//
// « comment le pâtissier a pu valider WHLVP/MO/202762 alors qu'il a pas fait sa
// creme au beurre ? » puis « ca me laisse marquer comme fait meme si y a pas
// creme au beurre » (Layla, 2026-09-12).
//
// Les deux cas, relevés dans Odoo :
//   · MO/202762 — 24x31 Praliné (commande S52693) : 0,9 kg de « SM. CD* Crème
//     au Beurre Praliné » demandés, 0,08 kg au labo ;
//   · MO/202582 — Crème au beurre Vanille 2 880 g : 0,85 kg de « SM. CD* Crème
//     Pâtissière » demandés, ZÉRO au labo.
// ============================================================

describe('le verrou de Fabrication CD', () => {
  it('bloque le 24x31 Praliné : 0,08 kg de praliné pour 0,9 demandé', () => {
    expect(bloqueSur({ besoin: 0.9, unite: 'kg', dispo: 0.08 })).toBe(true)
  })

  it('bloque la crème au beurre vanille : ZÉRO crème pâtissière pour 0,85', () => {
    expect(bloqueSur({ besoin: 0.85, unite: 'kg', dispo: 0 })).toBe(true)
  })

  it('bloque même sans besoin connu, s’il n’y a rien du tout', () => {
    expect(bloqueSur({ besoin: 0, unite: 'kg', dispo: 0 })).toBe(true)
    expect(bloqueSur({ dispo: 0 })).toBe(true)
  })

  it('ne bloque pas quand il y en a assez', () => {
    expect(bloqueSur({ besoin: 2.06, unite: 'kg', dispo: 9.69 })).toBe(false)
    expect(bloqueSur({ besoin: 1, unite: 'kg', dispo: 1 })).toBe(false)
  })

  it('ne bloque pas pour quelques grammes de balance', () => {
    // 97 g pour 100 demandés : la tolérance de l'annexe, 5 % et 50 g.
    expect(bloqueSur({ besoin: 100, unite: 'g', dispo: 97 })).toBe(false)
    expect(bloqueSur({ besoin: 1, unite: 'kg', dispo: 0.97 })).toBe(false)
  })

  it('bloque dès que le manque dépasse la tolérance', () => {
    expect(bloqueSur({ besoin: 5, unite: 'kg', dispo: 4.75 })).toBe(true)   // 250 g
    expect(bloqueSur({ besoin: 3.84, unite: 'kg', dispo: 0.057 })).toBe(true) // la ganache
    expect(bloqueSur({ besoin: 745.48, unite: 'g', dispo: 56.06 })).toBe(true) // crème Angelo
  })

  it('ne tolère JAMAIS un manque sur ce qui se compte à la pièce', () => {
    expect(bloqueSur({ besoin: 10, unite: 'u', dispo: 9 })).toBe(true)
    expect(bloqueSur({ besoin: 1, unite: 'u', dispo: 0.5 })).toBe(true)
  })

  it('laisse passer les exceptions prévues', () => {
    const dur = { besoin: 0.9, unite: 'kg', dispo: 0.08 }
    // une base : elle se coche dans le bloc du haut
    expect(bloqueSur({ ...dur, exempte: true })).toBe(false)
    // déjà déclarée faite pour ce lot
    expect(bloqueSur({ ...dur, declare: true })).toBe(false)
    // pas de recette dans Odoo : l'app ne saurait pas la lancer
    expect(bloqueSur({ ...dur, aRecette: false })).toBe(false)
    // et même à zéro, ces trois exceptions tiennent
    expect(bloqueSur({ besoin: 1, unite: 'kg', dispo: 0, exempte: true })).toBe(false)
    expect(bloqueSur({ besoin: 1, unite: 'kg', dispo: 0, declare: true })).toBe(false)
    expect(bloqueSur({ besoin: 1, unite: 'kg', dispo: 0, aRecette: false })).toBe(false)
  })

  it('ne se laisse pas avoir par un stock négatif', () => {
    // Le stock de génoise est à −58 tonnes : un négatif n'est pas « il y en a ».
    expect(bloqueSur({ besoin: 1, unite: 'kg', dispo: -5 })).toBe(true)
  })
})
