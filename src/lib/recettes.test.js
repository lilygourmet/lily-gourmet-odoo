// ============================================================
// « Si j'ai l'habitude de bosser avec 1 000 g de sucre, je vais modifier ça et
// la suite suit, pour voir le ratio avec les autres » (Layla, 2026-09-23).
//
// Tout l'écran tient sur ce calcul : il dit à quelle ÉCHELLE lire la recette.
// ============================================================
import { describe, it, expect } from 'vitest'
import { quantitePour } from './recettes'

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
