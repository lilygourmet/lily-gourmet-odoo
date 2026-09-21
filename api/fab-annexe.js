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
import { versUnite, enGrammes } from '../src/lib/unites.js'

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

// ------------------------------------------------------------
// « J'AI CORRIGÉ UNE RECETTE DANS ODOO, JE NE VEUX PAS ATTENDRE. »
//
// Les recettes sont gardées une demi-heure — et pas au même endroit pour tout
// le monde : Vercel fait tourner PLUSIEURS copies de cette fonction, chacune
// avec sa propre mémoire. Une copie qui vide la sienne ne règle rien : la
// copie d'à côté continuerait de servir l'ancienne recette.
//
// D'où un TOP DÉPART commun, rangé dans `app_config`. Le bouton l'avance ;
// chaque copie qui voit un top plus récent que le sien jette ses recettes et
// va les relire chez Odoo. Ça coûte une lecture Supabase par appel — quelques
// dizaines de millisecondes devant des secondes d'Odoo.
// ------------------------------------------------------------
const CLE_VERSION = 'fab_annexe_recettes_v'
let _versionVue = null

async function alignerRecettes(sb) {
  const { data, error } = await sb.from('app_config')
    .select('value').eq('key', CLE_VERSION).maybeSingle()
  // Base injoignable : on garde ce qu'on a. Mieux vaut une recette d'il y a
  // vingt minutes qu'un écran vide devant un pâtissier.
  if (error) return
  const v = data?.value || ''
  // Premier appel de cette copie : son cache est vide, rien à jeter.
  if (_versionVue === null) { _versionVue = v; return }
  if (v !== _versionVue) { _recettes.clear(); _versionVue = v }
}

