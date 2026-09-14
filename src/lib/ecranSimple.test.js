import { describe, it, expect } from 'vitest'
import { qte, dose, enGrammes, enUnite, uniteAffichee } from './ecranSimple'

// Comment l'écran de l'atelier écrit ses nombres. Tout en grammes : « 2,1 kg »
// oblige à convertir de tête au-dessus d'une balance, et c'est là qu'on se
// trompe d'un facteur mille.

describe('les quantités, comme l’atelier les lit', () => {
  // `toLocaleString` sépare les milliers par une espace fine insécable ; on la
  // ramène à une espace ordinaire pour lire le test à l'œil nu.
  const lu = (v, u) => qte(v, u).replace(/\u202f|\u00a0/g, ' ')

  it('tout en grammes : jamais un kilo à convertir de tête', () => {
    expect(lu(2.73, 'kg')).toBe('2 730 g')
    expect(lu(0.06, 'kg')).toBe('60 g')
    expect(lu(47.69, 'kg')).toBe('47 690 g')
  })

  it('les grammes et les pièces restent entiers', () => {
    expect(lu(1494.4, 'g')).toBe('1 494 g')
    expect(lu(13, 'u')).toBe('13 u')
  })
})

describe('la dose pour une pièce', () => {
  const lu = (v, u) => dose(v, u).replace(/\u202f|\u00a0/g, ' ')

  it('le glaçage rose : 1 178 g pour 31 gâteaux = 38 g', () => {
    expect(lu(1178 / 31, 'g')).toBe('38 g')
  })

  it('garde les toutes petites doses : 0,4 g de gélatine, pas « 0 g »', () => {
    expect(lu(0.42, 'g')).toBe('0,42 g')
    expect(lu(0.0031, 'kg')).toBe('3,1 g')
  })

  it('une pièce reste une pièce', () => {
    expect(lu(1, 'u')).toBe('1 u')
  })

  it('un chiffre après la virgule suffit à la balance', () => {
    expect(lu(90.9655, 'g')).toBe('91 g')
    expect(lu(38.24, 'g')).toBe('38,2 g')
  })
})

describe('la conversion, le seul endroit où l’on change d’unité', () => {
  it('de l’unité d’Odoo vers l’écran', () => {
    expect(enGrammes(5.55, 'kg')).toBe(5550)
    expect(enGrammes(0.06, 'kg')).toBe(60)
    expect(enGrammes(1200, 'g')).toBe(1200)
    expect(enGrammes(13, 'u')).toBe(13)
  })

  it('et retour, sans perdre un gramme', () => {
    expect(enUnite(5550, 'kg')).toBe(5.55)
    expect(enUnite(60, 'kg')).toBe(0.06)
    expect(enUnite(1200, 'g')).toBe(1200)
  })

  it('aller-retour : ce qu’on affiche est ce qu’on déclare', () => {
    for (const [v, u] of [[5.55, 'kg'], [0.004, 'kg'], [1200, 'g'], [13, 'u']]) {
      expect(enUnite(enGrammes(v, u), u)).toBeCloseTo(v, 9)
    }
  })

  it('le mot d’unité suit', () => {
    expect(uniteAffichee('kg')).toBe('g')
    expect(uniteAffichee('g')).toBe('g')
    expect(uniteAffichee('u')).toBe('u')
  })
})

// ============================================================
// « QUAND LE SUCRE EST AU KG, TU NE LE PRENDS PAS » (Layla, 2026-09-14).
//
// L'unité était bien lue et convertie — mais la fiche des amandes
// caramélisées était calculée pour UN GRAMME (voir `fourneeFiche`), et
// 0,00037 kg de sucre s'écrivait « 0 g ». L'écran avait l'air d'oublier les
// lignes en kilos. Une quantité qui existe ne doit jamais s'écrire zéro.
// ============================================================
describe('une petite quantité ne s’écrit jamais « 0 »', () => {
  const lu2 = (v, u) => qte(v, u).replace(/ | /g, ' ')

  it('garde la précision sous le demi-gramme, en g comme en kg', () => {
    expect(lu2(0.00037, 'kg')).toBe('0,37 g')
    expect(lu2(0.4, 'g')).toBe('0,4 g')
    expect(lu2(0.09, 'g')).toBe('0,09 g')
  })

  it('mais zéro reste zéro', () => {
    expect(lu2(0, 'kg')).toBe('0 g')
    expect(lu2(0, 'g')).toBe('0 g')
  })

  it('et rien ne change au-dessus du demi-gramme', () => {
    expect(lu2(0.12, 'kg')).toBe('120 g')
    expect(lu2(5.55, 'kg')).toBe('5 550 g')
    expect(lu2(880, 'g')).toBe('880 g')
    expect(lu2(105, 'u')).toBe('105 u')
  })
})
