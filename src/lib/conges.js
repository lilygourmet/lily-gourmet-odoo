// ============================================================
// Gestion des congés (workflow demande → validation → notif WATI).
// L'app devient la source de vérité (Odoo n'est plus utilisé pour la saisie).
// ============================================================

import { supabase } from './supabase'

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
  return new Date().toISOString().slice(0, 10)
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
    // Même année : prorata mois travaillés (mois d'entrée inclus).
    // Ex : entrée 2026-03-15 → 10 mois (mars→déc) × 1.5 = 15 j.
    const moisDansAnnee = 12 - entry.getMonth()
    base = moisDansAnnee * (QUOTA_BASE / 12)
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
    const isRecup   = t.includes('récup') || t.includes('recup')
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
function joursPrisParTypeAnnee(emp, congesValides, refDate = todayYMD()) {
  const ref = new Date(refDate + 'T00:00:00')
  const yearStart = `${ref.getFullYear()}-01-01`
  const out = { annuel: 0, maladie_courte: 0, maladie_longue: 0, mariage: 0, naissance: 0, deces: 0, circoncision: 0, autre: 0 }
  for (const c of congesValides) {
    if (c.employe_id !== emp.id) continue
    if (c.statut !== 'valide') continue
    if (c.date_fin < yearStart || c.date_debut > refDate) continue
    const t = (c.type_conge || '').toLowerCase()
    if (t.includes('récup') || t.includes('recup')) continue   // les récup s'ajoutent au solde, pas un congé pris

    const debut = c.date_debut < yearStart ? yearStart : c.date_debut
    const fin   = c.date_fin   > refDate    ? refDate   : c.date_fin
    const nb = (new Date(fin + 'T00:00:00') - new Date(debut + 'T00:00:00')) / 86400000 + 1
    if (nb <= 0) continue

    // Classification heuristique sur type_conge (les valeurs explicites
    // 'maladie_courte' / 'maladie_longue' priment sur la durée).
    let category = 'annuel'
    if (t === 'maladie_courte')             category = 'maladie_courte'
    else if (t === 'maladie_longue')        category = 'maladie_longue'
    else if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) {
      // Durée totale du congé maladie (pas seulement la partie clippée)
      const dureeTotale = (new Date(c.date_fin + 'T00:00:00') - new Date(c.date_debut + 'T00:00:00')) / 86400000 + 1
      category = dureeTotale <= 3 ? 'maladie_courte' : 'maladie_longue'
    } else if (t.includes('mariage'))       category = 'mariage'
    else if (t.includes('naissance'))       category = 'naissance'
    else if (t.includes('deces') || t.includes('décès')) category = 'deces'
    else if (t.includes('circoncis'))       category = 'circoncision'
    else if (t.includes('sans solde') || t.includes('unpaid')) category = 'autre'

    // Pour 'annuel' on retire le jour off fixe (règle Layla déjà discutée)
    const compte = category === 'annuel' ? nb - compteJoursOffFixesDansPeriode(emp, debut, fin) : nb
    out[category] = (out[category] || 0) + compte
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
  let allocs
  if (prefetched?.allocsByEmp) {
    allocs = prefetched.allocsByEmp.get(emp.id) || []
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
  const eventTypes = ['mariage', 'naissance', 'deces', 'circoncision', 'autre']
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
  const prisType = joursPrisParTypeAnnee(emp, congesValides, refDate)
  const prisAnnuel = prisType.annuel
  const prisEvents = prisType.mariage + prisType.naissance + prisType.deces + prisType.circoncision + prisType.autre

  // 8) TOTAL ALLOCATIONS = annuel FULL + reliquat valide + événements applicables.
  //    DISPO = total + récup − pris (pas de pro-rata mensuel : l'employé
  //    peut consommer dès le début de l'année).
  const totalAllocations = annuelEffectif + reliquatN1 + eventsApplicable
  const dispo = totalAllocations + recup - prisAnnuel - prisEvents

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
    pris: prisAnnuel + prisEvents,
    prisAnnuel,
    prisEvents,
    dispo: Math.max(0, dispo),
    totalAllocations,
    peutPrendre,
    moisDepuisEntree,
    quotaAnnuel: annuelEffectif,
    // Détails par catégorie
    maladie: { alloue: maladieAlloue, pris: maladiePris, dispo: maladieDispo },
    events:  { applicable: eventsApplicable, pris: prisEvents, detail: eventsDetail },
    maladieLonguePrise: prisType.maladie_longue, // informatif, n'entre pas dans dispo
  }
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

export async function loadCongesByStatuts(statuts = ['demande', 'valide']) {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .in('statut', statuts)
    .order('date_debut', { ascending: false })
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
export async function createDemandeConge({ employe_id, date_debut, date_fin, type_conge = 'annuel', motif = null, demande_par }) {
  if (!employe_id || !date_debut || !date_fin) throw new Error('employé, date_debut et date_fin requis')
  if (date_fin < date_debut) throw new Error('La date de fin doit être ≥ date de début')
  const { data, error } = await supabase
    .from('conges')
    .insert({
      employe_id, date_debut, date_fin, type_conge,
      motif, statut: 'demande',
      demande_par, demande_le: new Date().toISOString(),
      source: 'app',
    })
    .select().single()
  if (error) throw error
  return data
}

export async function validerConge(congeId, userId) {
  const { data, error } = await supabase
    .from('conges')
    .update({ statut: 'valide', valide_par: userId, valide_le: new Date().toISOString() })
    .eq('id', congeId)
    .select().single()
  if (error) throw error
  // Tire la notif WATI (best-effort, ne bloque pas en cas d'échec)
  try { await notifierWATI(congeId, 'validation') } catch (e) { console.warn('[notif validation]', e.message) }
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

export async function annulerConge(congeId, userId) {
  const { data, error } = await supabase
    .from('conges')
    .update({ statut: 'annule', valide_par: userId, valide_le: new Date().toISOString() })
    .eq('id', congeId)
    .select().single()
  if (error) throw error
  try { await notifierWATI(congeId, 'rejet') } catch (e) { console.warn('[notif annulation]', e.message) }
  return data
}

// ------------------------------------------------------------
// NOTIFICATIONS WATI — appel à l'endpoint serveur
// ------------------------------------------------------------
async function notifierWATI(congeId, type) {
  // type : 'validation' | 'rejet' | 'rappel_retour'
  const r = await fetch(`/api/wati-webhook?action=conges-notif&congeId=${congeId}&type=${type}`)
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

// ============================================================
// ALLOCATIONS (table conges_allocations)
//   Source de vérité pour « combien de jours chacun a droit cette année ».
// ============================================================

// Types reconnus + libellés UI
export const ALLOC_TYPES = [
  { v: 'annuel',         label: 'Congé annuel',     defaultJours: null,  isAuto: true  },
  { v: 'maladie_courte', label: 'Maladie ≤ 3 j',    defaultJours: 6,     isAuto: true  },
  { v: 'reliquat',       label: 'Reliquat N-1',     defaultJours: null,  isAuto: false },
  { v: 'mariage',        label: 'Mariage',          defaultJours: 4,     isAuto: false },
  { v: 'naissance',      label: 'Naissance',        defaultJours: 3,     isAuto: false },
  { v: 'deces',          label: 'Décès',            defaultJours: 3,     isAuto: false },
  { v: 'circoncision',   label: 'Circoncision',     defaultJours: 2,     isAuto: false },
  { v: 'autre',          label: 'Autre',            defaultJours: null,  isAuto: false },
]

export async function loadAllocations({ annee = null, employeId = null, statut = 'valide' } = {}) {
  let q = supabase.from('conges_allocations').select('*')
  if (statut)     q = q.eq('statut', statut)
  if (annee)      q = q.eq('annee', annee)
  if (employeId)  q = q.eq('employe_id', employeId)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createAllocation({ employe_id, annee, type, jours, raison = null, date_evt = null, source = 'manuel', created_by = null }) {
  if (!employe_id || !annee || !type || jours == null) throw new Error('employe_id, annee, type et jours requis')
  const { data, error } = await supabase
    .from('conges_allocations')
    .insert({ employe_id, annee, type, jours, raison, date_evt, source, created_by })
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
  const allowed = ['date_debut', 'date_fin', 'type_conge', 'motif', 'statut']
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

  // Bonus ancienneté (calculés depuis la date d'intégration)
  let quotaPlein = QUOTA_BASE
  const ancienneteAnnees = ancienneteMois / 12
  if (ancienneteAnnees >= 5)  quotaPlein += BONUS_5_ANS
  if (ancienneteAnnees >= 10) quotaPlein += BONUS_10_ANS

  // ≥ 6 mois → plein quota d'un coup ; sinon ramping 1,5 j/mois.
  if (ancienneteMois >= MOIS_AVANT_PRISE) return quotaPlein
  return Number((ancienneteMois * 1.5).toFixed(2))
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
