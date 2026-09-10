import { describe, it, expect } from 'vitest'
import { autresTailles, familleDuNom, tailleDuNom } from '../../api/fab-annexe.js'

// ====== Une cuve, plusieurs tailles ======
// « D'un 10 pers on finit en 5 pers et en individuels, d'un 5 pers seulement
// en individuels. » La famille du catalogue fait foi ; sinon on la lit dans le
// nom, sans quoi il faudrait la saisir pour quarante articles.

const cat = [
  { produit: 'Sm- Le Citron Framboise (10)', tournee: 24 },
  { produit: 'Sm- Le Citron Framboise (5)', tournee: 13 },
  { produit: 'Sm- Le Citron Framboise (1)', tournee: 58 },
  { produit: 'SM- Tiramisu 20cm', famille: 'tiramisu', rang: 3, tournee: 6 },
  { produit: 'SM- Tiramisu 15cm', famille: 'tiramisu', rang: 2, tournee: 13 },
  { produit: 'SM- Tiramisu indiv', famille: 'tiramisu', rang: 1, tournee: 140 },
  { produit: 'SM- Royal Chocolat 20 cm', tournee: 6 },
  { produit: 'SM- Royal Chocolat 15 cm', tournee: 13 },
]
const noms = l => l.map(x => x.produit)

describe('tailleDuNom', () => {
  it('lit les trois écritures d’Odoo', () => {
    expect(tailleDuNom('SM- Tiramisu indiv')).toBe(1)
    expect(tailleDuNom('SM- Tiramisu 15cm')).toBe(15)
    expect(tailleDuNom('SM- Cheesecake Exotique 10 pers')).toBe(10)
    expect(tailleDuNom('Sm- Le Citron Framboise (5)')).toBe(5)
    expect(tailleDuNom('SM. Craquant Royal')).toBe(0)
  })
})

describe('familleDuNom', () => {
  it('réunit les tailles d’un même gâteau', () => {
    expect(familleDuNom('Sm- Le Citron Framboise (10)'))
      .toBe(familleDuNom('Sm- Le Citron Framboise (1)'))
    expect(familleDuNom('SM- 20 cm Vitrine (Citron)'))
      .toBe(familleDuNom('SM- 15 cm Vitrine (Citron)'))
  })

  it('ne mélange pas deux parfums', () => {
    expect(familleDuNom('SM- 20 cm Vitrine (Citron)'))
      .not.toBe(familleDuNom('SM- 20 cm Vitrine (Praliné)'))
  })
})

describe('autresTailles', () => {
  it('ne propose QUE les tailles plus petites, de la plus grande à la plus petite', () => {
    expect(noms(autresTailles(cat, cat[0])))    // le 10 pers
      .toEqual(['Sm- Le Citron Framboise (5)', 'Sm- Le Citron Framboise (1)'])
    expect(noms(autresTailles(cat, cat[1])))    // le 5 pers
      .toEqual(['Sm- Le Citron Framboise (1)'])
    expect(noms(autresTailles(cat, cat[2]))).toEqual([])   // l'individuel : rien en dessous
  })

  it('suit la famille du catalogue quand elle est renseignée', () => {
    expect(noms(autresTailles(cat, cat[3])))    // tiramisu 20 cm, rang 3
      .toEqual(['SM- Tiramisu 15cm', 'SM- Tiramisu indiv'])
  })

  it('marche sans famille renseignée, par le nom', () => {
    expect(noms(autresTailles(cat, cat[6])))    // royal 20 cm
      .toEqual(['SM- Royal Chocolat 15 cm'])
  })

  it('ne sort jamais de sa famille', () => {
    const tout = autresTailles(cat, cat[0])
    expect(tout.every(x => /Citron Framboise/.test(x.produit))).toBe(true)
  })

  it('laisse de côté ce qui est en pause', () => {
    const avecPause = cat.map(x => (x.produit.includes('(5)') ? { ...x, actif: false } : x))
    expect(noms(autresTailles(avecPause, avecPause[0]))).toEqual(['Sm- Le Citron Framboise (1)'])
  })
})
