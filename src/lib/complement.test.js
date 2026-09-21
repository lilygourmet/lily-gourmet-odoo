// ============================================================
// RAJOUTER DANS UNE QUANTITÉ DÉJÀ DONNÉE.
//
// « Je veux rajouter dans une quantité d'article déjà donné, comment faire ? »
// (Layla, 2026-09-21). Réponse d'alors : on ne pouvait pas — le chiffre du
// papier s'imposait jusque dans le panneau d'impression, et le seul chemin
// était de rendre toute la marchandise.
//
// Sa règle, choisie le même jour : le nouveau papier ne réclame QUE le
// complément (500 g), pendant que la fiche, elle, compte le total (2 500 g).
// Lui faire redemander 2,5 kg, c'était risquer qu'on ressorte 2,5 kg de plus.
// ============================================================
import { describe, it, expect } from 'vitest'
import { quantitesImposees, dejaSorti, complementsAImprimer } from './feuilles'

const base = { jour: '2026-09-21', produit: 'SM. Creme Citron', unite: 'g', pour: 'SM- Tarte' }
/** Les 2 kg imprimés ce matin, que l'économe a servis. */
const donnee = { ...base, id: 'f1', qty_prevue: 2000, donne_le: '2026-09-21T08:00:00Z' }
/** Le complément de 500 g, imprimé ensuite. */
const complement = { ...base, id: 'f2', qty_prevue: 500, donne_le: null }

describe('ce que la fiche retient', () => {
  it('additionne les papiers ouverts : 2 000 + 500 = 2 500', () => {
    expect(quantitesImposees([donnee, complement])['SM. Creme Citron']).toBe(2500)
  })

  it('oublie ce qui est rendu, déclaré ou remplacé', () => {
    const rendue = { ...base, id: 'f3', qty_prevue: 900, retour_le: 'hier' }
    const declaree = { ...base, id: 'f4', qty_prevue: 800, declare_le: 'hier' }
    const remplacee = { ...base, id: 'f5', qty_prevue: 700, pas_faite_le: 'hier', motif: 'remplacee' }
    expect(quantitesImposees([donnee, rendue, declaree, remplacee])['SM. Creme Citron']).toBe(2000)
  })
})

describe('ce qui est déjà sorti de la réserve', () => {
  it('ne compte que ce que l’économe a vraiment donné', () => {
    expect(dejaSorti([donnee, complement])).toEqual({ 'SM. Creme Citron': 2000 })
  })

  it('une feuille qui attend encore ne compte pas', () => {
    expect(dejaSorti([complement])).toEqual({})
  })
})

describe('le papier du complément', () => {
  const voulu = [{ produit: 'SM. Creme Citron', qty: 2500, unite: 'g' }]

  it('ne réclame que ce qui manque', () => {
    const [f] = complementsAImprimer(voulu, [donnee])
    expect(f.qty).toBe(500)
    expect(f.complementDe).toBe(2000)
  })

  // ⚠️ Sans ça, 2 kg donnés + 2 kg réimprimés auraient fait croire à 4 kg à
  // fabriquer : le papier se réimprime, mais il ne crée aucune dette de plus.
  it('rend zéro quand il n’y a rien à ajouter', () => {
    expect(complementsAImprimer([{ produit: 'SM. Creme Citron', qty: 2000 }], [donnee])[0].qty).toBe(0)
  })

  // ⚠️ Vouloir MOINS que ce qui est déjà sorti se règle en rendant la
  // marchandise — pas en imprimant un papier à −800 g.
  it('jamais un chiffre négatif', () => {
    expect(complementsAImprimer([{ produit: 'SM. Creme Citron', qty: 1200 }], [donnee])[0].qty).toBe(0)
  })

  it('laisse tranquille ce qui n’a jamais été servi', () => {
    const l = [{ produit: 'SM. Ganache', qty: 900 }]
    expect(complementsAImprimer(l, [donnee])).toEqual(l)
  })

  it('sans rien de sorti, rien ne change', () => {
    expect(complementsAImprimer(voulu, [])).toEqual(voulu)
  })
})
