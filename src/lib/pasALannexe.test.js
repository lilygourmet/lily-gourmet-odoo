// ============================================================
// CE QUE L'ANNEXE NE FABRIQUE PAS.
//
// « Enlever de la liste à déclarer suprême vanille, la micro viennoiserie et
// les brioches feuilletées » (Layla, 2026-09-11). Odoo les range sous l'annexe
// parce qu'un ordre y est passé un jour ; le suprême vanille sort du labo cake
// design, les deux autres de la viennoiserie. Le pâtissier de l'annexe n'a
// rien à y déclarer, et ça lui encombrait l'écran.
// ============================================================
import { describe, it, expect } from 'vitest'
import { parGateauMere } from './fabAnnexe'

const noms = gs => gs.flatMap(g => g.articles.map(a => a.produit))
const groupes = gs => gs.map(g => g.nom)

describe('les gâteaux qui ne sont pas de l’annexe', () => {
  // Les vrais noms, relevés dans « Déclarer » le 2026-09-11.
  const arts = [
    { produit: 'SM- Brioche FEUILLETE',
      pour: ['V- Brioches feuilletées (Nature)', 'V- Brioches feuilletées (Chocolat)'] },
    { produit: 'SM- Micro Croissants',
      pour: ['V- Micro viennoiseries (18 pcs) (Croissant)'] },
    { produit: '30 cm CD* (Vanille)', pour: ['E- Suprême vanille'] },
    { produit: '30 cm CD* (Praliné Amandes caramélisées)', pour: ['E- Suprême amande'] },
    { produit: 'SM- Tiramisu indiv', pour: ['E- Tiramisu'] },
  ]

  it('les trois disparaissent de « Déclarer », gâteau et article', () => {
    const g = parGateauMere(arts, '')
    expect(groupes(g)).toEqual(['E- Suprême amande', 'E- Tiramisu'])
    expect(noms(g)).not.toContain('SM- Brioche FEUILLETE')
    expect(noms(g)).not.toContain('SM- Micro Croissants')
    expect(noms(g)).not.toContain('30 cm CD* (Vanille)')
  })

  it('le reste de l’annexe ne bouge pas', () => {
    expect(noms(parGateauMere(arts, ''))).toEqual(
      ['30 cm CD* (Praliné Amandes caramélisées)', 'SM- Tiramisu indiv'])
  })

  it('⚠️ le suprême AMANDE reste : c’est bien l’annexe qui le monte', () => {
    expect(groupes(parGateauMere(arts, ''))).toContain('E- Suprême amande')
  })

  it('ils ne reviennent pas non plus par la recherche', () => {
    expect(noms(parGateauMere(arts, 'brioche'))).toEqual([])
    expect(noms(parGateauMere(arts, 'croissant'))).toEqual([])
  })

  it('l’écran de réglage, lui, continue de tout montrer', () => {
    // C'est là que Layla choisit ce qu'elle suit : rien ne doit y être caché.
    expect(noms(parGateauMere(arts, 'brioche', true))).toContain('SM- Brioche FEUILLETE')
  })
})
