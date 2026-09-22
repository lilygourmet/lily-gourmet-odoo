// @vitest-environment jsdom
// ============================================================
// LES DEUX ÉCRANS DE FOURNÉE, VUS PAR QUELQU'UN QUI NE LIT PAS.
//
// « Trop compliqué pour quelqu'un qui ne lit pas / facilite le visuel »
// (Layla, 2026-09-20). Ce test garde les trois choses qui font qu'un écran se
// tient sans lecture :
//   • une PHOTO par fournée,
//   • le CHIFFRE visible,
//   • UN bouton par geste — et le bon geste derrière.
//
// Et il garde surtout ce qui ne doit pas revenir : les paragraphes
// d'explication et le vide annoncé par une phrase.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const maintenant = Date.now()
const ilYA = min => new Date(maintenant - min * 60000).toISOString()
// ⚠️ MIDI DU JOUR DIT, PAS « IL Y A N HEURES » (vécu le 2026-09-22 à 00 h 06 :
// « il y a 5 h » tombait la VEILLE, et le test du rangement par jour cassait).
// L'atelier travaille la nuit ; un test qui ne passe qu'avant minuit ne sert à
// rien. Pour tout ce qui parle de JOURS, on vise midi.
const aMidi = (joursAvant = 0) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - joursAvant)
  return d.toISOString()
}

/** Donnée par l'économe il y a 5 h : due, en retard, et rendable. */
const donnee = {
  id: 'f1', jour: '2026-09-20', produit: 'SM. Creme Citron Production',
  libelle: 'Crème citron', unite: 'g', qty_prevue: 11844,
  pour: 'SM- Cadre Citron Meringuée', liasse: 'l1', sans_economat: false,
  chemin: ['SM- Cadre Citron Meringuée', 'SM. Creme Citron Production'],
  imprime_le: ilYA(340), donne_le: ilYA(300),
  declare_le: null, pas_faite_le: null, retour_le: null,
}

/** Rien à demander à l'économe : due dès l'impression, et RIEN à rendre. */
const seule = {
  ...donnee, id: 'f2', produit: 'SM- Cadre Citron Meringuée',
  libelle: 'Cadre citron meringuée', unite: 'u', qty_prevue: 18, pour: null,
  liasse: 'l2', sans_economat: true, chemin: ['SM- Cadre Citron Meringuée'],
  imprime_le: ilYA(30), donne_le: null,
}

/** Demandée, pas encore servie : c'est l'économe qui l'a sur les bras. */
const attendue = {
  ...donnee, id: 'f3', produit: 'SM. Ganache Gold', libelle: 'Ganache gold',
  qty_prevue: 1800, liasse: 'l3', imprime_le: ilYA(20), donne_le: null,
}

/** Donnée la veille, toujours pas déclarée : la dette ne s'efface pas à minuit. */
const veille = {
  ...donnee, id: 'f5', produit: 'SM. Ganache Gold', libelle: 'Ganache gold',
  qty_prevue: 1800, liasse: 'l5', chemin: ['SM- Tarte CBS 18 cm', 'SM. Ganache Gold'],
  imprime_le: ilYA(26 * 60), donne_le: ilYA(25 * 60),
}

/** Rendue par le pâtissier : l'économe doit confirmer l'avoir récupérée. */
const rendue = {
  ...donnee, id: 'f4', produit: 'SM. Crunchy Pistache', libelle: 'Crunchy pistache',
  qty_prevue: 3100, liasse: 'l4', retour_le: ilYA(10),
}

/** Donnée PUIS déclarée : soldée — elle n'est plus dehors, elle est dans l'histoire. */
const soldee = {
  ...donnee, id: 'f6', produit: 'SM. Crunchy Gianduja', libelle: 'Crunchy gianduja',
  qty_prevue: 2400, liasse: 'l6', chemin: ['SM- Gianduja 10 pers', 'SM. Crunchy Gianduja'],
  declare_le: ilYA(5),
}

