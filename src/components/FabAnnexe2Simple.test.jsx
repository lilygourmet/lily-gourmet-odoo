// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CasesAFaire, Cases, Fiche, Clavier, Onglets, PourUn, Sortie } from './FabAnnexe2Simple'
import { sansRendement } from '../lib/fabAnnexe'
import { propre } from '../lib/ecranSimple'

// ====== L'écran simplifié, lu par des gens qui lisent peu ======
// Ce qui compte : le gros chiffre est une QUANTITÉ, le stock reste visible,
// ce qui manque se voit et s'ouvre, et aucun mot ne traîne pour rien.

afterEach(cleanup)

const tiramisu = {
  produit: 'SM- Tiramisu 15cm', libelle: 'Tiramisu 15 cm', unite: 'u',
  tourneeTaille: 13, reste: 13, photo: 'E- Tiramisu',
  recette: [],
  enfants: [
    { produit: 'SM Amaretti orange Tiramisu', unite: 'g', besoin: 780, stock: 4200, dejaFait: 0, fabrique: true, ok: true },
    { produit: "SM. Sirop d'imbibage cafe Tiramisu", unite: 'g', besoin: 1300, stock: 9570, dejaFait: 0, fabrique: true, ok: true },
    { produit: 'SM. Biscuit a la cuillere 5 pers', unite: 'u', besoin: 13, stock: 0, dejaFait: 0, fabrique: true, ok: false },
  ],
}

const plaque = {
  produit: 'SM. Biscuit a la cuillere (plaque)', unite: 'u', tourneeTaille: 4,
  recette: [
    { produit: 'MP- Oeufs blanc', qty: 0.75, unite: 'kg' },
    { produit: 'MP- Sucre Granule', qty: 0.75, unite: 'kg' },
    { produit: 'MP- Oeufs jaune', qty: 0.55, unite: 'kg' },
    { produit: 'MP- Farine', qty: 0.375, unite: 'kg' },
    { produit: 'MP- Maizena', qty: 0.375, unite: 'kg' },
  ],
  enfants: [],
}

describe('les noms, débarrassés de ce qui ne se lit pas', () => {
  it('enlève les préfixes d’Odoo', () => {
    expect(propre('SM- Tiramisu 15cm')).toBe('Tiramisu 15cm')
    expect(propre('MP- Oeufs blanc')).toBe('Oeufs blanc')
    expect(propre('[178] E- Tiramisu')).toBe('Tiramisu')
    expect(propre('SM. Biscuit a la cuillere (plaque)')).toBe('Biscuit a la cuillere (plaque)')
  })
})

describe('l’accueil', () => {
  it('montre une case par article, avec le nombre à faire', () => {
    render(<CasesAFaire articles={[tiramisu]} onOuvrir={() => {}} />)
    expect(screen.getByText('Tiramisu 15 cm')).toBeTruthy()
    expect(screen.getByText('13')).toBeTruthy()
  })

  it('ouvre l’article quand on tape dessus', () => {
    const onOuvrir = vi.fn()
    render(<CasesAFaire articles={[tiramisu]} onOuvrir={onOuvrir} />)
    fireEvent.click(screen.getByText('Tiramisu 15 cm'))
    expect(onOuvrir).toHaveBeenCalledWith('SM- Tiramisu 15cm')
  })

  it('la pastille dit ce qu’on fait MAINTENANT, le besoin total va dessous', () => {
    // Cadre forêt noir : il en faut 352, la recette en fait 88 à la fois.
    const cadre = { produit: 'SM- cadre foret noir grand Production',
      libelle: 'Cadre forêt noir', reste: 352, tournee: 88 }
    render(<CasesAFaire articles={[cadre]} onOuvrir={() => {}} />)
    expect(screen.getByText('88')).toBeTruthy()
    expect(screen.getByText(/il en faut 352/)).toBeTruthy()
  })

  it('ne répète pas le besoin quand une fournée suffit', () => {
    const royal = { produit: 'SM- Royal Chocolat 15 cm', libelle: 'Royal 15 cm', reste: 13, tournee: 13 }
    render(<CasesAFaire articles={[royal]} onOuvrir={() => {}} />)
    expect(screen.queryByText(/il en faut/)).toBeNull()
  })

  it('le dit quand il n’y a rien, sans jargon', () => {
    render(<CasesAFaire articles={[]} onOuvrir={() => {}} />)
    expect(screen.getByText(/Rien à faire/)).toBeTruthy()
  })
})

