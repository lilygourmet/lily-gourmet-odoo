// L'AUTRE BOUT DU FACTEUR MILLE : la fournée mille fois trop PETITE.
//
// 21 ordres créés au millième entre le 01/08 et le 17/09/2026, puis clôturés à
// la bonne quantité. Odoo avait calculé les composants pour la version
// minuscule : la matière est restée en stock alors qu'elle était bien partie.
// `WHPDX/MO/21563` a laissé 9 271 g de crème au beurre citron fantôme.
// (Layla, 2026-09-19 : « pourquoi il me reste encore de la crème… ».)
import { describe, it, expect } from 'vitest'
import { corrigerFourneeMinuscule } from '../../api/freezer-list.js'

describe('corrigerFourneeMinuscule — les cas vécus', () => {
  it('WHPDX/MO/21563 : 0,029 pièce au lieu de 29', () => {
    const r = corrigerFourneeMinuscule(0.029, 1, 'Units')
    expect(r.corrige).toBe(1000)
    expect(r.qty).toBeCloseTo(29, 6)
  })

  it('WHPDX/MO/21534 : 5,371 g pour une recette qui en sort 5 425', () => {
    const r = corrigerFourneeMinuscule(5.371, 5425, 'g')
    expect(r.corrige).toBe(1000)
    expect(r.qty).toBeCloseTo(5371, 3)
  })

  it('WHPDX/MO/21594 : 1,485 g pour une recette de 1 925', () => {
    const r = corrigerFourneeMinuscule(1.485, 1925, 'g')
    expect(r.corrige).toBe(1000)
    expect(r.qty).toBeCloseTo(1485, 3)
  })

  it('la crème citron gingembre du 11/09 : 14,33 g pour 7 164', () => {
    const r = corrigerFourneeMinuscule(14.328, 7164, 'g')
    expect(r.corrige).toBe(1000)
    expect(r.qty).toBeCloseTo(14328, 3)
  })
})

describe('corrigerFourneeMinuscule — ce qu’il ne doit PAS toucher', () => {
  it('une petite fournée légitime : 200 g sur une recette de 5 425', () => {
    expect(corrigerFourneeMinuscule(200, 5425, 'g').corrige).toBe(0)
  })

  it('le 1er centile des fournées réelles (0,8 % de la recette) passe', () => {
    expect(corrigerFourneeMinuscule(43.4, 5425, 'g').corrige).toBe(0)
  })

  it('une fournée entière ne bouge pas', () => {
    expect(corrigerFourneeMinuscule(5425, 5425, 'g').corrige).toBe(0)
    expect(corrigerFourneeMinuscule(10850, 5425, 'g').corrige).toBe(0)
  })

  it('UNE pièce reste une pièce — jamais 1 000', () => {
    expect(corrigerFourneeMinuscule(1, 1, 'Units').corrige).toBe(0)
    expect(corrigerFourneeMinuscule(29, 1, 'Units').corrige).toBe(0)
  })

  it('ne corrige pas si ×1000 n’explique rien : 0,000002 g reste tel quel', () => {
    expect(corrigerFourneeMinuscule(0.000002, 5425, 'g').corrige).toBe(0)
  })

  it('une demi-pièce que ×1000 n’explique pas : on laisse', () => {
    // 0,0000004 × 1000 = 0,0004 pièce : toujours absurde, on ne bricole pas.
    expect(corrigerFourneeMinuscule(0.0000004, 1, 'Units').corrige).toBe(0)
  })

  // ⚠️ LE PIÈGE OÙ JE SUIS TOMBÉ EN VÉRIFIANT (2026-09-19).
  // « SM. Mousse Meringue Citron (kg) » est compté en KILOS par Odoo, et sa
  // recette sort 800 g. Un ordre de 0,8 y est donc JUSTE. J'avais rejoué le
  // garde-fou en lui passant 0,8 (l'unité de l'article) au lieu de 800
  // (l'unité de la recette, la seule qu'il reçoit vraiment) et conclu à tort
  // que 41 ordres étaient faux. Le vrai code convertit AVANT d'appeler ici.
  it('la fournée de mousse meringue citron (0,8 kg = 800 g) est JUSTE', () => {
    expect(corrigerFourneeMinuscule(800, 800, 'g').corrige).toBe(0)
    // 1,8 fournée : toujours juste.
    expect(corrigerFourneeMinuscule(1440, 800, 'g').corrige).toBe(0)
    // Celle-là, en revanche, est bien fausse : 0,8 g pour une recette de 800 g.
    expect(corrigerFourneeMinuscule(0.8, 800, 'g').qty).toBeCloseTo(800, 6)
  })

  // ⚠️ « ATTENTION À CE QUI EST DÉCLARÉ EN KILO. CE N'EST PAS EN GR. ÇA DOIT
  // ÊTRE CONVERTI » (Layla, 2026-09-19).
  // C'est le RAPPORT À LA RECETTE qui décide, jamais le chiffre brut — et les
  // deux sont dans la même unité, parce que `creerOfPreparation` a converti
  // avant (`quantiteOrdre`). Un même nombre peut donc être juste ou faux selon
  // ce que sort la recette : 1 g de ganache est une recette entière, 0,8 g de
  // mousse est le millième de la sienne.
  it('1 g de ganache est une fournée ENTIÈRE : on n’y touche pas', () => {
    // La ganache cakedesign sort 1 g : des dizaines d'ordres à 1 g depuis juillet.
    expect(corrigerFourneeMinuscule(1, 1, 'g').corrige).toBe(0)
    expect(corrigerFourneeMinuscule(8, 1, 'g').corrige).toBe(0)
  })

  it('un article compté en KILOS se juge sur sa recette, pas sur le nombre', () => {
    // 1,68 kg d'une recette qui sort 9,43 kg : une petite fournée, légitime.
    expect(corrigerFourneeMinuscule(1.68, 9.43, 'kg').corrige).toBe(0)
    // 0,00168 kg de la même : le millième, faux.
    expect(corrigerFourneeMinuscule(0.00168, 9.43, 'kg').qty).toBeCloseTo(1.68, 6)
  })

  it('sans quantité ou sans recette, on ne touche à rien', () => {
    expect(corrigerFourneeMinuscule(0, 5425, 'g').corrige).toBe(0)
    expect(corrigerFourneeMinuscule(-5, 5425, 'g').corrige).toBe(0)
    expect(corrigerFourneeMinuscule(5.371, 0, 'g').corrige).toBe(0)
  })

  it('sait lire une unité qui porte son poids : « Tournée (3 kg) »', () => {
    // 6 tournées demandées sur une recette qui en sort 1 : c'est du poids,
    // pas des pièces — et 6 ≥ 0,5 % de 1, donc rien à corriger.
    expect(corrigerFourneeMinuscule(6, 1, 'Tournée (3 kg)').corrige).toBe(0)
    // 0,006 tournée pour une recette de 1 : là, c'est le millième.
    expect(corrigerFourneeMinuscule(0.004, 1, 'Tournée (3 kg)').qty).toBeCloseTo(4, 6)
  })
})
