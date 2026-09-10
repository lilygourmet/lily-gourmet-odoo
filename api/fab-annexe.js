// ============================================================
// API: GET /api/fab-annexe
//   → l'état de fabrication des articles suivis à l'annexe.
//     GET /api/fab-annexe?photo=<nom produit>  → l'image de cet article.
//
// Le catalogue des articles vit dans Supabase (fab_annexe_articles) : mini,
// maxi, taille de tournée, ingrédients figés. Ici on n'y ajoute que ce
// qu'Odoo sait : le stock et les recettes.
//
// ⚠️ On ne regarde QUE l'emplacement WHPDX/Stock Prod annexe. Un tiramisu
// rangé à la boutique ne compte pas : le pâtissier de l'annexe ne l'a pas.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { versUnite } from '../src/lib/unites.js'

const LIEU_ANNEXE = 62          // stock.location « WHPDX/Stock Prod annexe »
// Une recette peut descendre loin (Layla : « même s'il y en a 10 ou plus »).
// La vraie garde-fou n'est pas la profondeur mais la BOUCLE, plus bas.
const PROFONDEUR_MAX = 12

async function odooJsonRpc(service, method, args) {
  const r = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`)
  const data = await r.json()
  if (data.error) throw new Error(`Odoo: ${data.error.data?.message || data.error.message}`)
  return data.result
}

let _uid = null
async function odooAuth() {
  if (_uid) return _uid
  _uid = await odooJsonRpc('common', 'authenticate',
    [process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD, {}])
  if (!_uid) throw new Error('Odoo authentication failed')
  return _uid
}

async function sr(model, domain, fields, opts = {}) {
  const uid = await odooAuth()
  return odooJsonRpc('object', 'execute_kw',
    [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, 'search_read', [domain, fields], opts])
}

// ---------------------------------------------------------------
// Odoo est lent et bavard : on ne lui demande jamais deux fois la même chose
// pendant un appel. Le cache meurt avec la requête.
// ---------------------------------------------------------------
// ------------------------------------------------------------
// Les RECETTES ne changent pas toutes les heures : on les garde dix minutes
// d'une requête à l'autre. Les STOCKS, eux, ne sont jamais mis en cache — c'est
// ce qui bouge, et Layla doit voir ses corrections tout de suite.
// ------------------------------------------------------------
const DUREE_RECETTES = 10 * 60 * 1000
const _recettes = new Map()   // clé → { t, v }
function memo(cle, faire) {
  const e = _recettes.get(cle)
  if (e && Date.now() - e.t < DUREE_RECETTES) return e.v
  const v = faire()
  _recettes.set(cle, { t: Date.now(), v })
  v.catch?.(() => _recettes.delete(cle))    // un échec ne se garde pas
  return v
}

/**
 * Faut-il montrer cet article, et que reste-t-il à produire ?
 *
 * • Le mini est ATTEINT, pas seulement franchi : à 11 pour un mini de 11,
 *   l'article se montre. Un mini à 0 veut dire « ne me montre qu'à zéro ».
 * • ⚠️ On compare au DISPONIBLE — le stock plus ce qui a déjà été déclaré
 *   aujourd'hui. Le stock d'Odoo ne monte qu'à la validation : sans ça, le
 *   tiramisu 15 cm restait « à refaire » avec 3 en stock et 20 déjà déclarés
 *   (Layla, 2026-09-10 : « si j'ai fait, enlever de la liste »).
 * • ⚠️ Un stock NÉGATIF compte zéro : c'est un compteur faux, pas une dette.
 *   La crème légère à −1 390 g réclamait 1 390 g pour un maxi de 0.
 * • Une tournée COMMENCÉE reste à l'écran tant que le maxi n'est pas atteint :
 *   c'est là qu'on voit le reliquat.
 */
export function etatArticle(a, stock, dejaFait = 0) {
  const dispo = Math.max(0, stock || 0) + (dejaFait || 0)
  const reste = Math.max(0, (a.maxi || 0) - dispo)
  return { dispo, reste, aFaire: dispo <= (a.mini || 0) || (dejaFait > 0 && reste > 0) }
}

export function creerCache() {
  return { produits: new Map(), boms: new Map(), stocks: null }
}

const CHAMPS_PRODUIT = ['id', 'name', 'display_name', 'uom_id', 'product_tmpl_id',
  'product_template_attribute_value_ids']
const net = t => String(t || '').replace(/^\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase()
/** Le nom d'un article sans la référence interne qu'Odoo colle devant. */
const sansRef = t => String(t || '').replace(/^\[[^\]]*\]\s*/, '').trim()

/**
 * L'article, par son nom.
 *
 * ⚠️ Un article À PARFUMS porte le MÊME `name` pour toutes ses variantes : les
 * six « SM- 20 cm Vitrine » s'appellent pareil, seul leur display_name dit
 * (Citron) / (Praliné Amandes caramélisées) / … Le catalogue peut donc nommer
 * soit l'article simple, soit une variante précise — on essaie les deux.
 */
export function produitParNom(cache, nomBrut) {
  // « [178] E- Tiramisu » : la référence interne d'Odoo n'est pas dans `name`.
  const nom = String(nomBrut || '').replace(/^\[[^\]]*\]\s*/, '').trim()
  if (!cache.produits.has(nom)) {
    cache.produits.set(nom, memo('p:' + nom, async () => {
      const exact = await sr('product.product', [['name', '=', nom]], CHAMPS_PRODUIT, { limit: 40 })
      if (exact.length === 1) return exact[0]
      if (exact.length > 1) return exact.find(x => net(x.display_name) === net(nom)) || exact[0]
      // « SM- 20 cm Vitrine (Praliné Amandes caramélisées) » : on cherche la
      // variante par son nom complet.
      const base = String(nom).replace(/\s*\([^()]*\)\s*$/, '').trim()
      if (!base || base === nom) return null
      const freres = await sr('product.product', [['name', '=', base]], CHAMPS_PRODUIT, { limit: 40 })
      return freres.find(x => net(x.display_name) === net(nom)) || null
    }))
  }
  return cache.produits.get(nom)
}

/** La recette d'un article, ou null s'il est acheté (pas de nomenclature). */
function bomDe(cache, produit) {
  const tmpl = produit.product_tmpl_id[0]
  if (!cache.boms.has(tmpl)) {
    cache.boms.set(tmpl, memo('b:' + tmpl, async () => {
      const boms = await sr('mrp.bom', [['product_tmpl_id', '=', tmpl]],
        ['id', 'product_qty', 'product_uom_id'], { limit: 1 })
      if (!boms[0]) return null
      const lignes = await sr('mrp.bom.line', [['bom_id', '=', boms[0].id]],
        ['product_id', 'product_qty', 'product_uom_id', 'bom_product_template_attribute_value_ids'])
      return { ...boms[0], lignes }
    }))
  }
  return cache.boms.get(tmpl)
}

/** Le stock de plusieurs articles à l'annexe, en un seul appel. */
async function stocksDe(ids) {
  if (!ids.length) return {}
  const q = await sr('stock.quant',
    [['location_id', '=', LIEU_ANNEXE], ['product_id', 'in', ids]], ['product_id', 'quantity'])
  const par = {}
  for (const x of q) par[x.product_id[0]] = (par[x.product_id[0]] || 0) + x.quantity
  return par
}

const uniteDe = p => String(p.uom_id?.[1] || '').replace(/^Units?$/i, 'u')

/**
 * Les lignes de recette qui concernent VRAIMENT cette variante.
 *
 * Une nomenclature à parfums les porte tous : la recette du 20 cm Vitrine
 * contient la crème citron, la crème praliné et quatre fonds différents, mais
 * chaque ligne est marquée du ou des parfums auxquels elle s'applique. Sans ce
 * tri, un suprême amandes sortirait aussi la crème citron.
 * Une ligne sans parfum vaut pour tous.
 */
function lignesPour(bom, produit) {
  const siens = new Set(produit?.product_template_attribute_value_ids || [])
  return (bom?.lignes || []).filter(l => {
    const pour = l.bom_product_template_attribute_value_ids || []
    return pour.length === 0 || pour.some(v => siens.has(v))
  })
}

/**
 * Ce qu'il faudra IMPOSER à l'ordre Odoo pour les ingrédients figés : leur
 * quantité pour la TOURNÉE ENTIÈRE, quelle que soit la sortie réelle. La
 * mousse ne suit pas : une cuve reste une cuve, que 128 ou 150 tiramisus en
 * sortent.
 *
 * Les quantités sont rendues dans l'unité de la LIGNE de recette — c'est celle
 * qu'Odoo attend.
 *
 * ⚠️ Un même ingrédient peut occuper DEUX lignes (le sucre du tiramisu :
 * 10 g pour la mousse, 3,86 g pour la pâte à bombe) et Odoo n'accepte qu'une
 * consigne par nom. On répartit alors le total à parts égales entre ses
 * lignes : la quantité consommée est exacte, seule sa répartition entre deux
 * lignes du même produit change — ce qui ne touche ni le stock ni le coût.
 */
/**
 * Un ingrédient FIGÉ : sa quantité ne suit pas la sortie réelle. Deux sources.
 *
 * 1. La liste réglée pour l'article, dans « Mini / maxi Annexe ».
 * 2. Une règle générale : TOUTES LES MOUSSES sont figées (Layla, 2026-09-09).
 *    Une cuve montée reste une cuve, que la tournée donne 6 gâteaux ou 4.
 *
 * ⚠️ Quand la mousse n'a pas d'article à elle — le tiramisu, le royal — ce sont
 * ses matières premières qui portent la consigne, et leur nom ne dit pas
 * « mousse » : celles-là se cochent une à une. À l'inverse, le craquant et les
 * biscuits ne sont JAMAIS figés : six royals demandent six fois la pesée.
 */
/**
 * Ce qui ne se fabrique QUE par tournées entières : un cadre se remplit, une
 * plaque s'étale, un biscuit se cuit d'un bloc. « Le biscuit ne peut pas se
 * faire en demi tournée » (Layla, 2026-09-10). Tout le reste — les crèmes, les
 * mousses, les montages — se fait très bien en moitié.
 *
 * ⚠️ Même règle côté écran (`echelle`, les boutons « Je fais ») : elle est
 * répétée là-bas plutôt qu'importée, pour ne pas tirer toute la bibliothèque
 * du navigateur dans la fonction serveur.
 */
export const parTourneeEntiere = nom =>
  /\b(cadres?|plaques?|biscuits?)\b/i.test(String(nom || ''))

const estFige = (nom, figes) =>
  // ⚠️ Comparaison NETTOYÉE, jamais brute : Odoo écrit « MP- Lait UHT » avec
  // une espace INSÉCABLE. Un `includes()` sur le nom brut disait « non » sur
  // deux noms qui se lisent pareil, et le lait du royal n'était pas figé —
  // Odoo le consommait au prorata au lieu de la cuve entière.
  // (Trouvé le 2026-09-10.)
  (figes || []).some(f => net(f) === net(nom)) || /\bmousses?\b/i.test(String(nom || ''))

function ajustementsFiges(bom, produit, figes, tournee) {
  if (!bom) return {}                  // article sans recette : rien à imposer
  // ⚠️ Même conversion que dans `composantsDe` : la recette écrit parfois sa
  // sortie dans une autre unité que celle de l'article. Ces quantités-là
  // partent dans l'ordre Odoo : une erreur ici consomme vraiment du stock.
  const facteur = tournee / (versUnite(bom.product_qty || 1,
    bom.product_uom_id?.[1], produit.uom_id?.[1]) || 1)
  const par = new Map()
  for (const l of lignesPour(bom, produit)) {
    const nom = sansRef(l.product_id[1])
    if (!estFige(nom, figes)) continue
    const e = par.get(nom) || { unite: l.product_uom_id[1], total: 0, lignes: 0 }
    e.total += versUnite(l.product_qty, l.product_uom_id[1], e.unite) * facteur
    e.lignes += 1
    par.set(nom, e)
  }
  return Object.fromEntries([...par].map(([nom, e]) =>
    [nom, Math.round((e.total / e.lignes) * 1000) / 1000]))
}

/**
 * Ce qu'il faut pour fabriquer `quantite` de `produit`, en descendant tant
 * qu'un composant fabriqué manque. Un composant en stock suffisant arrête la
 * descente : inutile de savoir de quoi il est fait, on l'a.
 */
export async function composantsDe(cache, produit, quantite, figes, profondeur = 0, vus = [], lots = {}, achetes = new Set(), declare = {}) {
  const bom = await bomDe(cache, produit)
  // Une recette qui se contiendrait elle-même tournerait sans fin : on ne
  // redescend jamais dans un article déjà croisé plus haut.
  if (!bom || profondeur >= PROFONDEUR_MAX || vus.includes(produit.id)) return []
  const chemin = [...vus, produit.id]

  // Combien de fois la recette, pour obtenir `quantite`.
  //
  // ⚠️ `quantite` est comptée dans l'unité de l'ARTICLE, mais la recette écrit
  // parfois sa sortie dans une autre : la génoise vanille sort « 1 Tournée
  // (3 kg) » pour un article compté en kg. Sans convertir, on divisait par 1
  // au lieu de 3 — et l'app consommait TROIS fois trop de génoise commune.
  // 21 recettes sur 905 sont dans ce cas (analyse du 2026-09-09), certaines à
  // mille fois près (une recette écrite en kg pour un article compté en g).
  const base = versUnite(bom.product_qty || 1, bom.product_uom_id?.[1], produit.uom_id?.[1]) || 1
  const facteur = quantite / base

  // Le stock de tous les composants d'un coup.
  const lignes = lignesPour(bom, produit)
  const ids = lignes.map(l => l.product_id[0])
  const stocks = await stocksDe(ids)

  const out = await Promise.all(lignes.map(async l => {
    const nom = sansRef(l.product_id[1])
    const p = await produitParNom(cache, nom)
    if (!p) return null

    const besoin = versUnite(l.product_qty, l.product_uom_id[1], p.uom_id[1]) * facteur
    const stock = stocks[p.id] || 0
    const sousBom = achetes.has(nom) ? null : await bomDe(cache, p)
    const fabrique = !!sousBom
    const fige = estFige(nom, figes)

    // Ce que l'atelier a DÉJÀ déclaré aujourd'hui compte comme s'il l'avait :
    // le stock Odoo ne remonte qu'à la validation, et sans ça le pâtissier
    // qui sort de l'écran et y revient se voyait redemander ce qu'il venait
    // de faire. (Layla, 2026-09-08.)
    const dejaFait = declare[nom] || 0

    // Un ingrédient ACHETÉ ne bloque jamais : le pâtissier ne peut pas
    // fabriquer du sucre, et le stock des matières premières à l'annexe n'est
    // pas tenu à jour (47 tonnes de sucre, une gélatine à −9…). Le laisser
    // bloquer, c'est un mur dont personne ne sort.
    //
    // Être FIGÉ n'exempte pas : ça dit seulement que la quantité ne suit pas la
    // sortie réelle. La mousse du tiramisu ne bloque pas parce qu'elle est faite
    // de matières premières achetées ; la crème au beurre praliné du suprême
    // amandes, elle, est figée ET se fabrique — il faut la faire d'abord.
    const ok = !fabrique || (stock + dejaFait) >= besoin

    // Plus bas que l'article de tête, la recette complète est déjà affichée
    // telle quelle : inutile de répéter ses matières premières ici. Mais à la
    // tête, rien ne doit manquer — l'eau du robinet fait partie de la recette,
    // le pâtissier doit la voir pour la faire.
    if (profondeur > 0 && !fige && !fabrique) return null

    const c = { produit: nom, unite: uniteDe(p), besoin, stock, dejaFait, fabrique, fige, ok,
      entier: parTourneeEntiere(nom) }

    // Tout ce qui se fabrique porte sa recette et sa descendance, MÊME en
    // stock : Layla veut pouvoir ouvrir un composant vert pour en préparer
    // d'avance (2026-09-07). Le nombre de tournées proposé est celui qui
    // comble le manque — une seule quand il n'y a rien à combler.
    if (fabrique) {
      // ⚠️ Ce qu'une tournée SORT n'est pas toujours dans l'unité de l'article :
      // la génoise se compte en kg, mais sa recette produit « 1 Tournée (3 kg) ».
      // Sans convertir, une tournée valait 1 kg au lieu de 3 — et l'écran en
      // demandait 7 là où 3 suffisent.
      //
      // Et le CATALOGUE prime sur la recette : un fond de Citron Framboise se
      // détaille par 24 (8 plaques de biscuit d'un coup), même si sa recette
      // Odoo est écrite pour une pièce. Sans ça l'écran disait « 24 tournées
      // de 1 » — juste, mais illisible.
      const parRecette = versUnite(sousBom.product_qty || 1,
        sousBom.product_uom_id?.[1], p.uom_id[1]) || 1
      const parTournee = lots[nom] || parRecette
      c.tourneeTaille = parTournee
      const manque = besoin - stock - dejaFait
      // ⚠️ Une « tournée » de 1 g ou de 1 kg n'est pas une tournée : la recette
      // Odoo est alors écrite POUR UNE UNITÉ (0,328 g de lait pour 1 g de crème
      // légère). Ces préparations se comptent en QUANTITÉ, comme les figées —
      // sinon l'écran annonçait « 2 317 tournées » de craquant royal et
      // « 2 737 tournées » de crème légère. Une tournée de 1 PIÈCE, elle, est
      // bien une tournée (la plaque de biscuit à la cuillère).
      // (Analyse du circuit, Layla, 2026-09-09.)
      const aLaQuantite = fige || (parTournee <= 1 && !/^u$/i.test(c.unite))
      if (aLaQuantite) {
        // ⚠️ EXCEPTION à « toujours une tournée entière » : un article à
        // quantité FIGÉE ne se fait pas par tournée — la cuve part en entier
        // sur la fournée, et on en produit exactement ce qui manque.
        // « J'ai besoin de 5 474 pour faire la recette, il m'en reste 250,
        // donc ce qu'il me reste à faire c'est 5 474 − 250 » (Layla,
        // 2026-09-09). Avant, l'écran annonçait « 1 tournée = 5 492 g ».
        c.aLaQuantite = true
        c.tournees = 1
        c.produira = Math.max(0, Math.round(manque * 1000) / 1000)
      } else if (manque > 0) {
        // Au DEMI près, comme les gâteaux : une demi-tournée de gâteaux ne
        // demande pas une tournée entière de fonds. « La quantité doit
        // suivre » (Layla, 2026-09-09) — 29 gâteaux, 29 fonds, pas 58.
        // Toujours arrondi vers le HAUT : il faut couvrir le besoin, sinon
        // le montage se bloque à la dernière pièce.
        // ⚠️ Sauf ce qui se cuit d'un bloc : là, c'est la tournée ENTIÈRE.
        const pas = c.entier ? 1 : 0.5
        c.tournees = Math.max(pas, Math.ceil(manque / parTournee / pas) * pas)
        c.produira = c.tournees * parTournee
      } else {
        // Rien à combler : on ouvre pour prendre de l'avance, donc une
        // tournée ENTIÈRE.
        c.tournees = 1
        c.produira = parTournee
      }
      // ⚠️ Quand le catalogue impose une autre taille de tournée que la recette
      // Odoo, les INGRÉDIENTS doivent suivre. Sinon l'écran annonçait « 5 000 g
      // de confit » au-dessus des quantités d'une recette de 568 g.
      const ech = parRecette ? parTournee / parRecette : 1
      c.recette = lignesPour(sousBom, p).map(x => ({
        produit: x.product_id[1],
        qty: Math.round(x.product_qty * ech * 1000) / 1000,
        // « Units » est le nom Odoo ; l'atelier lit « u ». Même normalisation
        // que pour les articles (`uniteDe`) — sans elle, une ligne comptée en
        // pièces n'était pas reconnue comme telle à l'affichage.
        unite: String(x.product_uom_id[1] || '').replace(/^Units?$/i, 'u'),
      }))
      // ⚠️ La quantité pour laquelle les enfants ont été calculés. Sans elle,
      // changer le nombre de tournées d'une préparation ne faisait PAS suivre
      // ses composants : le fond annonçait 2 tournées (28 u) au-dessus de
      // « 1 960 g de biscuit », la dose d'une seule (Layla, 2026-09-09).
      c.pourQuantite = c.produira
      c.enfants = await composantsDe(cache, p, c.produira, [], profondeur + 1, chemin, lots, achetes, declare)
    }
    return c
  }))
  return out.filter(Boolean)
}

/**
 * Répartir LA CUVE entre les tailles réellement montées (choix « B » de Layla,
 * 2026-09-07). Chaque ordre porte sa vraie part de mousse, et l'écart entre la
 * cuve et la somme des parts retombe sur la taille lancée — c'est elle qui a
 * défini la tournée, c'est elle qui absorbe le rab et les pertes.
 *
 * ⚠️ Les unités changent d'une taille à l'autre : le sucre est écrit en « kg »
 * dans la recette du 20 cm et en « g » dans celle de l'individuel. Tout le
 * calcul se fait donc dans l'unité de l'ARTICLE, et n'est reconverti en unité
 * de ligne qu'au dernier moment — c'est elle qu'Odoo attend.
 */
export async function repartir(cache, catalogue, lance, quantites) {
  const parLigne = new Map()      // produit → { [ingrédient]: {qty, unite} } par pièce
  const uniteArticle = {}

  async function parPiece(a) {
    if (parLigne.has(a.produit)) return parLigne.get(a.produit)
    const p = await produitParNom(cache, a.produit)
    const bom = p && await bomDe(cache, p)
    const out = {}
    if (bom) {
      for (const l of lignesPour(bom, p)) {
        const nom = l.product_id[1]
        if (!estFige(nom, a.figes)) continue
        const c = await produitParNom(cache, nom)
        if (!c) continue
        uniteArticle[nom] = c.uom_id[1]
        const e = out[nom] || { ligne: 0, unite: l.product_uom_id[1], n: 0 }
        e.ligne += versUnite(l.product_qty, l.product_uom_id[1], e.unite)
          / (versUnite(bom.product_qty || 1, bom.product_uom_id?.[1], p.uom_id?.[1]) || 1)
        e.n += 1
        out[nom] = e
      }
    }
    parLigne.set(a.produit, out)
    return out
  }

  // Ce que chaque taille montée a vraiment pris, dans l'unité de l'article.
  const parts = {}
  const total = {}
  for (const [produit, qty] of Object.entries(quantites)) {
    if (!(qty > 0)) continue
    const a = catalogue.find(x => x.produit === produit)
    if (!a) continue
    const pp = await parPiece(a)
    parts[produit] = {}
    for (const [nom, e] of Object.entries(pp)) {
      const v = versUnite(e.ligne, e.unite, uniteArticle[nom]) * qty
      parts[produit][nom] = v
      total[nom] = (total[nom] || 0) + v
    }
  }

  // La cuve : ce que la tournée de la taille lancée aurait consommé.
  const ppLance = await parPiece(lance)
  const ecart = {}
  for (const [nom, e] of Object.entries(ppLance)) {
    const cuve = versUnite(e.ligne, e.unite, uniteArticle[nom]) * lance.tournee
    ecart[nom] = cuve - (total[nom] || 0)
  }

  // Chaque ordre, avec ses ingrédients figés dans l'unité de SA recette.
  const out = []
  for (const [produit, qty] of Object.entries(quantites)) {
    if (!(qty > 0)) continue
    const a = catalogue.find(x => x.produit === produit)
    if (!a) continue
    const pp = parLigne.get(produit) || {}
    const ajustements = {}
    for (const [nom, e] of Object.entries(pp)) {
      let v = parts[produit][nom] || 0
      if (produit === lance.produit) v += (ecart[nom] || 0)
      // ⚠️ Réparti entre les lignes du même produit : Odoo pose la consigne sur
      // chacune, et le total serait sinon compté autant de fois qu'il y a de
      // lignes (le sucre du tiramisu en occupe deux).
      ajustements[nom] = Math.max(0,
        Math.round(versUnite(v, uniteArticle[nom], e.unite) / (e.n || 1) * 1000) / 1000)
    }
    const p = await produitParNom(cache, produit)
    out.push({ produit, qty, unite: uniteDe(p), ajustements, lance: produit === lance.produit })
  }
  return out
}

// La vignette fait 56 pixels de côté : l'image 512 d'Odoo pesait jusqu'à
// 312 Ko pour rien. On prend la 256, et on retombe sur la 512 si elle manque.

/**
 * Le squelette de l'onglet « Déclarer » : QUI sait fabriquer quoi, dans quelle
 * unité, avec quelle photo et pour quel gâteau. Six lectures d'Odoo, dont une
 * de 12 000 ordres — et rien là-dedans ne change d'une minute à l'autre. On le
 * garde dix minutes ; le stock, lui, est relu à chaque appel.
 *
 * Conséquence assumée : un article jamais fabriqué depuis six mois qui vient
 * d'arriver en stock n'apparaît qu'au prochain calcul. (Layla, 2026-09-09.)
 */
function squeletteTout() {
  return memo('tout:squelette', async () => {
    const depuis = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 19).replace('T', ' ')
    // Ce que l'annexe a fabriqué, et ce qu'elle a en stock : l'un dit le
    // savoir-faire, l'autre ce qui est là. Les deux comptent.
    const [ordres, quants] = await Promise.all([
      sr('mrp.production', [['name', 'like', 'WHPDX/MO/'], ['create_date', '>=', depuis]],
        ['product_id', 'create_date'], { limit: 12000 }),
      sr('stock.quant', [['location_id', '=', LIEU_ANNEXE]], ['product_id', 'quantity'], { limit: 4000 }),
    ])
    const vus = new Map()
    for (const o of ordres) {
      const [id, nom] = o.product_id
      const e = vus.get(id) || { id, nom, fois: 0, dernier: null }
      e.fois++
      if (!e.dernier || o.create_date > e.dernier) e.dernier = o.create_date
      vus.set(id, e)
    }
    for (const q of quants) {
      const [id, nom] = q.product_id
      if (!vus.has(id)) vus.set(id, { id, nom, fois: 0, dernier: null })
    }
    // On ne garde que ce qui se FABRIQUE : une matière première achetée n'a
    // rien à faire dans un écran de déclaration.
    //
    // ⚠️ Par LOTS. Demander produit et recette un par un, c'était 550 appels
    // d'un coup : Odoo répondait 502.
    const tousIds = [...vus.keys()]
    const prods = []
    for (let i = 0; i < tousIds.length; i += 200) {
      prods.push(...await sr('product.product', [['id', 'in', tousIds.slice(i, i + 200)]],
        ['id', 'uom_id', 'product_tmpl_id']))
    }
    const tmpls = [...new Set(prods.map(p => p.product_tmpl_id[0]))]
    const avecRecette = new Set()
    for (let i = 0; i < tmpls.length; i += 200) {
      for (const b of await sr('mrp.bom', [['product_tmpl_id', 'in', tmpls.slice(i, i + 200)]],
        ['product_tmpl_id'], { limit: 2000 })) avecRecette.add(b.product_tmpl_id[0])
    }
    // Qui a une photo ? On le demande sans charger les images : 271 des 275
    // en ont une, et l'écran se lit bien mieux avec.
    const gardes = prods.filter(p => avecRecette.has(p.product_tmpl_id[0]))
    const aPhoto = new Set()
    for (let i = 0; i < gardes.length; i += 200) {
      for (const p of await sr('product.product',
        [['id', 'in', gardes.slice(i, i + 200).map(x => x.id)], ['image_1920', '!=', false]],
        ['id'], { limit: 400 })) aPhoto.add(p.id)
    }
    const parents = await grapheParents()
    return gardes.map(p => {
      const e = vus.get(p.id)
      const pour = [...(parents.get(sansRef(e.nom)) || [])].sort((a, b) => a.localeCompare(b, 'fr'))
      return { id: p.id, produit: e.nom, unite: uniteDe(p),
        fois: e.fois, dernier: e.dernier,
        // Pas d'image à lui ? On montre celle de son GÂTEAU : une crème ou un
        // biscuit n'a pas de photo, et une lettre grise ne dit rien à l'œil.
        // Même idée que le médaillon de l'ancien onglet Annexe.
        photo: aPhoto.has(p.id) ? e.nom : (pour[0] || null),
        pour }
    }).sort((a, b) => b.fois - a.fois || a.produit.localeCompare(b.produit, 'fr'))
  })
}

/**
 * À quel(s) gâteau(x) vendu(s) chaque préparation sert-elle ?
 *
 * On charge TOUT le graphe des recettes d'un coup — 905 nomenclatures, 6 700
 * lignes, 3 300 produits, en deux secondes — puis on descend depuis chaque
 * article vendu. Le faire article par article prenait des minutes.
 *
 * Une préparation sert souvent à plusieurs gâteaux (la crème au beurre nature
 * en alimente une dizaine) : elle apparaîtra sous chacun.
 */
function grapheParents() {
  return memo('graphe:parents', async () => {
    const [boms, lignes, prods] = await Promise.all([
      sr('mrp.bom', [], ['id', 'product_tmpl_id'], { limit: 5000 }),
      sr('mrp.bom.line', [], ['bom_id', 'product_id', 'bom_product_template_attribute_value_ids'], { limit: 40000 }),
      sr('product.product', [], ['id', 'name', 'display_name', 'product_tmpl_id',
        'product_template_attribute_value_ids'], { limit: 20000 }),
    ])
    const bomDuTmpl = new Map()
    for (const b of boms) if (!bomDuTmpl.has(b.product_tmpl_id[0])) bomDuTmpl.set(b.product_tmpl_id[0], b.id)
    const lignesDuBom = new Map()
    for (const l of lignes) {
      const a = lignesDuBom.get(l.bom_id[0]) || []
      a.push(l); lignesDuBom.set(l.bom_id[0], a)
    }
    const parId = new Map(prods.map(p => [p.id, p]))

    // On part des articles VENDUS et on descend.
    const parents = new Map()          // nom d'une préparation → Set de gâteaux
    const vendus = prods.filter(p => /^(E-|MI-|V-)/i.test(String(p.name || '').trim()))
    for (const v of vendus) {
      // Sans la taille : « E- Citron meringué (1) », « (5) », « (10) »… sont le
      // MÊME gâteau. Les garder séparés faisait cinq groupes pour un seul.
      const gateau = sansRef(v.display_name).replace(/\s*\(\d[^)]*\)\s*$/, '').trim()
      const vus = new Set()
      const pile = [v]
      while (pile.length) {
        const p = pile.pop()
        if (!p || vus.has(p.id)) continue
        vus.add(p.id)
        const bom = bomDuTmpl.get(p.product_tmpl_id[0])
        if (!bom) continue
        const siens = new Set(p.product_template_attribute_value_ids || [])
        for (const l of lignesDuBom.get(bom) || []) {
          const pour = l.bom_product_template_attribute_value_ids || []
          if (pour.length && !pour.some(x => siens.has(x))) continue
          const nom = sansRef(l.product_id[1])
          const e = parents.get(nom) || new Set()
          e.add(gateau); parents.set(nom, e)
          const c = parId.get(l.product_id[0])
          if (c) pile.push(c)
        }
      }
    }
    return parents
  })
}

async function photoDe(nom) {
  const t = await sr('product.product', [['name', '=', nom]], ['image_256', 'image_512'], { limit: 1 })
  return t[0]?.image_256 || t[0]?.image_512 || null
}

export default async function handler(req, res) {
  try {
    if (req.query.photo) {
      const b64 = await photoDe(String(req.query.photo))
      if (!b64) return res.status(404).end()
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.status(200).send(Buffer.from(b64, 'base64'))
    }

    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // ------------------------------------------------------------
    // L'onglet « Déclarer » : TOUT ce qui se fabrique à l'annexe, mini ou pas.
    // Le pâtissier vient y dire ce qu'il a fait, même pour un article qu'on ne
    // suit pas. (Layla, 2026-09-09.)
    // ------------------------------------------------------------
    if (req.query.mode === 'tout') {
      // Le squelette (qui sait faire quoi) est gardé dix minutes ; seuls les
      // STOCKS sont relus. L'onglet mettait 2 secondes à s'ouvrir pour six
      // lectures d'Odoo dont une de 12 000 ordres, alors que rien là-dedans ne
      // change d'une minute à l'autre. (Layla, 2026-09-09.)
      const [sq, quantsFrais] = await Promise.all([
        squeletteTout(),
        sr('stock.quant', [['location_id', '=', LIEU_ANNEXE]], ['product_id', 'quantity'], { limit: 4000 }),
      ])
      const parId = new Map()
      for (const q of quantsFrais) {
        parId.set(q.product_id[0], (parId.get(q.product_id[0]) || 0) + q.quantity)
      }
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({
        articles: sq.map(a => ({ ...a, stock: Math.round((parId.get(a.id) || 0) * 100) / 100 })),
      })
    }

    // Fin de tournée : le pâtissier a dit ce qu'il a monté dans chaque taille.
    // On rend un ordre par taille, sa part de cuve déjà calculée.
    if (req.method === 'POST' && req.query.mode === 'repartir') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const { data: cat } = await sb.from('fab_annexe_articles').select('*')
      const lance = (cat || []).find(x => x.produit === body.lance)
      if (!lance) return res.status(400).json({ error: 'article inconnu : ' + body.lance })
      return res.status(200).json({
        ordres: await repartir(creerCache(), cat || [], lance, body.quantites || {}),
      })
    }

    // Tout le catalogue : même un article qu'on n'affiche pas y donne la taille
    // de ses tournées, utile dès qu'il apparaît comme composant d'un autre.
    const { data: tout, error } = await sb.from('fab_annexe_articles').select('*').order('produit')
    if (error) throw new Error(`Catalogue illisible : ${error.message}`)
    // Ce que l'atelier a DÉJÀ déclaré aujourd'hui, en attente dans « À valider
    // Annexe ». Le stock Odoo ne remonte qu'à la validation : sans ça, l'écran
    // redemanderait la tournée entière à quelqu'un qui vient de la faire.
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' })
    const { data: faits } = await sb.from('prod_fabrications')
      .select('article, qty, ordre').eq('jour', jour).eq('atelier', 'annexe')

    // ⚠️ Une déclaration VALIDÉE ne compte plus : sa production est entrée
    // dans le stock Odoo, la compter en plus la ferait compter DEUX FOIS —
    // 22 suprêmes amandes validés en auraient valu 44.
    const ordres = [...new Set((faits || []).map(f => f.ordre).filter(Boolean))]
    const clos = new Set()
    if (ordres.length) {
      const mos = await sr('mrp.production', [['name', 'in', ordres]], ['name', 'state'])
      for (const m of mos) if (m.state === 'done' || m.state === 'cancel') clos.add(m.name)
    }
    const declare = {}
    for (const f of faits || []) {
      if (f.ordre && clos.has(f.ordre)) continue
      declare[f.article] = (declare[f.article] || 0) + (Number(f.qty) || 0)
    }

    const catalogue = (tout || []).filter(a => a.actif)
    const lots = Object.fromEntries((tout || []).filter(a => a.tournee > 0).map(a => [a.produit, a.tournee]))
    // Ce qu'on achète, même si Odoo lui connaît une recette : la framboise
    // congelée bloquait le confit sans qu'on puisse rien y faire.
    const achetes = new Set((tout || []).filter(a => a.achete).map(a => a.produit))

    const cache = creerCache()
    const articles = []

    // Un seul article demandé (le pâtissier vient de l'ouvrir) : lui seul a
    // besoin de sa cascade de recettes.
    const seul = req.query.article ? String(req.query.article) : null
    let voulus = seul ? (catalogue || []).filter(a => a.produit === seul) : (catalogue || [])
    // Un article ouvert depuis « Déclarer » n'est pas forcément réglé : on lui
    // fabrique une fiche à la volée, sans mini ni maxi ni rien de figé.
    if (seul && !voulus.length) {
      const p0 = await produitParNom(cache, seul)
      const b0 = p0 && await bomDe(cache, p0)
      if (!b0) return res.status(200).json({ articles: [] })
      voulus = [{ produit: seul, libelle: seul, photo: null, mini: 0, maxi: 0,
        tournee: versUnite(b0.product_qty || 1, b0.product_uom_id?.[1], p0.uom_id[1]) || 1,
        figes: [], figes_nom: null, actif: true, horsCatalogue: true }]
    }

    // Les produits et LEURS STOCKS d'un coup — deux requêtes Odoo, que le
    // catalogue en compte cinq ou deux cents. C'est tout ce dont la liste a
    // besoin ; les recettes ne se chargent qu'à l'ouverture d'un article.
    const prods = await Promise.all(voulus.map(a => produitParNom(cache, a.produit)))
    const stocks = await stocksDe(prods.filter(Boolean).map(p => p.id))

    // À quel gâteau sert cette préparation ? Le catalogue le dit… quand la
    // colonne est remplie. Le 2026-09-09 elle était vide pour 7 articles sur
    // 18 — Royal Chocolat 15 et 20 cm, Craquant Royal, glaçage miroir, les
    // deux biscuits brownie — qui se retrouvaient donc SEULS au premier niveau
    // de l'écran, alors qu'ils appartiennent tous au Royal chocolat.
    // On retrouve le parent dans les nomenclatures : c'est le même graphe que
    // l'onglet « Déclarer », gardé dix minutes en mémoire, et il tient compte
    // des parfums (un suprême amandes n'hérite pas du gâteau citron).
    // Calculé SEULEMENT s'il en manque : la liste doit rester rapide.
    const parents = voulus.some(a => !a.photo) ? await grapheParents() : null
    const gateauDe = nom => {
      const s = parents && parents.get(sansRef(nom))
      if (!s || !s.size) return null
      // Une préparation peut servir plusieurs gâteaux : on la range sous le
      // premier, faute de mieux — elle reste trouvable par la recherche.
      return [...s].sort((x, y) => x.localeCompare(y, 'fr'))[0]
    }

    for (let i = 0; i < voulus.length; i++) {
      const a = voulus[i]
      const p = prods[i]
      if (!p) { articles.push({ ...a, absent: true }); continue }
      const stock = stocks[p.id] || 0

      const dejaFait = declare[a.produit] || 0
      const { reste, aFaire } = etatArticle(a, stock, dejaFait)
      if (!seul && !aFaire) continue

      // La liste n'affiche que l'état : ni recette, ni cascade, ni tailles.
      if (!seul) {
        articles.push({
          produit: a.produit, libelle: a.libelle || a.produit,
          photo: a.photo || gateauDe(a.produit),
          unite: uniteDe(p), stock, mini: a.mini, maxi: a.maxi, tournee: a.tournee,
          dejaFait, reste, entier: parTourneeEntiere(a.produit),
          etat: stock <= 0 ? 'rupture' : 'refaire',
        })
        continue
      }

      articles.push({
        produit: a.produit,
        libelle: a.libelle || a.produit,
        // Même règle que la liste : à défaut de photo à lui, celle de son
        // gâteau. On ne retombe sur son propre nom qu'en dernier recours.
        photo: a.photo || gateauDe(a.produit) || a.produit,
        unite: uniteDe(p),
        stock, mini: a.mini, maxi: a.maxi, tournee: a.tournee,
        dejaFait, reste, entier: parTourneeEntiere(a.produit),
        etat: stock <= 0 ? 'rupture' : 'refaire',
        figes: a.figes || [],
        figesNom: a.figes_nom || 'Monté sur place',
        ajustements: ajustementsFiges(await bomDe(cache, p), p, a.figes || [], a.tournee),
        // ⚠️ Les tailles d'une même cuve (« d'un 10 pers on finit en 5 pers et
        // en individuels ») ne sont PAS calculées ici : chacune coûte une
        // dizaine d'allers-retours vers Odoo, et l'écran de fin multi-tailles
        // n'est pas encore fait. `detailTaille` est prêt pour ce jour-là.
        composants: await composantsDe(cache, p, a.tournee, a.figes || [], 0, [], lots, achetes, declare),
      })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ articles })
  } catch (e) {
    console.error('[fab-annexe]', e)
    return res.status(500).json({ error: e.message })
  }
}
