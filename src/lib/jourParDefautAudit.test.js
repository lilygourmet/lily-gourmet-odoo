// ============================================================
// SUR QUELLE JOURNÉE S'OUVRE LE RAPPORT D'ÉCARTS.
//
// « Le premier rapport qu'on voit quand on ouvre, c'est de quel jour ?
// Mentionner la date. Ça doit être toujours le rapport de la veille, vu que la
// journée n'est pas clôturée » (Layla, 2026-09-22).
//
// C'est une question d'horaire : le café compte à 19 h, la journée se clôt à
// 23 h, et la personne qui traite les écarts travaille LE MATIN. À 9 h, la
// journée du jour est vide — l'écran s'ouvrait donc sur rien, à charge pour
// elle de comprendre qu'il fallait reculer d'un jour.
//
// ⚠️ Mais pas « hier » en dur : la dernière journée CLÔTURÉE.
// ============================================================
import { describe, it, expect } from 'vitest'

/** La règle de l'écran, sortie ici pour être jugée seule. */
const jourAOuvrir = (jours, veille) => {
  const clos = (jours || []).find(x => x.status === 'submitted' || x.status === 'audited')
  return clos ? clos.day : veille
}

const VEILLE = '2026-09-21'

describe('la journée ouverte par défaut', () => {
  it('c’est la veille quand celle du jour n’est pas clôturée', () => {
    const jours = [
      { day: '2026-09-22', status: 'open' },
      { day: '2026-09-21', status: 'submitted' },
    ]
    expect(jourAOuvrir(jours, VEILLE)).toBe('2026-09-21')
  })

  // ⚠️ Elle regarde parfois le soir, après la clôture : là, c'est bien la
  // journée du jour qu'il faut montrer.
  it('mais celle du jour si elle est déjà clôturée', () => {
    const jours = [
      { day: '2026-09-22', status: 'submitted' },
      { day: '2026-09-21', status: 'audited' },
    ]
    expect(jourAOuvrir(jours, VEILLE)).toBe('2026-09-22')
  })

  // ⚠️ Un jour sans comptage ne doit pas ouvrir sur du vide : on remonte.
  it('remonte à avant-hier si hier n’a jamais été comptée', () => {
    const jours = [
      { day: '2026-09-22', status: 'open' },
      { day: '2026-09-21', status: 'open' },
      { day: '2026-09-20', status: 'audited' },
    ]
    expect(jourAOuvrir(jours, VEILLE)).toBe('2026-09-20')
  })

  it('et retombe sur la veille quand on ne sait rien', () => {
    expect(jourAOuvrir([], VEILLE)).toBe(VEILLE)
    expect(jourAOuvrir(null, VEILLE)).toBe(VEILLE)
  })
})

// ⚠️ La date doit être ÉCRITE : ouvrir sur la veille sans le dire, c'est lire
// les chiffres d'hier en croyant lire ceux d'aujourd'hui.
describe('la date affichée', () => {
  const ecrire = (day, aujourdhui, veille) => {
    const d = new Date(day).toLocaleDateString('fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const q = day === aujourdhui ? 'aujourd’hui' : day === veille ? 'hier' : null
    return q ? `${d} · ${q}` : d
  }

  it('porte le jour, le mois ET l’année', () => {
    expect(ecrire('2026-09-21', '2026-09-22', '2026-09-21'))
      .toMatch(/lundi 21 septembre 2026/)
  })

  it('dit « hier » quand c’est hier', () => {
    expect(ecrire('2026-09-21', '2026-09-22', '2026-09-21')).toContain('hier')
  })

  it('dit « aujourd’hui » quand c’est aujourd’hui', () => {
    expect(ecrire('2026-09-22', '2026-09-22', '2026-09-21')).toContain('aujourd’hui')
  })

  it('et ne dit rien de plus pour une date ancienne', () => {
    const t = ecrire('2026-09-10', '2026-09-22', '2026-09-21')
    expect(t).not.toContain('hier')
    expect(t).toMatch(/10 septembre 2026/)
  })
})
