// ============================================================
// « Fabrication Annexe 2 » : ce que le pâtissier doit fabriquer, et de quoi
// il a besoin avant de pouvoir le monter.
// Tout vient de /api/fab-annexe — le catalogue (mini/maxi/tournée) vit dans
// Supabase, le stock et les recettes viennent d'Odoo.
// ============================================================

import { addFabProd, rattacherOrdre, loadFabProdDepuis, loadNoms } from './fabricationProd'
import { creerOfPrepa } from './fabrication'
import { toast } from './toast'
import { todayISO } from './dates'
import { correspond } from './recherche'
import { supabase } from './supabase'

/**
 * L'état du jour, AVEC la recette de chaque article. Jamais mis en cache :
 * Layla doit voir ses corrections tout de suite.
 *
 * Tout arrive d'un coup parce que ça ne coûte plus rien : depuis que le stock
 * du lieu se lit en une fois, la liste complète met le même temps qu'un seul
 * article. Chaque clic devient instantané au lieu d'une seconde d'attente.
 * (Layla, 2026-09-10 : « c'est trop lent à travailler ».)
 */
export async function loadFabAnnexe() {
  const r = await fetch('/api/fab-annexe?details=1&cb=' + Date.now())
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
  return (await loadArticlesFabAnnexe([produit]))[0] || null
}

/**
 * PLUSIEURS fiches d'un coup. « Déclarer » demande tout un gâteau quand on
 * l'ouvre : ses tailles sont alors prêtes avant même qu'on tape dessus.
 *
 * Les calculer ensemble ne coûte presque rien de plus — même cache de
 * recettes, mêmes stocks lus une fois. Un par un, c'était 1,4 seconde
 * d'attente à chaque clic (Layla, 2026-09-11).
 */