let lues = []
const donner = vi.fn(async () => ({ reste: 0 }))
const retourRecu = vi.fn(async () => ({}))
const demanderRetour = vi.fn(async () => ({}))
const annulerFeuille = vi.fn(async () => ({}))
const defaireDon = vi.fn(async () => ({}))
const poserLeScan = vi.fn()

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
const confirmDialog = vi.fn(async () => true)
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (...a) => confirmDialog(...a) }))
vi.mock('../lib/scanEntrant', () => ({ poserLeScan: (...a) => poserLeScan(...a) }))
vi.mock('../lib/feuilles', async importOriginal => ({
  ...await importOriginal(),            // les VRAIES règles de tri
  feuillesDuJour: async () => lues,
  donner: (...a) => donner(...a),
  retourRecu: (...a) => retourRecu(...a),
  demanderRetour: (...a) => demanderRetour(...a),
  annulerFeuille: (...a) => annulerFeuille(...a),
  defaireDon: (...a) => defaireDon(...a),
}))

const { default: ADeclarerView } = await import('./ADeclarerView')
const { default: DonneView } = await import('./DonneView')

beforeEach(() => { vi.clearAllMocks(); confirmDialog.mockResolvedValue(true) })
afterEach(cleanup)

describe('« À déclarer », pour des mains farineuses', () => {
  // ⚠️ ANCRÉES À MIDI, ET C'EST INDISPENSABLE (vécu le 2026-09-23 à 00 h 30).
  // `donnee` était posée « il y a 5 h 40 » et `seule` « il y a 30 min » : passé
  // minuit, la première tombe la VEILLE. Les deux fournées se retrouvent alors
  // dans deux journées différentes, donc deux titres de cascade, donc quatre
  // photos au lieu de trois. Le deuxième test de ce fichier à tomber pour la
  // même raison en une journée — l'atelier travaille la nuit, les tests aussi.
  it('montre une photo et le chiffre, et rien à lire', async () => {
    lues = [{ ...donnee, imprime_le: aMidi(0), donne_le: aMidi(0) },
      { ...seule, imprime_le: aMidi(0) }]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')

    // Une photo par fournée + celle du titre de cascade — et toujours celle du
    // GÂTEAU, jamais celle de la crème.
    const photos = document.querySelectorAll('img')
    expect(photos.length).toBe(3)
    expect(decodeURIComponent(photos[0].getAttribute('src')))
      .toContain('SM- Cadre Citron Meringuée')

    // Le chiffre, en clair (espace fine ou insécable selon le navigateur).
    expect(screen.getByText(/^11[\u202f\u00a0 ]844$/)).toBeTruthy()

    // ⚠️ RANGÉ PAR CASCADE : les deux lignes appartiennent au même gâteau,
    // elles tiennent donc sous UN seul titre.
    expect(screen.getAllByText('Cadre Citron Meringuée').length).toBe(1)

    // ⚠️ CE QUI NE DOIT PAS REVENIR : les phrases d'explication.
    expect(screen.queryByText(/Donné par l’économe, pas encore déclaré/)).toBeNull()
    expect(screen.queryByText(/RIEN À DEMANDER/)).toBeNull()
  })

  it('le gros bouton ouvre le VRAI écran, sur le bon chemin', async () => {
    lues = [donnee]
    const onNavigate = vi.fn()
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={onNavigate} />)
    // Toute la ligne déclare : on touche le nom, pas un bouton à part.
    fireEvent.click(await screen.findByText('Crème citron'))

    // Le chemin entier : une crème ne s'ouvre qu'en descendant de son gâteau.
    expect(poserLeScan).toHaveBeenCalledWith({
      chemin: ['SM- Cadre Citron Meringuée', 'SM. Creme Citron Production'],
      declarer: true, retour: 'a-declarer',
    })
    expect(onNavigate).toHaveBeenCalledWith('fabrication-annexe-2')
  })

  it('« Je rends » n’existe que si l’économe a donné', async () => {
    lues = [donnee, seule]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')
    // Deux fournées dues, une seule vient de l'économat.
    expect(screen.getAllByLabelText(/^Rendre /).length).toBe(1)

    fireEvent.click(screen.getByLabelText(/^Rendre /))
    await waitFor(() => expect(demanderRetour).toHaveBeenCalledWith('f1', 'u1', false))
  })

  // ⚠️ « Regroupe par date dans À déclarer, pour voir ce qui a aussi été donné
  // par date » (Layla, 2026-09-20). La liste remonte une semaine.
  it('range par jour, le plus récent en haut', async () => {
    // Ancrées à midi : l'heure à laquelle tourne le test ne doit rien changer.
    lues = [
      { ...donnee, imprime_le: aMidi(0), donne_le: aMidi(0) },
      { ...veille, imprime_le: aMidi(1), donne_le: aMidi(1) },
    ]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')

    const jours = [...document.querySelectorAll('span')]
      .filter(e => /^(Aujourd’hui|Hier|[a-zé.]+ \d{2}\/\d{2})$/.test(e.textContent))
    expect(jours.length).toBe(2)
    expect(jours[0].textContent).toBe('Aujourd’hui')   // le jour en cours d'abord
    expect(jours[1].textContent).not.toBe('Aujourd’hui')
  })

  it('le vide se dit en deux mots', async () => {
    lues = []
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    expect(await screen.findByText('Tout est déclaré')).toBeTruthy()
    expect(screen.queryByText(/Tout ce qui a été donné aujourd’hui est déclaré/)).toBeNull()
  })
})

