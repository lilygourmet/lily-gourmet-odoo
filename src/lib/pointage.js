import { supabase } from './supabase'

// ============================================================
// CONSTANTES
// ============================================================

export const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Tolérance en minutes pour arrondir aux heures prévues
export const TOLERANCE_MIN = 2

// Seuil pour considérer une session "session avec pause" (équipe café)
// Si > 45 min entre 2 sessions = pause détectée
export const PAUSE_THRESHOLD_MIN = 45

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
  ] = await Promise.all([
    supabase.from('employes').select('*').eq('actif', true).order('nom'),
    supabase.from('jours_feries').select('*'),
    supabase.from('pointages').select('*')
      .gte('date_pointage', firstDay(mois, annee))
      .lte('date_pointage', lastDay(mois, annee)),
    supabase.from('conges').select('*')
      .lte('date_debut', lastDay(mois, annee))
      .gte('date_fin', firstDay(mois, annee)),
    supabase.from('pointages_ajustements').select('*')
      .gte('date_jour', firstDay(mois, annee))
      .lte('date_jour', lastDay(mois, annee)),
    supabase.from('pointages_mois').select('*')
      .eq('mois', mois).eq('annee', annee),
  ])

  // Solde reporté du mois précédent
  const prevMois = mois === 1 ? 12 : mois - 1
  const prevAnnee = mois === 1 ? annee - 1 : annee
  const { data: prevSynthese } = await supabase
    .from('pointages_mois').select('employe_id, solde_mois')
    .eq('mois', prevMois).eq('annee', prevAnnee)

  return {
    employes: employes || [],
    feries: feries || [],
    pointages: pointages || [],
    conges: conges || [],
    ajustements: ajustements || [],
    synthese: synthese || [],
    prevSynthese: prevSynthese || [],
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

  // 1) Férié ?
  if (feriesMap.has(ymd)) {
    return { statut: 'ferie', heures_prevues: 0, label: feriesMap.get(ymd) }
  }

  // 2) Congé ?
  const conges = congesByEmp.get(employe.id) || []
  for (const c of conges) {
    if (ymd >= c.date_debut && ymd <= c.date_fin) {
      return { statut: 'conge', heures_prevues: 0, label: c.type_conge || 'Congé' }
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

  if (estOff)  return { statut: 'off',    heures_prevues: 0,                                          label: 'OFF' }
  if (estDemi) return { statut: 'demi',   heures_prevues: Number(employe.heures_demi_journee || 4),   label: 'Demi-journée' }
  return         { statut: 'normal', heures_prevues: Number(employe.heures_jour_complet || 8.50), label: 'Journée' }
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
    totalMin += diffMin
  }

  if (incompletes > 0) {
    anomalie = anomalie || 'pointage_incomplet'
  }

  return {
    heures: round2(totalMin / 60),
    anomalie,
    nb_punchs: valid.length * 2 + incompletes,  // 2 punchs par session complète
    tranches: valid.map(s => formatSession(s)).join(' ; '),
    nb_sessions: valid.length,
  }
}

function formatSession(s) {
  const a = s.arrivee ? new Date(s.arrivee) : null
  const d = s.depart ? new Date(s.depart) : null
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

  // Cas équipe café : ajuster prévu selon nb sessions
  if (employe.equipe === 'cafe' && prevu.statut === 'normal') {
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

  // Anomalies : pointage incomplet/anormal sur jour normal → on met prévu
  if (anomalie && prevu.statut === 'normal') {
    heures_travaillees = heures_prevues
  }

  // ─── CAS 1 : Jour normal / demi-journée
  if (prevu.statut === 'normal' || prevu.statut === 'demi') {
    if (heures_travaillees === 0 && pointe.nb_sessions === 0) {
      // Absent
      statut = 'absent'
      label = 'Absent'
      heures_manquantes = heures_prevues
    } else if (heures_travaillees >= heures_prevues) {
      heures_sup = round2(heures_travaillees - heures_prevues)
    } else {
      heures_manquantes = round2(heures_prevues - heures_travaillees)
    }
  }

  // ─── CAS 2 : Jour OFF travaillé
  else if (prevu.statut === 'off' && heures_travaillees > 0) {
    statut = 'off_travaille'
    label = 'OFF travaillé'
    jours_recup = 1
    heures_sup = round2(heures_travaillees)  // toutes les heures = sup
  }

  // ─── CAS 3 : Férié travaillé
  else if (prevu.statut === 'ferie' && heures_travaillees > 0) {
    statut = 'ferie_travaille'
    label = label + ' (travaillé)'
    jours_recup = 1
    heures_sup = round2(heures_travaillees)
  }

  // ─── CAS 4 : Congé avec pointage (rare)
  else if (prevu.statut === 'conge' && heures_travaillees > 0) {
    statut = 'conge_travaille'
    label = label + ' (travaillé)'
    jours_recup = 1
    heures_sup = round2(heures_travaillees)
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
  const { feries, pointages, conges, ajustements, prevSynthese } = data

  // Index : férié date -> nom
  const feriesMap = new Map()
  for (const f of feries) feriesMap.set(f.date, f.nom)

  // Index : congés par employé
  const congesByEmp = new Map()
  for (const c of conges) {
    if (!congesByEmp.has(c.employe_id)) congesByEmp.set(c.employe_id, [])
    congesByEmp.get(c.employe_id).push(c)
  }

  // Index : pointages par employé+date
  const pointagesByDate = new Map()
  for (const p of pointages) {
    if (p.employe_id !== employe.id) continue
    const key = p.date_pointage
    if (!pointagesByDate.has(key)) pointagesByDate.set(key, [])
    pointagesByDate.get(key).push({
      id: p.id,
      arrivee: p.arrivee,
      depart: p.depart,
    })
  }

  // Index : ajustements par date
  const ajustByDate = new Map()
  for (const a of ajustements) {
    if (a.employe_id !== employe.id) continue
    const key = a.date_jour
    if (!ajustByDate.has(key)) ajustByDate.set(key, {})
    ajustByDate.get(key)[a.champ] = a.valeur
  }

  // Solde reporté du mois précédent
  const prev = prevSynthese.find(s => s.employe_id === employe.id)
  const solde_reporte = prev ? Number(prev.solde_mois) : 0

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

    // Appliquer les ajustements manuels
    const ajusts = ajustByDate.get(ymd)
    if (ajusts) {
      if (ajusts.heures_travaillees !== undefined) resultat.heures_travaillees = round2(Number(ajusts.heures_travaillees))
      if (ajusts.heures_prevues !== undefined)     resultat.heures_prevues     = round2(Number(ajusts.heures_prevues))
      if (ajusts.heures_sup !== undefined)         resultat.heures_sup         = round2(Number(ajusts.heures_sup))
      if (ajusts.heures_manquantes !== undefined)  resultat.heures_manquantes  = round2(Number(ajusts.heures_manquantes))
      if (ajusts.jours_recup !== undefined)        resultat.jours_recup        = round2(Number(ajusts.jours_recup))
      if (ajusts.statut !== undefined)             resultat.statut             = ajusts.statut
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

  // Solde du mois = sup - manquantes + solde reporté
  const solde_brut = round2(total.sup - total.manquantes)
  const solde_mois = round2(solde_brut + solde_reporte)

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
      solde_mois,
    },
  }
}

// ============================================================
// SAUVEGARDE / AJUSTEMENT
// ============================================================

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
