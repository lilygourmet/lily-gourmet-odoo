// ============================================================
// LES FEUILLES D'UNE FOURNÉE.
//
// « Une feuille par article, et que ça tienne en une page » (Layla,
// 2026-09-14). Depuis un gâteau, on imprime tout ce qu'il va falloir
// fabriquer : une feuille par chose qui a une recette, dans l'ordre du
// travail.
//
// ⚠️ UN MÊME ARTICLE PEUT SERVIR À DEUX ENDROITS, et alors les besoins
// S'ADDITIONNENT. Vécu le 2026-09-15 sur le Vitrine citron 20 cm : le gâteau
// demande 3 480 g de crème citron, et sa crème au beurre citron en consomme
// 3 790 de plus — 7 270 g en tout. L'app n'en annonçait que 3 480.
// « Il manque 1/2 crème citron si j'imprime le tout ; soit tu additionnes les
// mêmes crèmes en laissant une explication » (Layla). D'où le calcul en deux
// temps de ce fichier, et le `pour` de chaque feuille, qui dit où ça va.
//
// Aucune règle de calcul nouvelle ici : `ingredientsPour` dit ce qu'il faut,
// `echelle` remet un composant à sa vraie quantité, `defautDe` dit ce qu'on
// propose d'en faire. Ce sont celles de l'écran, sinon on aurait deux vérités.
// ============================================================

import { ingredientsPour, defautDe, echelle, enfantsDe } from './fabAnnexe'

/** Une feuille ne se fait que pour ce qui a une RECETTE : le reste se pèse. */
const aUneRecette = c => !!c.fabrique

/** Ce qu'une fournée du parent produit — la base de ses proportions. */
const baseDe = n => Number(n?.pourQuantite || n?.tourneeTaille) || 0

/**
 * Ce qu'on propose de fabriquer d'un composant pour un besoin donné.
 * On passe par `echelle` plutôt que de refaire son calcul : c'est elle qui
 * connaît les fournées entières, les figés et les quantités exactes.
 */
function aFairePour(noeud, besoin) {
  const b = Number(noeud?.besoin) || 0
  if (!(b > 0) || !(besoin > 0)) return Math.max(0, besoin)
  return defautDe(echelle(noeud, besoin / b))
}

/**
 * Les feuilles, LE PARENT D'ABORD, puis ce qu'il demande, et ainsi de suite.
 *
 * « le parent en premier, ainsi de suite » (Layla, 2026-09-16) — et de la même
 * façon quel que soit l'endroit d'où l'on imprime : une fiche, ou plusieurs
 * gâteaux cochés. La liasse se lit comme la recette se lit, de haut en bas.
 *
 * `quantites` est la table de l'écran — un chiffre tapé à la main y prime sur
 * ce que l'app propose, exactement comme sur la fiche.
 */
export function feuillesAImprimer(tete, quantiteTete, quantites = {}) {
  return feuillesDePlusieurs(tete ? [{ noeud: tete, qty: quantiteTete }] : [], quantites)
}

/**
 * LES FEUILLES DE PLUSIEURS GÂTEAUX À LA FOIS.
 *
 * « est-ce que je peux sélectionner recette du même thème pour assembler les
 * mêmes crèmes » (Layla, 2026-09-16). Trois tartes citron gingembre attendaient
 * ce matin : l'atelier montait la même crème TROIS fois, parce qu'on ouvre les
 * fiches une par une. 11 844 + 7 146 + 12 797 = 31 787 g en une seule cuve.
 *
 * Rien de neuf dans le calcul : additionner ce que plusieurs parents demandent
 * au même enfant, c'est déjà ce qu'on fait DANS une cascade depuis le 15/09
 * (la crème citron du Vitrine 20 cm, demandée par le gâteau ET par sa crème au
 * beurre). Les têtes sont simplement plusieurs.
 *
 * `tetes` : [{ noeud, qty }].
 */
