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

// Quota annuel pour un employé (selon ancienneté). Renvoie le total en jours/an.
export function quotaAnnuel(emp, refDate = todayYMD()) {
  if (!emp?.date_entree) return QUOTA_BASE
  const anciennete = moisEntre(emp.date_entree, refDate) / 12
  let q = QUOTA_BASE
  if (anciennete >= 5)  q += BONUS_5_ANS
  if (anciennete >= 10) q += BONUS_10_ANS
  return q
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
// PUBLIC : solde dispo d'un employé à la date du jour
// ------------------------------------------------------------
export async function calculSoldeConges(emp, congesValides = null, refDate = todayYMD()) {
  if (!congesValides) {
    const { data } = await supabase
      .from('conges')
      .select('*')
      .eq('employe_id', emp.id)
      .eq('statut', 'valide')
    congesValides = data || []
  }
  const acquis     = joursAcquisDepuisJanv(emp, refDate)
  const reliquatN1 = reliquatN1Valide(emp, refDate)
  const recup      = await joursRecupGagnesAnnee(emp, refDate)
  const pris       = joursPrisAnnee(emp, congesValides, refDate)

  // Verrou des 6 mois : un nouvel employé ne peut pas prendre tant que < 6 mois.
  const moisDepuisEntree = emp?.date_entree ? moisEntre(emp.date_entree, refDate) : 999
  const peutPrendre      = moisDepuisEntree >= MOIS_AVANT_PRISE

  const dispo = acquis + reliquatN1 + recup - pris
  return {
    acquis, reliquatN1, recup, pris,
    dispo: Math.max(0, dispo),
    peutPrendre,
    moisDepuisEntree,
    quotaAnnuel: quotaAnnuel(emp, refDate),
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
