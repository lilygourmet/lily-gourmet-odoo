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
import { etatFeuille, aDeclarer, aDonner, aReprendre, enRetour, depuis, lienFeuille, nouvelId, cheminDe, resteDeLaCascade, ingredientsSortis, quantitesImposees } from './feuilles'

const imprimee = { id: 'a', imprime_le: '2026-09-19T08:00:00Z' }
const donnee = { ...imprimee, id: 'b', donne_le: '2026-09-19T09:00:00Z' }
const declaree = { ...donnee, id: 'c', declare_le: '2026-09-19T10:00:00Z', declare_qty: 8 }
const renduee = { ...donnee, id: 'd', pas_faite_le: '2026-09-19T10:00:00Z' }

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

  it('une fournée RENDUE à l’économe s’efface', () => {
    // ⚠️ C'est la SEULE sortie sans déclaration (Layla, 2026-09-20). Une
    // fournée qu'on n'a pas eu le temps de faire, elle, reste due : « c'est
    // systématique gardé », la crème attend au frigo et le travail se fera.
    expect(etatFeuille(renduee)).toBe('pas-faite')
    expect(aDeclarer([renduee])).toEqual([])
  })

  it('une fournée pas encore faite RESTE due, sans rien cliquer', () => {
    // Personne n'a à dire « pas faite » : tant qu'elle n'est ni déclarée ni
    // rendue, elle réclame.
    expect(aDeclarer([donnee]).map(f => f.id)).toEqual(['b'])
  })

  it('la liste de l’économe ne montre que ce qu’il n’a pas donné', () => {
    expect(aDonner([imprimee, donnee, declaree]).map(f => f.id)).toEqual(['a'])
  })
})

