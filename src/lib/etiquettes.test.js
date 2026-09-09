import { describe, it, expect } from 'vitest'
import { buildZplLabels, estMontageCD, estPrepaEtiquetee } from './etiquettes'

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

describe('estMontageCD — qui reçoit une étiquette au frigo', () => {
  it('les étages, quel que soit leur nom dans Odoo', () => {
    expect(estMontageCD('20 cm CD* (Chocolat)')).toBe(true)
    expect(estMontageCD('25 cm CD* (Praliné Chocolaté)')).toBe(true)
    expect(estMontageCD('30 cm cakedesign (Vanille)')).toBe(true)
  })

  it('les plaques, les cœurs et les formes', () => {
    expect(estMontageCD('33x33 Cakedesign CD* (Citron)')).toBe(true)
    expect(estMontageCD('18cm bombé Cakedesign CD* (Citron)')).toBe(true)
    expect(estMontageCD('Coeur 10p Cakedesign CD* (Praliné Amandes caramélisées)')).toBe(true)
    expect(estMontageCD('CD- Cakedesign Letter Cake CD* (Oréo, 10)')).toBe(true)
    expect(estMontageCD('CD- Gateau Forme (Citron, 30, carré)')).toBe(true)
  })

  it('jamais une préparation — même quand son nom dit « cakedesign »', () => {
    expect(estMontageCD('CD- Ganache cakedesign (Chocolat noir, 30)')).toBe(false)
    expect(estMontageCD('SM CD* Crème au beurre Praliné')).toBe(false)
    expect(estMontageCD('SM CD* Boule Cake pops accs (Caramel)')).toBe(false)
    expect(estMontageCD('SM. sirop Imbibage production KG')).toBe(false)
    expect(estMontageCD('SM Genoise Chocolat KG CD')).toBe(false)
  })
})

describe('estPrepaEtiquetee — le bac qui part au frigo', () => {
  it('les sirops et les crèmes, accent ou pas', () => {
    expect(estPrepaEtiquetee('SM CD* Sirop imbibage kg')).toBe(true)
    expect(estPrepaEtiquetee('SM CD* Crème au beurre Praliné')).toBe(true)
    expect(estPrepaEtiquetee('SM. Creme patissiere Angelo finition')).toBe(true)
  })

  it('rien d’autre', () => {
    expect(estPrepaEtiquetee('CD- Ganache cakedesign (Chocolat noir, 30)')).toBe(false)
    expect(estPrepaEtiquetee('SM Genoise Chocolat KG CD')).toBe(false)
    expect(estPrepaEtiquetee('20 cm CD* (Chocolat)')).toBe(false)
  })
})