export async function loadArticlesFabAnnexe(produits) {
  const noms = [...new Set((produits || []).filter(Boolean))]
  if (!noms.length) return []
  const r = await fetch('/api/fab-annexe?article=' + encodeURIComponent(noms.join('|'))
    + '&cb=' + Date.now())
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.articles || []
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
 * Dans Odoo, tout ce qui se fabrique à l'annexe commence par « SM ». Ce qui
 * suit dit quoi : un TIRET (« SM- », « SMPr- ») = un gâteau monté ; un point,
 * un slash ou rien du tout (« SM. », « SMT. », « SM CD* », « SM/ ») = une
 * préparation — crème, sirop, biscuit, fourrage. (Layla, 2026-09-09.)
 */
export function estPreparation(nom) {
  const m = /^([A-Za-z]+)\s*(.?)/.exec(String(nom || '').trim())
  return !!m && /^sm/i.test(m[1]) && m[2] !== '-'
}

/**
 * L'onglet « Déclarer », rangé par GÂTEAU : chaque article monté sous le ou les
 * gâteaux auxquels il sert, avec leur photo. Un même article peut donc
 * apparaître sous plusieurs — c'est voulu : on cherche par le gâteau qu'on est
 * en train de faire. (Layla, 2026-09-09.)
 *
 * Les préparations n'ont pas leur place dans cette liste : on les retrouve
 * dans la recette du gâteau, avec leur stock, là où on les débloque.
 * (Layla, 2026-09-09.)
 *
 * Ce qui ne sert à aucun article vendu se retrouve à la fin, sous « Le reste ».
 */
const sansPrefixe = nom => String(nom || '').trim().replace(/^sm\s*-\s*/i, '')

/** « SM- Pr Cheesecake indiv » : le montage fini, qui consomme l'étape d'avant. */
const estPr = nom => /^pr\s/i.test(sansPrefixe(nom))

/** Le gâteau et sa taille, sans le préfixe ni le « Pr » : la clé d'un couple. */
const cleGateau = nom =>
  sansPrefixe(nom).replace(/^pr\s*-?\s*/i, '').replace(/\W+/g, '').toLowerCase()

export function parGateauMere(articles, cherche, tout = false) {
  const q = String(cherche || '').trim()
  // Quand un « Pr » existe, lui seul a une case : l'étape d'avant s'ouvre
  // depuis sa recette, où on voit son stock. Les tailles restent distinctes
  // — un « Pr » 10 pers ne cache pas l'indiv. (Layla, 2026-09-09.)
  const avecPr = new Set(
    (articles || []).filter(a => estPr(a.produit)).map(a => cleGateau(a.produit)))
  const groupes = new Map()
  for (const a of articles || []) {
    // Dès qu'on tape, on cherche PARTOUT : les préparations, les fruits et les
    // deux étapes d'un couple « Pr » compris — on vient chercher un composant
    // précis, pas parcourir les gâteaux. Sans rien de tapé, la liste garde ses
    // raccourcis. Fautes de frappe et mots inversés acceptés. (Layla, 2026-09-09.)
    // `tout` : l'écran de réglage montre TOUT ce que l'annexe sait faire, sans
    // les raccourcis de l'écran de fabrication. (Layla, 2026-09-09.)
    if (q || tout) {
      if (!correspond(a.produit, q)) continue
    } else {
      if (estPreparation(a.produit)) continue
      // Un « F- » est un fruit, pas une fabrication : sa nomenclature ne dit que
      // « 1 kg de framboise fraîche donne 1 kg de congelée ».
      if (/^\s*(\[\d+\]\s*)?f\s*-/i.test(a.produit)) continue
      // Les « GS- » (vitrine salé, biscottis) ne se déclarent pas ici :
      // ils suivent leur propre circuit. (Layla, 2026-09-09.)
      if (/^\s*(\[\d+\]\s*)?gs\s*-/i.test(a.produit)) continue
      if (avecPr.has(cleGateau(a.produit)) && !estPr(a.produit)) continue
    }
    const oues = (a.pour || []).length ? a.pour : ['Le reste']
    for (const g of oues) {
      const e = groupes.get(g) || { nom: g, photo: g === 'Le reste' ? null : g, articles: [] }
      e.articles.push(a); groupes.set(g, e)
    }
  }
  return [...groupes.values()]
    .sort((a, b) => (a.nom === 'Le reste') - (b.nom === 'Le reste')
      || b.articles.length - a.articles.length)
}

/**
 * Ce qui a été déclaré aujourd'hui, et par qui. S'affiche en haut des deux
 * onglets : l'atelier voit d'un coup d'œil ce qui est déjà passé, et personne
 * ne refait ce qu'un collègue vient de faire. (Layla, 2026-09-09.)
 */
export async function loadHistoriqueAnnexe(jours = 7) {
  const debut = new Date(todayISO() + 'T12:00:00')
  debut.setDate(debut.getDate() - (jours - 1))
  const [journal, noms] = await Promise.all([
    loadFabProdDepuis(debut.toLocaleDateString('sv-SE'), 'annexe').catch(() => []),
    loadNoms().catch(() => ({})),
  ])
  return (journal || [])
    .map(l => ({ ...l, jour: l.jour || todayISO(), qui: noms[l.fait_par] || '' }))
    .sort((a, b) => String(b.fait_le).localeCompare(String(a.fait_le)))
}

/** L'historique rangé par jour, du plus récent au plus ancien. */
export function parJour(histo) {
  const jours = new Map()
  for (const l of histo || []) {
    const j = l.jour || todayISO()
    if (!jours.has(j)) jours.set(j, [])
    jours.get(j).push(l)
  }
  return [...jours.entries()].sort((a, b) => b[0].localeCompare(a[0]))
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
  // ⚠️ Rien à rattraper = une tournée ENTIÈRE, pas une demie. C'est le cas de
  // tout l'onglet « Déclarer » (ni mini ni maxi, donc reste 0) : il proposait
  // 70 tiramisus pour une tournée de 140, et 2,775 kg de sirop pour 5,55.
  // (Vu le 2026-09-09.)
  if (!(manque > 0)) return 1
  // SANS JAMAIS DÉPASSER le maxi : on arrondit vers le BAS, mieux vaut
  // proposer un peu moins que de remplir le congélateur au-delà. « Sinon on
  // écrira à la main » (Layla, 2026-09-09).
  // Et toujours des fournées ENTIÈRES : plus de demi nulle part
  // (Layla, 2026-09-10).
  return Math.max(1, Math.floor(manque / t))
}

/**
 * Les lignes de recette à AFFICHER : celles qui ne sont pas déjà écrites juste
 * en dessous, dans « Ce qu'il faut avoir » ou « Aussi dans la recette ».
 *
 * Le fond de citron framboise listait ses trois préparations DEUX FOIS — une
 * fois dans sa recette, une fois dans ses composants (Layla, 2026-09-09).
 * Vaut pour toutes les recettes, à tous les niveaux : c'est la liste du bas
 * qui gagne, elle porte le stock, le blocage et le chevron pour l'ouvrir.
 */
export function lignesRecette(noeud, enfants) {
  const enBas = new Set((enfants || []).map(c => c.produit))
  return (noeud?.recette || []).filter(l => !enBas.has(l.produit))
}

/**
 * Combien de fois la recette, par défaut, quand on OUVRE un composant.
 *
 * ⚠️ Un article à quantité FIGÉE ne se fait pas par tournée : on en produit
 * exactement ce qui manque. Sa recette Odoo est écrite pour une seule unité
 * (la crème légère : 0,328 g de lait POUR 1 g de crème), donc il faut la
 * multiplier par la quantité à sortir — sinon l'écran affichait « 1 tournée
 * de 1 g » et une recette d'un gramme (Layla, 2026-09-09).
 */
export function foisDuNoeud(c) {
  if (c?.aLaQuantite && c.tourneeTaille) {
    return Math.max(0.01, Math.round((c.produira / c.tourneeTaille) * 10000) / 10000)
  }
  return c?.tournees ?? 1
}

/**
 * Ce qui ne se fabrique QUE par blocs entiers : un cadre se remplit, une
 * plaque s'étale, un biscuit se cuit d'un bloc. « Le biscuit ne peut pas se
 * faire en demi tournée » (Layla, 2026-09-10).
 *
 * ⚠️ Sert maintenant à UNE seule chose : décider si la fiche d'un composant
 * propose « juste ce qu'il manque » (une crème, une mousse) ou le bloc entier.
 * Le compte des fournées, lui, est entier pour tout le monde.
 */
export const parTourneeEntiere = c =>
  c?.entier ?? /\b(cadres?|plaques?|biscuits?)\b/i.test(String(c?.produit || ''))

/**
 * Un composant remis à l'échelle — et TOUTE sa descendance avec lui.
 *
 * C'est la seule règle de calcul du circuit, la même à tous les niveaux :
 * le besoin suit le facteur, ce qui est en stock ne bloque plus, et ce qui
 * manque se rattrape à la demi-tournée près (ou à la quantité exacte pour une
 * préparation figée ou dont la recette est écrite à l'unité).
 */
function echelle(c, facteur) {
  const besoin = c.besoin * facteur
  // ⚠️ Compter ce qui est DÉJÀ déclaré, comme le fait le serveur. Sans ça, un
  // composant fabriqué ce matin redevenait bloquant dès qu'on choisissait
  // autre chose qu'une tournée pile — c'est-à-dire presque toujours.
  const dispo = (c.stock || 0) + (c.dejaFait || 0)
  const ok = !c.fabrique || dispo >= besoin
  const out = { ...c, besoin, ok }
  if (c.pourQuantite) out.pourQuantite = c.pourQuantite * facteur
  if (!ok && c.tourneeTaille) {
    if (c.fige || c.aLaQuantite) {
      out.aLaQuantite = true
      out.tournees = 1
      // Même règle que le serveur (`aProduire`) : ce qui se compte en pièces
      // s'arrondit au-dessus — on ne fabrique pas 1,4 fond de tarte.
      const reste = Math.max(0, besoin - dispo)
      out.produira = /^u$/i.test(String(c.unite || '').trim())
        ? Math.ceil(reste) : Math.round(reste * 1000) / 1000
    } else {
      // Toujours des fournées ENTIÈRES : plus de demi nulle part
      // (Layla, 2026-09-10).
      out.tournees = Math.max(1, Math.ceil((besoin - dispo) / c.tourneeTaille))
      out.produira = out.tournees * c.tourneeTaille
    }
  }
  if (c.enfants) out.enfants = c.enfants.map(x => echelle(x, facteur))
  return out
}

/**
 * La descendance d'une préparation, pour la quantité qu'on a choisi d'en
 * produire. Les composants de l'API valent pour `pourQuantite` ; si le
 * pâtissier double la fournée, ses composants doivent doubler aussi — et leurs
 * propres sous-composants avec. « Que le reste et les sous et sous-sous
 * composants soient pareil » (Layla, 2026-09-09).
 */
export function enfantsPour(noeud, quantite) {
  const base = noeud?.pourQuantite
  if (!base || !(quantite > 0) || Math.abs(quantite - base) < 1e-9) return noeud?.enfants || []
  return (noeud.enfants || []).map(c => echelle(c, quantite / base))
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
  const ech = c => echelle(c, fois)
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
    // ⚠️ Ce qui a DÉJÀ été déclaré aujourd'hui ne bloque plus — même si la
    // quantité déclarée ne couvre pas tout. L'écran l'affiche en vert
    // (« 2 u fait · en attente de validation ») et le verrou, lui, le comptait
    // encore comme manquant : « ça doit me laisser valider vu que j'ai marqué
    // comme fait la base » (Layla, 2026-09-10).
    .filter(c => !c.ok && c.fabrique && !(c.dejaFait > 0) && !faits.has(c.produit))
    .map(c => c.produit)
}

/** Les composants vraiment déclarés — les brouillons n'en sont pas. */
export const declares = faits =>
  Object.entries(faits || {}).filter(([, v]) => v && !v.brouillon).map(([k]) => k)

/**
 * Où on en est dans la descente. `chemin` part de l'article :
 * ['Tiramisu', 'Biscuit indiv', 'Biscuit plaque'] → le nœud de la plaque.
 */
export function noeudAu(articles, chemin, foisDe) {
  const article = (articles || []).find(a => a.produit === chemin[0])
  if (!article) return { article: null, noeud: null, parent: null }
  let noeud = article
  let parent = null
  for (const nom of chemin.slice(1)) {
    // ⚠️ La quantité choisie à CET étage doit se propager plus bas. Sans ça, le
    // fond réglé sur 2 tournées listait « 3 920 g de biscuit », et ouvrir ce
    // biscuit affichait la recette de 1 960 — « il m'affiche une autre
    // recette » (Layla, 2026-09-09). L'article de tête est déjà à l'échelle
    // (`pourFois`), on ne le remet pas deux fois.
    // ⚠️ TOUJOURS, pas seulement quand une quantité a été tapée : la quantité
    // PROPOSÉE compte autant. Sans ça la liste annonçait « 9 000 g de génoise »
    // et la fiche s'ouvrait sur 4 500.
    const fois = noeud === article ? null
      : ((foisDe && foisDe(noeud)) ?? foisDuNoeud(noeud))
    const enfants = fois > 0
      ? enfantsPour(noeud, (noeud.tourneeTaille || 1) * fois)
      : enfantsDe(noeud)
    const suivant = enfants.find(c => c.produit === nom)
    if (!suivant) return { article, noeud: null, parent: null }
    parent = noeud.produit || article.libelle
    noeud = suivant
  }
  return { article, noeud, parent }
}

// ============================================================
// L'écran simplifié : dire les choses comme à l'atelier.
// « Ils ne vont pas comprendre que 13 = une plaque de combien de grammes »
// (Layla, 2026-09-10). Sous chaque quantité, on écrit la même chose en vrai.
// ============================================================

/** Grammes ou kilos — les seules unités qu'on sait additionner. */
const enGrammes = (q, u) => {
  const n = Number(q) || 0
  if (/^kg$/i.test(String(u || '').trim())) return n * 1000
  if (/^g$/i.test(String(u || '').trim())) return n
  return null                                   // pièces, litres : on ne mélange pas
}

/**
 * Le poids total d'une recette, quand elle ne parle que de poids. Un seul
 * ingrédient compté en pièces (« 1 plaque ») et on ne dit rien : additionner
 * des plaques et des grammes ne veut rien dire.
 */
export function poidsRecette(noeud) {
  const lignes = noeud?.recette || []
  if (!lignes.length) return null
  let total = 0
  for (const l of lignes) {
    const g = enGrammes(l.qty, l.unite)
    if (g === null) return null
    total += g
  }
  return Math.round(total)
}

/**
 * Une étape CREUSE : elle ne demande aucune décision. Sa recette n'a qu'une
 * ligne, dans la même unité, et un pour un — c'est un changement d'étiquette,
 * comme « Genoise Vanille KG CD » qui n'est qu'une tournée de « KG commun ».
 *
 * ⚠️ Découper une plaque en 13 biscuits N'EST PAS une étape creuse : il y a
 * une décision — combien on découpe. « Si je fais 4 plaques et que je décide
 * d'en couper 26 ? » (Layla, 2026-09-10.)
 */
export function estEtapeCreuse(noeud) {
  const lignes = noeud?.recette || []
  if (lignes.length !== 1) return false
  const l = lignes[0]
  const sortie = noeud.tourneeTaille || 0
  if (!(sortie > 0) || !(Number(l.qty) > 0)) return false
  const memeUnite = String(l.unite || '').toLowerCase() === String(noeud.unite || '').toLowerCase()
  return memeUnite && Math.abs(Number(l.qty) - sortie) < 0.001
}

/**
 * Le nœud où l'on se trouve, et l'article de tête dont il descend.
 *
 * On redescend le chemin en recalculant à chaque étage : la quantité choisie
 * en haut change les besoins du dessous, et c'est comme ça qu'on évite le bug
 * qui a coûté le plus cher — une dose de fournée affichée au-dessus des
 * besoins de deux.
 */
export function noeudDuChemin(article, chemin, quantites) {
  if (!article) return null
  const tete = enNoeud(pourFois(article, quantiteDe(article, quantites) / (article.tournee || 1)))
  let noeud = tete
  for (const nom of chemin.slice(1)) {
    const q = quantites[noeud.produit] ?? defautDe(noeud)
    const enfant = ingredientsPour(noeud, q).find(c => c.produit === nom)
    if (!enfant) return { tete, noeud: null }
    noeud = enfant
  }
  return { tete, noeud }
}

/** Ce qu'on propose de faire, tant que personne n'a touché au chiffre. */
export function defautDe(noeud) {
  if (noeud?.produira > 0) return Math.round(noeud.produira * 1000) / 1000
  // ⚠️ Jamais zéro : un écran qui propose 0 a un bouton « c'est fait » qui ne
  // fait rien, sans rien dire. À défaut de mieux, une fournée.
  return aFaireMaintenant(noeud) || noeud?.tourneeTaille || 0
}

const quantiteDe = (article, quantites) =>
  quantites[article.produit] ?? aFaireMaintenant(article)

/**
 * Ce qu'on propose de CUIRE dans une découpe : RIEN quand on en a déjà.
 *
 * ⚠️ Bug du 2026-09-11 : le chiffre du haut se remplissait avec ce que la
 * recette demande, même avec 2 576 g de sablé crispy au frigo. L'app déclarait
 * donc une fabrication de 290 g que personne n'avait faite, et le stock Odoo
 * montait pour rien — à chaque base de flan.
 *
 * On ne propose de cuire que ce qui MANQUE. Le bloc reste à l'écran : si le
 * pâtissier en a quand même fait, il tape le nombre.
 */
export function aCuireParDefaut(enfant) {
  const dispo = (enfant?.stock || 0) + (enfant?.dejaFait || 0)
  const manque = (enfant?.besoin || 0) - dispo
  return manque > 0 ? defautDe(enfant) : 0
}

/**
 * Ce qui sort TOUJOURS le compte annoncé : flans, cheesecakes, biscuits,
 * génoises. Pour ceux-là, « combien ça a donné ? » était une perte de temps
 * (Layla, 2026-09-09) — on envoie la quantité prévue sans rien demander.
 *
 * Tout le reste se pèse à la sortie : un caramel, une crème au beurre, une
 * crème citron PERDENT à la cuisson (Layla, 2026-09-10). Rendre moins n'est
 * pas une erreur, et l'écran ne doit ni s'en alarmer ni le faire remarquer.
 */
export const sansRendement = nom => /flan|cheese\s*cake|biscuit|g[ée]noise/i.test(String(nom || ''))

/**
 * L'article de tête vu comme un nœud de recette. L'API ne donne `recette` et
 * `tourneeTaille` qu'aux COMPOSANTS ; à la tête, la recette c'est la liste des
 * composants pour une fournée. Sans cette mise à plat, l'écran simple aurait
 * deux cas à traiter partout — et c'est comme ça qu'on écrit des bugs.
 */
export function enNoeud(article) {
  if (!article || article.recette) return article
  return {
    ...article,
    tourneeTaille: article.tournee,
    recette: enfantsDe(article).map(c => ({
      produit: c.produit, qty: c.besoin, unite: c.unite,
    })),
  }
}

/**
 * TOUT ce qu'il faut pour la quantité choisie, en une seule liste : ce qui se
 * fabrique (avec son stock et son manque) puis ce qui se pèse.
 *
 * ⚠️ Les deux ne viennent pas du même endroit et ne sont pas comptés sur la
 * même base. Les composants fabriqués valent pour `pourQuantite` (ce que le
 * serveur a prévu d'en produire), les lignes de recette pour une fournée. Les
 * mélanger sans convertir, c'était afficher la dose d'une fournée au-dessus
 * des besoins de deux — et sous une préparation ouverte depuis un gâteau, les
 * matières premières disparaissaient tout simplement (le serveur ne les
 * renvoie qu'à la tête).
 */
export function ingredientsPour(noeud, quantite) {
  const base = noeud?.pourQuantite || noeud?.tourneeTaille || 0
  const fabriques = enfantsDe(noeud)
    .map(c => (base > 0 && quantite !== base ? echelle(c, quantite / base) : c))
  const dejaLa = new Set(fabriques.map(c => c.produit))
  const parRecette = noeud?.tourneeTaille || 0
  const fois = parRecette > 0 ? quantite / parRecette : 1
  const peses = (noeud?.recette || [])
    .filter(l => !dejaLa.has(l.produit))
    .map(l => ({
      produit: l.produit, unite: l.unite, pese: true,
      besoin: Math.round(Number(l.qty) * fois * 1000) / 1000,
    }))
  // ⚠️ On n'ADDITIONNE PAS deux lignes du même ingrédient : « des fois c'est
  // utilisé dans la recette différemment » (Layla, 2026-09-10). La crème
  // whipping du Gianduja va au crémeux ET à la mousse — deux pesées, deux
  // moments, deux lignes.
  return [...fabriques, ...peses]
}

/**
 * L'étape de DÉCOUPE : une masse qu'on portionne en pièces.
 *
 * Elle se reconnaît à deux signes : l'article se compte en PIÈCES, et il n'a
 * qu'un seul ingrédient, qui se fabrique. Peu importe que cet ingrédient se
 * compte en plaques ou en grammes — une plaque qu'on coupe en 13 biscuits et
 * 290 g de sablé qu'on presse en une base, c'est la même décision : combien
 * j'en fais, combien j'en tire. (Layla, 2026-09-11 : « sablé crispy aussi,
 * chantilly pipée aussi ».)
 *
 * Ce n'est PAS une découpe quand c'est un pour un dans la même unité : là, il
 * n'y a rien à décider, c'est une étape creuse.
 *
 * Rend `{ enfant, parPiece }` — `parPiece` = combien de pièces sort UNE unité
 * de l'ingrédient (13 par plaque, 0,0034 par gramme de sablé).
 */
export function decoupeDe(noeud) {
  const enfants = enfantsDe(noeud)
  if (enfants.length !== 1) return null
  const enfant = enfants[0]
  if (!enfant.fabrique) return null
  // C'est l'ARTICLE qui doit se compter en pièces : c'est lui qu'on portionne.
  if (!/^u$/i.test(String(noeud?.unite || '').trim())) return null
  const ligne = (noeud?.recette || [])[0]
  const sortie = noeud?.tourneeTaille || 0
  if (!(sortie > 0) || !(Number(ligne?.qty) > 0)) return null
  if (estEtapeCreuse(noeud)) return null
  return { enfant, parPiece: sortie / Number(ligne.qty) }
}

/**
 * Ce que la découpe fait des plaques : combien y passent, combien restent.
 *
 * `cuites` sont celles qu'on fait maintenant, `stock` celles déjà au
 * congélateur. Couper plus que ce qu'on a n'est pas interdit — l'écran le dit,
 * il ne bloque pas : le pâtissier voit parfois des plaques que le stock Odoo
 * ignore.
 */
export function partageDecoupe({ cuites = 0, coupes = 0, parPiece = 0, stock = 0 }) {
  const rond = x => Math.round(x * 100) / 100
  const utilisees = parPiece > 0 ? rond(coupes / parPiece) : 0
  const dispo = Math.max(0, cuites) + Math.max(0, stock)
  return {
    utilisees,
    gardees: rond(Math.max(0, dispo - utilisees)),
    manque: rond(Math.max(0, utilisees - dispo)),
  }
}

/**
 * Ce qu'une quantité veut dire en vrai, sous le gros chiffre.
 * « 4 plaques » → « 2 800 g de pâte » ; « 13 biscuits » → « 1 plaque ».
 * Rien à dire ? on ne dit rien, plutôt qu'une phrase pour meubler.
 */
export function enClair(noeud, quantite) {
  const fois = (noeud?.tourneeTaille || 0) > 0 ? quantite / noeud.tourneeTaille : 0
  if (!(fois > 0)) return ''
  // ⚠️ Un MONTAGE ne dit rien ici : ni son poids total (« 9 000 g » n'est pas
  // une masse qu'on prépare, c'est la somme de morceaux déjà faits), ni ses
  // morceaux un par un — la liste des ingrédients, juste dessous, les dit
  // mieux. Une ligne qui répète la suivante est une ligne à enlever.
  if (enfantsDe(noeud).some(c => c.fabrique)) return ''
  const bouts = []
  // Le poids n'aide que sur ce qui se compte en PIÈCES : dire « 3 920 g font
  // 4 840 g » à propos d'un caramel déjà pesé en grammes n'apprend rien, et
  // sème le doute. Et « en tout » plutôt que « de pâte » : une ganache, une
  // chantilly, un caramel ne sont pas de la pâte.
  const poids = /^(g|kg)$/i.test(String(noeud.unite || '').trim()) ? null : poidsRecette(noeud)
  if (poids) bouts.push(`${Math.round(poids * fois).toLocaleString('fr-FR')} g en tout`)
  for (const l of noeud.recette || []) {
    if (enGrammes(l.qty, l.unite) !== null) continue        // déjà dans le poids
    const q = Math.round(Number(l.qty) * fois * 100) / 100
    if (!(q > 0)) continue
    const mot = nomCourt(l.produit)
    // « 2 plaques », pas « 2 plaque » : l'écran est lu par des gens qui
    // butent déjà sur les mots, on ne va pas leur écrire de travers.
    bouts.push(`${q.toLocaleString('fr-FR')} ${q > 1 && !/s$/i.test(mot) ? mot + 's' : mot}`)
  }
  return bouts.join(' · ')
}

/** « SM. Biscuit a la cuillere (plaque) » → « plaque ». */
export const nomCourt = nom => {
  const n = String(nom || '').replace(/^\s*(\[[^\]]*\]\s*)?(SM|MP|MI|GS|RA|GM|CD|E|F|V)[-./\s]\s*/i, '')
  const par = n.match(/\(([^)]+)\)\s*$/)
  return (par ? par[1] : n).trim().toLowerCase()
}

