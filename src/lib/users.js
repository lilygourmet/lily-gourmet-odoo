import { supabase } from './supabase'
import { memoCache } from './memoCache'
import { PERM_KEYS } from './permsList'

// ============================================================
// Lecture
// ============================================================

// Cache COURT (60 s) : assez pour éviter de recharger la liste à chaque
// ouverture du Calendrier/Admin, et se rafraîchit tout seul après une modif
// (donc pas besoin de vider le cache à chaque endroit qui édite un compte).
async function _loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, active, perm_sync, perm_check, perm_polys, perm_delete, perm_patissier, perm_print_batch, perm_print_single, perm_recaps, perm_define_gm, prod_category, perm_prod, perm_sales, team_id, perm_calendar, perm_labels, perm_freezer, perm_messages, perm_etiquettes, perm_etiquettes_boites, perm_cake_vision, perm_cake_vision_edit, perm_checklist, perm_stock_patissier, perm_stock_cafe, perm_stock_audit, perm_stock_gs, perm_caisse, perm_caisse_admin, perm_hr, perm_admin_users, perm_conversations, perm_devis, perm_commande, perm_ai_tools, perm_photoshop, perm_valider_of, perm_fabrication_cd, perm_fabrication_glacage, perm_stock_poly, perm_simu_gateaux, perm_transfert_annexe, perm_transfert_boutique, perm_transfert_produits, perm_facture_ocp, perm_notif_modif, perm_notif_ocp, perm_modification, perm_mark_payment_proof, perm_view_payments, perm_validate_payments, economat_profil, perm_econome, perm_vitrine_sale, perm_stock_prod_vitrine, perm_stock_prod_annexe, perm_stock_minmax, perm_livraisons_dispatch, perm_livreur_defaut, perm_livreur_assigne, perm_besoins_achat, perm_achat, whatsapp, employe_id, created_at, navbar_config, groupe, livreur_defaut')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}
export const loadUsers = memoCache(_loadUsers, 60 * 1000)

// Alias compat
export const loadAllProfiles = loadUsers

// Coche/décoche UNE permission pour UN utilisateur (onglet « Par permission »).
// Liste blanche : on n'écrit que des colonnes de permission connues.
export async function setUserPerm(userId, key, on) {
  if (!PERM_KEYS.includes(key)) throw new Error('Permission inconnue : ' + key)
  const { error } = await supabase.from('profiles').update({ [key]: on }).eq('id', userId)
  if (error) throw error
  loadUsers.clear()   // sinon le cache 60 s réaffiche l'ancienne valeur
}

// Active/désactive la réception de la notif devis OCP pour un utilisateur (toggle direct).
export async function setUserOcpNotif(userId, on) {
  const { error } = await supabase.from('profiles').update({ perm_notif_ocp: on }).eq('id', userId)
  if (error) throw error
}

// ============================================================
// Creation
// ============================================================

