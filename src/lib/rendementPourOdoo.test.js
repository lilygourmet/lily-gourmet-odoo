import { describe, it, expect } from 'vitest'
import { rendementPourOdoo } from './fabrication'

// La quantité vraiment sortie, rendue à Odoo. Fabrication CD la note en kg ;
// l'ordre Odoo compte parfois en grammes. Se tromper ici, c'est un facteur
// mille en silence — le piège que ce projet a déjà payé deux fois.
describe('rendementPourOdoo', () => {
  it('même unité : rend le chiffre tel quel', () => {
    expect(rendementPourOdoo({ declare: 5.1, uniteDeclaree: 'kg', prevu: 5.43, uniteOdoo: 'kg' }))
      .toBe(5.1)
  })

  it('déclaré en kg, ordre compté en GRAMMES : convertit', () => {
    expect(rendementPourOdoo({ declare: 1.2, uniteDeclaree: 'kg', prevu: 1000, uniteOdoo: 'g' }))
      .toBe(1200)
  })

  it('déclaré en grammes, ordre compté en KILOS : convertit', () => {
    expect(rendementPourOdoo({ declare: 900, uniteDeclaree: 'g', prevu: 1, uniteOdoo: 'kg' }))
      .toBe(0.9)
  })

  it('SE TAIT quand l’unité de la déclaration est inconnue (coches d’avant)', () => {
    expect(rendementPourOdoo({ declare: 5.1, uniteDeclaree: null, prevu: 5.43, uniteOdoo: 'kg' }))
      .toBeNull()
  })

  it('SE TAIT sur un facteur mille : 5,43 rendus à un ordre de 5 430 g', () => {
    expect(rendementPourOdoo({ declare: 5.43, uniteDeclaree: 'g', prevu: 5430, uniteOdoo: 'g' }))
      .toBeNull()
  })

  it('laisse passer plusieurs tournées d’avance (×4)', () => {
    expect(rendementPourOdoo({ declare: 21.72, uniteDeclaree: 'kg', prevu: 5.43, uniteOdoo: 'kg' }))
      .toBe(21.72)
  })

  it('les pièces ne se convertissent pas', () => {
    expect(rendementPourOdoo({ declare: 18, uniteDeclaree: 'u', prevu: 20, uniteOdoo: 'u' }))
      .toBe(18)
  })

  it('rien de déclaré, rien à rendre', () => {
    expect(rendementPourOdoo({ declare: 0, uniteDeclaree: 'kg', prevu: 5, uniteOdoo: 'kg' })).toBeNull()
    expect(rendementPourOdoo({ declare: null, uniteDeclaree: 'kg', prevu: 5, uniteOdoo: 'kg' })).toBeNull()
  })

  it('sans quantité prévue connue, on rend quand même la conversion', () => {
    expect(rendementPourOdoo({ declare: 2, uniteDeclaree: 'kg', prevu: 0, uniteOdoo: 'g' })).toBe(2000)
  })
})
