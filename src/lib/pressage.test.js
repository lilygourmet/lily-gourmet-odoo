// ============================================================
// PRESSER N'EST PAS FABRIQUER.
//
// 290 g de sablé crispy pressés dans un cercle, c'est une base de flan. Il n'y
// a ni cuisson, ni recette, ni décision — et pourtant l'étape BLOQUAIT le flan
// tant que personne n'était entré dedans pour dire « c'est fait ».
//
// « Tu as validé flan ; le crispy y est, combien de base tu as coupé ? »
// (Layla, 2026-09-11.) La question se pose donc en validant le gâteau.
//
// ⚠️ Ce qu'il ne faut PAS casser : la base doit continuer à bloquer quand il
// n'y a plus de sablé crispy — là, il faut vraiment aller le faire.
// ============================================================
import { describe, it, expect } from 'vitest'
import { estPressageServi, pressageDe, bloquants } from './fabAnnexe'

// Relevé sur la vraie fiche du flan, le 2026-09-11.
const sable = (stock = 2576) => ({
  produit: 'SM. Sable Crispy', unite: 'g', besoin: 290, stock,
  dejaFait: 0, fabrique: true, ok: stock >= 290,
})
const base = (stockSable = 2576, extra = {}) => ({
  produit: 'SM- base flan vanille 20 cm', unite: 'u', besoin: 1, stock: 0,
  dejaFait: 0, fabrique: true, ok: false, tourneeTaille: 1,
  recette: [{ produit: 'SM. Sable Crispy', qty: 290, unite: 'g' }],
  enfants: [sable(stockSable)], ...extra,
})
const pecan = { produit: 'SM. Pécan caramélise flan Production', unite: 'g',
  besoin: 100, stock: 97, dejaFait: 0, fabrique: true, ok: false, enfants: [] }
const flan = (...composants) => ({ produit: 'SM- flan vanille 20 cm', unite: 'u', composants })

describe('la base de flan', () => {
  it('est un pressage tant qu’il y a du sablé crispy', () => {
    expect(estPressageServi(base())).toBe(true)
    expect(pressageDe(flan(base()))?.produit).toBe('SM- base flan vanille 20 cm')
  })

  it('ne bloque plus la validation du flan', () => {
    expect(bloquants(flan(base()), [])).toEqual([])
  })

  it('⚠️ MAIS elle bloque encore quand le sablé crispy manque', () => {
    // 100 g au fond du bac : il faut aller en faire, l’étape redevient un mur.
    expect(estPressageServi(base(100))).toBe(false)
    expect(bloquants(flan(base(100)), [])).toEqual(['SM- base flan vanille 20 cm'])
  })

  it('une fois déclarée, elle n’est plus rien à faire', () => {
    expect(estPressageServi(base(2576, { dejaFait: 1 }))).toBe(false)
    expect(estPressageServi(base(2576, { ok: true }))).toBe(false)
  })
})

describe('ce que la règle ne doit PAS toucher', () => {
  it('le pécan caramélisé bloque toujours : ce n’est pas un pressage', () => {
    expect(estPressageServi(pecan)).toBe(false)
    expect(bloquants(flan(pecan), [])).toEqual(['SM. Pécan caramélise flan Production'])
  })

  it('le pécan bloque même quand la base, elle, est servie', () => {
    expect(bloquants(flan(base(), pecan), []))
      .toEqual(['SM. Pécan caramélise flan Production'])
  })

  it('un biscuit à couper reste une découpe, pas un pressage', () => {
    const biscuit = { produit: 'SM. Biscuit Gianduja indiv', unite: 'u', besoin: 90,
      stock: 0, dejaFait: 0, fabrique: true, ok: false, tourneeTaille: 102,
      enfants: [{ produit: 'SM. Biscuit Gianduja (plaque)', unite: 'g', ok: true }] }
    expect(estPressageServi(biscuit)).toBe(false)
    expect(bloquants({ composants: [biscuit] }, [])).toEqual(['SM. Biscuit Gianduja indiv'])
  })

  it('une matière première achetée n’a jamais bloqué et ne bloque toujours pas', () => {
    const mp = { produit: 'MP- Vanille Gousse Bourbon', unite: 'g', ok: true, fabrique: false }
    expect(bloquants(flan(mp), [])).toEqual([])
  })
})