describe('la fiche', () => {
  const poser = (noeud, q = 13, extra = {}) => {
    const onQuantite = vi.fn(); const onOuvrir = vi.fn(); const onFait = vi.fn()
    render(<Fiche noeud={noeud} quantite={q} onQuantite={onQuantite}
      faits={{}} onOuvrir={onOuvrir} onFait={onFait} {...extra} />)
    return { onQuantite, onOuvrir, onFait }
  }

  it('montre la QUANTITÉ en gros, jamais un nombre de tournées', () => {
    poser(tiramisu)
    expect(screen.getByText('13')).toBeTruthy()
    expect(screen.queryByText(/tournée/i)).toBeNull()
  })

  it('écrit dessous ce que ça veut dire en vrai', () => {
    poser(plaque, 4)
    expect(screen.getByText(/2\s*800 g en tout/)).toBeTruthy()
  })

  it('garde le stock sous les yeux — « on peut voir si erreur »', () => {
    poser(tiramisu)
    expect(screen.getByText(/en stock 4 200 g/)).toBeTruthy()
    expect(screen.getByText(/en stock 0 u/)).toBeTruthy()
  })

  it('montre TOUS les manques, chacun avec son bouton', () => {
    const deuxManques = {
      ...tiramisu,
      enfants: tiramisu.enfants.map(c => (c.produit.includes('Sirop') ? { ...c, ok: false, stock: 0 } : c)),
    }
    poser(deuxManques)
    expect(screen.getAllByText('à faire ›')).toHaveLength(2)
  })

  it('ouvre le morceau qui manque', () => {
    const { onOuvrir } = poser(tiramisu)
    fireEvent.click(screen.getByText('à faire ›'))
    expect(onOuvrir).toHaveBeenCalledWith('SM. Biscuit a la cuillere 5 pers')
  })

  it('« C’est fait » reste éteint tant qu’il manque quelque chose', () => {
    const { onFait } = poser(tiramisu)
    fireEvent.click(screen.getByText("C'est fait"))
    expect(onFait).not.toHaveBeenCalled()
  })

  it('… et s’allume quand tout est là', () => {
    const complet = { ...tiramisu, enfants: tiramisu.enfants.map(c => ({ ...c, ok: true })) }
    const { onFait } = poser(complet)
    fireEvent.click(screen.getByText("C'est fait"))
    expect(onFait).toHaveBeenCalled()
  })

  it('le + et le − avancent par pièce, ou par 50 g', () => {
    const { onQuantite } = poser(tiramisu, 13)
    fireEvent.click(screen.getByLabelText('Plus à faire'))
    expect(onQuantite).toHaveBeenCalledWith(14)
    cleanup()
    const g = poser({ ...plaque, unite: 'g', tourneeTaille: 3920, enfants: [] }, 3920)
    fireEvent.click(screen.getByLabelText('Plus à faire'))
    expect(g.onQuantite).toHaveBeenCalledWith(3970)
  })
})

// ====== La découpe : une plaque, 13 biscuits ======
// Le seul écran de l'atelier qui porte deux décisions. Vérifié chez Odoo le
// 2026-09-10 : la plaque sort par 4, et donne 6 « 10 pers », 13 « 5 pers » ou
// 70 individuels.

const cinqPers = {
  produit: 'SM. Biscuit a la cuillere 5 pers', libelle: 'Biscuit cuillère 5 pers',
  unite: 'u', tourneeTaille: 13, reste: 13,
  recette: [{ produit: 'SM. Biscuit a la cuillere (plaque)', qty: 1, unite: 'u' }],
  enfants: [{ ...plaque, besoin: 1, stock: 0, dejaFait: 0, fabrique: true, ok: false,
    produira: 4, tournees: 1, pourQuantite: 4 }],
}