/**
 * Le chiffre à mettre dans la pastille : ce qu'on va faire MAINTENANT.
 *
 * Jamais un nombre qu'une fournée ne peut pas atteindre — annoncer « 352 »
 * quand la recette en fait 88 décourage sans rien apprendre. On propose donc
 * ce qu'il faut, borné par une fournée ; le besoin total s'écrit sous le nom.
 * (Layla, 2026-09-10.)
 *
 * ⚠️ Ce qui ne se fait QUE par fournées entières — un cadre, une plaque, un
 * biscuit — reste sur un multiple de sa fournée, jamais un compte bâtard.
 */
export function aFaireMaintenant(article) {
  const besoin = article?.reste > 0 ? article.reste : (article?.tournee || 0)
  const fournee = article?.tournee || 0
  // ⚠️ On n'arrondit à l'entier que ce qui se compte en PIÈCES. Un sirop de
  // 5,55 kg arrondi au kilo, c'est 450 g d'écart affichés en grammes — et
  // l'atelier en fait 6 000 au lieu de 5 550. (Trouvé le 2026-09-11.)
  const enPieces = /^u$/i.test(String(article?.unite || '').trim())
  const rond = v => (enPieces ? Math.round(v) : Math.round(v * 1000) / 1000)
  if (!(fournee > 0)) return Math.max(0, rond(besoin))
  // ⚠️ `parTourneeEntiere` attend l'ARTICLE, pas son nom — côté serveur, la
  // fonction du même nom prend une chaîne. Lui passer le nom renvoyait
  // toujours « non », et une plaque se serait faite à moitié.
  //
  // UNE fournée à la fois, jamais quatre : le « + » est là pour en faire plus,
  // et un cadre ne se remplit pas à moitié.
  if (parTourneeEntiere(article)) return rond(fournee)
  const q = rond(Math.min(besoin, fournee))
  // Jamais zéro pièce ; au poids, on garde ce que dit la recette.
  return enPieces ? Math.max(1, q) : Math.max(0, q)
}

