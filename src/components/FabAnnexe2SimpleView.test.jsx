// @vitest-environment jsdom
// ============================================================
// LE CHEMIN COMPLET, DU DOIGT À ODOO.
//
// « Attention quand tu changes, que ce qu'on a fait ne tombe pas en panne »
// (Layla, 2026-09-11). Les autres tests vérifient les RÈGLES une par une ;
// celui-ci vérifie le CÂBLAGE — ouvrir un article, dire « c'est fait », dire
// combien il en est sorti, et regarder ce qui part vraiment.
//
// C'est là qu'ont vécu les bugs les plus chers de la semaine : la mauvaise
// unité envoyée à Odoo, le chiffre prévu qui retombait, la crème déclarée
// alors qu'elle était au frigo. Chacun a maintenant sa garde ici.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const declarer = vi.fn(async () => ({ produit: 'x', qty: 1, ordre: null, erreur: null }))
const envoyerAValider = vi.fn(async () => ({ produit: 'x', qty: 1, ordre: null, erreur: null }))
const repartirCuve = vi.fn(async () => [])
const relireRecettes = vi.fn(async () => {})
let listesLues = 0

// Le sirop : compté en KILOS chez Odoo, fournée de 5,55 kg.
const sirop = {
  produit: 'SM. sirop Imbibage production KG', libelle: 'Sirop imbibage', unite: 'kg',
  tournee: 5.55, stock: 1.2, dejaFait: 0, reste: 5.55, mini: 0, maxi: 0,
  figes: [], figesNom: 'Monté sur place', ajustements: {}, tailles: [],
  photo: 'E- Tiramisu', etat: 'rupture',
  composants: [{ produit: 'MP- Sucre Granule', unite: 'g', besoin: 2000, stock: 0,
    dejaFait: 0, fabrique: false, ok: true }],
}

// Un gâteau dont la CRÈME se fabrique et manque : le verrou doit tenir.
const gateauBloque = {
  produit: 'SM- Cadre Citron', libelle: 'Cadre citron', unite: 'u',
  tournee: 92, stock: 0, dejaFait: 0, reste: 92, mini: 0, maxi: 0,
  figes: [], figesNom: '', ajustements: {}, tailles: [], photo: '', etat: 'rupture',
  composants: [{ produit: 'SM. Creme Citron', libelle: 'Crème citron', unite: 'g',
    besoin: 2589, stock: 0, dejaFait: 0, fabrique: true, ok: false }],
}

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/auth', () => ({ hasValidJwt: () => true, isAdmin: () => true }))
vi.mock('../lib/fabrication', () => ({ dernierEcran: () => null, garderEcran: () => {} }))
vi.mock('../lib/fabAnnexe', async importOriginal => {
  const vrai = await importOriginal()
  return {
    ...vrai,                                   // les VRAIES règles de calcul
    loadFabAnnexe: async () => { listesLues++; return [sirop] },
    loadToutFabAnnexe: async () => [{ ...sirop, pour: ['E- Tiramisu'] }],
    loadArticlesFabAnnexe: async () => [sirop],
    loadHistoriqueAnnexe: async () => [],
    declarer: (...a) => declarer(...a),
    envoyerAValider: (...a) => envoyerAValider(...a),
    repartirCuve: (...a) => repartirCuve(...a),
    relireRecettes: (...a) => relireRecettes(...a),
  }
})

const { default: FabAnnexe2SimpleView } = await import('./FabAnnexe2SimpleView')

beforeEach(() => {
  localStorage.clear(); declarer.mockClear(); envoyerAValider.mockClear()
  relireRecettes.mockClear(); listesLues = 0
})
afterEach(cleanup)

const ouvrirLaFiche = async () => {
  render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
  await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
  fireEvent.click(screen.getByText('Sirop imbibage'))
  await waitFor(() => expect(screen.getByText("C'est fait")).toBeTruthy())
}

