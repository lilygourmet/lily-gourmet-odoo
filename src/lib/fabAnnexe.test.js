import { describe, it, expect } from 'vitest'
import { bloquants, noeudAu, enfantsDe, familleDe } from './fabAnnexe'

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

describe('familleDe', () => {
  it('range une préparation d’après son nom', () => {
    expect(familleDe('SM. Creme au beurre nature production')).toBe('Crèmes au beurre')
    expect(familleDe("SM. Sirop d'imbibage cafe Tiramisu")).toBe('Sirops')
    expect(familleDe('SM. Biscuit amande gingembre')).toBe('Biscuits et pâtes')
    expect(familleDe('SM. glacage mirroir Finition')).toBe('Glaçages')
    expect(familleDe('SM. crunchy citron passion')).toBe('Croustillants')
    expect(familleDe('SM. Chantilly à la Rose')).toBe('Crèmes et mousses')
  })

  // « SM- » désigne ce qui est monté, « SM. » une préparation. C'est la
  // distinction la plus utile de tout le catalogue.
  it('sépare ce qui est monté des préparations', () => {
    expect(familleDe('SM- flan vanille 20 cm')).toBe('Gâteaux et pièces montés')
    expect(familleDe('SM- Gianduja 10 pers')).toBe('Gâteaux et pièces montés')
    expect(familleDe('SM- cadre foret noir grand Production')).toBe('Gâteaux et pièces montés')
    expect(familleDe('SM. Voile mangue passion')).toBe('Le reste')
    expect(familleDe('')).toBe('Le reste')
  })

  // La crème au beurre passe avant les crèmes : sinon elle tomberait dans le
  // sac commun, alors que c'est une famille à elle seule.
  it('distingue la crème au beurre des autres crèmes', () => {
    expect(familleDe('SM. Creme au beurre citron')).toBe('Crèmes au beurre')
    expect(familleDe('SM. creme patissiere vitrine')).toBe('Crèmes et mousses')
  })
})
