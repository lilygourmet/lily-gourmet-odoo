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

  // Anomalies : pointage incomplet/anormal sur jour normal OU demi-journée → on met prévu
  // (la personne a bien pointé, juste un oubli de départ : on ne la pénalise pas).
  if (anomalie && (prevu.statut === 'normal' || prevu.statut === 'demi')) {
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
    heures_prevues = Number(employe.heures_jour_complet || 8.50)
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
    heures_prevues = Number(employe.heures_jour_complet || 8.50)
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
    heures_prevues = Number(employe.heures_jour_complet || 8.50)
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

  // Retirer les heures DÉJÀ converties en jours (récup / décompte) pour ne pas
  // les compter deux fois (en heures ET en jours).
  const convEmp = (conversions || []).filter(c => String(c.employe_id) === empId)
  if (convEmp.length) {
    const supConverti  = convEmp.reduce((s, c) => s + Number(c.sup_heures  || 0), 0)
    const manqConverti = convEmp.reduce((s, c) => s + Number(c.manq_heures || 0), 0)
    total.sup        = Math.max(0, round2(total.sup - supConverti))
    total.manquantes = Math.max(0, round2(total.manquantes - manqConverti))
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

// Convertit des heures (sup et/ou manquantes) en jours. 8 h = 1 jour.
//  - heures sup      → allocation récup (+jours) dans conges_allocations
//  - heures manquantes → allocation décompte (−jours) dans conges_allocations
// Enregistre la conversion (heures_conversions) → les heures sont retirées du
// solde du mois par calculerMois (pas de double comptage). Tout est réversible
// (annuler l'allocation + supprimer la ligne de conversion).
export async function convertirHeuresEnJours({ employe, mois, annee, supHeures = 0, manqHeures = 0, moisLabel, userId }) {
  const HRS_PAR_JOUR = 8
  const r2 = n => Math.round(n * 100) / 100
  const dateEvt = `${annee}-${String(mois).padStart(2, '0')}-01`
  let alloc_sup_id = null, alloc_manq_id = null

  if (supHeures > 0) {
    const { data, error } = await supabase.from('conges_allocations').insert({
      employe_id: employe.id, annee, type: 'autre', jours: r2(supHeures / HRS_PAR_JOUR),
      raison: `Conversion ${r2(supHeures)} h sup → récup · ${moisLabel}`,
      date_evt: dateEvt, source: 'manuel', statut: 'valide', created_by: userId,
    }).select('id').single()
    if (error) throw error
    alloc_sup_id = data.id
  }
  if (manqHeures > 0) {
    const { data, error } = await supabase.from('conges_allocations').insert({
      employe_id: employe.id, annee, type: 'autre', jours: -r2(manqHeures / HRS_PAR_JOUR),
      raison: `Conversion ${r2(manqHeures)} h manquantes → décompte · ${moisLabel}`,
      date_evt: dateEvt, source: 'manuel', statut: 'valide', created_by: userId,
    }).select('id').single()
    if (error) throw error
    alloc_manq_id = data.id
  }
  const { error: e2 } = await supabase.from('heures_conversions').insert({
    employe_id: employe.id, mois, annee,
    sup_heures: r2(supHeures), manq_heures: r2(manqHeures),
    alloc_sup_id, alloc_manq_id, created_by: userId,
  })
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