export async function createUser({
  username, password, full_name, role,
  perm_sync = false, perm_check = false, perm_polys = false,
  perm_delete = false, perm_patissier = false, perm_print_batch = false, perm_print_single = false, perm_recaps = false, perm_define_gm = false,
  prod_category = null,
  perm_prod = false, perm_sales = false, team_id = null, perm_calendar = false, perm_labels = false, perm_freezer = false,
  perm_messages = false, perm_etiquettes = false, perm_etiquettes_boites = false,
  perm_cake_vision = false, perm_checklist = false,
  perm_stock_patissier = false, perm_stock_cafe = false, perm_stock_audit = false,
  perm_stock_gs = false,
  perm_caisse = false, perm_caisse_admin = false,
  perm_hr = false,
  perm_admin_users = false,
  perm_conversations = false,
  perm_devis = false,
  perm_commande = false,
  perm_ai_tools = false,
  perm_photoshop = false, perm_valider_of = false, perm_fabrication_cd = false, perm_fabrication_glacage = false,
  perm_stock_poly = false,
  perm_simu_gateaux = false,
  perm_transfert_annexe = false, perm_transfert_boutique = false, perm_transfert_produits = false,
  perm_facture_ocp = false,
  perm_notif_modif = false,
  perm_modification = false,
  livreur_defaut = false,
  perm_mark_payment_proof = false, perm_view_payments = false, perm_validate_payments = false,
  economat_profil = null, perm_econome = false, whatsapp = null,
  perm_vitrine_sale = false,
  perm_stock_prod_vitrine = false, perm_stock_prod_annexe = false, perm_stock_minmax = false,
  perm_livraisons_dispatch = false, perm_livreur_defaut = false, perm_livreur_assigne = false,
  perm_besoins_achat = false, perm_achat = false,
  employe_id = null,
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

  // create_user_v2 renvoie l'id DIRECTEMENT (chaîne uuid), pas un objet { id }.
  const newId = typeof data === 'string' ? data : data?.id

  // Si l'utilisateur a ete cree, on s'assure que toutes les permissions
  // (y compris les nouvelles non gerees par la RPC) sont bien sauvegardees
  if (newId) {
    try {
      await supabase
        .from('profiles')
        .update({
          perm_messages,
          perm_etiquettes,
          perm_etiquettes_boites,
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
          perm_conversations,
          perm_devis,
          perm_commande,
          perm_ai_tools,
          perm_photoshop, perm_valider_of, perm_fabrication_cd, perm_fabrication_glacage,
          perm_stock_poly,
          perm_simu_gateaux,
          perm_transfert_annexe,
          perm_transfert_boutique,
          perm_transfert_produits,
          perm_facture_ocp,
          perm_notif_modif,
          perm_modification,
          livreur_defaut,
          perm_mark_payment_proof,
          perm_view_payments,
          perm_validate_payments,
          economat_profil,
          perm_econome,
          perm_besoins_achat,
          perm_achat,
          perm_vitrine_sale,
          perm_stock_prod_vitrine,
          perm_stock_prod_annexe,
          perm_stock_minmax,
          perm_livraisons_dispatch,
          perm_livreur_defaut,
          perm_livreur_assigne,
          whatsapp,
          employe_id,
        })
        .eq('id', newId)
    } catch (e) {
      console.error('[createUser] Failed to sync extra perms:', e)
    }
  }

  return { id: newId }
}

// Alias compat
export const adminCreateUser = createUser

// ============================================================
// Création automatique d'un user à partir d'un employé
// ============================================================

// Minuscules, sans accents, sans espaces ni caractères spéciaux.
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // enlève les accents
    .replace(/[^a-z0-9]/g, '')                  // garde lettres + chiffres
}

// Découpe le nom complet : 1er mot = prénom, dernier mot = nom de famille.
function splitNom(nomComplet) {
  const parts = (nomComplet || '').trim().split(/\s+/).filter(Boolean)
  return { prenom: parts[0] || '', famille: parts.length > 1 ? parts[parts.length - 1] : '' }
}

// Login = prénom + 3 premières lettres du nom de famille.
export function buildLogin(nomComplet) {
  const { prenom, famille } = splitNom(nomComplet)
  return slugify(prenom) + slugify(famille).slice(0, 3)
}

// Mot de passe = prénom + année d'entrée (ex: "asmae2023").
export function buildPassword(nomComplet, dateEntree) {
  const { prenom } = splitNom(nomComplet)
  const annee = dateEntree ? String(new Date(dateEntree).getFullYear()) : ''
  return slugify(prenom) + annee
}

// Téléphone marocain → format WATI international 212XXXXXXXXX.
function normalizePhone(tel) {
  const d = String(tel || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('212')) return d
  if (d.startsWith('0')) return '212' + d.slice(1)
  return d
}

// Trouve un login libre : ajoute un chiffre si le login de base est déjà pris.
async function uniqueLogin(base) {
  const { data } = await supabase.from('profiles').select('username').ilike('username', base + '%')
  const taken = new Set((data || []).map(u => (u.username || '').toLowerCase()))
  if (!taken.has(base)) return base
  let i = 1
  while (taken.has(base + i)) i++
  return base + i
}

/**
 * Crée le user d'un employé (sans aucune permission, sauf tâches qui sont libres).
 * Ne change PAS le mot de passe d'un user existant.
 * Retourne { ok, username, password, prenom, whatsapp, userId } ou { ok:false, reason }.
 */
