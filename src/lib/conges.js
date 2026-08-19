// ============================================================
// Gestion des congés (workflow demande → validation → notif WATI).
// L'app devient la source de vérité (Odoo n'est plus utilisé pour la saisie).
// ============================================================

import { supabase } from './supabase'
import { compteFeriesHorsOff } from './joursFeries'

// ------------------------------------------------------------
// CONSTANTES — règles métier
// ------------------------------------------------------------
const QUOTA_BASE          = 18    // jours par an
const BONUS_5_ANS         = 1.5   // jours supplémentaires à partir de 5 ans d'ancienneté
const BONUS_10_ANS        = 1.5   // jours supplémentaires en plus à partir de 10 ans
const MOIS_AVANT_PRISE    = 6     // un nouvel employé ne peut prendre congé qu'après 6 mois
const RELIQUAT_DEADLINE_MM_DD = '05-31'  // le reliquat N-1 expire le 30 mai à minuit (donc dispo jusqu'au 30 mai inclus)

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function moisEntre(dateA, dateB) {
  // Nombre de mois entiers entre A et B (B > A), en année×12 + diff de mois.
  const a = new Date(dateA + 'T00:00:00')
  const b = new Date(dateB + 'T00:00:00')
  if (isNaN(a) || isNaN(b)) return 0
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) m -= 1   // mois non complet
  return Math.max(0, m)
}

// Quota annuel pour un employé.
//   - Présent depuis avant l'année courante → quota plein (18 + bonus ancienneté).
//   - Entré dans l'année courante → prorata : (mois travaillés dans l'année) × 1.5.
//     Le mois d'entrée est compté entier (générosité conforme à la règle
//     « 1.5 j à la fin de chaque mois » discutée).
//   - Pas encore embauché → 0.
// Le bonus d'ancienneté (5 ans / 10 ans) s'ajoute si applicable.
export function quotaAnnuel(emp, refDate = todayYMD()) {
  const dateAnc = emp?.date_anciennete || emp?.date_entree
  if (!dateAnc) return QUOTA_BASE
  const ref       = new Date(refDate + 'T00:00:00')
  const refYear   = ref.getFullYear()
  const entry     = new Date(dateAnc + 'T00:00:00')
  const entryYear = entry.getFullYear()

  let base
  if (entryYear < refYear) {
    base = QUOTA_BASE                       // présent toute l'année → quota plein
  } else if (entryYear > refYear) {
    base = 0                                 // pas encore embauché
  } else {
    // Même année : prorata des mois travaillés. Le mois d'entrée ne compte que si
    // on arrive dans sa PREMIÈRE QUINZAINE (règle Layla, 19/08/2026 : entrée le
    // 28/01 → janvier ne compte pas). Ex : entrée 2026-03-10 → 10 mois (mars→déc)
    // = 15 j ; entrée 2026-01-28 → 11 mois (févr→déc) = 16,5 j.
    const moisDansAnnee = (12 - entry.getMonth()) - (entry.getDate() > 15 ? 1 : 0)
    base = Math.max(0, moisDansAnnee) * (QUOTA_BASE / 12)
  }

  // Bonus ancienneté (calculé depuis la date d'entrée, indépendamment de l'année)
  const anciennete = moisEntre(dateAnc, refDate) / 12
  if (anciennete >= 5)  base += BONUS_5_ANS
  if (anciennete >= 10) base += BONUS_10_ANS
  return base
}

// Acquis depuis le 1er janvier de l'année de refDate (1,5 j à la fin de chaque mois échu,
// pondéré par le quota annuel : (quota_annuel / 12) × mois_échus).
function joursAcquisDepuisJanv(emp, refDate = todayYMD()) {
  const ref = new Date(refDate + 'T00:00:00')
  const month = ref.getMonth() + 1            // 1..12
  // Mois "échu" = mois entièrement passé. Si on est le 15 mars : janv + févr = 2 mois échus.
  const moisEchus = Math.max(0, month - 1)
  const q = quotaAnnuel(emp, refDate)
  return (q / 12) * moisEchus
}

// Reliquat N-1 reporté, encore valide si on est avant la deadline du 30 mai.
function reliquatN1Valide(emp, refDate = todayYMD()) {
  const initial = Number(emp?.solde_conges_initial_n || 0)
  const initialYear = emp?.solde_conges_initial_year
  if (!initial || !initialYear) return 0
  const ref = new Date(refDate + 'T00:00:00')
  const currentYear = ref.getFullYear()
  if (initialYear !== currentYear) return 0    // reliquat saisi pour une autre année → ignoré
  const deadline = new Date(`${currentYear}-${RELIQUAT_DEADLINE_MM_DD}T23:59:59`)
  return ref <= deadline ? initial : 0
}