const poserDecoupe = (coupes = 13, cuites = 4) => {
  const onQuantite = vi.fn(); const onCuites = vi.fn(); const onFait = vi.fn()
  render(<Fiche noeud={cinqPers} quantite={coupes} onQuantite={onQuantite}
    cuites={cuites} onCuites={onCuites} faits={[]} onOuvrir={() => {}} onFait={onFait} />)
  return { onQuantite, onCuites, onFait }
}

describe('la découpe, deux chiffres sur un écran', () => {
  it('montre ce qu’on cuit ET ce qu’on coupe', () => {
    poserDecoupe()
    expect(screen.getByText('plaques à cuire')).toBeTruthy()
    expect(screen.getByText('biscuits à couper')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('13')).toBeTruthy()
  })

  it('le cas de Layla : 4 plaques, 26 biscuits → 2 utilisées, 2 gardées', () => {
    poserDecoupe(26)
    expect(screen.getByText(/2 plaques utilisées · 2 gardées/)).toBeTruthy()
  })

  it('dit le poids de pâte à préparer, pas le nombre de plaques tout court', () => {
    poserDecoupe()
    expect(screen.getByText(/2 800 g en tout/)).toBeTruthy()
  })

  it('liste les matières premières de la plaque, pas la plaque elle-même', () => {
    poserDecoupe()
    expect(screen.getByText('Oeufs blanc')).toBeTruthy()
    expect(screen.queryByText('à faire ›')).toBeNull()
  })

  it('ne bloque pas « C’est fait » : la plaque se fait ici', () => {
    const { onFait } = poserDecoupe()
    fireEvent.click(screen.getByText("C'est fait"))
    expect(onFait).toHaveBeenCalled()
  })

  it('prévient quand on coupe plus de plaques qu’on en a', () => {
    poserDecoupe(39, 1)
    expect(screen.getByText(/il manque 2 plaques/)).toBeTruthy()
  })

  it('les deux « + » ne se mélangent pas', () => {
    const { onQuantite, onCuites } = poserDecoupe()
    fireEvent.click(screen.getByLabelText('Plus à cuire'))
    expect(onCuites).toHaveBeenCalledWith(5)
    expect(onQuantite).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Plus à couper'))
    expect(onQuantite).toHaveBeenCalledWith(14)
  })

  it('reste un écran simple quand ce n’est pas une découpe', () => {
    render(<Fiche noeud={tiramisu} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    expect(screen.queryByText(/à cuire/)).toBeNull()
  })
})

// ====== Le clavier-calculette ======
// « Garde le clavier calculette pour tous les chiffres si besoin de modifier »
// (Layla, 2026-09-10) : de 3 920 à 2 600 au « − », ce serait 26 appuis.

describe('le clavier', () => {
  const ouvrir = () => {
    const onValider = vi.fn()
    render(<Clavier titre="à faire" valeur={13} unite="u"
      onValider={onValider} onFermer={() => {}} />)
    return onValider
  }

  it('le premier chiffre remplace la valeur proposée', () => {
    const onValider = ouvrir()
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('6'))
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    expect(onValider).toHaveBeenCalledWith(26)
  })

  it('la gomme efface le dernier chiffre', () => {
    const onValider = ouvrir()
    fireEvent.click(screen.getByText('5'))
    fireEvent.click(screen.getByText('0'))
    fireEvent.click(screen.getByLabelText('Effacer'))
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    expect(onValider).toHaveBeenCalledWith(5)
  })

  it('accepte la virgule, pour les kilos', () => {
    const onValider = ouvrir()
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText(','))
    fireEvent.click(screen.getByText('5'))
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    expect(onValider).toHaveBeenCalledWith(1.5)
  })

  it('ne valide rien quand tout est effacé', () => {
    const onValider = ouvrir()
    fireEvent.click(screen.getByText('7'))
    fireEvent.click(screen.getByLabelText('Effacer'))
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    expect(onValider).not.toHaveBeenCalled()
  })

  it('s’ouvre en tapant sur le gros chiffre', () => {
    render(<Fiche noeud={tiramisu} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    fireEvent.click(screen.getByLabelText('Changer à faire'))
    expect(screen.getByLabelText('Valider le nombre')).toBeTruthy()
  })
})

