import { supabase } from './supabase'

// ============================================================
// CONSTANTES
// ============================================================

export const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Tolérance en minutes pour arrondir aux heures prévues
export const TOLERANCE_MIN = 2

// En-dessous, une "session" (ex. 17:36–17:37) est un double-pointage accidentel,
// pas une vraie présence : on ne la compte pas comme du temps travaillé.
export const MIN_SESSION_MIN = 5

// Seuil pour considérer une session "session avec pause" (équipe café)
// Si > 45 min entre 2 sessions = pause détectée
export const PAUSE_THRESHOLD_MIN = 45

// Marque (colonne pointages.notes) d'une session fermée d'office à minuit parce que
// la sortie n'a jamais été pointée. L'heure de départ est donc ARTIFICIELLE : on ne
// compte pas ses heures et on lève une anomalie → la journée devient neutre
// (ni heures sup ni heures manquantes, cf. calculerJour).
export const SORTIE_AUTO = 'sortie_auto_minuit'

// Le 31 juillet 2026, le temps de travail est passé à 8 h/jour et presque tout le
// monde a été basculé en équipe « café ». La fiche employé ne garde qu'UN réglage,
// sans date d'effet : sans cette règle, le nouveau recalculerait aussi juillet et
// tous les mois d'avant. AVANT cette date on applique donc l'ancien fonctionnement :
// 8,5 h fixes pour tout le monde, et le régime café réservé aux groupes qui y étaient
// vraiment (le champ `equipe` a été passé à 'cafe' en masse sur 38 des 42 employés).
// Groupes retenus avec Layla : serveurs, commerciales et ménage.
export const REGLAGE_AVANT = {
  date: '2026-07-31',
  heures: 8.50,
  groupes_cafe: ['Serveur', 'Commercial', 'Menage'],
}

/** Heures dues pour une journée complète, en tenant compte du changement du 31 juillet. */
export function heuresJourComplet(employe, date) {
  if (date && formatYMD(date) < REGLAGE_AVANT.date) return REGLAGE_AVANT.heures
  return Number(employe.heures_jour_complet || 8.50)
}

