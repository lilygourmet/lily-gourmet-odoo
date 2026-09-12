// ============================================================
// QUAND IL EN MANQUE TROIS GRAMMES.
//
// « 100 g, pour quelques grammes qui manquent, je pense c'est ok de laisser
// l'app prendre l'article et mettre consommé tout » (Layla, 2026-09-11) — le
// pécan caramélisé du flan, 97 g pour 100 demandés.
//
// La limite, choisie par Layla le 2026-09-12 : au plus 5 % du besoin ET au
// plus 50 g. Deux garde-fous, parce qu'aucun des deux ne suffit seul :
//   • sans le %, 3 g manquants sur 10 g passeraient (un tiers de la recette) ;
//   • sans les 50 g, une cuve de 5 kg laisserait filer 250 g.
//
// ⚠️ Et jamais sur ce qui se compte : un fond de tarte qui manque, c'est une
// tarte qu'on ne peut pas faire, pas une imprécision de balance.
// ============================================================
import { describe, it, expect } from 'vitest'
import { presqueLa, toutConsomme, bloquants, manqueTolerable } from './fabAnnexe'

const c = (o = {}) => ({ unite: 'g', fabrique: true, ok: false, dejaFait: 0,
  produit: 'SM. Pécan caramélise flan Production', ...o })

describe('presque là', () => {
  it('le pécan du flan : 97 g pour 100, on prend tout', () => {
    expect(presqueLa(c({ besoin: 100, stock: 97 }))).toBe(true)
  })

  it('en kilos aussi — c’est la même chose écrite autrement', () => {
    // 0,097 kg pour 0,1 : 3 g manquants, exactement le même cas.
    expect(presqueLa(c({ unite: 'kg', besoin: 0.1, stock: 0.097 }))).toBe(true)
  })

  describe('le garde-fou des 5 %', () => {
    it('3 g sur 10, c’est un tiers de la recette : ça bloque', () => {
      expect(presqueLa(c({ besoin: 10, stock: 7 }))).toBe(false)
    })
    it('pile 5 % passe, un poil au-dessus ne passe pas', () => {
      expect(presqueLa(c({ besoin: 200, stock: 190 }))).toBe(true)   // 10 g = 5 %
      expect(presqueLa(c({ besoin: 200, stock: 189 }))).toBe(false)  // 11 g
    })
  })

  describe('le garde-fou des 50 g', () => {
    it('⚠️ une cuve de 5 kg ne laisse pas filer 250 g, même si c’est 5 %', () => {
      expect(presqueLa(c({ besoin: 5000, stock: 4750 }))).toBe(false)
    })
    it('mais 40 g sur 5 kg, oui : c’est la balance', () => {
      expect(presqueLa(c({ besoin: 5000, stock: 4960 }))).toBe(true)
    })
    it('pile 50 g passe, 51 g ne passe pas', () => {
      expect(presqueLa(c({ besoin: 2000, stock: 1950 }))).toBe(true)
      expect(presqueLa(c({ besoin: 2000, stock: 1949 }))).toBe(false)
    })
  })

  describe('ce que la règle ne touche jamais', () => {
    it('ce qui se compte à la pièce : un fond de tarte qui manque bloque', () => {
      expect(presqueLa(c({ unite: 'u', besoin: 10, stock: 9 }))).toBe(false)
    })
    it('zéro n’est pas « presque tout »', () => {
      expect(presqueLa(c({ besoin: 100, stock: 0 }))).toBe(false)
    })
    it('un stock négatif non plus', () => {
      expect(presqueLa(c({ besoin: 1040, stock: -140 }))).toBe(false)
    })
    it('une matière première achetée n’est pas concernée', () => {
      expect(presqueLa(c({ besoin: 100, stock: 97, fabrique: false }))).toBe(false)
    })
    it('ce qui est déjà au complet non plus', () => {
      expect(presqueLa(c({ besoin: 100, stock: 120, ok: true }))).toBe(false)
    })
  })
})

describe('ce qui part chez Odoo', () => {
  const flan = { composants: [
    c({ besoin: 100, stock: 97 }),
    c({ produit: 'SM. Sable Crispy', besoin: 290, stock: 2576, ok: true }),
    c({ produit: 'SM. creme citron Production', besoin: 1600, stock: 66 }),
  ] }

  it('⚠️ le presque-là part avec ce qui RESTE, pas avec la recette', () => {
    // Sans ça, l'ordre demanderait 100 g et Odoo passerait le stock à −3.
    expect(toutConsomme(flan)).toEqual({ 'SM. Pécan caramélise flan Production': 97 })
  })

  it('le vrai manque n’est pas dedans, et il bloque toujours', () => {
    expect(toutConsomme(flan)['SM. creme citron Production']).toBeUndefined()
    expect(bloquants(flan, [])).toEqual(['SM. creme citron Production'])
  })

  it('ce qui a déjà été déclaré compte comme du stock', () => {
    expect(toutConsomme({ composants: [c({ besoin: 100, stock: 90, dejaFait: 7 })] }))
      .toEqual({ 'SM. Pécan caramélise flan Production': 97 })
  })
})

describe('manqueTolerable — la même tolérance pour Fabrication CD', () => {
  // Le cas qui a tout déclenché : WHLVP/MO/202762 demandait 0,9 kg de crème au
  // beurre praliné, il en restait 0,08. Le pâtissier a pu valider parce que le
  // CD ne bloquait que sur un stock à ZÉRO (Layla, 2026-09-12).
  it('un fond de bassine ne débloque pas un gâteau', () => {
    expect(manqueTolerable(0.9, 0.08, 'kg')).toBe(false)
    expect(manqueTolerable(3.84, 0.057, 'kg')).toBe(false)      // la ganache à masquer
    expect(manqueTolerable(745.48, 56.06, 'g')).toBe(false)     // la crème Angelo
  })

  it('quelques grammes de balance passent encore', () => {
    expect(manqueTolerable(100, 97, 'g')).toBe(true)            // le pécan du flan
    expect(manqueTolerable(1, 0.97, 'kg')).toBe(true)           // le même, en kg
  })

  it('les deux limites tiennent ensemble', () => {
    // Il faut passer LES DEUX : au plus 5 % du besoin, et au plus 50 g.
    expect(manqueTolerable(10, 9.7, 'g')).toBe(true)            // 3 % et 0,3 g : oui
    expect(manqueTolerable(1000, 960, 'g')).toBe(true)          // 4 % et 40 g : oui
    expect(manqueTolerable(5, 4.75, 'kg')).toBe(false)          // 5 % font 250 g : non
    expect(manqueTolerable(10, 6, 'g')).toBe(false)             // 4 g mais 40 % : non
  })

  it('jamais sur ce qui se compte à la pièce, ni sur rien du tout', () => {
    expect(manqueTolerable(10, 9, 'u')).toBe(false)
    expect(manqueTolerable(0.9, 0, 'kg')).toBe(false)
    expect(manqueTolerable(0.9, -2, 'kg')).toBe(false)
  })
})
