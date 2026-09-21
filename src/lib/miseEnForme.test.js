// ============================================================
// CE QUI REVIENT À ÊTRE FINI.
//
// « Quand une mousse reste en stock, elle revient dans À déclarer parce
// qu'elle doit être finie » (Layla, 2026-09-20).
// ============================================================
import { describe, it, expect } from 'vitest'
import { aMettreEnForme } from './miseEnForme'

// Ce que le serveur renvoie : le reste RÉEL en grammes, déjà amputé de ce que
// les formats déclarés aujourd'hui ont consommé.
const vracs = [
  { produit: 'SM. Mousse Meringue Citron (kg)', libelle: 'Mousse meringue citron',
    unite: 'kg', stock: 2.4, resteG: 2400, note: 'coulée — indiv' },
  { produit: 'SM. Gélée Mangue Ananas Pistache', libelle: 'Gélée mangue',
    unite: 'g', stock: 2030, resteG: 2030, note: 'coulée — 10 pers, indiv' },
  // Dispatchée ce matin : le stock d'Odoo n'a pas encore bougé, mais il ne
  // reste rien. Elle ne doit plus rien réclamer.
  { produit: 'SM. Crunchy Pistache', libelle: 'Crunchy pistache',
    unite: 'g', stock: 1800, resteG: 0, note: null },
]

describe('ce qui attend sa mise en forme', () => {
  it('ce qui reste vraiment, rangé par nom', () => {
    expect(aMettreEnForme(vracs).map(a => a.produit))
      .toEqual(['SM. Gélée Mangue Ananas Pistache', 'SM. Mousse Meringue Citron (kg)'])
  })

  it('garde la note : ce qu’on en fait (coulée, pipée, découpée)', () => {
    expect(aMettreEnForme(vracs)[1].note).toBe('coulée — indiv')
  })

  // ⚠️ LE PIÈGE DU STOCK ODOO : il ne baisse qu'à la validation, en fin de
  // journée. Sans le calcul du serveur, un vrac dispatché ce matin réclamait
  // toute la journée un travail déjà fait.
  it('ce qui vient d’être dispatché ne réclame plus rien', () => {
    expect(aMettreEnForme(vracs).some(a => a.produit === 'SM. Crunchy Pistache')).toBe(false)
  })

  // ⚠️ Une répartition laisse toujours des poussières. Une ligne qui ne part
  // jamais, c'est une ligne qu'on apprend à ignorer — et alors tout le reste
  // avec.
  it('ne compte pas les poussières', () => {
    expect(aMettreEnForme([{ produit: 'x', unite: 'g', resteG: 0.4 }])).toEqual([])
  })

  it('un stock négatif (compteur faux) ne réclame rien', () => {
    expect(aMettreEnForme([{ produit: 'x', unite: 'g', resteG: -120 }])).toEqual([])
  })

  it('sans rien, rien ne casse', () => {
    expect(aMettreEnForme(null)).toEqual([])
    expect(aMettreEnForme([])).toEqual([])
  })
})

// ============================================================
// LE DISPATCH : ce qui part chez Odoo quand on a fini de mouler.
// ============================================================
import { dispatchVersOdoo, prevuParLaRecette } from './miseEnForme'

// La gélée se compte en GRAMMES chez Odoo, sa ligne de recette aussi.
const formatsG = [
  { produit: 'SM. Gélée Mangue Ananas Pistache 10 pers', unite: 'u', uniteVrac: 'g', parUnite: 140 },
  { produit: 'SM. Gélée Mangue Ananas Pistache Indiv', unite: 'u', uniteVrac: 'g', parUnite: 22 },
]

// ⚠️ Le crunchy, lui, se compte en KILOS — et c'est par là qu'un facteur mille
// se glisse (vécu : 14,33 g de crème là où il en fallait 14 328).
const formatsKg = [
  { produit: 'SM. Crunchy Citron Passion 10 pers', unite: 'u', uniteVrac: 'kg', parUnite: 0.14 },
]

describe('ce que la recette prévoit', () => {
  it('compte en grammes, quelle que soit l’unité d’Odoo', () => {
    expect(prevuParLaRecette(formatsG, { 'SM. Gélée Mangue Ananas Pistache 10 pers': 10 })).toBe(1400)
    expect(prevuParLaRecette(formatsKg, { 'SM. Crunchy Citron Passion 10 pers': 10 })).toBe(1400)
  })
})