/** L'employé suit-il le régime café (8 h avec pause pointée, 9 h sinon) ce jour-là ? */
export function suitRegimeCafe(employe, date) {
  if (date && formatYMD(date) < REGLAGE_AVANT.date) {
    return REGLAGE_AVANT.groupes_cafe.includes(employe.groupe)
  }
  return employe.equipe === 'cafe'
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================

/**
 * Charge tout ce qu'il faut pour calculer le pointage du mois.
 */
export async function loadMonthData(mois, annee) {
  const [
    { data: employes },
    { data: feries },
    { data: pointages },
    { data: conges },
    { data: ajustements },
    { data: synthese },
    { data: allocationsRecup },
    { data: congesDemandes },
  ] = await Promise.all([
    supabase.from('employes').select('*').eq('actif', true).eq('fantome', false).order('nom'),
    supabase.from('jours_feries').select('*'),
    supabase.from('pointages').select('*')
      .gte('date_pointage', firstDay(mois, annee))
      .lte('date_pointage', lastDay(mois, annee)),
    supabase.from('conges').select('*')
      .eq('statut', 'valide')
      .lte('date_debut', lastDay(mois, annee))
      .gte('date_fin', firstDay(mois, annee)),
    supabase.from('pointages_ajustements').select('*')
      .gte('date_jour', firstDay(mois, annee))
      .lte('date_jour', lastDay(mois, annee)),
    supabase.from('pointages_mois').select('*')
      .eq('mois', mois).eq('annee', annee),
    // Jours de récup DÉJÀ crédités (allocation 'autre' datée du jour travaillé)
    // et demandes de congé en cours : servent à la vue « Récup & Absences » pour
    // savoir ce qui reste à régulariser.
    supabase.from('conges_allocations').select('employe_id, date_evt, jours, statut')
      .eq('type', 'autre')
      .gte('date_evt', firstDay(mois, annee))
      .lte('date_evt', lastDay(mois, annee)).limit(2000),
    supabase.from('conges').select('employe_id, date_debut, date_fin, type_conge, statut')
      .eq('statut', 'demande')
      .lte('date_debut', lastDay(mois, annee))
      .gte('date_fin', firstDay(mois, annee)).limit(2000),
  ])

  // Solde reporté du mois précédent
  const prevMois = mois === 1 ? 12 : mois - 1
  const prevAnnee = mois === 1 ? annee - 1 : annee
  const { data: prevSynthese } = await supabase
    .from('pointages_mois').select('employe_id, solde_mois')
    .eq('mois', prevMois).eq('annee', prevAnnee)

  // Conversions heures → jours du mois (retirées du solde d'heures, cf. calculerMois)
  const { data: conversions } = await supabase
    .from('heures_conversions').select('*')
    .eq('mois', mois).eq('annee', annee)

  // Le salaire net vit dans une table séparée (admin-only). On le rattache pour
  // le calcul de coût (réservé à l'admin) ; vide pour un non-admin (RLS).
  const { data: remu } = await supabase.from('employes_remuneration').select('employe_id, salaire_net')
  const salById = new Map((remu || []).map(r => [r.employe_id, r.salaire_net]))
  const employesAvecSalaire = (employes || []).map(e => ({ ...e, salaire_net: salById.has(e.id) ? salById.get(e.id) : null }))

  return {
    employes: employesAvecSalaire,
    feries: feries || [],
    pointages: pointages || [],
    conges: conges || [],
    ajustements: ajustements || [],
    synthese: synthese || [],
    prevSynthese: prevSynthese || [],
    conversions: conversions || [],
    allocationsRecup: allocationsRecup || [],
    congesDemandes: congesDemandes || [],
  }
}

// ============================================================
// HELPERS DATE
// ============================================================

export function firstDay(mois, annee) {
  return `${annee}-${String(mois).padStart(2, '0')}-01`
}

export function lastDay(mois, annee) {
  const d = new Date(annee, mois, 0)  // dernier jour du mois
  return `${annee}-${String(mois).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nbJoursDansMois(mois, annee) {
  return new Date(annee, mois, 0).getDate()
}

/**
 * Numéro de la semaine ISO d'une date (1-53).
 */
export function semaineISO(date) {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

/**
 * Retourne 'Paire' ou 'Impaire' selon la semaine ISO.
 */
export function paireOuImpaire(date) {
  return semaineISO(date) % 2 === 0 ? 'Paire' : 'Impaire'
}

/**
 * Nom du jour ('Dimanche', 'Lundi', ...) à partir d'une date.
 */
export function nomJour(date) {
  return JOURS_FR[date.getDay()]
}

// ============================================================
// CALCUL DU JOUR PRÉVU
// ============================================================

/**
 * Détermine ce qui est prévu ce jour pour cet employé.
 * Retourne : { statut, heures_prevues, label }
 *   statut : 'normal' | 'demi' | 'off' | 'ferie' | 'conge'
 */
export function statutPrevu(date, employe, feriesMap, congesByEmp) {
  const ymd = formatYMD(date)
  // Portés par `prevu` : calculerJour en a besoin (jours OFF/fériés/congés TRAVAILLÉS
  // et régime café) alors qu'il ne connaît pas la date.
  const hjc = heuresJourComplet(employe, date)
  const cafe = suitRegimeCafe(employe, date)

  // 1) Férié ?
  if (feriesMap.has(ymd)) {
    return { statut: 'ferie', heures_prevues: 0, label: feriesMap.get(ymd), heures_jour_complet: hjc, regime_cafe: cafe }
  }

  // 2) Congé ?
  const conges = congesByEmp.get(String(employe.id)) || []
  for (const c of conges) {
    if (ymd >= c.date_debut && ymd <= c.date_fin) {
      const typeLower = (c.type_conge || '').toLowerCase()
      const isMaladie = typeLower.includes('maladie') || typeLower.includes('malade') || typeLower.includes('sick')
      return {
        statut: 'conge',
        heures_prevues: 0,
        label: c.type_conge || 'Congé',
        isMaladie,
        heures_jour_complet: hjc, regime_cafe: cafe,
      }
    }
  }

  // 3) Selon le planning
  const jour = nomJour(date)
  let estOff = false
  let estDemi = false

  if (employe.planning_type === 'fixe') {
    if (employe.planning_jour_off === jour) estOff = true
    else if (employe.planning_demi_off === jour) estDemi = true
  } else if (employe.planning_type === 'alt') {
    const semaine = paireOuImpaire(date)
    if (semaine === 'Paire') {
      if (employe.planning_paire_off_1 === jour || employe.planning_paire_off_2 === jour) estOff = true
    } else {
      if (employe.planning_impaire_off_1 === jour || employe.planning_impaire_off_2 === jour) estOff = true
    }
  }

  if (estOff)  return { statut: 'off',    heures_prevues: 0,                                        label: 'OFF',          heures_jour_complet: hjc, regime_cafe: cafe }
  if (estDemi) return { statut: 'demi',   heures_prevues: Number(employe.heures_demi_journee || 4), label: 'Demi-journée', heures_jour_complet: hjc, regime_cafe: cafe }
  return         { statut: 'normal', heures_prevues: hjc,                                           label: 'Journée',      heures_jour_complet: hjc, regime_cafe: cafe }
}

// ============================================================
// CALCUL DES HEURES POINTÉES
// ============================================================

/**
 * Calcule les heures travaillées d'un jour à partir des pointages.
 * Détecte aussi les anomalies et le nombre de punchs (pour équipe café).
 *
 * @param {Array} sessions - [{arrivee, depart}, ...] pour la date
 * @returns { heures_travaillees, anomalie, nb_punchs, tranches_str }
 */
export function calculerHeuresPointees(sessions) {
  if (!sessions || sessions.length === 0) {
    return { heures: 0, anomalie: null, nb_punchs: 0, tranches: '—', nb_sessions: 0 }
  }

  // Filtrer sessions invalides
  const valid = sessions.filter(s => s.arrivee && s.depart)
  const incompletes = sessions.length - valid.length

  if (valid.length === 0) {
    return {
      heures: 0,
      anomalie: 'pointage_incomplet',
      nb_punchs: sessions.length,
      tranches: sessions.map(s => formatSession(s)).join(' ; '),
      nb_sessions: 0,
    }
  }

  let totalMin = 0
  let anomalie = null
  for (const s of valid) {
    // Sortie jamais pointée, fermée d'office à minuit : l'heure de départ est
    // inventée → on ne compte rien et on signale (la journée sera neutralisée).
    if (s.notes === SORTIE_AUTO) {
      anomalie = 'sortie_oubliee'
      continue
    }
    const dArr = new Date(s.arrivee)
    const dDep = new Date(s.depart)
    let diffMs = dDep - dArr
    if (diffMs < 0) {
      // Passage minuit ou erreur
      anomalie = 'duree_negative'
      continue
    }
    const diffMin = diffMs / 60000
    if (diffMin > 12 * 60) {
      anomalie = 'duree_excessive'
      continue
    }
    // Session trop courte (ex. 17:36–17:37) = double-pointage accidentel → on ne la compte
    // pas comme du temps travaillé (sinon = quasi journée entière en "heures manquantes").
    if (diffMin < MIN_SESSION_MIN) {
      anomalie = anomalie || 'pointage_incomplet'
      continue
    }
    totalMin += diffMin
  }

  if (incompletes > 0) {
    anomalie = anomalie || 'pointage_incomplet'
  }

  // Sortie oubliée en cours de journée (ex. « 08:19–14:12 ; 17:13–? » : le retour de
  // pause n'a pas été pointé, 17:13 est en fait le départ du soir). Plutôt que de
  // neutraliser la journée, on la reconstitue du PREMIER au DERNIER badge — ici
  // 08:19 → 17:13. La pause non pointée est donc comptée comme du temps de présence,
  // ce que le régime café compense en exigeant 9 h ce jour-là.
  const reconstitue = amplitudeSiBadgeManquant(sessions)
  if (reconstitue !== null) {
    return {
      heures: round2(reconstitue.minutes / 60),
      anomalie: 'sortie_reconstituee',
      nb_punchs: sessions.length * 2 - 1,
      tranches: formatHM(reconstitue.debut) + '–' + formatHM(reconstitue.fin) + ' (reconstitué)',
      nb_sessions: 1,
    }
  }

  return {
    heures: round2(totalMin / 60),
    anomalie,
    nb_punchs: valid.length * 2 + incompletes,  // 2 punchs par session complète
    // Affiche TOUTES les sessions (dont celles encore ouvertes « HH:MM–? »), triées,
    // pour voir une personne encore présente (pointée à l'entrée, pas encore sortie).
    tranches: sessions.slice()
      .sort((a, b) => new Date(a.arrivee || a.depart) - new Date(b.arrivee || b.depart))
      .map(s => formatSession(s)).join(' ; '),
    nb_sessions: valid.length,
  }
}

/**
 * Journée à laquelle il manque un badge : le dernier pointage de la journée n'a pas
 * de vraie sortie (jamais pointée, ou fermée d'office à minuit) alors qu'il y a eu
 * au moins un autre badge avant. On retient alors l'amplitude premier → dernier badge.
 * Retourne { debut, fin, minutes } ou null si la journée ne correspond pas à ce cas.
 */
function amplitudeSiBadgeManquant(sessions) {
  const tri = sessions.slice()
    .filter(s => s.arrivee)
    .sort((a, b) => new Date(a.arrivee) - new Date(b.arrivee))
  if (tri.length < 2) return null                        // un seul badge : rien à reconstituer

  // Attention à ne PAS reconstituer une journée en cours : une session encore ouverte
  // aujourd'hui, c'est quelqu'un qui travaille toujours — pas une sortie oubliée.
  const derniere = tri[tri.length - 1]
  const jourFini = formatYMD(new Date(derniere.arrivee)) < formatYMD(new Date())
  const sortieManquante = derniere.notes === SORTIE_AUTO || (!derniere.depart && jourFini)
  if (!sortieManquante) return null

  // Les sessions précédentes doivent être complètes, sinon la journée est trop
  // abîmée pour être devinée (on la laisse en anomalie neutre).
  const avant = tri.slice(0, -1)
  if (avant.some(s => !s.depart || s.notes === SORTIE_AUTO)) return null

  const debut = new Date(tri[0].arrivee)
  const fin = new Date(derniere.arrivee)
  const minutes = (fin - debut) / 60000
  if (minutes <= 0 || minutes > 16 * 60) return null     // incohérent : on ne devine pas
  return { debut, fin, minutes }
}

function formatSession(s) {
  const a = s.arrivee ? new Date(s.arrivee) : null
  const d = s.depart ? new Date(s.depart) : null
  // Fermeture d'office à minuit : ne pas afficher l'heure inventée, montrer qu'il manque la sortie.
  if (s.notes === SORTIE_AUTO) return (a ? formatHM(a) : '?') + '–?'
  if (!a) return '?–' + (d ? formatHM(d) : '?')
  if (!d) return formatHM(a) + '–?'
  return formatHM(a) + '–' + formatHM(d)
}

function formatHM(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
}

// ============================================================
// CALCUL FINAL D'UN JOUR
// ============================================================

/**
 * Calcul du résultat d'un jour : sup/manquantes/recup.
 *
 * @param {Object} prevu - { statut, heures_prevues, label }
 * @param {Object} pointe - { heures, anomalie, nb_punchs, tranches, nb_sessions }
 * @param {Object} employe
 * @returns { heures_prevues_finale, heures_travaillees, heures_sup, heures_manquantes, jours_recup, statut, label, anomalie, tranches }
 */
export function calculerJour(prevu, pointe, employe) {
  let heures_prevues = prevu.heures_prevues
  let heures_travaillees = pointe.heures
  let heures_sup = 0
  let heures_manquantes = 0
  let jours_recup = 0
  let statut = prevu.statut
  let label = prevu.label
  let anomalie = pointe.anomalie

  // Cas équipe café : ajuster prévu selon nb sessions.
  // `prevu.regime_cafe` tient compte de la date (cf. REGLAGE_AVANT) ; le repli sur
  // `employe.equipe` sert aux appels qui ne passent pas par statutPrevu.
  const estCafe = prevu.regime_cafe ?? (employe.equipe === 'cafe')
  if (estCafe && prevu.statut === 'normal') {
    if (pointe.nb_sessions >= 2) {
      heures_prevues = 8.00  // pause détectée → 8h
    } else {
      heures_prevues = 9.00  // pas de pause pointée → 9h
    }
  }

  // Tolérance ±2 min : si très proche du prévu, on arrondit
  if (pointe.heures > 0 && Math.abs(pointe.heures - heures_prevues) <= TOLERANCE_MIN / 60) {
    heures_travaillees = heures_prevues
  }

  // Anomalies : pointage incomplet/anormal sur jour normal OU demi-journée → on met prévu
  // (la personne a bien pointé, juste un oubli de départ : on ne la pénalise pas).
  // Exception : 'sortie_reconstituee' — les heures ont pu être retrouvées du premier au
  // dernier badge, on garde donc ce vrai temps de présence au lieu de neutraliser.
  if (anomalie && anomalie !== 'sortie_reconstituee' && (prevu.statut === 'normal' || prevu.statut === 'demi')) {
    heures_travaillees = heures_prevues
  }

  // ─── CAS 1 : Jour normal / demi-journée
  if (prevu.statut === 'normal' || prevu.statut === 'demi') {
    // Absent UNIQUEMENT si AUCUN pointage du tout (ni session complète, ni punch isolé).
    // Règle : dès qu'il y a un pointage, la personne n'est jamais comptée absente.
    if (heures_travaillees === 0 && pointe.nb_sessions === 0 && (pointe.nb_punchs || 0) === 0) {
      // Absent : on garde prévues affichées mais manquantes = 0 (sera affiché '—')
      statut = 'absent'
      label = 'Absent'
      heures_manquantes = 0
    } else if (heures_travaillees >= heures_prevues) {
      heures_sup = round2(heures_travaillees - heures_prevues)
    } else {
      heures_manquantes = round2(heures_prevues - heures_travaillees)
    }
  }

  // ─── CAS 2 : Jour OFF travaillé
  // Nouvelle règle : prévu = 8.50h (journée complète), récup + sup/manquantes selon écart
  else if (prevu.statut === 'off' && heures_travaillees > 0) {
    statut = 'off_travaille'
    label = 'OFF travaillé'
    jours_recup = 1
    heures_prevues = Number(prevu.heures_jour_complet || employe.heures_jour_complet || 8.50)
    if (heures_travaillees >= heures_prevues) {
      heures_sup = round2(heures_travaillees - heures_prevues)
    } else {
      heures_manquantes = round2(heures_prevues - heures_travaillees)
    }
  }

  // ─── CAS 3 : Férié travaillé (même logique que OFF)
  else if (prevu.statut === 'ferie' && heures_travaillees > 0) {
    statut = 'ferie_travaille'
    label = label + ' (travaillé)'
    jours_recup = 1
    heures_prevues = Number(prevu.heures_jour_complet || employe.heures_jour_complet || 8.50)
    if (heures_travaillees >= heures_prevues) {
      heures_sup = round2(heures_travaillees - heures_prevues)
    } else {
      heures_manquantes = round2(heures_prevues - heures_travaillees)
    }
  }

  // ─── CAS 4 : Congé travaillé (même logique que OFF, sauf maladie qui ne donne pas de récup)
  else if (prevu.statut === 'conge' && heures_travaillees > 0) {
    statut = 'conge_travaille'
    label = label + ' (travaillé)'
    jours_recup = prevu.isMaladie ? 0 : 1  // ⚠️ pas de récup si maladie
    heures_prevues = Number(prevu.heures_jour_complet || employe.heures_jour_complet || 8.50)
    if (heures_travaillees >= heures_prevues) {
      heures_sup = round2(heures_travaillees - heures_prevues)
    } else {
      heures_manquantes = round2(heures_prevues - heures_travaillees)
    }
  }

  return {
    heures_prevues: round2(heures_prevues),
    heures_travaillees: round2(heures_travaillees),
    heures_sup,
    heures_manquantes,
    jours_recup,
    statut,
    label,
    anomalie,
    tranches: pointe.tranches,
    nb_sessions: pointe.nb_sessions,
  }
}

// ============================================================
// CALCUL MENSUEL COMPLET (un employé sur le mois)
// ============================================================

/**
 * Calcule le journal complet du mois pour un employé.
 */
export function calculerMois(employe, mois, annee, data) {
  const { feries, pointages, conges, ajustements, prevSynthese, conversions = [] } = data

  // Index : férié date -> nom
  const feriesMap = new Map()
  for (const f of feries) feriesMap.set(f.date, f.nom)

  // Index : congés par employé
  const congesByEmp = new Map()
  for (const c of conges) {
    const cid = String(c.employe_id)
    if (!congesByEmp.has(cid)) congesByEmp.set(cid, [])
    congesByEmp.get(cid).push(c)
  }

  // Comparaison d'id tolérante au type : Supabase renvoie les bigint en STRING ("4")
  // et les int en NUMBER (4) → l'égalité stricte échouait et ignorait les pointages.
  const empId = String(employe.id)
  // Index : pointages par employé+date
  const pointagesByDate = new Map()
  for (const p of pointages) {
    if (String(p.employe_id) !== empId) continue
    const key = p.date_pointage
    if (!pointagesByDate.has(key)) pointagesByDate.set(key, [])
    pointagesByDate.get(key).push({
      id: p.id,
      arrivee: p.arrivee,
      depart: p.depart,
      notes: p.notes,
    })
  }

  // Index : ajustements par date
  const ajustByDate = new Map()
  for (const a of ajustements) {
    if (String(a.employe_id) !== empId) continue
    const key = a.date_jour
    if (!ajustByDate.has(key)) ajustByDate.set(key, {})
    ajustByDate.get(key)[a.champ] = a.valeur
  }

  // Solde reporté du mois précédent.
  // RÈGLE : seul un solde NÉGATIF (dette d'heures) se reporte. Un solde POSITIF
  // (heures sup) NE se reporte PAS (remis à 0) car les heures sup sont déjà payées.
  const prev = prevSynthese.find(s => String(s.employe_id) === empId)
  const prevSolde = prev ? Number(prev.solde_mois) : 0
  const solde_reporte = prevSolde < 0 ? prevSolde : 0

  // Boucle sur tous les jours du mois
  const journal = []
  const nbJours = nbJoursDansMois(mois, annee)
  let total = {
    prevues: 0, travaillees: 0, sup: 0, manquantes: 0, recup: 0,
    absents: 0, travailles: 0,
  }

  for (let j = 1; j <= nbJours; j++) {
    const date = new Date(annee, mois - 1, j)
    const ymd = formatYMD(date)

    const prevu = statutPrevu(date, employe, feriesMap, congesByEmp)
    const sessions = pointagesByDate.get(ymd) || []
    const pointe = calculerHeuresPointees(sessions)
    let resultat = calculerJour(prevu, pointe, employe)

    // Appliquer les ajustements manuels (avec recalcul auto)
    const ajusts = ajustByDate.get(ymd)
    if (ajusts) {
      // 1) D'abord appliquer les valeurs sources (prévues, travaillées)
      const a_prevues = ajusts.heures_prevues !== undefined ? round2(Number(ajusts.heures_prevues)) : null
      const a_travail = ajusts.heures_travaillees !== undefined ? round2(Number(ajusts.heures_travaillees)) : null
      const a_sup_override     = ajusts.heures_sup !== undefined        ? round2(Number(ajusts.heures_sup))        : null
      const a_manq_override    = ajusts.heures_manquantes !== undefined ? round2(Number(ajusts.heures_manquantes)) : null
      const a_recup_override   = ajusts.jours_recup !== undefined       ? round2(Number(ajusts.jours_recup))       : null

      if (a_prevues !== null)  resultat.heures_prevues = a_prevues
      if (a_travail !== null)  resultat.heures_travaillees = a_travail

      // 2) Recalculer sup/manquantes/récup à partir des valeurs courantes (sauf si override explicite)
      const isOffType = ['off', 'off_travaille', 'ferie', 'ferie_travaille', 'conge', 'conge_travaille'].includes(resultat.statut)
      const prevu = resultat.heures_prevues
      const travail = resultat.heures_travaillees

      if (a_sup_override !== null) {
        resultat.heures_sup = a_sup_override
      } else {
        // Recalcul auto
        resultat.heures_sup = travail > prevu ? round2(travail - prevu) : 0
      }

      if (a_manq_override !== null) {
        resultat.heures_manquantes = a_manq_override
      } else {
        // Recalcul auto
        if (travail === 0 && resultat.statut !== 'off' && resultat.statut !== 'ferie' && resultat.statut !== 'conge') {
          resultat.heures_manquantes = prevu  // Absent
        } else {
          resultat.heures_manquantes = travail < prevu ? round2(prevu - travail) : 0
        }
      }

      if (a_recup_override !== null) {
        resultat.jours_recup = a_recup_override
      }
      // Si pas override, on garde la valeur calculée initiale (donc jours_recup reste tel que calculé)

      if (ajusts.statut !== undefined) {
        resultat.statut = ajusts.statut
        // Si statut forcé à 'present', mettre à jour le label en conséquence
        if (ajusts.statut === 'present') resultat.label = 'Présent'
      }
    }

    journal.push({
      date: ymd,
      jour_semaine: nomJour(date).slice(0, 3),
      jour_num: j,
      sessions,
      ...resultat,
    })

    total.prevues     += resultat.heures_prevues
    total.travaillees += resultat.heures_travaillees
    total.sup         += resultat.heures_sup
    total.manquantes  += resultat.heures_manquantes
    total.recup       += resultat.jours_recup
    if (resultat.statut === 'absent') total.absents++
    else if (resultat.heures_travaillees > 0) total.travailles++
  }

  // Heures déjà converties en jours (récup / décompte). Elles sortent du SOLDE,
  // pas des totaux d'heures du mois : « heures sup » et « heures manquantes »
  // restent le reflet de ce qui a été réellement travaillé.
  // C'est bien le SOLDE qu'on convertit (règle Layla, 19/08/2026) — le déduire
  // des totaux ne pouvait pas absorber un report négatif du mois précédent.
  const convEmp = (conversions || []).filter(c => String(c.employe_id) === empId)
  const supConverti  = convEmp.reduce((s, c) => s + Number(c.sup_heures  || 0), 0)
  const manqConverti = convEmp.reduce((s, c) => s + Number(c.manq_heures || 0), 0)
  const heures_converties = round2(supConverti - manqConverti)

  // Solde du mois = sup - manquantes + solde reporté - ce qui a été converti en jours
  const solde_brut = round2(total.sup - total.manquantes)
  const solde_mois = round2(solde_brut + solde_reporte - heures_converties)

  return {
    employe,
    journal,
    synthese: {
      heures_prevues: round2(total.prevues),
      heures_travaillees: round2(total.travaillees),
      heures_sup: round2(total.sup),
      heures_manquantes: round2(total.manquantes),
      jours_recup: round2(total.recup),
      jours_absents: total.absents,
      jours_travailles: total.travailles,
      solde_reporte_precedent: round2(solde_reporte),
      heures_converties,
      solde_mois,
    },
  }
}

// ============================================================
// SAUVEGARDE / AJUSTEMENT
// ============================================================

// Convertit des heures (sup et/ou manquantes) en jours. 8 h = 1 jour.
//  - heures sup      → allocation récup (+jours) dans conges_allocations
//  - heures manquantes → allocation décompte (−jours) dans conges_allocations
// Enregistre la conversion (heures_conversions) → les heures sont retirées du
// solde du mois par calculerMois (pas de double comptage). Tout est réversible
// (annuler l'allocation + supprimer la ligne de conversion).
// modeManq : 'recup' (par défaut) retire les jours de la récup via une allocation
// négative ; 'sans_solde' ne crée AUCUNE allocation — les jours ne sont pas payés
// mais les congés de l'employé ne bougent pas. On les reconnaît ensuite à
// alloc_manq_id vide (pas besoin d'une colonne en plus).
export async function convertirHeuresEnJours({ employe, mois, annee, supHeures = 0, manqHeures = 0, modeManq = 'recup', moisLabel, userId }) {
  const HRS_PAR_JOUR = 8
  const r2 = n => Math.round(n * 100) / 100
  const dateEvt = `${annee}-${String(mois).padStart(2, '0')}-01`
  const enJours = h => r2(h / HRS_PAR_JOUR)

  // Reconvertir un mois déjà converti CUMULE dans la même ligne, au lieu
  // d'empiler une conversion (et une allocation) de plus.
  // On ne regroupe que ce qui est de même nature : une ligne « sans solde » ne
  // se mélange pas avec une ligne « récup » — elles ne se traduisent pas pareil.
  const natureDe = c => (Number(c.manq_heures) > 0 && !c.alloc_manq_id) ? 'sans_solde' : 'recup'
  const nature = (manqHeures > 0 && modeManq === 'sans_solde') ? 'sans_solde' : 'recup'

  const { data: dejaLa } = await supabase.from('heures_conversions')
    .select('*').eq('employe_id', employe.id).eq('mois', mois).eq('annee', annee)
  const ligne = (dejaLa || []).find(c => natureDe(c) === nature) || null

  const totalSup  = r2((ligne ? Number(ligne.sup_heures)  : 0) + supHeures)
  const totalManq = r2((ligne ? Number(ligne.manq_heures) : 0) + manqHeures)

  // --- allocation des heures sup (toujours de la récup) ---
  let alloc_sup_id = ligne?.alloc_sup_id || null
  if (totalSup > 0) {
    const payload = {
      employe_id: employe.id, annee, type: 'autre', jours: enJours(totalSup),
      raison: `Conversion solde ${moisLabel} : +${totalSup} h → +${enJours(totalSup)} j récup`,
      date_evt: dateEvt, source: 'manuel', statut: 'valide', created_by: userId,
    }
    if (alloc_sup_id) {
      const { error } = await supabase.from('conges_allocations')
        .update({ jours: payload.jours, raison: payload.raison }).eq('id', alloc_sup_id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('conges_allocations').insert(payload).select('id').single()
      if (error) throw error
      alloc_sup_id = data.id
    }
  }

  // --- heures manquantes : retirées de la récup, ou passées en sans solde ---
  let alloc_manq_id = ligne?.alloc_manq_id || null
  if (totalManq > 0 && nature === 'recup') {
    const payload = {
      employe_id: employe.id, annee, type: 'autre', jours: -enJours(totalManq),
      raison: `Conversion solde ${moisLabel} : −${totalManq} h → −${enJours(totalManq)} j récup`,
      date_evt: dateEvt, source: 'manuel', statut: 'valide', created_by: userId,
    }
    if (alloc_manq_id) {
      const { error } = await supabase.from('conges_allocations')
        .update({ jours: payload.jours, raison: payload.raison }).eq('id', alloc_manq_id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('conges_allocations').insert(payload).select('id').single()
      if (error) throw error
      alloc_manq_id = data.id
    }
  }

  const row = {
    employe_id: employe.id, mois, annee,
    sup_heures: totalSup, manq_heures: totalManq,
    alloc_sup_id, alloc_manq_id, created_by: userId,
  }
  const { error: e2 } = ligne
    ? await supabase.from('heures_conversions').update(row).eq('id', ligne.id)
    : await supabase.from('heures_conversions').insert(row)
  if (e2) throw e2
}

/**
 * Annule une conversion : supprime la ligne ET la ou les allocations créées.
 * Les heures reviennent aussitôt au solde du mois (calculerMois ne les retire
 * plus). Sans ça, une conversion passée en « sans solde » était irrattrapable :
 * elle ne crée aucune allocation, il n'y avait donc rien à annuler côté Congés.
 */
export async function annulerConversion(conv) {
  const ids = [conv.alloc_sup_id, conv.alloc_manq_id].filter(Boolean)
  if (ids.length) {
    const { error } = await supabase.from('conges_allocations').delete().in('id', ids)
    if (error) throw error
  }
  const { error: e2 } = await supabase.from('heures_conversions').delete().eq('id', conv.id)
  if (e2) throw e2
}

/**
 * Enregistre un ajustement manuel sur une cellule.
 */
export async function setAjustement(employeId, dateJour, champ, valeur, userId) {
  const { error } = await supabase
    .from('pointages_ajustements')
    .upsert({
      employe_id: employeId,
      date_jour: dateJour,
      champ,
      valeur: String(valeur),
      created_by: userId,
    }, { onConflict: 'employe_id,date_jour,champ' })
  if (error) throw error
}

/**
 * Supprime un ajustement (retour à la valeur calculée).
 */
export async function removeAjustement(employeId, dateJour, champ) {
  const { error } = await supabase
    .from('pointages_ajustements')
    .delete()
    .eq('employe_id', employeId)
    .eq('date_jour', dateJour)
    .eq('champ', champ)
  if (error) throw error
}

/**
 * Met à jour un pointage (modification d'horaire).
 */
export async function updatePointage(id, updates, userId) {
  const { error } = await supabase
    .from('pointages')
    .update({ ...updates, source: 'manuel', updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Remplace toutes les sessions de pointage d'un jour pour un employé.
 * Sessions = [{ id?, arrivee, depart }]
 * Si id présent, update. Sinon, insert.
 * Les sessions existantes pas dans la liste sont supprimées.
 */
export async function upsertPointagesDuJour(employeId, date, sessions, userId) {
  // 1) Charger les pointages existants du jour
  const { data: existing } = await supabase
    .from('pointages')
    .select('id')
    .eq('employe_id', employeId)
    .eq('date_pointage', date)

  const existingIds = new Set((existing || []).map(p => p.id))
  const sentIds = new Set(sessions.filter(s => s.id).map(s => s.id))

  // 2) Supprimer ceux qui ne sont plus dans la liste
  const toDelete = Array.from(existingIds).filter(id => !sentIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('pointages').delete().in('id', toDelete)
  }

  // 3) Update / Insert
  for (const s of sessions) {
    if (s.id) {
      await supabase.from('pointages')
        .update({
          arrivee: s.arrivee,
          depart: s.depart,
          source: 'manuel',
          notes: null,   // saisie à la main = l'heure n'est plus artificielle, le jour redevient calculé
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.id)
    } else {
      await supabase.from('pointages').insert({
        employe_id: employeId,
        date_pointage: date,
        arrivee: s.arrivee,
        depart: s.depart,
        source: 'manuel',
        updated_by: userId,
      })
    }
  }
}

/**
 * Valide un mois pour un employé : enregistre dans pointages_mois.
 */
export async function validerMois(employeId, mois, annee, syntheseObj, journal, userId) {
  const { error } = await supabase
    .from('pointages_mois')
    .upsert({
      employe_id: employeId,
      mois, annee,
      heures_prevues: syntheseObj.heures_prevues,
      heures_travaillees: syntheseObj.heures_travaillees,
      heures_sup: syntheseObj.heures_sup,
      heures_manquantes: syntheseObj.heures_manquantes,
      solde_reporte_precedent: syntheseObj.solde_reporte_precedent,
      solde_mois: syntheseObj.solde_mois,
      jours_recuperation: syntheseObj.jours_recup,
      jours_absents: syntheseObj.jours_absents,
      jours_travailles: syntheseObj.jours_travailles,
      valide: true,
      valide_at: new Date().toISOString(),
      valide_by: userId,
      journal_jsonb: journal,
    }, { onConflict: 'employe_id,mois,annee' })
  if (error) throw error
}

// ============================================================
// SYNC ODOO
// ============================================================

/**
 * Appelle l'API /api/pointage-api?action=sync-attendance
 */
export async function syncAttendance(mois, annee) {
  const resp = await fetch('/api/pointage-api?action=sync-attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mois, annee }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${resp.status}`)
  }
  return resp.json()
}

export async function syncLeaves(mois, annee) {
  const resp = await fetch('/api/pointage-api?action=sync-leaves', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mois, annee }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${resp.status}`)
  }
  return resp.json()
}

// ============================================================
// UTILS
// ============================================================

function round2(v) {
  return Math.round(Number(v) * 100) / 100
}

function formatYMD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
