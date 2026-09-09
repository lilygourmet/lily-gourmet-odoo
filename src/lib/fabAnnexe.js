// ============================================================
// « Fabrication Annexe 2 » : ce que le pâtissier doit fabriquer, et de quoi
// il a besoin avant de pouvoir le monter.
// Tout vient de /api/fab-annexe — le catalogue (mini/maxi/tournée) vit dans
// Supabase, le stock et les recettes viennent d'Odoo.
// ============================================================

import { addFabProd, rattacherOrdre, loadFabProd, loadNoms } from './fabricationProd'
import { creerOfPrepa } from './fabrication'
import { todayISO } from './dates'

/** L'état du jour. Jamais mis en cache : Layla doit voir ses corrections tout de suite. */
export async function loadFabAnnexe() {
  const r = await fetch('/api/fab-annexe?cb=' + Date.now())
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.articles || []
}

/**
 * Le détail d'UN article : sa cascade de recettes, ses tailles, ses figés.
 * Séparé de la liste exprès — charger tout pour tout le monde rendait
 * l'ouverture de l'écran lente dès qu'il y avait quelques articles.
 */
export async function loadArticleFabAnnexe(produit) {
  const r = await fetch('/api/fab-annexe?article=' + encodeURIComponent(produit) + '&cb=' + Date.now())
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return (d.articles || [])[0] || null
}

/**
 * Tout ce que l'annexe sait fabriquer — l'onglet « Déclarer ». Sans filtre de
 * mini : on vient y dire ce qu'on a fait, même pour un article qu'on ne suit
 * pas. Les plus fabriqués d'abord.
 */
export async function loadToutFabAnnexe() {
  const r = await fetch('/api/fab-annexe?mode=tout&cb=' + Date.now())
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.articles || []
}

/**
 * La famille d'une préparation, lue dans son nom. Ranger par gâteau ne marche
 * pas ici : la crème au beurre nature sert à une dizaine de gâteaux et se
 * retrouverait partout.
 */
export function familleDe(nom) {
  const n = String(nom || '').toLowerCase()
  // ⚠️ Le préfixe fait la première distinction, et c'est la plus utile :
  // « SM- » désigne ce qui est MONTÉ (un flan, un gianduja, un cadre), « SM. »
  // une préparation (une crème, un sirop). Sans ça, 119 articles sur 278
  // tombaient dans « Le reste ».
  if (/^sm-|^smpr|^sm ?pr/i.test(String(nom || '').trim())) return 'Gâteaux et pièces montés'
  if (/sirop|imbibage/.test(n)) return 'Sirops'
  if (/glacage|glaçage|flocage/.test(n)) return 'Glaçages'
  if (/ganache/.test(n)) return 'Ganaches'
  if (/creme au beurre|crème au beurre/.test(n)) return 'Crèmes au beurre'
  if (/chantilly|mousse|cremeux|crémeux|creme|crème|namlaka|diplomate/.test(n)) return 'Crèmes et mousses'
  if (/biscuit|genoise|génoise|daquoise|dacquoise|sable|sablé|pate|pâte|craquelin|crumble/.test(n)) return 'Biscuits et pâtes'
  if (/caramel|praline|praliné|amande|pecan|noisette/.test(n)) return 'Caramels et fruits secs'
  // ⚠️ Les croustillants AVANT les fruits : « crunchy citron passion » tombait
  // dans les confits à cause du mot « citron ».
  if (/crunchy|croustillant|craquant|feuilletine/.test(n)) return 'Croustillants'
  if (/confit|gelee|gélee|gélée|marmelade|citron|framboise|fruit/.test(n)) return 'Confits et fruits'
  return 'Le reste'
}

/**
 * Ce qui a été déclaré aujourd'hui, et par qui. S'affiche en haut des deux
 * onglets : l'atelier voit d'un coup d'œil ce qui est déjà passé, et personne
 * ne refait ce qu'un collègue vient de faire. (Layla, 2026-09-09.)
 */
