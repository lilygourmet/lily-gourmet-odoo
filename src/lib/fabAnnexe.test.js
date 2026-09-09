import { describe, it, expect } from 'vitest'
import { bloquants, noeudAu, enfantsDe, parGateauMere, parJour } from './fabAnnexe'

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
    { produit: 'SMPr- Boite Biscotti', pour: [] },
    { produit: 'GS- Ghriba Behla', pour: [] },
    { produit: 'SM. Creme au beurre nature', pour: ['E- Fraisier'] },
    { produit: 'Sm. sirop imbibage', pour: ['E- Tiramisu'] },
    { produit: 'SM CD* Crème au beurre Praliné', pour: ['E- Fraisier'] },
    { produit: 'SMT. creme patissiere cbs', pour: ['E- Fraisier'] },
    { produit: 'SM/ beurre clarifie', pour: ['E- Fraisier'] },
    { produit: 'SM- Pr Cheesecake indiv', pour: ['E- Cheesecake'] },
    { produit: 'SM- Cheesecake indiv', pour: ['E- Cheesecake'] },
    { produit: 'SM- Cheesecake 10 pers', pour: ['E- Cheesecake'] },
    { produit: 'F- Framboise Congelée', pour: ['E- Le Citron Framboise'] },
  ]

  it('range chaque article sous CHAQUE gâteau qu’il sert', () => {
    const g = parGateauMere(arts, '')
    expect(g.find(x => x.nom === 'E- Fraisier').articles).toHaveLength(1)
    expect(g.find(x => x.nom === 'E- Suprême amande').articles).toHaveLength(1)
  })

  it('laisse les préparations hors de la liste — point, slash ou rien', () => {
    const noms = parGateauMere(arts, '').flatMap(g => g.articles.map(a => a.produit))
    expect(noms).not.toContain('SM. Creme au beurre nature')
    expect(noms).not.toContain('Sm. sirop imbibage')
    expect(noms).not.toContain('SM CD* Crème au beurre Praliné')
    expect(noms).not.toContain('SMT. creme patissiere cbs')
    expect(noms).not.toContain('SM/ beurre clarifie')
  })

  it('garde ce qui se monte, tiret ou autre famille', () => {
    const noms = parGateauMere(arts, '').flatMap(g => g.articles.map(a => a.produit))
    expect(noms).toContain('SMPr- Boite Biscotti')
    expect(noms).toContain('GS- Ghriba Behla')
  })

  it('met à la fin ce qui ne sert à aucun gâteau', () => {
    const g = parGateauMere(arts, '')
    expect(g[g.length - 1].nom).toBe('Le reste')
    expect(g[g.length - 1].articles[0].produit).toBe('SM- Truc inconnu')
  })

  it('ne montre que le « Pr » quand le couple existe, taille par taille', () => {
    const noms = parGateauMere(arts, '').flatMap(g => g.articles.map(a => a.produit))
    expect(noms).toContain('SM- Pr Cheesecake indiv')
    expect(noms).not.toContain('SM- Cheesecake indiv')
    expect(noms).toContain('SM- Cheesecake 10 pers')
  })

  it('laisse les fruits dehors', () => {
    const noms = parGateauMere(arts, '').flatMap(g => g.articles.map(a => a.produit))
    expect(noms).not.toContain('F- Framboise Congelée')
  })

  it('filtre sur la recherche', () => {
    expect(parGateauMere(arts, 'sirop')).toHaveLength(1)
    expect(parGateauMere(arts, 'rien du tout')).toHaveLength(0)
  })

  // Dès qu'on tape, on cherche un composant précis : tout est fouillé.
  it('la recherche retrouve AUSSI ce que la liste cache', () => {
    const trouve = q => parGateauMere(arts, q).flatMap(g => g.articles.map(a => a.produit))
    expect(trouve('creme beurre')).toContain('SM. Creme au beurre nature')
    expect(trouve('framboise')).toContain('F- Framboise Congelée')
    expect(trouve('cheesecake indiv')).toContain('SM- Cheesecake indiv')
  })

  it('pardonne les fautes et les mots inversés', () => {
    const trouve = q => parGateauMere(arts, q).flatMap(g => g.articles.map(a => a.produit))
    expect(trouve('beurre creme')).toContain('SM. Creme au beurre nature')
    expect(trouve('crème')).toContain('SM. Creme au beurre nature')
    expect(trouve('framboize')).toContain('F- Framboise Congelée')
    expect(trouve('imbibage sirop')).toContain('Sm. sirop imbibage')
  })
})

describe('parJour', () => {
  const histo = [
    { id: 1, jour: '2026-09-09', article: 'A' },
    { id: 2, jour: '2026-09-07', article: 'B' },
    { id: 3, jour: '2026-09-09', article: 'C' },
  ]

  it('range par date, la plus récente en haut', () => {
    const j = parJour(histo)
    expect(j.map(([d]) => d)).toEqual(['2026-09-09', '2026-09-07'])
    expect(j[0][1].map(l => l.article)).toEqual(['A', 'C'])
  })

  it('ne casse pas sur rien', () => {
    expect(parJour(null)).toEqual([])
  })
})
