import { describe, it, expect } from 'vitest'
import { libelleDesLignes } from './releveDoublons'

// Vécu : deux virements de 392 dh le même jour, tous deux au nom de FARHANE HAJAR. Coupé
// à 70 caractères, le second perdait son nom PILE à la coupe — on croyait que la banque
// ne l'avait pas écrit, et on cherchait un bug de lecture du PDF qui n'existait pas.
const L1 = '2026-07-17 · VIR INST RECU 2321144 215469570/1XXXXX FARHANE HAJAR'
const L2 = '2026-07-17 · VIR INST RECU 2324371 706376617404 0072026071770637661740 FARHANE HAJAR 007013MAD00000120'

describe('libelleDesLignes', () => {
  it('garde le nom de la cliente sur les deux lignes', () => {
    const out = libelleDesLignes([L1, L2])
    expect(out).toContain('2321144')
    expect(out.match(/FARHANE HAJAR/g)).toHaveLength(2)
  })

  it('ne dépasse jamais les 300 caractères du champ', () => {
    const out = libelleDesLignes([L2, L2, L2])
    expect(out.length).toBeLessThanOrEqual(300)
    expect(out.split('  |  ')).toHaveLength(3)
  })

  it('garde le préfixe quand il n’y a aucune ligne', () => {
    expect(libelleDesLignes([], '🔗 2 virements = 1 ligne · ')).toBe('🔗 2 virements = 1 ligne · ')
    expect(libelleDesLignes([])).toBe(null)
  })
})
