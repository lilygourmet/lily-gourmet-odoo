import { describe, it, expect } from 'vitest'
import { bloquants, noeudAu, enfantsDe } from './fabAnnexe'

// Un tiramisu tel que l'API le renvoie, en plus court.
const tiramisu = {
  produit: 'SM- Tiramisu indiv',
  libelle: 'Tiramisu individuel',
  composants: [
    { produit: 'MP- Mascarpone', fabrique: false, fige: true, ok: true },
    { produit: 'MP- Eau robinet', fabrique: false, fige: false, ok: true },
    { produit: 'SM Amaretti orange Tiramisu', fabrique: true, fige: false, ok: true },
    {
      produit: 'SM. Biscuit a la cuillere Indiv', fabrique: true, fige: false, ok: false,
      enfants: [
        {
          produit: 'SM. Biscuit a la cuillere (plaque)', fabrique: true, fige: false, ok: false,
          enfants: [{ produit: 'MP- Farine', fabrique: false, fige: false, ok: true }],
        },
      ],
    },
  ],
}

describe('bloquants', () => {
  it('ne retient que ce qui se fabrique et qui manque', () => {
    expect(bloquants(tiramisu, [])).toEqual(['SM. Biscuit a la cuillere Indiv'])
  })

  it('ne bloque plus sur ce que le pâtissier vient de déclarer', () => {
    expect(bloquants(tiramisu, ['SM. Biscuit a la cuillere Indiv'])).toEqual([])
  })

  it('vaut aussi au fond de la recette : la plaque bloque le biscuit', () => {
    const biscuit = tiramisu.composants[3]
    expect(bloquants(biscuit, [])).toEqual(['SM. Biscuit a la cuillere (plaque)'])
    // Et la farine, achetée, ne bloque jamais la plaque : le pâtissier ne
    // peut pas la fabriquer, et le stock MP de l'annexe n'est pas fiable.
    expect(bloquants(biscuit.enfants[0], [])).toEqual([])
  })
})

describe('noeudAu', () => {
  it('descend aussi loin que le chemin', () => {
    const c = ['SM- Tiramisu indiv', 'SM. Biscuit a la cuillere Indiv', 'SM. Biscuit a la cuillere (plaque)']
    const { article, noeud, parent } = noeudAu([tiramisu], c)
    expect(article.produit).toBe('SM- Tiramisu indiv')
    expect(noeud.produit).toBe('SM. Biscuit a la cuillere (plaque)')
    expect(parent).toBe('SM. Biscuit a la cuillere Indiv')
  })

  it('rend un nœud vide si le chemin ne mène nulle part', () => {
    expect(noeudAu([tiramisu], ['SM- Tiramisu indiv', 'inconnu']).noeud).toBe(null)
    expect(noeudAu([], ['rien']).article).toBe(null)
  })

  it('lit les composants d’un article comme les enfants d’un morceau', () => {
    expect(enfantsDe(tiramisu)).toHaveLength(4)
    expect(enfantsDe(tiramisu.composants[3])).toHaveLength(1)
    expect(enfantsDe(tiramisu.composants[0])).toEqual([])
  })
})