// ⚠️ « Je veux rajouter dans une quantité d'article déjà donné » (Layla,
// 2026-09-21). L'économe ne voit QUE le complément dans sa liste — c'est le
// papier qu'on lui tend — pendant que la fiche, elle, compte le total.
describe('un complément, quand une partie est déjà donnée', () => {
  const donnee2k = { ...donnee, id: 'g1', produit: 'SM. Creme Citron', libelle: 'Crème citron',
    qty_prevue: 2000, donne_le: ilYA(60) }
  const complement500 = { ...donnee, id: 'g2', produit: 'SM. Creme Citron', libelle: 'Crème citron',
    qty_prevue: 500, donne_le: null, imprime_le: ilYA(2) }

  it('l’économe ne se voit réclamer que les 500 g', async () => {
    lues = [donnee2k, complement500]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('À donner')
    // Le complément l'attend…
    expect(screen.getByText(/^500$/)).toBeTruthy()
    // …et les 2 kg déjà sortis sont ailleurs, dans « Déjà donné ».
    expect(screen.getByText('Déjà donné')).toBeTruthy()
    expect(screen.getByText(/^2[\u202f\u00a0 ]000$/)).toBeTruthy()
  })
})

describe('« Donné », l’écran de l’économe', () => {
  it('range en trois bandes, avec un compteur chacune', async () => {
    lues = [attendue, donnee, rendue]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('À donner')
    expect(screen.getByText('On te rend')).toBeTruthy()
    expect(screen.getByText('Déjà donné')).toBeTruthy()

    // ⚠️ Les phrases d'explication ne reviennent pas.
    expect(screen.queryByText(/Ce que tu as sorti de la réserve/)).toBeNull()
    expect(screen.queryByText(/c’est le pâtissier qui rend/)).toBeNull()
  })

  // ⚠️ « La masse gélatine n'est pas dans donné » (Layla, 2026-09-21) : la
  // ligne lui réclamait une PRÉPARATION qu'il ne peut pas sortir — sa réserve
  // contient de la gélatine en poudre, pas de la masse.
  it('dit ce qu’il doit sortir, pas seulement le nom de la préparation', async () => {
    lues = [{ ...attendue, produit: 'SM. Masse Gélatine', libelle: 'Masse gélatine',
      qty_prevue: 1440, unite: 'kg',
      demande: [{ produit: 'MP- Gelatine en poudre', qty: 206, unite: 'g' }] }]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Masse gélatine')
    expect(screen.getByText(/206 g de Gelatine en poudre/)).toBeTruthy()
  })

  it('« Donné » sert la fournée, « Repris » la récupère', async () => {
    lues = [attendue, rendue]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/^Donné : /))
    await waitFor(() => expect(donner).toHaveBeenCalledWith('f3', 'u1'))

    fireEvent.click(screen.getByLabelText(/^Repris : /))
    await waitFor(() => expect(retourRecu).toHaveBeenCalledWith('f4'))
  })

  // ⚠️ « Je n'arrive pas à cocher un article, il fait que bouger » (Layla,
  // 2026-09-20) : seule la bande verte de 64 px répondait. Toucher la photo ou
  // le nom ne faisait rien — l'écran glissait sous le doigt, c'est tout.
  it('toucher l’article suffit à le donner, pas seulement le ✓', async () => {
    lues = [attendue]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    fireEvent.click(await screen.findByText('Ganache gold'))
    await waitFor(() => expect(donner).toHaveBeenCalledWith('f3', 'u1'))
  })

  it('ce qui est déjà donné n’offre AUCUN bouton : rien à faire ici', async () => {
    lues = [donnee]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Déjà donné')
    expect(screen.queryByLabelText(/^Donné : /)).toBeNull()
    expect(screen.queryByLabelText(/^Repris : /)).toBeNull()

    // ⚠️ MAIS LA DATE, ELLE, EST ÉCRITE (Layla, 2026-09-20 : « quand on donne,
    // on écrit en dessous la date »). Jour ET heure : la liste remonte une
    // semaine.
    expect(screen.getByText(/^donné \d{2}\/\d{2} · \d{2}:\d{2}$/)).toBeTruthy()
  })

  // ⚠️ « Le point 3, comme un historique » (Layla, 2026-09-20). Une fournée
  // déclarée quittait l'écran sans laisser de trace : l'économe ne pouvait
  // plus dire ce qui était sorti de sa réserve dans la journée.
  it('ce qui est déclaré descend dans l’historique, replié', async () => {
    lues = [soldee]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText(/Historique/)

    // Replié : le travail en cours n'est pas encombré…
    expect(screen.queryByText('Crunchy gianduja')).toBeNull()
    // …et ce n'est plus « dehors », puisque c'est déclaré.
    expect(screen.queryByText('Déjà donné')).toBeNull()

    fireEvent.click(screen.getByText(/Historique/))
    expect(await screen.findByText('Crunchy gianduja')).toBeTruthy()
    // La trace dit QUOI et QUAND — le dernier geste, pas le moment du don.
    expect(screen.getByText(/^✓ déclaré \d{2}\/\d{2} · \d{2}:\d{2}$/)).toBeTruthy()
  })

  it('rien dehors se dit en deux mots', async () => {
    lues = []
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    expect(await screen.findByText('Rien dehors')).toBeTruthy()
    expect(screen.queryByText(/Rien n’est sorti sans avoir été déclaré/)).toBeNull()
  })
})

