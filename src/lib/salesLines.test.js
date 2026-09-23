import { describe, it, expect } from 'vitest'
import { sumQty, stripOdooPrefix, groupDeliveriesWithFullOrder, groupByHourThenClient } from './salesLines'
import { decalageMaroc } from './fuseauMaroc'

// ⚠️ CE TEST DISAIT « (Maroc UTC+1) », ET C'ÉTAIT LUI LE PROBLÈME.
//
// « On est passé à GMT 0 — c'est surtout pour les commandes » (Layla,
// 2026-09-23). Mesuré le soir même : son téléphone 20:02, UTC 20:02, et
// `Africa/Casablanca` 21:02. La base de fuseaux du serveur avait une heure
// d'avance, et treize conversions la croyaient — dont celle-ci.
//
// Le décalage du Maroc vit maintenant dans un seul réglage
// (`src/lib/fuseauMaroc.js`) ; ce test suit ce réglage au lieu de figer une
// valeur qui change deux fois par an.
describe('groupByHourThenClient — heure du Maroc', () => {
  it('10 h UTC tombe dans la tranche du Maroc, quel que soit le décalage', () => {
    const res = groupByHourThenClient([
      { order_num: 'S1', client_name: 'X', delivery_at: '2026-06-05T10:00:00Z' },
    ])
    const h = 10 + decalageMaroc(new Date('2026-06-05T10:00:00Z'))
    expect([...res.keys()]).toContain(`${h}h-${h + 1}h`)
  })

  it('et aujourd’hui, le Maroc étant à GMT+0, c’est bien 10h-11h', () => {
    const res = groupByHourThenClient([
      { order_num: 'S1', client_name: 'X', delivery_at: '2026-06-05T10:00:00Z' },
    ])
    expect([...res.keys()]).toContain('10h-11h')
  })
})

describe('sumQty', () => {
  it('additionne les quantités', () => {
    expect(sumQty([{ quantity: 2 }, { quantity: 3 }])).toBe(5)
    expect(sumQty([{ quantity: '1.5' }, { quantity: '2.5' }])).toBe(4)
    expect(sumQty([])).toBe(0)
  })
})

describe('stripOdooPrefix', () => {
  it('retire le préfixe [123] et garde la 1ère ligne', () => {
    expect(stripOdooPrefix('[429] E- Citron meringué')).toBe('E- Citron meringué')
    expect(stripOdooPrefix('Produit\nNote en dessous')).toBe('Produit')
  })
})

describe('groupDeliveriesWithFullOrder', () => {
  it('regroupe la livraison avec TOUTES les lignes de la commande (détail complet)', () => {
    const livr = [{ order_num: 'S1', client_name: 'Nabil', delivery_at: '2026-06-05T10:00:00Z', category: 'LIVR', product_name: 'LIVR- Souissi' }]
    // produit avec une date DIFFÉRENTE de la ligne livraison
    const allLines = [
      ...livr,
      { order_num: 'S1', delivery_at: '2026-06-04T08:00:00Z', category: 'CD', product_name: 'Gâteau choco', quantity: 1 },
    ]
    const res = groupDeliveriesWithFullOrder(livr, allLines)
    const entries = [...res.values()].flatMap(m => [...m.values()])
    expect(entries).toHaveLength(1)
    // le détail doit contenir le produit ET la ligne livraison
    const productNames = entries[0].items.map(i => i.product_name)
    expect(productNames).toContain('Gâteau choco')
    expect(productNames).toContain('LIVR- Souissi')
  })
})
