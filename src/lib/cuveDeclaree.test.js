// « Elle est censée consommer 9 775 » (Layla, 2026-09-11) : la cuve qui part
// dans l'ordre est celle qu'on a FAITE, pas celle que la recette calcule.
import { describe, it, expect } from 'vitest'
import { cuveDeclaree } from './fabAnnexe'

const citron = {
  produit: 'Sm- Le Citron Framboise (5)', unite: 'u', tournee: 25,
  ajustements: { 'SM. Crème légère vanille citron': 9775 },
  composants: [
    { produit: 'SM. Crème légère vanille citron', unite: 'g', besoin: 9775,
      stock: 0, dejaFait: 9000, fige: true, fabrique: true },
    { produit: 'SM- Fond Citron Framboise (5)', unite: 'u', besoin: 25,
      stock: 40, dejaFait: 0, fige: false, fabrique: true },
  ],
}

describe('cuveDeclaree', () => {
  it('prend ce qui a été déclaré, pas ce que la recette annonce', () => {
    expect(cuveDeclaree(citron)).toEqual({ 'SM. Crème légère vanille citron': 9000 })
  })

  it('ne touche pas aux morceaux qui ne sont pas figés', () => {
    expect(cuveDeclaree(citron)['SM- Fond Citron Framboise (5)']).toBeUndefined()
  })

  it('laisse la recette décider quand rien n’a été déclaré', () => {
    const sansDecl = { ...citron,
      composants: citron.composants.map(c => ({ ...c, dejaFait: 0 })) }
    expect(cuveDeclaree(sansDecl)).toEqual({})
  })

  it('laisse tranquilles les figés ACHETÉS — la mousse du royal', () => {
    // Lait, gélatine, crème : pas d'article à eux, donc pas de déclaration.
    const royal = { produit: 'SM- Royal Chocolat 20 cm', composants: [
      { produit: 'MP- Lait UHT', unite: 'g', besoin: 1430, dejaFait: 0, fige: true, fabrique: false },
    ] }
    expect(cuveDeclaree(royal)).toEqual({})
  })

  it('tient devant du vide', () => {
    expect(cuveDeclaree(null)).toEqual({})
    expect(cuveDeclaree({})).toEqual({})
  })
})