export async function createUserForEmploye(employe) {
  const { prenom } = splitNom(employe.nom)
  if (!prenom) return { ok: false, reason: 'nom vide' }
  if (!employe.date_entree) return { ok: false, reason: "date d'entrée manquante" }

  const username = await uniqueLogin(buildLogin(employe.nom))
  const password = buildPassword(employe.nom, employe.date_entree)
  const whatsapp = normalizePhone(employe.telephone)

  const created = await createUser({
    username, password, full_name: employe.nom, role: 'user',
    whatsapp, employe_id: employe.id,
  })
  if (!created?.id) return { ok: false, reason: created?.error || 'échec création' }

  // Recopie le groupe sur le user (classement)
  await supabase.from('profiles').update({ groupe: employe.groupe || null }).eq('id', created.id)

  return { ok: true, userId: created.id, username, password, prenom, whatsapp }
}

/**
 * Désactive le user lié à un employé (login bloqué). On garde l'historique.
 */
export async function deactivateUserForEmploye(employeId) {
  const { error } = await supabase.from('profiles').update({ active: false }).eq('employe_id', employeId)
  if (error) throw error
}

/**
 * Crée les users manquants pour tous les employés actifs.
 * Les accès (login + mot de passe) sont à communiquer manuellement.
 * Retourne { created:[...], skipped:[...], errors:[...] }.
 */
export async function createMissingEmployeUsers(employes) {
  const { data: linked } = await supabase.from('profiles').select('employe_id').not('employe_id', 'is', null)
  const hasUser = new Set((linked || []).map(p => p.employe_id))

  const created = [], skipped = [], errors = []
  for (const e of employes) {
    if (!e.actif) continue
    if (hasUser.has(e.id)) continue
    try {
      const r = await createUserForEmploye(e)
      if (!r.ok) { skipped.push({ nom: e.nom, reason: r.reason }); continue }
      created.push({ nom: e.nom, username: r.username, password: r.password })
    } catch (err) {
      errors.push({ nom: e.nom, reason: err?.message || 'erreur' })
    }
  }
  return { created, skipped, errors }
}

// ============================================================
// Mise a jour
// ============================================================

