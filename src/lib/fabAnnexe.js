// ============================================================
// « Fabrication Annexe 2 » : ce que le pâtissier doit fabriquer, et de quoi
// il a besoin avant de pouvoir le monter.
// Tout vient de /api/fab-annexe — le catalogue (mini/maxi/tournée) vit dans
// Supabase, le stock et les recettes viennent d'Odoo.
// ============================================================

import { addFabProd, rattacherOrdre, loadFabProdDepuis, loadNoms } from './fabricationProd'
import { creerOfPrepa } from './fabrication'
import { todayISO } from './dates'
import { correspond } from './recherche'
import { supabase } from './supabase'

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
  // Au demi près, SANS JAMAIS DÉPASSER le maxi : le suprême amandes 20 cm a un
  // maxi de 33 pour une tournée de 22 — il y faut une tournée et demie.
  // On arrondit vers le BAS : mieux vaut proposer un peu moins que de remplir
  // le congélateur au-delà du maxi. « Sinon on écrira à la main »
  // (Layla, 2026-09-09).
  return Math.max(0.5, Math.floor((manque / t) * 2) / 2)
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
      // Même exception que côté serveur : un article à quantité FIGÉE se fait
      // à la quantité manquante, pas par tournée entière (Layla, 2026-09-09).
      if (c.fige) {
        out.aLaQuantite = true
        out.tournees = 1
        out.produira = Math.max(0, Math.round((besoin - dispo) * 1000) / 1000)
      } else {
        // Au demi près, comme le serveur : la quantité suit celle du gâteau.
        out.tournees = Math.max(0.5, Math.ceil(((besoin - dispo) / c.tourneeTaille) * 2) / 2)
        out.produira = out.tournees * c.tourneeTaille
      }
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
  // ⚠️ Dans CET ordre, et pas de front : si le journal n'est pas écrit, il ne
  // faut pas d'ordre Odoo tout seul dans la nature, que l'app ne saurait plus
  // rattacher ni retirer. La demi-seconde gagnée ne vaut pas un ordre orphelin.
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
