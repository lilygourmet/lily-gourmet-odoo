import { supabase } from './supabase'

// ============================================================
// CONGÉS / ABSENCES — module indépendant
// Table dédiée rh_absences, SANS lien avec employes ni la table conges (Odoo).
// ============================================================

export async function loadAbsences() {
  const { data, error } = await supabase
    .from('rh_absences')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createAbsence({ person, startDate, endDate, type, reason }, userId) {
  const { data, error } = await supabase
    .from('rh_absences')
    .insert({
      person: person.trim(),
      start_date: startDate,
      end_date: endDate,
      type: type || null,
      reason: reason?.trim() || null,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAbsence(id) {
  const { error } = await supabase.from('rh_absences').delete().eq('id', id)
  if (error) throw error
}