// ============================================================
// LA CASCADE DE LA TARTE CITRON GINGEMBRE — le cas réel de Layla.
//
// « J'ai pas donné la MP et c'est parti déjà dans déclarer. Ça ne doit partir
// que si l'économe a scanné. Si les autres MP ne sont pas scannés, ça part
// pas » (2026-09-19).
//
// Quatre feuilles, une seule impression :
//   • la crème et la pâte du fond DEMANDENT de la matière ;
//   • le fond 23 cm et la tarte ne demandent rien — ils se font AVEC les deux
//     premières. Les rendre dues tout de suite, c'était réclamer un travail
//     qui ne pouvait pas avoir commencé.
// ============================================================
describe('la cascade de la tarte', () => {
  const L = 'liasse-tarte'
  const creme = { id: 'creme', liasse: L, sans_economat: false }
  const pate = { id: 'pate', liasse: L, sans_economat: false }
  const fond = { id: 'fond', liasse: L, sans_economat: true }
  const tarte = { id: 'tarte', liasse: L, sans_economat: true }
  const donne = f => ({ ...f, donne_le: '2026-09-19T09:00:00Z', donne_par: 'eco' })
  const ids = l => aDeclarer(l).map(f => f.id).sort()

  it('juste après l’impression, RIEN n’est dû', () => {
    // ⚠️ Pas même la tarte : sa crème n'a pas encore été servie.
    expect(aDeclarer([creme, pate, fond, tarte])).toEqual([])
  })

  it('l’économe sert la crème : elle seule devient due', () => {
    expect(ids([donne(creme), pate, fond, tarte])).toEqual(['creme'])
  })

  it('il sert la dernière demande : le fond et la tarte suivent', () => {
    expect(ids([donne(creme), donne(pate), fond, tarte]))
      .toEqual(['creme', 'fond', 'pate', 'tarte'])
  })

  it('une demande RENDUE ne bloque plus les autres', () => {
    // La pâte est revenue à l'économe : elle n'attend plus rien de lui, donc
    // elle ne doit pas retenir le reste de la cascade en otage.
    const pateAbandonnee = { ...pate, pas_faite_le: '2026-09-19T09:30:00Z' }
    expect(ids([donne(creme), pateAbandonnee, fond, tarte]))
      .toEqual(['creme', 'fond', 'tarte'])
  })

  it('une cascade qui ne demande RIEN est due dès l’impression', () => {
    // Tout était déjà au frigo : personne n'a rien à servir.
    // « Si une cascade est imprimée et qu'elle n'a pas de MP, elle doit aller
    // directement dans À déclarer » (Layla).
    expect(ids([fond, tarte])).toEqual(['fond', 'tarte'])
  })

  it('l’économe ne voit QUE ce qu’il doit servir', () => {
    // Le fond et la tarte ne lui demandent rien : ils n'ont rien à faire dans
    // sa liste, il ne pourrait rien en faire.
    expect(aDonner([creme, pate, fond, tarte]).map(f => f.id)).toEqual(['creme', 'pate'])
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


// ⚠️ « Ça ne m'emmène encore pas vers le produit » (Layla, 2026-09-20). Les
// papiers imprimés AVANT le chemin n'en ont pas — et ils se ressemblent tous
// sur le plan de travail. Sans repli, les scanner renvoyait à l'accueil.
describe('par où rouvrir une feuille', () => {
  it('prend le chemin complet quand il existe', () => {
    const chemin = ['SM- Cadre', 'SM. Creme au Beurre', 'SM. Creme Citron']
    expect(cheminDe({ produit: 'SM. Creme Citron', pour: 'SM- Cadre', chemin })).toEqual(chemin)
  })

  it('à défaut, descend du gâteau vers l’article', () => {
    // Vérifié sur les vraies données de Layla : 8 vieux papiers sur 10
    // retombent juste ainsi.
    expect(cheminDe({ produit: 'SM. Creme Citron', pour: 'SM- Cadre' }))
      .toEqual(['SM- Cadre', 'SM. Creme Citron'])
  })

  it('un gâteau s’ouvre seul : il est au catalogue', () => {
    expect(cheminDe({ produit: 'SM- Cadre', pour: 'SM- Cadre' })).toEqual(['SM- Cadre'])
    expect(cheminDe({ produit: 'SM- Cadre' })).toEqual(['SM- Cadre'])
  })
})


// ============================================================
// LE RETOUR : le pâtissier décide, l'économe confirme.
//
// « Si je veux faire un retour, c'est le pâtissier qui décide. Et quand ça
// retourne, ça va dans Donné, jusqu'à ce qu'il clique retourné » (Layla,
// 2026-09-20).
// ============================================================
describe('rendre de la marchandise', () => {
  const donnee2 = { id: 'x', donne_le: '2026-09-20T09:00:00Z', donne_par: 'eco' }
  const rendue2 = { ...donnee2, retour_le: '2026-09-20T11:00:00Z', retour_par: 'pat' }
  const recuperee = { ...rendue2, pas_faite_le: '2026-09-20T11:30:00Z', motif: 'retournee' }

  // ⚠️ Le scan au comptoir est ANONYME : `donne_par` reste vide. Se fier à lui,
  // c'était faire disparaître le bouton « Je rends » dès que la marchandise
  // avait été donnée par le QR (Layla, 2026-09-20).
  it('une fournée donnée AU COMPTOIR reste rendable', () => {
    const parLeQr = { id: 'q', donne_le: '2026-09-20T09:00:00Z', donne_par: null }
    expect(aDeclarer([parLeQr]).map(f => f.id)).toEqual(['q'])
    expect(aReprendre([parLeQr]).map(f => f.id)).toEqual(['q'])
  })

  it('tant qu’elle n’est pas rendue, c’est au pâtissier de déclarer', () => {
    expect(aDeclarer([donnee2]).map(f => f.id)).toEqual(['x'])
    expect(enRetour([donnee2])).toEqual([])
  })

  it('rendue : elle quitte « À déclarer » et attend l’économe', () => {
    // Le pâtissier n'a plus rien à en faire.
    expect(aDeclarer([rendue2])).toEqual([])
    expect(enRetour([rendue2]).map(f => f.id)).toEqual(['x'])
  })

  it('elle ne traîne plus dans « sorti de la réserve »', () => {
    // Sinon l'économe la verrait deux fois : dans ce qu'il attend, et dans ce
    // qui est dehors.
    expect(aReprendre([rendue2])).toEqual([])
  })

  it('l’économe confirme : tout se referme', () => {
    expect(enRetour([recuperee])).toEqual([])
    expect(aDeclarer([recuperee])).toEqual([])
    expect(etatFeuille(recuperee)).toBe('pas-faite')
  })
})


// ⚠️ « Qu'allons-nous faire avec les articles mère ? » (Layla, 2026-09-20).
// Rendre la crème laissait le GÂTEAU dans « À déclarer » — une ligne que le
// verrou empêchait de déclarer, qui réclamait sans qu'on puisse rien en faire.
describe('ce qu’un retour emporte avec lui', () => {
  const L = 'liasse'
  const creme = { id: 'creme', liasse: L, donne_le: 'hier' }
  const genoise = { id: 'genoise', liasse: L, donne_le: 'hier' }
  const gateau = { id: 'gateau', liasse: L, sans_economat: true }
  const faite = { id: 'faite', liasse: L, donne_le: 'hier', declare_le: 'ce matin' }
  const ailleurs = { id: 'ailleurs', liasse: 'autre', donne_le: 'hier' }
  const tout = [creme, genoise, gateau, faite, ailleurs]

  it('emporte le gâteau et les autres composants de SA cascade', () => {
    expect(resteDeLaCascade(tout, creme).map(f => f.id).sort()).toEqual(['gateau', 'genoise'])
  })

  it('ne touche JAMAIS à ce qui est déjà déclaré', () => {
    // C'est du travail fait : il reste fait.
    expect(resteDeLaCascade(tout, creme).map(f => f.id)).not.toContain('faite')
  })

  it('ne déborde pas sur une autre cascade', () => {
    expect(resteDeLaCascade(tout, creme).map(f => f.id)).not.toContain('ailleurs')
  })

  it('ne propose rien quand la feuille est seule', () => {
    expect(resteDeLaCascade([creme], creme)).toEqual([])
  })

  it('ne repropose pas ce qui est déjà en retour', () => {
    const dejaRendue = { ...genoise, retour_le: 'tout à l’heure' }
    expect(resteDeLaCascade([creme, dejaRendue, gateau], creme).map(f => f.id)).toEqual(['gateau'])
  })
})


// ⚠️ « Quand c'est figé, imprimé et ingrédient donné, ça reste figé — impossible
// de réinitialiser à moins qu'on retourne les ingrédients » (Layla,
// 2026-09-20). Ce qui est SORTI de la fournée, lui, reste toujours libre.
describe('ce qui fige le prévu pour de bon', () => {
  const p = 'SM. Creme Citron'
  it('la matière est sortie : le chiffre est engagé', () => {
    expect(ingredientsSortis([{ produit: p, donne_le: 'ce matin' }], p)).toBe(true)
  })

  it('imprimé mais pas donné : rien n’est engagé', () => {
    expect(ingredientsSortis([{ produit: p }], p)).toBe(false)
  })

  it('rendue : le chiffre se rouvre', () => {
    // C'est LE seul chemin : on rend la marchandise, on reprend la main.
    expect(ingredientsSortis([{ produit: p, donne_le: 'ce matin', retour_le: 'midi' }], p)).toBe(false)
  })

  it('déjà déclarée : plus rien à figer', () => {
    expect(ingredientsSortis([{ produit: p, donne_le: 'ce matin', declare_le: 'midi' }], p)).toBe(false)
  })

  it('la sortie d’un AUTRE article ne fige rien', () => {
    expect(ingredientsSortis([{ produit: 'SM. Genoise', donne_le: 'ce matin' }], p)).toBe(false)
  })
})


// ⚠️ « Attention, les ingrédients ne se sont pas figés » (Layla, 2026-09-20).
// Un verrou qui fige le mauvais chiffre ne sert à rien : c'est le nombre du
// PAPIER qui s'impose, celui pour lequel l'économe a servi.
describe('le chiffre que la matière sortie impose', () => {
  it('reprend la quantité écrite sur la feuille donnée', () => {
    const f = [{ produit: 'SM. Creme', qty_prevue: 2589, donne_le: 'ce matin' }]
    expect(quantitesImposees(f)).toEqual({ 'SM. Creme': 2589 })
  })

  it('n’impose rien tant que rien n’est sorti', () => {
    expect(quantitesImposees([{ produit: 'SM. Creme', qty_prevue: 2589 }])).toEqual({})
  })

  it('n’impose plus rien une fois rendue', () => {
    const f = [{ produit: 'SM. Creme', qty_prevue: 2589, donne_le: 'ce matin', retour_le: 'midi' }]
    expect(quantitesImposees(f)).toEqual({})
  })

  it('n’impose plus rien une fois déclarée', () => {
    const f = [{ produit: 'SM. Creme', qty_prevue: 2589, donne_le: 'ce matin', declare_le: 'midi' }]
    expect(quantitesImposees(f)).toEqual({})
  })

  it('ignore une feuille sans quantité', () => {
    expect(quantitesImposees([{ produit: 'SM. Creme', donne_le: 'ce matin' }])).toEqual({})
  })
})
