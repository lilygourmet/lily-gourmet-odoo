// ============================================================
// LA RÈGLE DE LAYLA (2026-09-19), et c'est elle qui l'a trouvée :
//
//   « On peut imprimer et ne pas prendre la marchandise, donc ne pas faire.
//     Quand l'économe marque comme pris = la déclaration du pâtissier doit
//     être faite. »
//
// Autrement dit : IMPRIMER N'ENGAGE À RIEN. C'est le geste de l'économe qui
// fait naître la dette. Tout ce fichier ne vérifie que ça.
// ============================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { etatFeuille, aDeclarer, aDonner, depuis, lienFeuille, nouvelId } from './feuilles'

const imprimee = { id: 'a', imprime_le: '2026-09-19T08:00:00Z' }
const donnee = { ...imprimee, id: 'b', donne_le: '2026-09-19T09:00:00Z' }
const declaree = { ...donnee, id: 'c', declare_le: '2026-09-19T10:00:00Z', declare_qty: 8 }
const pasFaite = { ...donnee, id: 'd', pas_faite_le: '2026-09-19T10:00:00Z' }

describe('ce qui rend une déclaration due', () => {
  it('imprimer n’engage à rien', () => {
    expect(etatFeuille(imprimee)).toBe('imprimee')
    // ⚠️ Le cœur de la règle : une feuille imprimée n'est PAS une dette.
    expect(aDeclarer([imprimee])).toEqual([])
  })

  it('c’est le geste de l’économe qui fait naître la dette', () => {
    expect(etatFeuille(donnee)).toBe('a-declarer')
    expect(aDeclarer([imprimee, donnee]).map(f => f.id)).toEqual(['b'])
  })

  it('ce qui est déclaré disparaît de la liste', () => {
    // « Que ce qui reste à déclarer » : rien à faire, rien à cliquer.
    expect(etatFeuille(declaree)).toBe('declaree')
    expect(aDeclarer([donnee, declaree]).map(f => f.id)).toEqual(['b'])
  })

  it('« pas faite » est une réponse, pas un oubli', () => {
    // Sans cette porte de sortie, ils cesseraient de passer par l'économe —
    // et on perdrait la trace qu'on cherche à construire.
    expect(etatFeuille(pasFaite)).toBe('pas-faite')
    expect(aDeclarer([pasFaite])).toEqual([])
  })

  it('la liste de l’économe ne montre que ce qu’il n’a pas donné', () => {
    expect(aDonner([imprimee, donnee, declaree]).map(f => f.id)).toEqual(['a'])
  })
})

describe('les deux papiers, les deux QR', () => {
  it('celui de l’économe et celui du pâtissier ne mènent pas au même écran', () => {
    const econome = lienFeuille('xyz', true)
    const patissier = lienFeuille('xyz')
    expect(econome).toMatch(/feuille=xyz/)
    expect(econome).toMatch(/don=1/)
    // Même jeton, même feuille — mais l'adresse dit lequel des deux gestes.
    expect(patissier).toMatch(/feuille=xyz/)
    expect(patissier).not.toMatch(/don=1/)
  })

  it('chaque feuille reçoit un jeton qui lui est propre', () => {
    const vus = new Set(Array.from({ length: 50 }, () => nouvelId()))
    expect(vus.size).toBe(50)
  })
})

describe('depuis combien de temps', () => {
  it('dit les minutes, puis les heures, puis les jours', () => {
    const ilYA = min => new Date(Date.now() - min * 60000).toISOString()
    expect(depuis(ilYA(40))).toBe('40 min')
    expect(depuis(ilYA(300))).toBe('5 h')
    expect(depuis(ilYA(60 * 30))).toBe('1 j')
  })

  it('ne dit rien quand il n’y a pas de date', () => {
    expect(depuis(null)).toBe('')
  })
})
