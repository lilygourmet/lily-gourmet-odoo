import { describe, it, expect, vi } from 'vitest'

// calculSoldeConges importe supabase, mais on ne l'appelle jamais ici
// (toutes les données sont fournies via `prefetched` + `congesValides`).
vi.mock('./supabase', () => ({ supabase: {} }))

const { calculSoldeConges } = await import('./conges')

describe('calculSoldeConges — congé sans solde', () => {
  const emp = { id: 1, date_entree: '2020-01-01', date_anciennete: '2020-01-01' }
  const refDate = '2026-07-13'

  // Allocation annuelle figée à 7,5 j + 1 j de récup (type "autre", consommable
  // depuis le 05/07) → total allocations 8,5 j (comme le cas HANANE réel).
  const prefetched = {
    allocsByEmp: new Map([[1, [
      { employe_id: 1, annee: 2026, type: 'annuel', jours: 7.5, statut: 'valide', date_evt: null },
      { employe_id: 1, annee: 2026, type: 'autre',  jours: 1,   statut: 'valide', date_evt: '2026-07-05' },
    ]]]),
    recupByEmp: new Map([[1, 0]]),
    feriesSet: new Set(),
  }

  const congesValides = [
    // 5 j de congé annuel pris
    { employe_id: 1, statut: 'valide', type_conge: 'annuel', date_debut: '2026-04-01', date_fin: '2026-04-05', jours_decomptes: 5 },
    // 10 j de congé SANS SOLDE : ne doit PAS être déduit du solde payé
    { employe_id: 1, statut: 'valide', type_conge: 'Sans solde', date_debut: '2026-05-28', date_fin: '2026-06-06', jours_decomptes: 10 },
  ]

  it('le congé sans solde n\'est pas compté dans « pris » ni déduit du dispo', async () => {
    const s = await calculSoldeConges(emp, congesValides, refDate, prefetched)
    expect(s.totalAllocations).toBeCloseTo(8.5)
    expect(s.pris).toBeCloseTo(5)              // seulement l'annuel, pas les 10 j sans solde
    expect(s.sansSoldePris).toBe(10)           // suivi à part, informatif
    expect(s.dispo).toBeCloseTo(3.5)           // 8,5 − 5 (et NON 8,5 − 5 − 10 = 0)
  })
})

describe('calculSoldeConges — congé validé dans le futur', () => {
  const emp = { id: 1, date_entree: '2020-01-01', date_anciennete: '2020-01-01' }
  const refDate = '2026-07-13'

  const prefetched = {
    allocsByEmp: new Map([[1, [
      { employe_id: 1, annee: 2026, type: 'annuel', jours: 10, statut: 'valide', date_evt: null },
    ]]]),
    recupByEmp: new Map([[1, 0]]),
    feriesSet: new Set(),
  }

  it('un congé validé qui commence plus tard est déjà retiré du solde', async () => {
    const conges = [
      { employe_id: 1, statut: 'valide', type_conge: 'annuel', date_debut: '2026-09-01', date_fin: '2026-09-05', jours_decomptes: 5 },
    ]
    const s = await calculSoldeConges(emp, conges, refDate, prefetched)
    expect(s.pris).toBeCloseTo(5)
    expect(s.dispo).toBeCloseTo(5)
  })

  it('un congé validé à cheval sur aujourd\'hui compte en entier', async () => {
    const conges = [
      { employe_id: 1, statut: 'valide', type_conge: 'annuel', date_debut: '2026-07-10', date_fin: '2026-07-17', jours_decomptes: 8 },
    ]
    const s = await calculSoldeConges(emp, conges, refDate, prefetched)
    expect(s.pris).toBeCloseTo(8)
    expect(s.dispo).toBeCloseTo(2)
  })

  it('un congé de l\'année suivante n\'entame pas le solde de cette année', async () => {
    const conges = [
      { employe_id: 1, statut: 'valide', type_conge: 'annuel', date_debut: '2027-02-01', date_fin: '2027-02-05', jours_decomptes: 5 },
    ]
    const s = await calculSoldeConges(emp, conges, refDate, prefetched)
    expect(s.pris).toBeCloseTo(0)
    expect(s.dispo).toBeCloseTo(10)
  })

  it('une simple DEMANDE non validée n\'entame pas le solde', async () => {
    const conges = [
      { employe_id: 1, statut: 'demande', type_conge: 'annuel', date_debut: '2026-09-01', date_fin: '2026-09-05', jours_decomptes: 5 },
    ]
    const s = await calculSoldeConges(emp, conges, refDate, prefetched)
    expect(s.pris).toBeCloseTo(0)
    expect(s.dispo).toBeCloseTo(10)
  })
})

describe('calculSoldeConges — un solde négatif doit rester négatif', () => {
  const emp = { id: 1, date_entree: '2020-01-01', date_anciennete: '2020-01-01' }
  const refDate = '2026-08-19'
  const prefetched = {
    allocsByEmp: new Map([[1, [
      { employe_id: 1, annee: 2026, type: 'annuel', jours: 10, statut: 'valide', date_evt: null },
      // décompte : conversion d'heures manquantes en récup, au-delà de la récup dispo
      { employe_id: 1, annee: 2026, type: 'autre', jours: -4, statut: 'valide', date_evt: '2026-07-01' },
    ]]]),
    recupByEmp: new Map([[1, 0]]),
    feriesSet: new Set(),
  }

  it('le dépassement est affiché tel quel, pas ramené à zéro', async () => {
    const conges = [
      { employe_id: 1, statut: 'valide', type_conge: 'annuel', date_debut: '2026-04-01', date_fin: '2026-04-08', jours_decomptes: 8 },
    ]
    const s = await calculSoldeConges(emp, conges, refDate, prefetched)
    // 10 alloués − 4 de décompte − 8 pris = −2
    expect(s.dispo).toBeCloseTo(-2)
  })
})
