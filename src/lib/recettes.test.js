// ============================================================
// « Si j'ai l'habitude de bosser avec 1 000 g de sucre, je vais modifier ça et
// la suite suit, pour voir le ratio avec les autres » (Layla, 2026-09-23).
//
// Tout l'écran tient sur ce calcul : il dit à quelle ÉCHELLE lire la recette.
// ============================================================
import { describe, it, expect } from 'vitest'
import { quantitePour, ajouterAuCache } from './recettes'

describe('quantitePour', () => {
  // La recette d'Odoo : 6 tartes, 250 g de sucre.
  const recette = { quantite: 6, besoinActuel: 250 }

  it('1 000 g de sucre au lieu de 250 : la recette est pour 24 tartes', () => {
    expect(quantitePour({ ...recette, besoinVoulu: 1000 })).toBe(24)
  })

  it('moins de sucre, moins de gâteaux', () => {
    expect(quantitePour({ ...recette, besoinVoulu: 125 })).toBe(3)
  })

  it('la même quantité ne change rien', () => {
    expect(quantitePour({ ...recette, besoinVoulu: 250 })).toBe(6)
  })

  it('accepte la virgule — c’est ce que tape un clavier de téléphone', () => {
    expect(quantitePour({ ...recette, besoinVoulu: '1000,5' })).toBe(24.012)
  })

  it('arrondit au millième : au-delà c’est du bruit sur une balance', () => {
    expect(quantitePour({ quantite: 1, besoinActuel: 3, besoinVoulu: 1 })).toBe(0.333)
  })

  // ⚠️ Rien plutôt qu'un chiffre faux : l'écran garde alors ce qu'il affichait.
  it('ne rend rien quand le calcul n’a pas de sens', () => {
    expect(quantitePour({ ...recette, besoinVoulu: '' })).toBeNull()
    expect(quantitePour({ ...recette, besoinVoulu: 'beaucoup' })).toBeNull()
    expect(quantitePour({ ...recette, besoinVoulu: 0 })).toBeNull()
    expect(quantitePour({ ...recette, besoinVoulu: -5 })).toBeNull()
  })

  it('un ingrédient à zéro ne donne aucune échelle', () => {
    expect(quantitePour({ quantite: 6, besoinActuel: 0, besoinVoulu: 1000 })).toBeNull()
  })

  it('une fournée à zéro non plus', () => {
    expect(quantitePour({ quantite: 0, besoinActuel: 250, besoinVoulu: 1000 })).toBeNull()
  })
})

// ============================================================
// Le plafond du cache. Sans lui, `localStorage` finit plein — et il refuse
// alors TOUTE écriture, en silence.
// ============================================================
describe('ajouterAuCache', () => {
  const noeud = n => ({ produit: n })

  it('range une recette', () => {
    const c = ajouterAuCache({}, 'A', noeud('A'), 1)
    expect(c.A.noeud).toEqual(noeud('A'))
    expect(c.A.quand).toBe(1)
  })

  it('remplace la même recette au lieu d’en garder deux', () => {
    let c = ajouterAuCache({}, 'A', noeud('vieux'), 1)
    c = ajouterAuCache(c, 'A', noeud('neuf'), 2)
    expect(Object.keys(c)).toEqual(['A'])
    expect(c.A.noeud).toEqual(noeud('neuf'))
  })

  it('au-delà du plafond, ce sont les PLUS VIEILLES qui partent', () => {
    let c = {}
    c = ajouterAuCache(c, 'vieille', noeud('v'), 1, 2)
    c = ajouterAuCache(c, 'moyenne', noeud('m'), 2, 2)
    c = ajouterAuCache(c, 'neuve', noeud('n'), 3, 2)
    expect(Object.keys(c).sort()).toEqual(['moyenne', 'neuve'])
  })

  it('part d’un cache vide ou absent sans broncher', () => {
    expect(Object.keys(ajouterAuCache(null, 'A', noeud('A'), 1))).toEqual(['A'])
  })
})
