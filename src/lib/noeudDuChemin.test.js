// La navigation de l'écran simplifié : où l'on est, et pour quelle quantité.
//
// C'est ici que se cache le bug le plus cher de la semaine — la dose d'une
// fournée affichée au-dessus des besoins de deux. On redescend donc le chemin
// en recalculant à chaque étage, et ces tests montent la garde.
import { describe, it, expect } from 'vitest'
import { noeudDuChemin, defautDe } from './fabAnnexe'

const sirop = {
  produit: "SM. Sirop d'imbibage cafe Tiramisu", unite: 'g', fabrique: true,
  besoin: 1300, stock: 0, dejaFait: 0, ok: false, tourneeTaille: 2790,
  tournees: 1, produira: 2790, pourQuantite: 2790,
  recette: [{ produit: 'MP- Sucre Granule', qty: 500, unite: 'g' }],
  enfants: [],
}
const tiramisu = {
  produit: 'SM- Tiramisu 15cm', libelle: 'Tiramisu 15 cm', unite: 'u',
  tournee: 140, reste: 140, composants: [sirop],
}

describe('noeudDuChemin', () => {
  it('s’arrête sur l’article de tête', () => {
    const { noeud, tete } = noeudDuChemin(tiramisu, ['SM- Tiramisu 15cm'], {})
    expect(noeud.produit).toBe('SM- Tiramisu 15cm')
    expect(noeud).toBe(tete)
    expect(noeud.tourneeTaille).toBe(140)
  })

  it('descend dans un composant', () => {
    const { noeud } = noeudDuChemin(tiramisu,
      ['SM- Tiramisu 15cm', "SM. Sirop d'imbibage cafe Tiramisu"], {})
    expect(noeud.produit).toBe("SM. Sirop d'imbibage cafe Tiramisu")
    expect(noeud.besoin).toBe(1300)
  })

  it('LA QUANTITÉ SUIT : moitié moins de gâteaux, moitié moins de sirop', () => {
    const { noeud } = noeudDuChemin(tiramisu,
      ['SM- Tiramisu 15cm', "SM. Sirop d'imbibage cafe Tiramisu"],
      { 'SM- Tiramisu 15cm': 70 })
    expect(noeud.besoin).toBe(650)
  })

  it('rend un nœud vide quand le chemin ne mène nulle part', () => {
    const { noeud } = noeudDuChemin(tiramisu, ['SM- Tiramisu 15cm', 'SM. Disparu'], {})
    expect(noeud).toBeNull()
  })
})

describe('defautDe', () => {
  it('un composant : ce que le serveur a prévu d’en produire', () => {
    expect(defautDe(sirop)).toBe(2790)
  })

  it('un article de tête : ce qu’on peut faire maintenant', () => {
    expect(defautDe({ ...tiramisu, reste: 13 })).toBe(13)
  })

  it('une plaque ne se fait pas à moitié', () => {
    expect(defautDe({ produit: 'SM. plaque biscuit', reste: 1, tournee: 4 })).toBe(4)
  })
})