// ============================================================
// ARRIVER PAR LE QR : la fiche doit s'OUVRIR.
//
// « Non, ça n'emmène toujours pas vers l'article. Ça dit que ça le fait mais ça
// ne le fait pas » (Layla, 2026-09-20). Trois tentatives de ma part, trois
// échecs — cette fois on rejoue le geste ici, en entier.
// ============================================================
describe('arriver par le scan', () => {
  it('ouvre la fiche de l’article, pas la liste d’accueil', async () => {
    const { poserLeScan } = await import('../lib/scanEntrant')
    poserLeScan({ chemin: ['SM. sirop Imbibage production KG'], declarer: false })
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    // La fiche, pas la liste : le bouton « C'est fait » n'existe que dedans.
    await waitFor(() => expect(screen.getByText("C'est fait")).toBeTruthy())
  })

  // ⚠️ Un chemin dont une marche ne colle plus ne doit PAS renvoyer à
  // l'accueil : on remonte d'un cran, jusqu'au gâteau s'il le faut.
  // ⚠️ LE VERROU TIENT AUSSI QUAND ON ARRIVE PAR LE QR (Layla, 2026-09-20 :
  // « je scanne d'abord le cadre citron, il me laisse le déclarer alors que
  // rien de la branche n'est validé »). Je déclenchais le geste depuis l'écran
  // du dessus, sans consulter le verrou — qui vit dans la fiche.
  //
  // ⚠️ Un GÂTEAU ne passe pas par « il en est sorti combien » : il part
  // directement. C'est donc la DÉCLARATION qu'on surveille, pas l'écran.
  const avecCreme = dispo => async () => [{ ...gateauBloque,
    composants: [{ ...gateauBloque.composants[0], stock: dispo ? 99999 : 0, ok: !!dispo }] }]

  const scannerLeGateau = async (dispo) => {
    const fab = await import('../lib/fabAnnexe')
    const vrai = fab.loadArticlesFabAnnexe
    fab.loadArticlesFabAnnexe = avecCreme(dispo)
    const { poserLeScan } = await import('../lib/scanEntrant')
    poserLeScan({ chemin: ['SM- Cadre Citron'], declarer: true })
    try {
      render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
      await waitFor(() => expect(screen.getByText('Cadre citron')).toBeTruthy())
      await new Promise(r => setTimeout(r, 150))
    } finally { fab.loadArticlesFabAnnexe = vrai }
  }

  // (un gâteau est un article RACINE : c'est `envoyerAValider` qui part)
  it('ne déclare PAS tout seul un gâteau dont la branche manque', async () => {
    await scannerLeGateau(false)
    expect(envoyerAValider).not.toHaveBeenCalled()
    expect(declarer).not.toHaveBeenCalled()
  })

  it('CONTRÔLE : le même gâteau, crème disponible, part bien tout seul', async () => {
    await scannerLeGateau(true)
    expect(envoyerAValider).toHaveBeenCalled()
  })

  it('un chemin abîmé retombe sur le gâteau, pas sur la liste', async () => {
    const { poserLeScan } = await import('../lib/scanEntrant')
    poserLeScan({ chemin: ['SM. sirop Imbibage production KG', 'SM- Composant disparu'] })
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    await waitFor(() => expect(screen.getByText("C'est fait")).toBeTruthy())
  })

  it('et va DROIT au chiffre quand le QR le demande', async () => {
    const { poserLeScan } = await import('../lib/scanEntrant')
    poserLeScan({ chemin: ['SM. sirop Imbibage production KG'], declarer: true })
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    // « Scanne pour déclarer doit t'emmener direct vers la page de c'est fait »
    await waitFor(() => expect(screen.getByText(/Il en est sorti combien/)).toBeTruthy())
  })
})

