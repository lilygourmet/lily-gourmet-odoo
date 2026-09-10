import { describe, it, expect } from 'vitest'
import { qte, dose } from './ecranSimple'

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
