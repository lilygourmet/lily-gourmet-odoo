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
 * Les feuilles, de la plus profonde à la tête.
 *
 * L'ordre est celui du travail : on ne monte pas le crunchy avant d'avoir le
 * crumble, et on ne fait pas la crème au beurre avant la crème citron qu'elle
 * contient. La tête est donc la DERNIÈRE feuille.
 *
 * `quantites` est la table de l'écran — un chiffre tapé à la main y prime sur
 * ce que l'app propose, exactement comme sur la fiche.
 */
export function feuillesAImprimer(tete, quantiteTete, quantites = {}) {
  if (!tete) return []

  // ---- 1. LA FORME DE LA CASCADE, sans une seule quantité ----
  // On relève qui contient qui, dans quelle proportion, et à quelle profondeur
  // chaque article descend AU PLUS LOIN. Cette profondeur maximale est ce qui
  // donne l'ordre de fabrication : un article est toujours plus profond que
  // tous ceux qui le contiennent.
  const liens = []                       // { parent, enfant, part }
  const noeuds = new Map([[tete.produit, tete]])
  const prof = new Map([[tete.produit, 0]])
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
  relever(tete, 0)

  // ---- 2. LES QUANTITÉS, du moins profond au plus profond ----
  // Dans cet ordre, tout ce qui contient un article a déjà été fixé : on peut
  // donc ADDITIONNER ce que chacun lui demande.
  const ordre = [...prof.keys()].sort((a, b) => prof.get(a) - prof.get(b))
  const qty = new Map([[tete.produit, quantiteTete]])
  const besoins = new Map([[tete.produit, quantiteTete]])
  const pour = new Map()                 // produit → [{ nom, qty }]

  for (const nom of ordre) {
    if (nom === tete.produit) continue
    const dus = liens.filter(l => l.enfant === nom)
      .map(l => ({ nom: l.parent, qty: l.part * (qty.get(l.parent) || 0) }))
      .filter(x => x.qty > 0)
    pour.set(nom, dus)
    const besoin = dus.reduce((t, x) => t + x.qty, 0)
    besoins.set(nom, besoin)
    qty.set(nom, quantites[nom] ?? aFairePour(noeuds.get(nom), besoin))
  }

  // ---- 3. LES FEUILLES, la plus profonde d'abord ----
  return ordre.slice().reverse().map(nom => {
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
      // ⚠️ Le chemin le plus COURT jusqu'à la tête : celui qu'on lit le mieux
      // en haut de la feuille.
      chemin: cheminVers(nom, tete.produit, liens),
      // Où va cette fournée, quand elle sert à plus d'un endroit. C'est
      // l'explication que Layla demande sur la feuille.
      pour: (pour.get(nom) || []).map(x => ({
        nom: x.nom, qty: Math.round(x.qty * 1000) / 1000,
      })),
      ingredients: ingredientsPour(n, q).map(c => ({
        produit: c.produit, unite: c.unite, besoin: c.besoin,
      })),
    }
  })
}

/** Le chemin le plus court de la tête jusqu'à cet article. */
function cheminVers(nom, tete, liens) {
  const file = [[tete]]
  const vus = new Set([tete])
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
