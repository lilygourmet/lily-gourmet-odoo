import { describe, it, expect } from 'vitest'
import { resolveGroupes } from './watiInfo'

// Verrou : le groupe d'un membre vient de SON employé (employe_id), pas du champ
// profiles.groupe (qui peut être périmé). Si ce comportement change, ce test casse.
describe('resolveGroupes — groupes pour Tâches / WhatsApp-info', () => {
  const employes = [
    { id: 'e1', groupe: 'Cuisine' },
    { id: 'e2', groupe: 'Cuisine' },
    { id: 'e3', groupe: 'Vente' },
  ]
  const profiles = [
    { id: 'p1', employe_id: 'e1', groupe: null, active: true },        // Cuisine via employé
    { id: 'p2', employe_id: 'e2', groupe: 'Ancien', active: true },    // employé prime sur profiles.groupe
    { id: 'p3', employe_id: 'e3', groupe: null, active: true },        // Vente via employé
    { id: 'p4', employe_id: null, groupe: 'Vente', active: true },     // repli sur profiles.groupe
    { id: 'p5', employe_id: 'e3', groupe: null, active: false },       // inactif → exclu
  ]

  it('résout le groupe via l\'employé (et ignore profiles.groupe périmé)', () => {
    const r = resolveGroupes({ groupeNames: ['Cuisine', 'Vente'], employes, profiles })
    const cuisine = r.find(g => g.nom === 'Cuisine')
    const vente = r.find(g => g.nom === 'Vente')
    expect(cuisine.profileIds.sort()).toEqual(['p1', 'p2'])   // pas dans "Ancien"
    expect(vente.profileIds.sort()).toEqual(['p3', 'p4'])     // employé + repli, p5 inactif exclu
  })

  it('exclut les groupes sans aucun membre actif', () => {
    const r = resolveGroupes({ groupeNames: ['Cuisine', 'Vente', 'Livraison'], employes, profiles })
    expect(r.map(g => g.nom)).not.toContain('Livraison')
  })

  it('si aucun nom de groupe fourni, déduit les groupes des membres (triés)', () => {
    const r = resolveGroupes({ groupeNames: [], employes, profiles })
    expect(r.map(g => g.nom)).toEqual(['Cuisine', 'Vente'])
  })

  it('jamais de groupe vide même si données partielles', () => {
    expect(resolveGroupes({})).toEqual([])
    expect(resolveGroupes({ profiles: [{ id: 'x', groupe: null, active: true }] })).toEqual([])
  })
})
