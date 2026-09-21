// ============================================================
// RANGER « À VALIDER ANNEXE » PAR FAMILLE DE DÉCLARATION.
//
// « Range par famille de déclaration » (Layla, 2026-09-21). La famille, c'est
// ce POUR QUOI la fournée a été déclarée : la crème, la génoise et le cadre
// citron partent ensemble parce qu'ils ont été faits ensemble.
//
// ⚠️ Le gâteau lui-même n'a pas de « pour » — il EST la famille, et se range
// donc sous son propre nom, avec tout ce qu'il a réclamé. Sans cette règle, il
// se retrouvait seul dans un coin pendant que ses préparations étaient
// ailleurs.
// ============================================================
import { describe, it, expect } from 'vitest'

/** La même règle que l'écran, gardée ici pour être testée seule. */
const parFamille = lignes => {
  const par = new Map()
  for (const l of lignes || []) {
    const nom = l.pour || l.article
    if (!par.has(nom)) par.set(nom, { nom, lignes: [] })
    par.get(nom).lignes.push(l)
  }
  return [...par.values()].sort((a, b) =>
    b.lignes.length - a.lignes.length || a.nom.localeCompare(b.nom, 'fr'))
}

// Relevé réel du 21/09 : une session de cadre citron, une de gianduja.
const lignes = [
  { article: 'SM. Genoise Vanille KG Production', pour: 'SM- Cadre Citron Meringuée Production' },
  { article: 'SM. Citron Liquide', pour: 'SM- Cadre Citron Meringuée Production' },
  { article: 'SM. Creme Citron Production', pour: 'SM- Cadre Citron Meringuée Production' },
  { article: 'SM- Cadre Citron Meringuée Production', pour: null },
  { article: 'SM. Mousse Gianduja', pour: 'SM- Gianduja 10 pers' },
  { article: 'SM. Biscuit Gianduja (Plaque)', pour: 'SM- Gianduja 10 pers' },
]

describe('les familles', () => {
  it('rassemble ce qui a été fait ensemble', () => {
    const g = parFamille(lignes)
    expect(g.map(x => x.nom)).toEqual([
      'SM- Cadre Citron Meringuée Production',   // 4 lignes
      'SM- Gianduja 10 pers',                    // 2 lignes
    ])
  })

  // ⚠️ LE PIÈGE : le gâteau n'a pas de « pour ». Sans le repli sur son propre
  // nom, il formait une famille à lui tout seul, loin de ses préparations.
  it('le gâteau se range AVEC ce qu’il a réclamé', () => {
    const citron = parFamille(lignes)[0]
    expect(citron.lignes.map(l => l.article)).toContain('SM- Cadre Citron Meringuée Production')
    expect(citron.lignes).toHaveLength(4)
  })

  it('la famille la plus fournie passe devant', () => {
    expect(parFamille(lignes)[0].lignes.length).toBeGreaterThanOrEqual(
      parFamille(lignes)[1].lignes.length)
  })

  it('une liste vide ne casse rien', () => {
    expect(parFamille([])).toEqual([])
    expect(parFamille(null)).toEqual([])
  })
})