export async function loadHistoriqueAnnexe() {
  const [journal, noms] = await Promise.all([
    loadFabProd(todayISO(), 'annexe').catch(() => []),
    loadNoms().catch(() => ({})),
  ])
  return (journal || [])
    .map(l => ({ ...l, qui: noms[l.fait_par] || '' }))
    .sort((a, b) => String(b.fait_le).localeCompare(String(a.fait_le)))
}

/** La photo d'un article, servie par Odoo (souvent celle du produit vendu). */
export const photoFabAnnexe = nom => '/api/fab-annexe?photo=' + encodeURIComponent(nom)

/** Les composants d'un nœud, qu'il soit l'article de tête ou un morceau. */
export const enfantsDe = noeud => noeud?.composants || noeud?.enfants || []

/**
 * Combien de tournées proposer : de quoi remonter au maxi, jamais moins d'une.
 * Le pâtissier reste libre d'en faire plus ou moins — c'est une suggestion,
 * pas une consigne (Layla, 2026-09-07 : « il doit pouvoir me suggérer de la
 * faire 2× pour arriver au max, ou 22, selon mon choix »).
 */
export function tourneesSuggerees(article) {
  // Ce qui reste pour atteindre le maxi, une fois compté ce qui est déjà
  // déclaré du jour : une tournée à moitié faite ne se redemande pas en entier.
  const manque = article?.reste !== undefined
    ? article.reste
    : (article?.maxi || 0) - (article?.stock || 0)
  const t = article?.tournee || 1
  // Au demi près : le suprême amandes 20 cm a un maxi de 33 pour une tournée
  // de 22 — il y faut une tournée et demie, pas une ni deux.
  return Math.max(0.5, Math.round((manque / t) * 2) / 2)
}

/**
 * Ce qu'il faut vraiment, pour le nombre de tournées choisi. Les quantités de
 * l'API valent pour UNE tournée ; ici on les met à l'échelle, et on recalcule
 * ce que chaque composant demande à son tour.
 *
 * Une demi-tournée est permise : 39 pièces d'un coup, c'est parfois trop, et
 * une crème au beurre se fait très bien en moitié.
 */
export function pourFois(article, fois) {
  if (!article || fois === 1) return article
  const ech = c => {
    const besoin = c.besoin * fois
    // ⚠️ Compter ce qui est DÉJÀ déclaré, comme le fait le serveur. Sans ça, un
    // composant fabriqué ce matin redevenait bloquant dès qu'on choisissait
    // autre chose qu'une tournée pile — c'est-à-dire presque toujours.
    const dispo = (c.stock || 0) + (c.dejaFait || 0)
    const ok = !c.fabrique || dispo >= besoin
    const out = { ...c, besoin, ok }
    if (!ok && c.tourneeTaille) {
      out.tournees = Math.max(1, Math.ceil((besoin - dispo) / c.tourneeTaille))
      out.produira = out.tournees * c.tourneeTaille
    }
    if (c.enfants) out.enfants = c.enfants.map(ech)
    return out
  }
  return {
    ...article,
    tournee: article.tournee * fois,
    composants: (article.composants || []).map(ech),
    ajustements: Object.fromEntries(Object.entries(article.ajustements || {})
      .map(([k, v]) => [k, Math.round(v * fois * 1000) / 1000])),
  }
}

/**
 * Ce qui empêche de dire « c'est fait » : un composant qu'on FABRIQUE et dont
 * il n'y a pas assez. Le pâtissier se débloque en le fabriquant à son tour.
 *
 * Vaut à TOUS les niveaux, aussi profond qu'aille la recette (Layla,
 * 2026-09-07) : pour valider le biscuit indiv il faut la plaque, et si la
 * plaque manque aussi, il la fait d'abord. Chaque niveau ne regarde que ses
 * enfants directs — la chaîne se tient toute seule, puisqu'on ne peut pas
 * valider un enfant tant que SES enfants manquent.
 */
