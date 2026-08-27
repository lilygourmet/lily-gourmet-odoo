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
export async function loadHistorique(jours = 60) {
  const depuis = new Date()
  depuis.setDate(depuis.getDate() - jours)
  const { data, error } = await supabase
    .from('prod_fabrications')
    .select('id, jour, article, qty, unite, fait_par, fait_le')
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
export async function loadFabProd(jour) {
  const { data, error } = await supabase
    .from('prod_fabrications')
    .select('id, article, qty, unite, fait_par, fait_le')
    .eq('jour', jour)
    .order('fait_le', { ascending: true })
  if (error) throw error
  return data || []
}

/** Ajouter une fournée au journal du jour. */
export async function addFabProd(jour, article, qty, unite, userId) {
  const { data, error } = await supabase.from('prod_fabrications')
    .insert({ jour, article, qty, unite, fait_par: userId || null, fait_le: new Date().toISOString() })
    .select('id, article, qty, unite, fait_par, fait_le').single()
  if (error) throw error
  return data
}

/** Retirer une ligne du journal : on doit toujours pouvoir défaire un clic. */
export async function delFabProd(id) {
  const { error } = await supabase.from('prod_fabrications').delete().eq('id', id)
  if (error) throw error
}

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

/** Retirer un article ajouté à la main. Ce qui a déjà été déclaré dessus reste. */
export async function delArticle(id) {
  const { error } = await supabase.from('prod_articles').delete().eq('id', id)
  if (error) throw error
}
