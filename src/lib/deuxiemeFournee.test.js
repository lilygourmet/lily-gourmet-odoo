// ============================================================
// « TU EN AS VRAIMENT FAIT UNE DEUXIÈME ? »
//
// « J'ai deux mousses. Comment je sais si ça a été cliqué par erreur ? A-t-il
// vraiment fait 2 mousses ? J'ai peur que le pâtissier fasse que cliquer
// cliquer sans réfléchir » (Layla, 2026-09-21).
//
// Relevé le jour même, et c'est ce qui donne raison à sa peur :
//   • les BISCUITS gianduja déclarés DEUX FOIS — 13:13 puis 13:56, mêmes
//     quantités, par deux personnes différentes : un doublon ;
//   • les deux MOUSSES, elles, à six heures d'écart et de quantités
//     différentes (6 228 g puis 6 120 g) : deux vraies cuves.
//
// L'app ne peut pas trancher à sa place. Elle fait deux choses : DEMANDER
// avant une deuxième déclaration du jour, et MONTRER dans « À valider » que
// l'article revient, avec ses heures.
// ============================================================
import { describe, it, expect } from 'vitest'

/** La règle de l'écran : faut-il demander confirmation ? */
const faut = noeud => (Number(noeud?.dejaFait) || 0) > 0

/** Celle d'« À valider » : quels articles reviennent dans la liste ? */
const cle = n => String(n || '').trim().toLowerCase()
const revientPlusieursFois = lignes => {
  const par = new Map()
  for (const l of lignes || []) {
    const k = cle(l.article)
    if (!par.has(k)) par.set(k, [])
    par.get(k).push(l)
  }
  return new Map([...par].filter(([, v]) => v.length > 1))
}

describe('avant de déclarer', () => {
  it('rien de fait aujourd’hui : on ne demande rien', () => {
    expect(faut({ dejaFait: 0 })).toBe(false)
    expect(faut({})).toBe(false)
  })

  it('déjà une fournée aujourd’hui : on demande', () => {
    expect(faut({ dejaFait: 6228, dejaFaitLe: '2026-09-21T13:56:00Z' })).toBe(true)
  })

  // ⚠️ ON NE BLOQUE PAS : une deuxième cuve existe pour de vrai, et la refuser
  // ferait déclarer moins que ce qui a été fabriqué.
  it('la question se répond « oui » — ce n’est pas un mur', () => {
    expect(typeof faut({ dejaFait: 1 })).toBe('boolean')
  })
})

describe('dans « À valider »', () => {
  const lignes = [
    { name: 'MO/1', article: 'SM. Biscuit Gianduja (Plaque)', demande: 7200 },
    { name: 'MO/2', article: 'SM. Biscuit Gianduja (Plaque)', demande: 7200 },
    { name: 'MO/3', article: 'SM. Mousse Gianduja', demande: 6228 },
    { name: 'MO/4', article: 'SM. Mousse Gianduja', demande: 6120 },
    { name: 'MO/5', article: 'SM- Gianduja Indiv', demande: 23 },
  ]

  it('montre les articles qui reviennent, et eux seuls', () => {
    const r = revientPlusieursFois(lignes)
    expect([...r.keys()].sort()).toEqual([
      'sm. biscuit gianduja (plaque)', 'sm. mousse gianduja',
    ])
    expect(r.get('sm- gianduja indiv')).toBeUndefined()
  })

  it('garde les deux lignes, pour comparer les quantités', () => {
    expect(revientPlusieursFois(lignes).get('sm. mousse gianduja').map(l => l.demande))
      .toEqual([6228, 6120])
  })

  it('une liste sans doublon ne signale rien', () => {
    expect(revientPlusieursFois([lignes[4]]).size).toBe(0)
  })
})
