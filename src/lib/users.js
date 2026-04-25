import { supabase } from './supabase'

export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data
}

export async function createUser(opts) {
  const { data, error } = await supabase.rpc('admin_create_user', {
    p_username: opts.username,
    p_password: opts.password,
    p_full_name: opts.fullName,
    p_role: opts.role,
    p_perm_sync: opts.permSync || false,
    p_perm_check: opts.permCheck !== false,
    p_perm_delete: opts.permDelete || false,
    p_perm_edit_warnings: opts.permEditWarnings || false,
  })
  if (error) throw error
  return data
}

export async function updateUser(opts) {
  const { error } = await supabase.rpc('admin_update_user', {
    p_user_id: opts.userId,
    p_full_name: opts.fullName,
    p_role: opts.role,
    p_active: opts.active,
    p_perm_sync: opts.permSync,
    p_perm_check: opts.permCheck,
    p_perm_delete: opts.permDelete,
    p_perm_edit_warnings: opts.permEditWarnings,
  })
  if (error) throw error
}

export async function resetUserPassword(userId, newPassword) {
  const { error } = await supabase.rpc('admin_reset_password', {
    p_user_id: userId,
    p_new_password: newPassword,
  })
  if (error) throw error
}

export async function deleteUser(userId) {
  const { error } = await supabase.rpc('admin_delete_user', {
    p_user_id: userId,
  })
  if (error) throw error
}

// Alias pour compat avec ancien code
export const loadUsers = listUsers

export const ROLE_LABELS = {
  admin: 'Admin',
  user: 'Utilisateur',
}

export const ROLE_COLORS = {
  admin: 'bg-bordeaux text-cream',
  user: 'bg-gold/20 text-chocolate',
}

// Re-export depuis auth.js pour compat
export { changeMyPassword } from './auth'