// ====== « Il en est sorti combien ? » ======
// Le caramel, la crème au beurre, la crème citron perdent à la cuisson : le
// chiffre réel n'est pas celui de la recette, et ce n'est pas une faute.

describe('la sortie', () => {
  const caramel = { produit: 'SM. Caramel', libelle: 'Caramel', unite: 'g' }

  it('propose ce qu’on visait : un seul appui quand rien n’a bougé', () => {
    const onValider = vi.fn()
    render(<Sortie noeud={caramel} valeur={3920} onValeur={() => {}}
      onValider={onValider} envoi={false} />)
    expect(screen.getByText(/3.920/)).toBeTruthy()
    fireEvent.click(screen.getByText("C'est bon"))
    expect(onValider).toHaveBeenCalled()
  })

  it('ne dit RIEN de l’écart : perdre à la cuisson n’est pas une faute', () => {
    render(<Sortie noeud={caramel} valeur={3700} onValeur={() => {}}
      onValider={() => {}} envoi={false} />)
    expect(screen.queryByText(/moins|plus|prévu|écart/i)).toBeNull()
  })

  it('le clavier corrige le chiffre', () => {
    const onValeur = vi.fn()
    render(<Sortie noeud={caramel} valeur={3920} onValeur={onValeur}
      onValider={() => {}} envoi={false} />)
    fireEvent.click(screen.getByLabelText('Changer il en est sorti'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('6'))
    fireEvent.click(screen.getByText('0'))
    fireEvent.click(screen.getByText('0'))
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    expect(onValeur).toHaveBeenCalledWith(2600)
  })

  it('répond au doigt : « en cours… » pendant l’envoi', () => {
    render(<Sortie noeud={caramel} valeur={3920} onValeur={() => {}}
      onValider={() => {}} envoi />)
    expect(screen.getByText('en cours…')).toBeTruthy()
  })

  it('la question ne se pose pas pour un biscuit : il sort toujours son compte', () => {
    expect(sansRendement('SM. Biscuit a la cuillere 5 pers')).toBe(true)
    expect(sansRendement('SM. Caramel')).toBe(false)
  })
})

describe('le garde-fou du zéro', () => {
  it('« C’est fait » reste éteint quand le chiffre est à zéro', () => {
    const onFait = vi.fn()
    const complet = { ...tiramisu, enfants: tiramisu.enfants.map(c => ({ ...c, ok: true })) }
    render(<Fiche noeud={complet} quantite={0} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={onFait} />)
    fireEvent.click(screen.getByText("C'est fait"))
    expect(onFait).not.toHaveBeenCalled()
  })
})

describe('ce qui manque', () => {
  it('le bouton porte le besoin de la recette', () => {
    // Sans ça, le bouton prenait la place du chiffre : on voyait qu'il
    // manquait quelque chose, sans savoir combien il en faut.
    render(<Fiche noeud={tiramisu} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    const bouton = screen.getByText('à faire ›').closest('button')
    expect(bouton.textContent).toMatch(/13 u/)
  })

  it('et il ouvre toujours l’ingrédient qui manque', () => {
    const onOuvrir = vi.fn()
    render(<Fiche noeud={tiramisu} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={onOuvrir} onFait={() => {}} />)
    fireEvent.click(screen.getByText('à faire ›'))
    expect(onOuvrir).toHaveBeenCalledWith('SM. Biscuit a la cuillere 5 pers')
  })
})

describe('en préparer d’avance', () => {
  it('un ingrédient DÉJÀ EN STOCK s’ouvre quand même', () => {
    // « Je peux rajouter quelque chose de la recette même si déjà en stock »
    // (Layla, 2026-09-10). Le nouvel écran l'avait perdu.
    const onOuvrir = vi.fn()
    render(<Fiche noeud={tiramisu} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={onOuvrir} onFait={() => {}} />)
    // Le nom apparaît deux fois depuis la pesée du montage : la LISTE d'abord,
    // le tableau « Pour 1 … » ensuite. C'est la ligne de la liste qui s'ouvre.
    fireEvent.click(screen.getAllByText('Amaretti orange Tiramisu')[0])
    expect(onOuvrir).toHaveBeenCalledWith('SM Amaretti orange Tiramisu')
  })

  it('et il le dit : « en faire › » sur ce qui est déjà là', () => {
    render(<Fiche noeud={tiramisu} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    // Deux composants en stock sur les trois du tiramisu.
    expect(screen.getAllByText('en faire ›').length).toBe(2)
  })

  it('une matière première ne s’ouvre pas : il n’y a rien à fabriquer', () => {
    const onOuvrir = vi.fn()
    const avecMp = { ...tiramisu, enfants: [
      { produit: 'MP- Sucre Granule', unite: 'g', besoin: 300, stock: 0, fabrique: false, ok: true },
    ] }
    render(<Fiche noeud={avecMp} quantite={13} onQuantite={() => {}}
      faits={[]} onOuvrir={onOuvrir} onFait={() => {}} />)
    fireEvent.click(screen.getByText('Sucre Granule'))
    expect(onOuvrir).not.toHaveBeenCalled()
  })
})

describe('ce qu’on ne montre pas', () => {
  const gianduja = {
    produit: 'SM- Gianduja indiv', libelle: 'Gianduja indiv', unite: 'u',
    tourneeTaille: 90, reste: 90, recette: [],
    enfants: [
      { produit: 'SM. Cremeux gianduja indiv Production', unite: 'u', besoin: 90,
        stock: 151, dejaFait: 0, fabrique: true, ok: true },
      { produit: 'MP- Crème whipping', unite: 'kg', besoin: 0.85,
        stock: 47.69, dejaFait: 0, fabrique: false, ok: true },
    ],
  }

  it('pas de stock sur une matière première : celui de l’annexe n’est pas tenu', () => {
    render(<Fiche noeud={gianduja} quantite={90} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    expect(screen.getByText(/en stock 151 u/)).toBeTruthy()
    expect(screen.queryByText(/47 690 g/)).toBeNull()
  })

  it('les kilos s’écrivent en grammes, jamais à convertir de tête', () => {
    render(<Fiche noeud={gianduja} quantite={90} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    expect(screen.getByText('850 g')).toBeTruthy()
  })

  it('un montage ne répète pas ses morceaux au-dessus de sa propre liste', () => {
    render(<Fiche noeud={gianduja} quantite={90} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    // « 90 cremeux gianduja indiv productions · … » : la liste le dit déjà.
    expect(screen.queryByText(/·.*production/i)).toBeNull()
  })
})

// ====== « Déclarer » ======
// « Le nouveau bouton montre à faire. Et aussi doit montrer à déclarer »
// (Layla, 2026-09-10). On y vient dire ce qu'on a fabriqué, même un article
// que personne n'avait demandé.

describe('les deux onglets', () => {
  it('montre les deux, et dit lequel est ouvert', () => {
    const onChange = vi.fn()
    render(<Onglets onglet="faire" onChange={onChange} />)
    const declarer = screen.getByText('Déclarer')
    expect(screen.getByText('À faire').className).toMatch(/bg-bordeaux/)
    expect(declarer.className).not.toMatch(/bg-bordeaux/)
    fireEvent.click(declarer)
    expect(onChange).toHaveBeenCalledWith('declarer')
  })
})

describe('les cases de « Déclarer »', () => {
  const gateaux = [
    { cle: 'E- Tiramisu', photo: 'E- Tiramisu', libelle: 'E- Tiramisu' },
    { cle: 'E- Royal chocolat', photo: 'E- Royal chocolat', libelle: 'E- Royal chocolat' },
  ]

  it('une case par gâteau, sans pastille rouge : rien n’est en retard ici', () => {
    render(<Cases items={gateaux} onOuvrir={() => {}} vide="Rien" />)
    expect(screen.getByText('Tiramisu')).toBeTruthy()
    expect(screen.getByText('Royal chocolat')).toBeTruthy()
    expect(document.querySelector('.bg-danger')).toBeNull()
  })

  it('ouvre le gâteau qu’on touche', () => {
    const onOuvrir = vi.fn()
    render(<Cases items={gateaux} onOuvrir={onOuvrir} vide="Rien" />)
    fireEvent.click(screen.getByText('Tiramisu'))
    expect(onOuvrir).toHaveBeenCalledWith('E- Tiramisu')
  })

  it('le dit quand la recherche ne donne rien', () => {
    render(<Cases items={[]} onOuvrir={() => {}} vide="Rien à ce nom-là." />)
    expect(screen.getByText('Rien à ce nom-là.')).toBeTruthy()
  })
})

// ====== La pesée du montage ======
// « Tu as oublié d'intégrer les pesées des montages » (Layla, 2026-09-11).
// Ses vrais chiffres : Sm- PR Le Citron Framboise (1), fournée de 31, avec
// 1 178 g de glaçage rose — soit 38 g par gâteau.

const citronFini = {
  produit: 'Sm- PR Le Citron Framboise (1)',
  libelle: 'Citron Framboise · fini (individuel)', unite: 'u',
  tourneeTaille: 31, pourQuantite: 31, recette: [],
  figesNom: 'Monté sur place',
  enfants: [
    { produit: 'Sm- Le Citron Framboise (1)', unite: 'u', besoin: 31, stock: 40, fabrique: true, ok: true },
    { produit: 'SM. Glacage Rose Finition', unite: 'g', besoin: 1178, stock: 9000, fabrique: true, ok: true },
    { produit: 'SM- Chantilly rose pipée (1)', unite: 'u', besoin: 31, stock: 40, fabrique: true, ok: true },
  ],
}

describe('la pesée du montage', () => {
  it('dit ce qu’on met sur UN gâteau', () => {
    render(<PourUn noeud={citronFini} quantite={31} />)
    expect(screen.getByText(/Pour 1 Citron Framboise · fini \(individuel\)/)).toBeTruthy()
    expect(screen.getByText('38 g')).toBeTruthy()
    expect(screen.getAllByText('1 u').length).toBe(2)
  })

  it('suit la quantité : deux fois plus de gâteaux, même dose par pièce', () => {
    render(<PourUn noeud={citronFini} quantite={62} />)
    expect(screen.getByText('38 g')).toBeTruthy()
  })

  it('la CUVE ne fait qu’une ligne, sous son nom', () => {
    const aMonter = {
      produit: 'Sm- Le Citron Framboise (1)', libelle: 'Citron Framboise · à monter (individuel)',
      unite: 'u', tourneeTaille: 58, pourQuantite: 58, recette: [],
      figesNom: 'La crème légère vanille citron',
      enfants: [
        { produit: 'SM- Fond Citron Framboise (1)', unite: 'u', besoin: 58, stock: 60, fabrique: true, ok: true },
        { produit: 'SM. Lait', unite: 'g', besoin: 2000, stock: 0, fabrique: false, fige: true, ok: true },
        { produit: 'SM. Crème', unite: 'g', besoin: 3278, stock: 0, fabrique: false, fige: true, ok: true },
      ],
    }
    render(<PourUn noeud={aMonter} quantite={58} />)
    expect(screen.getByText('La crème légère vanille citron')).toBeTruthy()
    expect(screen.queryByText('Lait')).toBeNull()
    expect(screen.getByText('91 g')).toBeTruthy()   // (2 000 + 3 278) / 58
  })

  it('ne dit rien pour une seule pièce : la liste du dessus le dit déjà', () => {
    const { container } = render(<PourUn noeud={citronFini} quantite={1} />)
    expect(container.textContent).toBe('')
  })

  it('ne dit rien d’un caramel pesé en grammes', () => {
    const caramel = { produit: 'SM. Caramel', unite: 'g', tourneeTaille: 3920, recette: [],
      enfants: [{ produit: 'SM. Sucre cuit', unite: 'g', besoin: 1000, fabrique: true, ok: true }] }
    const { container } = render(<PourUn noeud={caramel} quantite={3920} />)
    expect(container.textContent).toBe('')
  })

  it('ne dit rien d’une plaque : sa pâte ne se dose pas à la pièce', () => {
    const { container } = render(<PourUn noeud={{ ...plaque, unite: 'u' }} quantite={4} />)
    expect(container.textContent).toBe('')
  })

  it('la fiche d’un montage la montre', () => {
    render(<Fiche noeud={citronFini} quantite={31} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    expect(screen.getByText(/Pour 1 Citron Framboise/)).toBeTruthy()
    // Le total reste dans la liste du dessus : 1 178 g à sortir du frigo.
    expect(screen.getByText(/1.178 g/)).toBeTruthy()
  })
})

describe('quand une pièce en prend moins d’une', () => {
  it('« 1 pour 11 » plutôt que « 0,09 u »', () => {
    // Le cadre de forêt noire : 8 biscuits viennois pour 88 pièces.
    const cadre = {
      produit: 'SM- cadre foret noir grand Production', libelle: 'Black Forest · cadre',
      unite: 'u', tourneeTaille: 88, pourQuantite: 88, recette: [],
      enfants: [
        { produit: 'SM. Biscuit vieniess cacao', unite: 'u', besoin: 8, stock: 2, fabrique: true, ok: false },
        { produit: 'SM. chantilly mascarpone Production', unite: 'g', besoin: 2200, stock: 0, fabrique: true, ok: false },
      ],
    }
    render(<PourUn noeud={cadre} quantite={88} />)
    expect(screen.getByText('1 pour 11')).toBeTruthy()
    expect(screen.getByText('25 g')).toBeTruthy()
    expect(screen.queryByText(/0,09/)).toBeNull()
  })
})

// ====== La règle d'atelier : la masse gélatine ======
// Odoo compte la POUDRE, l'atelier pèse la MASSE (1 de poudre pour 6 d'eau).
// Sans cette règle, on pèse SEPT FOIS trop peu — et la mousse ne prend pas.

describe('la masse gélatine', () => {
  const glacage = {
    produit: 'SM. Glacage Rose Finition', libelle: 'Glaçage Rose', unite: 'g',
    tourneeTaille: 5458, pourQuantite: 5458, recette: [],
    enfants: [
      { produit: 'MP- Gelatine en poudre', unite: 'g', besoin: 80, stock: 0, fabrique: false, ok: true },
      { produit: 'MP- Sucre Granule', unite: 'kg', besoin: 1.2, stock: 0, fabrique: false, ok: true },
    ],
  }

  it('s’appelle « Masse gélatine » et vaut sept fois la poudre', () => {
    render(<Fiche noeud={glacage} quantite={5458} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    expect(screen.getByText('Masse gélatine')).toBeTruthy()
    expect(screen.getByText('560 g')).toBeTruthy()          // 80 × 7
    expect(screen.queryByText(/Gelatine en poudre/)).toBeNull()
  })

  it('ne touche à rien d’autre', () => {
    render(<Fiche noeud={glacage} quantite={5458} onQuantite={() => {}}
      faits={[]} onOuvrir={() => {}} onFait={() => {}} />)
    expect(screen.getByText(/1.200 g/)).toBeTruthy()
  })

  it('vaut aussi dans la pesée du montage', () => {
    const gateau = {
      produit: 'SM- Royal Chocolat 15 cm', libelle: 'Royal Chocolat 15 cm', unite: 'u',
      tourneeTaille: 13, pourQuantite: 13, recette: [],
      enfants: [
        { produit: 'SM. Craquant Royal', unite: 'g', besoin: 1040, stock: 2000, fabrique: true, ok: true },
        { produit: 'MP- Gelatine en poudre', unite: 'g', besoin: 13, stock: 0, fabrique: false, ok: true },
      ],
    }
    render(<PourUn noeud={gateau} quantite={13} />)
    expect(screen.getByText('7 g')).toBeTruthy()             // 13 × 7 / 13
  })
})
