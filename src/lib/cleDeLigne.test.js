import { describe, it, expect } from 'vitest'
import { cleDeLigne } from './releveDoublons'

// La clé est ce qui empêche un relevé relu de créer des doublons — la hantise de Layla.
// Elle doit donc être IDENTIQUE d'une lecture à l'autre, et c'est aussi ce qui permet de
// comparer un PDF à la base sans rien réimporter.
const ligne = (label, credit = 1000, dateIso = '2026-06-04') => ({ label, credit, dateIso })

describe('cleDeLigne', () => {
  it('donne la même clé à la même opération relue', () => {
    const l = ligne('VIR INST RECU ZOUBIDA EL BOUSS 2138384 260604167682')
    expect(cleDeLigne(l)).toBe(cleDeLigne(l))
  })

  it('ignore la date : les deux documents de la banque ne datent pas pareil', () => {
    const label = 'VIR INST RECU ZOUBIDA EL BOUSS 2138384'
    expect(cleDeLigne(ligne(label, 1000, '2026-06-04')))
      .toBe(cleDeLigne(ligne(label, 1000, '2026-06-07')))
  })

  it('sépare deux opérations de montants différents', () => {
    const label = 'VIR INST RECU MME SELMA BENOMAR 2138384'
    expect(cleDeLigne(ligne(label, 500))).not.toBe(cleDeLigne(ligne(label, 700)))
  })

  it('garde les deux quand le relevé porte deux fois la même opération', () => {
    const vues = new Set()
    const l = ligne('VERSEMENT ESPECES')
    expect(cleDeLigne(l, vues)).not.toBe(cleDeLigne(l, vues))
  })

  it('sans numéro, se replie sur la date et le libellé', () => {
    expect(cleDeLigne(ligne('VERSEMENT ESPECES'))).toBe('2026-06-04|100000|VERSEMENT ESPECES')
  })
})
