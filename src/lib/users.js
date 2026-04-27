import { supabase } from './supabase'

// ============================================================
// Lecture
// ============================================================

export async function loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, active, perm_sync, perm_check, perm_polys, perm_delete, perm_patissier, perm_print_batch, perm_print_single, perm_recaps, created_at')
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
  perm_delete = false, perm_patissier = false, perm_print_batch = false, perm_print_single = false, perm_recaps = false,
}) {
  const { data, error } = await supabase.rpc('create_user_v2', {
    payload: {
      username,
      password,
      full_name,
      role,
      perm_sync,
      perm_check,
      perm_polys,
      perm_delete,
      perm_patissier,
      perm_print_batch,
      perm_print_single,
      perm_recaps,
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
  perm_print_batch, perm_print_single, perm_recaps,
}) {
  const { data, error } = await supabase.rpc('admin_update_user', {
    p_user_id: userId,
    p_username: username,
    p_full_name: full_name,
    p_role: role,
    p_active: active,
    p_perm_sync: perm_sync,
    p_perm_check: perm_check,
    p_perm_polys: perm_polys,
    p_perm_delete: perm_delete,
    p_perm_patissier: perm_patissier,
    p_perm_print_batch: perm_print_batch,
    p_perm_print_single: perm_print_single,
    p_perm_recaps: perm_recaps,
  })

  if (error) throw error
  return data
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