// Jours pris (validés) depuis le 1er janvier de l'année de refDate.
// Pour chaque congé annuel, on retire 1 par jour off "fixe" (cf. règle déjà adoptée
// pour l'export Excel). Maladie et autres types : calendar days bruts.
function joursPrisAnnee(emp, congesValides, refDate = todayYMD()) {
  const ref = new Date(refDate + 'T00:00:00')
  const yearStart = `${ref.getFullYear()}-01-01`
  let total = 0
  for (const c of congesValides) {
    if (c.employe_id !== emp.id) continue
    if (c.statut !== 'valide') continue
    if (c.date_fin < yearStart || c.date_debut > refDate) continue
    const t = (c.type_conge || '').toLowerCase()
    const isMaladie = t.includes('maladie') || t.includes('sick')
    const isRecup   = t.includes('récup') || t.includes('recup') || t.includes('compensatory')
    if (isRecup) continue   // les récup n'entament pas le solde de congés annuels
    // Bornes du congé clippées à l'année courante et au refDate
    const debut = c.date_debut < yearStart ? yearStart : c.date_debut
    const fin   = c.date_fin   > refDate    ? refDate   : c.date_fin
    const nb = (new Date(fin + 'T00:00:00') - new Date(debut + 'T00:00:00')) / 86400000 + 1
    if (nb <= 0) continue
    if (isMaladie) {
      total += nb                                  // maladie : tous les jours comptent
    } else {
      // congé annuel : on exclut le jour off fixe
      total += nb - compteJoursOffFixesDansPeriode(emp, debut, fin)
    }
  }
  return total
}

function compteJoursOffFixesDansPeriode(emp, debutYMD, finYMD) {
  let jourFixe = null
  if (emp.planning_type === 'fixe') {
    jourFixe = emp.planning_jour_off || null
  } else if (emp.planning_type === 'alt') {
    const paireOffs   = [emp.planning_paire_off_1,   emp.planning_paire_off_2  ].filter(Boolean)
    const impaireOffs = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    jourFixe = paireOffs.find(d => impaireOffs.includes(d)) || null
  }
  if (!jourFixe) return 0
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  let count = 0
  const d = new Date(debutYMD + 'T00:00:00')
  const fin = new Date(finYMD + 'T00:00:00')
  while (d <= fin) {
    if (JOURS[d.getDay()] === jourFixe) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

// Jours récup gagnés = somme des `jours_recup` du pointage validé jusqu'à ce mois.
// Si tu ne valides pas encore les mois dans l'app, la table peut être vide → 0.
async function joursRecupGagnesAnnee(emp, refDate = todayYMD()) {
  const ref = new Date(refDate + 'T00:00:00')
  const annee = ref.getFullYear()
  const { data, error } = await supabase
    .from('pointages_mois')
    .select('jours_recup')
    .eq('employe_id', emp.id)
    .eq('annee', annee)
  if (error) {
    console.warn('[joursRecupGagnesAnnee]', error.message)
    return 0
  }
  return (data || []).reduce((s, r) => s + Number(r.jours_recup || 0), 0)
}

// ------------------------------------------------------------
// Classification des congés pris par type d'allocation
//   - 'annuel'         : congés payés
//   - 'maladie_courte' : maladie ≤ 3 j (consomme le pool 6 j/an)
//   - 'maladie_longue' : maladie > 3 j (NON payée, hors pool)
//   - 'mariage' / 'naissance' / 'deces' / 'circoncision' / 'autre' : événements
// Retourne un objet { type: jours }.
// ------------------------------------------------------------
// Classe un congé en catégorie, à partir de son type ET de sa durée TOTALE
// (maladie ≤ 3 j = courte, > 3 j = longue). Gère les libellés Odoo anglais
// (Paid Time Off, Sick Time Off, Compensatory Days…). Sert au récap/export Pointage
// pour compter juste, y compris les congés à cheval sur 2 mois.
export function classifierConge(c) {
  const t = (c.type_conge || '').toLowerCase()
  if (t === 'maladie_courte') return 'maladie_courte'
  if (t === 'maladie_longue') return 'maladie_longue'
  if (t.includes('maternit')) return 'maternite'
  if (t.includes('récup') || t.includes('recup') || t.includes('compensatory')) return 'recup'
  if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) {
    const duree = (new Date(c.date_fin + 'T00:00:00') - new Date(c.date_debut + 'T00:00:00')) / 86400000 + 1
    return duree <= 3 ? 'maladie_courte' : 'maladie_longue'
  }
  if (t.includes('mariage'))    return 'mariage'
  if (t.includes('naissance'))  return 'naissance'
  if (t.includes('deces') || t.includes('décès')) return 'deces'
  if (t.includes('circoncis'))  return 'circoncision'
  if (t.includes('sans solde') || t.includes('unpaid')) return 'sans_solde'
  return 'annuel'
}

// Catégories « événement » (congé exceptionnel : décès, mariage, naissance, circoncision, maternité).
export const CONGE_EVENEMENT = new Set(['mariage', 'naissance', 'deces', 'circoncision', 'maternite'])

function joursPrisParTypeAnnee(emp, congesValides, refDate = todayYMD(), feriesSet = null) {
  const ref = new Date(refDate + 'T00:00:00')
  const yearStart = `${ref.getFullYear()}-01-01`
  const yearEnd   = `${ref.getFullYear()}-12-31`
  const out = { annuel: 0, maladie_courte: 0, maladie_longue: 0, mariage: 0, naissance: 0, deces: 0, circoncision: 0, maternite: 0, autre: 0, recup: 0, sans_solde: 0 }
  for (const c of congesValides) {
    if (c.employe_id !== emp.id) continue
    if (c.statut !== 'valide') continue
    // Un congé VALIDÉ est retiré du solde dès sa validation, sans attendre
    // qu'il commence (règle Layla). Les bornes sont donc l'ANNÉE, pas refDate.
    if (c.date_fin < yearStart || c.date_debut > yearEnd) continue
    const t = (c.type_conge || '').toLowerCase()

    const debut = c.date_debut < yearStart ? yearStart : c.date_debut
    const fin   = c.date_fin   > yearEnd    ? yearEnd   : c.date_fin
    const nb = (new Date(fin + 'T00:00:00') - new Date(debut + 'T00:00:00')) / 86400000 + 1
    if (nb <= 0) continue

    // Classification heuristique sur type_conge (les valeurs explicites
    // 'maladie_courte' / 'maladie_longue' priment sur la durée).
    let category = 'annuel'
    if (t === 'maladie_courte')             category = 'maladie_courte'
    else if (t === 'maladie_longue')        category = 'maladie_longue'
    else if (t.includes('maternit'))        category = 'maternite'
    else if (t.includes('récup') || t.includes('recup') || t.includes('compensatory')) category = 'recup'
    else if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) {
      // Durée totale du congé maladie (pas seulement la partie clippée)
      const dureeTotale = (new Date(c.date_fin + 'T00:00:00') - new Date(c.date_debut + 'T00:00:00')) / 86400000 + 1
      category = dureeTotale <= 3 ? 'maladie_courte' : 'maladie_longue'
    } else if (t.includes('mariage'))       category = 'mariage'
    else if (t.includes('naissance'))       category = 'naissance'
    else if (t.includes('deces') || t.includes('décès')) category = 'deces'
    else if (t.includes('circoncis'))       category = 'circoncision'
    else if (t.includes('sans solde') || t.includes('unpaid')) category = 'sans_solde'

    // Si jours_decomptes est figé (validation ou édition), on l'utilise tel quel
    // pour tout congé entièrement dans l'ANNÉE — même s'il se termine après
    // aujourd'hui : un congé validé compte EN ENTIER (pas seulement jusqu'à ce jour).
    const conge_entier = (c.date_debut >= yearStart && c.date_fin <= yearEnd)
    let compte
    if (conge_entier && c.jours_decomptes !== null && c.jours_decomptes !== undefined) {
      compte = Number(c.jours_decomptes)
    } else {
      // Pour 'annuel' et 'recup' on retire le jour off fixe ET les jours fériés
      // (règles Layla : ni le jour de repos ni un férié ne sont décomptés).
      compte = (category === 'annuel' || category === 'recup')
        ? nb - compteJoursOffFixesDansPeriode(emp, debut, fin) - compteFeriesHorsOff(emp, feriesSet, debut, fin)
        : nb
    }
    // Si le congé annuel contient une part de récup saisie (recup_detail),
    // on attribue ces jours à 'recup' (le reste à 'annuel'). Le total décompté
    // ne change pas → le solde combiné reste identique, mais le détail est juste.
    const recupDansConge = Array.isArray(c.recup_detail) ? c.recup_detail.length : 0
    if (category === 'annuel' && recupDansConge > 0) {
      const k = Math.min(recupDansConge, compte)
      out.recup  = (out.recup  || 0) + k
      out.annuel = (out.annuel || 0) + (compte - k)
    } else {
      out[category] = (out[category] || 0) + compte
    }
  }
  return out
}

