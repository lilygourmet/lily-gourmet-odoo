import { supabase } from './supabase'
import { todayISO } from './dates'

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
  // `ordre` dit à quel ordre Odoo la déclaration se rattache, `pour` pour quel
  // gâteau elle a été faite. Ces colonnes peuvent ne pas exister (SQL pas
  // encore lancé) : on retombe sur l'ancienne lecture — et on s'en souvient,
  // pour ne pas payer une requête ratée à chaque ouverture d'écran.
  if (!manquantes.has('pour')) {
    const avecPour = await lire(base + ', ordre, ordre_cree, pour')
    if (!avecPour.error) return avecPour.data || []
    manquantes.add('pour')
  }
  const avec = await lire(base + ', ordre, ordre_cree')
  if (!avec.error) return avec.data || []
  const { data, error } = await lire(base)
  if (error) throw error
  return data || []
}

/**
 * Le premier jour à relire pour « À valider » : on remonte une semaine.
 *
 * ⚠️ L'écran ne lisait que le jour COURANT. Une déclaration faite hier et pas
 * encore validée disparaissait au changement de jour — le travail était perdu
 * de vue, et le stock d'Odoo restait négatif faute d'avoir jamais reçu la
 * production. Vécu avec le biscuit amande gingembre (Layla, 2026-09-09).
 */
export function depuisJours(jours = 7) {
  const d = new Date(todayISO() + 'T12:00:00')
  d.setDate(d.getDate() - (jours - 1))
  return d.toLocaleDateString('sv-SE')
}

/** Le journal sur plusieurs jours, pour l'historique (une seule requête). */
export async function loadFabProdDepuis(depuis, atelier = 'prod') {
  // ⚠️ `.limit()` explicite : sans lui PostgREST s'arrête à 1000 lignes sans
  // rien dire, et les jours les plus anciens disparaîtraient de l'historique.
  const lire = champs => supabase.from('prod_fabrications').select(champs)
    .gte('jour', depuis).eq('atelier', atelier)
    .order('fait_le', { ascending: false }).limit(5000)
  const base = 'id, jour, article, qty, unite, fois, fait_par, fait_le'
  if (!manquantes.has('pour')) {
    const avecPour = await lire(base + ', ordre, ordre_cree, pour')
    if (!avecPour.error) return avecPour.data || []
    manquantes.add('pour')
  }
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
// ⚠️ Les colonnes facultatives (`pour`, `ordre`) peuvent ne pas exister : le
// SQL n'a pas toujours été lancé. On le retient APRÈS le premier refus, sinon
// chaque déclaration payait un aller-retour Supabase raté — à chaque fois.
// (Layla, 2026-09-11 : « marquer comme fait rame ».)
const manquantes = new Set()

export async function addFabProd(jour, article, qty, unite, userId, fois = null, atelier = 'prod',
  ordre = null, ordreCree = false, pour = null) {
  const base = { jour, article, qty, unite, fois, atelier, fait_par: userId || null, fait_le: new Date().toISOString() }
  const champs = 'id, article, qty, unite, fois, fait_par, fait_le'
  // Les colonnes `ordre` / `ordre_cree` / `pour` peuvent ne pas exister encore
  // (SQL à lancer) : on retente sans elles plutôt que de bloquer la
  // déclaration. On perd le lien, jamais le travail de l'atelier.
  //
  // `pour` = le gâteau pour lequel cette fournée a été faite : « la ganache
  // déclarée garde le lien pour Base CBS 23 cm » (Layla, 2026-09-10).
  const dispo = c => !manquantes.has(c)
  const essais = []
  if (ordre && pour && dispo('pour')) essais.push({ ordre, ordre_cree: !!ordreCree, pour })
  if (ordre) essais.push({ ordre, ordre_cree: !!ordreCree })
  if (pour && dispo('pour')) essais.push({ pour })
  essais.push({})
  let dernier = null
  for (const sup of essais) {
    const enPlus = Object.keys(sup).map(k => ', ' + k).join('')
    const { data, error } = await supabase.from('prod_fabrications')
      .insert({ ...base, ...sup }).select(champs + enPlus).single()
    if (!error) return data
    dernier = error
    // Une colonne absente se rattrape ; le reste (droits, contrainte) non.
    if (!/ordre|pour|column|schema cache/i.test(error.message || '')) throw error
    for (const c of Object.keys(sup)) {
      if (new RegExp(`'${c}'`).test(error.message || '')) manquantes.add(c)
    }
  }
  throw dernier
}

/**
 * Quand chaque ordre a-t-il été DÉCLARÉ ? Sans filtre de jour : un gâteau monté
 * lundi se valide parfois mercredi, et c'est lundi qu'il doit compter.
 * → { 'WHPDX/MO/21310': '2026-09-08T16:05:58.000Z' }
 */
export async function datesDesOrdres(ordres) {
  const noms = [...new Set((ordres || []).filter(Boolean))]
  if (!noms.length) return {}
  const { data, error } = await supabase.from('prod_fabrications')
    .select('ordre, fait_le').in('ordre', noms).order('fait_le', { ascending: true })
  if (error) return {}
  const out = {}
  // La PREMIÈRE déclaration fait foi : c'est le moment où le travail a été fait.
  for (const l of data || []) if (l.ordre && !out[l.ordre]) out[l.ordre] = l.fait_le
  return out
}

/** Rattache après coup l'ordre Odoo à une déclaration déjà enregistrée : la
 *  création prend plusieurs secondes, on ne fait plus attendre l'atelier. */
export async function rattacherOrdre(id, ordre, ordreCree) {
  if (!id || !ordre) return
  const { error } = await supabase.from('prod_fabrications')
    .update({ ordre, ordre_cree: !!ordreCree }).eq('id', id)
  if (error && !/ordre/.test(error.message || '')) throw error
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
