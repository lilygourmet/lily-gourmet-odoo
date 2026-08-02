import { describe, it, expect, vi } from 'vitest'

// pointage.js importe supabase pour ses fonctions de chargement/écriture,
// mais les calculs testés ici sont purs.
vi.mock('./supabase', () => ({ supabase: {} }))

const { calculerHeuresPointees, calculerJour, statutPrevu, SORTIE_AUTO } = await import('./pointage')

describe('changement du temps de travail au 31 juillet 2026', () => {
  // Fiches d'aujourd'hui : 8 h + équipe « café » mise en masse. Avant le 31/07 on
  // doit retrouver 8,5 h fixes, sauf pour les groupes vraiment au café.
  const base = { heures_jour_complet: 8, heures_demi_journee: 4, equipe: 'cafe', planning_type: 'fixe', planning_jour_off: 'Dimanche' }
  const patissiere = { ...base, id: 1, groupe: 'Prod' }
  const serveuse = { ...base, id: 2, groupe: 'Serveur' }
  const femmeMenage = { ...base, id: 3, groupe: 'Menage' }
  const feries = new Map(), conges = new Map()
  const prevuLe = (ymd, emp) => statutPrevu(new Date(`${ymd}T12:00:00`), emp, feries, conges)
  // 8h30 de présence en une seule session (pause non pointée)
  const journee8h30 = ymd => calculerHeuresPointees([{ arrivee: `${ymd}T07:00:00Z`, depart: `${ymd}T15:30:00Z` }])

  it('en juillet, une pâtissière est due 8,5 h fixes — le régime café ne s\'applique pas', () => {
    const prevu = prevuLe('2026-07-15', patissiere)
    expect(prevu.heures_prevues).toBe(8.5)
    const jour = calculerJour(prevu, journee8h30('2026-07-15'), patissiere)
    expect(jour.heures_prevues).toBe(8.5)   // et non 9 h de la règle café
    expect(jour.heures_sup).toBe(0)
    expect(jour.heures_manquantes).toBe(0)
  })

  it('en juillet, une serveuse garde le régime café (9 h sans pause pointée)', () => {
    const prevu = prevuLe('2026-07-15', serveuse)
    expect(prevu.regime_cafe).toBe(true)
    const jour = calculerJour(prevu, journee8h30('2026-07-15'), serveuse)
    expect(jour.heures_prevues).toBe(9)
    expect(jour.heures_manquantes).toBe(0.5)
  })

  it('en juillet, le ménage garde aussi le régime café', () => {
    expect(prevuLe('2026-07-15', femmeMenage).regime_cafe).toBe(true)
  })

  it('le 31 juillet bascule déjà au nouveau réglage pour tout le monde', () => {
    const prevu = prevuLe('2026-07-31', patissiere)
    expect(prevu.heures_prevues).toBe(8)
    expect(prevu.regime_cafe).toBe(true)
  })

  it('en août, la pâtissière suit le régime café comme réglé dans sa fiche', () => {
    const jour = calculerJour(prevuLe('2026-08-03', patissiere), journee8h30('2026-08-03'), patissiere)
    expect(jour.heures_prevues).toBe(9)     // pause non pointée
  })

  it('un jour OFF travaillé en juillet est dû 8,5 h', () => {
    const prevu = prevuLe('2026-07-12', patissiere)   // un dimanche = OFF
    expect(prevu.statut).toBe('off')
    const jour = calculerJour(prevu, journee8h30('2026-07-12'), patissiere)
    expect(jour.statut).toBe('off_travaille')
    expect(jour.heures_prevues).toBe(8.5)             // et non 8 h de la fiche
    expect(jour.jours_recup).toBe(1)
  })
})