describe('le chemin complet', () => {
  it('la fiche s’ouvre sur la fournée, écrite en GRAMMES', async () => {
    await ouvrirLaFiche()
    // 5,55 kg chez Odoo → 5 550 g à l'écran, et le mot « g ».
    expect(screen.getByText(/5.550/)).toBeTruthy()
    expect(screen.getByText('g à faire')).toBeTruthy()
  })

  it('« c’est fait » demande ce qui est sorti, puis déclare dans l’unité de l’ARTICLE', async () => {
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Il en est sorti combien ?')).toBeTruthy())
    fireEvent.click(screen.getByText("C'est bon"))
    await waitFor(() => expect(envoyerAValider).toHaveBeenCalled())
    const [article, sortie] = envoyerAValider.mock.calls[0]
    expect(article.unite).toBe('kg')        // ⚠️ jamais 'g' : c'est l'unité d'Odoo
    expect(sortie).toBeCloseTo(5.55, 3)     // ⚠️ jamais 5 550 : ce serait mille fois trop
  })

  it('le chiffre corrigé au clavier repart juste — en kilos', async () => {
    await ouvrirLaFiche()
    fireEvent.click(screen.getByLabelText('Changer à faire'))
    const touche = t => fireEvent.click(screen.getAllByText(t).find(e => e.tagName === 'BUTTON'))
    touche('3'); touche('0'); touche('0'); touche('0')          // 3 000 g
    fireEvent.click(screen.getByLabelText('Valider le nombre'))
    fireEvent.click(screen.getByText("C'est fait"))
    await waitFor(() => expect(screen.getByText('Il en est sorti combien ?')).toBeTruthy())
    fireEvent.click(screen.getByText("C'est bon"))
    await waitFor(() => expect(envoyerAValider).toHaveBeenCalled())
    expect(envoyerAValider.mock.calls[0][1]).toBeCloseTo(3, 6)
  })

  it('le chiffre décidé est gardé, et « réinitialiser » le rend', async () => {
    await ouvrirLaFiche()
    fireEvent.click(screen.getByLabelText('Plus à faire'))         // 5 550 → 5 600 g
    expect(JSON.parse(localStorage.getItem('lg:annexe2-prevu')).par['SM. sirop Imbibage production KG'].q)
      .toBeCloseTo(5.6, 6)
    fireEvent.click(screen.getByText('réinitialiser'))
    expect(JSON.parse(localStorage.getItem('lg:annexe2-prevu')).par['SM. sirop Imbibage production KG'])
      .toBeUndefined()
  })

  it('rien ne part tant que le travail n’est pas dit fait', async () => {
    await ouvrirLaFiche()
    expect(declarer).not.toHaveBeenCalled()
    expect(envoyerAValider).not.toHaveBeenCalled()
  })
})

