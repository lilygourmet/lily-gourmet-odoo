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
import { waitUntil } from '@vercel/functions'
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
// Une demi-heure : les nomenclatures ne changent qu'à la main, et l'écran sait
// forcer leur relecture quand Layla vient d'en corriger une. Dix minutes
// obligeaient à tout relire plusieurs fois par matinée. (2026-09-10.)
const DUREE_RECETTES = 30 * 60 * 1000
const _recettes = new Map()   // clé → { t, v }
/** Dépose une valeur déjà connue dans le cache, sans aller la chercher. */
function poserMemo(cle, valeur) {
  _recettes.set(cle, { t: Date.now(), v: Promise.resolve(valeur) })
}

/** Cette clé est-elle en cache ET encore fraîche ? */
function dejaEnCache(cle) {
  const e = _recettes.get(cle)
  return !!e && Date.now() - e.t < DUREE_RECETTES
}

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
  // ⚠️ Un MAXI à zéro, c'est « pas de cible » : l'article est au catalogue pour
  // la taille de sa tournée, quand il apparaît comme composant d'un autre. Le
  // proposer tout seul donnait « Crème légère vanille citron — à faire 1 g »
  // (Layla, 2026-09-10). Mettre un maxi suffit à le faire revenir.
  if (!((a.maxi || 0) > 0)) return { dispo, reste: 0, aFaire: false }
  return { dispo, reste, aFaire: dispo <= (a.mini || 0) || (dejaFait > 0 && reste > 0) }
}

/**
 * La taille lue dans le nom : « indiv » vaut 1, « 10 pers », « 20 cm » et
 * « (5) » leur nombre. 0 quand il n'y en a pas.
 */
export const tailleDuNom = nom => {
  const n = String(nom || '')
  if (/\bindiv/i.test(n)) return 1
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|pers)\b/i) || n.match(/\((\d+)\)/)
  return m ? Number(String(m[1]).replace(',', '.')) : 0
}

/** Le nom sans son préfixe ni sa taille : ce qui réunit les tailles d'un gâteau. */
export const familleDuNom = nom => String(nom || '')
  .replace(/^\s*(\[[^\]]*\]\s*)?sm\s*[-./]?\s*/i, '')
  .replace(/\bindiv\w*|\d+(?:[.,]\d+)?\s*(?:cm|pers)\b|\(\d+\)/gi, '')
  .replace(/\W+/g, ' ').trim().toLowerCase()

/**
 * Les AUTRES tailles de la même cuve, plus petites que celle qu'on lance.
 * « D'un 10 pers on peut finir en 5 pers et en individuels, d'un 5 pers
 * seulement en individuels » (Layla, 2026-09-07).
 *
 * La famille du catalogue fait foi quand elle est renseignée ; sinon elle se
 * lit dans le nom — sans quoi il faudrait la saisir à la main pour chacun des
 * quarante articles (Layla, 2026-09-10 : « branche-la à tous les articles avec
 * des mousses »).
 */