/**
 * Retaper la dose d'un ingrédient remet TOUTE la recette à l'échelle — le
 * « choix A » de Layla (2026-09-07) : mettre 1,5 kg de sucre là où la recette
 * en veut 1,2, c'est faire une recette et demie, pas forcer sur le sucre.
 *
 * `saisi` arrive comme l'écran l'écrit : en GRAMMES (même pour une ligne en
 * kilos) et déjà multiplié par la règle d'atelier — 560 g de masse gélatine
 * valent 80 g de poudre chez Odoo.
 */
export function quantitePourDose({ quantite, besoin, saisi, unite, facteur = 1, enPieces = false }) {
  const dansLUnite = /^kg$/i.test(String(unite || '').trim()) ? saisi / 1000 : saisi
  const vrai = dansLUnite / (facteur || 1)
  if (!(besoin > 0) || !(vrai > 0) || !(quantite > 0)) return quantite
  const q = quantite * (vrai / besoin)
  // On ne fabrique pas 13,4 gâteaux : ce qui se compte en pièces reste entier.
  return enPieces ? Math.max(1, Math.round(q)) : Math.max(0.001, Math.round(q * 1000) / 1000)
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
 * RÉPARTIR LA CUVE entre les tailles réellement montées.
 *
 * « Quand j'ai marqué comme fait les citron gingembre, ça m'a pas demandé si
 * j'ai fait avec la mousse d'autres tailles » (Layla, 2026-09-11). Une cuve ne
 * se divise pas : on la monte, et ce qui reste part en plus petit. Chaque
 * taille doit alors porter SA part de crème, pas la cuve entière.
 *
 * Le calcul est fait par le serveur (`?mode=repartir`) : l'écart entre la cuve
 * et la somme des parts retombe sur la taille lancée — c'est elle qui a défini
 * la tournée, c'est elle qui absorbe le rab et les pertes.
 */
export async function repartirCuve(lance, quantites) {
  const r = await fetch('/api/fab-annexe?mode=repartir', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lance, quantites }),
  })
  if (!r.ok) throw new Error(`Répartition impossible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.ordres || []
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
export async function declarer({ produit, qty, unite, fois = null, ajustements = null, pour = null }, userId) {
  // ⚠️ Le JOURNAL d'abord, et lui seul est attendu : c'est le travail de
  // l'atelier, il ne doit jamais se perdre. Un ordre Odoo tout seul dans la
  // nature, en revanche, l'app ne saurait plus le rattacher.
  //
  // `pour` : le gâteau depuis lequel cette préparation a été ouverte. Elle lui
  // est alors RÉSERVÉE — le 18 cm ne se sert pas de la ganache faite pour le
  // 23 cm (Layla, 2026-09-10).
  const ligne = await addFabProd(todayISO(), produit, qty, unite, userId, fois, 'annexe',
    null, false, pour)

  // ⚠️ L'ORDRE ODOO PART DERRIÈRE, sans faire attendre personne : sa création
  // demande sept allers-retours à Odoo, et un montage en déclare deux d'un
  // coup. « Marquer comme fait rame beaucoup » (Layla, 2026-09-11). La
  // déclaration, elle, est déjà enregistrée : si l'ordre tarde ou échoue,
  // « À valider Annexe » la montre comme « sans ordre » et le dit.
  creerOfPrepa(produit, qty, userId, [], unite, 'annexe', ajustements)
    .then(of => {
      // En mode test (?test=1) Odoo n'écrit rien : pas de numéro à rattacher.
      if (of?.name && !of.error && !of.test) return rattacherOrdre(ligne.id, of.name, !of.deja)
      if (of?.error) toast(`Odoo a refusé l'ordre de ${produit} : ${of.error}`)
    })
    .catch(e => toast(`L'ordre de ${produit} n'est pas parti : ${e.message || e}`))

  return { produit, qty, ordre: null, erreur: null }
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