export function feuillesDePlusieurs(tetes, quantites = {}) {
  const racines = (tetes || []).filter(t => t && t.noeud)
  if (!racines.length) return []

  // ---- 1. LA FORME DE LA CASCADE, sans une seule quantité ----
  // On relève qui contient qui, dans quelle proportion, et à quelle profondeur
  // chaque article descend AU PLUS LOIN. Cette profondeur maximale est ce qui
  // donne l'ordre de fabrication : un article est toujours plus profond que
  // tous ceux qui le contiennent.
  const liens = []                       // { parent, enfant, part }
  const noeuds = new Map(racines.map(t => [t.noeud.produit, t.noeud]))
  const prof = new Map(racines.map(t => [t.noeud.produit, 0]))
  const vus = new Set()

  const relever = (noeud, p) => {
    // Une recette qui se contiendrait elle-même tournerait sans fin (vécu chez
    // Odoo avec la masse gélatine, le 2026-09-11).
    const cle = noeud.produit + '@' + p
    if (vus.has(cle) || p > 12) return
    vus.add(cle)
    const base = baseDe(noeud) || Number(noeud.tournee) || 1
    for (const c of enfantsDe(noeud)) {
      if (!aUneRecette(c)) continue
      if (c.produit === noeud.produit) continue        // elle-même : on s'arrête
      liens.push({ parent: noeud.produit, enfant: c.produit, part: (Number(c.besoin) || 0) / base })
      if (!noeuds.has(c.produit)) noeuds.set(c.produit, c)
      prof.set(c.produit, Math.max(prof.get(c.produit) ?? 0, p + 1))
      relever(c, p + 1)
    }
  }
  for (const t of racines) relever(t.noeud, 0)

  // ---- 2. LES QUANTITÉS, du moins profond au plus profond ----
  // Dans cet ordre, tout ce qui contient un article a déjà été fixé : on peut
  // donc ADDITIONNER ce que chacun lui demande.
  const ordre = [...prof.keys()].sort((a, b) => prof.get(a) - prof.get(b))
  const qty = new Map(racines.map(t => [t.noeud.produit, t.qty]))
  const besoins = new Map(racines.map(t => [t.noeud.produit, t.qty]))
  const pour = new Map()                 // produit → [{ nom, qty }]
  const estRacine = new Set(racines.map(t => t.noeud.produit))

  for (const nom of ordre) {
    if (estRacine.has(nom)) continue
    const dus = liens.filter(l => l.enfant === nom)
      .map(l => ({ nom: l.parent, qty: l.part * (qty.get(l.parent) || 0) }))
      .filter(x => x.qty > 0)
    pour.set(nom, dus)
    const besoin = dus.reduce((t, x) => t + x.qty, 0)
    besoins.set(nom, besoin)
    qty.set(nom, quantites[nom] ?? aFairePour(noeuds.get(nom), besoin))
  }

  // ---- 3. LES FEUILLES, LE PARENT D'ABORD ----
  // « le parent en premier, ainsi de suite » (Layla, 2026-09-16), quel que soit
  // l'endroit d'où l'on imprime. On lit la liasse comme on lit la recette : le
  // gâteau, puis ce qu'il demande, puis ce que CELA demande. `ordre` est déjà
  // rangé par profondeur croissante — il n'y a rien à retourner.
  //
  // ⚠️ Ça renverse ce que je faisais jusqu'au 16/09 (le plus profond d'abord,
  // « l'ordre du travail »). Sa liasse se lit de haut en bas, pas de bas en haut.
  return ordre.map(nom => {
    const n = noeuds.get(nom)
    const q = qty.get(nom)
    const stock = Math.max(0, Number(n.stock) || 0)
    // ⚠️ CE QUI MANQUE VRAIMENT, et pas « ce qu'on propose d'en faire ».
    // Les deux ne disent pas la même chose : quand il y en a assez, le serveur
    // propose quand même une fournée entière — c'est exprès, on peut vouloir
    // en préparer d'avance. S'en servir pour décider de la couleur, c'était
    // afficher en rouge et cocher un article dont on a plein le congélateur.
    // « ce qui est déjà en stock s'écrit en vert et non cliqué » (Layla).
    // Le DÉJÀ DÉCLARÉ du jour compte comme présent, comme partout ailleurs :
    // le stock d'Odoo ne monte qu'à la validation.
    const dispo = stock + Math.max(0, Number(n.dejaFait) || 0)
    const besoin = besoins.get(nom) || 0
    return {
      produit: nom,
      libelle: n.libelle || nom,
      unite: n.unite,
      stock,
      besoin: Math.round(besoin * 1000) / 1000,
      manque: Math.max(0, Math.round((besoin - dispo) * 1000) / 1000),
      qty: q,
      // ⚠️ Le chemin le plus COURT jusqu'à UNE tête : celui qu'on lit le mieux
      // en haut de la feuille. Avec plusieurs gâteaux cochés, on prend le
      // premier qui mène jusqu'ici — le détail de « qui en prend combien » est
      // dans `pour`, et il les cite tous.
      chemin: cheminVers(nom, racines.map(t => t.noeud.produit), liens),
      // Où va cette fournée, quand elle sert à plus d'un endroit. C'est
      // l'explication que Layla demande sur la feuille.
      pour: (pour.get(nom) || []).map(x => ({
        nom: x.nom, qty: Math.round(x.qty * 1000) / 1000,
      })),
      // ⚠️ `fabrique` voyage avec : c'est lui qui sépare ce qu'on va chercher
      // à l'économat de ce que l'annexe fait elle-même (voir `aDemander`).
      ingredients: ingredientsPour(n, q).map(c => ({
        produit: c.produit, unite: c.unite, besoin: c.besoin, fabrique: !!c.fabrique,
      })),
    }
  })
}