describe('journée à laquelle il manque un badge : reconstitution premier → dernier', () => {
  // Le cas de Hanae le 1er août : entrée 08:19, sortie déjeuner 14:12, retour non
  // pointé, départ 17:13 (que le système avait pris pour une entrée).
  const badgesHanae = [
    { arrivee: '2026-08-01T07:19:00Z', depart: '2026-08-01T13:12:00Z' },
    { arrivee: '2026-08-01T16:13:00Z', depart: '2026-08-01T22:59:59Z', notes: SORTIE_AUTO },
  ]
  const serveuse = { id: 2, groupe: 'Serveur', equipe: 'cafe', heures_jour_complet: 8 }

  it('compte de 08:19 à 17:13 au lieu de neutraliser la journée', () => {
    const r = calculerHeuresPointees(badgesHanae)
    expect(r.heures).toBeCloseTo(8.9, 1)        // 8 h 54
    expect(r.anomalie).toBe('sortie_reconstituee')
    expect(r.tranches).toBe('08:19–17:13 (reconstitué)')
  })

  it('les heures reconstituées sont bien gardées (pas remplacées par le prévu)', () => {
    const prevu = { statut: 'normal', heures_prevues: 9, label: 'Journée', regime_cafe: true }
    const jour = calculerJour(prevu, calculerHeuresPointees(badgesHanae), serveuse)
    expect(jour.heures_travaillees).toBeCloseTo(8.9, 1)
    expect(jour.heures_prevues).toBe(9)          // pause non pointée → 9 h dues
  })

  it('ne devine rien s\'il n\'y a qu\'un seul badge', () => {
    const r = calculerHeuresPointees([
      { arrivee: '2026-08-01T16:58:00Z', depart: '2026-08-01T22:59:59Z', notes: SORTIE_AUTO },
    ])
    expect(r.anomalie).toBe('sortie_oubliee')    // journée neutre, comme avant
    expect(r.heures).toBe(0)
  })

  it('ne reconstitue PAS une journée en cours (la personne travaille encore)', () => {
    const auj = new Date().toISOString().slice(0, 10)
    const r = calculerHeuresPointees([
      { arrivee: `${auj}T07:19:00Z`, depart: `${auj}T13:12:00Z` },
      { arrivee: `${auj}T14:00:00Z`, depart: null },        // encore au travail
    ])
    expect(r.anomalie).not.toBe('sortie_reconstituee')
    expect(r.tranches).toMatch(/–\?/)                       // affichée comme en cours
  })

  it('une journée complète normale n\'est pas touchée', () => {
    const r = calculerHeuresPointees([
      { arrivee: '2026-08-01T07:00:00Z', depart: '2026-08-01T12:00:00Z' },
      { arrivee: '2026-08-01T13:00:00Z', depart: '2026-08-01T16:30:00Z' },
    ])
    expect(r.anomalie).toBe(null)
    expect(r.heures).toBe(8.5)
    expect(r.nb_sessions).toBe(2)
  })
})

describe('sortie jamais pointée, fermée d\'office à minuit', () => {
  const employe = { id: 1, equipe: 'production', heures_jour_complet: 8.5 }
  const prevu = { statut: 'normal', heures_prevues: 8.5, label: 'Travail' }

  // Ici un SEUL badge de la journée : impossible de reconstituer une amplitude,
  // la journée reste donc neutre (cf. le describe précédent pour le cas à 2 badges).
  it('ne compte pas les heures de la session fermée d\'office', () => {
    const r = calculerHeuresPointees([
      { arrivee: '2026-08-01T16:13:00Z', depart: '2026-08-01T22:59:59Z', notes: SORTIE_AUTO },
    ])
    expect(r.heures).toBe(0)
    expect(r.anomalie).toBe('sortie_oubliee')
  })

  it('affiche « –? » au lieu de l\'heure inventée', () => {
    const r = calculerHeuresPointees([
      { arrivee: '2026-08-01T16:13:00Z', depart: '2026-08-01T22:59:59Z', notes: SORTIE_AUTO },
    ])
    expect(r.tranches).toMatch(/–\?$/)
  })

  it('rend la journée neutre : ni heures sup ni heures manquantes', () => {
    const pointe = calculerHeuresPointees([
      { arrivee: '2026-08-01T16:13:00Z', depart: '2026-08-01T22:59:59Z', notes: SORTIE_AUTO },
    ])
    const jour = calculerJour(prevu, pointe, employe)
    expect(jour.heures_sup).toBe(0)
    expect(jour.heures_manquantes).toBe(0)
    expect(jour.statut).toBe('normal')   // surtout pas « absent »
  })

  it('une journée normale reste calculée comme avant', () => {
    const pointe = calculerHeuresPointees([
      { arrivee: '2026-08-01T07:00:00Z', depart: '2026-08-01T16:30:00Z' },
    ])
    const jour = calculerJour(prevu, pointe, employe)
    expect(pointe.anomalie).toBe(null)
    expect(jour.heures_travaillees).toBe(9.5)
    expect(jour.heures_sup).toBe(1)
  })
})
