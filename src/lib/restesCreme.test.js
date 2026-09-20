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

// ============================================================
// LA CUVE SORTIE DU FRIGO : on ANNONCE ce qui restera.
//
// « Si mousse, crémeux, etc., ça doit toujours me dire combien de mousse il te
// reste. Et le reste va dans À finir » (Layla, 2026-09-20), devant la fin de
// tournée du gianduja indiv — où la mousse venait du frigo, donc aucune
// question n'était posée.
// ============================================================
import { resteDesCuves } from './fabAnnexe'

// 25 gianduja indiv : la mousse était déjà là (692 g par dix-personnes…).
const gianduja = {
  produit: 'SM- Gianduja Indiv',
  composants: [
    { produit: 'SM. Mousse Gianduja', libelle: 'Mousse gianduja', unite: 'g',
      fabrique: true, fige: true, besoin: 1212, dejaFait: 0, stock: 2500 },
    // Le sucre ne se « finit » pas : il n'a rien à faire dans cette annonce.
    { produit: 'MP- Sucre Granule', unite: 'g', fabrique: false, fige: false,
      besoin: 300, dejaFait: 0, stock: 40000 },
    // Un biscuit qui se fabrique mais n'est PAS la cuve : pas un moulage.
    { produit: 'SM. Biscuit Gianduja', unite: 'u', fabrique: true, fige: false,
      besoin: 25, dejaFait: 0, stock: 60 },
  ],
}

describe('ce qui restera de la cuve', () => {
  it('compte le frigo ET ce qui vient d’être fait', () => {
    const r = resteDesCuves(gianduja)
    expect(r).toHaveLength(1)
    expect(r[0].produit).toBe('SM. Mousse Gianduja')
    expect(r[0].fait).toBe(2500)
    expect(r[0].reste).toBe(2500 - 1212)
  })

  it('ne parle QUE de la cuve — ni le sucre, ni le biscuit', () => {
    expect(resteDesCuves(gianduja).map(x => x.produit)).toEqual(['SM. Mousse Gianduja'])
  })

  it('rien à annoncer quand la cuve y passe en entier', () => {
    const juste = { composants: [{ ...gianduja.composants[0], stock: 1212 }] }
    expect(resteDesCuves(juste)).toEqual([])
  })

  // ⚠️ Un stock NÉGATIF est un compteur faux, pas une réserve : il ne doit
  // jamais faire croire qu'il reste quelque chose.
  it('un stock négatif n’annonce rien', () => {
    const casse = { composants: [{ ...gianduja.composants[0], stock: -900, dejaFait: 0 }] }
    expect(resteDesCuves(casse)).toEqual([])
  })

  // ⚠️ ET SURTOUT : cette annonce ne touche PAS à ce qu'Odoo consomme. La
  // question éditable (`restesTheoriques`) reste seule maîtresse — y verser la
  // mousse du frigo, c'était risquer qu'un zéro tapé par habitude fasse entrer
  // 2,5 kg de mousse dans 25 individuels.
  it('n’entre pas dans ce qu’Odoo consomme', () => {
    expect(restesTheoriques(gianduja)).toEqual([])
    expect(consommeApresRestes(gianduja, {})).toEqual({})
  })
})
