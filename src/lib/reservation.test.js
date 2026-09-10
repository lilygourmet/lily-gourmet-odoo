// « La ganache déclarée garde le lien "pour Base CBS 23 cm" — et du coup le
// 18 cm demande à faire la sienne » (Layla, 2026-09-10).
//
// Sans cette réservation, les deux gâteaux se partageaient la même ganache :
// le 18 cm ne demandait plus rien, et la ganache manquait au montage.
import { describe, it, expect } from 'vitest'
import { partagerDeclarations, disponiblePour } from '../../api/fab-annexe.js'

const ganache23 = { article: 'SM. Ganache Gold', qty: 2700, pour: 'SM- Base CBS 23 cm' }
const caramelLibre = { article: 'SM. caramel beurre sale production', qty: 3920 }

describe('partagerDeclarations', () => {
  it('sépare ce qui est réservé de ce qui est libre', () => {
    const d = partagerDeclarations([ganache23, caramelLibre])
    expect(d.pour['SM- Base CBS 23 cm']['SM. Ganache Gold']).toBe(2700)
    expect(d.libre['SM. Ganache Gold']).toBeUndefined()
    expect(d.libre['SM. caramel beurre sale production']).toBe(3920)
  })

  it('le total compte tout : réservée ou non, la ganache existe', () => {
    const d = partagerDeclarations([ganache23, caramelLibre])
    expect(d.total['SM. Ganache Gold']).toBe(2700)
  })

  it('additionne deux fournées faites pour le même gâteau', () => {
    const d = partagerDeclarations([ganache23, { ...ganache23, qty: 900 }])
    expect(d.pour['SM- Base CBS 23 cm']['SM. Ganache Gold']).toBe(3600)
  })

  it('une déclaration VALIDÉE ne compte plus : elle est déjà dans le stock', () => {
    const clos = new Set(['WHPDX/MO/21333'])
    const d = partagerDeclarations([{ ...ganache23, ordre: 'WHPDX/MO/21333' }], clos)
    expect(d.total['SM. Ganache Gold']).toBeUndefined()
    expect(d.pour['SM- Base CBS 23 cm']).toBeUndefined()
  })

  it('tient devant un journal vide', () => {
    expect(partagerDeclarations(null).total).toEqual({})
  })
})

describe('disponiblePour', () => {
  const d = partagerDeclarations([ganache23, caramelLibre])

  it('le 23 cm voit SA ganache', () => {
    const dispo = disponiblePour(d, 'SM- Base CBS 23 cm')
    expect(dispo['SM. Ganache Gold']).toBe(2700)
    expect(dispo['SM. caramel beurre sale production']).toBe(3920)
  })

  it('le 18 cm ne la voit PAS : il demandera la sienne', () => {
    const dispo = disponiblePour(d, 'SM- Base Tarte CBS 18 cm')
    expect(dispo['SM. Ganache Gold']).toBeUndefined()
    expect(dispo['SM. caramel beurre sale production']).toBe(3920)
  })

  it('ce qui est libre reste libre pour tout le monde', () => {
    const dispo = disponiblePour(partagerDeclarations([{ article: 'SM. Ganache Gold', qty: 900 }]),
      'SM- Base Tarte CBS 18 cm')
    expect(dispo['SM. Ganache Gold']).toBe(900)
  })

  it('ne casse pas quand rien n’a été déclaré', () => {
    expect(disponiblePour(undefined, 'SM- X')).toEqual({})
  })
})