// ============================================================
// LE BOUTON « METTRE À JOUR LES RECETTES ».
//
// « je ne veux pas attendre 30 min » (Layla, 2026-09-14). Le serveur garde les
// recettes une demi-heure ; le bouton les lui fait oublier. Mais vider le
// serveur ne suffit PAS : l'écran garde ses fiches déjà ouvertes de son côté.
// S'il ne les jette pas aussi, le bouton ne change rien à ce qu'on voit.
// ============================================================
describe('mettre à jour les recettes', () => {
  it('prévient le serveur ET rouvre la fiche chez Odoo', async () => {
    await ouvrirLaFiche()
    const avant = listesLues
    fireEvent.click(screen.getByText(/^← /))
    await waitFor(() => expect(screen.getByLabelText('Mettre à jour les recettes')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Mettre à jour les recettes'))
    await waitFor(() => expect(relireRecettes).toHaveBeenCalled())
    // et l'écran repart chercher les fiches au lieu de resservir les siennes
    await waitFor(() => expect(listesLues).toBeGreaterThan(avant))
  })
})

// « dans à faire montre le stock actuel des articles » (Layla, 2026-09-14),
// puis « si l'article existe, ne pas me dire "il existe" — avec une autre
// couleur » (2026-09-15) : le chiffre seul, et la couleur qui parle.
describe('la case « À faire »', () => {
  it('dit ce qu’il en reste, en grammes et en vert', async () => {
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
    // 1,2 kg chez Odoo → « 1 200 g » (les espaces fines varient)
    const vu = [...document.querySelectorAll('div')]
      .find(e => /^1.200 g$/.test((e.textContent || '').replace(/\u202f|\u00a0/g, ' ')))
    expect(vu).toBeTruthy()
    expect(vu.className).toMatch(/text-ok/)
  })
})

// « montrer l'article mère dans l'impression pour qu'on sache de quelle crème
// au beurre il s'agit » (Layla, 2026-09-14). Sur une feuille posée au plan de
// travail, le titre seul ne dit pas pour quel gâteau on travaille — l'écran,
// lui, a son fil d'Ariane juste au-dessus.
describe('l’impression de la fiche', () => {
  it('porte les gâteaux que l’article sert', async () => {
    await ouvrirLaFiche()
    await waitFor(() => expect(screen.getByText(/pour :/)).toBeTruthy())
    expect(screen.getByText(/pour :/).textContent).toBe('pour : Tiramisu')
  })
})

// ============================================================
// IMPRIMER LA FOURNÉE.
//
// « je veux avoir le choix de l'ancienne version et de la nouvelle. sauf que
// pour la nouvelle des fois j'aime bien modifier les quantités avant »
// (Layla, 2026-09-14).
// ============================================================
describe('le bouton imprimer', () => {
  it('ouvre le choix au lieu d’imprimer tout de suite', async () => {
    const print = vi.fn()
    window.print = print
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    await waitFor(() => expect(screen.getByText('🖨 Tu imprimes quoi ?')).toBeTruthy())
    expect(screen.getByText('Juste cette fiche')).toBeTruthy()
    expect(screen.getByText('Tout ce qui manque')).toBeTruthy()
    expect(print).not.toHaveBeenCalled()
  })

  it('« juste cette fiche » n’envoie qu’une feuille', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    await waitFor(() => expect(screen.getByText('Imprimer 1 feuille')).toBeTruthy())
  })

  it('la quantité se corrige AVANT d’imprimer, en grammes', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    const champ = await screen.findByLabelText(/Quantité de Sirop imbibage/)
    // 5,55 kg chez Odoo → 5 550 g dans le champ
    expect(champ.value.replace(/\u202f|\u00a0/g, ' ')).toBe('5 550')
    fireEvent.change(champ, { target: { value: '3000' } })
    await waitFor(() =>
      expect(screen.getByLabelText(/Quantité de Sirop imbibage/).value
        .replace(/\u202f|\u00a0/g, ' ')).toBe('3 000'))
  })
})

// « tout ce qui manque la cascade entière ; ce qui est déjà en stock s'écrit
// en vert et non cliqué » (Layla, 2026-09-15).
describe('le panneau « tout ce qui manque »', () => {
  it('ce qu’on a déjà s’écrit en vert et reste décoché', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Tout ce qui manque'))
    // Le sirop a 1,2 kg en stock pour une fournée de 5,55 : il en manque,
    // donc il reste coché et n'est PAS vert.
    const ligne = screen.getByLabelText('Sirop imbibage')
    expect(ligne.getAttribute('aria-checked')).toBe('true')
    const nom = [...document.querySelectorAll('span')]
      .find(e => e.textContent === 'Sirop imbibage')
    expect(nom.className).not.toMatch(/text-ok/)
  })
})

// « non a l'exterieur de l'article. il n'est pas lié a l'article »
// (Layla, 2026-09-15) : la feuille de sortie s'imprime depuis l'ACCUEIL, sans
// ouvrir quoi que ce soit, et n'appartient à aucune recette.
describe('la feuille de sortie de stock', () => {
  it('s’imprime depuis l’accueil, sans ouvrir d’article', async () => {
    const print = vi.fn()
    window.print = print
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    const b = await screen.findByLabelText('Feuille de sortie de stock')
    fireEvent.click(b)
    // La feuille est posée dans la page, prête à partir.
    await waitFor(() => expect(document.querySelector('.print-feuilles')).toBeTruthy())
    expect(document.querySelector('.feuille-sortie')).toBeTruthy()
    // Pour quelle recette : une ligne vide, pas un nom.
    expect(screen.getByText('Pour quelle recette')).toBeTruthy()
  })
})

