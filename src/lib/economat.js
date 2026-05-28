import { supabase } from './supabase'

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
