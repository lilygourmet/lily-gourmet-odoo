// ============================================================
// LE FACTEUR FOURNÉE OUBLIÉ — 5,4 kg de crème disparus en silence.
//
// Le 14 septembre 2026, un ordre de crème au beurre praliné lancé pour DEUX
// fournées (14 057 g) n'a imposé qu'UNE fournée de crème nature : 5 407 g au
// lieu de 10 814. Odoo a écrit 5 407 sans discuter, parce qu'une quantité
// imposée prime sur la règle de trois et que RIEN ne vérifiait qu'elle
// corresponde à la taille de l'ordre.
//
// Résultat : 5,4 kg de crème nature restés au stock alors qu'ils étaient
// partis dans le praliné. Personne ne l'a vu pendant six jours.
// « Pourquoi ? Ça ne doit pas se faire !! » (Layla, 2026-09-20.)
//
// ⚠️ Ce que ce garde-fou NE doit PAS faire : râler sur une pesée normale.
// 5 407 au lieu de 5 425, c'est la balance — ça doit passer sans un mot.
// ============================================================
import { describe, it, expect } from 'vitest'
import { facteurFournee, fourneesIncoherentes, corrigerFournees } from '../../api/freezer-list.js'

describe('le facteur fournée', () => {
  it('⚠️ LE CAS DU 14 SEPTEMBRE : une fournée au lieu de deux', () => {
    expect(facteurFournee(5407, 10814)).toBe(2)
  })

  it('l’inverse aussi : deux fois trop', () => {
    expect(facteurFournee(10814, 5407)).toBe(-2)
  })

  it('trois fournées oubliées, ça compte aussi', () => {
    expect(facteurFournee(1800, 5400)).toBe(3)
  })

  describe('ce qui doit passer SANS bruit', () => {
    it('une pesée d’atelier : 5 407 au lieu de 5 425', () => {
      expect(facteurFournee(5407, 5425)).toBe(null)
    })
    it('un rendement qui perd 10 %', () => {
      expect(facteurFournee(4880, 5425)).toBe(null)
    })
    it('un rapport qui ne tombe pas juste (1,7 fois) : on ne devine pas', () => {
      expect(facteurFournee(3200, 5425)).toBe(null)
    })
    it('« on n’en a pas mis » : zéro n’est pas un facteur', () => {
      expect(facteurFournee(0, 5425)).toBe(null)
      expect(facteurFournee(5425, 0)).toBe(null)
    })
    it('un rapport délirant (30 fois) : ce n’est plus une fournée', () => {
      expect(facteurFournee(180, 5400)).toBe(null)
    })
  })
})

describe('sur une vraie recette', () => {
  // La recette du praliné : 7 052 g sortent, et il faut 5 425 g de nature.
  const lignes = [
    { product_id: [3620, 'SM. Creme au Beurre Nature Production'], product_qty: 5425 },
    { product_id: [11, 'MP- Praliné Noisette 50%'], product_qty: 1800 },
  ]

  it('⚠️ l’ordre du 14 septembre serait REFUSÉ', () => {
    // 2 fournées → la recette attend 10 850 g de nature ; on en impose 5 407.
    const pb = fourneesIncoherentes(lignes, { 'SM. Creme au Beurre Nature Production': 5407 }, 2)
    expect(pb).toHaveLength(1)
    expect(pb[0].nom).toBe('SM. Creme au Beurre Nature Production')
    expect(pb[0].facteur).toBe(2)
  })

  it('le même ordre avec la bonne quantité passe', () => {
    expect(fourneesIncoherentes(lignes, { 'SM. Creme au Beurre Nature Production': 10814 }, 2))
      .toEqual([])
  })

  it('une fournée pile, comme le 8 septembre : rien à signaler', () => {
    expect(fourneesIncoherentes(lignes, { 'SM. Creme au Beurre Nature Production': 5425 }, 1))
      .toEqual([])
  })

  it('un ingrédient non imposé n’est pas regardé', () => {
    expect(fourneesIncoherentes(lignes, { 'SM. Creme au Beurre Nature Production': 10814 }, 2))
      .toEqual([])
  })

  it('⚠️ le nom avec sa référence Odoo « [123] » est reconnu quand même', () => {
    const avecRef = [{ product_id: [3620, '[C-123] SM. Creme au Beurre Nature Production'], product_qty: 5425 }]
    expect(fourneesIncoherentes(avecRef, { 'SM. Creme au Beurre Nature Production': 5407 }, 2))
      .toHaveLength(1)
  })
})