// ------------------------------------------------------------
// PUBLIC : solde dispo d'un employé à la date du jour
// Source : table conges_allocations (annuel, reliquat, maladie_courte,
// événements). Si aucune allocation 'annuel' n'existe encore, on tombe
// sur le quota calculé (18 + ancienneté) en repli.
// ------------------------------------------------------------
// Pour éviter des centaines de requêtes quand on calcule pour beaucoup
// d'employés, on accepte des données pré-chargées dans `prefetched` :
//   { allocsByEmp: Map<empId, [allocations]>, recupByEmp: Map<empId, jours> }
export async function calculSoldeConges(emp, congesValides = null, refDate = todayYMD(), prefetched = null) {
  const ref = new Date(refDate + 'T00:00:00')
  const annee = ref.getFullYear()

  // 1) Congés validés (chargés si non fournis)
  if (!congesValides) {
    const { data } = await supabase
      .from('conges').select('*')
      .eq('employe_id', emp.id).eq('statut', 'valide')
    congesValides = data || []
  }

  // 2) Allocations de l'année (toutes sources : auto, manuel, odoo)
  //    Statut 'valide' uniquement — les allocations en attente ne comptent
  //    pas dans le solde tant qu'un admin n'a pas validé.
  let allocs
  if (prefetched?.allocsByEmp) {
    allocs = (prefetched.allocsByEmp.get(emp.id) || []).filter(a => a.statut === 'valide')
  } else {
    const { data: allocsData } = await supabase
      .from('conges_allocations')
      .select('*')
      .eq('employe_id', emp.id)
      .eq('annee', annee)
      .eq('statut', 'valide')
    allocs = allocsData || []
  }

  const sumByType = {}
  for (const a of allocs) sumByType[a.type] = (sumByType[a.type] || 0) + Number(a.jours)

  // 3) ANNUEL : l'allocation stockée est déjà la valeur accumulée à ce jour
  //    (1.5 × mois échus depuis l'entrée). Si aucune allocation → repli sur
  //    le calcul dynamique.
  const annuelAlloue   = sumByType.annuel || 0
  const annuelEffectif = annuelAlloue > 0 ? annuelAlloue : joursAnnuelAccumules(emp, refDate, annee)
  const acquis         = annuelEffectif   // pas de re-prorata, déjà accumulé

  // 4) RELIQUAT : valide jusqu'au 30 mai
  const reliquatAlloue = sumByType.reliquat || 0
  const deadline       = new Date(`${annee}-${RELIQUAT_DEADLINE_MM_DD}T23:59:59`)
  const reliquatN1     = ref <= deadline ? reliquatAlloue : 0

  // 5) ÉVÉNEMENTS : applicable si date_evt absent ou ≤ refDate
  const eventTypes = ['mariage', 'naissance', 'deces', 'circoncision', 'maternite', 'autre']
  let eventsApplicable = 0
  const eventsDetail = []
  for (const a of allocs) {
    if (!eventTypes.includes(a.type)) continue
    const applicable = !a.date_evt || a.date_evt <= refDate
    if (applicable) eventsApplicable += Number(a.jours)
    eventsDetail.push({ id: a.id, type: a.type, jours: Number(a.jours), date_evt: a.date_evt, raison: a.raison, applicable })
  }

  // 6) RÉCUP gagnés
  const recup = prefetched?.recupByEmp
    ? (prefetched.recupByEmp.get(emp.id) || 0)
    : await joursRecupGagnesAnnee(emp, refDate)

  // 7) CONGÉS PRIS par type
  //    On charge les jours fériés (préchargés si fournis) pour ne pas les
  //    décompter dans les congés annuel/récup.
  let feriesSet = prefetched?.feriesSet
  if (!feriesSet) {
    const { data: fData } = await supabase.from('jours_feries').select('date')
    feriesSet = new Set((fData || []).map(f => f.date))
  }
  const prisType = joursPrisParTypeAnnee(emp, congesValides, refDate, feriesSet)
  const prisAnnuel = prisType.annuel
  const prisEvents = prisType.mariage + prisType.naissance + prisType.deces + prisType.circoncision + prisType.maternite + prisType.autre
  const prisRecup  = prisType.recup || 0   // récup prises : se déduisent du total (la récup gagnée y est ajoutée)

  // 8) TOTAL ALLOCATIONS = annuel FULL + reliquat valide + événements applicables.
  //    DISPO = total + récup gagnée − pris (annuel + événements + récup prises).
  const totalAllocations = annuelEffectif + reliquatN1 + eventsApplicable
  const dispo = totalAllocations + recup - prisAnnuel - prisEvents - prisRecup

  // 9) MALADIE ≤ 3 j : pool séparé (6 j/an par défaut)
  const maladieAlloue = sumByType.maladie_courte || 0
  const maladiePris   = prisType.maladie_courte
  const maladieDispo  = Math.max(0, maladieAlloue - maladiePris)

  // Verrou des 6 mois
  const dateAncRef       = emp?.date_anciennete || emp?.date_entree
  const moisDepuisEntree = dateAncRef ? moisEntre(dateAncRef, refDate) : 999
  const peutPrendre      = moisDepuisEntree >= MOIS_AVANT_PRISE

  return {
    acquis, reliquatN1, recup,
    pris: prisAnnuel + prisEvents + prisRecup,
    prisAnnuel,
    prisEvents,
    // PAS de Math.max(0, …) : un solde négatif doit se voir (il signale un
    // dépassement réel — congés accordés au-delà du droit, ou décompte d'heures
    // manquantes supérieur à la récup disponible).
    dispo: Math.round(dispo * 100) / 100,
    totalAllocations,
    peutPrendre,
    moisDepuisEntree,
    quotaAnnuel: annuelEffectif,
    prisType,                                    // pris détaillé par catégorie
    // Détails par catégorie
    maladie: { alloue: maladieAlloue, pris: maladiePris, dispo: maladieDispo },
    events:  { applicable: eventsApplicable, pris: prisEvents, detail: eventsDetail },
    maladieLonguePrise: prisType.maladie_longue, // informatif, n'entre pas dans dispo
    sansSoldePris: prisType.sans_solde,          // congé sans solde : informatif, n'entre pas dans dispo
  }
}

