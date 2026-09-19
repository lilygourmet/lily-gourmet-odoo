// ============================================================
// « COMBIEN IL M'EN RESTE ? » (Layla, 2026-09-19)
//
//   « Quand une crème est faite, ou une mousse, ou une pâte, ça doit me dire
//     combien il m'en reste non utilisé. Si 0, le reste de la crème théorique
//     doit rentrer dans le produit. »
//
// C'est LA confusion qui revient depuis des semaines : Odoo gardait au frigo
// une crème que la pâtissière avait entièrement mise dans les gâteaux.
// ============================================================
import { describe, it, expect } from 'vitest'
import { restesTheoriques, consommeApresRestes } from './fabAnnexe'

// Je fais 12 500 g de crème, je monte 18 tartes, la recette en consomme 11 844.
const tarte = {
  produit: 'SM- Tarte Citron Gin 23 cm',
  composants: [
    { produit: 'SM. Creme Citron Gingembre', libelle: 'Crème citron gingembre',
      unite: 'g', fabrique: true, besoin: 11844, dejaFait: 12500, stock: 0 },
    // Un fond acheté : on ne le fabrique pas, il n'a pas de reste à expliquer.
    { produit: 'MP- Beurre', unite: 'g', fabrique: false, besoin: 500, dejaFait: 0, stock: 9000 },
  ],
}

describe('ce qu’il reste de la crème', () => {
  it('le dit, avec le fait et le besoin', () => {
    const r = restesTheoriques(tarte)
    expect(r).toHaveLength(1)
    expect(r[0].fait).toBe(12500)
    expect(r[0].besoin).toBe(11844)
    expect(r[0].reste).toBe(656)
  })

  it('ne demande rien sur ce qu’on ne fabrique pas', () => {
    expect(restesTheoriques(tarte).map(x => x.produit)).toEqual(['SM. Creme Citron Gingembre'])
  })

  it('ne demande rien quand il n’y a pas de reste', () => {
    const pile = { composants: [{ produit: 'X', fabrique: true, besoin: 1000, dejaFait: 1000 }] }
    expect(restesTheoriques(pile)).toEqual([])
  })

  it('ne demande rien quand on a pris sur le stock d’avant', () => {
    // Fait 400 aujourd'hui, la recette en demande 1 000 : le reste est négatif,
    // il n'y a rien à rendre au frigo.
    const puise = { composants: [{ produit: 'X', fabrique: true, besoin: 1000, dejaFait: 400 }] }
    expect(restesTheoriques(puise)).toEqual([])
  })
})

describe('où va le reste', () => {
  it('« il ne m’en reste rien » → TOUT passe dans le produit', () => {
    // ⚠️ Le cœur de la règle : 12 500 consommés, pas 11 844. Sinon Odoo garde
    // au frigo 656 g de crème qui n'existent pas.
    expect(consommeApresRestes(tarte, {})['SM. Creme Citron Gingembre']).toBe(12500)
    expect(consommeApresRestes(tarte, { 'SM. Creme Citron Gingembre': 0 })['SM. Creme Citron Gingembre'])
      .toBe(12500)
  })

  it('« il m’en reste 656 » → le frigo les garde', () => {
    const c = consommeApresRestes(tarte, { 'SM. Creme Citron Gingembre': 656 })
    expect(c['SM. Creme Citron Gingembre']).toBe(11844)
  })

  it('un reste partiel se partage', () => {
    const c = consommeApresRestes(tarte, { 'SM. Creme Citron Gingembre': 200 })
    expect(c['SM. Creme Citron Gingembre']).toBe(12300)
  })

  it('on ne peut pas en garder plus qu’on en a fait', () => {
    const c = consommeApresRestes(tarte, { 'SM. Creme Citron Gingembre': 99999 })
    expect(c['SM. Creme Citron Gingembre']).toBe(0)
  })

  it('un chiffre absurde ne casse rien', () => {
    const c = consommeApresRestes(tarte, { 'SM. Creme Citron Gingembre': -5 })
    expect(c['SM. Creme Citron Gingembre']).toBe(12500)
  })
})