// ============================================================
// ANNULER CE DONT RIEN N'EST SORTI DE LA RÉSERVE.
//
// « Pouvoir annuler les déclarations dans À déclarer qui n'ont pas besoin de
// retour de matière première », puis « je parle de là où il n'y a pas la
// matière première, avec un texte qui dit : tu es sûre de vouloir annuler ? »
// (Layla, 2026-09-22).
//
// C'est l'AUTRE moitié du bouton « ↩ Rendre », pas un doublon : quand
// l'économe a donné, il doit récupérer sa marchandise ; quand il n'a rien
// donné, la ligne restait dans « À déclarer » POUR TOUJOURS, sans aucun moyen
// de s'en défaire.
// ============================================================
describe('annuler une fournée dont rien n’est sorti', () => {
  it('la croix n’apparaît QUE là où l’économe n’a rien donné', async () => {
    lues = [donnee, seule]                    // `donnee` servie, `seule` non
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')
    expect(screen.getAllByLabelText(/^Annuler /).length).toBe(1)
    expect(screen.getAllByLabelText(/^Rendre /).length).toBe(1)
  })

  // ⚠️ LES DEUX NE SE CROISENT JAMAIS : sur une même ligne, c'est l'un OU
  // l'autre. Rendre ce qui n'est pas sorti serait un retour fantôme ; annuler
  // ce qui est sorti laisserait la marchandise dehors sans que personne le
  // sache.
  it('jamais les deux sur la même ligne', async () => {
    lues = [donnee]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')
    expect(screen.queryByLabelText(/^Annuler /)).toBeNull()
    cleanup()

    lues = [seule]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Cadre citron meringuée')
    expect(screen.queryByLabelText(/^Rendre /)).toBeNull()
  })

  // ⚠️ « AVEC UN TEXTE QUI DIT : TU ES SÛRE DE VOULOIR ANNULER ? » (Layla).
  // La ligne part pour de bon — et elle quitte aussi la liste de l'économe s'il
  // ne l'avait pas encore servie.
  it('demande confirmation, en nommant la fournée', async () => {
    lues = [seule]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Cadre citron meringuée')
    fireEvent.click(screen.getByLabelText(/^Annuler /))
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    expect(confirmDialog.mock.calls[0][0]).toMatch(/Tu es sûre de vouloir annuler/)
    expect(confirmDialog.mock.calls[0][0]).toContain('Cadre citron meringuée')
  })

  it('un « non » n’annule rien du tout', async () => {
    confirmDialog.mockResolvedValue(false)
    lues = [seule]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Cadre citron meringuée')
    fireEvent.click(screen.getByLabelText(/^Annuler /))
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    expect(annulerFeuille).not.toHaveBeenCalled()
  })

  it('annuler ferme la ligne, et ne demande aucun retour', async () => {
    lues = [seule]
    render(<ADeclarerView user={{ id: 'u1' }} onNavigate={() => {}} />)
    await screen.findByText('Cadre citron meringuée')
    fireEvent.click(screen.getByLabelText(/^Annuler /))
    await waitFor(() => expect(annulerFeuille).toHaveBeenCalledWith('f2'))
    expect(demanderRetour).not.toHaveBeenCalled()
  })
})