describe('ce que le garde-fou laisse passer exprès', () => {
  // Vérifié sur 150 ordres réels avant de le brancher : sans ces deux
  // exclusions, il aurait bloqué des déclarations parfaitement normales.
  const ligne = (nom, qty) => ({ product_id: [1, nom], product_qty: qty })

  it('⚠️ LA CUVE : elle part en entier, même sur une taille plus petite', () => {
    // « SM. Mousse Pistache » imposée à 3 600 g sur un ordre qui n'en demande
    // que 1 800 : c'est la règle de Layla, pas une erreur.
    expect(fourneesIncoherentes([ligne('SM. Mousse Pistache', 1800)],
      { 'SM. Mousse Pistache': 3600 }, 1)).toEqual([])
  })

  it('⚠️ les matières premières ne sont pas suivies à l’annexe', () => {
    expect(fourneesIncoherentes([ligne('MP- Sucre Granule', 1999)],
      { 'MP- Sucre Granule': 1000 }, 1)).toEqual([])
    expect(fourneesIncoherentes([ligne('F- Citron fruit', 28675)],
      { 'F- Citron fruit': 14337 }, 1)).toEqual([])
  })

  it('mais une préparation SM en sous-nombre, elle, est refusée', () => {
    expect(fourneesIncoherentes([ligne('SM. Creme au Beurre Nature Production', 5425)],
      { 'SM. Creme au Beurre Nature Production': 5407 }, 2)).toHaveLength(1)
  })
})


describe('la correction', () => {
  // « Si j'ai produit 10 000 parce que la recette demandait 10 000, eh bien
  // 10 000 doivent passer par moins » (Layla, 2026-09-20).
  const lignes = [{ product_id: [3620, 'SM. Creme au Beurre Nature Production'], product_qty: 5425 }]

  it('⚠️ LE CAS DU 14 SEPTEMBRE : 5 407 g redeviennent 10 850 g', () => {
    const r = corrigerFournees(lignes, { 'SM. Creme au Beurre Nature Production': 5407 }, 2)
    expect(r.ajustements['SM. Creme au Beurre Nature Production']).toBe(10850)
  })

  it('elle écrit ce qu’elle a fait, pour que ça se retrouve', () => {
    const r = corrigerFournees(lignes, { 'SM. Creme au Beurre Nature Production': 5407 }, 2)
    expect(r.note).toContain('5407 g → 10850 g')
    expect(r.note).toContain('2 fournée(s)')
  })

  it('une pesée normale n’est PAS touchée', () => {
    const r = corrigerFournees(lignes, { 'SM. Creme au Beurre Nature Production': 5407 }, 1)
    expect(r.ajustements['SM. Creme au Beurre Nature Production']).toBe(5407)
    expect(r.note).toBe(null)
  })

  it('⚠️ la CUVE, qui impose plus, n’est pas touchée non plus', () => {
    const mousse = [{ product_id: [9, 'SM. Mousse Pistache'], product_qty: 1800 }]
    const r = corrigerFournees(mousse, { 'SM. Mousse Pistache': 3600 }, 1)
    expect(r.ajustements['SM. Mousse Pistache']).toBe(3600)
    expect(r.note).toBe(null)
  })

  it('les matières premières restent telles quelles', () => {
    const mp = [{ product_id: [5, 'MP- Sucre Granule'], product_qty: 1999 }]
    const r = corrigerFournees(mp, { 'MP- Sucre Granule': 1000 }, 1)
    expect(r.ajustements['MP- Sucre Granule']).toBe(1000)
    expect(r.note).toBe(null)
  })

  it('les autres ingrédients de la recette ne bougent pas', () => {
    const deux = [...lignes, { product_id: [11, 'MP- Praliné Noisette 50%'], product_qty: 1800 }]
    const r = corrigerFournees(deux, {
      'SM. Creme au Beurre Nature Production': 5407, 'MP- Praliné Noisette 50%': 3600 }, 2)
    expect(r.ajustements['MP- Praliné Noisette 50%']).toBe(3600)
  })
})