// ------------------------------------------------------------
// Dispo restant pour un type de congé, à partir d'un solde calculé.
//   null      = aucune limite (sans solde, maladie longue)
//   undefined = type non autorisé (allocation événementielle / récup manquante)
//   number    = jours disponibles
// (utilisé par le formulaire de demande ET par « À traiter ».)
// ------------------------------------------------------------
export function dispoTypeConge(solde, type) {
  if (!solde) return undefined
  if (type === 'sans solde')      return null
  if (type === 'maladie_longue')  return null
  if (type === 'annuel')          return solde.dispo
  if (type === 'maladie_courte')  return solde.maladie?.dispo ?? 0
  if (type === 'recup') {
    const allocAutre = (solde.events?.detail || [])
      .filter(d => d.type === 'autre' && d.applicable)
      .reduce((s, e) => s + Number(e.jours), 0)
    const total = (solde.recup || 0) + allocAutre
    if (total <= 0) return undefined            // pas d'allocation ni gain
    return Math.max(0, total - (solde.prisType?.autre || 0) - (solde.prisType?.recup || 0))
  }
  // Événements : mariage / naissance / deces / circoncision / maternite
  const alloc = (solde.events?.detail || [])
    .filter(d => d.type === type && d.applicable)
    .reduce((s, e) => s + Number(e.jours), 0)
  if (alloc <= 0) return undefined              // aucune allocation → type non dispo
  const pris = solde.prisType?.[type] || 0
  return Math.max(0, alloc - pris)
}

// Date à partir de laquelle un congé de ce type peut être consommé (date_evt la
// plus ancienne des allocations). Null si aucune contrainte de date.
export function debutPossibleType(solde, type) {
  const allocs = (solde?.events?.detail || []).filter(d => {
    if (type === 'recup') return d.type === 'autre'
    return d.type === type
  })
  if (!allocs.length) return null
  const dates = allocs.map(a => a.date_evt).filter(Boolean)
  if (!dates.length) return null   // pas de contrainte de date
  return dates.sort()[0]
}