export function bloquants(noeud, dejaFaits) {
  const faits = dejaFaits instanceof Set ? dejaFaits : new Set(dejaFaits || [])
  // ⚠️ L'appelant ne doit passer QUE des composants réellement déclarés : une
  // quantité retapée sans « c'est fait » est un brouillon, pas une fabrication.
  // Voir `declares()`.
  return enfantsDe(noeud)
    .filter(c => !c.ok && c.fabrique && !faits.has(c.produit))
    .map(c => c.produit)
}

/** Les composants vraiment déclarés — les brouillons n'en sont pas. */
export const declares = faits =>
  Object.entries(faits || {}).filter(([, v]) => v && !v.brouillon).map(([k]) => k)

/**
 * Où on en est dans la descente. `chemin` part de l'article :
 * ['Tiramisu', 'Biscuit indiv', 'Biscuit plaque'] → le nœud de la plaque.
 */
export function noeudAu(articles, chemin) {
  const article = (articles || []).find(a => a.produit === chemin[0])
  if (!article) return { article: null, noeud: null, parent: null }
  let noeud = article
  let parent = null
  for (const nom of chemin.slice(1)) {
    const suivant = enfantsDe(noeud).find(c => c.produit === nom)
    if (!suivant) return { article, noeud: null, parent: null }
    parent = noeud.produit || article.libelle
    noeud = suivant
  }
  return { article, noeud, parent }
}

/**
 * Ce qui a été RÉELLEMENT PESÉ pour cette fournée, prêt à imposer à l'ordre
 * Odoo. La recette de l'article est écrite pour une tournée ; `fois` dit
 * combien on en a fait.
 *
 * Sans ça, Odoo recalculerait les ingrédients au prorata du poids obtenu : un
 * sirop qui rend 2 600 g au lieu de 2 790 aurait consommé moins de café que ce
 * qu'on a réellement mis dedans.
 *
 * ⚠️ Un même ingrédient peut occuper deux lignes de la recette, et Odoo pose
 * la consigne sur chacune : on répartit alors le total entre elles.
 */
export function peseesDe(noeud, fois) {
  const par = new Map()
  for (const l of noeud?.recette || []) {
    const e = par.get(l.produit) || { total: 0, lignes: 0 }
    e.total += (Number(l.qty) || 0) * fois
    e.lignes += 1
    par.set(l.produit, e)
  }
  return Object.fromEntries([...par].map(([nom, e]) =>
    [nom, Math.round((e.total / e.lignes) * 1000) / 1000]))
}

/**
 * Une chose fabriquée part TOUT DE SUITE dans « À valider Annexe ».
 *
 * Le pâtissier fait son sirop ce soir et montera peut-être le tiramisu demain :
 * attendre la fin du montage pour tout envoyer, c'était perdre son travail —
 * il déclarait le sirop, rien n'arrivait. (Corrigé le 2026-09-07.)
 *
 * La déclaration est enregistrée AVANT que l'ordre soit demandé à Odoo : la
 * création prend plusieurs secondes, et une coupure ne doit pas effacer le
 * travail de l'atelier. L'ordre se rattache après coup.
 */
export async function declarer({ produit, qty, unite, fois = null, ajustements = null }, userId) {
  const ligne = await addFabProd(todayISO(), produit, qty, unite, userId, fois, 'annexe')
  const of = await creerOfPrepa(produit, qty, userId, [], unite, 'annexe', ajustements)
  // En mode test (?test=1) Odoo n'écrit rien : pas de numéro à rattacher.
  if (of?.name && !of.error && !of.test) await rattacherOrdre(ligne.id, of.name, !of.deja)
  return { produit, qty, ordre: of?.name || null, erreur: of?.error || null }
}

/**
 * L'article de tête, une fois la tournée montée. Il sort avec la quantité
 * RÉELLEMENT sortie (128 et non 140) : Odoo ramène alors tout seul le biscuit,
 * le sirop et l'amaretti à 128 via la recette. Seuls les ingrédients figés
 * sont imposés, à la tournée entière — c'est le rôle de `article.ajustements`.
 */
export function envoyerAValider(article, sortie, userId) {
  return declarer({
    produit: article.produit, qty: sortie, unite: article.unite,
    ajustements: article.ajustements || null,
  }, userId)
}
