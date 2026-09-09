import { describe, it, expect } from 'vitest'
import { bloquants, noeudAu, enfantsDe, parGateauMere, parJour, tourneesSuggerees,
  lignesRecette, pourFois, enfantsPour, noeudAu as descendre } from './fabAnnexe'

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
  })

  it('laisse les GS- dehors — ils ont leur propre circuit', () => {
    const noms = parGateauMere(arts, '').flatMap(g => g.articles.map(a => a.produit))
    expect(noms).not.toContain('GS- Ghriba Behla')
    // mais la recherche les retrouve
    expect(parGateauMere(arts, 'ghriba').flatMap(g => g.articles.map(a => a.produit)))
      .toContain('GS- Ghriba Behla')
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

describe('tourneesSuggerees', () => {
  it('propose une tournée ENTIÈRE quand il n’y a rien à rattraper', () => {
    // Tout l'onglet « Déclarer » est dans ce cas : ni mini ni maxi, reste 0.
    // Il proposait 70 tiramisus pour une tournée de 140.
    expect(tourneesSuggerees({ tournee: 140, reste: 0 })).toBe(1)
    expect(tourneesSuggerees({ tournee: 5.55, reste: 0 })).toBe(1)
    expect(tourneesSuggerees({ tournee: 140, maxi: 140, stock: 228 })).toBe(1)
  })

  it('arrondit au demi ce qu’il faut pour atteindre le maxi', () => {
    expect(tourneesSuggerees({ tournee: 22, reste: 33 })).toBe(1.5)
    expect(tourneesSuggerees({ tournee: 140, reste: 140 })).toBe(1)
    expect(tourneesSuggerees({ tournee: 140, reste: 280 })).toBe(2)
  })

  it('jamais moins d’une demi-tournée quand il reste un fond à faire', () => {
    expect(tourneesSuggerees({ tournee: 140, reste: 3 })).toBe(0.5)
  })

  it('ne dépasse JAMAIS le maxi : on arrondit vers le bas', () => {
    // 25 pièces à rattraper, une tournée de 14 : une tournée et demie (21)
    // et non deux (28) — on ne fabrique pas au-delà du maxi.
    expect(tourneesSuggerees({ tournee: 14, reste: 25 })).toBe(1.5)
    expect(tourneesSuggerees({ tournee: 14, reste: 41 })).toBe(2.5)
  })
})

describe('lignesRecette', () => {
  const fond = {
    produit: 'SM- Fond Citron Framboise (1)',
    recette: [
      { produit: 'SM. Biscuit amande gingembre', qty: 638, unite: 'g' },
      { produit: 'SM. Confit de framboise prod', qty: 435, unite: 'g' },
      { produit: 'MP- Sucre Granule', qty: 100, unite: 'g' },
    ],
  }

  it('n’écrit pas deux fois ce qui est listé en composant juste en dessous', () => {
    const enfants = [
      { produit: 'SM. Biscuit amande gingembre' },
      { produit: 'SM. Confit de framboise prod' },
    ]
    expect(lignesRecette(fond, enfants).map(l => l.produit)).toEqual(['MP- Sucre Granule'])
  })

  it('garde toute la recette quand rien n’est listé en dessous', () => {
    expect(lignesRecette(fond, []).length).toBe(3)
    expect(lignesRecette(fond, null).length).toBe(3)
  })

  it('ne casse pas sur un article sans recette', () => {
    expect(lignesRecette({}, [{ produit: 'x' }])).toEqual([])
    expect(lignesRecette(null, null)).toEqual([])
  })
})

describe('pourFois — les composants suivent la quantité', () => {
  // Une demi-tournée de gâteaux ne demande pas une tournée entière de fonds.
  const gateau = {
    produit: 'Sm- Le Citron Framboise (1)',
    tournee: 58,
    composants: [{
      produit: 'SM- Fond Citron Framboise (1)',
      unite: 'u', besoin: 58, stock: 0, dejaFait: 0,
      fabrique: true, ok: false, tourneeTaille: 58, tournees: 1, produira: 58,
    }],
  }

  it('propose une demi-tournée de composant pour une demi-tournée de gâteau', () => {
    const c = pourFois(gateau, 0.5).composants[0]
    expect(c.besoin).toBe(29)
    expect(c.tournees).toBe(0.5)
    expect(c.produira).toBe(29)
  })

  it('arrondit au demi SUPÉRIEUR : le besoin doit être couvert', () => {
    // 35 fonds voulus sur une tournée de 58 : une demie (29) ne suffit pas.
    const g = { ...gateau, composants: [{ ...gateau.composants[0], besoin: 70 }] }
    const c = pourFois(g, 0.5).composants[0]
    expect(c.besoin).toBe(35)
    expect(c.tournees).toBe(1)
    expect(c.produira).toBe(58)
  })
})

describe('enfantsPour — les sous-composants suivent, à tous les niveaux', () => {
  // Le fond de citron framboise (5) : une tournée en sort 14, et sa recette
  // demande 1 960 g de biscuit, lui-même fait d'une plaque.
  const fond = {
    produit: 'SM- Fond Citron Framboise (5)',
    unite: 'u', tourneeTaille: 14, tournees: 1, produira: 14, pourQuantite: 14,
    enfants: [{
      produit: 'SM. Biscuit amande gingembre',
      unite: 'g', besoin: 1960, stock: 3292, dejaFait: 0,
      fabrique: true, ok: true, tourneeTaille: 4400, tournees: 1, produira: 4400,
      pourQuantite: 4400,
      enfants: [{
        produit: 'SM. Citron zest', unite: 'g', besoin: 13, stock: 0, dejaFait: 0,
        fabrique: true, ok: false, tourneeTaille: 1000, tournees: 0.5, produira: 500,
      }],
    }],
  }

  it('double les composants quand on double la fournée', () => {
    const e = enfantsPour(fond, 28)
    expect(e[0].besoin).toBe(3920)
    expect(e[0].enfants[0].besoin).toBe(26)   // le sous-sous-composant suit aussi
  })

  it('rend le composant BLOQUANT s’il ne suffit plus', () => {
    // 3 292 g de biscuit en stock : ça passe pour 14 fonds, plus pour 28.
    expect(enfantsPour(fond, 14)[0].ok).toBe(true)
    const gros = enfantsPour(fond, 28)[0]
    expect(gros.ok).toBe(false)
    expect(gros.tournees).toBe(0.5)           // 628 g manquants sur 4 400
  })

  it('ne touche à rien quand la quantité ne bouge pas', () => {
    expect(enfantsPour(fond, 14)).toBe(fond.enfants)
  })
})

describe('descendre — la quantité réglée suit dans les fiches du dessous', () => {
  // Le Citron Framboise (5) › son fond › le biscuit du fond.
  const arbre = () => ([{
    produit: 'Sm- Le Citron Framboise (5)', libelle: 'Citron Framboise (5)',
    tournee: 14, unite: 'u',
    composants: [{
      produit: 'SM- Fond Citron Framboise (5)',
      unite: 'u', besoin: 14, stock: 0, dejaFait: 0, fabrique: true, ok: false,
      tourneeTaille: 14, tournees: 1, produira: 14, pourQuantite: 14,
      enfants: [{
        produit: 'SM. Biscuit amande gingembre',
        unite: 'g', besoin: 1960, stock: 3292, dejaFait: 0, fabrique: true, ok: true,
        tourneeTaille: 4400, tournees: 1, produira: 4400, pourQuantite: 4400,
        enfants: [{
          produit: 'SM. Citron zest', unite: 'g', besoin: 13, stock: 0, dejaFait: 0,
          fabrique: true, ok: false, tourneeTaille: 1000, tournees: 0.5, produira: 500,
        }],
      }],
    }],
  }])
  const chemin = ['Sm- Le Citron Framboise (5)', 'SM- Fond Citron Framboise (5)',
    'SM. Biscuit amande gingembre']

  it('sans réglage, rien ne bouge', () => {
    expect(descendre(arbre(), chemin).noeud.besoin).toBe(1960)
  })

  it('le fond réglé sur 2 tournées ouvre le biscuit à 3 920 g, pas 1 960', () => {
    const foisDe = c => (c.produit === 'SM- Fond Citron Framboise (5)' ? 2 : undefined)
    const b = descendre(arbre(), chemin, foisDe).noeud
    expect(b.besoin).toBe(3920)
    expect(b.ok).toBe(false)                    // 3 292 g en stock ne suffisent plus
    expect(b.enfants[0].besoin).toBe(26)        // et le zeste suit aussi
  })

  it('un réglage est ABSOLU : 2 tournées de biscuit, c’est 2 tournées', () => {
    // Régler un étage ne multiplie pas celui du dessus : « 2 tournées de
    // biscuit » veut dire 2 × 4 400 g, d'où qu'on vienne. Le zeste suit cette
    // quantité-là — 13 g pour 4 400 g, donc 26 g pour 8 800.
    const foisDe = c => ({
      'SM- Fond Citron Framboise (5)': 2,
      'SM. Biscuit amande gingembre': 2,
    })[c.produit]
    const z = descendre(arbre(), [...chemin, 'SM. Citron zest'], foisDe).noeud
    expect(z.besoin).toBe(26)
  })

  it('la fiche ouvre sur la quantité annoncée, MÊME sans réglage à la main', () => {
    // Le gâteau est réglé sur 2 tournées : le biscuit passe à 3 920 g, il en
    // manque 628, donc une demi-tournée (2 200 g) est proposée. Le zeste
    // affiché sous le biscuit doit valoir cette demi-tournée — 6,5 g pour
    // 2 200 g — et non la quantité d'origine. C'est le bug des « 9 000 g de
    // génoise » dont la fiche s'ouvrait sur 4 500 (Layla, 2026-09-09).
    const gros = [pourFois(arbre()[0], 2)]
    const biscuit = descendre(gros, chemin).noeud
    expect(biscuit.besoin).toBe(3920)
    expect(biscuit.tournees).toBe(0.5)
    const zeste = descendre(gros, [...chemin, 'SM. Citron zest']).noeud
    expect(zeste.besoin).toBe(6.5)
  })

  it('la quantité par défaut d’un étage suit celle du dessus', () => {
    // Fond réglé sur 2 → il manque 628 g de biscuit → une demi-tournée
    // (2 200 g) est proposée, et le zeste vaut 6,5 g pour cette demi-tournée.
    const foisDe = c => (c.produit === 'SM- Fond Citron Framboise (5)' ? 2 : undefined)
    const b = descendre(arbre(), chemin, foisDe).noeud
    expect(b.tournees).toBe(0.5)
    expect(enfantsPour(b, b.tourneeTaille * b.tournees)[0].besoin).toBe(6.5)
  })
})
