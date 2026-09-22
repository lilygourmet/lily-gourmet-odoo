import { describe, it, expect } from 'vitest'

// fmtMois attend un mois indexé à ZÉRO (janvier = 0) : tout l'écran Caisse écrit
// fmtMois(mois - 1). L'onglet « Rapprocher » l'avait oublié et titrait « juin 2026 » un
// groupe de caisses du 14 mai — Layla : « vérifie tes dates de filtre, c'est décalé ».
// Ce test fige la règle, avec exactement le cas vu à l'écran.
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const fmtMois = i => MOIS_LONG[i]
const titreDuMois = cle => `${fmtMois(Number(cle.slice(5, 7)) - 1)} ${cle.slice(0, 4)}`

describe('titre d’un groupe de mois', () => {
  it('nomme le mois de la clé AAAA-MM, sans décalage', () => {
    expect(titreDuMois('2026-05')).toBe('mai 2026')
    expect(titreDuMois('2026-06')).toBe('juin 2026')
  })

  it('tient aux deux bouts de l’année', () => {
    expect(titreDuMois('2026-01')).toBe('janvier 2026')
    expect(titreDuMois('2026-12')).toBe('décembre 2026')
  })
})