/** Le chemin le plus court d'une des têtes jusqu'à cet article. */
function cheminVers(nom, tetes, liens) {
  const departs = Array.isArray(tetes) ? tetes : [tetes]
  const file = departs.map(t => [t])
  const vus = new Set(departs)
  while (file.length) {
    const chemin = file.shift()
    const dernier = chemin[chemin.length - 1]
    if (dernier === nom) return chemin
    for (const l of liens.filter(x => x.parent === dernier)) {
      if (vus.has(l.enfant)) continue
      vus.add(l.enfant)
      file.push([...chemin, l.enfant])
    }
  }
  return [nom]
}

/**
 * LE THÈME D'UN ARTICLE : son gâteau mère.
 *
 * « autorise que le même thème » (Layla, 2026-09-16). C'est le `pour` que le
 * serveur pose déjà sur chaque article — « E- Tarte citron gingembre » pour les
 * trois tartes, « E- Tarte Caramel Beurre Salé » pour les trois bases CBS. Le
 * même groupement que l'onglet « Déclarer ».
 *
 * Un article sans gâteau mère n'a pas de thème : il ne s'assemble avec rien.
 */
export const themesDe = a => (a?.pour || []).filter(Boolean)

/** Deux articles se cochent-ils ensemble ? Oui s'ils ont un gâteau en commun. */
export function memeTheme(a, b) {
  if (!a || !b) return false
  if (a.produit === b.produit) return true
  const t = new Set(themesDe(a))
  return themesDe(b).some(x => t.has(x))
}

/**
 * Ce qu'on peut encore cocher, une fois le premier choisi.
 *
 * Rien de coché : tout est ouvert. Sinon, seuls ceux du même thème — les
 * autres restent à l'écran mais ne répondent plus, pour qu'on comprenne
 * pourquoi plutôt que de les voir disparaître.
 */
export function cochablesAvec(articles, choisis) {
  const pris = (articles || []).filter(a => choisis.includes(a.produit))
  if (!pris.length) return (articles || []).map(a => a.produit)
  return (articles || [])
    .filter(a => pris.some(p => memeTheme(p, a)))
    .map(a => a.produit)
}

/**
 * Ce que le panneau « Tu imprimes quoi ? » propose de cocher.
 *
 * Coché d'avance : ce dont il n'y a pas assez. Ce qu'on a en stock ne l'est
 * pas — mais la ligne reste, pour pouvoir la reprendre à la main. La TÊTE est
 * toujours cochée : c'est ce qu'on est venu faire.
 */
export function cocheesParDefaut(feuilles) {
  const out = {}
  // ⚠️ Sur ce qui MANQUE, pas sur ce qu'on propose d'en faire — voir `manque`.
  for (const f of feuilles || []) out[f.produit] = assezEnStock(f) === false
  const tete = (feuilles || [])[feuilles.length - 1]
  if (tete) out[tete.produit] = true
  return out
}

/** Y en a-t-il déjà assez ? C'est ce qui décide du vert et du décochage. */
export const assezEnStock = f => !((Number(f?.manque) || 0) > 0.001)

/**
 * CE QU'IL FAUT ALLER CHERCHER À L'ÉCONOMAT pour cette feuille.
 *
 * « sortir une feuille par recette avec les ingrédients MP à demander à
 * l'économe » (Layla, 2026-09-15).
 *
 * La règle tient en une phrase : tout ce que l'annexe ne fabrique PAS elle-même.
 * Pas besoin de lire les préfixes — l'app sait déjà si un article a une recette.
 * Une préparation (`SM.`) a la sienne, dans la même liasse ; une matière
 * première n'en a pas, donc elle vient d'ailleurs.
 *
 * ⚠️ SAUF L'EAU DU ROBINET. Elle sort du mur, on ne la demande à personne —
 * l'app l'écarte déjà des blocages, pour la même raison.
 *
 * ⚠️ ON DEMANDE TOUT, sans retirer le stock de l'annexe. Ce stock-là n'est pas
 * tenu à jour (crème whipping à −1,49 kg le 2026-09-16, sucre à 47 tonnes vu
 * un autre jour) : en déduire une quantité donnerait des demandes fausses,
 * tantôt trop grosses, tantôt nulles.
 */
const EAU_DU_ROBINET = /eau\s+(du\s+)?robinet/i

export function aDemander(f) {
  return (f?.ingredients || [])
    .filter(i => !i.fabrique && !EAU_DU_ROBINET.test(String(i.produit || '')))
    .filter(i => (Number(i.besoin) || 0) > 0)
}

/** Cette feuille a-t-elle quelque chose à demander ? Sinon, pas de papier. */
export const aBesoinDeLEconomat = f => aDemander(f).length > 0
