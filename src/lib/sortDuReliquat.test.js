// ============================================================
// LE SORT DU RELIQUAT : gardé, jeté, ou inclus.
//
// « Que le reliquat reste, ou jeté, ou inclus — tu vois ce que je veux dire.
// Même pour les biscuits » (Layla, 2026-09-22), puis « ok mais simplifie, pas
// trop de texte ».
//
// Trois sorts, et un seul chiffre à taper. Ce que chacun veut dire :
//   🧊 gardé  → il reste au frigo, Odoo n'en consomme pas ;
//   🥣 inclus → il est DANS les gâteaux, Odoo consomme tout ;
//   🗑 jeté   → Odoo n'en consomme pas non plus, et il sort du stock.
//
// ⚠️ « Gardé » est le DÉFAUT : sans rien toucher, l'app fait ce qu'elle a
// toujours fait. C'est la condition pour qu'un choix de plus ne casse rien.
// ============================================================
import { describe, it, expect } from 'vitest'
import { enGrammes } from './unites'

// Les deux règles telles qu'elles vivent dans l'écran.
const resteGarde = (lignes, valeurs, sorts) => Object.fromEntries(
  (lignes || []).map(r => {
    const n = Number(String(valeurs?.[r.produit] ?? 0).replace(',', '.')) || 0
    return [r.produit, (sorts?.[r.produit] || 'garde') === 'inclus' ? 0 : n]
  }))

const aJeter = (lignes, valeurs, sorts) => (lignes || [])
  .filter(r => (sorts?.[r.produit] || 'garde') === 'jete')
  .map(r => {
    const n = Number(String(valeurs?.[r.produit] ?? 0).replace(',', '.')) || 0
    const pieces = /^u$/i.test(String(r.unite || '').trim())
    return { produit: r.produit, qty: pieces ? n : (enGrammes(n, r.unite) ?? n) }
  })
  .filter(x => x.qty > 0)

const creme = { produit: 'SM. Creme au Beurre', libelle: 'Crème au beurre', unite: 'g' }
const cremeKg = { produit: 'SM. Creme Citron', libelle: 'Crème citron', unite: 'kg' }
const biscuit = { produit: 'SM. Biscuit 5 pers', libelle: 'Biscuit 5 pers', unite: 'u' }

describe('ce qu’Odoo doit consommer', () => {
  it('GARDÉ : le reste ne part pas dans les gâteaux', () => {
    expect(resteGarde([creme], { 'SM. Creme au Beurre': 656 }, { 'SM. Creme au Beurre': 'garde' }))
      .toEqual({ 'SM. Creme au Beurre': 656 })
  })

  it('INCLUS : le reste tombe à zéro — Odoo consomme tout', () => {
    expect(resteGarde([creme], { 'SM. Creme au Beurre': 656 }, { 'SM. Creme au Beurre': 'inclus' }))
      .toEqual({ 'SM. Creme au Beurre': 0 })
  })

  // ⚠️ Jeté n'est PAS dans le gâteau : Odoo n'en consomme pas, exactement
  // comme « gardé ». La différence se joue ailleurs — dans le rebut.
  it('JETÉ : Odoo n’en consomme pas non plus', () => {
    expect(resteGarde([creme], { 'SM. Creme au Beurre': 656 }, { 'SM. Creme au Beurre': 'jete' }))
      .toEqual({ 'SM. Creme au Beurre': 656 })
  })

  // ⚠️ LA CONDITION POUR QUE RIEN NE CASSE.
  it('sans rien choisir, c’est GARDÉ — le comportement d’avant', () => {
    expect(resteGarde([creme], { 'SM. Creme au Beurre': 656 }, {}))
      .toEqual({ 'SM. Creme au Beurre': 656 })
  })

  it('une virgule tapée au lieu d’un point passe quand même', () => {
    expect(resteGarde([cremeKg], { 'SM. Creme Citron': '1,4' }, {}))
      .toEqual({ 'SM. Creme Citron': 1.4 })
  })
})

describe('ce qui part au rebut', () => {
  it('rien, tant qu’on n’a rien jeté', () => {
    expect(aJeter([creme, biscuit], { 'SM. Creme au Beurre': 656 }, {})).toEqual([])
  })

  it('en GRAMMES pour ce qui se pèse, même compté en kilos', () => {
    const r = aJeter([cremeKg], { 'SM. Creme Citron': 1.4 }, { 'SM. Creme Citron': 'jete' })
    expect(r).toEqual([{ produit: 'SM. Creme Citron', qty: 1400 }])
  })

  // ⚠️ Un biscuit ne se pèse pas : 2 pièces jetées, ce sont 2 pièces.
  it('en PIÈCES pour ce qui se compte', () => {
    expect(aJeter([biscuit], { 'SM. Biscuit 5 pers': 2 }, { 'SM. Biscuit 5 pers': 'jete' }))
      .toEqual([{ produit: 'SM. Biscuit 5 pers', qty: 2 }])
  })

  it('zéro jeté n’est pas un rebut', () => {
    expect(aJeter([creme], { 'SM. Creme au Beurre': 0 }, { 'SM. Creme au Beurre': 'jete' }))
      .toEqual([])
  })

  it('on ne jette que ce qui est marqué jeté', () => {
    const r = aJeter([creme, biscuit],
      { 'SM. Creme au Beurre': 656, 'SM. Biscuit 5 pers': 2 },
      { 'SM. Creme au Beurre': 'inclus', 'SM. Biscuit 5 pers': 'jete' })
    expect(r.map(x => x.produit)).toEqual(['SM. Biscuit 5 pers'])
  })
})
