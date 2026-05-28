import { supabase } from './supabase'
import { createTask } from './tasks'

// ============================================================
// ÉCONOMAT — demandes d'articles par employé
// ============================================================

// Profils métier (alignés sur economat_profil_categories côté SQL)
export const ECONOMAT_PROFILS = [
  { value: 'prod_annex',              label: 'Prod Annex' },
  { value: 'prod_finition_cd',        label: 'Prod Finition / CD' },
  { value: 'cake_design',             label: 'Cake Design' },
  { value: 'boutique',                label: 'Boutique' },
  { value: 'chocolat_cuisine_menage', label: 'Chocolat / Cuisine / Ménage' },
]

export function economatProfilLabel(value) {
  return ECONOMAT_PROFILS.find(p => p.value === value)?.label || value || '—'
}

// Accès au module (pour afficher l'entrée de menu) : admin, employé avec profil,
// ou l'économe qui reçoit les demandes.
export function canUseEconomat(user) {
  if (!user) return false
  return user.role === 'admin' || !!user.economat_profil || !!user.perm_econome
}

/**
 * Catégories autorisées pour l'utilisateur connecté.
 * - admin : toutes les catégories actives
 * - sinon : celles de son profil (economat_profil_categories)
 * Renvoie [] si aucune.
 */
export async function loadCategoriesForUser(user) {
  if (!user) return []

  if (user.role === 'admin') {
    const { data, error } = await supabase
      .from('economat_categories')
      .select('id, name, display_order')
      .eq('active', true)
      .order('display_order')
    if (error) throw error
    return data || []
  }

  if (!user.economat_profil) return []

  const { data, error } = await supabase
    .from('economat_profil_categories')
    .select('economat_categories ( id, name, display_order, active )')
    .eq('profil', user.economat_profil)
  if (error) throw error

  return (data || [])
    .map(r => r.economat_categories)
    .filter(c => c && c.active)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
}

/**
 * Contenu d'une catégorie : groupes (triés) avec leurs articles, + articles sans groupe.
 * Renvoie { groups: [{ id, name, articles: [...] }], ungrouped: [...] }
 */
export async function loadCategoryContent(categoryId) {
  const [groupsRes, articlesRes] = await Promise.all([
    supabase
      .from('economat_groups')
      .select('id, name, display_order')
      .eq('category_id', categoryId)
      .order('display_order'),
    supabase
      .from('economat_articles')
      .select('id, name, unit, photo_url, group_id, display_order')
      .eq('category_id', categoryId)
      .eq('active', true)
      .order('display_order'),
  ])
  if (groupsRes.error) throw groupsRes.error
  if (articlesRes.error) throw articlesRes.error

  const articles = articlesRes.data || []
  const byGroup = new Map()
  for (const a of articles) {
    const key = a.group_id ?? '__none__'
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(a)
  }

  const groups = (groupsRes.data || []).map(g => ({
    id: g.id,
    name: g.name,
    articles: byGroup.get(g.id) || [],
  })).filter(g => g.articles.length > 0)

  return { groups, ungrouped: byGroup.get('__none__') || [] }
}

// Demandes déjà envoyées par un employé (avec le détail des lignes), récentes d'abord.
export async function loadMyDemandes(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('economat_demandes')
    .select('id, created_at, status, economat_demande_lignes ( article_name, unit, qty )')
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data || []
}

// Nom du modèle WhatsApp à créer dans Wati (catégorie Utility, avec un {{1}}).
const WA_TEMPLATE = 'economat_demande'

// Comptes économes (reçoivent les demandes)
export async function loadEconomes() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, whatsapp')
    .eq('perm_econome', true)
    .eq('active', true)
  if (error) throw error
  return data || []
}

// Numéro au format international (Maroc : 0xxxxxxxxx -> 212xxxxxxxxx)
function normalizePhone(raw) {
  let n = String(raw || '').replace(/\D/g, '')
  if (!n) return ''
  if (n.startsWith('0')) n = '212' + n.slice(1)
  return n
}

// Notifie les économes par WhatsApp (modèle Wati). Non bloquant : si ça échoue
// (ex. modèle pas encore validé), la demande/tâche reste OK.
async function notifyEconomesWhatsapp(economes, who, userId) {
  for (const eco of economes) {
    const phone = normalizePhone(eco.whatsapp)
    if (!phone) continue
    try {
      const res = await fetch('/api/wati-webhook?action=send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientPhone: phone,
          templateName: WA_TEMPLATE,
          parameters: [{ name: '1', value: who }],
          userId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        console.warn('[economat] WhatsApp non envoyé:', d.error || res.status)
      }
    } catch (e) {
      console.warn('[economat] WhatsApp erreur réseau:', e.message)
    }
  }
}

// Texte récap lisible, groupé par catégorie (pour la tâche + l'impression)
function buildDemandeText(lines) {
  const byCat = {}
  for (const l of lines) {
    const c = l.catName || ''
    if (!byCat[c]) byCat[c] = []
    byCat[c].push(l)
  }
  const parts = []
  for (const [cat, items] of Object.entries(byCat)) {
    if (cat) parts.push(cat.toUpperCase())
    for (const l of items) parts.push(`• ${l.qty} × ${l.name}${l.unit ? ' (' + l.unit + ')' : ''}`)
    parts.push('')
  }
  return parts.join('\n').trim()
}

/**
 * Envoie une demande : enregistre la demande + ses lignes, et crée une tâche
 * vers chaque économe (avec le nom de l'employé, la date et le détail).
 * lines : [{ articleId, qty, name, unit, catName }]
 */
export async function createDemande({ user, categoryId, lines }) {
  if (!user?.id) throw new Error('Utilisateur manquant')
  if (!lines || lines.length === 0) throw new Error('Aucun article sélectionné')

  const economes = await loadEconomes()
  if (economes.length === 0) {
    throw new Error("Aucun économe défini. Coche « Économe » sur un compte dans Utilisateurs.")
  }

  // 1) Demande
  const { data: dem, error: e1 } = await supabase
    .from('economat_demandes')
    .insert({ requester_user_id: user.id, category_id: categoryId || null, status: 'envoyee' })
    .select('id')
    .single()
  if (e1) throw e1

  // 2) Lignes
  const { error: e2 } = await supabase
    .from('economat_demande_lignes')
    .insert(lines.map(l => ({
      demande_id: dem.id,
      article_id: l.articleId,
      article_name: l.name,
      unit: l.unit || null,
      qty: l.qty,
    })))
  if (e2) throw e2

  // 3) Tâche à chaque économe
  const who = user.full_name || user.username || 'Employé'
  const title = `🧾 Demande d'articles — ${who}`
  const description = buildDemandeText(lines)
  let firstTaskId = null
  for (const eco of economes) {
    const task = await createTask({ title, description, fromUserId: user.id, toUserId: eco.id })
    if (!firstTaskId && task?.id) firstTaskId = task.id
  }

  // 4) Lier la tâche principale à la demande
  if (firstTaskId) {
    await supabase.from('economat_demandes').update({ task_id: firstTaskId }).eq('id', dem.id)
  }

  // 5) Notif WhatsApp (non bloquant)
  await notifyEconomesWhatsapp(economes, who, user.id)

  return { demandeId: dem.id, economes: economes.length }
}