// ============================================================
// « LA PAGE EST BLANCHE » (Layla, 2026-09-18, sur téléphone).
//
// Demander les feuilles ne les pose pas tout de suite : l'écran se redessine au
// tour suivant. Le code attendait 60 ms au hasard avant d'imprimer — assez sur
// un ordinateur, pas sur un téléphone. L'impression partait sur un document où
// le CSS avait déjà tout caché et où les feuilles n'étaient pas encore
// arrivées : DES PAGES BLANCHES.
//
// Ce test regarde l'INSTANT de l'impression, pas ce qu'il y a après.
// ============================================================
describe('rien ne part avant que la liasse soit posée', () => {
  // ⚠️ ON PREND LA MAIN SUR LE RENDU. Le jsdom des tests est trop rapide pour
  // reproduire un téléphone : React y pose la liasse avant qu'un `setTimeout`
  // de 60 ms n'expire, et un test « les feuilles sont là au moment d'imprimer »
  // passerait donc même avec le code fautif — vérifié.
  //
  // On retient donc les images à la main : tant qu'on ne les rend pas, rien ne
  // doit partir. Un code qui imprime au bout d'une durée devinée, lui, part
  // quand même — c'est ce qui sépare les deux.
  const renduALaMain = () => {
    const files = []
    vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(cb => { files.push(cb); return files.length })
    return () => { while (files.length) files.shift()(0) }
  }
  const souffler = () => new Promise(r => setTimeout(r, 120))

  afterEach(() => { vi.restoreAllMocks() })

  it('n’imprime pas tant que la page n’est pas peinte', async () => {
    const peindre = renduALaMain()
    let vuALImpression = null
    window.print = vi.fn(() => {
      vuALImpression = {
        feuilles: document.querySelectorAll('.feuille-impr').length,
        cache: document.body.classList.contains('impr-feuilles'),
      }
    })
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Imprimer 1 feuille'))

    // ⚠️ LE CŒUR DU TEST : la page n'est pas peinte, donc rien ne part.
    await souffler()
    expect(window.print).not.toHaveBeenCalled()

    peindre()
    expect(window.print).toHaveBeenCalled()
    // Le reste du document est caché… ET la feuille est là. C'est ce « et »
    // qui manquait : sans lui, l'imprimante reçoit une page blanche.
    expect(vuALImpression.cache).toBe(true)
    expect(vuALImpression.feuilles).toBeGreaterThan(0)
  })

  // ⚠️ LA GARDE DU « QUE LA PREMIÈRE PAGE » (2026-09-18). `afterprint` ne veut
  // pas dire « c'est imprimé » : sur iPhone il arrive quand le système PREND le
  // document, pendant qu'il fabrique encore les pages suivantes.
  it('« j’ai pris » ne défait RIEN : ni la liasse, ni ce qui la montre', async () => {
    const peindre = renduALaMain()
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Imprimer 1 feuille'))
    peindre()
    expect(window.print).toHaveBeenCalled()

    fireEvent(window, new Event('afterprint'))
    await souffler()
    expect(document.querySelectorAll('.feuille-impr').length).toBeGreaterThan(0)
    // ⚠️ Et SURTOUT la classe : sans elle, `body:not(.impr-feuilles) *
    // { visibility: hidden }` rend toute la page invisible — des pages blanches.
    expect(document.body.classList.contains('impr-feuilles')).toBe(true)
  })

  it('l’écran n’est rendu que quand Layla revient dans l’app', async () => {
    const peindre = renduALaMain()
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Imprimer 1 feuille'))
    peindre()
    expect(document.body.classList.contains('impr-feuilles')).toBe(true)

    // Elle repose le doigt sur l'app : là, et seulement là, on range.
    fireEvent(window, new Event('focus'))
    await waitFor(() =>
      expect(document.body.classList.contains('impr-feuilles')).toBe(false))
    // La liasse, elle, reste : la prochaine impression la remplacera.
    expect(document.querySelectorAll('.feuille-impr').length).toBeGreaterThan(0)
  })

  it('et on peut réimprimer la même chose juste après', async () => {
    const peindre = renduALaMain()
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Imprimer 1 feuille'))
    peindre()
    expect(window.print).toHaveBeenCalledTimes(1)
    fireEvent(window, new Event('afterprint'))

    // Même liasse, même choix : le contenu ne change pas, donc seul un
    // compteur peut relancer le départ.
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Imprimer 1 feuille'))
    peindre()
    expect(window.print).toHaveBeenCalledTimes(2)
  })

  it('la feuille de sortie non plus ne part pas à vide', async () => {
    const peindre = renduALaMain()
    let feuillesVues = -1
    window.print = vi.fn(() => {
      feuillesVues = document.querySelectorAll('.feuille-sortie').length
    })
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    fireEvent.click(await screen.findByLabelText('Feuille de sortie de stock'))
    await souffler()
    expect(window.print).not.toHaveBeenCalled()
    peindre()
    expect(feuillesVues).toBe(1)
  })
})

