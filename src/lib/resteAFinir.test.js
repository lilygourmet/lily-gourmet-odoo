// ============================================================
// CE QUI RESTE D'UNE CUVE : CE QUE L'ORDRE A CONSOMMÉ, PAS LA RECETTE.
//
// « J'ai dit qu'il m'en est resté 400 g. Il me remet 500 ? Pourquoi ? »
// (Layla, 2026-09-22, sur le Subleme Fleur d'Oranger Pistache).
//
// Son chiffre était pourtant bien parti chez Odoo : l'ordre WHPDX/MO/21766
// consomme 748,12 g — exactement 1 148,12 moins les 400 qu'elle a vus de ses
// yeux. Mais « À finir » refaisait le calcul de la RECETTE (24 individuels ×
// 27 g = 648 g) et annonçait 500 g au frigo. Les 100 g d'écart, c'est ce que
// l'atelier avait mis EN PLUS dans les pièces.
// ============================================================
import { describe, it, expect } from 'vitest'
import { partagerDeclarations } from '../../api/fab-annexe.js'

/**
 * La règle de l'écran, sortie ici pour être jugée seule : ce qu'un vrac a
 * laissé, une fois retiré ce que les ordres en ont VRAIMENT pris.
 */
const resteDuVrac = ({ stock, fait, unite, reel, formats, sansOrdre }) => {
  const enG = /^kg$/i.test(String(unite || '').trim()) ? 1000 : 1
  let pris = (reel || 0) * enG
  const vus = new Set()
  for (const f of formats || []) {
    if (vus.has(f.produit)) continue
    vus.add(f.produit)
    const n = (sansOrdre || {})[f.produit] || 0
    if (n > 0) pris += n * (f.parUnite || 0) * (/^kg$/i.test(f.uniteVrac || '') ? 1000 : 1)
  }
  return Math.max(0, Math.round(((stock + (fait || 0)) * enG - pris) * 1000) / 1000)
}

// Le cas vécu, avec ses vrais chiffres.
const subleme = {
  stock: 1148.12, fait: 0, unite: 'g',
  formats: [{ produit: "SM- Pr  Pistache fleur d'oranger indiv", parUnite: 27, uniteVrac: 'g' }],
}

describe('le Subleme Fleur d’Oranger Pistache du 22/09', () => {
  it('AVANT : la recette annonçait 500 g alors qu’il en restait 400', () => {
    // 24 pièces × 27 g = 648 g — le calcul théorique.
    const parLaRecette = resteDuVrac({ ...subleme, reel: 0,
      sansOrdre: { "SM- Pr  Pistache fleur d'oranger indiv": 24 } })
    expect(parLaRecette).toBeCloseTo(500.12, 2)
  })

  it('APRÈS : l’ordre a consommé 748,12 g, il reste bien 400', () => {
    expect(resteDuVrac({ ...subleme, reel: 748.12, sansOrdre: {} })).toBeCloseTo(400, 2)
  })
})

describe('les garde-fous qui ne doivent pas tomber', () => {
  it('un vrac compté en KILOS se compare quand même en grammes', () => {
    // 2 kg en stock, l'ordre en a pris 1,4 kg → 600 g restent.
    expect(resteDuVrac({ stock: 2, fait: 0, unite: 'kg', reel: 1.4, formats: [] }))
      .toBeCloseTo(600, 6)
  })

  // ⚠️ Ce qui est déclaré SANS ordre n'apparaît dans aucun mouvement : pour
  // celui-là, et seulement celui-là, la recette reste le seul repère.
  it('une déclaration sans ordre garde le calcul de la recette', () => {
    expect(resteDuVrac({ ...subleme, reel: 0,
      sansOrdre: { "SM- Pr  Pistache fleur d'oranger indiv": 10 } })).toBeCloseTo(878.12, 2)
  })

  it('les deux s’additionnent : l’ordre lu, plus ce qui n’en a pas', () => {
    expect(resteDuVrac({ ...subleme, reel: 400,
      sansOrdre: { "SM- Pr  Pistache fleur d'oranger indiv": 10 } })).toBeCloseTo(478.12, 2)
  })

  // ⚠️ JAMAIS MOINS QUE RIEN : un reste négatif n'est pas une dette, c'est un
  // compteur faux.
  it('jamais de reste négatif', () => {
    expect(resteDuVrac({ ...subleme, reel: 5000, sansOrdre: {} })).toBe(0)
  })

  // Et la cuve déclarée aujourd'hui compte, même si Odoo ne la voit pas encore.
  it('ce qui vient d’être déclaré compte comme présent', () => {
    expect(resteDuVrac({ stock: 0, fait: 1148.12, unite: 'g', reel: 748.12, formats: [] }))
      .toBeCloseTo(400, 2)
  })
})

// Le même format compté deux fois de suite ne doit pas doubler la note.
describe('un format qui revient dans la liste', () => {
  it('n’est compté qu’une fois', () => {
    const deuxFois = [
      { produit: 'X', parUnite: 27, uniteVrac: 'g' },
      { produit: 'X', parUnite: 27, uniteVrac: 'g' },
    ]
    expect(resteDuVrac({ stock: 1000, fait: 0, unite: 'g', reel: 0,
      formats: deuxFois, sansOrdre: { X: 10 } })).toBeCloseTo(730, 6)
  })
})

describe('partagerDeclarations écarte ce qui est clos', () => {
  it('un ordre validé ne compte plus', () => {
    const faits = [
      { article: 'A', qty: 100, ordre: 'MO/1' },
      { article: 'A', qty: 50, ordre: 'MO/2' },
    ]
    expect(partagerDeclarations(faits, new Set(['MO/2'])).total.A).toBe(100)
  })
})
