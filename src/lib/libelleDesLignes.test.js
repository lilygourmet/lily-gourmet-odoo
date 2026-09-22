import { describe, it, expect } from 'vitest'
import { libelleDesLignes } from './releveDoublons'
import { prefixeSupposition } from './releveBmci'

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

// Le préfixe dit CE QUE LE CALCUL A SUPPOSÉ. Le 🔗 n'est pas décoratif : le code le relit
// (pré-marquage des lignes prises, annulation, fenêtre « Grouper 2 caisses »). Il n'était
// écrit qu'à l'import — une relance l'effaçait, et la caisse perdait le sens de sa
// proposition.
describe('prefixeSupposition', () => {
  it('marque les deux suppositions, et rien quand il n’y en a pas', () => {
    expect(prefixeSupposition({ combined: true })).toContain('🔗')
    expect(prefixeSupposition({ crossMethod: true })).toContain('moyen différent')
    expect(prefixeSupposition({})).toBe('')
  })

  it('survit à la mise en libellé avec ses lignes', () => {
    const out = libelleDesLignes(['2026-06-03 · Versement Espèces 1058'], prefixeSupposition({ crossMethod: true }))
    expect(out.startsWith('⚠️ moyen différent · ')).toBe(true)
    expect(out).toContain('Versement Espèces')
  })
})
