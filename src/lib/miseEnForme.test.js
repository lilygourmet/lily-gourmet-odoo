// ============================================================
// CE QUI REVIENT À ÊTRE FINI.
//
// « Quand une mousse reste en stock, elle revient dans À déclarer parce
// qu'elle doit être finie » (Layla, 2026-09-20).
// ============================================================
import { describe, it, expect } from 'vitest'
import { aMettreEnForme } from './miseEnForme'

const liste = [
  { produit: 'SM. Mousse Meringue Citron (kg)', note: 'coulée — indiv' },
  { produit: 'SM. Gélée Mangue Ananas Pistache', note: 'coulée — 10 pers, indiv' },
  { produit: 'SM. Crunchy Pistache', note: null },
]

const catalogue = [
  { produit: 'SM. Mousse Meringue Citron (kg)', libelle: 'Mousse meringue citron', unite: 'kg', stock: 2.4 },
  { produit: 'SM. Gélée Mangue Ananas Pistache', libelle: 'Gélée mangue', unite: 'g', stock: 2030 },
  { produit: 'SM. Crunchy Pistache', libelle: 'Crunchy pistache', unite: 'g', stock: 0 },
  // Pas dans la liste : il peut dormir en stock, ce n'est pas un moulage.
  { produit: 'SM. Genoise Vanille KG Commun', libelle: 'Génoise vanille', unite: 'g', stock: 48000 },
]

describe('ce qui attend sa mise en forme', () => {
  it('tout ce qui reste d’un vrac à mouler, et rien d’autre', () => {
    expect(aMettreEnForme(catalogue, liste).map(a => a.produit))
      .toEqual(['SM. Gélée Mangue Ananas Pistache', 'SM. Mousse Meringue Citron (kg)'])
  })

  it('garde la note : ce qu’on en fait (coulée, pipée, découpée)', () => {
    expect(aMettreEnForme(catalogue, liste)[1].note).toBe('coulée — indiv')
  })

  // ⚠️ Une répartition laisse toujours des poussières. Une ligne qui ne part
  // jamais, c'est une ligne qu'on apprend à ignorer — et alors tout le reste
  // avec.
  it('ne compte pas les poussières', () => {
    const miettes = [
      { produit: 'SM. Gélée Mangue Ananas Pistache', unite: 'g', stock: 0.4 },
      { produit: 'SM. Mousse Meringue Citron (kg)', unite: 'kg', stock: 0.0004 },
    ]
    expect(aMettreEnForme(miettes, liste)).toEqual([])
  })

  it('un stock négatif (compteur faux) ne réclame rien', () => {
    expect(aMettreEnForme([{ produit: 'SM. Crunchy Pistache', unite: 'g', stock: -120 }], liste))
      .toEqual([])
  })

  it('sans liste ni catalogue, rien ne casse', () => {
    expect(aMettreEnForme(null, null)).toEqual([])
    expect(aMettreEnForme(catalogue, [])).toEqual([])
  })
})
