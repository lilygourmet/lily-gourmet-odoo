import { supabase } from './supabase'

/**
 * Ce que l'équipe fabrique en Stock Prod, hors cake design.
 * Liste arrêtée avec Layla à partir de ce qui a réellement été produit sur
 * 2 mois : 21 articles gardés, 8 retirés (crèmes au beurre, amandes
 * caramélisées, caramel beurre salé, vitrine, les 3 mini cheese cakes).
 * L'unité est celle d'Odoo ; l'équipe peut noter dans une autre.
 */
export const ARTICLES = [
  { article: 'SM. Meringue francaise finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/meringue-francaise.jpg' },
  { article: 'SM. Creme patissiere Angelo finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/creme-patissiere-angelo.jpg' },
  { article: 'SM. Creme diplomate finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/creme-diplomate.jpg' },
  { article: 'SM. chantilly mascarpone Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/chantilly-mascarpone.jpg' },
  { article: 'SM. Subleme vanille Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/subleme-vanille.jpg' },
  { article: 'SM. glacage chocolat noir (cake cbs) Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/glacage-chocolat-noir-cake-cbs.jpg' },
  { article: 'SM. Ganache JIVARA gianduja Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/ganache-jivara-gianduja.jpg' },
  { article: 'SM. Sirop Imbibage framboise Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/sirop-imbibage-framboise.jpg' },
  { article: 'SM. Glacage chocolat GIANDUJA Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/glacage-chocolat-gianduja.jpg' },
  { article: 'SM. Namlaka Pistache', famille: 'Finitions', unite: 'g', photo: '/fab-prod/namlaka-pistache.jpg' },
  { article: 'SM. Creme mousseline paris brest', famille: 'Finitions', unite: 'g', photo: '/fab-prod/creme-mousseline-paris-brest.jpg' },
  { article: 'SM. Glacage gourmand Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/glacage-gourmand.jpg' },
  { article: 'SM. Subleme coco Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/subleme-coco.jpg' },
  { article: 'SM. sirop Imbibage Finition KG', famille: 'Finitions', unite: 'kg', photo: '/fab-prod/sirop-imbibage-finition-kg.jpg' },
  { article: 'SM. creme citron Finition', famille: 'Finitions', unite: 'g', photo: '/fab-prod/creme-citron.jpg' },
  { article: 'Sm- Pr Black forest indiv', famille: 'Autres', unite: 'u', photo: '/fab-prod/pr-black-forest-indiv.jpg' },
  { article: 'Sm- Pr Black forest 10 pers', famille: 'Autres', unite: 'u', photo: '/fab-prod/pr-black-forest-10-pers.jpg' },
  { article: 'Sm- Pr Black forest 5 pers', famille: 'Autres', unite: 'u', photo: '/fab-prod/pr-black-forest-5-pers.jpg' },
  { article: 'Sm- Pr Gianduja indiv', famille: 'Autres', unite: 'u', photo: '/fab-prod/pr-gianduja-indiv.jpg' },
  { article: 'SM- miss pistache', famille: 'Autres', unite: 'u', photo: '/fab-prod/miss-pistache.jpg' },
  { article: 'SM- mini miss pistache', famille: 'Autres', unite: 'u', photo: '/fab-prod/mini-miss-pistache.jpg' },
]

/** Qui est qui : pour afficher « par Meriem » à côté d'une déclaration. */
export async function loadNoms() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, username')
  if (error) return {}
  const map = {}
  for (const p of data || []) map[p.id] = p.full_name || p.username || ''
  return map
}

/**
 * L'historique : toutes les déclarations des N derniers jours, groupées par
 * journée. Sert à retrouver ce qui a été produit un jour passé, et à
 * l'imprimer.
 */
export async function loadHistorique(jours = 60, atelier = 'prod') {
  const depuis = new Date()
  depuis.setDate(depuis.getDate() - jours)
  const { data, error } = await supabase
    .from('prod_fabrications')
    .select('id, jour, article, qty, unite, fois, fait_par, fait_le')
    .eq('atelier', atelier)
    .gte('jour', depuis.toISOString().slice(0, 10))
    .order('jour', { ascending: false })
    .limit(2000)
  if (error) throw error
  const parJour = new Map()
  for (const d of data || []) {
    if (!parJour.has(d.jour)) parJour.set(d.jour, [])
    parJour.get(d.jour).push(d)
  }
  return [...parJour.entries()].map(([jour, lignes]) => ({ jour, lignes }))
}

/**
 * Le journal d'une journée : une ligne par fournée, dans l'ordre où elles ont
 * été notées. Le même article peut y revenir plusieurs fois — c'est le but.
 */
export async function loadFabProd(jour, atelier = 'prod') {
  const lire = champs => supabase.from('prod_fabrications').select(champs)
    .eq('jour', jour).eq('atelier', atelier).order('fait_le', { ascending: true })
  const base = 'id, article, qty, unite, fois, fait_par, fait_le'
  // `ordre` dit à quel ordre Odoo la déclaration se rattache. La colonne peut
  // ne pas exister (SQL pas encore lancé) : on retombe sur l'ancienne lecture.
  const avec = await lire(base + ', ordre, ordre_cree')
  if (!avec.error) return avec.data || []
  const { data, error } = await lire(base)
  if (error) throw error
  return data || []
}

/**
 * Ajouter une fournée au journal du jour. `fois` = combien de fois la recette
 * a été faite ; `qty` = ce que ça produit, pour garder une trace chiffrée même
 * si la recette change plus tard dans Odoo.
 */
