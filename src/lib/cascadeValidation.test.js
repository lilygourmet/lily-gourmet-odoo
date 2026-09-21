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
//
// ⚠️ MAIS ON APPARIE PAR HEURE, PAS PAR NOM (Layla, le soir même : « cette
// mousse doit être avec gianduja 10 pers ? »). Deux mousses gianduja le même
// jour — 6 228 g à 13h56 pour le 10 pers, 6 120 g à 20h08 pour les indiv,
// celle-ci déclarée SANS papier. En cherchant le papier par le seul nom de
// l'article, l'écran prêtait à la fournée du soir la liasse de l'après-midi.
// ============================================================
import { describe, it, expect } from 'vitest'

/** La règle de l'écran, gardée ici pour être testée seule. */
const cascadeDe = (feuilles, lignes) => {
  const papiers = new Map()
  for (const f of feuilles || []) {
    if (!f.liasse) continue
    if (!papiers.has(f.produit)) papiers.set(f.produit, [])
    papiers.get(f.produit).push(f)
  }
  for (const liste of papiers.values()) {
    liste.sort((a, b) => (b.declare_le ? 1 : 0) - (a.declare_le ? 1 : 0)
      || String(a.declare_le || a.imprime_le).localeCompare(String(b.declare_le || b.imprime_le)))
  }
  const faites = new Map()
  for (const l of lignes || []) {
    if (!faites.has(l.article)) faites.set(l.article, [])
    faites.get(l.article).push(l)
  }
  for (const liste of faites.values()) {
    liste.sort((a, b) => String(a.faitLe || '').localeCompare(String(b.faitLe || '')))
  }
  const par = new Map()
  for (const [article, liste] of faites) {
    const dispo = papiers.get(article) || []
    liste.forEach((l, i) => {
      const f = dispo[i]
      if (!f) return
      par.set(l.name, { liasse: f.liasse, tete: (f.chemin || [])[0] || f.pour || f.produit })
    })
  }
  return par
}

const grouper = (lignes, par) => {
  const g = new Map()
  for (const l of lignes || []) {
    const c = par.get(l.name)
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
  { produit: 'SM. Mousse Gianduja', liasse: 'L1', chemin: ['SM- Gianduja 10 pers', 'SM. Mousse Gianduja'], imprime_le: '13:02', declare_le: '14:56' },
  { produit: 'SM. Biscuit Gianduja (Plaque)', liasse: 'L1', chemin: ['SM- Gianduja 10 pers', 'SM. Biscuit Gianduja (Plaque)'], imprime_le: '13:02' },
]

describe('retrouver la cascade d’une fournée', () => {
  const lignes = [
    { name: 'MO/21727', article: 'SM. Biscuit Gianduja (Plaque)', faitLe: '13:13' },
    { name: 'MO/21707', article: 'SM- Gianduja 10 pers', faitLe: '13:13' },
  ]
  it('rattache chaque fournée à sa liasse et à sa tête', () => {
    const par = cascadeDe(feuilles, lignes)
    expect(par.get('MO/21727').tete).toBe('SM- Gianduja 10 pers')
    expect(par.get('MO/21707').liasse).toBe('L1')
  })

  it('une feuille sans liasse ne sert de repère à personne', () => {
    const par = cascadeDe([{ produit: 'X', imprime_le: '10:00' }], [{ name: 'MO/1', article: 'X' }])
    expect(par.size).toBe(0)
  })
})

// ⚠️ LE CAS VÉCU LE 21/09 AU SOIR, remis tel quel.
describe('deux fournées du même article, un seul papier', () => {
  const lignes = [
    { name: 'MO/21735', article: 'SM. Mousse Gianduja', pour: 'SM- Gianduja 10 pers', faitLe: '13:56' },
    { name: 'MO/21740', article: 'SM. Mousse Gianduja', pour: null, faitLe: '20:08' },
  ]

  it('le papier va à la PREMIÈRE fournée, celle pour qui il a été imprimé', () => {
    expect(cascadeDe(feuilles, lignes).get('MO/21735').tete).toBe('SM- Gianduja 10 pers')
  })

  it('la fournée du soir, sans papier, ne prend pas la liasse du voisin', () => {
    expect(cascadeDe(feuilles, lignes).get('MO/21740')).toBeUndefined()
  })

  it('elle reste donc à part, et non rangée sous « Gianduja 10 pers »', () => {
    const g = grouper(lignes, cascadeDe(feuilles, lignes))
    const soir = g.find(x => x.lignes.some(l => l.name === 'MO/21740'))
    expect(soir.nom).toBe('SM. Mousse Gianduja')
    expect(soir.lignes).toHaveLength(1)
  })
})

describe('le rangement de l’écran', () => {
  const lignes = [
    { name: 'MO/1', article: 'SM. Mousse Gianduja', pour: 'SM- Gianduja 10 pers', faitLe: '13:56' },
    { name: 'MO/2', article: 'SM. Biscuit Gianduja (Plaque)', pour: 'SM- Gianduja 10 pers', faitLe: '13:13' },
    { name: 'MO/3', article: 'SM- Gianduja 10 pers', pour: null, faitLe: '13:13' },
    // Déclaré à la main, sans papier : il garde son propre chemin.
    { name: 'MO/4', article: 'SM. Sirop Imbibage', pour: null, faitLe: '10:06' },
  ]

  it('met toute la cascade imprimée sous une seule tête', () => {
    const g = grouper(lignes, cascadeDe(feuilles, lignes))
    const cascade = g.find(x => x.cle === 'L1')
    expect(cascade.nom).toBe('SM- Gianduja 10 pers')
    expect(cascade.lignes.map(l => l.name)).toEqual(['MO/1', 'MO/2', 'MO/3'])
  })

  it('ce qui n’a pas de papier reste à part, sous son nom', () => {
    const g = grouper(lignes, cascadeDe(feuilles, lignes))
    expect(g.find(x => x.cle === 'SM. Sirop Imbibage').lignes).toHaveLength(1)
  })

  it('sans aucune feuille, rien ne casse : on retombe sur le « pour »', () => {
    const g = grouper(lignes, new Map())
    expect(g.map(x => x.nom).sort())
      .toEqual(['SM- Gianduja 10 pers', 'SM. Sirop Imbibage'])
  })
})
