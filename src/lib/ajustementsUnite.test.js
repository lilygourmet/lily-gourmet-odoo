// ============================================================
// LES DEUX UNITÉS QUI SE CROISENT — LA CAUSE DU FACTEUR MILLE.
//
// « Arrête de reproduire cette erreur ; ça a été fait plusieurs fois. Assure-toi
// que partout pareil » (Layla, 2026-09-21).
//
// L'app compte un ingrédient dans l'unité de l'ARTICLE : la crème whipping se
// compte en kilos, 3,52. Odoo écrit la même chose dans l'unité de la LIGNE de
// recette : 3 520 g. Et c'est la LIGNE qui fait foi — `product_uom_qty` part
// avec le `product_uom` de la ligne. 3,52 devenait donc 3,52 GRAMMES.
//
// Pire : `corrigerFacteurMille` comparait les deux sans convertir, voyait un
// rapport de mille, et divisait la quantité PRODUITE par mille. Le garde-fou
// construit contre le facteur mille le provoquait.
//
// Huit ordres touchés entre le 8 et le 21 septembre, cinq déjà validés.
// Chacun est rejoué ici avec ses vrais chiffres.
// ============================================================
import { describe, it, expect } from 'vitest'
import { ajustementsEnUniteLigne, corrigerFacteurMille } from '../../api/freezer-list.js'

/** Les ingrédients de l'annexe se comptent presque tous en kilos chez Odoo. */
const enKilos = () => 'kg'
const enGrammes = () => 'g'

// ---- LA MOUSSE GIANDUJA, ordre WHPDX/MO/21740 du 21/09 ----
// Recette en GRAMMES, sortie 6 120 g. L'app impose des KILOS.
const mousse = [
  { product_id: [1, 'MP- Gelatine feuille'], product_qty: 40, product_uom_id: [1, 'g'] },
  { product_id: [2, 'MP- Crème whipping'], product_qty: 3520, product_uom_id: [1, 'g'] },
  { product_id: [3, 'MP- Chocolat Weiss Gianduja'], product_qty: 2200, product_uom_id: [1, 'g'] },
  { product_id: [4, 'MP- Praliné Noisette 50%'], product_qty: 360, product_uom_id: [1, 'g'] },
]
const imposeEnKilos = {
  'MP- Gelatine feuille': 0.04, 'MP- Crème whipping': 3.52,
  'MP- Chocolat Weiss Gianduja': 2.2, 'MP- Praliné Noisette 50%': 0.36,
}

describe('remettre les quantités imposées dans l’unité de la recette', () => {
  it('convertit les kilos de l’app en grammes de la recette', () => {
    const r = ajustementsEnUniteLigne(imposeEnKilos, mousse, enKilos)
    expect(r['MP- Crème whipping']).toBeCloseTo(3520, 6)
    expect(r['MP- Gelatine feuille']).toBeCloseTo(40, 6)
    expect(r['MP- Praliné Noisette 50%']).toBeCloseTo(360, 6)
  })

  it('ne touche à rien quand les deux unités sont les mêmes', () => {
    const deja = { 'MP- Crème whipping': 3520 }
    expect(ajustementsEnUniteLigne(deja, mousse, enGrammes)['MP- Crème whipping']).toBe(3520)
  })

  // ⚠️ ON NE DEVINE JAMAIS : une unité illisible laisse le nombre intact.
  it('laisse intact ce qu’elle ne sait pas convertir', () => {
    const pieces = [{ product_id: [9, 'SM. Fond de tarte'], product_qty: 12, product_uom_id: [2, 'Units'] }]
    const r = ajustementsEnUniteLigne({ 'SM. Fond de tarte': 12 }, pieces, () => 'Units')
    expect(r['SM. Fond de tarte']).toBe(12)
  })

  it('la référence Odoo entre crochets ne casse pas le rapprochement', () => {
    const avecRef = [{ product_id: [2, '[MP0042] MP- Crème whipping'], product_qty: 3520, product_uom_id: [1, 'g'] }]
    expect(ajustementsEnUniteLigne({ 'MP- Crème whipping': 3.52 }, avecRef, enKilos)['MP- Crème whipping'])
      .toBeCloseTo(3520, 6)
  })

  it('un ingrédient absent de la recette passe sans être touché', () => {
    expect(ajustementsEnUniteLigne({ 'MP- Inconnu': 5 }, mousse, enKilos)['MP- Inconnu']).toBe(5)
  })

  it('rien à convertir, rien ne casse', () => {
    expect(ajustementsEnUniteLigne({}, mousse, enKilos)).toEqual({})
    expect(ajustementsEnUniteLigne(null, mousse, enKilos)).toBe(null)
  })
})

