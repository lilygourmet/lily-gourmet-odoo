// ============================================================
// QUELQUES GRAMMES NE SONT PAS UNE PÉNURIE — ET C'EST LA MÊME RÈGLE PARTOUT.
//
// « 636 vs 640, quand ça se rapproche, le laisser. N'est-ce pas ? » (Layla,
// 2026-09-22, devant la crème pâtissière de WHLVP/MO/203685).
//
// Si : c'est exactement la règle qu'elle avait déjà posée le 2026-09-11 pour
// Fabrication CD et l'annexe (le pécan du flan, 97 g pour 100). « À valider »
// était le seul écran à bloquer encore, parce que le manque lui vient du
// SERVEUR, qui ne pouvait pas importer la règle. Elle vit maintenant seule dans
// `tolerance.js`, sans dépendance, et les deux côtés l'utilisent.
// ============================================================
import { describe, it, expect } from 'vitest'
import { manqueTolerable } from './tolerance'
import { manqueTolerable as depuisFabAnnexe } from './fabAnnexe'

describe('le cas de Layla, au gramme près', () => {
  it('636 g pour 640 demandés : c’est la balance, pas un manque', () => {
    expect(manqueTolerable(640, 636, 'g')).toBe(true)
  })

  it('et en kilos, le même : 0,636 pour 0,640', () => {
    expect(manqueTolerable(0.64, 0.636, 'kg')).toBe(true)
  })
})

describe('les deux garde-fous', () => {
  // ⚠️ Au plus 5 % du besoin : 3 g sur 100, c'est la balance ; 3 g sur 10,
  // c'est un tiers de la recette.
  it('3 g sur 100 passent, 3 g sur 10 non', () => {
    expect(manqueTolerable(100, 97, 'g')).toBe(true)
    expect(manqueTolerable(10, 7, 'g')).toBe(false)
  })

  // ⚠️ Au plus 50 g : sur une cuve de 5 kg, 5 % feraient 250 g — et 250 g de
  // crème qui manquent, ce n'est plus une imprécision.
  it('40 g sur 5 kg passent, 250 g non — même si c’est 5 %', () => {
    expect(manqueTolerable(5000, 4960, 'g')).toBe(true)
    expect(manqueTolerable(5000, 4750, 'g')).toBe(false)
  })

  // ⚠️ JAMAIS sur ce qui se compte à la pièce : il manque un fond de tarte sur
  // dix, ce n'est pas la balance, c'est une tarte qu'on ne peut pas faire.
  it('jamais sur des pièces, quel que soit le mot d’Odoo', () => {
    expect(manqueTolerable(100, 99, 'u')).toBe(false)
    expect(manqueTolerable(100, 99, 'Units')).toBe(false)
  })

  // ⚠️ Zéro n'est pas « presque tout ».
  it('jamais quand il n’y a rien du tout', () => {
    expect(manqueTolerable(640, 0, 'g')).toBe(false)
  })

  it('rien à tolérer quand il y en a assez', () => {
    expect(manqueTolerable(640, 640, 'g')).toBe(false)
    expect(manqueTolerable(640, 900, 'g')).toBe(false)
  })
})

// ⚠️ UNE SEULE RÈGLE, UN SEUL ENDROIT. Elle a été recopiée une fois de trop
// dans ce projet ; ce test veille à ce que les deux chemins d'import mènent
// bien à la MÊME fonction.
describe('la règle n’existe qu’une fois', () => {
  it('fabAnnexe ré-exporte exactement celle de tolerance.js', () => {
    expect(depuisFabAnnexe).toBe(manqueTolerable)
  })
})
