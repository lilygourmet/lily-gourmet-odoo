import { supabase } from './supabase'

// ============================================================
// Lecture
// ============================================================

export async function loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, active, perm_sync, perm_check, perm_polys, perm_delete, perm_patissier, perm_print_batch, perm_print_single, perm_recaps, perm_define_gm, prod_category, perm_prod, perm_sales, team_id, perm_calendar, perm_labels, perm_freezer, perm_messages, perm_etiquettes, perm_cake_vision, perm_checklist, perm_stock_patissier, perm_stock_cafe, perm_stock_audit, perm_stock_gs, perm_caisse, perm_caisse_admin, perm_hr, perm_admin_users, created_at')
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
  perm_prod = false, perm_sales = false, team_id = null, perm_calendar = false, perm_labels = false, perm_freezer = false,
  perm_messages = false, perm_etiquettes = false,
  perm_cake_vision = false, perm_checklist = false,
  perm_stock_patissier = false, perm_stock_cafe = false, perm_stock_audit = false,
  perm_stock_gs = false,
  perm_caisse = false, perm_caisse_admin = false,
  perm_hr = false,
  perm_admin_users = false,
}) {
  const { data, error } = await supabase.rpc('create_user_v2', {
    payload: {
      username, password, full_name, role,
      perm_sync, perm_check, perm_polys, perm_delete, perm_patissier,
      perm_print_batch, perm_print_single, perm_recaps, perm_define_gm,
      prod_category, perm_prod, perm_sales, team_id, perm_calendar, perm_labels, perm_freezer,
      perm_messages, perm_etiquettes,
    },
  })

  if (error) throw error

  // Si l'utilisateur a ete cree, on s'assure que toutes les permissions
  // (y compris les nouvelles non gerees par la RPC) sont bien sauvegardees
  if (data && data.id) {
    try {
      await supabase
        .from('profiles')
        .update({
          perm_messages,
          perm_etiquettes,
          perm_cake_vision,
          perm_checklist,
          perm_stock_patissier,
          perm_stock_cafe,
          perm_stock_audit,
          perm_stock_gs,
          perm_caisse,
          perm_caisse_admin,
          perm_hr,
          perm_admin_users,
        })
        .eq('id', data.id)
    } catch (e) {
      console.error('[createUser] Failed to sync extra perms:', e)
    }
  }

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
  perm_prod, perm_sales, team_id, perm_calendar, perm_labels, perm_freezer,
  perm_messages, perm_etiquettes,
  perm_cake_vision, perm_checklist,
  perm_stock_patissier, perm_stock_cafe, perm_stock_audit,
  perm_stock_gs,
  perm_caisse, perm_caisse_admin,
  perm_hr,
  perm_admin_users,
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
  if (perm_labels !== undefined) updates.perm_labels = perm_labels
  if (perm_freezer !== undefined) updates.perm_freezer = perm_freezer
  if (perm_messages !== undefined) updates.perm_messages = perm_messages
  if (perm_etiquettes !== undefined) updates.perm_etiquettes = perm_etiquettes
  if (perm_cake_vision !== undefined) updates.perm_cake_vision = perm_cake_vision
  if (perm_checklist !== undefined) updates.perm_checklist = perm_checklist
  if (perm_stock_patissier !== undefined) updates.perm_stock_patissier = perm_stock_patissier
  if (perm_stock_cafe !== undefined) updates.perm_stock_cafe = perm_stock_cafe
  if (perm_stock_audit !== undefined) updates.perm_stock_audit = perm_stock_audit
  if (perm_stock_gs !== undefined) updates.perm_stock_gs = perm_stock_gs
  if (perm_caisse !== undefined) updates.perm_caisse = perm_caisse
  if (perm_caisse_admin !== undefined) updates.perm_caisse_admin = perm_caisse_admin
  if (perm_hr !== undefined) updates.perm_hr = perm_hr
  if (perm_admin_users !== undefined) updates.perm_admin_users = perm_admin_users
  if (perm_admin_users !== undefined) updates.perm_admin_users = perm_admin_users
  if (perm_hr !== undefined) updates.perm_hr = perm_hr

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

// Suppression : on tente d'abord un soft-delete (active=false) qui marche toujours.
// Ca empeche le user de se reconnecter, preserve l'historique (commandes faites,
// prod_done, logs...), et evite les erreurs de contrainte FK.
// Si tu veux vraiment supprimer la ligne, utilise hardDeleteUser ci-dessous.
export async function deleteUser(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ active: false })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('Utilisateur introuvable ou non modifie (peut-etre une regle RLS ?)')
  return true
}

// Suppression dure (peut echouer si FK references actives). Reservee aux cas
// ou on veut vraiment vider la ligne.
export async function hardDeleteUser(userId) {
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