// ============================================================
// LE GARDE-FOU, UNE FOIS LES UNITÉS REMISES D'APLOMB.
// ============================================================
describe('le garde-fou ne se retourne plus contre nous', () => {
  it('AVANT : les kilos bruts le faisaient diviser par mille', () => {
    // C'est exactement ce qui a produit WHPDX/MO/21740 à 6,12 g.
    const r = corrigerFacteurMille(6120, 6120, mousse, imposeEnKilos)
    expect(r.corrige).toBe(-1000)
    expect(r.qty).toBeCloseTo(6.12, 6)
  })

  it('APRÈS : converties d’abord, il ne touche plus à rien', () => {
    const ok = ajustementsEnUniteLigne(imposeEnKilos, mousse, enKilos)
    const r = corrigerFacteurMille(6120, 6120, mousse, ok)
    expect(r.corrige).toBe(0)
    expect(r.qty).toBeCloseTo(6120, 6)
  })

  // ---- LA CRÈME CITRON GINGEMBRE, ordres 21427 / 21428 / 21437 du 11/09 ----
  // 14 328 g déclarés, 14,33 g partis, et VALIDÉS tels quels.
  it('la crème citron gingembre repart à 14 328 g, plus à 14,33', () => {
    const lignes = [
      { product_id: [1, 'SM. Citron liquide'], product_qty: 1440, product_uom_id: [1, 'g'] },
      { product_id: [2, 'MP- Sucre Granule'], product_qty: 920, product_uom_id: [1, 'g'] },
      { product_id: [3, 'F- Gingembre frais'], product_qty: 420, product_uom_id: [1, 'g'] },
      { product_id: [4, 'MP- Oeufs entier'], product_qty: 2320, product_uom_id: [1, 'g'] },
      { product_id: [5, 'MP- Beurre entremets'], product_qty: 1800, product_uom_id: [1, 'g'] },
    ]
    // Deux recettes, pesées par l'app EN KILOS.
    const deuxRecettesEnKilos = {
      'SM. Citron liquide': 2.88, 'MP- Sucre Granule': 1.84, 'F- Gingembre frais': 0.84,
      'MP- Oeufs entier': 4.64, 'MP- Beurre entremets': 3.6,
    }
    expect(corrigerFacteurMille(14328, 7164, lignes, deuxRecettesEnKilos).corrige).toBe(-1000)

    const ok = ajustementsEnUniteLigne(deuxRecettesEnKilos, lignes, enKilos)
    const r = corrigerFacteurMille(14328, 7164, lignes, ok)
    expect(r.corrige).toBe(0)
    expect(r.qty).toBeCloseTo(14328, 6)
  })

  // ⚠️ ET LE GARDE-FOU GARDE SON UTILITÉ DANS L'AUTRE SENS : c'est lui qui a
  // évité 54 tonnes de génoise. On ne le désarme pas, on lui donne de bons
  // chiffres.
  it('il rattrape toujours une sortie mille fois trop petite', () => {
    const vraiesGrammes = {
      'MP- Gelatine feuille': 40, 'MP- Crème whipping': 3520,
      'MP- Chocolat Weiss Gianduja': 2200, 'MP- Praliné Noisette 50%': 360,
    }
    const r = corrigerFacteurMille(6.12, 6120, mousse, vraiesGrammes)
    expect(r.corrige).toBe(1000)
    expect(r.qty).toBeCloseTo(6120, 6)
  })
})
