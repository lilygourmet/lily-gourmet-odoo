// ============================================================
// Les essais du chef ne doivent JAMAIS ressembler à un enregistrement :
// ils modifient ce qu'on lit, et rien d'autre. Ce fichier tient cette ligne.
// ============================================================
import { describe, it, expect } from 'vitest'
import { recetteEssai, nbEssais } from './recettes'

const lignes = [
  { produit: 'SM. Masse Gelatine', besoin: 140, unite: 'g', fabrique: true },
  { produit: 'MP- Sucre Granule', besoin: 250, unite: 'g', pese: true },
  { produit: 'MP- Citron Liquide', besoin: 80, unite: 'g', pese: true },
]

describe('recetteEssai', () => {
  it('sans essai, la recette d’Odoo passe telle quelle', () => {
    expect(recetteEssai(lignes, {})).toEqual(lignes)
    expect(recetteEssai(lignes)).toEqual(lignes)
  })

  it('change une quantité, et garde la vraie à côté', () => {
    const r = recetteEssai(lignes, { 'MP- Sucre Granule': { qty: 300 } })
    expect(r[1].besoin).toBe(300)
    expect(r[1].essai).toEqual({ produit: 'MP- Sucre Granule', besoin: 250 })
    // Les autres lignes ne bougent pas d'un gramme.
    expect(r[0]).toEqual(lignes[0])
    expect(r[2]).toEqual(lignes[2])
  })

  it('remplace un ingrédient sans toucher à sa quantité', () => {
    const r = recetteEssai(lignes, { 'MP- Citron Liquide': { nom: 'MP- Citron Jaune Frais' } })
    expect(r[2].produit).toBe('MP- Citron Jaune Frais')
    expect(r[2].besoin).toBe(80)
  })

  it('accepte la virgule — c’est ce que tape un clavier de téléphone', () => {
    expect(recetteEssai(lignes, { 'SM. Masse Gelatine': { qty: '12,5' } })[0].besoin).toBe(12.5)
  })

  it('un champ vidé, ou un chiffre illisible, rend la vraie quantité', () => {
    expect(recetteEssai(lignes, { 'MP- Sucre Granule': { qty: '' } })[1].besoin).toBe(250)
    expect(recetteEssai(lignes, { 'MP- Sucre Granule': { qty: 'abc' } })[1].besoin).toBe(250)
  })

  it('un nom vidé rend le vrai nom : on ne perd pas l’ingrédient', () => {
    expect(recetteEssai(lignes, { 'MP- Sucre Granule': { nom: '   ' } })[1].produit)
      .toBe('MP- Sucre Granule')
  })

  it('retaper la valeur d’origine n’est plus un essai', () => {
    const r = recetteEssai(lignes, { 'MP- Sucre Granule': { qty: 250 } })
    expect(r[1].essai).toBeUndefined()
  })

  // ⚠️ La clé reste le nom D'ORIGINE : sinon, renommer une fois ferait perdre
  // la trace de ce qu'on avait changé.
  it('la clé reste le nom d’origine même après un remplacement', () => {
    const essais = { 'MP- Citron Liquide': { nom: 'MP- Citron Jaune Frais', qty: 95 } }
    const r = recetteEssai(lignes, essais)
    expect(r[2]).toMatchObject({ produit: 'MP- Citron Jaune Frais', besoin: 95 })
    // On le repasse : rien ne dérive, l'essai s'applique toujours à la même ligne.
    expect(recetteEssai(lignes, essais)[2].produit).toBe('MP- Citron Jaune Frais')
  })

  it('zéro est une vraie quantité, pas un champ vide', () => {
    expect(recetteEssai(lignes, { 'MP- Sucre Granule': { qty: 0 } })[1].besoin).toBe(0)
  })
})

describe('nbEssais', () => {
  it('dit combien de lignes ne sont plus celles d’Odoo', () => {
    expect(nbEssais(lignes, {})).toBe(0)
    expect(nbEssais(lignes, { 'MP- Sucre Granule': { qty: 300 } })).toBe(1)
    expect(nbEssais(lignes, {
      'MP- Sucre Granule': { qty: 300 },
      'MP- Citron Liquide': { nom: 'Autre' },
    })).toBe(2)
  })

  it('un essai qui ne change rien ne compte pas', () => {
    expect(nbEssais(lignes, { 'MP- Sucre Granule': { qty: 250, nom: 'MP- Sucre Granule' } })).toBe(0)
  })
})
