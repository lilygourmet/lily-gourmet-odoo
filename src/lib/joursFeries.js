import { supabase } from './supabase'

// Fériés FIXES marocains (mêmes dates chaque année). MM-DD.
export const FERIES_FIXES = [
  { md: '01-01', nom: 'Nouvel An' },
  { md: '01-11', nom: "Manifeste de l'Indépendance" },
  { md: '05-01', nom: 'Fête du Travail' },
  { md: '07-30', nom: 'Fête du Trône' },
  { md: '08-14', nom: 'Allégeance Oued Eddahab' },
  { md: '08-20', nom: 'Révolution du Roi et du Peuple' },
  { md: '08-21', nom: 'Fête de la Jeunesse' },
  { md: '10-31', nom: 'Aïd Al Wahda (Fête de l\'Unité)' },
  { md: '11-06', nom: 'Marche Verte' },
  { md: '11-18', nom: "Fête de l'Indépendance" },
]

// Charge les jours fériés (optionnellement filtrés sur une année).
export async function loadJoursFeries({ annee = null } = {}) {
  let q = supabase.from('jours_feries').select('*').order('date', { ascending: true })
  if (annee) q = q.gte('date', `${annee}-01-01`).lte('date', `${annee}-12-31`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createJourFerie({ date, nom, type = 'fixe' }) {
  if (!date || !nom) throw new Error('Date et nom requis.')
  const { data, error } = await supabase
    .from('jours_feries')
    .insert({ date, nom: nom.trim(), type })
    .select().single()
  if (error) throw error
  return data
}

export async function updateJourFerie(id, patch) {
  const allowed = ['date', 'nom', 'type']
  const clean = {}
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k]
  const { data, error } = await supabase
    .from('jours_feries')
    .update(clean)
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}

export async function deleteJourFerie(id) {
  const { error } = await supabase.from('jours_feries').delete().eq('id', id)
  if (error) throw error
}

// Insère les fériés fixes pour une année (ignore ceux déjà présents).
// Renvoie le nombre de jours ajoutés.
export async function genererFeriesFixes(annee) {
  const existants = await loadJoursFeries({ annee })
  const datesExistantes = new Set(existants.map(f => f.date))
  const aAjouter = FERIES_FIXES
    .map(f => ({ date: `${annee}-${f.md}`, nom: f.nom, type: 'fixe' }))
    .filter(f => !datesExistantes.has(f.date))
  if (aAjouter.length === 0) return 0
  const { error } = await supabase.from('jours_feries').insert(aAjouter)
  if (error) throw error
  return aAjouter.length
}

// Renvoie un Set des dates fériées (YYYY-MM-DD) comprises entre deux dates incluses.
// Pratique pour le décompte des congés (férié non décompté).
export function feriesDansPeriode(feries, debutYMD, finYMD) {
  return new Set(
    (feries || [])
      .map(f => f.date)
      .filter(d => d >= debutYMD && d <= finYMD)
  )
}

// Liste des jours fériés (objets {date, nom, type}) tombant dans [debut, fin].
export function feriesListePeriode(feries, debutYMD, finYMD) {
  return (feries || []).filter(f => f.date >= debutYMD && f.date <= finYMD)
}

// Jour de repos fixe (hebdomadaire) de l'employé, ou null.
//   fixe → planning_jour_off ; alterné → jour commun aux deux semaines.
export function joursOffFixeNom(emp) {
  if (!emp) return null
  if (emp.planning_type === 'fixe') return emp.planning_jour_off || null
  if (emp.planning_type === 'alt') {
    const p = [emp.planning_paire_off_1, emp.planning_paire_off_2].filter(Boolean)
    const i = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    return p.find(x => i.includes(x)) || null
  }
  return null
}

const _JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Liste des jours RÉELLEMENT décomptés d'un congé (hors jour de repos et hors
// jour férié), dans l'ordre chronologique. Sert à placer la récup « au début ».
export function joursDecomptesDates(emp, feriesSet, debutYMD, finYMD) {
  if (!debutYMD || !finYMD) return []
  const off = joursOffFixeNom(emp)
  const out = []
  const d = new Date(debutYMD + 'T00:00:00')
  const f = new Date(finYMD + 'T00:00:00')
  while (d <= f) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0')
    const ymd = `${y}-${m}-${j}`
    const isOff = off && _JOURS[d.getDay()] === off
    const isFerie = feriesSet && feriesSet.has(ymd)
    if (!isOff && !isFerie) out.push(ymd)
    d.setDate(d.getDate() + 1)
  }
  return out
}

// Nombre de jours fériés dans [debut, fin] qui NE tombent PAS déjà sur le jour
// de repos de l'employé (pour ne pas les décompter deux fois).
export function compteFeriesHorsOff(emp, feriesSet, debutYMD, finYMD) {
  if (!feriesSet || feriesSet.size === 0 || !debutYMD || !finYMD) return 0
  const off = joursOffFixeNom(emp)
  let n = 0
  const d = new Date(debutYMD + 'T00:00:00')
  const f = new Date(finYMD + 'T00:00:00')
  while (d <= f) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0')
    const ymd = `${y}-${m}-${j}`
    if (feriesSet.has(ymd) && (!off || _JOURS[d.getDay()] !== off)) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}
