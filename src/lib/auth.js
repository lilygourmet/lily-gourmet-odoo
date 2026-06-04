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

// Recharge le user depuis Supabase (permissions a jour si admin les a modifiees)
// Retourne le user frais OU null si l'utilisateur a ete desactive/supprime
export async function loadFreshUser(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, role, active, perm_sync, perm_check, perm_polys, perm_delete, perm_patissier, perm_print_batch, perm_print_single, perm_recaps, perm_define_gm, prod_category, perm_prod, perm_sales, team_id, perm_calendar, perm_labels, perm_freezer, perm_messages, perm_etiquettes, perm_cake_vision, perm_checklist, perm_stock_patissier, perm_stock_cafe, perm_stock_audit, perm_stock_gs, perm_caisse, perm_caisse_admin, perm_hr, perm_admin_users, perm_conversations, perm_mark_payment_proof, perm_view_payments, perm_validate_payments, economat_profil, perm_econome, perm_vitrine_sale, perm_modification, livreur_defaut, employe_id, last_visited_conversations, navbar_config')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.warn('[loadFreshUser]', error.message)
      return null
    }
    if (!data || !data.active) return null
    // Met a jour le cache local pour les prochains chargements
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return data
  } catch (e) {
    console.warn('[loadFreshUser]', e.message)
    return null
  }
}

export function isAdmin(user) {
  return user && user.role === 'admin'
}

// Livreur : role dédié, ne voit que Récap > card Livraisons
export function isLivreur(user) {
  return !!user && user.role === 'livreur'
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

export function canPrintBatch(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_print_batch === true
}

export function canPrintSingle(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_print_single === true
}

export function canRecaps(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_recaps === true
}

export function canDefineGM(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_define_gm === true
}

// User peut voir le calendrier (admin ou perm_calendar=true)
export function canSeeCalendar(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_calendar === true
}

// User peut imprimer les etiquettes Zebra (admin ou perm_labels=true)
export function canPrintLabels(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_labels === true
}

// User peut voir la liste sortie congelo (admin ou perm_freezer=true)
export function canSeeFreezer(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_freezer === true
}

// User peut voir l'onglet Messages (admin ou perm_messages=true)
export function canSeeMessages(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_messages === true
}

// User peut voir l'onglet Etiquettes (Entremets/GS/Surgeles) (admin ou perm_etiquettes=true)
export function canSeeEtiquettes(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_etiquettes === true
}

// User peut voir le bouton Galerie CD (Cake Vision) - lien externe
export function canSeeCakeVision(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_cake_vision === true
}

// User peut voir l'onglet Checklist (articles a ranger pour le cafe)
export function canSeeChecklist(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_checklist === true
}

// Vue Prod : user a perm_prod ou perm_sales OU est admin
export function canProd(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_prod === true || user.perm_sales === true
}

export function canSeeProd(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_prod === true
}

export function canSeeSales(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_sales === true
}

// User est en mode "prod-only" : pas admin, pas calendar, pas patissier, mais a perm_prod ou perm_sales
export function isProdOnly(user) {
  if (!user) return false
  if (user.role === 'admin') return false
  if (user.perm_calendar) return false
  if (user.perm_patissier) return false
  return user.perm_prod === true || user.perm_sales === true
}

// Categorie de production assignee a l'utilisateur ('prod' | 'sales' | null)
export function getProdCategory(user) {
  if (!user) return null
  return user.prod_category || null
}

// =====================================================================
// STOCK BOUTIQUE — nouvelles permissions
// =====================================================================

// Pâtissier (Hamza) : peut faire l'écran matin (envoyer prod au café)
export function canStockPatissier(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_patissier === true
}

// Café : peut faire réception + soir (clôture)
export function canStockCafe(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_cafe === true
}

// Équipe audit : reçoit le rapport, valide définitivement la journée
export function canStockAudit(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_audit === true
}

// Stock GS- : sous-vue stock dediee aux salues (limitee aux produits GS- non-prod)
export function canStockGS(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_gs === true
}

// User peut voir l'onglet Stock du tout
export function canSeeStock(user) {
  return canStockPatissier(user) || canStockCafe(user) || canStockAudit(user) || canStockGS(user)
}

// User peut voir l onglet Vitrine Sale (admin ou perm_vitrine_sale=true)
export function canSeeVitrineSale(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_vitrine_sale === true
}

// =====================================================================
// CAISSE — permissions
// =====================================================================

// User peut voir le module Caisse (admin OU perm_caisse OU perm_caisse_admin)
export function canSeeCaisse(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_caisse === true || user.perm_caisse_admin === true
}

// User a accès complet au module Caisse (admin OU perm_caisse_admin)
// Sans cette perm : vue ultra-simplifiée (cas de Meriem)
export function canAdminCaisse(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_caisse_admin === true
}

// User peut voir l'onglet Conversations WhatsApp (admin ou perm_conversations=true)
export function canSeeConversations(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_conversations === true
}

// User peut voir l'onglet Modifications de commande (admin ou perm_modification=true)
export function canSeeModifications(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_modification === true
}

// User peut voir l'onglet Livraisons du jour (admin, livreur, ou perm_recaps)
export function canSeeLivraisons(user) {
  if (!user) return false
  return user.role === 'admin' || user.role === 'livreur' || user.perm_recaps === true
}

// =====================================================================
// PAIEMENTS — permissions (preuves de virement transférées en interne)
// =====================================================================

// User peut marquer un message comme preuve de paiement (admin ou perm_mark_payment_proof)
export function canMarkPaymentProof(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_mark_payment_proof === true
}

// User peut voir la liste des paiements à valider (admin ou perm_view_payments)
export function canViewPayments(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_view_payments === true
}

// User peut valider un paiement (admin ou perm_validate_payments)
export function canValidatePayments(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_validate_payments === true
}
