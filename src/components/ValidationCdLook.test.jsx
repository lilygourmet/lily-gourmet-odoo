// @vitest-environment jsdom
// ============================================================
// « À VALIDER CD », EN DEUX LIGNES.
//
// « Arrange le look de À valider CD aussi » (Layla, 2026-09-22) — le même
// traitement que « À valider Annexe » la veille : « trop de boutons, trop
// d'écriture, c'est long ».
//
// Une carte tenait en SIX lignes : le nom, le « sorti », le numéro, le lieu, le
// « fait le », le « prévu le » — plus une pastille qui répétait ce que le liseré
// de gauche disait déjà en couleur. Et « annuler l'ordre » dormait tout au fond
// du panneau des consommations, là où personne n'allait le chercher.
//
// Rien n'a changé dans les GESTES. Ce fichier garde les deux choses qui
// comptent : ce qui doit rester visible, et ce qui doit rester cliquable.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const confirmDialog = vi.fn(async () => true)
const annulerOrdre = vi.fn(async () => ({ annules: ['WHLVP/MO/1'] }))

// Une préparation (SM‑) : elle se pèse à la sortie du four.
const genoise = {
  name: 'WHLVP/MO/1', produit: 'SM. Genoise Chocolat KG CD', qty: 48, unite: 'kg',
  etat: 'confirmed', lieu: 'Stock Prod', quand: '2026-09-22 08:00:00',
  manques: [], lignes: [{ id: 11, produit: 'MP- Farine', besoin: 900, unite: 'g' }],
}
// Un gâteau monté : pas de pesée, juste son compte.
const cadre = {
  name: 'WHLVP/MO/2', produit: 'CD* Cadre Foret Noir Grand', qty: 24, unite: 'u',
  etat: 'confirmed', lieu: 'Stock Prod', quand: '2026-09-22 08:00:00',
  manques: [], lignes: [],
}
// Prévu pour plus tard, et il lui manque quelque chose.
const plusTard = {
  name: 'WHLVP/MO/3', produit: 'SM. Mousse Pistache', qty: 1.4, unite: 'kg',
  etat: 'confirmed', lieu: 'Labo', quand: '2026-12-24 08:00:00',
  manques: [{ produit: 'SM. Masse Gélatine', manque: 900, unite: 'g' }], lignes: [],
}

let ouverts = [genoise, cadre, plusTard]

vi.mock('./AppHeader', () => ({ default: () => null }))
vi.mock('./Skeleton', () => ({ default: () => null }))
vi.mock('../lib/toast', () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }))
vi.mock('../lib/confirmDialog', () => ({ confirmDialog: (...a) => confirmDialog(...a) }))
vi.mock('../lib/jourLisible', () => ({ quandFait: () => '22/09 à 09h12' }))
vi.mock('../lib/fabrication', () => ({
  loadOrdres: async () => ouverts.map(o => ({ name: o.name })),
  loadFaits: async () => Object.fromEntries(ouverts.map(o => [o.name, { fait_le: '2026-09-22T09:12:00Z' }])),
  loadManques: async () => ouverts,
  validerDansOdoo: async () => [],
  annulerOrdre: (...a) => annulerOrdre(...a),
  chercherArticles: async () => [],
  dernierEcran: () => null,
  garderEcran: () => {},
  loadSaisies: async () => ({}),
  saveSaisies: async () => {},
  loadStocksNegatifs: async () => [],
  setFait: async () => {},
  rendementPourOdoo: () => null,
}))

const { default: ValidationView } = await import('./ValidationView')

beforeEach(() => { confirmDialog.mockClear(); annulerOrdre.mockClear(); ouverts = [genoise, cadre, plusTard] })
afterEach(cleanup)

const afficher = async () => {
  render(<ValidationView user={{ id: 'u1' }} onNavigate={() => {}} onLogout={() => {}} />)
  await screen.findByText('Genoise Chocolat KG')
}

describe('ce qui a disparu', () => {
  it('la pastille « prêt / il manque » : le liseré de gauche le dit déjà', async () => {
    await afficher()
    expect(screen.queryByText('prêt')).toBeNull()
    // Le manque, lui, reste écrit en toutes lettres — mais en phrase, pas en
    // pastille : « il manque 900 g de Masse Gélatine », sous le nom.
    expect(screen.getAllByText(/il manque/).length).toBeGreaterThan(0)
    expect(screen.getByText('900 g')).toBeTruthy()
  })

  it('le nom ne traîne plus sa quantité derrière un tiret', async () => {
    await afficher()
    expect(screen.queryByText(/Genoise Chocolat KG — /)).toBeNull()
  })
})

describe('ce qui se touche, sous le pouce', () => {
  it('une PRÉPARATION montre sa case « sorti » sur la ligne du nom', async () => {
    await afficher()
    const c = screen.getByLabelText('Quantité vraiment sortie de Genoise Chocolat KG')
    // ⚠️ EN GRAMMES, même si Odoo compte en kilos : 48 kg → 48 000.
    expect(c.getAttribute('placeholder')).toBe('48000')
  })

  it('un GÂTEAU MONTÉ n’a pas de case : il ne se pèse pas', async () => {
    await afficher()
    expect(screen.queryByLabelText(/Cadre Foret Noir/)).toBeNull()
    expect(screen.getByText('24 u')).toBeTruthy()
  })

  // ⚠️ IL DORMAIT AU FOND DU PANNEAU DES CONSOMMATIONS.
  it('« annuler l’ordre » se clique sans rien ouvrir', async () => {
    await afficher()
    fireEvent.click(screen.getByLabelText('Annuler l’ordre WHLVP/MO/1'))
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled())
    await waitFor(() => expect(annulerOrdre).toHaveBeenCalledWith(['WHLVP/MO/1'], 'u1'))
  })

  it('« consommé » est une pastille, et elle ouvre le même panneau', async () => {
    await afficher()
    expect(screen.queryByText('Farine')).toBeNull()
    fireEvent.click(screen.getByText('▸ consommé'))
    await screen.findByText('Farine')
  })

  it('un ordre sans recette n’a pas de pastille « consommé »', async () => {
    ouverts = [cadre]
    render(<ValidationView user={{ id: 'u1' }} onNavigate={() => {}} onLogout={() => {}} />)
    await screen.findByText('Cadre Foret Noir Grand')
    expect(screen.queryByText('▸ consommé')).toBeNull()
  })
})

describe('ce qui doit encore arrêter l’œil', () => {
  // ⚠️ Valider aujourd'hui ce qui est prévu pour Noël, ça se voit trop tard.
  it('une fournée prévue PLUS TARD garde sa date sous le nom', async () => {
    await afficher()
    expect(screen.getByText(/prévu le 24 décembre/)).toBeTruthy()
  })

  it('une fournée prévue pour aujourd’hui se range dans la ligne grise', async () => {
    await afficher()
    // « 22 sept. » en abrégé dans la ligne grise, pas en gras sous le nom.
    expect(screen.queryByText(/prévu le 22 septembre/)).toBeNull()
    expect(screen.getAllByText(/prévu le 22 sept\./).length).toBeGreaterThan(0)
  })

  it('le numéro, le lieu et l’heure tiennent sur UNE ligne', async () => {
    await afficher()
    expect(screen.getByText(/WHLVP\/MO\/1 · Stock Prod · fait 22\/09 à 09h12/)).toBeTruthy()
  })
})
