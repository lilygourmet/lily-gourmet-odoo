import { supabase } from './supabase'
import { createTask } from './tasks'

// ============================================================
// ÉCONOMAT — demandes d'articles par employé
// ============================================================

// Les profils (« badges ») vivent dans la table economat_profils :
// voir loadProfils / createProfil / renameProfil / deleteProfil plus bas.

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
 * Ce que CET employé demande le plus souvent, pour le mettre en tête de liste.
 * Renvoie { [articleId]: nombre de demandes }. Vide tant qu'il n'a rien demandé :
 * on préfère ne rien afficher plutôt qu'inventer des habitudes.
 */
export async function loadMesHabitudes(userId) {
  if (!userId) return {}
  const { data: dem } = await supabase
    .from('economat_demandes')
    .select('id')
    .eq('requester_user_id', userId)
    .order('id', { ascending: false })
    .limit(200)
  const ids = (dem || []).map(d => d.id)
  if (!ids.length) return {}
  const { data: lignes } = await supabase
    .from('economat_demande_lignes')
    .select('article_id, demande_id')
    .in('demande_id', ids)
    .not('article_id', 'is', null)
    .limit(5000)
  const n = {}
  for (const l of (lignes || [])) n[l.article_id] = (n[l.article_id] || 0) + 1
  return n
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
      .select('id, name, unit, photo_url, group_id, display_order, odoo_source')
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
/**
 * Crée le transfert interne Odoo (brouillon) correspondant à la demande.
 * BLOQUANT : si Odoo ne répond pas, on laisse l'erreur remonter et rien
 * n'est enregistré (choix de Layla — la demande ne doit pas partir sans
 * son transfert).
 */
async function creerTransfertOdoo({ user, lines }) {
  // article économat -> produit Odoo (les articles saisis à la main n'en ont pas)
  const ids = lines.map(l => l.articleId).filter(Boolean)
  const parId = new Map()
  if (ids.length) {
    const { data } = await supabase.from('economat_articles')
      .select('id, odoo_product_id, unit, odoo_source, fournisseur_odoo_id, fournisseur_nom, achat').in('id', ids)
    for (const a of (data || [])) parId.set(a.id, a)
  }
  // Le badge de l'employé décide de la destination du stock (son lieu de
  // travail), pas la catégorie d'articles où il commande.
  let badgeLabel = null
  if (user.economat_profil) {
    const { data } = await supabase.from('economat_profils')
      .select('label').eq('value', user.economat_profil).maybeSingle()
    badgeLabel = data?.label || null
  }
  const payload = {
    badge: user.economat_profil || null,
    badgeLabel,
    demandeur: user.full_name || user.username || 'Employé',
    lignes: lines.map(l => {
      const a = l.articleId ? parId.get(l.articleId) : null
      return {
        odooProductId: a?.odoo_product_id || null,
        // l'unité affichée décide si la quantité est en unité d'achat ou de stock
        unite: a?.unit || l.unit || null,
        nom: l.name,
        qty: l.qty,
        // 'lgt' = l'article vit dans l'Odoo LG traiteur : sa demande y part en
        // réception, chez son fournisseur.
        source: a?.odoo_source === 'lgt' ? 'lgt' : 'principal',
        // Article qu'on ne prend pas en stock mais qu'on COMMANDE : sa ligne
        // part en demande de prix chez son fournisseur habituel (les frais).
        achat: a?.achat === true,
        fournisseurId: a?.fournisseur_odoo_id || null,
        fournisseurNom: a?.fournisseur_nom || null,
      }
    }),
  }
  const res = await fetch('/api/economat-transfert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Le transfert Odoo n'a pas pu être créé — demande non envoyée.")
  return data
}

export async function createDemande({ user, categoryId, lines }) {
  if (!user?.id) throw new Error('Utilisateur manquant')
  if (!lines || lines.length === 0) throw new Error('Aucun article sélectionné')

  const economes = await loadEconomes()
  if (economes.length === 0) {
    throw new Error("Aucun économe défini. Coche « Économe » sur un compte dans Utilisateurs.")
  }

  // 0) Transfert Odoo D'ABORD : s'il échoue, rien n'est créé côté app.
  const transfert = await creerTransfertOdoo({ user, lines })

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
  const refs = Array.isArray(transfert?.transferts) && transfert.transferts.length
    ? transfert.transferts
    : (transfert?.name ? [{ source: 'principal', name: transfert.name }] : [])
  const description = buildDemandeText(lines)
    + (refs.length
      ? '\n\n' + refs.map(t => {
          if (t.source === 'achat') {
            if (t.erreur) return `Achat — À COMMANDER À LA MAIN (aucun fournisseur connu) : ${(t.articles || []).join(', ')}`
            return `Achat — demande de prix ${t.name} chez ${t.fournisseur} (brouillon)`
          }
          if (t.source !== 'lgt') return `Transfert Odoo : ${t.name} (brouillon)`
          if (t.erreur) return `LG traiteur — À COMMANDER À LA MAIN (aucun fournisseur connu) : ${(t.articles || []).join(', ')}`
          return `LG traiteur — demande de prix ${t.name} chez ${t.fournisseur} (brouillon)`
        }).join('\n')
      : '')
  let firstTaskId = null
  for (const eco of economes) {
    const task = await createTask({ title, description, fromUserId: user.id, toUserId: eco.id })
    if (!firstTaskId && task?.id) firstTaskId = task.id
  }

  // 4) Lier la tâche principale à la demande
  if (firstTaskId) {
    await supabase.from('economat_demandes').update({ task_id: firstTaskId }).eq('id', dem.id)
  }

  // La notif WhatsApp au(x) économe(s) est gérée par createTask (notif générique).

  return { demandeId: dem.id, economes: economes.length }
}

// ============================================================
// GESTION (admin + économe) : catégories / groupes / articles + Odoo
// ============================================================

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Produits Odoo (via l'endpoint serveur). { q } = recherche, { ids } = refresh.
export async function loadOdooProducts({ q = '', ids = null } = {}) {
  const params = new URLSearchParams({ economat: '1' })
  if (q) params.set('q', q)
  if (ids && ids.length) params.set('ids', ids.join(','))
  const res = await fetch('/api/catalog-from-odoo?' + params.toString())
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Erreur Odoo')
  return data.products || []
}

// ---- Catégories ----
export async function loadAllCategories() {
  const { data, error } = await supabase
    .from('economat_categories')
    .select('id, name, display_order')
    .order('display_order')
  if (error) throw error
  return data || []
}
export async function createCategory(name) {
  const { data: max } = await supabase.from('economat_categories')
    .select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from('economat_categories')
    .insert({ name: name.trim(), display_order: (max?.display_order || 0) + 10 })
    .select().single()
  if (error) throw error
  return data
}
export async function deleteCategory(id) {
  const { error } = await supabase.from('economat_categories').delete().eq('id', id)
  if (error) throw error
}
export async function loadCategoryProfils(categoryId) {
  const { data, error } = await supabase.from('economat_profil_categories').select('profil').eq('category_id', categoryId)
  if (error) throw error
  return (data || []).map(r => r.profil)
}
export async function setCategoryProfils(categoryId, profils) {
  await supabase.from('economat_profil_categories').delete().eq('category_id', categoryId)
  if (profils.length) {
    const { error } = await supabase.from('economat_profil_categories')
      .insert(profils.map(p => ({ profil: p, category_id: categoryId })))
    if (error) throw error
  }
}

// ============================================================
// Badges (profils) — gérés depuis Économat → Gérer
// ============================================================

export async function loadProfils() {
  const { data, error } = await supabase
    .from('economat_profils')
    .select('value, label, display_order')
    .order('display_order')
  if (error) throw error
  return data || []
}

// Code technique garde en base, derive du nom saisi (« Ménage » -> « menage »).
// Il ne change JAMAIS ensuite : renommer un badge ne casse aucun acces.
function profilValue(label) {
  const base = norm(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return base || 'badge'
}

export async function createProfil(label) {
  const { data: max } = await supabase.from('economat_profils')
    .select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle()
  let value = profilValue(label)
  const { data: taken } = await supabase.from('economat_profils').select('value').like('value', value + '%')
  const used = new Set((taken || []).map(r => r.value))
  if (used.has(value)) { let n = 2; while (used.has(`${value}_${n}`)) n++; value = `${value}_${n}` }
  const { data, error } = await supabase.from('economat_profils')
    .insert({ value, label: label.trim(), display_order: (max?.display_order || 0) + 10 })
    .select().single()
  if (error) throw error
  return data
}

export async function renameProfil(value, label) {
  const { error } = await supabase.from('economat_profils').update({ label: label.trim() }).eq('value', value)
  if (error) throw error
}

// Employes qui portent encore ce badge (pour bloquer une suppression a l'aveugle).
export async function profilUsers(value) {
  const { data, error } = await supabase.from('profiles')
    .select('full_name, username').eq('economat_profil', value)
  if (error) throw error
  return (data || []).map(u => u.full_name || u.username)
}

export async function deleteProfil(value) {
  const users = await profilUsers(value)
  if (users.length) throw new Error(`badge encore donné à ${users.join(', ')}`)
  await supabase.from('economat_profil_categories').delete().eq('profil', value)
  const { error } = await supabase.from('economat_profils').delete().eq('value', value)
  if (error) throw error
}

// ---- Groupes ----
export async function createGroup(categoryId, name) {
  const { data: max } = await supabase.from('economat_groups')
    .select('display_order').eq('category_id', categoryId).order('display_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from('economat_groups')
    .insert({ category_id: categoryId, name: name.trim(), display_order: (max?.display_order || 0) + 10 })
    .select().single()
  if (error) throw error
  return data
}
export async function deleteGroup(id) {
  const { error } = await supabase.from('economat_groups').delete().eq('id', id)
  if (error) throw error
}

// ---- Articles (gestion) ----
export async function loadCategoryManage(categoryId) {
  const [groupsRes, articlesRes] = await Promise.all([
    supabase.from('economat_groups').select('id, name, display_order').eq('category_id', categoryId).order('display_order'),
    supabase.from('economat_articles').select('id, name, unit, photo_url, group_id, active, odoo_product_id, display_order').eq('category_id', categoryId).order('display_order'),
  ])
  if (groupsRes.error) throw groupsRes.error
  if (articlesRes.error) throw articlesRes.error
  return { groups: groupsRes.data || [], articles: articlesRes.data || [] }
}
export async function addArticleFromOdoo({ categoryId, groupId, odoo }) {
  const { data: max } = await supabase.from('economat_articles')
    .select('display_order').eq('category_id', categoryId).order('display_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabase.from('economat_articles').insert({
    category_id: categoryId,
    group_id: groupId || null,
    name: odoo.name,
    unit: odoo.unit || null,
    photo_url: odoo.image_url || null,
    odoo_product_id: odoo.odoo_id,
    odoo_name: odoo.odoo_name || odoo.name,
    odoo_source: 'principal',
    display_order: (max?.display_order || 0) + 10,
  }).select().single()
  if (error) throw error
  return data
}
/**
 * Relie un article EXISTANT à un produit Odoo (ou débranche le lien avec null).
 * Sans ce lien, l'article ne peut pas figurer dans un transfert Odoo.
 * On ne touche ni au nom ni à l'unité affichés : ils restent ceux de l'économat.
 */
export async function linkArticleToOdoo(articleId, odoo) {
  const patch = odoo
    ? { odoo_product_id: odoo.odoo_id, odoo_name: odoo.odoo_name || odoo.name }
    : { odoo_product_id: null, odoo_name: null }
  const { error } = await supabase.from('economat_articles').update(patch).eq('id', articleId)
  if (error) throw error
}

export async function setArticleActive(id, active) {
  const { error } = await supabase.from('economat_articles').update({ active }).eq('id', id)
  if (error) throw error
}
export async function deleteArticle(id) {
  const { error } = await supabase.from('economat_articles').delete().eq('id', id)
  if (error) throw error
}

// ---- Synchronisation Odoo : rattache par nom (articles non liés) puis maj nom/unité/photo ----
export async function syncWithOdoo() {
  // 1) Rattachement automatique par nom des articles sans lien Odoo
  const { data: arts, error } = await supabase.from('economat_articles').select('id, name, odoo_product_id, odoo_source')
  if (error) throw error
  // Les articles LG traiteur vivent dans l'AUTRE Odoo : leur odoo_product_id
  // désigne un produit sans rapport ici. Les synchroniser les corromprait.
  const unlinked = (arts || []).filter(a => !a.odoo_product_id && a.odoo_source !== 'lgt')
  let linked = 0, ambiguous = 0
  if (unlinked.length) {
    const all = await loadOdooProducts({})
    const byName = new Map()
    for (const p of all) {
      const k = norm(p.name)
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k).push(p)
    }
    for (const a of unlinked) {
      const m = byName.get(norm(a.name)) || []
      if (m.length === 1) {
        const { error: e } = await supabase.from('economat_articles')
          .update({ odoo_product_id: m[0].odoo_id, odoo_name: m[0].odoo_name }).eq('id', a.id)
        if (!e) linked++
      } else if (m.length > 1) ambiguous++
    }
  }

  // 2) Rafraîchit nom/unité/photo de tous les articles liés
  const { data: tous } = await supabase.from('economat_articles').select('id, odoo_product_id, odoo_source').not('odoo_product_id', 'is', null)
  const now = (tous || []).filter(a => a.odoo_source !== 'lgt')
  const ids = [...new Set(now.map(a => a.odoo_product_id))]
  const byId = new Map()
  for (let i = 0; i < ids.length; i += 100) {
    const prods = await loadOdooProducts({ ids: ids.slice(i, i + 100) })
    for (const p of prods) byId.set(p.odoo_id, p)
  }
  let updated = 0
  for (const a of now) {
    const p = byId.get(a.odoo_product_id)
    if (!p) continue
    const { error: e } = await supabase.from('economat_articles')
      .update({ name: p.name, unit: p.unit || null, photo_url: p.image_url || null, odoo_name: p.odoo_name }).eq('id', a.id)
    if (!e) updated++
  }

  return { linked, ambiguous, updated }
}