export async function addFabProd(jour, article, qty, unite, userId, fois = null, atelier = 'prod',
  ordre = null, ordreCree = false) {
  const base = { jour, article, qty, unite, fois, atelier, fait_par: userId || null, fait_le: new Date().toISOString() }
  const champs = 'id, article, qty, unite, fois, fait_par, fait_le'
  // Les colonnes `ordre` / `ordre_cree` peuvent ne pas exister encore (SQL à
  // lancer) : on retente sans elles plutôt que de bloquer la déclaration.
  if (ordre) {
    const { data, error } = await supabase.from('prod_fabrications')
      .insert({ ...base, ordre, ordre_cree: !!ordreCree })
      .select(champs + ', ordre, ordre_cree').single()
    if (!error) return data
    if (!/ordre/.test(error.message || '')) throw error
  }
  const { data, error } = await supabase.from('prod_fabrications')
    .insert(base).select(champs).single()
  if (error) throw error
  return data
}

/** Les recettes Odoo des articles de l'écran (ce qu'il faut, et ce que ça sort). */
export async function loadRecettes(articles) {
  if (!articles.length) return {}
  const r = await fetch('/api/freezer-list?mode=recettes&articles=' + encodeURIComponent(articles.join('|')))
  if (!r.ok) return {}
  return (await r.json()).recettes || {}
}

/**
 * Les vrais articles d'Odoo qui ont une nomenclature, pour en ajouter un à
 * l'écran. On passe par eux plutôt que par un nom tapé à la main : sans le nom
 * exact d'Odoo, l'article n'a aucune recette.
 */
export async function chercherArticlesOdoo(q) {
  if (!q || q.trim().length < 2) return []
  const r = await fetch('/api/freezer-list?mode=fabricables&q=' + encodeURIComponent(q.trim()))
  if (!r.ok) return []
  return (await r.json()).articles || []
}

/** La photo que l'article a DÉJÀ dans Odoo, en data-URL. null s'il n'en a pas. */
export async function photoArticleOdoo(id) {
  if (!id) return null
  try {
    const r = await fetch('/api/freezer-list?mode=photo-article&id=' + encodeURIComponent(id))
    if (!r.ok) return null
    return (await r.json()).photo || null
  } catch { return null }
}

/**
 * Les gâteaux qui utilisent ce semi-fini (lu dans Odoo à l'envers), avec la quantité
 * par taille et ce qui est déjà commandé pour la journée. Sert à calculer combien en
 * fabriquer : les recettes archivées dans Odoo n'y sont pas.
 */
export async function loadConsommateurs(article, jour) {
  const r = await fetch(`/api/freezer-list?mode=consommateurs&article=${encodeURIComponent(article)}&jour=${jour}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).produits || []
}

/** Retirer une ligne du journal : on doit toujours pouvoir défaire un clic. */
/**
 * Retire une déclaration. Renvoie l'ordre Odoo à annuler s'il avait été créé
 * PAR L'APP — jamais un ordre qu'Odoo tenait déjà : celui-là ne nous
 * appartient pas.
 */
export async function delFabProd(id) {
  let aAnnuler = null
  const { data } = await supabase.from('prod_fabrications')
    .select('ordre, ordre_cree').eq('id', id).maybeSingle()
  if (data && data.ordre && data.ordre_cree) aAnnuler = data.ordre
  const { error } = await supabase.from('prod_fabrications').delete().eq('id', id)
  if (error) throw error
  return aAnnuler
}

// Un article de la liste de base ne vit pas en base de données : pour lui changer
// sa photo, on pose une ligne `prod_articles` à SON nom. Cette ligne est une
// PERSONNALISATION, pas un nouvel article. Le RETRAIT, lui, passe par la table
// `prod_masques` (atelier 'prod'), la même que Fabrication Annexe.

/** Les articles ajoutés à la main depuis l'onglet, en plus de la liste de base. */
export async function loadArticlesAjoutes() {
  const { data, error } = await supabase
    .from('prod_articles').select('id, nom, unite, photo').order('nom')
  if (error) throw error
  return (data || []).map(a => ({
    article: a.nom, famille: 'Autres', unite: a.unite, photo: a.photo, ajoute: a.id,
  }))
}

/** Ajouter un article que la liste ne prévoyait pas. */
export async function addArticle(nom, unite, photo, userId) {
  const { data, error } = await supabase.from('prod_articles')
    .insert({ nom: nom.trim(), unite, photo: photo || null, cree_par: userId || null })
    .select('id').single()
  if (error) throw error
  return data.id
}

/** Pose la photo d'un article — ou son retrait (photo = RETIRE). Une seule ligne
 *  par nom : on modifie celle qui existe, sinon on la crée. */
export async function majArticle(nom, unite, photo, userId) {
  const { data, error: lu } = await supabase
    .from('prod_articles').select('id').eq('nom', nom).limit(1)
  if (lu) throw lu
  if (data && data.length) {
    const { error } = await supabase.from('prod_articles').update({ photo }).eq('id', data[0].id)
    if (error) throw error
    return data[0].id
  }
  const { data: cree, error } = await supabase.from('prod_articles')
    .insert({ nom, unite: unite || 'g', photo, cree_par: userId || null })
    .select('id').single()
  if (error) throw error
  return cree.id
}

/** Retirer un article ajouté à la main. Ce qui a déjà été déclaré dessus reste. */
export async function delArticle(id) {
  const { error } = await supabase.from('prod_articles').delete().eq('id', id)
  if (error) throw error
}
