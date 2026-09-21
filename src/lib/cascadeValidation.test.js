// ============================================================
// « À VALIDER » RANGÉ PAR CASCADE IMPRIMÉE.
//
// « Dans valider, c'est regroupé par cascade imprimée, que je trouve les
// liaisons » (Layla, 2026-09-21).
//
// Chaque papier porte le numéro de sa liasse : tout ce qui est sorti de
// l'imprimante ensemble doit se retrouver ensemble ici. Ranger par « pour »
// (ce qu'on faisait une heure plus tôt) séparait deux cascades du même gâteau,
// et laissait dehors ce qui n'avait pas de « pour ».
// ============================================================
import { describe, it, expect } from 'vitest'

/** La règle de l'écran, gardée ici pour être testée seule. */
const cascadeDe = feuilles => {
  const par = new Map()
  const rang = f => (f.declare_le ? 2 : 1)
  for (const f of feuilles || []) {
    if (!f.liasse) continue
    const vu = par.get(f.produit)
    const mieux = !vu || rang(f) > rang(vu.f)
      || (rang(f) === rang(vu.f) && String(f.imprime_le) > String(vu.f.imprime_le))
    if (mieux) par.set(f.produit, { f, liasse: f.liasse, tete: (f.chemin || [])[0] || f.pour || f.produit })
  }
  return par
}

const grouper = (lignes, par) => {
  const g = new Map()
  for (const l of lignes || []) {
    const c = par.get(l.article)
    const cle = c ? c.liasse : (l.pour || l.article)
    const nom = c ? c.tete : (l.pour || l.article)
    if (!g.has(cle)) g.set(cle, { cle, nom, lignes: [] })
    g.get(cle).lignes.push(l)
  }
  return [...g.values()]
}

// La liasse du gianduja, imprimée à 13:02.
const feuilles = [
  { produit: 'SM- Gianduja 10 pers', liasse: 'L1', chemin: ['SM- Gianduja 10 pers'], imprime_le: '13:02' },
  { produit: 'SM. Mousse Gianduja', liasse: 'L1', chemin: ['SM- Gianduja 10 pers', 'SM. Mousse Gianduja'], imprime_le: '13:02', declare_le: '13:56' },
  { produit: 'SM. Biscuit Gianduja (Plaque)', liasse: 'L1', chemin: ['SM- Gianduja 10 pers', 'SM. Biscuit Gianduja (Plaque)'], imprime_le: '13:02' },
  // Une AUTRE cascade, le soir, qui réclame la même mousse.
  { produit: 'SM. Mousse Gianduja', liasse: 'L2', chemin: ['SM- Gianduja Indiv', 'SM. Mousse Gianduja'], imprime_le: '20:00' },
]

describe('retrouver la cascade d’un article', () => {
  it('rattache chaque article à sa liasse et à sa tête', () => {
    const par = cascadeDe(feuilles)
    expect(par.get('SM. Biscuit Gianduja (Plaque)').tete).toBe('SM- Gianduja 10 pers')
    expect(par.get('SM- Gianduja 10 pers').liasse).toBe('L1')
  })

  // ⚠️ Deux liasses pour le même article : c'est CELLE QUI A ÉTÉ DÉCLARÉE qui
  // compte — c'est ce travail-là qu'on valide.
  it('préfère la feuille déclarée à la plus récente', () => {
    expect(cascadeDe(feuilles).get('SM. Mousse Gianduja').liasse).toBe('L1')
  })

  it('une feuille sans liasse ne sert de repère à personne', () => {
    expect(cascadeDe([{ produit: 'X', imprime_le: '10:00' }]).size).toBe(0)
  })
})

describe('le rangement de l’écran', () => {
  const lignes = [
    { name: 'MO/1', article: 'SM. Mousse Gianduja', pour: 'SM- Gianduja 10 pers' },
    { name: 'MO/2', article: 'SM. Biscuit Gianduja (Plaque)', pour: 'SM- Gianduja 10 pers' },
    { name: 'MO/3', article: 'SM- Gianduja 10 pers', pour: null },
    // Déclaré à la main, sans papier : il garde son propre chemin.
    { name: 'MO/4', article: 'SM. Sirop Imbibage', pour: null },
  ]

  it('met toute la cascade imprimée sous une seule tête', () => {
    const g = grouper(lignes, cascadeDe(feuilles))
    const cascade = g.find(x => x.cle === 'L1')
    expect(cascade.nom).toBe('SM- Gianduja 10 pers')
    expect(cascade.lignes.map(l => l.name)).toEqual(['MO/1', 'MO/2', 'MO/3'])
  })

  it('ce qui n’a pas de papier reste à part, sous son nom', () => {
    const g = grouper(lignes, cascadeDe(feuilles))
    expect(g.find(x => x.cle === 'SM. Sirop Imbibage').lignes).toHaveLength(1)
  })

  it('sans aucune feuille, rien ne casse : on retombe sur le « pour »', () => {
    const g = grouper(lignes, new Map())
    expect(g.map(x => x.nom).sort())
      .toEqual(['SM- Gianduja 10 pers', 'SM. Sirop Imbibage'])
  })
})
