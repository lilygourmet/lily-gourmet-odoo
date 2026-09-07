import { describe, it, expect } from 'vitest'
import { aplatir, distance, correspond, chercher } from './recherche'

// Les vrais noms de l'inventaire annexe : c'est sur eux que ça doit marcher.
const ARTICLES = [
  'SM. Genoise Vanille KG commun',
  'SM Ghriba Behla',
  'SM. Chantilly à la Rose',
  'Sm- Le Citron Framboise (10)',
  'SM. Creme au beurre nature production',
  'SM- Base Tarte CBS indiv',
  'SM. Pate a Croissant',
]

describe('aplatir', () => {
  it('enlève accents, majuscules et ponctuation', () => {
    expect(aplatir('SM. Chantilly à la Rose')).toBe('sm chantilly a la rose')
    expect(aplatir('Sm- Le Citron Framboise (10)')).toBe('sm le citron framboise 10')
  })
  it('ne casse pas sur du vide', () => {
    expect(aplatir(null)).toBe('')
    expect(aplatir('   ')).toBe('')
  })
})

describe('distance', () => {
  it('compte les corrections', () => {
    expect(distance('ghriba', 'ghriba')).toBe(0)
    expect(distance('ghriba', 'gribha')).toBe(2)   // deux lettres inversées
    expect(distance('chantilly', 'chantily')).toBe(1)
  })
  it('abandonne dès que c\'est trop loin', () => {
    expect(distance('citron', 'framboise', 2)).toBeGreaterThan(2)
  })
})

describe('correspond : chercher comme on parle', () => {
  const trouve = q => ARTICLES.filter(a => correspond(a, q))

  it('trouve dans le désordre', () => {
    expect(trouve('vanille genoise')).toEqual(['SM. Genoise Vanille KG commun'])
    expect(trouve('framboise citron')).toEqual(['Sm- Le Citron Framboise (10)'])
  })

  it('pardonne une faute de frappe', () => {
    expect(trouve('chantily')).toEqual(['SM. Chantilly à la Rose'])
    expect(trouve('gribha')).toEqual(['SM Ghriba Behla'])
  })

  it('se passe des accents', () => {
    expect(trouve('genoise')).toEqual(['SM. Genoise Vanille KG commun'])
    expect(trouve('creme beurre')).toEqual(['SM. Creme au beurre nature production'])
  })

  it('accepte les abrégés, en début de mot', () => {
    expect(trouve('cit fram')).toEqual(['Sm- Le Citron Framboise (10)'])
  })

  it('un mot de plus affine au lieu d\'élargir', () => {
    expect(trouve('sm').length).toBe(ARTICLES.length)
    expect(trouve('sm croissant')).toEqual(['SM. Pate a Croissant'])
  })

  it('ne pardonne rien sur un mot court : « cbs » n\'est pas « cds »', () => {
    expect(trouve('cbs')).toEqual(['SM- Base Tarte CBS indiv'])
    expect(trouve('cds')).toEqual([])
  })

  it('une recherche vide laisse tout passer', () => {
    expect(trouve('')).toEqual(ARTICLES)
    expect(trouve('   ')).toEqual(ARTICLES)
  })

  it('ne trouve rien quand il n\'y a rien', () => {
    expect(trouve('chocolat blanc')).toEqual([])
  })
})

describe('chercher : le plus proche en premier', () => {
  it('met devant ce qui commence par ce qui est tapé', () => {
    const l = ['Grande Genoise', 'Genoise Vanille', 'Petite genoise']
    expect(chercher(l, 'genoise')[0]).toBe('Genoise Vanille')
  })
  it('garde l\'ordre d\'origine à égalité', () => {
    const l = ['Citron A', 'Citron B']
    expect(chercher(l, 'citron')).toEqual(['Citron A', 'Citron B'])
  })
  it('sait lire dans un objet', () => {
    const l = [{ nom: 'Ghriba Behla' }, { nom: 'Croissant' }]
    expect(chercher(l, 'gribha', x => x.nom)).toEqual([{ nom: 'Ghriba Behla' }])
  })
})
