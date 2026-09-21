// ============================================================
// TOUT PARLE EN GRAMMES, MÊME CE QUI VIENT EN KILOS.
//
// « Tous les ingrédients article dans l'app parlent en gr, même s'ils viennent
// en kilo » (Layla, 2026-09-21), après avoir vu « produit sur 1,4 » dans
// « À valider Annexe » — 1,4 quoi ? — juste sous un titre qui disait 1 400 g.
//
// Et surtout après le vrai dégât : une tournée réglée à « 1400 » sur un
// article compté en kilos, soit 1 400 kg. L'écran proposait 14 000 000 g à
// fabriquer, avec 1,2 tonne d'eau dans la recette.
// ============================================================
import { describe, it, expect } from 'vitest'
import { enGrammes, enUnite, uniteAffichee, qte } from './ecranSimple'

describe('ce que l’atelier lit', () => {
  it('un article en kilos s’affiche en grammes', () => {
    expect(enGrammes(1.4, 'kg')).toBe(1400)
    expect(qte(1.4, 'kg')).toMatch(/1[\u202f\u00a0 ]400 g/)
    expect(uniteAffichee('kg')).toBe('g')
  })

  it('un article déjà en grammes ne bouge pas', () => {
    expect(enGrammes(1400, 'g')).toBe(1400)
    expect(uniteAffichee('g')).toBe('g')
  })

  it('les pièces restent des pièces', () => {
    expect(enGrammes(12, 'u')).toBe(12)
    expect(uniteAffichee('u')).toBe('u')
  })
})

describe('ce que l’atelier tape', () => {
  it('1 400 g tapés font 1,4 kg chez Odoo', () => {
    expect(enUnite(1400, 'kg')).toBe(1.4)
  })

  it('et l’aller-retour ne perd rien', () => {
    for (const v of [0.2, 1.4, 5.425, 5.208, 0.642]) {
      expect(enUnite(enGrammes(v, 'kg'), 'kg')).toBeCloseTo(v, 6)
    }
  })

  // ⚠️ LE DÉGÂT DU 21/09 : taper 1400 en pensant grammes, dans une case qui
  // attendait des kilos. Une tournée de 1 400 kg au lieu de 1,4.
  it('1 400 pris pour des kilos, c’est mille fois trop', () => {
    expect(enGrammes(1400, 'kg')).toBe(1400000)
  })
})
