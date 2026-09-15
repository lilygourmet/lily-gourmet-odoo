// LES GÂTEAUX À GANACHER.
//
// « CD- Ganache cakedesign » a son propre ordre chez Odoo et aucun écran ne le
// montrait : la commande S47031, livrée le 5 septembre, avait encore sa
// ganache « confirmée » dix jours après.
//
// Les règles sont de Layla (2026-09-15) : c'est celui qui MONTE qui ganache,
// la ligne paraît dès que la commande est DÉCLARÉE, et « c'est fait » valide
// l'ordre.
import { describe, it, expect } from 'vitest'
import { ganacheAFaire, ganachesParJour, ditLeGateau, ditLePoids } from './ganaches'

// La vraie S47031, relevée dans Odoo.
const s47031 = {
  ordre: 'WHLVP/MO/198507', chocolat: 'Chocolat noir', pers: 5, grammes: 480,
  qty: 1, commande: 'S47031', client: 'Lahlou zahia', quand: '2026-09-05 19:00:00',
  taille: '15 cm', parfum: 'Praliné Amandes caramélisées',
}
// Et la S52682, huit ganaches d'un coup.
const s52682 = {
  ordre: 'WHLVP/MO/200100', chocolat: 'Chocolat noir', pers: 5, grammes: 3840,
  qty: 8, commande: 'S52682', client: 'sofia benslimane', quand: '2026-10-03 12:00:00',
  taille: '15 cm', parfum: 'Praliné Amandes caramélisées',
}

describe('quand la ganache se montre', () => {
  it('PAS tant que son gâteau reste à faire — on ganache après avoir monté', () => {
    const gateaux = [{ name: 'WHLVP/MO/198506', scode: 'S47031' }]
    expect(ganacheAFaire(s47031, gateaux, {})).toBe(false)
  })

  it('dès que le gâteau est déclaré', () => {
    const gateaux = [{ name: 'WHLVP/MO/198506', scode: 'S47031' }]
    expect(ganacheAFaire(s47031, gateaux, { 'WHLVP/MO/198506': true })).toBe(true)
  })

  it('et tout de suite quand le gâteau n’est plus à l’écran', () => {
    // Le cas S47031 : le gâteau a été fait et validé les jours d'avant, il a
    // quitté la liste. Sans cette règle la ganache n'apparaîtrait JAMAIS.
    expect(ganacheAFaire(s47031, [], {})).toBe(true)
  })

  it('il faut que TOUS les gâteaux de la commande soient déclarés', () => {
    const gateaux = [
      { name: 'WHLVP/MO/1', scode: 'S47031' },
      { name: 'WHLVP/MO/2', scode: 'S47031' },
    ]
    expect(ganacheAFaire(s47031, gateaux, { 'WHLVP/MO/1': true })).toBe(false)
    expect(ganacheAFaire(s47031, gateaux, { 'WHLVP/MO/1': true, 'WHLVP/MO/2': true })).toBe(true)
  })

  it('un gâteau d’une AUTRE commande ne la retient pas', () => {
    expect(ganacheAFaire(s47031, [{ name: 'WHLVP/MO/9', scode: 'S99999' }], {})).toBe(true)
  })
})

describe('le rangement par jour', () => {
  it('du plus proche au plus lointain', () => {
    const j = ganachesParJour([s52682, s47031], [], {})
    expect(j.map(([jour]) => jour)).toEqual(['2026-09-05', '2026-10-03'])
    expect(j[0][1]).toHaveLength(1)
  })

  it('n’affiche que celles dont le gâteau est prêt', () => {
    const gateaux = [{ name: 'WHLVP/MO/198506', scode: 'S47031' }]
    const j = ganachesParJour([s52682, s47031], gateaux, {})
    expect(j.map(([jour]) => jour)).toEqual(['2026-10-03'])
  })
})

describe('ce que la ligne dit', () => {
  it('le gâteau, en une ligne', () => {
    expect(ditLeGateau(s47031)).toBe('15 cm · Praliné Amandes caramélisées')
  })

  it('rien quand aucun gâteau ne porte cette taille — l’écran le dira en rouge', () => {
    expect(ditLeGateau({ ...s47031, taille: '', parfum: '' })).toBe('')
  })

  it('le poids, et le compte quand il y en a plusieurs', () => {
    expect(ditLePoids(s47031).replace(/\u202f|\u00a0/g, ' ')).toBe('480 g')
    expect(ditLePoids(s52682).replace(/\u202f|\u00a0/g, ' ')).toBe('8 × 480 g')
  })

  it('et rien du tout quand Odoo ne dit pas le poids', () => {
    expect(ditLePoids({ ...s47031, grammes: 0 })).toBe('')
  })
})
