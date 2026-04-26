import { supabase } from './supabase'

const STORAGE_KEY = 'lily_user'

// Login - retourne { user, error } pour compat avec Login.jsx
export async function loginWithUsername(username, password) {
  try {
    const { data, error } = await supabase.rpc('verify_login', {
      p_username: username.trim().toLowerCase(),
      p_password: password,
    })
    if (error) return { user: null, error: error.message }
    if (!data || data.length === 0) {
      return { user: null, error: 'Identifiants incorrects' }
    }
    const user = data[0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    return { user, error: null }
  } catch (e) {
    return { user: null, error: e.message }
  }
}

// Alias court
export const login = loginWithUsername

export function logout() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getCurrentUser() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isAdmin(user) {
  return user && user.role === 'admin'
}

// Permissions granulaires
export function canSync(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_sync === true
}

export function canCheck(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_check === true
}

export function canDelete(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_delete === true
}

export function canEditPolysPerm(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_polys === true
}

export function canPatissier(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_patissier === true
}

// User est en mode "patissier seulement" si perm_patissier=true ET role !== 'admin'
export function isPatissierOnly(user) {
  if (!user) return false
  return user.role !== 'admin' && user.perm_patissier === true
}

// Aliases compat avec ancien code (uploadPdf -> sync dans la nouvelle archi)
export const canUploadPdf = canSync
export const canForceReupload = canSync
export const canManageUsers = isAdmin
export const canCheckSteps = canCheck
export const canDeleteOrders = canDelete

export async function changeMyPassword(userId, oldPassword, newPassword) {
  const { data, error } = await supabase.rpc('change_my_password', {
    p_user_id: userId,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  })
  if (error) throw error
  return data
}

// Helpers complementaires
export const canEditPolys = canEditPolysPerm
export const canUncheckSteps = canCheck
export const canDeleteOrder = canDelete

export function formatRelativeTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000) // secondes

  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`

  // Plus d'une semaine -> date courte
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}
