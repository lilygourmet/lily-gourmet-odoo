// UNE FOURNÉE MILLE FOIS TROP PETITE : on la REFUSE, on ne la répare pas.
//
// Des ordres créés au millième puis clôturés à la bonne quantité : Odoo avait
// calculé les composants pour la version minuscule, ils y sont restés, et la
// matière est restée en stock alors qu'elle était bien partie.
// `WHPDX/MO/21563` a laissé 9 271 g de crème au beurre citron fantôme.
// (Layla, 2026-09-19 : « pourquoi il me reste encore de la crème… ».)
//
// ⚠️ POURQUOI REFUSER PLUTÔT QUE CORRIGER : ici on n'a qu'un rapport suspect,
// pas de preuve — contrairement à `corrigerFacteurMille`, qui tient la sienne
// des ingrédients pesés. Multiplier par mille sur une supposition ferait
// consommer mille fois trop de matière : pire que le bug d'origine, qui
// laissait seulement du stock en trop, et tout aussi silencieux. Un ordre
// refusé, lui, se voit — la personne retape.
//
// ⚠️ C'EST LE RAPPORT À LA RECETTE QUI DÉCIDE, JAMAIS LE CHIFFRE BRUT :
// « attention à ce qui est déclaré en kilo. ce n'est pas en gr » (Layla).
import { describe, it, expect } from 'vitest'
import { fourneeMinuscule, fourneeRelue } from '../../api/freezer-list.js'

describe('fourneeMinuscule — les cas vécus, refusés', () => {
  it('WHPDX/MO/21563 : 0,029 pièce au lieu de 29', () => {
    expect(fourneeMinuscule(0.029, 1, 'Units')).toBe(true)
  })

  it('WHPDX/MO/21534 : 5,371 g pour une recette qui en sort 5 425', () => {
    expect(fourneeMinuscule(5.371, 5425, 'g')).toBe(true)
  })

  it('WHPDX/MO/21594 : 1,485 g pour une recette de 1 925', () => {
    expect(fourneeMinuscule(1.485, 1925, 'g')).toBe(true)
  })

  it('la crème citron gingembre du 11/09 : 14,33 g pour 7 164', () => {
    expect(fourneeMinuscule(14.328, 7164, 'g')).toBe(true)
  })

  it('0,8 g de mousse meringue citron pour une recette de 800 g', () => {
    expect(fourneeMinuscule(0.8, 800, 'g')).toBe(true)
  })
})

describe('fourneeMinuscule — ce qui doit PASSER', () => {
  // ⚠️ LE PIÈGE OÙ JE SUIS TOMBÉ EN VÉRIFIANT (2026-09-19) : j'avais jugé
  // « SM. Mousse Meringue Citron (kg) » sur 0,8 — la quantité dans l'unité de
  // l'ARTICLE (kg) — au lieu de 800, celle de la RECETTE (g), la seule qui
  // arrive ici. Je comparais des kg à des grammes et j'ai conclu à tort que
  // 41 fournées justes étaient fausses. Le vrai code convertit AVANT d'appeler.
  it('la fournée de mousse meringue citron (0,8 kg = 800 g) est JUSTE', () => {
    expect(fourneeMinuscule(800, 800, 'g')).toBe(false)
    expect(fourneeMinuscule(1440, 800, 'g')).toBe(false)
  })

  // Des dizaines d'ordres de ganache à 1 g depuis juillet : sa recette sort 1 g,
  // donc 1 g est une fournée ENTIÈRE. C'est pour ça qu'un plancher absolu en
  // grammes serait FAUX — 1 % des vraies fournées pèsent 5 g ou moins.
  it('1 g de ganache cakedesign est une fournée ENTIÈRE', () => {
    expect(fourneeMinuscule(1, 1, 'g')).toBe(false)
    expect(fourneeMinuscule(8, 1, 'g')).toBe(false)
  })

  it('un article compté en KILOS se juge sur sa recette, pas sur le nombre', () => {
    expect(fourneeMinuscule(1.68, 9.43, 'kg')).toBe(false)     // petite mais vraie
    expect(fourneeMinuscule(0.00168, 9.43, 'kg')).toBe(true)   // le millième
  })

  it('une petite fournée légitime : 200 g sur une recette de 5 425', () => {
    expect(fourneeMinuscule(200, 5425, 'g')).toBe(false)
  })

  it('le 1er centile des fournées réelles (0,8 % de la recette) passe', () => {
    expect(fourneeMinuscule(43.4, 5425, 'g')).toBe(false)
  })

  it('une fournée entière, ou plusieurs, ne bougent pas', () => {
    expect(fourneeMinuscule(5425, 5425, 'g')).toBe(false)
    expect(fourneeMinuscule(10850, 5425, 'g')).toBe(false)
  })

  it('UNE pièce reste une pièce', () => {
    expect(fourneeMinuscule(1, 1, 'Units')).toBe(false)
    expect(fourneeMinuscule(29, 1, 'Units')).toBe(false)
  })

  it('sans quantité ou sans recette, on ne juge rien', () => {
    expect(fourneeMinuscule(0, 5425, 'g')).toBe(false)
    expect(fourneeMinuscule(-5, 5425, 'g')).toBe(false)
    expect(fourneeMinuscule(5.371, 0, 'g')).toBe(false)
  })

  it('sait lire une unité qui porte son poids : « Tournée (3 kg) »', () => {
    expect(fourneeMinuscule(6, 1, 'Tournée (3 kg)')).toBe(false)
    expect(fourneeMinuscule(0.004, 1, 'Tournée (3 kg)')).toBe(true)
  })
})

// « POURQUOI ÇA NE CONVERTIT PAS LE BON ? » (Layla, 2026-09-19).
//
// Elle a raison quand Odoo peut TRANCHER : si l'unité annoncée n'est pas celle
// dans laquelle Odoo compte l'article, le nombre tapé était bon et seule son
// étiquette était fausse. Ce n'est plus une supposition, c'est une donnée.
describe('fourneeRelue — quand Odoo peut trancher, on convertit', () => {
  it('« 14,33 g » de crème citron gingembre, article compté en kg → 2 fournées pile', () => {
    // 14 328 g était bien la vraie quantité (incident du 11/09).
    expect(fourneeRelue(14.33, 'kg', 'g', 7164)).toBeCloseTo(14330, 3)
  })

  it('« 0,8 g » de mousse meringue, article compté en kg → une fournée pile', () => {
    expect(fourneeRelue(0.8, 'kg', 'g', 800)).toBeCloseTo(800, 6)
  })

  it('« 1,68 g » de crème au beurre citron, article en kg → 0,18 fournée', () => {
    expect(fourneeRelue(1.68, 'kg', 'kg', 9.43)).toBeCloseTo(1.68, 6)
  })

  it('SE TAIT quand l’article est bien compté en grammes : aucune preuve', () => {
    // 3,92 g de caramel beurre salé pour une recette de 3 920 g : l'article EST
    // en grammes, relire n'explique rien. L'ordre sera refusé.
    expect(fourneeRelue(3.92, 'g', 'g', 3920)).toBeNull()
    expect(fourneeRelue(0.62, 'g', 'g', 2150)).toBeNull()
  })

  it('SE TAIT si la relecture ne tombe pas sur une vraie fournée', () => {
    expect(fourneeRelue(0.0000004, 'kg', 'g', 800)).toBeNull()
    expect(fourneeRelue(9999, 'kg', 'g', 800)).toBeNull()
  })
})
