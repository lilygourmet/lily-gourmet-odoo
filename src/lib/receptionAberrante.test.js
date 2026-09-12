import { describe, it, expect } from 'vitest'
import { receptionAberrante } from './transfertsStock'

// Le 2026-09-09 : 0,9 kg d'œufs envoyés, « 900 » tapé à la réception, et le bon
// Odoo E-ACP/INTPDXPD/03841 portait 900 KG d'œufs. Annulé de justesse.
describe('le garde-fou de la réception', () => {
  const ligne = (qty_envoye) => ({ qty_envoye, matiere: 'MP- Oeufs entier', unite: 'kg' })

  it('attrape les 900 kg d’œufs', () => {
    expect(receptionAberrante(ligne(0.9), 900)).toBe(true)
  })

  it('attrape une unité confondue dans les deux sens de grandeur', () => {
    expect(receptionAberrante(ligne(2), 2000)).toBe(true)       // kg tapés en g
    expect(receptionAberrante(ligne(0.05), 50)).toBe(true)
  })

  it('laisse passer une réception normale', () => {
    expect(receptionAberrante(ligne(2), 2)).toBe(false)
    expect(receptionAberrante(ligne(2), 1)).toBe(false)         // reçu moins : normal
    expect(receptionAberrante(ligne(0.9), 0)).toBe(false)       // refus
    expect(receptionAberrante(ligne(1), 19)).toBe(false)        // sous le facteur 20
    expect(receptionAberrante(ligne(1), 21)).toBe(true)         // au-dessus
  })

  it('ne dit rien quand il n’y a rien à comparer', () => {
    expect(receptionAberrante(ligne(0), 900)).toBe(false)
    expect(receptionAberrante(null, 900)).toBe(false)
  })
})