// ============================================================
// Le catalogue : ce que l'écran suit, et à quels seuils.
// Ces trois nombres décident de tout — sous le mini l'article apparaît, on en
// fait des tournées entières jusqu'au maxi. Ils vivaient dans Supabase, hors
// de portée de Layla : d'où l'écran « Mini / maxi Annexe ».
// ============================================================

export async function loadCatalogueAnnexe() {
  const { data, error } = await supabase.from('fab_annexe_articles')
    .select('produit, libelle, mini, maxi, tournee, actif, famille, rang, figes, figes_nom')
    .order('produit').limit(2000)
  if (error) throw error
  return data || []
}

/**
 * Écrit une ligne du catalogue. `produit` est la clé : on écrase ou on crée.
 *
 * ⚠️ On n'envoie QUE les colonnes réglées ici. Les figés, la photo et la
 * famille ne sont pas dans cet écran : les citer les remettrait à vide.
 */
export async function saveCatalogueAnnexe(ligne) {
  const { error } = await supabase.from('fab_annexe_articles').upsert({
    produit: ligne.produit,
    libelle: ligne.libelle || ligne.produit,
    mini: Number(ligne.mini) || 0,
    maxi: Number(ligne.maxi) || 0,
    tournee: Number(ligne.tournee) || 1,
    actif: ligne.actif !== false,
  }, { onConflict: 'produit' })
  if (error) throw error
}

/**
 * Les ingrédients FIGÉS d'un article : ceux dont la quantité ne suit pas la
 * sortie réelle. Une cuve de mousse reste une cuve, que la tournée donne 128
 * pièces ou 150 ; le biscuit et le sirop, eux, se recalculent au prorata.
 *
 * ⚠️ Écriture à part : `saveCatalogueAnnexe` ne cite pas ces colonnes, pour ne
 * pas les vider en réglant un mini.
 */
export async function saveFigesAnnexe(produit, figes, figesNom) {
  const { error } = await supabase.from('fab_annexe_articles')
    .update({ figes: figes || [], figes_nom: figesNom || null })
    .eq('produit', produit)
  if (error) throw error
}

/** Retirer un article du suivi. Sa fabrication reste possible par « Déclarer ». */
export async function retirerDuCatalogue(produit) {
  const { error } = await supabase.from('fab_annexe_articles').delete().eq('produit', produit)
  if (error) throw error
}