// ============================================================
// L'ÉCONOME AUSSI PEUT REVENIR EN ARRIÈRE.
//
// « Je veux pouvoir annuler une "donné" aussi » (Layla, 2026-09-22) — et, à la
// question « annuler quoi ? » : « les deux ».
//
//   • dans 🤲 À DONNER : annuler une demande qu'on ne servira pas ;
//   • dans ✅ DÉJÀ DONNÉ : défaire un don posé par erreur (QR scanné de
//     travers, doigt qui ripe) — la ligne repart dans « À donner ».
// ============================================================
describe('revenir en arrière dans « Donné »', () => {
  it('« À donner » propose d’annuler la demande', async () => {
    lues = [attendue]
    render(<DonneView user={{ id: 'e1' }} onNavigate={() => {}} />)
    await screen.findByText('Ganache gold')
    fireEvent.click(screen.getByLabelText(/^Annuler /))
    await waitFor(() => expect(annulerFeuille).toHaveBeenCalledWith('f3'))
    expect(donner).not.toHaveBeenCalled()
  })

  it('« Déjà donné » propose de défaire le don', async () => {
    lues = [donnee]
    render(<DonneView user={{ id: 'e1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')
    fireEvent.click(screen.getByLabelText(/^Défaire le don /))
    await waitFor(() => expect(defaireDon).toHaveBeenCalledWith('f1'))
  })

  // ⚠️ LES DEUX NE SE CROISENT JAMAIS : une demande en attente ne se « défait »
  // pas (rien n'a été donné), et un don posé ne s'« annule » pas (la
  // marchandise est dehors — il faut la reprendre, pas l'effacer).
  it('chaque bloc n’a que son propre geste', async () => {
    lues = [attendue]
    render(<DonneView user={{ id: 'e1' }} onNavigate={() => {}} />)
    await screen.findByText('Ganache gold')
    expect(screen.queryByLabelText(/^Défaire le don /)).toBeNull()
    cleanup()

    lues = [donnee]
    render(<DonneView user={{ id: 'e1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')
    expect(screen.queryByLabelText(/^Annuler /)).toBeNull()
  })

  it('les deux demandent confirmation, et un « non » ne fait rien', async () => {
    confirmDialog.mockResolvedValue(false)
    lues = [donnee]
    render(<DonneView user={{ id: 'e1' }} onNavigate={() => {}} />)
    await screen.findByText('Crème citron')
    fireEvent.click(screen.getByLabelText(/^Défaire le don /))
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    expect(defaireDon).not.toHaveBeenCalled()
  })

  // ⚠️ La ligne ENTIÈRE reste le bouton principal : un bouton ne s'imbrique pas
  // dans un bouton (sa règle du 20/09 : « je n'arrive pas à cocher un article,
  // il fait que bouger »).
  it('toucher la ligne donne toujours, la croix est à côté', async () => {
    lues = [attendue]
    render(<DonneView user={{ id: 'e1' }} onNavigate={() => {}} />)
    await screen.findByText('Ganache gold')
    fireEvent.click(screen.getByLabelText(/^Donné : /))
    await waitFor(() => expect(donner).toHaveBeenCalledWith('f3', 'e1'))
    expect(annulerFeuille).not.toHaveBeenCalled()
  })
})
