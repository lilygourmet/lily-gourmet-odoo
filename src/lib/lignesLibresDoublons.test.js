import { describe, it, expect } from 'vitest'
import { memeOperation } from './releveDoublons'

// Règle de dédoublonnage des lignes proposées dans « Suggérer » / « Chercher » (la boucle
// de loadFreeReleveLines, reprise ici telle quelle car elle parle à Supabase).
// Vécu : « VIRT RECU MLLE AATIYAD LAAMOUR » et « … LAAMOURI », 500 dh le 2 juin — un seul
// virement, écrit par les deux documents de la banque, proposé deux fois.
const dedoublonner = (lignes) => {
  const gardees = []
  for (const l of lignes) {
    if (gardees.some(g => g.releve_url !== l.releve_url && memeOperation(g, l))) continue
    gardees.push(l)
  }
  return gardees
}
const l = (label, releve_url) => ({ label, releve_url, amount: 500, ligne_date: '2026-06-02' })

describe('lignes libres proposées', () => {
  it('ne propose qu’une fois un virement écrit par les deux documents', () => {
    const out = dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOUR', 'releves/juin-extrait.pdf'),
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
    ])
    expect(out).toHaveLength(1)
  })

  it('garde les DEUX quand ils viennent du même document', () => {
    const out = dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
    ])
    expect(out).toHaveLength(2)
  })

  it('garde deux clientes différentes du même montant le même jour', () => {
    const out = dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
      l('VIRT RECU MME SELMA BENOMAR', 'releves/juin-extrait.pdf'),
    ])
    expect(out).toHaveLength(2)
  })
})
