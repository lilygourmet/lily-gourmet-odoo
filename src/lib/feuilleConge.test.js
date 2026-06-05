import { describe, it, expect } from 'vitest'
import { calcule } from './feuilleConge'

const emp = { nom: 'Test', poste: 'Pâtissier', cnss: '123', planning_type: 'fixe', planning_jour_off: 'Dimanche' }
// 2026-06-08 = Lundi … 2026-06-12 = Vendredi ; 2026-06-14 = Dimanche

describe('feuilleConge.calcule — décompte', () => {
  it('congé annuel simple : tout en annuel, plage complète', () => {
    const c = calcule({ conge: { date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel' }, emp, solde: null, joursFeries: [] })
    expect(c.nbDec).toBe(5)
    expect(c.recupCount).toBe(0)
    expect(c.annuelCount).toBe(5)
    expect(c.annuelPlage).toEqual({ debut: '2026-06-08', fin: '2026-06-12' })
  })

  it('congé récup pur : tout en récup', () => {
    const c = calcule({ conge: { date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'recup' }, emp, solde: null, joursFeries: [] })
    expect(c.recupCount).toBe(5)
    expect(c.annuelCount).toBe(0)
    expect(c.recupList).toHaveLength(5)
  })

  it('jour de repos (dimanche) non décompté', () => {
    const c = calcule({ conge: { date_debut: '2026-06-08', date_fin: '2026-06-14', type_conge: 'annuel' }, emp, solde: null, joursFeries: [] })
    expect(c.offDates).toContain('2026-06-14')
    expect(c.nbDec).toBe(6) // 7 calendaires − 1 dimanche
  })

  it('jour férié non décompté', () => {
    const c = calcule({
      conge: { date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel' }, emp, solde: null,
      joursFeries: [{ date: '2026-06-10', nom: 'Test férié', type: 'lunaire' }],
    })
    expect(c.ferieDates).toContain('2026-06-10')
    expect(c.nbDec).toBe(4) // 06-10 exclu
    expect(c.annuelCount).toBe(4)
  })
})

describe('feuilleConge.calcule — mélange récup + annuel', () => {
  it('2 jours récup au début, le reste en annuel (plage après la récup)', () => {
    const c = calcule({
      conge: {
        date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel',
        recup_detail: [{ date: '2026-06-08', raison: 'travaille' }, { date: '2026-06-09', raison: 'ferie' }],
      }, emp, solde: null, joursFeries: [],
    })
    expect(c.recupCount).toBe(2)
    expect(c.annuelCount).toBe(3)
    expect(c.recupList.map(r => r.raison)).toEqual(['travaille', 'ferie'])
    expect(c.annuelPlage).toEqual({ debut: '2026-06-10', fin: '2026-06-12' })
  })

  it('garde la date du jour travaillé (date_source)', () => {
    const c = calcule({
      conge: {
        date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel',
        recup_detail: [{ date: '2026-06-08', raison: 'travaille', date_source: '2026-05-25' }],
      }, emp, solde: null, joursFeries: [],
    })
    expect(c.recupList[0].source).toBe('2026-05-25')
    expect(c.recupList[0].raison).toBe('travaille')
  })

  it('récup + annuel = total décompté (cohérence)', () => {
    const c = calcule({
      conge: {
        date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel',
        recup_detail: [{ date: '2026-06-08', raison: 'travaille' }],
      }, emp, solde: null, joursFeries: [],
    })
    expect(c.recupCount + c.annuelCount).toBe(c.nbDec)
  })
})

describe('feuilleConge.calcule — split du solde', () => {
  const solde = { dispo: 10, recup: 3, prisType: { recup: 0, autre: 0 }, events: { detail: [] } }

  it('après = annuel + récup ; avant = après + jours de ce congé', () => {
    const c = calcule({
      conge: {
        date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel',
        recup_detail: [{ date: '2026-06-08', raison: 'travaille' }, { date: '2026-06-09', raison: 'ferie' }],
      }, emp, solde, joursFeries: [],
    })
    // récup gagnée 3, prise 0 → récup restante 3 ; annuel restant 10−3 = 7
    expect(c.recupRestApres).toBe(3)
    expect(c.annuelRestApres).toBe(7)
    expect(c.annuelRestApres + c.recupRestApres).toBe(c.soldeApres) // = dispo 10
    // avant : on rajoute la part de ce congé (récup 2, annuel 3)
    expect(c.recupRestAvant).toBe(5)
    expect(c.annuelRestAvant).toBe(10)
    expect(c.annuelRestAvant + c.recupRestAvant).toBe(c.soldeAvant) // = 10 + 5 = 15
  })

  it('allocations « autre » comptent comme récup gagnée', () => {
    const s = { dispo: 12, recup: 1, prisType: { recup: 0, autre: 0 }, events: { detail: [{ type: 'autre', jours: 4, applicable: true }] } }
    const c = calcule({ conge: { date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel' }, emp, solde: s, joursFeries: [] })
    // récup gagnée = 4 (autre) + 1 (pointage) = 5
    expect(c.recupRestApres).toBe(5)
    expect(c.annuelRestApres).toBe(7) // 12 − 5
  })

  it('sans solde fourni : pas de split (null), pas d\'erreur', () => {
    const c = calcule({ conge: { date_debut: '2026-06-08', date_fin: '2026-06-12', type_conge: 'annuel' }, emp, solde: null, joursFeries: [] })
    expect(c.soldeApres).toBeNull()
    expect(c.recupRestApres).toBeNull()
    expect(c.annuelRestApres).toBeNull()
  })
})
