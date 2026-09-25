import { describe, it, expect } from 'vitest'
import { estLigneTpe } from './releveBmci'

// Libellés réels, relevés dans la base (supabase/releve_banque_et_libelles.sql) et dans
// l'extrait BMCI de juin lu par l'IA.
describe('estLigneTpe', () => {
  it('reconnaît les formes avec point et numéro', () => {
    expect(estLigneTpe('VIRT RECU LNC.9900887663.00325')).toBe(true)
    expect(estLigneTpe('VIRT RECU LNC.9900322042.00078.L.ET LNC.9900322042.00078')).toBe(true)
  })

  it('reconnaît la forme sans point', () => {
    expect(estLigneTpe('VIR INST RECU LNC 2302795 260713362693 85320260713')).toBe(true)
  })

  it('reconnaît « VIRT RECU LNC » tout court', () => {
    // Les deux lignes que l'outil de vérification proposait d'ajouter à tort (9 442 et
    // 2 226 dh, juin) : l'ancien filtre exigeait « LNC. » suivi d'un chiffre.
    expect(estLigneTpe('VIRT RECU LNC')).toBe(true)
  })

  it('reconnaît Lanacash et TPE', () => {
    expect(estLigneTpe('VIRT RECU Lanacash.................')).toBe(true)
    expect(estLigneTpe('TPE.9900887663')).toBe(true)
  })

  it('laisse passer les virements de clientes', () => {
    expect(estLigneTpe('VIRT RECU MME LILIA BENWAHOUD')).toBe(false)
    expect(estLigneTpe('VIR INST RECU ZOUBIDA EL BOUSS')).toBe(false)
    expect(estLigneTpe('')).toBe(false)
    expect(estLigneTpe(null)).toBe(false)
  })
})
