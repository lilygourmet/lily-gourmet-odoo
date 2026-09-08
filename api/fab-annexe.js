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

export function creerCache() {
  return { produits: new Map(), boms: new Map(), stocks: null }
}

const CHAMPS_PRODUIT = ['id', 'name', 'display_name', 'uom_id', 'product_tmpl_id',
  'product_template_attribute_value_ids']
const net = t => String(t || '').replace(/^\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * L'article, par son nom.
 *
 * ⚠️ Un article À PARFUMS porte le MÊME `name` pour toutes ses variantes : les
 * six « SM- 20 cm Vitrine » s'appellent pareil, seul leur display_name dit
 * (Citron) / (Praliné Amandes caramélisées) / … Le catalogue peut donc nommer
 * soit l'article simple, soit une variante précise — on essaie les deux.
 */
export function produitParNom(cache, nom) {
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
function ajustementsFiges(bom, produit, figes, tournee) {
  const facteur = tournee / (bom.product_qty || 1)
  const par = new Map()
  for (const l of lignesPour(bom, produit)) {
    const nom = l.product_id[1]
    if (!figes.includes(nom)) continue
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
export async function composantsDe(cache, produit, quantite, figes, profondeur = 0, vus = [], lots = {}, achetes = new Set()) {
  const bom = await bomDe(cache, produit)
  // Une recette qui se contiendrait elle-même tournerait sans fin : on ne
  // redescend jamais dans un article déjà croisé plus haut.
  if (!bom || profondeur >= PROFONDEUR_MAX || vus.includes(produit.id)) return []
  const chemin = [...vus, produit.id]

  // Combien de fois la recette, pour obtenir `quantite`.
  const facteur = quantite / (bom.product_qty || 1)

  // Le stock de tous les composants d'un coup.
  const lignes = lignesPour(bom, produit)
  const ids = lignes.map(l => l.product_id[0])
  const stocks = await stocksDe(ids)

  const out = await Promise.all(lignes.map(async l => {
    const nom = l.product_id[1]
    const p = await produitParNom(cache, nom)
    if (!p) return null

    const besoin = versUnite(l.product_qty, l.product_uom_id[1], p.uom_id[1]) * facteur
    const stock = stocks[p.id] || 0
    const sousBom = achetes.has(nom) ? null : await bomDe(cache, p)
    const fabrique = !!sousBom
    const fige = figes.includes(nom)

    // Un ingrédient ACHETÉ ne bloque jamais : le pâtissier ne peut pas
    // fabriquer du sucre, et le stock des matières premières à l'annexe n'est
    // pas tenu à jour (47 tonnes de sucre, une gélatine à −9…). Le laisser
    // bloquer, c'est un mur dont personne ne sort.
    //
    // Être FIGÉ n'exempte pas : ça dit seulement que la quantité ne suit pas la
    // sortie réelle. La mousse du tiramisu ne bloque pas parce qu'elle est faite
    // de matières premières achetées ; la crème au beurre praliné du suprême
    // amandes, elle, est figée ET se fabrique — il faut la faire d'abord.
    const ok = !fabrique || stock >= besoin

    // Plus bas que l'article de tête, la recette complète est déjà affichée
    // telle quelle : inutile de répéter ses matières premières ici. Mais à la
    // tête, rien ne doit manquer — l'eau du robinet fait partie de la recette,
    // le pâtissier doit la voir pour la faire.
    if (profondeur > 0 && !fige && !fabrique) return null

    const c = { produit: nom, unite: uniteDe(p), besoin, stock, fabrique, fige, ok }

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
      c.tournees = Math.max(1, Math.ceil((besoin - stock) / parTournee))
      c.produira = c.tournees * parTournee
      // ⚠️ Quand le catalogue impose une autre taille de tournée que la recette
      // Odoo, les INGRÉDIENTS doivent suivre. Sinon l'écran annonçait « 5 000 g
      // de confit » au-dessus des quantités d'une recette de 568 g.
      const ech = parRecette ? parTournee / parRecette : 1
      c.recette = lignesPour(sousBom, p).map(x => ({
        produit: x.product_id[1],
        qty: Math.round(x.product_qty * ech * 1000) / 1000,
        unite: x.product_uom_id[1],
      }))
      c.enfants = await composantsDe(cache, p, c.produira, [], profondeur + 1, chemin, lots, achetes)
    }
    return c
  }))
  return out.filter(Boolean)
}

/**
 * Une taille de la même recette, vue depuis la tournée : ce qu'elle consomme
 * PAR PIÈCE. La quantité, elle, n'est connue qu'à la fin — quand le pâtissier
 * dit ce qu'il a monté.
 *
 * - `figesParPiece` : la part de mousse d'une pièce, dans l'unité de la ligne
 *   de recette. Sert à répartir la cuve entre les tailles montées.
 * - `fabriquesParPiece` : ce qu'il faut avoir par pièce (le biscuit de CETTE
 *   taille-là), avec son stock. Sert au contrôle de fin de tournée.
 */
async function detailTaille(cache, a) {
  const p = await produitParNom(cache, a.produit)
  if (!p) return null
  const bom = await bomDe(cache, p)
  if (!bom) return null
  const parRecette = bom.product_qty || 1
  const figes = a.figes || []

  const figesParPiece = {}
  const fabriques = []
  for (const l of lignesPour(bom, p)) {
    const nom = l.product_id[1]
    const q = l.product_qty / parRecette
    if (figes.includes(nom)) {
      figesParPiece[nom] = (figesParPiece[nom] || 0) + q
      continue
    }
    const c = await produitParNom(cache, nom)
    if (!c || !(await bomDe(cache, c))) continue        // acheté : rien à contrôler
    fabriques.push({ produit: nom, unite: uniteDe(c), id: c.id,
      parPiece: versUnite(l.product_qty, l.product_uom_id[1], c.uom_id[1]) / parRecette })
  }

  const stocks = await stocksDe([p.id, ...fabriques.map(f => f.id)])
  return {
    produit: a.produit, libelle: a.libelle || a.produit, rang: a.rang || 1,
    unite: uniteDe(p), stock: stocks[p.id] || 0, tournee: a.tournee,
    figesParPiece,
    fabriques: fabriques.map(f => ({ produit: f.produit, unite: f.unite,
      parPiece: f.parPiece, stock: stocks[f.id] || 0 })),
  }
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
        if (!(a.figes || []).includes(nom)) continue
        const c = await produitParNom(cache, nom)
        if (!c) continue
        uniteArticle[nom] = c.uom_id[1]
        const e = out[nom] || { ligne: 0, unite: l.product_uom_id[1] }
        e.ligne += versUnite(l.product_qty, l.product_uom_id[1], e.unite) / (bom.product_qty || 1)
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
      ajustements[nom] = Math.max(0, Math.round(versUnite(v, uniteArticle[nom], e.unite) * 1000) / 1000)
    }
    const p = await produitParNom(cache, produit)
    out.push({ produit, qty, unite: uniteDe(p), ajustements, lance: produit === lance.produit })
  }
  return out
}

// La vignette fait 56 pixels de côté : l'image 512 d'Odoo pesait jusqu'à
// 312 Ko pour rien. On prend la 256, et on retombe sur la 512 si elle manque.
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
    const voulus = seul ? (catalogue || []).filter(a => a.produit === seul) : (catalogue || [])

    // Les produits et LEURS STOCKS d'un coup — deux requêtes Odoo, que le
    // catalogue en compte cinq ou deux cents. C'est tout ce dont la liste a
    // besoin ; les recettes ne se chargent qu'à l'ouverture d'un article.
    const prods = await Promise.all(voulus.map(a => produitParNom(cache, a.produit)))
    const stocks = await stocksDe(prods.filter(Boolean).map(p => p.id))

    for (let i = 0; i < voulus.length; i++) {
      const a = voulus[i]
      const p = prods[i]
      if (!p) { articles.push({ ...a, absent: true }); continue }
      const stock = stocks[p.id] || 0

      // Au-dessus du mini, l'article n'a rien à dire : il ne sort pas.
      // ⚠️ Sauf s'il est à ZÉRO : un mini à 0 (le caramel) veut dire « ne me
      // montre que si je n'en ai plus » — et « 0 >= 0 » l'aurait masqué même
      // en rupture.
      if (!seul && stock >= a.mini && stock > 0) continue

      // La liste n'affiche que l'état : ni recette, ni cascade, ni tailles.
      if (!seul) {
        articles.push({
          produit: a.produit, libelle: a.libelle || a.produit, photo: a.photo,
          unite: uniteDe(p), stock, mini: a.mini, maxi: a.maxi, tournee: a.tournee,
          etat: stock <= 0 ? 'rupture' : 'refaire',
        })
        continue
      }

      articles.push({
        produit: a.produit,
        libelle: a.libelle || a.produit,
        photo: a.photo || a.produit,
        unite: uniteDe(p),
        stock, mini: a.mini, maxi: a.maxi, tournee: a.tournee,
        etat: stock <= 0 ? 'rupture' : 'refaire',
        figes: a.figes || [],
        figesNom: a.figes_nom || 'Monté sur place',
        ajustements: ajustementsFiges(await bomDe(cache, p), p, a.figes || [], a.tournee),
        // Les tailles où la cuve peut finir : la sienne et les PLUS PETITES.
        // D'un 10 pers on descend en 5 pers et en individuels ; d'un 5 pers on
        // ne remonte jamais en 10.
        tailles: a.famille
          ? (await Promise.all((catalogue || [])
              .filter(x => x.famille === a.famille && (x.rang || 1) <= (a.rang || 1))
              .sort((x, y) => (y.rang || 1) - (x.rang || 1))
              .map(x => detailTaille(cache, x)))).filter(Boolean)
          : [],
        composants: await composantsDe(cache, p, a.tournee, a.figes || [], 0, [], lots, achetes),
      })
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ articles })
  } catch (e) {
    console.error('[fab-annexe]', e)
    return res.status(500).json({ error: e.message })
  }
}