export function autresTailles(catalogue, a) {
  const fam = x => x.famille || familleDuNom(x.produit)
  const rang = x => (x.famille ? (x.rang || 1) : tailleDuNom(x.produit))
  const f = fam(a)
  if (!f) return []
  return (catalogue || [])
    .filter(x => x.produit !== a.produit && x.actif !== false && fam(x) === f && rang(x) < rang(a))
    .sort((x, y) => rang(y) - rang(x))
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

/**
 * Charge D'AVANCE les articles et leurs recettes, par NIVEAUX et en masse.
 *
 * ⚠️ C'est ici que se jouaient les douze secondes du premier chargement :
 * `produitParNom` et `bomDe` demandaient à Odoo un article, puis sa recette,
 * puis ses lignes — un par un, en file indienne. Une cascade de treize
 * gâteaux, c'est plus de cent cinquante allers-retours.
 *
 * On descend maintenant niveau par niveau : trois requêtes groupées par
 * niveau, quatre niveaux, une douzaine en tout. Ce qui est lu est déposé dans
 * le cache de dix minutes, exactement là où les fonctions d'origine iraient le
 * chercher — elles n'ont donc plus rien à demander.
 * (Layla, 2026-09-10 : « c'est trop lent à travailler ».)
 */
async function amorcerRecettes(cache, noms, niveaux = 5) {
  let aVoir = [...new Set(noms.map(n => sansRef(n)).filter(Boolean))]
  const vus = new Set()
  for (let i = 0; i < niveaux && aVoir.length; i++) {
    const neufs = aVoir.filter(n => !vus.has(n) && !dejaEnCache('p:' + n))
    for (const n of aVoir) vus.add(n)
    if (!neufs.length) break
    // 1) les articles, par paquets — le nom peut désigner une variante
    const bases = [...new Set(neufs.map(n => n.replace(/\s*\([^()]*\)\s*$/, '').trim()))]
    const prods = []
    for (let d = 0; d < bases.length; d += 300) {
      prods.push(...await sr('product.product', [['name', 'in', bases.slice(d, d + 300)]],
        CHAMPS_PRODUIT, { limit: 3000 }))
    }
    const parNet = new Map()
    const parName = new Map()
    for (const p of prods) {
      parNet.set(net(p.display_name), p)
      if (!parName.has(p.name)) parName.set(p.name, [])
      parName.get(p.name).push(p)
    }
    const choisi = {}
    for (const n of neufs) {
      const memes = parName.get(n) || []
      const p = memes.length === 1 ? memes[0]
        : (parNet.get(net(n)) || memes[0] || null)
      choisi[n] = p || null
      poserMemo('p:' + n, p || null)
    }
    // 2) leurs recettes et leurs lignes, en deux requêtes
    const tmpls = [...new Set(Object.values(choisi).filter(Boolean)
      .map(p => p.product_tmpl_id[0]).filter(t => !dejaEnCache('b:' + t)))]
    if (!tmpls.length) break
    const boms = []
    for (let d = 0; d < tmpls.length; d += 300) {
      boms.push(...await sr('mrp.bom', [['product_tmpl_id', 'in', tmpls.slice(d, d + 300)]],
        ['id', 'product_tmpl_id', 'product_qty', 'product_uom_id'], { limit: 3000 }))
    }
    const premier = new Map()      // un seul bom par modèle, comme `bomDe`
    for (const b of boms) if (!premier.has(b.product_tmpl_id[0])) premier.set(b.product_tmpl_id[0], b)
    const ids = [...premier.values()].map(b => b.id)
    const lignes = []
    for (let d = 0; d < ids.length; d += 300) {
      lignes.push(...await sr('mrp.bom.line', [['bom_id', 'in', ids.slice(d, d + 300)]],
        ['bom_id', 'product_id', 'product_qty', 'product_uom_id',
          'bom_product_template_attribute_value_ids'], { limit: 20000 }))
    }
    const parBom = new Map()
    for (const l of lignes) {
      if (!parBom.has(l.bom_id[0])) parBom.set(l.bom_id[0], [])
      parBom.get(l.bom_id[0]).push(l)
    }
    const suivants = []
    for (const t of tmpls) {
      const b = premier.get(t)
      if (!b) { poserMemo('b:' + t, null); continue }
      poserMemo('b:' + t, { ...b, lignes: parBom.get(b.id) || [] })
      for (const l of parBom.get(b.id) || []) suivants.push(sansRef(l.product_id[1]))
    }
    aVoir = suivants
  }
}

/** Le stock de plusieurs articles à l'annexe, en un seul appel. */
/**
 * Le stock du Stock Prod annexe.
 *
 * ⚠️ TOUT le lieu en UNE lecture, gardée le temps de la requête. On demandait
 * avant les stocks article par article, à chaque niveau de chaque cascade :
 * des centaines d'allers-retours vers Odoo pour un seul écran, d'où les neuf
 * secondes d'attente. Le lieu entier tient en une requête. Jamais entre deux
 * requêtes, en revanche : c'est ce qui bouge, et Layla doit voir ses
 * corrections tout de suite. (Layla, 2026-09-10 : « c'est trop lent ».)
 */
async function stocksDe(ids, cache = null) {
  if (!ids.length) return {}
  if (cache) {
    if (!cache.stocks) {
      cache.stocks = (async () => {
        const q = await sr('stock.quant', [['location_id', '=', LIEU_ANNEXE]],
          ['product_id', 'quantity'], { limit: 8000 })
        const par = {}
        for (const x of q) par[x.product_id[0]] = (par[x.product_id[0]] || 0) + x.quantity
        return par
      })()
    }
    return await cache.stocks
  }
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
/**
 * Ce qui a été déclaré aujourd'hui, rangé par destinataire.
 *
 * Une préparation faite DEPUIS un gâteau lui est réservée : « la ganache
 * déclarée garde le lien pour Base CBS 23 cm — et du coup le 18 cm demande à
 * faire la sienne » (Layla, 2026-09-10). Sans ça, le 18 cm voyait la ganache
 * du 23 cm et ne demandait plus rien : deux gâteaux, une seule ganache.
 *
 * ⚠️ Une déclaration VALIDÉE ne compte plus : sa production est entrée dans le
 * stock Odoo, la compter en plus la ferait compter DEUX FOIS.
 *
 * Rend `{ total, libre, pour }` — `total` pour l'état d'un article (ce qui
 * existe, réservé ou non), `libre` + `pour[gâteau]` pour ses composants.
 */
export function partagerDeclarations(faits, clos = new Set()) {
  const total = {}
  const libre = {}
  const pour = {}
  for (const f of faits || []) {
    if (f.ordre && clos.has(f.ordre)) continue
    const q = Number(f.qty) || 0
    total[f.article] = (total[f.article] || 0) + q
    if (f.pour) {
      const par = pour[f.pour] || (pour[f.pour] = {})
      par[f.article] = (par[f.article] || 0) + q
    } else {
      libre[f.article] = (libre[f.article] || 0) + q
    }
  }
  return { total, libre, pour }
}

/** Ce dont dispose UN gâteau : le libre, plus ce qui lui est réservé. */
export function disponiblePour(declare, tete) {
  const out = { ...(declare?.libre || {}) }
  for (const [nom, q] of Object.entries(declare?.pour?.[tete] || {})) {
    out[nom] = (out[nom] || 0) + q
  }
  return out
}

/**
 * Combien produire d'un composant qui se fait à la QUANTITÉ (pas par fournée).
 *
 * Ce qui manque, d'abord. Mais JAMAIS zéro : on ouvre aussi un composant qu'on
 * a déjà, pour en préparer d'avance — « je peux rajouter quelque chose de la
 * recette même si déjà en stock » (Layla, 2026-09-10). L'écran propose alors
 * ce que la recette demande.
 *
 * Ce qui se compte en pièces s'arrondit au-dessus : on ne fait pas 1,4 fond.
 */
export function aProduire(manque, besoin, unite) {
  const q = manque > 0 ? manque : besoin
  if (!(q > 0)) return 0
  return /^u$/i.test(String(unite || '').trim())
    ? Math.ceil(q) : Math.round(q * 1000) / 1000
}

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
  const stocks = await stocksDe(ids, cache)

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

    // `entier` : ce qui se cuit d'un bloc — un cadre, une plaque, un biscuit.
    // L'écran s'en sert pour savoir s'il propose « juste ce qu'il manque » ou
    // le bloc entier (Layla, 2026-09-10).
    const c = { produit: nom, unite: uniteDe(p), besoin, stock, dejaFait, fabrique, fige, ok,
      entier: /\b(cadres?|plaques?|biscuits?)\b/i.test(nom) }

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
      // La fournée est une DÉCISION de Layla, prise dans « Mini / maxi
      // Annexe » : « ça dépend de ce qui a été décidé dans le mini et maxi,
      // s'il y a tournée ou pas » (2026-09-10). Pas de tournée au catalogue =
      // pas de fournée : on fait exactement ce qu'il faut. Avant, l'écran
      // proposait 1 000 g de zeste de citron pour une recette qui en demande
      // 12, et 5 458 g de glaçage rose pour 1 178.
      const auCatalogue = lots[nom] > 0
      // ⚠️ Une « tournée » de 1 g ou de 1 kg n'est pas une tournée : la recette
      // Odoo est alors écrite POUR UNE UNITÉ (0,328 g de lait pour 1 g de crème
      // légère). Ces préparations se comptent en QUANTITÉ, comme les figées —
      // sinon l'écran annonçait « 2 317 tournées » de craquant royal et
      // « 2 737 tournées » de crème légère. Une tournée de 1 PIÈCE, elle, est
      // bien une tournée (la plaque de biscuit à la cuillère).
      // (Analyse du circuit, Layla, 2026-09-09.)
      const aLaQuantite = fige || !auCatalogue || parTournee <= 1
      if (aLaQuantite) {
        // ⚠️ EXCEPTION à « toujours une tournée entière » : un article à
        // quantité FIGÉE ne se fait pas par tournée — la cuve part en entier
        // sur la fournée, et on en produit exactement ce qui manque.
        // « J'ai besoin de 5 474 pour faire la recette, il m'en reste 250,
        // donc ce qu'il me reste à faire c'est 5 474 − 250 » (Layla,
        // 2026-09-09). Avant, l'écran annonçait « 1 tournée = 5 492 g ».
        c.aLaQuantite = true
        c.tournees = 1
        c.produira = aProduire(manque, besoin, c.unite)
      } else if (manque > 0) {
        // Au DEMI près, comme les gâteaux : une demi-tournée de gâteaux ne
        // demande pas une tournée entière de fonds. « La quantité doit
        // suivre » (Layla, 2026-09-09) — 29 gâteaux, 29 fonds, pas 58.
        // Toujours arrondi vers le HAUT : il faut couvrir le besoin, sinon
        // le montage se bloque à la dernière pièce.
        // ⚠️ Toujours des fournées ENTIÈRES : plus de demi nulle part
        // (Layla, 2026-09-10).
        c.tournees = Math.max(1, Math.ceil(manque / parTournee))
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
      if (!b64) {
        // ⚠️ Une photo ABSENTE se garde en cache elle aussi : sans ça, chaque
        // ouverture de « Déclarer » redemandait à Odoo les images qui
        // n'existent pas — le plus lent, pour rien.
        res.setHeader('Cache-Control', 'public, max-age=3600')
        return res.status(404).end()
      }
      res.setHeader('Content-Type', 'image/png')
      // Une photo de produit ne change quasiment jamais. Une semaine de cache,
      // c'est autant d'allers-retours Odoo en moins à chaque écran.
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
      return res.status(200).send(Buffer.from(b64, 'base64'))
    }

    // Le cron d'atelier appelle `?details=1` toutes les 10 minutes. Qu'il
    // réchauffe AUSSI le squelette de « Déclarer » : sans ça, la première
    // personne à ouvrir l'onglet payait ses quatre secondes toutes les demi-
    // heures. Ça ne coûte rien — c'est la même invocation, après la réponse.
    if (req.query.details) {
      const p = Promise.resolve(squeletteTout()).catch(e => console.warn('[tout]', e?.message || e))
      try { waitUntil(p) } catch { /* pas de contexte Vercel */ }
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

    // ⚠️ Les trois lectures d'entrée partent ENSEMBLE : le catalogue et le
    // journal viennent de Supabase, le stock d'Odoo, et aucune n'a besoin des
    // autres. En file indienne, c'était trois allers-retours ajoutés bout à
    // bout avant même de commencer. (Layla, 2026-09-10 : « fais un effort ».)
    const cache = creerCache()
    const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' })
    const stocksAmorces = stocksDe([1], cache)
    stocksAmorces.catch(() => { /* l'erreur ressortira au vrai `await` */ })
    // Tout le catalogue : même un article qu'on n'affiche pas y donne la taille
    // de ses tournées, utile dès qu'il apparaît comme composant d'un autre.
    // Le journal dit ce que l'atelier a DÉJÀ déclaré aujourd'hui : le stock
    // Odoo ne remonte qu'à la validation, et sans lui l'écran redemanderait la
    // tournée entière à quelqu'un qui vient de la faire.
    // ⚠️ `pour` peut ne pas exister encore (SQL `fab_prod_pour.sql` pas lancé) :
    // on retombe sur l'ancienne lecture plutôt que de perdre TOUT le journal —
    // sans lui, l'écran redemanderait à l'atelier ce qu'il vient de faire.
    const lireFaits = async () => {
      const ou = c => sb.from('prod_fabrications').select(c)
        .eq('jour', jour).eq('atelier', 'annexe')
      const avec = await ou('article, qty, ordre, pour')
      if (!avec.error) return avec.data
      const sans = await ou('article, qty, ordre')
      return sans.data
    }
    const [{ data: tout, error }, faits] = await Promise.all([
      sb.from('fab_annexe_articles').select('*').order('produit'),
      lireFaits(),
    ])
    if (error) throw new Error(`Catalogue illisible : ${error.message}`)

    const ordres = [...new Set((faits || []).map(f => f.ordre).filter(Boolean))]
    const clos = new Set()
    if (ordres.length) {
      const mos = await sr('mrp.production', [['name', 'in', ordres]], ['name', 'state'])
      for (const m of mos) if (m.state === 'done' || m.state === 'cancel') clos.add(m.name)
    }
    const declare = partagerDeclarations(faits, clos)

    const catalogue = (tout || []).filter(a => a.actif)
    const lots = Object.fromEntries((tout || []).filter(a => a.tournee > 0).map(a => [a.produit, a.tournee]))
    // Ce qu'on achète, même si Odoo lui connaît une recette : la framboise
    // congelée bloquait le confit sans qu'on puisse rien y faire.
    const achetes = new Set((tout || []).filter(a => a.achete).map(a => a.produit))

    const articles = []

    // Un seul article demandé (le pâtissier vient de l'ouvrir) : lui seul a
    // besoin de sa cascade de recettes.
    // Un ou PLUSIEURS articles : « Déclarer » demande tout un gâteau d'un coup,
    // séparés par « | ». Les calculer ensemble coûte à peine plus qu'un seul
    // (même cache de recettes, mêmes stocks) — et le pâtissier n'attend plus à
    // chaque clic. (Layla, 2026-09-11 : « quand on ouvre une nouvelle recette
    // c'est lent ».)
    const seuls = req.query.article
      ? String(req.query.article).split('|').map(x => x.trim()).filter(Boolean) : null
    const seul = !!seuls
    // ⚠️ `details=1` : la cascade de TOUS les articles à faire, d'un coup. Un
    // clic sur un article coûtait une seconde d'attente, treize fois par
    // matinée. Les recettes sont gardées dix minutes et le cache est partagé
    // dans la requête : les calculer ensemble coûte à peine plus qu'un seul.
    // (Layla, 2026-09-10 : « c'est trop lent à travailler ».)
    const tousLesDetails = req.query.details === '1'
    const voulus = seuls
      ? (catalogue || []).filter(a => seuls.includes(a.produit))
      : (catalogue || [])
    // Un article ouvert depuis « Déclarer » n'est pas forcément réglé : on lui
    // fabrique une fiche à la volée, sans mini ni maxi ni rien de figé.
    if (seuls) {
      for (const nom of seuls.filter(n => !voulus.some(a => a.produit === n))) {
        const p0 = await produitParNom(cache, nom)
        const b0 = p0 && await bomDe(cache, p0)
        if (!b0) continue                    // rien à fabriquer sous ce nom
        voulus.push({ produit: nom, libelle: nom, photo: null, mini: 0, maxi: 0,
          tournee: versUnite(b0.product_qty || 1, b0.product_uom_id?.[1], p0.uom_id[1]) || 1,
          figes: [], figes_nom: null, actif: true, horsCatalogue: true })
      }
      if (!voulus.length) return res.status(200).json({ articles: [] })
    }

    // Tout ce qu'on va lire, chargé d'avance et en masse : sans ça, la cascade
    // demandait à Odoo un article puis une recette à la fois.
    await amorcerRecettes(cache, voulus.map(a => a.produit))

    // Les produits et LEURS STOCKS d'un coup — deux requêtes Odoo, que le
    // catalogue en compte cinq ou deux cents. C'est tout ce dont la liste a
    // besoin ; les recettes ne se chargent qu'à l'ouverture d'un article.
    const prods = await Promise.all(voulus.map(a => produitParNom(cache, a.produit)))
    const stocks = await stocksDe(prods.filter(Boolean).map(p => p.id), cache)

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

      // Ce qui existe DÉJÀ de cet article, réservé à un gâteau ou non : il a
      // bien été fabriqué, il compte pour son propre mini/maxi.
      const dejaFait = declare.total[a.produit] || 0
      const { reste, aFaire } = etatArticle(a, stock, dejaFait)
      if (!seul && !aFaire) continue

      // La liste n'affiche que l'état : ni recette, ni cascade, ni tailles.
      if (!seul && !tousLesDetails) {
        articles.push({
          produit: a.produit, libelle: a.libelle || a.produit,
          photo: a.photo || gateauDe(a.produit),
          unite: uniteDe(p), stock, mini: a.mini, maxi: a.maxi, tournee: a.tournee,
          dejaFait, reste,
          etat: stock <= 0 ? 'rupture' : 'refaire',
        })
        continue
      }

      // Ses composants, eux, ne voient QUE ce qui est libre et ce qui lui est
      // réservé : la ganache faite pour le 23 cm ne dispense pas le 18 cm.
      const composants = await composantsDe(cache, p, a.tournee, a.figes || [], 0, [], lots, achetes,
        disponiblePour(declare, a.produit))
      // Une CUVE, c'est ce qui ne se divise pas : les figés réglés pour
      // l'article, ou n'importe quelle mousse — même quand elle a son propre
      // article et qu'on ne l'a jamais cochée. (Layla, 2026-09-10 : « branche-la
      // à tous les articles avec des mousses ».)
      const aUneCuve = (a.figes || []).length > 0 || composants.some(c => c.fige)
      articles.push({
        produit: a.produit,
        libelle: a.libelle || a.produit,
        // Même règle que la liste : à défaut de photo à lui, celle de son
        // gâteau. On ne retombe sur son propre nom qu'en dernier recours.
        photo: a.photo || gateauDe(a.produit) || a.produit,
        unite: uniteDe(p),
        stock, mini: a.mini, maxi: a.maxi, tournee: a.tournee,
        dejaFait, reste,
        etat: stock <= 0 ? 'rupture' : 'refaire',
        figes: a.figes || [],
        figesNom: a.figes_nom || 'Monté sur place',
        ajustements: ajustementsFiges(await bomDe(cache, p), p, a.figes || [], a.tournee),
        // ⚠️ Les tailles d'une même cuve (« d'un 10 pers on finit en 5 pers et
        // en individuels ») ne sont PAS calculées ici : chacune coûte une
        // dizaine d'allers-retours vers Odoo, et l'écran de fin multi-tailles
        // n'est pas encore fait. `detailTaille` est prêt pour ce jour-là.
        composants,
        // Les tailles plus petites où finir la même cuve. Seulement quand il y
        // a une cuve, justement : un article sans rien de figé n'a pas de
        // reste à placer.
        tailles: aUneCuve
          ? autresTailles(tout, a).map(x => ({
            produit: x.produit, libelle: x.libelle || x.produit,
            tournee: x.tournee, rang: x.rang || tailleDuNom(x.produit),
          }))
          : [],
      })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ articles })
  } catch (e) {
    console.error('[fab-annexe]', e)
    return res.status(500).json({ error: e.message })
  }
}
