import { describe, it, expect } from 'vitest'
import { etatArticle } from '../../api/fab-annexe.js'

// ====== Qui reste dans « À faire », et avec quel reliquat ======
// Le tiramisu 15 cm : mini 7, maxi 21. Trois en stock, vingt déjà déclarés
// ce matin — Odoo ne les verra qu'à la validation, mais ils sont faits.

const tiramisu = { produit: 'SM- Tiramisu 15cm', mini: 7, maxi: 21 }

describe('etatArticle', () => {
  it('sort de la liste ce qui vient d’être déclaré', () => {
    // 3 + 20 = 23, au-dessus du maxi : il n'y a plus rien à faire.
    expect(etatArticle(tiramisu, 3, 20)).toMatchObject({ aFaire: false, reste: 0 })
  })

  it('garde ce qui est sous le mini', () => {
    expect(etatArticle(tiramisu, 3, 0).aFaire).toBe(true)
    expect(etatArticle(tiramisu, 3, 0).reste).toBe(18)
  })

  it('le mini est ATTEINT, pas seulement franchi', () => {
    expect(etatArticle(tiramisu, 7, 0).aFaire).toBe(true)     // pile dessus
    expect(etatArticle(tiramisu, 8, 0).aFaire).toBe(false)    // au-dessus
  })

  it('garde une tournée commencée tant que le maxi n’est pas atteint', () => {
    // 3 + 10 = 13 : au-dessus du mini, mais il manque 8 pour le maxi.
    expect(etatArticle(tiramisu, 3, 10)).toMatchObject({ aFaire: true, reste: 8 })
  })

  it('un mini à 0 ne se montre qu’à zéro', () => {
    const caramel = { mini: 0, maxi: 3920 }
    expect(etatArticle(caramel, 0, 0).aFaire).toBe(true)
    expect(etatArticle(caramel, 500, 0).aFaire).toBe(false)
  })

  it('un maxi à ZÉRO ne se propose jamais tout seul', () => {
    // « SM. Crème légère vanille citron — à faire 1 g » : elle est au catalogue
    // pour la taille de sa tournée, pas pour être fabriquée d'elle-même.
    const sansCible = { mini: 0, maxi: 0 }
    expect(etatArticle(sansCible, 0, 0)).toMatchObject({ aFaire: false, reste: 0 })
    expect(etatArticle(sansCible, -1390, 0)).toMatchObject({ aFaire: false, reste: 0 })
    // il suffit de lui donner un maxi pour qu'il revienne
    expect(etatArticle({ mini: 0, maxi: 500 }, 0, 0).aFaire).toBe(true)
  })

  it('un stock NÉGATIF compte zéro, il ne crée pas de reliquat fantôme', () => {
    // Vécu : crème légère à −1 390 g, maxi 0 → « il reste 1 390 g à faire ».
    const creme = { mini: 0, maxi: 900 }
    expect(etatArticle(creme, -1390, 0)).toMatchObject({ reste: 900, aFaire: true })
  })
})
