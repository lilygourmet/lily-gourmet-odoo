import { supabase } from './supabase'

// ============================================================
// Lecture
// ============================================================

export async function loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, active, perm_sync, perm_check, perm_polys, perm_delete, perm_patissier, perm_print_batch, perm_print_single, perm_recaps, perm_define_gm, prod_category, perm_prod, perm_sales, team_id, perm_calendar, created_at')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

// Alias compat
export const loadAllProfiles = loadUsers

// ============================================================
// Creation
// ============================================================

export async function createUser({
  username, password, full_name, role,
  perm_sync = false, perm_check = false, perm_polys = false,
  perm_delete = false, perm_patissier = false, perm_print_batch = false, perm_print_single = false, perm_recaps = false, perm_define_gm = false,
  prod_category = null,
  perm_prod = false, perm_sales = false, team_id = null, perm_calendar = false,
}) {
  const { data, error } = await supabase.rpc('create_user_v2', {
    payload: {
      username, password, full_name, role,
      perm_sync, perm_check, perm_polys, perm_delete, perm_patissier,
      perm_print_batch, perm_print_single, perm_recaps, perm_define_gm,
      prod_category, perm_prod, perm_sales, team_id, perm_calendar,
    },
  })

  if (error) throw error
  return data
}

// Alias compat
export const adminCreateUser = createUser

// ============================================================
// Mise a jour
// ============================================================

export async function updateUser(userId, {
  username, full_name, role, active,
  perm_sync, perm_check, perm_polys, perm_delete, perm_patissier,
  perm_print_batch, perm_print_single, perm_recaps, perm_define_gm,
  prod_category,
  perm_prod, perm_sales, team_id, perm_calendar,
}) {
  const updates = {}
  if (username !== undefined) updates.username = username
  if (full_name !== undefined) updates.full_name = full_name
  if (role !== undefined) updates.role = role
  if (active !== undefined) updates.active = active
  if (perm_sync !== undefined) updates.perm_sync = perm_sync
  if (perm_check !== undefined) updates.perm_check = perm_check
  if (perm_polys !== undefined) updates.perm_polys = perm_polys
  if (perm_delete !== undefined) updates.perm_delete = perm_delete
  if (perm_patissier !== undefined) updates.perm_patissier = perm_patissier
  if (perm_print_batch !== undefined) updates.perm_print_batch = perm_print_batch
  if (perm_print_single !== undefined) updates.perm_print_single = perm_print_single
  if (perm_recaps !== undefined) updates.perm_recaps = perm_recaps
  if (perm_define_gm !== undefined) updates.perm_define_gm = perm_define_gm
  if (prod_category !== undefined) updates.prod_category = prod_category
  if (perm_prod !== undefined) updates.perm_prod = perm_prod
  if (perm_sales !== undefined) updates.perm_sales = perm_sales
  if (team_id !== undefined) updates.team_id = team_id
  if (perm_calendar !== undefined) updates.perm_calendar = perm_calendar

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Aucun utilisateur modifié (RLS ou ID invalide ?)')
  }
  return data[0]
}

// ============================================================
// Teams
// ============================================================

export async function loadTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('ordre', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createTeam(name) {
  const { data, error } = await supabase
    .from('teams')
    .insert({ name: name.trim(), ordre: 99 })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTeam(teamId) {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
  if (error) throw error
  return true
}

// Alias compat
export const adminUpdateUser = updateUser

// ============================================================
// Reset mot de passe (par admin)
// ============================================================

export async function resetUserPassword(userId, newPassword) {
  const { data, error } = await supabase.rpc('admin_reset_password', {
    p_user_id: userId,
    p_new_password: newPassword,
  })

  if (error) throw error
  return data
}

// Alias compat
export const adminResetPassword = resetUserPassword

// ============================================================
// Suppression
// ============================================================

export async function deleteUser(userId) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)

  if (error) throw error
  return true
}

// Alias compat
export const adminDeleteUser = deleteUser

// ============================================================
// Changement de mdp par l'utilisateur lui-meme
// ============================================================

export async function changeMyPassword(userId, oldPassword, newPassword) {
  const { data, error } = await supabase.rpc('change_my_password', {
    p_user_id: userId,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  })

  if (error) throw error
  return data
}

// ============================================================
// Constantes UI
// ============================================================

export const ROLE_COLORS = {
  admin: 'bg-bordeaux/15 text-bordeaux',
  user:  'bg-line/30 text-ink-soft',
  recap: 'bg-amber-100 text-amber-800',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  user:  'Utilisateur',
  recap: 'Récap',
}
