import { describe, it, expect } from 'vitest'
import { poidsUnite, enGrammes, versUnite } from './unites'

describe('poidsUnite', () => {
  it('lit le poids caché dans le nom de l\'unité', () => {
    expect(poidsUnite('Tournée (3 kg)')).toBe(3000)
    expect(poidsUnite('Tournée (250 g)')).toBe(250)
  })
  it('ne voit pas de poids là où il n\'y en a pas', () => {
    expect(poidsUnite('u')).toBe(null)
    expect(poidsUnite('kg')).toBe(null)
    expect(poidsUnite('')).toBe(null)
  })
})

describe('enGrammes', () => {
  it('convertit les poids', () => {
    expect(enGrammes(0.5, 'kg')).toBe(500)
    expect(enGrammes(201, 'g')).toBe(201)
    expect(enGrammes(2, 'Tournée (3 kg)')).toBe(6000)
  })
  it('renvoie null pour ce qui se compte en pièces', () => {
    expect(enGrammes(6, 'u')).toBe(null)
    expect(enGrammes(6, 'Units')).toBe(null)
  })
})

describe('versUnite : une recette et son article ne parlent pas la même langue', () => {
  // Le bug du 01/09/2026 : « 201 g de Crumble » ouvrait une fiche à 201 kg.
  it('des grammes vers un article compté en kilos', () => {
    expect(versUnite(201, 'g', 'kg')).toBeCloseTo(0.201, 9)
    expect(versUnite(4800, 'g', 'kg')).toBeCloseTo(4.8, 9)
  })
  it('des kilos vers un article compté en grammes', () => {
    expect(versUnite(0.5, 'kg', 'g')).toBe(500)
  })
  it('ne touche à rien quand les deux unités concordent', () => {
    expect(versUnite(201, 'g', 'g')).toBe(201)
    expect(versUnite(4.8, 'kg', 'kg')).toBeCloseTo(4.8, 9)
  })
  it('compte en tournées quand l\'unité porte son poids', () => {
    expect(versUnite(6000, 'g', 'Tournée (3 kg)')).toBe(2)
    expect(versUnite(1.5, 'kg', 'Tournée (3 kg)')).toBe(0.5)
  })
  it('laisse les pièces tranquilles', () => {
    expect(versUnite(6, 'u', 'u')).toBe(6)
    expect(versUnite(6, 'u', 'kg')).toBe(6)
    expect(versUnite(500, 'g', 'u')).toBe(500)
  })
  it('ne casse pas sur une unité inconnue ou vide', () => {
    expect(versUnite(12, 'g', '')).toBe(12)
    expect(versUnite(12, '', 'kg')).toBe(12)
  })
})

describe('la chaîne complète reste homogène sur 3 niveaux', () => {
  // Le cas réel : Pistache 10 pers → crunchy (g) → Crumble (kg) → farine (g).
  const recettes = {
    crunchy: { sortQty: 385, sortUnite: 'g', lignes: [{ produit: 'crumble', qty: 100, unite: 'g' }] },
    crumble: { sortQty: 4.8, sortUnite: 'kg', lignes: [{ produit: 'farine', qty: 1000, unite: 'g' }] },
    farine: { sortQty: 1, sortUnite: 'g', lignes: [] },
  }
  const besoinEnfant = (parent, fois) => {
    const l = recettes[parent].lignes[0]
    return versUnite(l.qty * fois, l.unite, recettes[l.produit].sortUnite)
  }

  it('774 g de crunchy demandent 0,201 kg de crumble, pas 201', () => {
    const fois = 774 / recettes.crunchy.sortQty          // ≈ 2,01
    expect(besoinEnfant('crunchy', fois)).toBeCloseTo(0.201, 3)
  })

  it('et ce crumble redescend en grammes de farine, sans dérive', () => {
    const foisCrunchy = 774 / recettes.crunchy.sortQty
    const kgCrumble = besoinEnfant('crunchy', foisCrunchy)
    const foisCrumble = kgCrumble / recettes.crumble.sortQty
    expect(besoinEnfant('crumble', foisCrumble)).toBeCloseTo(41.9, 1)
  })
})