describe('le dispatch qui part chez Odoo', () => {
  const base = { vrac: 'SM. Gélée Mangue Ananas Pistache', stock: 2030, uniteStock: 'g', formats: formatsG }

  it('un ordre par format servi, et rien pour les autres', () => {
    const o = dispatchVersOdoo({ ...base,
      quantites: { 'SM. Gélée Mangue Ananas Pistache 10 pers': 14, 'SM. Gélée Mangue Ananas Pistache Indiv': 0 },
      reste: 70 })
    expect(o.map(x => x.produit)).toEqual(['SM. Gélée Mangue Ananas Pistache 10 pers'])
    expect(o[0].qty).toBe(14)
    // 14 × 140 = 1 960, et il en reste 70 : 2 030 − 70 = 1 960. La recette
    // tombe juste, Odoo n'a aucune consigne à recevoir.
    expect(o[0].ajustements).toBeNull()
  })

  // ⚠️ LA RÈGLE DE LAYLA : « s'il ne reste rien, le reste de la crème théorique
  // doit rentrer dans le produit ».
  it('« il ne m’en reste rien » fait tout rentrer dans le produit', () => {
    const o = dispatchVersOdoo({ ...base,
      quantites: { 'SM. Gélée Mangue Ananas Pistache 10 pers': 14 }, reste: 0 })
    expect(o[0].ajustements).toEqual({ 'SM. Gélée Mangue Ananas Pistache': 2030 })
  })

  it('les autres formats reçoivent ZÉRO, sinon le vrac compte deux fois', () => {
    const o = dispatchVersOdoo({ ...base,
      quantites: { 'SM. Gélée Mangue Ananas Pistache 10 pers': 10, 'SM. Gélée Mangue Ananas Pistache Indiv': 20 },
      reste: 0 })
    expect(o[0].ajustements).toEqual({ 'SM. Gélée Mangue Ananas Pistache': 2030 })
    expect(o[1].ajustements).toEqual({ 'SM. Gélée Mangue Ananas Pistache': 0 })
  })

  // ⚠️ LE FACTEUR MILLE, encore lui : la consigne part dans l'unité de la
  // LIGNE de recette, pas en grammes.
  it('rend la consigne dans l’unité de la recette (kg)', () => {
    const o = dispatchVersOdoo({ vrac: 'SM. Crunchy Citron Passion', stock: 5.37, uniteStock: 'kg',
      formats: formatsKg, quantites: { 'SM. Crunchy Citron Passion 10 pers': 10 }, reste: 0 })
    expect(o[0].ajustements).toEqual({ 'SM. Crunchy Citron Passion': 5.37 })
  })

  it('rien de coché, rien à envoyer', () => {
    expect(dispatchVersOdoo({ ...base, quantites: {}, reste: 0 })).toEqual([])
  })

  it('un reste plus grand que le stock ne fabrique pas du négatif', () => {
    const o = dispatchVersOdoo({ ...base,
      quantites: { 'SM. Gélée Mangue Ananas Pistache 10 pers': 1 }, reste: 99999 })
    expect(o[0].ajustements).toEqual({ 'SM. Gélée Mangue Ananas Pistache': 0 })
  })
})

// ============================================================
// L'UNITÉ DE LA QUANTITÉ IMPOSÉE — une seule convention partout.
//
// « Assure-toi que partout pareil » (Layla, 2026-09-21). Cet écran-ci
// convertissait DÉJÀ vers l'unité de la ligne de recette, alors que tous les
// autres envoient l'unité de l'article. Depuis que le serveur convertit lui-
// même, convertir ici aussi aurait rejoué le facteur mille par l'autre bout.
// ============================================================
describe('la quantité imposée part dans l’unité de l’article', () => {
  // Un vrac compté en KILOS chez Odoo, dont la recette s'écrit en GRAMMES.
  const formats = [
    { produit: 'SM- Base Tarte CBS 23 cm', unite: 'u', uniteVrac: 'g', parUnite: 190 },
    { produit: 'SM- Base Tarte CBS 18 cm', unite: 'u', uniteVrac: 'g', parUnite: 116 },
  ]
  const commun = {
    vrac: 'SM. Ganache Gold', stock: 2090, uniteStock: 'g', formats,
    quantites: { 'SM- Base Tarte CBS 23 cm': 5, 'SM- Base Tarte CBS 18 cm': 5 },
    reste: 0,
  }

  it('en kilos quand Odoo compte le vrac en kilos', () => {
    const o = dispatchVersOdoo({ ...commun, uniteVracArticle: 'kg' })
    expect(o[0].ajustements['SM. Ganache Gold']).toBeCloseTo(2.09, 6)
    expect(o[1].ajustements['SM. Ganache Gold']).toBe(0)   // la cuve est déjà passée
  })

  it('en grammes quand Odoo compte le vrac en grammes', () => {
    const o = dispatchVersOdoo({ ...commun, uniteVracArticle: 'g' })
    expect(o[0].ajustements['SM. Ganache Gold']).toBeCloseTo(2090, 6)
  })

  // Repli : sans l'unité de l'article, on garde celle de la ligne — elles sont
  // identiques dans l'immense majorité des cas.
  it('sans l’unité de l’article, on retombe sur celle de la ligne', () => {
    const o = dispatchVersOdoo(commun)
    expect(o[0].ajustements['SM. Ganache Gold']).toBeCloseTo(2090, 6)
  })
})