// « quand j'imprime juste cette fiche ça doit sortir de la même manière que la
// cascade » (Layla, 2026-09-16) : plus d'écran recopié tel quel, la même
// feuille que les autres — avec son tableau à remplir.
describe('« juste cette fiche »', () => {
  // ⚠️ GARDE : « dans imprimer, ça donne maintenant toujours imprimer la
  // cascade, pas juste la page même » (Layla, 2026-09-20). Depuis une FICHE,
  // le choix doit exister, et s'ouvrir sur « juste cette fiche ».
  it('le panneau s’ouvre sur « juste cette fiche », pas sur la cascade', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    await screen.findByText('🖨 Tu imprimes quoi ?')
    // Les deux façons sont proposées…
    expect(screen.getByText('Juste cette fiche')).toBeTruthy()
    expect(screen.getByText('Tout ce qui manque')).toBeTruthy()
    // …et c'est « juste cette fiche » qui est choisie d'avance.
    expect(screen.getByText('Juste cette fiche').closest('button')
      .getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Imprimer 1 feuille')).toBeTruthy()
  })

  it('sort la feuille de la cascade, pas l’écran', async () => {
    window.print = vi.fn()
    await ouvrirLaFiche()
    fireEvent.click(screen.getByText('🖨 Imprimer'))
    fireEvent.click(await screen.findByText('Imprimer 1 feuille'))
    await waitFor(() => expect(document.querySelector('.feuille-impr')).toBeTruthy())
    // Une seule RECETTE — celle qu'on regarde — et elle porte le tableau à
    // remplir, comme dans la cascade.
    const recettes = document.querySelectorAll('.feuille-impr:not(.feuille-economat)')
    expect(recettes).toHaveLength(1)
    expect(recettes[0].textContent).toMatch(/Sirop imbibage/)
    expect(recettes[0].querySelector('.fi-table')).toBeTruthy()
    // ⚠️ Et sa demande à l'économat vient AVEC, et AVANT : on ne fabrique pas
    // ce qu'on n'a pas été chercher. Même liasse que la cascade.
    const toutes = [...document.querySelectorAll('.feuille-impr')]
    expect(toutes).toHaveLength(2)
    expect(toutes[0].classList.contains('feuille-economat')).toBe(true)
  })
})

// ============================================================
// ASSEMBLER PLUSIEURS GÂTEAUX DU MÊME THÈME.
//
// « est-ce que je peux sélectionner recette du même thème pour assembler les
// mêmes crèmes » puis « autorise que le même thème » (Layla, 2026-09-16).
// ============================================================
describe('cocher plusieurs gâteaux', () => {
  it('sans rien de coché, l’écran est celui d’avant — pas de barre', async () => {
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
    expect(screen.queryByText(/gâteau choisi/)).toBeNull()
  })

  it('cocher fait paraître la barre du bas', async () => {
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Choisir Sirop imbibage'))
    await waitFor(() => expect(screen.getByText('1 gâteau choisi')).toBeTruthy())
  })

  it('et « tout décocher » la fait disparaître', async () => {
    render(<FabAnnexe2SimpleView user={{ id: 'u1' }} />)
    await waitFor(() => expect(screen.getByText('Sirop imbibage')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Choisir Sirop imbibage'))
    await waitFor(() => expect(screen.getByText('tout décocher')).toBeTruthy())
    fireEvent.click(screen.getByText('tout décocher'))
    await waitFor(() => expect(screen.queryByText(/gâteau choisi/)).toBeNull())
  })
})
