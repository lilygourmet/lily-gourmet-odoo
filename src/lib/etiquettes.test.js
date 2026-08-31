import { describe, it, expect } from 'vitest'
import { buildZplLabels } from './etiquettes'

// On découpe le nom nous-mêmes : si on laisse ZPL le faire (^FB), les lignes en
// trop s'impriment PAR-DESSUS les précédentes et l'étiquette est illisible
// (vécu le 2026-08-31 : « nohseblat » pour « chocolat noisette »).
const zpl = (name, size, price = 60) =>
  buildZplLabels([{ article: { name, price, barcode: '4441', category: 'gs' }, size, qty: 1 }])
const positionsY = z => [...z.matchAll(/\^FO\d+,(\d+)\^A0N/g)].map(m => Number(m[1]))

describe('mise en page des étiquettes produits', () => {
  it('aucun bloc ^FB : c est lui qui repliait les lignes', () => {
    expect(zpl('Biscuit au chocolat noisette')).not.toMatch(/\^FB/)
  })

  it('deux textes ne sont jamais au même endroit', () => {
    for (const n of ['Biscuit au chocolat noisette', 'Biscuit au fromage', 'Café']) {
      const ys = positionsY(zpl(n))
      expect(new Set(ys).size).toBe(ys.length)
    }
  })

  it('le sous-titre passe SOUS la dernière ligne du nom', () => {
    const ys = positionsY(zpl('Biscuit au chocolat noisette', 5))
    expect(ys[ys.length - 1]).toBeGreaterThan(ys[ys.length - 2])
  })

  it('tout reste dans la hauteur de l étiquette (200 points)', () => {
    for (const n of ['Biscuit au chocolat noisette', 'Black Forest']) {
      for (const y of positionsY(zpl(n, 5))) expect(y).toBeLessThan(200)
    }
  })

  it('le prix ne déborde pas à droite, même à 3 chiffres', () => {
    const m = zpl('Café', null, 145).match(/\^FO(\d+),\d+\^A0N,32,(\d+)\^FD([^^]+)\^FS/)
    expect(m).not.toBeNull()
    const [, x, w, texte] = m
    expect(Number(x) + texte.length * Number(w)).toBeLessThanOrEqual(400)
  })
})

// Le prix ne sort QUE sur les GS- : ni les entremets E- (sur mesure), ni les SU-.
describe('le prix ne sort que pour les GS-', () => {
  const avecPrix = cat => buildZplLabels([{ article: { name: 'Test', price: 55, barcode: '1', category: cat }, size: null, qty: 1 }]).includes('55 DH')
  it('GS- : prix affiché', () => expect(avecPrix('gs')).toBe(true))
  it('E- (entremets) : pas de prix', () => expect(avecPrix('cd')).toBe(false))
  it('SU- : pas de prix', () => expect(avecPrix('su')).toBe(false))
})
