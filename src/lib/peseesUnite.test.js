// ============================================================
// UNE SEULE CONVENTION POUR LES QUANTITÉS IMPOSÉES — ENFIN.
//
// « Je pense que j'étais claire sur ce sujet ! » (Layla, 2026-09-22 au soir,
// devant « recette : 5 600 000 g » d'œufs et un ordre de 32 000 plaques au
// lieu de 32). Elle l'était : le matin même, « arrête de reproduire cette
// erreur… assure-toi que partout pareil ».
//
// CE QUE J'AVAIS MANQUÉ. J'avais unifié le SERVEUR — il convertit les
// quantités imposées de l'unité de l'article vers celle de la ligne — sans
// voir que le CLIENT en envoyait deux sortes dans le MÊME objet :
//
//   • `toutConsomme` / `cuveDeclaree` lisent `c.stock` et `c.dejaFait`,
//     qui sont dans l'unité de l'ARTICLE  → 1,4 kg d'œufs ;
//   • `peseesDe` lisait la recette, écrite dans l'unité de la LIGNE
//     → 1 400 g d'œufs.
//
// Le serveur convertissait donc les secondes une fois de trop : les œufs
// partaient ×1000, et `corrigerFacteurMille` en concluait que la SORTIE était
// mille fois trop petite — d'où les 32 000 plaques.
//
// Vécu sur WHPDX/MO/21773, « SM. Biscuit Vieniess Cacao (Plaque) ».
// ============================================================
import { describe, it, expect } from 'vitest'
import { peseesDe } from './fabAnnexe'

// La vraie plaque du 22/09 : une tournée de 8, des œufs comptés en KILOS chez
// Odoo mais écrits en GRAMMES dans la recette.
const plaque = {
  produit: 'SM. Biscuit Vieniess Cacao (Plaque)', unite: 'u', tournee: 8,
  recette: [
    { produit: 'MP- Oeufs entier', qty: 1400, unite: 'g' },
    { produit: 'MP- Sucre Granule', qty: 1110, unite: 'g' },
  ],
  composants: [
    { produit: 'MP- Oeufs entier', unite: 'kg', besoin: 1.4 },
    { produit: 'MP- Sucre Granule', unite: 'kg', besoin: 1.11 },
  ],
}

describe('les pesées sortent dans l’unité de l’ARTICLE', () => {
  it('une tournée : 1 400 g de recette deviennent 1,4 kg', () => {
    const p = peseesDe(plaque, 1)
    expect(p['MP- Oeufs entier']).toBeCloseTo(1.4, 6)
    expect(p['MP- Sucre Granule']).toBeCloseTo(1.11, 6)
  })

  // ⚠️ LE CAS VÉCU : quatre tournées (32 plaques pour une tournée de 8).
  // AVANT, ça rendait 5 600 — pris pour des kilos par le serveur, converti une
  // fois de trop, et l'ordre finissait à 32 000 plaques.
  it('quatre tournées : 5,6 kg, jamais 5 600', () => {
    expect(peseesDe(plaque, 4)['MP- Oeufs entier']).toBeCloseTo(5.6, 6)
  })

  it('quand la recette et l’article parlent déjà pareil, rien ne bouge', () => {
    const memeUnite = {
      recette: [{ produit: 'SM. Masse Gélatine', qty: 900, unite: 'g' }],
      composants: [{ produit: 'SM. Masse Gélatine', unite: 'g' }],
    }
    expect(peseesDe(memeUnite, 1)['SM. Masse Gélatine']).toBeCloseTo(900, 6)
  })

  // ⚠️ ON NE DEVINE JAMAIS : sans l'unité de l'article, on rend le nombre tel
  // quel plutôt qu'un chiffre inventé.
  it('sans composant connu, le nombre part intact', () => {
    const sansComposant = { recette: [{ produit: 'MP- X', qty: 250, unite: 'g' }], composants: [] }
    expect(peseesDe(sansComposant, 1)['MP- X']).toBeCloseTo(250, 6)
  })

  it('une unité illisible ne fait rien inventer non plus', () => {
    const tournee = {
      recette: [{ produit: 'MP- Y', qty: 3, unite: 'Tournée (3 kg)' }],
      composants: [{ produit: 'MP- Y', unite: 'u' }],
    }
    expect(peseesDe(tournee, 1)['MP- Y']).toBeCloseTo(3, 6)
  })

  // Un même ingrédient sur deux lignes : Odoo pose la consigne sur chacune, on
  // répartit — et la conversion vient APRÈS le partage.
  it('un ingrédient sur deux lignes reste réparti, et converti', () => {
    const deuxLignes = {
      recette: [
        { produit: 'MP- Sucre Granule', qty: 1000, unite: 'g' },
        { produit: 'MP- Sucre Granule', qty: 1000, unite: 'g' },
      ],
      composants: [{ produit: 'MP- Sucre Granule', unite: 'kg' }],
    }
    expect(peseesDe(deuxLignes, 1)['MP- Sucre Granule']).toBeCloseTo(1, 6)
  })

  it('pas de recette, rien à imposer', () => {
    expect(peseesDe({ composants: [] }, 1)).toEqual({})
    expect(peseesDe(null, 1)).toEqual({})
  })
})
