// src/lib/presence.js
// Données de l'onglet Présence : qui est là maintenant (pointage du jour) + jours off (congés).
// Présent = a une session de pointage AUJOURD'HUI avec une arrivée et SANS départ (encore là).
// =============================================================

import { supabase } from './supabase'
import { syncAttendance, nomJour, paireOuImpaire } from './pointage'

export function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Couleur + ordre d'affichage par groupe (valeurs réelles du champ employes.groupe).
// Repli gris pour un groupe inconnu / vide.
export const GROUP_COLORS = {
  'Cuisine': '#d35400',
  'CD': '#c0392b',
  'CD Prod': '#e67e22',
  'Prod': '#8e44ad',
  'Prod Vitrine': '#9b59b6',
  'Serveur': '#b8860b',
  'Commercial': '#7a1f2b',
  'Menage': '#16a085',
  'Admin': '#34495e',
  'Aucun': '#95a5a6',
}

// Renommage à l'AFFICHAGE seulement (la donnée reste inchangée en base).
export const GROUP_LABELS = { 'Serveur': 'Service' }
export const groupLabel = g => GROUP_LABELS[g] || g || 'Aucun'

// Rafraîchit les pointages du jour depuis Odoo (best-effort, ne bloque pas l'affichage).
export async function refreshTodayAttendance() {
  const d = new Date()
  try { await syncAttendance(d.getMonth() + 1, d.getFullYear()) } catch { /* on garde la table telle quelle */ }
}

// Présents du jour, regroupés par groupe : [{ groupe, employes: [{id, nom}] }].
export async function loadPresence() {
  const today = todayYMD()
  const [{ data: employes }, { data: pointages }] = await Promise.all([
    supabase.from('employes').select('id, nom, groupe, photo_url').eq('actif', true).eq('fantome', false).order('nom'),
    supabase.from('pointages').select('employe_id, arrivee, depart').eq('date_pointage', today),
  ])
  // employé présent = au moins une session aujourd'hui avec arrivée et sans départ
  const presentIds = new Set()
  for (const p of (pointages || [])) {
    if (p.arrivee && !p.depart) presentIds.add(String(p.employe_id))
  }
  const byGroup = new Map()
  for (const e of (employes || [])) {
    if (!presentIds.has(String(e.id))) continue
    const g = e.groupe || 'Aucun'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g).push({ id: e.id, nom: e.nom, photo_url: e.photo_url })
  }
  // ordre des groupes = celui de GROUP_COLORS, puis les autres
  const order = Object.keys(GROUP_COLORS)
  const groups = [...byGroup.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return groups.map(g => ({ groupe: g, employes: byGroup.get(g) }))
}

// Repos HABITUEL (planning) d'un mois — PAS les congés.
// Renvoie { 'YYYY-MM-DD': [{ nom, groupe, demi }] }, trié par équipe puis nom.
// Logique identique à statutPrevu() : fixe = jour_off (+ demi_off) ; alt = off semaine paire/impaire.
export async function loadHabitualOff(mois, annee) {
  const { data: employes } = await supabase.from('employes')
    .select('nom, groupe, planning_type, planning_jour_off, planning_demi_off, planning_paire_off_1, planning_paire_off_2, planning_impaire_off_1, planning_impaire_off_2')
    .eq('actif', true).eq('fantome', false)
  const order = Object.keys(GROUP_COLORS)
  const nbDays = new Date(annee, mois, 0).getDate()
  const offByDay = {}
  for (let d = 1; d <= nbDays; d++) {
    const date = new Date(annee, mois - 1, d)
    const jour = nomJour(date)
    const list = []
    for (const e of (employes || [])) {
      let off = false, demi = false
      if (e.planning_type === 'fixe') {
        if (e.planning_jour_off === jour) off = true
        else if (e.planning_demi_off === jour) demi = true
      } else if (e.planning_type === 'alt') {
        const offs = paireOuImpaire(date) === 'Paire'
          ? [e.planning_paire_off_1, e.planning_paire_off_2]
          : [e.planning_impaire_off_1, e.planning_impaire_off_2]
        if (offs.includes(jour)) off = true
      }
      if (off || demi) list.push({ nom: e.nom, groupe: e.groupe || 'Aucun', demi })
    }
    if (!list.length) continue
    list.sort((a, b) => {
      const ia = order.indexOf(a.groupe), ib = order.indexOf(b.groupe)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.nom.localeCompare(b.nom, 'fr')
    })
    offByDay[`${annee}-${String(mois).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = list
  }
  return offByDay
}
