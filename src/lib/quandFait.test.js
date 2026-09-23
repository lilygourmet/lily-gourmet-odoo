// « quand ça marque comme fait dans fabrication annexe/CD et dans à valider,
// noter le jour et l'heure » (Layla, 2026-09-19).
//
// L'heure seule ne suffisait pas : un gâteau monté lundi se valide parfois
// mercredi, et « 14h02 » ne disait pas lequel des deux jours.
import { describe, it, expect } from 'vitest'
import { quandFait } from './jourLisible'
import { decalageMaroc } from './fuseauMaroc'

// ⚠️ CES TESTS FIGEAIENT « UTC+1 » (Layla, 2026-09-23 : « on est passé à
// GMT 0 »). Ils disent maintenant la même vérité, mais calculée depuis le
// réglage : ils resteront justes au prochain changement d'heure.
const DEC = decalageMaroc(new Date('2026-09-19T12:00:00Z'))
const hM = (hUtc, min) => `${String(hUtc + DEC).padStart(2, '0')}h${min}`

describe('quandFait', () => {
  it('donne le jour ET l’heure', () => {
    expect(quandFait('2026-09-19T13:02:00.000Z')).toBe(`19/09 à ${hM(13, '02')}`)
  })

  // ⚠️ Sans le fuseau, une déclaration de fin de soirée s'affichait le
  // LENDEMAIN. Le jour doit tenir, quel que soit le décalage.
  it('compte à l’heure du MAROC : la fin de soirée reste le même jour', () => {
    expect(quandFait('2026-09-19T22:30:00.000Z')).toBe(`19/09 à ${hM(22, '30')}`)
  })

  it('un fuseau déjà écrit dans la date est respecté', () => {
    // 14h02 en UTC+1, c'est 13h02 UTC : on le relit à l'heure du Maroc.
    expect(quandFait('2026-09-19T14:02:00+01:00')).toBe(`19/09 à ${hM(13, '02')}`)
  })

  it('rien à dire quand il n’y a pas de date', () => {
    expect(quandFait(null)).toBe('')
    expect(quandFait('')).toBe('')
    expect(quandFait('n’importe quoi')).toBe('')
  })
})
