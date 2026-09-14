// LE NOM AU-DESSUS DU GROS CHIFFRE.
//
// « ya des bugs dans cette histoire » (Layla, 2026-09-14). Sa fiche affichait,
// entre le titre et le nombre à faire, le mot « kg » tout seul — là où l'écran
// doit dire CE QU'ON EST EN TRAIN DE FAIRE. Cause : `nomCourt` prend ce qu'il
// y a dans la dernière parenthèse, une règle écrite pour
// « Biscuit a la cuillere (plaque) ». Sur « Mousse Meringue Citron (kg) »,
// la parenthèse ne nomme pas une chose : c'est une unité.
import { describe, it, expect } from 'vitest'
import { nomCourt } from './fabAnnexe'

describe('le nom court d’un article', () => {
  it('garde la CHOSE quand la parenthèse en nomme une', () => {
    expect(nomCourt('SM. Biscuit a la cuillere (plaque)')).toBe('plaque')
    expect(nomCourt('SM. Biscuit Gianduja (Plaque)')).toBe('plaque')
    expect(nomCourt('SM. Fond (cadre)')).toBe('cadre')
  })

  it('LE BUG : une parenthèse qui n’est qu’une unité ne nomme rien', () => {
    expect(nomCourt('SM. Mousse Meringue Citron (kg)')).toBe('mousse meringue citron')
    expect(nomCourt('SM. Crème (g)')).toBe('crème')
    expect(nomCourt('SM. Fond (u)')).toBe('fond')
  })

  it('sans parenthèse, c’est le nom, sans son code', () => {
    expect(nomCourt('SM. Citron Liquide')).toBe('citron liquide')
    expect(nomCourt('MP- Sucre Granule')).toBe('sucre granule')
  })

  it('un PARFUM entre parenthèses reste un nom, pas une unité', () => {
    expect(nomCourt('SM. mini cheese cake aromatisé (Ananas)')).toBe('ananas')
  })
})
