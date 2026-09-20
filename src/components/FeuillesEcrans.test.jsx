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
const poserLeScan = vi.fn()

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: async () => true }))
vi.mock('../lib/scanEntrant', () => ({ poserLeScan: (...a) => poserLeScan(...a) }))
vi.mock('../lib/feuilles', async importOriginal => ({
  ...await importOriginal(),            // les VRAIES règles de tri
  feuillesDuJour: async () => lues,
  donner: (...a) => donner(...a),
  retourRecu: (...a) => retourRecu(...a),
  demanderRetour: (...a) => demanderRetour(...a),
}))

const { default: ADeclarerView } = await import('./ADeclarerView')
const { default: DonneView } = await import('./DonneView')

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('« À déclarer », pour des mains farineuses', () => {
  it('montre une photo et le chiffre, et rien à lire', async () => {
    lues = [donnee, seule]
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
    lues = [donnee, veille]
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

  it('« Donné » sert la fournée, « Repris » la récupère', async () => {
    lues = [attendue, rendue]
    render(<DonneView user={{ id: 'u1' }} onNavigate={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/^Donné : /))
    await waitFor(() => expect(donner).toHaveBeenCalledWith('f3', 'u1'))

    fireEvent.click(screen.getByLabelText(/^Repris : /))
    await waitFor(() => expect(retourRecu).toHaveBeenCalledWith('f4'))
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