// ------------------------------------------------------------
// CRUD — DEMANDES & VALIDATION
// ------------------------------------------------------------
export async function loadCongesDemandes() {
  // Demandes en attente + à valider
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .eq('statut', 'demande')
    .order('date_debut', { ascending: true })
  if (error) throw error
  return data || []
}

export async function loadCongesByStatuts(statuts = ['demande', 'valide'], sinceDate = null) {
  let q = supabase
    .from('conges')
    .select('*')
    .in('statut', statuts)
  // Optionnel : ne charger que les congés se terminant après cette date (perf).
  if (sinceDate) q = q.gte('date_fin', sinceDate)
  const { data, error } = await q.order('date_debut', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadCongesEmploye(employeId) {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .eq('employe_id', employeId)
    .order('date_debut', { ascending: false })
  if (error) throw error
  return data || []
}

// Crée une demande de congé pour le compte d'un employé (saisie RH).
// type_conge : 'annuel' (par défaut) / 'maladie' / 'sans solde' / 'recup' / etc.
// Bucket des justificatifs (certificat médical, preuve d'absence).
const JUSTIF_BUCKET = 'justificatifs'
export async function uploadJustificatif(file, userId) {
  if (!file) return null
  const ts = Date.now()
  const clean = (file.name || 'justificatif').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId || 'x'}/${ts}_${clean}`
  const { error } = await supabase.storage.from(JUSTIF_BUCKET).upload(path, file, { upsert: false })
  if (error) throw error
  return path
}
export async function getJustificatifUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(JUSTIF_BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl || null
}

export async function createDemandeConge({ employe_id, date_debut, date_fin, type_conge = 'annuel', motif = null, demande_par, justificatif_path = null, jours_decomptes = null }) {
  if (!employe_id || !date_debut || !date_fin) throw new Error('employé, date_debut et date_fin requis')
  if (date_fin < date_debut) throw new Error('La date de fin doit être ≥ date de début')
  // Bloque le chevauchement avec un congé existant (demande ou validé) du même employé.
  const { data: existants } = await supabase
    .from('conges')
    .select('date_debut, date_fin')
    .eq('employe_id', employe_id)
    .in('statut', ['demande', 'valide'])
  const fmtJ = ymd => (ymd ? ymd.split('-').reverse().join('/') : '')
  const chevauche = (existants || []).find(c => !(c.date_fin < date_debut || c.date_debut > date_fin))
  if (chevauche) {
    throw new Error(`Chevauchement : un congé existe déjà du ${fmtJ(chevauche.date_debut)} au ${fmtJ(chevauche.date_fin)} pour cet employé.`)
  }
  const { data, error } = await supabase
    .from('conges')
    .insert({
      employe_id, date_debut, date_fin, type_conge,
      motif, statut: 'demande',
      demande_par, demande_le: new Date().toISOString(),
      source: 'app', justificatif_path,
      ...(jours_decomptes != null ? { jours_decomptes: Number(jours_decomptes) } : {}),
    })
    .select().single()
  if (error) throw error
  return data
}

export async function validerConge(congeId, userId, joursDecomptes = null, silent = false) {
  const patch = { statut: 'valide', valide_par: userId, valide_le: new Date().toISOString() }
  if (joursDecomptes !== null && joursDecomptes !== undefined) {
    patch.jours_decomptes = Number(joursDecomptes)
  }
  const { data, error } = await supabase
    .from('conges')
    .update(patch)
    .eq('id', congeId)
    .select().single()
  if (error) throw error
  // silent = validation interne → pas de WhatsApp envoyé à l'employé.
  if (!silent) {
    // Solde (récup incluse) pour l'afficher dans le message de validation
    let extra = ''
    try {
      const { data: emp } = await supabase.from('employes').select('*').eq('id', data.employe_id).maybeSingle()
      if (emp) {
        const s = await calculSoldeConges(emp)
        extra = `&pris=${encodeURIComponent(s.pris)}&dispo=${encodeURIComponent(s.dispo)}`
      }
    } catch (e) { console.warn('[solde notif]', e.message) }
    // Tire la notif WATI (best-effort, ne bloque pas en cas d'échec)
    try { await notifierWATI(congeId, 'validation', extra) } catch (e) { console.warn('[notif validation]', e.message) }
  }
  return data
}

export async function rejeterConge(congeId, userId) {
  const { data, error } = await supabase
    .from('conges')
    .update({ statut: 'rejete', valide_par: userId, valide_le: new Date().toISOString() })
    .eq('id', congeId)
    .select().single()
  if (error) throw error
  try { await notifierWATI(congeId, 'rejet') } catch (e) { console.warn('[notif rejet]', e.message) }
  return data
}

export async function annulerConge(congeId, userId, silent = false) {
  const { data, error } = await supabase
    .from('conges')
    .update({ statut: 'annule', valide_par: userId, valide_le: new Date().toISOString() })
    .eq('id', congeId)
    .select().single()
  if (error) throw error
  // silent = correction interne → pas de WhatsApp envoyé à l'employé.
  if (!silent) {
    try { await notifierWATI(congeId, 'rejet') } catch (e) { console.warn('[notif annulation]', e.message) }
  }
  return data
}

// ------------------------------------------------------------
// NOTIFICATIONS WATI — appel à l'endpoint serveur
// ------------------------------------------------------------
async function notifierWATI(congeId, type, extra = '') {
  // type : 'validation' | 'rejet' | 'rappel_retour'
  const r = await fetch(`/api/wati-webhook?action=conges-notif&congeId=${congeId}&type=${type}${extra}`)
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(txt || `HTTP ${r.status}`)
  }
  return r.json().catch(() => ({}))
}

// ------------------------------------------------------------
// IMPORT ODOO — rapatrie les congés validés du 1er janvier à aujourd'hui.
// ------------------------------------------------------------
export async function syncCongesAnneeOdoo(annee = null) {
  const resp = await fetch('/api/pointage-api?action=sync-leaves-year', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee: annee || new Date().getFullYear() }),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(txt || `HTTP ${resp.status}`)
  }
  return resp.json()
}

// Types de congé PRIS + libellés d'affichage.
export const CONGE_TYPES = [
  { v: 'annuel',           label: 'Congé annuel' },
  { v: 'maladie_courte',   label: 'Congé maladie ≤ 3 j' },
  { v: 'maladie_longue',   label: 'Congé maladie > 3 j' },
  { v: 'mariage',          label: 'Mariage' },
  { v: 'naissance',        label: 'Naissance' },
  { v: 'deces',            label: 'Décès' },
  { v: 'circoncision',     label: 'Circoncision' },
  { v: 'maternite',        label: 'Congé maternité' },
  { v: 'sans solde',       label: 'Sans solde' },
  { v: 'recup',            label: 'Récupération' },
]

// Libellé lisible d'un type de congé : les valeurs brutes viennent soit de
// l'app ('annuel'), soit d'Odoo en anglais ('Paid Time Off').
export function formatTypeConge(t) {
  if (!t) return '—'
  const match = CONGE_TYPES.find(x => x.v === t)
  if (match) return match.label
  const s = String(t).toLowerCase()
  if (s.includes('paid time off'))     return 'Congé annuel'
  if (s.includes('compensatory days')) return 'Récupération'
  if (s.includes('maternity'))         return 'Congé maternité'
  if (s.includes('sick'))              return 'Congé maladie'
  if (s.includes('unpaid'))            return 'Sans solde'
  return t
}

// ============================================================
// ALLOCATIONS (table conges_allocations)
//   Source de vérité pour « combien de jours chacun a droit cette année ».
// ============================================================

// Types reconnus + libellés UI
export const ALLOC_TYPES = [
  { v: 'annuel',         label: 'Congé annuel',     defaultJours: null,  isAuto: true  },
  { v: 'maladie_courte', label: 'Maladie ≤ 3 j',    defaultJours: 6,     isAuto: true  },
  { v: 'reliquat',       label: 'Reliquat N-1',     defaultJours: null,  isAuto: true  },
  { v: 'mariage',        label: 'Mariage',          defaultJours: 4,     isAuto: false },
  { v: 'naissance',      label: 'Naissance',        defaultJours: 3,     isAuto: false },
  { v: 'deces',          label: 'Décès',            defaultJours: 3,     isAuto: false },
  { v: 'circoncision',   label: 'Circoncision',     defaultJours: 2,     isAuto: false },
  { v: 'maternite',      label: 'Maternité',        defaultJours: 98,    isAuto: false },
  { v: 'autre',          label: 'Récupération',     defaultJours: null,  isAuto: false },
]

export async function loadAllocations({ annee = null, employeId = null, statut = 'valide' } = {}) {
  let q = supabase.from('conges_allocations').select('*')
  if (statut) {
    if (Array.isArray(statut)) q = q.in('statut', statut)
    else                       q = q.eq('statut', statut)
  }
  if (annee)      q = q.eq('annee', annee)
  if (employeId)  q = q.eq('employe_id', employeId)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createAllocation({ employe_id, annee, type, jours, raison = null, date_evt = null, source = 'manuel', created_by = null, statut = 'valide' }) {
  if (!employe_id || !annee || !type || jours == null) throw new Error('employe_id, annee, type et jours requis')
  // Garde anti-doublon : refuse une allocation identique déjà présente (même employé, année,
  // type, et même date d'événement le cas échéant). Évite le double-comptage.
  let dup = supabase
    .from('conges_allocations')
    .select('id')
    .eq('employe_id', employe_id)
    .eq('annee', annee)
    .eq('type', type)
    .neq('statut', 'annule')
  dup = date_evt ? dup.eq('date_evt', date_evt) : dup.is('date_evt', null)
  const { data: existing } = await dup.limit(1)
  if (existing && existing.length) {
    throw new Error(date_evt
      ? `Une allocation « ${type} » existe déjà pour cet employé à cette date (${date_evt}).`
      : `Une allocation « ${type} » existe déjà pour cet employé en ${annee}.`)
  }
  const { data, error } = await supabase
    .from('conges_allocations')
    .insert({ employe_id, annee, type, jours, raison, date_evt, source, created_by, statut })
    .select().single()
  if (error) throw error
  return data
}

export async function validerAllocation(id, userId) {
  const { data, error } = await supabase
    .from('conges_allocations')
    .update({ statut: 'valide', valide_par: userId, valide_le: new Date().toISOString() })
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

export async function rejeterAllocation(id, userId) {
  const { data, error } = await supabase
    .from('conges_allocations')
    .update({ statut: 'annule', valide_par: userId, valide_le: new Date().toISOString() })
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

export async function cancelAllocation(id) {
  const { error } = await supabase
    .from('conges_allocations')
    .update({ statut: 'annule' })
    .eq('id', id)
  if (error) throw error
}

// Met à jour les champs modifiables d'une allocation.
export async function updateAllocation(id, patch) {
  const allowed = ['type', 'jours', 'raison', 'date_evt', 'annee']
  const clean = {}
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k]
  const { data, error } = await supabase
    .from('conges_allocations')
    .update(clean)
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

// Met à jour les champs modifiables d'un congé.
export async function updateConge(id, patch) {
  const allowed = ['date_debut', 'date_fin', 'type_conge', 'motif', 'statut', 'recup_detail', 'signe']
  const clean = {}
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k]
  const { data, error } = await supabase
    .from('conges')
    .update(clean)
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

// Supprime un congé. Sécurité : on n'autorise que les congés NON validés
// (statut 'demande' / 'rejete' / 'annule'), jamais un congé 'valide'.
export async function deleteConge(id) {
  const { data: row, error: e1 } = await supabase.from('conges').select('statut').eq('id', id).maybeSingle()
  if (e1) throw e1
  if (row?.statut === 'valide') throw new Error('Un congé validé ne peut pas être supprimé (seul un admin peut l\'annuler).')
  const { error } = await supabase.from('conges').delete().eq('id', id)
  if (error) throw error
}

// Reporte les soldes dispo d'une année N en allocations type='reliquat'
// pour l'année N+1. Idempotent : annule les reliquats auto existants pour
// N+1 puis recrée à partir du dispo actuel au 31/12 de N.
// Retourne { reportes, total_jours, annee_source, annee_cible }.
export async function reporterReliquats(employes, annee, createdBy = null) {
  const refDate = `${annee}-12-31`
  const anneeSuivante = annee + 1

  // 1) Annule les reliquats auto existants pour N+1 (idempotence)
  await supabase.from('conges_allocations')
    .update({ statut: 'annule' })
    .eq('annee', anneeSuivante)
    .eq('type', 'reliquat')
    .eq('source', 'auto')
    .eq('statut', 'valide')

  let reportes = 0
  let totalJours = 0
  for (const emp of employes) {
    const s = await calculSoldeConges(emp, null, refDate)
    if (s.dispo <= 0) continue
    try {
      await createAllocation({
        employe_id: emp.id,
        annee: anneeSuivante,
        type: 'reliquat',
        jours: Number(s.dispo.toFixed(2)),
        raison: `Reliquat ${annee} (auto)`,
        source: 'auto',
        created_by: createdBy,
      })
      reportes++
      totalJours += s.dispo
    } catch (e) {
      console.warn('[reporterReliquats]', emp.nom, e?.message || e)
    }
  }
  return { reportes, total_jours: totalJours, annee_source: annee, annee_cible: anneeSuivante }
}

// Supprime (vraiment) toutes les allocations source='auto' d'une année donnée.
// Utile quand on a importé les allocations Odoo et qu'on veut s'appuyer
// uniquement sur celles-là (et non sur le calcul auto de l'app).
export async function deleteAutoAllocations(annee) {
  const { error, count } = await supabase
    .from('conges_allocations')
    .delete({ count: 'exact' })
    .eq('annee', annee)
    .eq('source', 'auto')
  if (error) throw error
  return count || 0
}

// Pour un (employé, année) donné : crée les allocations auto manquantes
// (annuel = quota selon ancienneté ; maladie_courte = 6 j).
// Idempotent grâce à l'unique partial index côté SQL.
// Jours d'annuel ACCUMULÉS à la date refDate dans l'année donnée :
//   - Ancienneté TOTALE ≥ 6 mois (à la date de référence) → quota plein annuel
//     (18 + bonus ancienneté 5 / 10 ans).
//   - Ancienneté TOTALE < 6 mois → 1,5 × nb de mois travaillés depuis la date
//     d'intégration (ramping pour les nouveaux).
// Si l'employé n'a pas encore commencé à la date de référence → 0.
export function joursAnnuelAccumules(emp, refDate = todayYMD(), annee = null) {
  const ref = new Date(refDate + 'T00:00:00')
  const dateAnc = emp?.date_anciennete || emp?.date_entree
  if (!dateAnc) return QUOTA_BASE   // sans date d'entrée, on suppose plein quota

  const entry = new Date(dateAnc + 'T00:00:00')
  if (ref < entry) return 0
  void annee   // paramètre conservé pour compat (non utilisé : règle basée sur l'ancienneté)

  const ancienneteMois = moisEntre(dateAnc, refDate)

  // Droit de l'année AU PRORATA des mois de présence (règle Layla, 19/08/2026) :
  // une entrée en cours d'année ne donne pas les 18 j pleins. quotaAnnuel fait
  // déjà ce calcul (mois d'entrée inclus) + les bonus d'ancienneté.
  const droitAnnuel = quotaAnnuel(emp, refDate)

  // Avant 6 mois d'ancienneté : le droit se remplit mois par mois (1,5 j/mois).
  // À partir de 6 mois : le droit de l'année est acquis en entier.
  // C'est la règle d'origine, à ceci près qu'on plafonne au droit PRORATISÉ et
  // non plus aux 18 j pleins (une entrée de février recevait 18 j au lieu de 16,5).
  if (ancienneteMois >= MOIS_AVANT_PRISE) return droitAnnuel
  return Number(Math.min(ancienneteMois * 1.5, droitAnnuel).toFixed(2))
}

// Crée les allocations auto manquantes (annuel = accumulé à ce jour ;
// maladie_courte = 6). Si une allocation auto existe déjà, elle est mise à jour
// pour refléter l'accumulation actuelle (l'annuel grandit chaque mois).
export async function ensureAutoAllocationsForEmploye(emp, annee, createdBy = null) {
  const today = todayYMD()
  // Pour l'année en cours on prend aujourd'hui ; pour les années passées on prend
  // le 31/12 (l'accumulation est complète) ; pour les années futures on prend
  // le 1er janvier de l'année (= 0).
  let refDate
  const yearStr = String(annee)
  if (today.startsWith(yearStr))     refDate = today
  else if (today > `${yearStr}-12-31`) refDate = `${yearStr}-12-31`
  else                                refDate = `${yearStr}-01-01`

  const annuelAccumule = joursAnnuelAccumules(emp, refDate, annee)
  const lignes = [
    { type: 'annuel',         jours: annuelAccumule },
    { type: 'maladie_courte', jours: 6              },
  ]
  const existantes = await loadAllocations({ annee, employeId: emp.id, statut: 'valide' })
  for (const l of lignes) {
    const deja = existantes.find(x => x.type === l.type && x.source === 'auto')
    if (deja) {
      // Mise à jour si la valeur a changé (cas de l'annuel qui grandit chaque mois)
      if (Number(deja.jours) !== l.jours) {
        try { await updateAllocation(deja.id, { jours: l.jours }) }
        catch (e) { console.warn('[ensureAutoAllocations:update]', e?.message || e) }
      }
      continue
    }
    try {
      await createAllocation({ employe_id: emp.id, annee, type: l.type, jours: l.jours, source: 'auto', created_by: createdBy })
    } catch (e) {
      console.warn('[ensureAutoAllocations:create]', e?.message || e)
    }
  }
}

// Remet à jour les allocations AUTO de l'année en une passe (2 requêtes + les
// écritures nécessaires), au lieu des ~3 requêtes par employé de
// initAutoAllocationsTous. L'annuel accumulé grandit chaque mois : sans ce
// rafraîchissement, l'allocation reste figée à sa valeur de création.
// Ne touche QUE les lignes source='auto' : les allocations Odoo ou manuelles
// sont laissées telles quelles.
export async function syncAllocationsAnnuelles(employes, annee, userId = null) {
  const today = todayYMD()
  const yearStr = String(annee)
  const refDate = today.startsWith(yearStr) ? today
    : (today > `${yearStr}-12-31` ? `${yearStr}-12-31` : `${yearStr}-01-01`)

  const { data: allocs, error } = await supabase
    .from('conges_allocations')
    .select('id, employe_id, type, jours, statut')
    .eq('annee', annee).eq('source', 'auto').in('type', ['annuel', 'maladie_courte'])
  if (error) throw error

  const idx = new Map()
  for (const a of (allocs || [])) {
    if (a.statut === 'annule') continue
    idx.set(`${a.employe_id}|${a.type}`, a)
  }

  const aCreer = []
  let maj = 0
  for (const emp of employes) {
    const attendu = joursAnnuelAccumules(emp, refDate, annee)
    const ex = idx.get(`${emp.id}|annuel`)
    if (!ex) {
      aCreer.push({ employe_id: emp.id, annee, type: 'annuel', jours: attendu, source: 'auto', statut: 'valide', created_by: userId })
    } else if (Number(ex.jours) !== attendu) {
      const { error: e2 } = await supabase.from('conges_allocations').update({ jours: attendu }).eq('id', ex.id)
      if (!e2) maj++
    }
    if (!idx.get(`${emp.id}|maladie_courte`)) {
      aCreer.push({ employe_id: emp.id, annee, type: 'maladie_courte', jours: 6, source: 'auto', statut: 'valide', created_by: userId })
    }
  }
  let cree = 0
  if (aCreer.length) {
    const { error: e3 } = await supabase.from('conges_allocations').insert(aCreer)
    if (!e3) cree = aCreer.length
  }
  return { maj, cree }
}

// Pour TOUS les employés actifs : crée les allocations auto manquantes.
// Renvoie le nombre de lignes effectivement ajoutées.
export async function initAutoAllocationsTous(employes, annee, createdBy = null) {
  let added = 0
  for (const emp of employes) {
    const before = (await loadAllocations({ annee, employeId: emp.id, statut: 'valide' })).length
    await ensureAutoAllocationsForEmploye(emp, annee, createdBy)
    const after = (await loadAllocations({ annee, employeId: emp.id, statut: 'valide' })).length
    added += (after - before)
  }
  return added
}

// Allocations Odoo de l'année (« à quoi chaque employé a eu droit »).
export async function listAllocationsOdoo(annee = null) {
  const resp = await fetch('/api/pointage-api?action=list-allocations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee: annee || new Date().getFullYear() }),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(txt || `HTTP ${resp.status}`)
  }
  return resp.json()
}

// Importe les allocations Odoo dans la table conges_allocations.
// Remplace les lignes source='odoo' de l'année (idempotent), ne touche pas
// les lignes 'manuel' ou 'auto'.
export async function importAllocationsOdoo(annee = null) {
  const resp = await fetch('/api/pointage-api?action=import-allocations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annee: annee || new Date().getFullYear() }),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(txt || `HTTP ${resp.status}`)
  }
  return resp.json()
}