export async function updateUser(userId, {
  username, full_name, role, active,
  perm_sync, perm_check, perm_polys, perm_delete, perm_patissier,
  perm_print_batch, perm_print_single, perm_recaps, perm_define_gm,
  prod_category,
  perm_prod, perm_sales, team_id, perm_calendar, perm_labels, perm_freezer,
  perm_messages, perm_etiquettes, perm_etiquettes_boites,
  perm_cake_vision, perm_cake_vision_edit, perm_checklist,
  perm_stock_patissier, perm_stock_cafe, perm_stock_audit,
  perm_stock_gs,
  perm_caisse, perm_caisse_admin,
  perm_hr,
  perm_admin_users,
  perm_conversations,
  perm_devis,
  perm_commande,
  perm_ai_tools,
  perm_photoshop,
  perm_valider_of, perm_fabrication_cd, perm_fabrication_glacage,
  perm_stock_poly,
  perm_simu_gateaux,
  perm_transfert_annexe, perm_transfert_boutique, perm_transfert_produits,
  perm_facture_ocp,
  perm_notif_modif,
  perm_modification,
  livreur_defaut,
  perm_mark_payment_proof, perm_view_payments, perm_validate_payments,
  economat_profil, perm_econome, whatsapp,
  perm_vitrine_sale,
  perm_stock_prod_vitrine, perm_stock_prod_annexe, perm_stock_minmax,
  perm_livraisons_dispatch, perm_livreur_defaut, perm_livreur_assigne,
  perm_besoins_achat, perm_achat,
  employe_id,
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
  if (perm_etiquettes_boites !== undefined) updates.perm_etiquettes_boites = perm_etiquettes_boites
  if (perm_cake_vision !== undefined) updates.perm_cake_vision = perm_cake_vision
  if (perm_cake_vision_edit !== undefined) updates.perm_cake_vision_edit = perm_cake_vision_edit
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
  if (perm_conversations !== undefined) updates.perm_conversations = perm_conversations
  if (perm_devis !== undefined) updates.perm_devis = perm_devis
  if (perm_commande !== undefined) updates.perm_commande = perm_commande
  if (perm_ai_tools !== undefined) updates.perm_ai_tools = perm_ai_tools
  if (perm_photoshop !== undefined) updates.perm_photoshop = perm_photoshop
  if (perm_valider_of !== undefined) updates.perm_valider_of = perm_valider_of
  if (perm_fabrication_cd !== undefined) updates.perm_fabrication_cd = perm_fabrication_cd
  if (perm_fabrication_glacage !== undefined) updates.perm_fabrication_glacage = perm_fabrication_glacage
  if (perm_stock_poly !== undefined) updates.perm_stock_poly = perm_stock_poly
  if (perm_simu_gateaux !== undefined) updates.perm_simu_gateaux = perm_simu_gateaux
  if (perm_transfert_annexe !== undefined) updates.perm_transfert_annexe = perm_transfert_annexe
  if (perm_transfert_boutique !== undefined) updates.perm_transfert_boutique = perm_transfert_boutique
  if (perm_transfert_produits !== undefined) updates.perm_transfert_produits = perm_transfert_produits
  if (perm_facture_ocp !== undefined) updates.perm_facture_ocp = perm_facture_ocp
  if (perm_notif_modif !== undefined) updates.perm_notif_modif = perm_notif_modif
  if (perm_modification !== undefined) updates.perm_modification = perm_modification
  if (livreur_defaut !== undefined) updates.livreur_defaut = livreur_defaut
  if (perm_mark_payment_proof !== undefined) updates.perm_mark_payment_proof = perm_mark_payment_proof
  if (perm_view_payments !== undefined) updates.perm_view_payments = perm_view_payments
  if (perm_validate_payments !== undefined) updates.perm_validate_payments = perm_validate_payments
  if (economat_profil !== undefined) updates.economat_profil = economat_profil
  if (perm_econome !== undefined) updates.perm_econome = perm_econome
  if (perm_besoins_achat !== undefined) updates.perm_besoins_achat = perm_besoins_achat
  if (perm_achat !== undefined) updates.perm_achat = perm_achat
  if (perm_vitrine_sale !== undefined) updates.perm_vitrine_sale = perm_vitrine_sale
  if (perm_stock_prod_vitrine !== undefined) updates.perm_stock_prod_vitrine = perm_stock_prod_vitrine
  if (perm_stock_prod_annexe !== undefined) updates.perm_stock_prod_annexe = perm_stock_prod_annexe
  if (perm_stock_minmax !== undefined) updates.perm_stock_minmax = perm_stock_minmax
  if (perm_livraisons_dispatch !== undefined) updates.perm_livraisons_dispatch = perm_livraisons_dispatch
  if (perm_livreur_defaut !== undefined) updates.perm_livreur_defaut = perm_livreur_defaut
  if (perm_livreur_assigne !== undefined) updates.perm_livreur_assigne = perm_livreur_assigne
  if (whatsapp !== undefined) updates.whatsapp = whatsapp
  if (employe_id !== undefined) updates.employe_id = employe_id

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
// Disposition perso de la barre d'onglets (header)
// config = { order: [...views], hidden: [...views] }  ou  null (= défaut)
// ============================================================
export async function saveNavbarConfig(userId, config) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ navbar_config: config })
    .eq('id', userId)
    .select('id, navbar_config')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Disposition non enregistrée (RLS ou ID invalide ?)')
  }
  return data[0]
}

// Enregistre la disposition perso des onglets de L'UTILISATEUR CONNECTÉ.
// Passe par un endpoint serveur qui vérifie le JWT et n'écrit QUE navbar_config
// → chaque employé peut ranger SES onglets sans droit d'écriture direct sur profiles.
export async function saveMyNavbarConfig(config) {
  const token = localStorage.getItem('lily_jwt')
  const res = await fetch('/api/wati-webhook?action=save-navbar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ config }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error || `Erreur ${res.status}`)
  }
  return res.json()
}

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

// Suppression dure via fonction serveur sécurisée (admin only + compte déjà désactivé).
// Passe par une RPC car la RLS n'autorise pas le DELETE direct sur profiles.
export async function hardDeleteUser(userId, adminId) {
  const { error } = await supabase.rpc('hard_delete_user', { p_user_id: userId, p_admin_id: adminId })
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
