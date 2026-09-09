import { describe, it, expect } from 'vitest'
import { bloquants, noeudAu, enfantsDe, parGateauMere } from './fabAnnexe'

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

describe('parGateauMere', () => {
  const arts = [
    { produit: 'SM- Fraisier 20 cm', pour: ['E- Fraisier', 'E- Suprême amande'] },
    { produit: 'SM- Sirop café monté', pour: ['E- Tiramisu'] },
    { produit: 'SM- Truc inconnu', pour: [] },
    { produit: 'SM. Creme au beurre nature', pour: ['E- Fraisier'] },
    { produit: 'Sm. sirop imbibage', pour: ['E- Tiramisu'] },
  ]

  it('range chaque article sous CHAQUE gâteau qu’il sert', () => {
    const g = parGateauMere(arts, '')
    expect(g.find(x => x.nom === 'E- Fraisier').articles).toHaveLength(1)
    expect(g.find(x => x.nom === 'E- Suprême amande').articles).toHaveLength(1)
  })

  it('laisse les préparations hors de la liste', () => {
    const noms = parGateauMere(arts, '').flatMap(g => g.articles.map(a => a.produit))
    expect(noms).not.toContain('SM. Creme au beurre nature')
    expect(noms).not.toContain('Sm. sirop imbibage')
  })

  it('met à la fin ce qui ne sert à aucun gâteau', () => {
    const g = parGateauMere(arts, '')
    expect(g[g.length - 1].nom).toBe('Le reste')
    expect(g[g.length - 1].articles[0].produit).toBe('SM- Truc inconnu')
  })

  it('filtre sur la recherche', () => {
    expect(parGateauMere(arts, 'sirop')).toHaveLength(1)
    expect(parGateauMere(arts, 'rien du tout')).toHaveLength(0)
  })
})
