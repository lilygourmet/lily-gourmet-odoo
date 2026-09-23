import { describe, it, expect } from 'vitest'
import { memeOperation } from './releveDoublons'

// Règle de dédoublonnage des lignes proposées dans « Suggérer » / « Chercher » / « Grouper »
// (la boucle de loadFreeReleveLines, reprise ici car cette fonction parle à Supabase).
//
// Vécu : « VIRT RECU MLLE AATIYAD LAAMOUR » et « … LAAMOURI », 500 dh le 2 juin — un seul
// virement, écrit par les deux documents de la banque, proposé deux fois.
const memeDocConnu = (x, y) => !!x.releve_url && !!y.releve_url && x.releve_url === y.releve_url
const dedoublonner = (lignes) => {
  const gardees = []
  for (const l of lignes) {
    if (gardees.some(g => !memeDocConnu(g, l) && memeOperation(g, l))) continue
    gardees.push(l)
  }
  return gardees
}
const l = (label, releve_url) => ({ label, releve_url, amount: 500, ligne_date: '2026-06-02' })

describe('lignes libres proposées', () => {
  it('ne propose qu’une fois un virement écrit par les deux documents', () => {
    expect(dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOUR', 'releves/juin-extrait.pdf'),
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
    ])).toHaveLength(1)
  })

  // Une ligne récupérée par « 🔎 Vérifier un relevé » n'a pas d'URL : ce contrôle relit le
  // PDF sans le téléverser. Exiger deux URL DIFFÉRENTES laissait alors passer les jumelles.
  it('fusionne aussi quand le document n’est pas connu', () => {
    expect(dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOUR', null),
      l('VIRT RECU MLLE AATIYAD LAAMOURI', null),
    ])).toHaveLength(1)
  })

  it('garde les DEUX quand ils viennent du même document connu', () => {
    expect(dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
    ])).toHaveLength(2)
  })

  it('garde deux clientes différentes du même montant le même jour', () => {
    expect(dedoublonner([
      l('VIRT RECU MLLE AATIYAD LAAMOURI', 'releves/juin-releve.pdf'),
      l('VIRT RECU MME SELMA BENOMAR', 'releves/juin-extrait.pdf'),
    ])).toHaveLength(2)
  })
})
