import { describe, it, expect } from 'vitest'
import { odooParfumsNames, odooParfumsLabel } from './gmFiches'

// Le commercial saisit ses lots sans parfum : le parfum doit rester visible via Odoo.
describe('parfums Odoo des accessoires', () => {
  it('un seul parfum : libelle avec la quantite', () => {
    const item = { title: 'Cake pops (boite de 12, Nutella)', parfums: ['Nutella'], quantity: 1, pers: 12 }
    expect(odooParfumsNames(item, 'cakepop')).toEqual(['Nutella'])
    expect(odooParfumsLabel(item, 'cakepop')).toBe('12 Nutella')
  })

  it('mixte : les 2 sous-parfums', () => {
    const item = { title: 'Boite signature Sellou/Nougat (Boite de 20, Mixte)', parfums: ['Mixte'], quantity: 1, pers: 20 }
    expect(odooParfumsNames(item, 'sellou_nougat')).toEqual(['Sellou', 'Nougat'])
    expect(odooParfumsLabel(item, 'sellou_nougat')).toBe('Sellou + Nougat')
  })

  it('boite a plusieurs parfums : repartition', () => {
    const item = { title: 'Cupcake boite de 24 (Mini simple, Oréo, Vanille, Oréo, Vanille)', parfums: ['Oréo', 'Vanille', 'Oréo', 'Vanille'], quantity: 2, pers: null }
    expect(odooParfumsLabel(item, 'cupcake')).toBe('24 Oréo, 24 Vanille')
  })

  it('la taille n est pas prise pour un parfum', () => {
    const item = { title: 'Cupcake boite de 18 (Mini simple, Vanille, Vanille, Vanille)', parfums: ['Vanille', 'Vanille', 'Vanille'], quantity: 1, pers: null }
    expect(odooParfumsNames(item, 'cupcake')).toEqual(['Vanille'])
  })
})