function memo(cle, faire, duree = DUREE_RECETTES) {
  const e = _recettes.get(cle)
  if (e && Date.now() - e.t < duree) return e.v
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
 * • ⚠️ PAS DE RELIQUAT. Une tournée commencée restait à l'écran tant que le
 *   maxi n'était pas atteint, pour qu'on voie ce qui manquait encore. Mais
 *   c'était une case rouge de plus, qui ressemblait à un travail à faire :
 *   le 2026-09-15 à 15h15 Layla déclare 20 cheesecakes, la case revient avec
 *   7 — 23 en stock + 20 faits, maxi 50 — et deux minutes plus tard un ordre
 *   de 7 cheesecakes que personne n'a faits part chez Odoo.
 *   « je ne veux pas de reliquat » (Layla). Dès qu'on a assez pour passer le
 *   mini, la case s'en va ; on refait le tour demain.
 */
/**
 * L'URGENCE D'UN ARTICLE : où en est son stock par rapport à son mini.
 *
 * « classe-moi À faire par ordre d'urgence selon le stock » (Layla,
 * 2026-09-15). La liste sortait par ordre alphabétique — le Royal Chocolat à
 * zéro se retrouvait derrière une base de tarte dont il reste de quoi tenir.
 *
 * On compare en PART, pas en nombre : un gâteau à 0 sur un mini de 3 est aussi
 * urgent qu'un autre à 0 sur un mini de 100. Zéro d'un côté comme de l'autre,
 * même rouge, même place en tête.
 *
 * Rend un nombre entre 0 (il n'y a plus rien) et 1 (on est pile sur le mini).
 * Un mini à zéro ne se montre qu'à stock zéro : l'urgence y est maximale.
 */
export function urgence(a, stock, dejaFait = 0) {
  const mini = Number(a?.mini) || 0
  if (!(mini > 0)) return 0
  const dispo = Math.max(0, Number(stock) || 0) + (Number(dejaFait) || 0)
  return Math.min(1, dispo / mini)
}

export function etatArticle(a, stock, dejaFait = 0) {
  const dispo = Math.max(0, stock || 0) + (dejaFait || 0)
  const reste = Math.max(0, (a.maxi || 0) - dispo)
  // ⚠️ Un MAXI à zéro, c'est « pas de cible » : l'article est au catalogue pour
  // la taille de sa tournée, quand il apparaît comme composant d'un autre. Le
  // proposer tout seul donnait « Crème légère vanille citron — à faire 1 g »
  // (Layla, 2026-09-10). Mettre un maxi suffit à le faire revenir.
  if (!((a.maxi || 0) > 0)) return { dispo, reste: 0, aFaire: false }
  return { dispo, reste, aFaire: dispo <= (a.mini || 0) }
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
 * TOUTES les autres tailles de la même cuve.
 *
 * ⚠️ On ne proposait que les tailles PLUS PETITES : « d'un 10 pers on finit en
 * 5 pers et en individuels » (Layla, 2026-09-07). Mais l'inverse arrive aussi —
 * on monte des individuels et on finit la cuve en 10 pers. Depuis le
 * 2026-09-13, toutes les tailles de la famille sont proposées, des plus grandes
 * aux plus petites : « donne la possibilité de mettre les plus grandes aussi ».
 * Sans ça, celui qui lance un individuel n'avait AUCUNE case où déclarer le
 * reste, et tout le poids de la cuve retombait sur la seule taille lancée.
 *
 * On ne sort jamais de la famille, et ce qui est en pause reste de côté.
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
    .filter(x => x.produit !== a.produit && x.actif !== false && fam(x) === f)
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
/**
 * DERNIER RECOURS : LA CASSE. Odoo compare les noms lettre par lettre.
 * Le catalogue disait « SM. Sirop Imbibage Mini Cake Chocolat **Kg** » quand
 * Odoo écrit « …**KG** » : l'article disparaissait de l'écran avec
 * « introuvable dans Odoo — renommé ? ». Une seule lettre. (Layla, 2026-09-14.)
 *
 * On ne s'en sert QUE quand la recherche exacte n'a rien donné — donc presque
 * jamais. Le résultat d'`ilike` est refiltré au nom près : un « contient » ne
 * doit pas ramener un article voisin.
 */
async function chercheALaCasse(nom) {
  const proches = await sr('product.product', [['name', 'ilike', nom]], CHAMPS_PRODUIT, { limit: 40 })
  return proches.find(x => net(x.name) === net(nom))
    || proches.find(x => net(x.display_name) === net(nom)) || null
}

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
      if (base && base !== nom) {
        const freres = await sr('product.product', [['name', '=', base]], CHAMPS_PRODUIT, { limit: 40 })
        const v = freres.find(x => net(x.display_name) === net(nom))
        if (v) return v
      }
      return chercheALaCasse(nom)
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
/**
 * Les noms à demander à Odoo pour retrouver un article de recette : le nom
 * EXACT, et sa base sans les parenthèses finales.
 *
 * ⚠️ BUG DU 2026-09-11, grave et silencieux : on ne demandait QUE la base. Or
 * « SM. Biscuit a la cuillere (plaque) » est un vrai nom d'article, pas une
 * variante de « SM. Biscuit a la cuillere » (lequel est archivé). Odoo ne
 * renvoyait donc rien, le pré-chargement déposait `null` dans le cache, et la
 * PLAQUE DISPARAISSAIT de la recette du biscuit 5 pers : plus de ligne, plus
 * de blocage, « c'est fait » possible sans jamais l'avoir faite.
 *
 * Les parenthèses servent bien aux variantes ailleurs (« SM- 20 cm Vitrine
 * (Citron) ») : on demande donc les deux, et le nom exact gagne.
 */
export function nomsAChercher(noms) {
  const out = new Set()
  for (const n of noms || []) {
    if (!n) continue
    out.add(n)
    const base = String(n).replace(/\s*\([^()]*\)\s*$/, '').trim()
    if (base && base !== n) out.add(base)
  }
  return [...out]
}

async function amorcerRecettes(cache, noms, niveaux = 5) {
  let aVoir = [...new Set(noms.map(n => sansRef(n)).filter(Boolean))]
  const vus = new Set()
  for (let i = 0; i < niveaux && aVoir.length; i++) {
    const neufs = aVoir.filter(n => !vus.has(n) && !dejaEnCache('p:' + n))
    for (const n of aVoir) vus.add(n)
    if (!neufs.length) break
    // 1) les articles, par paquets — le nom peut désigner une variante
    const cherches = nomsAChercher(neufs)
    const prods = []
    for (let d = 0; d < cherches.length; d += 300) {
      prods.push(...await sr('product.product', [['name', 'in', cherches.slice(d, d + 300)]],
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
      // ⚠️ Ne JAMAIS déposer un « je n'ai pas trouvé » : `produitParNom`
      // s'arrêterait là, alors qu'il sait chercher plus loin (les variantes).
      // C'est ce qui faisait disparaître la plaque de biscuit (2026-09-11).
      if (p) poserMemo('p:' + n, p)
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

const uniteOdoo = u => (u ? String(u).replace(/^Units?$/i, 'u') : null)
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

function ajustementsFiges(bom, produit, figes, tournee, composants = []) {
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
  // ⚠️ ET LA QUANTITÉ SORT DANS L'UNITÉ DE L'ARTICLE, pas dans celle de la
  // ligne (Layla, 2026-09-21 : « assure-toi que partout pareil »). C'est la
  // convention de TOUS les chemins qui imposent une quantité : le serveur
  // reconvertit vers l'unité de la ligne au moment de créer l'ordre, en un seul
  // endroit (`ajustementsEnUniteLigne` dans `freezer-list.js`). Sortir d'ici en
  // unité de ligne, c'était faire convertir DEUX FOIS — et rejouer le facteur
  // mille par l'autre bout.
  const uniteArticle = new Map((composants || []).map(c => [c.produit, c.unite]))
  return Object.fromEntries([...par].map(([nom, e]) => {
    const moyenne = e.total / e.lignes
    const ua = uniteArticle.get(nom)
    // Pas d'unité connue, ou la même : rien à convertir.
    const v = (!ua || String(ua).trim().toLowerCase() === String(e.unite).trim().toLowerCase())
      ? moyenne
      : versUnite(moyenne, e.unite, ua)
    const n = (v === null || !Number.isFinite(v)) ? moyenne : v
    return [nom, Math.round(n * 1000) / 1000]
  }))
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
  // Quand la DERNIÈRE fournée de cet article a été déclarée. « noter le jour et
  // l'heure » (Layla, 2026-09-19) : l'écran dit « 240 g aujourd'hui », il peut
  // dire quand.
  const quand = {}
  for (const f of faits || []) {
    if (f.ordre && clos.has(f.ordre)) continue
    const q = Number(f.qty) || 0
    total[f.article] = (total[f.article] || 0) + q
    if (f.fait_le && (!quand[f.article] || f.fait_le > quand[f.article])) quand[f.article] = f.fait_le
    if (f.pour) {
      const par = pour[f.pour] || (pour[f.pour] = {})
      par[f.article] = (par[f.article] || 0) + q
    } else {
      libre[f.article] = (libre[f.article] || 0) + q
    }
  }
  return { total, libre, pour, quand }
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
 * UNE DÉCOUPE : un seul ingrédient dans la recette, et l'article se compte en
 * pièces. C'est un biscuit qu'on taille dans une plaque.
 *
 * ⚠️ Celle-là se fait TOUJOURS par plaques entières, catalogue ou pas : « les
 * découpes paraissent toujours avec le nombre demandé du gâteau ; on a parlé
 * de tournée de découpe selon la taille » (Layla, 2026-09-11). On ne coupe pas
 * 90 individuels dans une plaque qui en donne 102 — on en coupe 102, et les 12
 * en trop partent au congélo.
 */
/**
 * LA QUANTITÉ QU'UNE FICHE PROPOSE.
 *
 * ⚠️ UNE FOURNÉE DE 1 g N'EN EST PAS UNE. Sur un article qui se PÈSE, une
 * « tournée » à 1 (ou 0) dans « Mini / maxi Annexe » ne veut pas dire qu'une
 * fournée fait un gramme : c'est la façon de dire « pas de fournée décidée »,
 * pour que ce composant se fasse à la quantité juste (voir `aLaQuantite`).
 *
 * Mais une FICHE, elle, doit proposer quelque chose de faisable. Avec 1, elle
 * calculait tout pour UN GRAMME : « 0,00037 kg de sucre, 0,09 g d'eau,
 * 0,00075 kg d'amandes » pour les amandes caramélisées. Layla, le 2026-09-14 :
 * « les amandes caramélisées sortent la recette pas ok ».
 *
 * On retombe alors sur la fournée de la RECETTE ODOO — exactement ce que fait
 * déjà l'onglet « Déclarer ». Ce qui se compte à la PIÈCE n'est pas concerné :
 * une tournée d'un seul gâteau existe.
 */
export function fourneeFiche(tourneeCatalogue, unite, fourneeRecette) {
  const t = Number(tourneeCatalogue) || 0
  if (!/^(g|gr|kg)$/i.test(String(unite || '').trim())) return t || 1
  if (t > 1) return t
  const r = Number(fourneeRecette) || 0
  return r > 0 ? r : (t || 1)
}

export const estDecoupeServeur = (unite, nbLignes) =>
  /^u$/i.test(String(unite || '').trim()) && nbLignes === 1

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
      // Une découpe garde ses plaques entières même sans réglage au catalogue.
      const estDecoupe = estDecoupeServeur(c.unite, lignesPour(sousBom, p).length)
      const aLaQuantite = fige || (!estDecoupe && (!auCatalogue || parTournee <= 1))
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
export async function repartir(cache, catalogue, lance, quantites, prevu = 0) {
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

  // On lit quand même chaque taille : c'est ce qui remplit `parLigne`, et donc
  // ce qui dit QUELS ingrédients sont figés chez elle.
  for (const produit of Object.keys(quantites)) {
    const a = catalogue.find(x => x.produit === produit)
    if (a) await parPiece(a)
  }

  // LA CUVE, EN ENTIER, SUR LA TAILLE LANCÉE.
  //
  // ⚠️ Calculée sur ce qui était PRÉVU — c'est pour ce nombre-là que la crème
  // a été faite — jamais sur la tournée du catalogue ni sur ce qui est
  // réellement sorti. Vécu le 2026-09-11 : 9 775 g de crème légère préparés
  // pour 25 pièces, 23 sorties ; l'ordre n'en consommait que 4 719 (la cuve
  // d'une tournée de 13, moins la part donnée aux individuels).
  const ppLance = await parPiece(lance)
  const cuve = {}
  const combien = prevu > 0 ? prevu : lance.tournee
  for (const [nom, e] of Object.entries(ppLance)) {
    cuve[nom] = versUnite(e.ligne, e.unite, uniteArticle[nom]) * combien
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
      // ⚠️ RIEN pour les autres tailles : la cuve est déjà passée en entier
      // dans la taille lancée. « Il est censé ne rien consommer parce qu'il a
      // déjà consommé dans les 23 ; il ne doit prendre que les bases, ce qui
      // n'est pas figé » (Layla, 2026-09-11). Zéro est une consigne, pas un
      // oubli : sans elle, Odoo reprendrait la recette au prorata.
      const v = produit === lance.produit ? (cuve[nom] || 0) : 0
      // ⚠️ Réparti entre les lignes du même produit : Odoo pose la consigne sur
      // chacune, et le total serait sinon compté autant de fois qu'il y a de
      // lignes (le sucre du tiramisu en occupe deux).
      //
      // ⚠️ ET ON LAISSE LA QUANTITÉ DANS L'UNITÉ DE L'ARTICLE. Elle était
      // convertie ICI vers l'unité de la ligne, alors que tous les autres
      // chemins envoyaient l'unité de l'article : deux conventions pour la même
      // chose. Depuis que `creer-of` convertit lui-même (voir
      // `ajustementsEnUniteLigne`), convertir ici aussi ferait la conversion
      // DEUX FOIS. Une seule règle partout (Layla, 2026-09-21 : « assure-toi
      // que partout pareil »).
      ajustements[nom] = Math.max(0, Math.round(v / (e.n || 1) * 1000) / 1000)
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
        'product_template_attribute_value_ids', 'sale_ok'], { limit: 20000 }),
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
    //
    // ⚠️ C'EST ODOO QUI DIT S'IL EST VENDABLE (Layla, 2026-09-20 : « seulement
    // qui est coché peut être vendable »). Le préfixe dit ce qu'est l'article —
    // un gâteau fini plutôt qu'une préparation — mais pas s'il se vend encore.
    // Mesuré ce jour-là : 24 articles à préfixe ne sont plus cochés « peut être
    // vendu » chez Odoo (E- Fraisier, V- Babka Noisette…), et 67 gâteaux
    // groupés tombent à 49. Ce sont les recettes mortes qui encombraient
    // l'écran des mini/maxi.
    //
    // ⚠️ Le préfixe RESTE nécessaire : 1 758 articles sont cochés « peut être
    // vendu » chez Odoo — matières premières et variantes de cake design
    // comprises. S'y fier seul ferait exploser le graphe au lieu de le
    // nettoyer.
    const parents = new Map()          // nom d'une préparation → Set de gâteaux
    const vendus = prods.filter(p =>
      p.sale_ok && /^(E-|MI-|V-)/i.test(String(p.name || '').trim()))
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

/**
 * LES FORMATS D'UN VRAC — qui reçoit cette crème quand on la met en forme.
 *
 * « Quand une mousse, crème, chantilly, crémeux se fait, j'ai besoin que ça
 * parte dans À déclarer leur découpe » (Layla, 2026-09-20). Une préparation
 * n'est jamais finie quand elle sort de la cuve : la chantilly est PIPÉE, le
 * crémeux COULÉ dans les moules, le voile DÉCOUPÉ.
 *
 * Et chez elle, cette mise en forme est un article à part entière :
 *   SM. Chantilly à la Rose  →  SM- Chantilly rose pipée (1) / (5) / (10)
 *   SM. Crémeux Pistache     →  Crémeux Pistache 10 pers / Indiv
 *
 * L'écran ne pouvait pas les retrouver seul : son catalogue ne porte pas les
 * recettes. Le serveur, lui, a déjà tout le graphe en mémoire — on ne fait que
 * le lire à l'envers.
 *
 * `parUnite` : combien de vrac part dans UN exemplaire du format. C'est lui qui
 * permettra de dire, à partir des pièces annoncées, ce qui a été consommé.
 */
function grapheConsommateurs() {
  return memo('graphe:consommateurs', async () => {
    const [boms, lignes, prods] = await Promise.all([
      sr('mrp.bom', [], ['id', 'product_tmpl_id', 'product_qty', 'product_uom_id'], { limit: 5000 }),
      sr('mrp.bom.line', [], ['bom_id', 'product_id', 'product_qty', 'product_uom_id'], { limit: 40000 }),
      sr('product.product', [], ['id', 'name', 'display_name', 'product_tmpl_id', 'uom_id'],
        { limit: 20000 }),
    ])
    const bomParId = new Map(boms.map(b => [b.id, b]))
    const prodsDuTmpl = new Map()
    for (const p of prods) {
      const a = prodsDuTmpl.get(p.product_tmpl_id[0]) || []
      a.push(p); prodsDuTmpl.set(p.product_tmpl_id[0], a)
    }
    // nom du vrac → [ { produit, unite, parUnite } ]
    const vers = new Map()
    for (const l of lignes) {
      const bom = bomParId.get(l.bom_id[0])
      if (!bom) continue
      const sortie = Number(bom.product_qty) || 0
      if (!(sortie > 0)) continue
      for (const parent of prodsDuTmpl.get(bom.product_tmpl_id[0]) || []) {
        const nom = sansRef(l.product_id[1])
        const a = vers.get(nom) || []
        a.push({
          produit: sansRef(parent.display_name || parent.name),
          // ⚠️ « Units » EST LE MOT D'ODOO, PAS UNE UNITÉ QUE L'APP SAIT LIRE
          // (Layla, 2026-09-21 : « Base Tarte CBS 23 cm — son ordre est en
          // train de partir… sans ordre »). Tout le reste du fichier passe par
          // `uniteDe` ; ces deux lignes-ci sortaient le nom brut. « À finir »
          // déclarait donc en « Units », `declarer()` ne reconnaissait pas des
          // pièces, convertissait en grammes — et `enGrammes(1, 'Units')` vaut
          // NULL. L'ordre partait sans quantité et Odoo le refusait, en
          // silence : la déclaration restait « sans ordre » pour toujours.
          unite: uniteOdoo(parent.uom_id?.[1]),
          uniteVrac: uniteOdoo(l.product_uom_id?.[1]),
          parUnite: Math.round((Number(l.product_qty) || 0) / sortie * 1000) / 1000,
        })
        vers.set(nom, a)
      }
    }
    return vers
  })
}

/**
 * Les formats SUIVIS d'un vrac : on ne propose que ce que l'annexe fabrique
 * vraiment — le graphe d'Odoo, lui, contient aussi des gâteaux vendus et des
 * articles morts.
 */
async function formatsDe(nom) {
  const [vers, suivis] = await Promise.all([grapheConsommateurs(), squeletteTout()])
  const connus = new Map(suivis.map(a => [a.produit, a]))
  const vus = new Set()
  return (vers.get(sansRef(nom)) || [])
    .filter(f => connus.has(f.produit) && f.parUnite > 0)
    // ⚠️ ON NE VEND PAS DEPUIS « À FINIR ». Le graphe rendait TOUT ce qui
    // consomme le vrac — y compris les gâteaux vendus : la génoise chocolat CD
    // proposait « CD- Cakedesign 60 cm (90 pers) », et deux doigts auraient
    // suffi à lancer chez Odoo l'ordre d'un gâteau de commande. Mettre en
    // forme, c'est couler dans un moule, pas fabriquer un gâteau vendu.
    .filter(f => !/^\s*(CD-|E-|MI-|V-)/i.test(f.produit))
    .filter(f => (vus.has(f.produit) ? false : vus.add(f.produit)))
    .map(f => ({ ...f, photo: connus.get(f.produit)?.photo || null }))
    .sort((a, b) => b.parUnite - a.parUnite)
}

/**
 * CE QUI RESTE À METTRE EN FORME — la liste de l'onglet « À finir ».
 *
 * « Quand une mousse reste en stock, elle revient dans À déclarer parce qu'elle
 * doit être finie » (Layla, 2026-09-20). Sortir de la cuve n'est pas être
 * fini : la chantilly se pipe, le crémeux se coule dans les moules.
 *
 * ⚠️ LE STOCK D'ODOO NE SUFFIT PAS. Il ne baisse qu'à la VALIDATION de l'ordre,
 * et l'atelier valide en fin de journée : un vrac dispatché ce matin serait
 * resté toute la journée dans la liste, à réclamer un travail déjà fait. On
 * retire donc ce que les formats déclarés aujourd'hui en ont consommé —
 * exactement comme l'écran « Déclarer » compte `dejaFait`.
 */
async function aFinir(sb) {
  const { data: liste } = await sb.from('annexe_mise_en_forme').select('produit, note').eq('actif', true)
  if (!liste || !liste.length) return []

  const depuis = new Date()
  depuis.setDate(depuis.getDate() - 6)
  const [sq, vers, { data: faits }, quants] = await Promise.all([
    squeletteTout(),
    grapheConsommateurs(),
    sb.from('prod_fabrications').select('article, qty, ordre')
      .gte('jour', depuis.toLocaleDateString('sv-SE')).eq('atelier', 'annexe').limit(5000),
    sr('stock.quant', [['location_id', '=', LIEU_ANNEXE]], ['product_id', 'quantity'], { limit: 4000 }),
  ])

  // Ce qui est VALIDÉ ne compte plus : le stock d'Odoo le porte déjà.
  const ordres = [...new Set((faits || []).map(f => f.ordre).filter(Boolean))]
  const clos = new Set()
  if (ordres.length) {
    for (const m of await sr('mrp.production', [['name', 'in', ordres]], ['name', 'state'])) {
      if (m.state === 'done' || m.state === 'cancel') clos.add(m.name)
    }
  }
  const declare = partagerDeclarations(faits, clos).total

  const parId = new Map()
  for (const q of quants) parId.set(q.product_id[0], (parId.get(q.product_id[0]) || 0) + q.quantity)
  const connus = new Map(sq.map(a => [a.produit, a]))

  // ⚠️ UN ARTICLE TOUT NEUF N'EST PAS DANS LE SQUELETTE. Celui-ci se construit
  // à partir des ordres et des stocks : une préparation créée ce matin n'a ni
  // l'un ni l'autre, et elle serait restée muette jusqu'à sa première
  // fabrication — donc son premier reste n'aurait jamais été réclamé. Vécu le
  // 2026-09-20 avec les trois mousses (gianduja, tiramisu, royal) créées le
  // jour même. On va donc les chercher chez Odoo, une seule fois.
  const cache = creerCache()
  const out = []
  for (const l of liste) {
    let a = connus.get(l.produit)
    if (!a) {
      const p = await produitParNom(cache, l.produit)
      if (!p) continue                                 // renommé chez Odoo : on se tait
      a = { id: p.id, produit: l.produit, libelle: l.produit, unite: uniteDe(p), photo: null }
    }
    const stock = Math.round((parId.get(a.id) || 0) * 1000) / 1000
    // Ce que les formats déclarés aujourd'hui lui ont déjà pris.
    let pris = 0
    const vus = new Set()
    for (const f of vers.get(l.produit) || []) {
      if (vus.has(f.produit)) continue
      vus.add(f.produit)
      const n = declare[f.produit] || 0
      if (n > 0) pris += n * (Number(f.parUnite) || 0) * (estKgOdoo(f.uniteVrac) ? 1000 : 1)
    }
    // ⚠️ ET CE QUI VIENT D'ÊTRE DÉCLARÉ COMPTE AUSSI. Le stock d'Odoo ne monte
    // qu'à la VALIDATION, en fin de journée : une cuve montée ce matin
    // n'existait donc pas encore pour lui, alors que les gâteaux qu'elle a
    // servis, eux, étaient déjà comptés. Le reste tombait négatif et la mousse
    // ne réclamait rien — exactement le travail qu'on cherche à réclamer.
    const fait = declare[l.produit] || 0

    // `pris` est en grammes (ou en pièces) ; le stock, lui, dans l'unité de
    // l'article. On compare donc dans la même monnaie.
    const enG = estKgOdoo(a.unite) ? 1000 : 1
    // ⚠️ JAMAIS MOINS QUE RIEN. Un reste négatif n'est pas une dette, c'est un
    // compteur faux — même règle que le stock négatif ailleurs. Vécu le
    // 2026-09-20, une heure après avoir créé « SM. Mousse Tiramisu » : les
    // tiramisus déclarés les jours d'AVANT étaient déduits d'une cuve qui
    // n'existait pas encore, et la mousse annonçait −9 569 g. On aurait
    // sous-compté ses restes pendant une semaine, sans rien afficher d'anormal.
    const resteG = Math.max(0, Math.round(((stock + fait) * enG - pris) * 1000) / 1000)
    out.push({ ...a, note: l.note || null, stock, fait: Math.round(fait * 1000) / 1000,
      pris: Math.round(pris * 1000) / 1000, resteG })
  }
  return out
}

const estKgOdoo = u => /^kg$/i.test(String(u || '').trim())

/**
 * CE QUE L'ÉCONOME DOIT VRAIMENT SORTIR POUR CETTE FEUILLE.
 *
 * « La masse gélatine n'est pas dans donné » (Layla, 2026-09-21) : sa ligne
 * lui réclamait « Masse gélatine 1 440 g », une PRÉPARATION qu'il ne peut pas
 * sortir — sa réserve contient de la gélatine en POUDRE. Le papier, lui, porte
 * la bonne liste depuis toujours ; son écran, non.
 *
 * Même règle que le papier (`aDemander`) : ce qui ne se fabrique pas, et
 * jamais l'eau du robinet — elle sort du mur.
 */
async function demandeEconomat(cache, produit, qty, achetes) {
  const p = await produitParNom(cache, produit)
  const bom = p && await bomDe(cache, p)
  if (!bom) return []
  const base = versUnite(bom.product_qty || 1, bom.product_uom_id?.[1], p.uom_id?.[1]) || 1
  const facteur = (Number(qty) || 0) / base
  const out = []
  for (const l of lignesPour(bom, p)) {
    const nom = sansRef(l.product_id[1])
    if (/eau\s*(du\s*)?robinet/i.test(nom)) continue
    const c = await produitParNom(cache, nom)
    if (!c) continue
    // Une préparation a sa PROPRE feuille dans la liasse : on ne la demande pas.
    if (!achetes.has(nom) && await bomDe(cache, c)) continue
    const q = versUnite(l.product_qty, l.product_uom_id[1], c.uom_id[1]) * facteur
    if (q > 0) out.push({ produit: nom, qty: Math.round(q * 1000) / 1000, unite: uniteDe(c) })
  }
  return out
}

async function photoDe(nom) {
  const t = await sr('product.product', [['name', '=', nom]], ['image_256', 'image_512'], { limit: 1 })
  return t[0]?.image_256 || t[0]?.image_512 || null
}

export default async function handler(req, res) {
  try {
    // Les formats d'un vrac — lecture seule, rien d'autre n'est touché.
    if (req.query.formats) {
      return res.status(200).json({ formats: await formatsDe(String(req.query.formats)) })
    }

    if (req.query.photo) {
      const nom = String(req.query.photo)
      let b64 = await photoDe(nom)
      // ⚠️ À DÉFAUT, LA PHOTO DE SON ARTICLE MÈRE (Layla, 2026-09-20 : « mettre
      // les photos de l'article mère »). Une crème, un biscuit, un crunchy
      // n'ont pas d'image à eux : on laissait un carré vide, et un carré vide
      // ne se reconnaît pas. C'est déjà la règle de la liste « Déclarer » —
      // elle vaut partout, et le graphe des recettes est gardé en mémoire.
      if (!b64) {
        const s = (await grapheParents()).get(sansRef(nom))
        const mere = s && s.size ? [...s].sort((x, y) => x.localeCompare(y, 'fr'))[0] : null
        if (mere) b64 = await photoDe(mere)
      }
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

    const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // QUI DOIT ÊTRE MIS EN FORME — la liste que Layla coche depuis l'écran
    // « Mini / maxi Annexe » (2026-09-20 : « à choisir dans les mini et maxi
    // annexe ce qui apparaît dans les à finir »).
    //
    // ⚠️ Ça passe par le serveur, pas par la table en direct : ouvrir
    // `annexe_mise_en_forme` en écriture aux navigateurs, c'était une porte de
    // plus pour rien (voir la faille anon fermée le 2026-06-05).
    if (req.query.miseenforme) {
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
        const produit = String(body.produit || '').trim()
        if (!produit) return res.status(400).json({ error: 'produit manquant' })
        const { error: e1 } = await sb.from('annexe_mise_en_forme')
          .upsert({ produit, actif: body.actif !== false, note: body.note ?? null },
            { onConflict: 'produit' })
        if (e1) return res.status(200).json({ error: e1.message })
        return res.status(200).json({ ok: true })
      }
      const { data, error: e2 } = await sb.from('annexe_mise_en_forme')
        .select('produit, note').eq('actif', true).limit(500)
      if (e2) return res.status(200).json({ error: e2.message })
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ produits: (data || []).map(x => x.produit) })
    }

    // Ce qui reste à mettre en forme — l'onglet « À finir ».
    //
    // ⚠️ LA PASTILLE NE PAIE PAS LE PRIX FORT. Ce calcul demande six secondes à
    // froid (stocks, journal, ordres), et la barre le relance à chaque
    // changement d'écran. On garde donc le résultat une minute POUR ELLE.
    // L'écran, lui, demande toujours du frais (`&frais=1`) : après un
    // dispatch, la ligne doit disparaître tout de suite, pas dans une minute.
    if (req.query.afinir) {
      res.setHeader('Cache-Control', 'no-store')
      const frais = req.query.frais === '1'
      const vracs = frais
        ? await aFinir(sb)
        : await memo('afinir', () => aFinir(sb), 60000)
      return res.status(200).json({ vracs })
    }

    // ============================================================
    // LES FEUILLES DE FOURNÉE : imprimée → donnée → déclarée.
    //
    // « Les pâtissiers impriment, prennent les ingrédients, font les recettes,
    // mais ne déclarent pas » (Layla, 2026-09-19). Sa règle, et c'est la bonne :
    // imprimer n'engage à rien — on peut imprimer et ne jamais venir chercher.
    // **C'est le moment où l'économe DONNE qui engage.**
    //
    // ⚠️ TOUT PASSE PAR ICI, avec la clé de service. La page du QR s'ouvre SANS
    // connexion (les mains sont farineuses), donc elle ne doit jamais parler à
    // Supabase en direct : le jeton est vérifié ici, et nulle part ailleurs.
    // ============================================================
    if (req.query.feuille || req.query.feuilles) {
      const F = 'id, jour, produit, libelle, unite, qty_prevue, pour, chemin, liasse,'
        + ' sans_economat, imprime_par, imprime_le, donne_par, donne_le, declare_le,'
        + ' declare_qty, retour_le, retour_par, pas_faite_le, motif'
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

      // Toutes les feuilles du jour : « à donner » chez l'économe, « à
      // déclarer » chez les pâtissiers. Les deux écrans lisent la même liste.
      if (req.query.feuilles === 'jour') {
        // ⚠️ PAS SEULEMENT AUJOURD'HUI. Une dette qui s'efface à minuit, c'est
        // l'inverse du but : elle doit être réclamée, pas oubliée. Et une
        // fournée commencée le soir se finit le lendemain — la règle de Layla
        // (11/09) vaut ici aussi. On remonte donc une semaine.
        const bord = new Date(Date.now() - 7 * 86400000).toLocaleDateString('sv-SE')
        const { data, error } = await sb.from('annexe_feuilles').select(F)
          .gte('jour', bord).order('imprime_le', { ascending: false }).limit(1000)
        if (error) return res.status(200).json({ error: error.message })
        const feuilles = data || []

        // ⚠️ SEULEMENT SI ON LE DEMANDE (`&demandes=1`), et seulement pour ce
        // qui attend encore l'économe. Cette lecture passe par les recettes
        // d'Odoo : la faire à chaque appel ralentirait la pastille et les deux
        // écrans, qui n'en ont pas besoin.
        if (req.query.demandes === '1') {
          const { data: cat } = await sb.from('fab_annexe_articles').select('produit, achete')
          const achetes = new Set((cat || []).filter(a => a.achete).map(a => a.produit))
          const cache = creerCache()
          const attendent = feuilles.filter(f =>
            !f.donne_le && !f.sans_economat && !f.declare_le && !f.pas_faite_le && !f.retour_le)
          for (const f of attendent) {
            try {
              f.demande = await demandeEconomat(cache, f.produit, f.qty_prevue, achetes)
            } catch { /* recette illisible : la ligne garde juste son nom */ }
          }
        }
        return res.status(200).json({ feuilles })
      }

      // ⚠️ LA MÊME FOURNÉE NE SE DÉCLARE PAS DEUX FOIS. L'écran « c'est fait »
      // existait avant le QR, et les pâtissiers le connaissent : sans ce
      // raccord, une fournée déclarée à l'écran restait rouge dans « À
      // déclarer », et la redéclarer comptait le travail DEUX FOIS — deux
      // ordres Odoo, deux fois le stock. C'est l'écran qui éteint la ligne.
      if (req.method === 'POST' && req.query.feuilles === 'eteindre') {
        const bord = new Date(Date.now() - 7 * 86400000).toLocaleDateString('sv-SE')
        const { data: due } = await sb.from('annexe_feuilles').select('id')
          .eq('produit', String(body.produit || '')).gte('jour', bord)
          .is('declare_le', null).is('pas_faite_le', null)
          .order('imprime_le', { ascending: true }).limit(1)
        if (!due || !due.length) return res.status(200).json({ ok: true, eteintes: 0 })
        const { error } = await sb.from('annexe_feuilles').update({
          declare_le: new Date().toISOString(),
          declare_qty: Number(body.qty) || null,
          fabrication_id: body.fabricationId || null,
        }).eq('id', due[0].id)
        if (error) return res.status(200).json({ error: error.message })
        return res.status(200).json({ ok: true, eteintes: 1 })
      }

      // On vient d'imprimer : on pose les feuilles. Rien n'est dû encore.
      // ⚠️ Les `id` sont fabriqués par le navigateur AVANT l'impression, pour
      // que le QR parte sur le papier sans attendre le serveur — l'aperçu
      // d'impression est déjà assez long comme ça.
      if (req.method === 'POST' && req.query.feuilles === 'imprimees') {
        const lignes = (body.feuilles || []).slice(0, 60).map(f => ({
          id: f.id,
          produit: f.produit,
          libelle: f.libelle || null,
          unite: f.unite || null,
          qty_prevue: Number(f.qty) || null,
          pour: f.pour || null,
          imprime_par: body.userId || null,
          // ⚠️ RIEN À DEMANDER NE VEUT PAS DIRE DUE TOUT DE SUITE (Layla,
          // 2026-09-19). La tarte ne demande rien elle-même, mais on ne la
          // monte pas tant que sa crème n'a pas été servie. On note seulement
          // la question ; c'est `aDeclarer` qui décide, en regardant la
          // cascade entière.
          sans_economat: !!f.sansEconomat,
          // ⚠️ LE CHEMIN ENTIER, pas seulement le nom : une crème n'est pas au
          // catalogue des articles suivis, elle ne s'ouvre qu'en DESCENDANT
          // depuis son gâteau. Sans lui, le scan retombait sur l'accueil.
          chemin: Array.isArray(f.chemin) && f.chemin.length ? f.chemin : null,
          liasse: body.liasse || null,
        }))
        if (!lignes.length) return res.status(200).json({ ok: true, posees: 0 })
        const { error } = await sb.from('annexe_feuilles').insert(lignes)
        if (error) return res.status(200).json({ error: error.message })

        // ⚠️ RÉIMPRIMER REMPLACE, ça ne double pas. Le papier sort mal, on
        // change la quantité, on relance : sans ça, chaque impression créait
        // une dette de plus, et celle qu'on ne déclarait pas restait rouge à
        // vie. La feuille d'avant est donc close, et son vieux QR le dira.
        //
        // ⚠️ Mais SEULEMENT la même fournée : même article, même jour, ET même
        // gâteau. La crème du 20 cm et celle du 23 cm sont deux vrais travaux,
        // imprimés séparément — les confondre effacerait une dette réelle.
        //
        // ⚠️ MAIS JAMAIS UNE FEUILLE DÉJÀ SERVIE (Layla, 2026-09-21 : « je veux
        // rajouter dans une quantité d'article déjà donné »). La marchandise
        // est sortie de la réserve : fermer son papier, c'est effacer la trace
        // de ce qui a été donné, et le compte de la fiche repartait du seul
        // complément. Les deux papiers cohabitent, et la fiche les additionne.
        const remplacee = { pas_faite_le: new Date().toISOString(), motif: 'remplacee' }
        for (const l of lignes) {
          let q = sb.from('annexe_feuilles').update(remplacee)
            .eq('produit', l.produit).eq('jour', new Date().toLocaleDateString('sv-SE'))
            .neq('id', l.id).is('declare_le', null).is('pas_faite_le', null)
            .is('donne_le', null)
          q = l.pour ? q.eq('pour', l.pour) : q.is('pour', null)
          await q
        }
        return res.status(200).json({ ok: true, posees: lignes.length })
      }

      // À partir d'ici, on parle D'UNE feuille — celle du QR.
      const id = String(req.query.feuille || '')
      const { data: feuille, error: eLire } = await sb.from('annexe_feuilles')
        .select(F).eq('id', id).maybeSingle()
      if (eLire) return res.status(200).json({ error: eLire.message })
      if (!feuille) return res.status(404).json({ error: 'Cette feuille n\'existe pas (ou plus).' })

      if (req.method !== 'POST') return res.status(200).json({ feuille })

      // L'ÉCONOME DONNE. Le geste qui rend la déclaration due.
      if (req.query.mode === 'donner') {
        // ⚠️ UNE FOURNÉE DÉJÀ DÉCLARÉE NE SE ROUVRE JAMAIS : c'est du travail
        // fait, et le redonner le compterait deux fois.
        if (feuille.declare_le) {
          return res.status(200).json({ feuille, refus: 'Cette fournée a déjà été déclarée.' })
        }
        // Une feuille REMPLACÉE par une impression plus récente reste morte :
        // le bon papier est ailleurs.
        if (feuille.pas_faite_le && feuille.motif === 'remplacee') {
          return res.status(200).json({
            feuille,
            refus: 'Cette feuille a été remplacée par une impression plus récente — prends le dernier papier.',
          })
        }
        // ⚠️ « Déjà donné » ne vaut QUE si rien n'est en cours de retour (Layla,
        // 2026-09-20 : « j'ai scanné les trois articles donnés, mais la cascade
        // ne s'affiche pas »). Une feuille rendue par le pâtissier et pas
        // encore récupérée est TOUJOURS marquée donnée : elle tombait donc
        // ici, l'économe s'entendait répondre « c'est déjà donné », et rien ne
        // repartait — ni le retour annulé, ni la cascade relevée.
        if (feuille.donne_le && !feuille.pas_faite_le && !feuille.retour_le) {
          return res.status(200).json({ feuille, deja: true })
        }
        // ⚠️ LA BOUCLE SE RELANCE AVEC LE MÊME QR (Layla, 2026-09-20 : « le
        // pâtissier peut redonner cette même marchandise et la boucle se
        // relance avec le même QR code »). Une marchandise rendue puis
        // ressortie, c'est le même papier, la même fournée : on repart de zéro
        // sur cette ligne plutôt que d'obliger à réimprimer.
        //
        // ⚠️ On efface TOUT l'ancien passage (le retour ET la clôture). C'est
        // l'oubli de ce ménage qui avait rendu une feuille « donnée ET close »
        // — visible nulle part (2026-09-20, plus tôt dans la journée).
        // ⚠️ UNE FEUILLE À LA FOIS, ET SEULEMENT CELLE-LÀ (Layla, 2026-09-19 :
        // « l'économe doit scanner feuille par feuille, sinon ça dit qu'il a
        // donné toute la matière »). J'avais fait l'inverse une heure plus tôt,
        // pour lui épargner des gestes : c'était écrire qu'il avait sorti des
        // matières premières qu'il n'avait pas sorties. Un registre qui ment
        // sur la marchandise ne vaut rien.
        const { data, error } = await sb.from('annexe_feuilles')
          .update({
            donne_le: new Date().toISOString(), donne_par: body.userId || null,
            retour_le: null, retour_par: null, pas_faite_le: null, motif: null,
          })
          .eq('id', id).select(F).single()
        if (error) return res.status(200).json({ error: error.message })

        // ⚠️ ET LA CASCADE REVIENT AVEC (Layla, 2026-09-20 : « quand je redonne
        // une deuxième fois, toute la cascade doit revenir comme au début »).
        // On ne relève QUE ce qui était tombé par ricochet — le gâteau et les
        // articles mère, fermés avec le motif « cascade-rendue » parce qu'ils
        // n'avaient aucune marchandise à rendre.
        //
        // ⚠️ Ce qui portait de la VRAIE matière, lui, attend son propre scan :
        // relever ces lignes-là, ce serait écrire que l'économe a ressorti une
        // marchandise qu'il n'a pas ressortie — la faute qu'elle m'avait déjà
        // fait corriger ce matin.
        if (feuille.liasse) {
          await sb.from('annexe_feuilles')
            .update({ pas_faite_le: null, motif: null, retour_le: null, retour_par: null })
            .eq('liasse', feuille.liasse).neq('id', id)
            .eq('motif', 'cascade-rendue').is('declare_le', null)
        }

        // En revanche, on lui dit ce qui l'attend encore pour CE gâteau — sans
        // rien cocher à sa place. C'est tout ce à quoi sert la liasse.
        let reste = 0
        if (feuille.liasse) {
          const { count } = await sb.from('annexe_feuilles')
            .select('id', { count: 'exact', head: true })
            .eq('liasse', feuille.liasse)
            .is('donne_le', null).is('declare_le', null).is('pas_faite_le', null)
          reste = count || 0
        }
        return res.status(200).json({ feuille: data, reste })
      }

      // LE PÂTISSIER REND LA MARCHANDISE. Il est le seul à savoir qu'il ne
      // fera pas cette fournée — « c'est le pâtissier qui décide » (Layla,
      // 2026-09-20). La ligne quitte « À déclarer » et va attendre dans
      // l'onglet de l'économe, qui seul pourra la clore.
      if (req.query.mode === 'rendre') {
        if (feuille.declare_le) {
          return res.status(200).json({ feuille, refus: 'Cette fournée a déjà été déclarée.' })
        }
        const quand = { retour_le: new Date().toISOString(), retour_par: body.userId || null }

        // ⚠️ LA CASCADE TOMBE AVEC (Layla, 2026-09-20 : « qu'allons-nous faire
        // avec les articles mère ? »). Elle a été imprimée pour UN gâteau :
        // sans sa crème, ni la génoise ni le cadre n'ont de sens aujourd'hui.
        // Sans ça, le pâtissier gardait dans « À déclarer » un gâteau que le
        // verrou l'empêchait de déclarer — une ligne qui réclame sans qu'on
        // puisse rien en faire.
        //
        // Deux sorts, selon ce qui a vraiment quitté la réserve :
        //   • ce que l'économe A DONNÉ part EN RETOUR : il doit le récupérer ;
        //   • ce qu'il n'a jamais donné se ferme tout court — il n'a rien à
        //     recevoir, et lui montrer un retour fantôme serait un mensonge.
        // Ce qui est DÉJÀ DÉCLARÉ ne bouge pas : c'est du travail fait.
        if (body.toute && feuille.liasse) {
          await sb.from('annexe_feuilles').update(quand)
            .eq('liasse', feuille.liasse).neq('id', id)
            .is('declare_le', null).is('pas_faite_le', null).is('retour_le', null)
            .not('donne_le', 'is', null)
          await sb.from('annexe_feuilles')
            .update({ pas_faite_le: new Date().toISOString(), motif: 'cascade-rendue' })
            .eq('liasse', feuille.liasse).neq('id', id)
            .is('declare_le', null).is('pas_faite_le', null).is('retour_le', null)
            .is('donne_le', null)
        }

        const { data, error } = await sb.from('annexe_feuilles')
          .update(quand).eq('id', id).select(F).single()
        if (error) return res.status(200).json({ error: error.message })
        return res.status(200).json({ feuille: data })
      }

      // L'ÉCONOME CONFIRME AVOIR RÉCUPÉRÉ. Le seul geste qu'il puisse honnêtement
      // poser : la marchandise est revenue dans sa réserve. La ligne se ferme.
      if (req.query.mode === 'retour-recu') {
        const { data, error } = await sb.from('annexe_feuilles')
          .update({ pas_faite_le: new Date().toISOString(), motif: 'retournee' })
          .eq('id', id).select(F).single()
        if (error) return res.status(200).json({ error: error.message })
        return res.status(200).json({ feuille: data })
      }

      // « PAS FAITE » — une réponse valable, et il en faut une : sans porte de
      // sortie, ils cesseraient de passer par l'économe, et on perdrait la
      // trace qu'on cherche à construire.
      if (req.query.mode === 'pas-faite') {
        const { data, error } = await sb.from('annexe_feuilles')
          .update({ pas_faite_le: new Date().toISOString(), motif: (body.motif || '').slice(0, 200) || null })
          .eq('id', id).select(F).single()
        if (error) return res.status(200).json({ error: error.message })
        return res.status(200).json({ feuille: data })
      }

      // ⚠️ IL N'Y A PLUS DE DÉCLARATION ICI (Layla, 2026-09-20). Cette page
      // savait déclarer toute seule : c'était une deuxième comptabilité, plus
      // pauvre que l'écran « c'est fait » — sans les cuves, sans le pressage,
      // sans le verrou des composants, sans le reste de la crème — et la
      // garantie de compter deux fois le même travail. Le QR emmène désormais
      // à l'écran, et c'est lui qui éteint la ligne (`feuilles=eteindre`).

      return res.status(400).json({ error: 'action inconnue' })
    }

    // ⚠️ AVANT tout ce qui lit une recette : si quelqu'un a appuyé sur
    // « mettre à jour les recettes », cette copie doit oublier les siennes.
    await alignerRecettes(sb)

    // Le bouton « mettre à jour les recettes » : on avance le top départ, et
    // toutes les copies du serveur relisent Odoo au prochain appel.
    if (req.method === 'POST' && req.query.mode === 'relire-recettes') {
      const v = String(Date.now())
      const { error: e } = await sb.from('app_config')
        .upsert({ key: CLE_VERSION, value: v, updated_at: new Date().toISOString() },
          { onConflict: 'key' })
      if (e) return res.status(200).json({ error: 'Impossible d\'enregistrer : ' + e.message })
      _recettes.clear()
      _versionVue = v
      return res.status(200).json({ ok: true })
    }

    // Le cron d'atelier appelle `?details=1` toutes les 10 minutes. Qu'il
    // réchauffe AUSSI le squelette de « Déclarer » : sans ça, la première
    // personne à ouvrir l'onglet payait ses quatre secondes toutes les demi-
    // heures. Ça ne coûte rien — c'est la même invocation, après la réponse.
    if (req.query.details) {
      const p = Promise.resolve(squeletteTout()).catch(e => console.warn('[tout]', e?.message || e))
      try { waitUntil(p) } catch { /* pas de contexte Vercel */ }
    }

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
        // `prevu` : le nombre pour lequel la cuve a été préparée.
        ordres: await repartir(creerCache(), cat || [], lance, body.quantites || {},
          Number(body.prevu) || 0),
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
    //
    // Le journal dit ce que l'atelier a DÉJÀ déclaré : « quand je clique c'est
    // fait, c'est considéré comme si c'était validé dans Odoo, comme ça les
    // pâtissiers peuvent continuer à bosser avant la validation finale »
    // (Layla, 2026-09-11). Le stock Odoo, lui, ne monte qu'à la validation.
    //
    // ⚠️ Sur SEPT JOURS, pas seulement aujourd'hui : une fournée faite hier
    // soir et pas encore validée existe bel et bien ce matin — la compter pour
    // zéro, c'était la faire refaire. Même fenêtre que « À valider Annexe ».
    // Ce qui a été validé (ou annulé) ne compte plus : `clos` s'en charge,
    // sinon la production compterait DEUX fois.
    //
    // ⚠️ `pour` peut ne pas exister encore (SQL `fab_prod_pour.sql` pas lancé) :
    // on retombe sur l'ancienne lecture plutôt que de perdre TOUT le journal.
    const depuis = new Date(jour + 'T12:00:00')
    depuis.setDate(depuis.getDate() - 6)
    const lireFaits = async () => {
      const ou = c => sb.from('prod_fabrications').select(c)
        .gte('jour', depuis.toLocaleDateString('sv-SE')).eq('atelier', 'annexe')
        .limit(5000)
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
          dejaFait, dejaFaitLe: declare.quand?.[a.produit] || null,
          reste, urgence: urgence(a, stock, dejaFait),
          etat: stock <= 0 ? 'rupture' : 'refaire',
        })
        continue
      }

      // Ce que la recette Odoo sort d'un coup, dans l'unité de l'article : le
      // repli quand le catalogue ne décide pas de fournée (voir `fourneeFiche`).
      const bomFiche = await bomDe(cache, p)
      const fournee = fourneeFiche(a.tournee, uniteDe(p),
        bomFiche && versUnite(bomFiche.product_qty || 1, bomFiche.product_uom_id?.[1], p.uom_id?.[1]))

      // Ses composants, eux, ne voient QUE ce qui est libre et ce qui lui est
      // réservé : la ganache faite pour le 23 cm ne dispense pas le 18 cm.
      const composants = await composantsDe(cache, p, fournee, a.figes || [], 0, [], lots, achetes,
        disponiblePour(declare, a.produit))
      // Une CUVE, c'est ce qui ne se divise pas : les figés réglés pour
      // l'article, ou n'importe quelle mousse — même quand elle a son propre
      // article et qu'on ne l'a jamais cochée. (Layla, 2026-09-10 : « branche-la
      // à tous les articles avec des mousses ».)
      const aUneCuve = (a.figes || []).length > 0 || composants.some(c => c.fige)

      // ⚠️ UNE DÉCOUPE OUVERTE SEULE RESTE UNE DÉCOUPE (Layla, 2026-09-21 :
      // « biscuit à la cuillère en stock, je veux le couper en 10 pers,
      // comment faire ? » — puis « je ne le vois pas »).
      //
      // `decoupeDe` réclame deux choses que seuls les COMPOSANTS recevaient :
      // ce qu'une tournée sort (`tourneeTaille`) et la ligne de recette. En
      // descendant depuis le tiramisu, l'écran proposait bien « combien de
      // plaques cuites » puis « à couper » par paliers ; en ouvrant le même
      // article depuis « Déclarer », on tombait sur une fiche ordinaire — et il
      // n'y avait AUCUN moyen de couper une plaque déjà au congélateur.
      //
      // ⚠️ On ne pose la recette QUE si elle tient en une ligne — le cas de la
      // découpe. Sinon l'écran afficherait deux fois les matières premières :
      // une fois en composants, une fois en « à peser ».
      const lignesFiche = bomFiche ? lignesPour(bomFiche, p) : []
      if (lignesFiche.length === 1) {
        const l0 = lignesFiche[0]
        const c0 = await produitParNom(cache, sansRef(l0.product_id[1]))
        if (c0) {
          const parRecette = versUnite(bomFiche.product_qty || 1,
            bomFiche.product_uom_id?.[1], p.uom_id?.[1]) || 1
          a.tourneeTaille = lots[a.produit] || parRecette
          a.recette = [{
            produit: sansRef(l0.product_id[1]),
            qty: versUnite(l0.product_qty, l0.product_uom_id[1], c0.uom_id[1]),
            unite: uniteDe(c0),
          }]
        }
      }

      articles.push({
        produit: a.produit,
        libelle: a.libelle || a.produit,
        // Même règle que la liste : à défaut de photo à lui, celle de son
        // gâteau. On ne retombe sur son propre nom qu'en dernier recours.
        photo: a.photo || gateauDe(a.produit) || a.produit,
        unite: uniteDe(p),
        stock, mini: a.mini, maxi: a.maxi, tournee: fournee,
        // ⚠️ QUAND LA DERNIÈRE FOURNÉE A ÉTÉ DÉCLARÉE. La fiche s'en sert pour
        // demander « tu en as fait une deuxième ? » (Layla, 2026-09-21 : « j'ai
        // peur que le pâtissier fasse que cliquer sans réfléchir »). La liste
        // l'avait déjà ; la fiche, non.
        dejaFaitLe: declare.quand?.[a.produit] || null,
        // Posés juste au-dessus, et seulement pour une découpe.
        ...(a.tourneeTaille ? { tourneeTaille: a.tourneeTaille, recette: a.recette } : {}),
        dejaFait, reste, urgence: urgence(a, stock, dejaFait),
        etat: stock <= 0 ? 'rupture' : 'refaire',
        figes: a.figes || [],
        figesNom: a.figes_nom || 'Monté sur place',
        ajustements: ajustementsFiges(bomFiche, p, a.figes || [], fournee, composants),
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

    // ⚠️ DU PLUS URGENT AU MOINS URGENT. Ce qui est à zéro d'abord, puis ce
    // qui s'en approche — et à égalité, le plus gros manque passe devant.
    // L'ordre alphabétique d'avant ne voulait rien dire pour l'atelier.
    articles.sort((x, y) =>
      (x.urgence ?? 1) - (y.urgence ?? 1)
      || (y.reste || 0) - (x.reste || 0)
      || String(x.libelle || x.produit).localeCompare(String(y.libelle || y.produit), 'fr'))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ articles })
  } catch (e) {
    console.error('[fab-annexe]', e)
    return res.status(500).json({ error: e.message })
  }
}
