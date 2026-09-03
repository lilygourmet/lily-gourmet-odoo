// api/catalog-from-odoo.js
// V2 — récupère TOUTES les variantes vendables (sale_ok=true, active=true)
// dans les 8 catégories E-/GS-/V-/MI-/SU-/RA-/H-/N-, même celles à stock 0.
//
// GET /api/catalog-from-odoo
//   → public (appelé par tous les utilisateurs Vitrine/Réception/Soir)
//   → cache CDN 5min

async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const body = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service, method, args },
    id: Date.now(),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.error) {
    throw new Error(`Odoo RPC error: ${data.error.data?.message || data.error.message}`)
  }
  return data.result
}

// uid Odoo fixe (mot de passe renvoyé à chaque requête) → gardé en mémoire pour ne pas se reconnecter à chaque appel.
let _odooUid = null
async function odooAuthenticate() {
  if (_odooUid) return _odooUid
  const uid = await odooJsonRpc('common', 'login', [
    process.env.ODOO_DB,
    process.env.ODOO_USERNAME,
    process.env.ODOO_PASSWORD,
  ])
  if (!uid) throw new Error('Odoo auth failed')
  _odooUid = uid
  return uid
}

// Regroupement Odoo : bien plus léger qu'un search_read quand on ne veut que la
// LISTE des produits concernés (une ligne par produit au lieu de tous les mouvements).
async function odooReadGroup(uid, model, domain, fields, groupby, opts = {}) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
    model, 'read_group',
    [domain, fields, groupby],
    { lazy: false, ...opts },
  ])
}

async function odooEcrire(uid, model, method, args, kwargs = {}) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, method, args, kwargs,
  ])
}

async function odooSearchRead(uid, model, domain, fields, opts = {}) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
    model, 'search_read',
    [domain, fields],
    opts,
  ])
}

const CATEGORIES = [
  { id: 'E-',  emoji: '🍰', label: 'Entremets' },
  { id: 'GS-', emoji: '🍪', label: 'Sec' },
  { id: 'V-',  emoji: '🥐', label: 'Vienn.' },
  { id: 'MI-', emoji: '🧁', label: 'Mignard.' },
  { id: 'SU-', emoji: '🥟', label: 'Salés' },
  { id: 'RA-', emoji: '🌙', label: 'Ramadan' },
  { id: 'H-',  emoji: '🎃', label: 'Halloween' },
  { id: 'N-',  emoji: '🎄', label: 'Noël' },
]

function cleanName(name) {
  if (!name) return ''
  return name.replace(/^\[\d+\]\s*/, '').trim()
}

function detectPrefix(name) {
  if (!name) return null
  const c = cleanName(name).toUpperCase()
  for (const cat of CATEGORIES) {
    if (c.startsWith(cat.id)) return cat.id
  }
  return null
}

function extractSize(name) {
  if (!name) return null
  const m = cleanName(name).match(/\((\d+)\)\s*$/)
  return m ? parseInt(m[1], 10) : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  // Mode économat : produits achetables MP-/P- (fusionné ici pour rester sous la
  // limite de fonctions Vercel). GET /api/catalog-from-odoo?economat=1[&q=][&ids=]
  if (req.query.economat) return handleEconomat(req, res)
  // Recherche d'un produit à AJOUTER dans les onglets Transferts (MP / Produits SM).
  // GET /api/catalog-from-odoo?transferts=1&q=...  (limite de 12 fonctions Vercel)
  if (req.query.transferts) return handleTransferts(req, res)

  // Mode stock prod : articles SM- + stock à un lieu donné (vitrine/annexe).
  // GET /api/catalog-from-odoo?stockProd=vitrine|annexe
  if (req.query.stockProd) return handleStockProd(req, res)

  // Porte le comptage dans Odoo, en inventaire À APPLIQUER (POST).
  if (req.query.inventaireOdoo) return handleInventaireOdoo(req, res)

  // Liste à compter pour l'onglet « Inventaire annexe » (?inventaire=1).
  if (req.query.inventaire) return handleInventaire(req, res)

  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo env vars manquantes)' })
    }

    const uid = await odooAuthenticate()

    // 1) Récupérer TOUTES les variantes vendables matchant nos préfixes
    const prefixDomain = []
    for (let i = 0; i < CATEGORIES.length - 1; i++) prefixDomain.push('|')
    for (const cat of CATEGORIES) {
      prefixDomain.push(['name', '=ilike', cat.id + '%'])
    }
    const domain = [
      ['sale_ok', '=', true],
      ['active', '=', true],
      ...prefixDomain,
    ]

    const variants = await odooSearchRead(
      uid,
      'product.product',
      domain,
      ['id', 'name', 'display_name', 'barcode', 'product_tmpl_id', 'image_128'],
      { limit: 2000 }
    )

    // 2) Templates (sequence + image fallback) + 3) Quants : tous deux ne dépendent
    //    QUE des variantes (pas l'un de l'autre) → on les récupère EN PARALLÈLE.
    const tmplIds = [...new Set(variants
      .map(v => Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null)
      .filter(Boolean))]
    const locationName = process.env.ODOO_STOCK_LOCATION_NAME || 'WHLVP/Stock/Stock Vente'
    const [templates, quants] = await Promise.all([
      odooSearchRead(uid, 'product.template', [['id', 'in', tmplIds]], ['id', 'name', 'sequence', 'image_128'], { limit: 500 }),
      odooSearchRead(uid, 'stock.quant', [['location_id.complete_name', '=', locationName], ['product_id', 'in', variants.map(v => v.id)]], ['product_id', 'quantity'], { limit: 3000 }),
    ])
    const tmplById = new Map()
    for (const t of templates) {
      tmplById.set(t.id, {
        sequence: t.sequence || 99,
        image_url_fallback: t.image_128 ? `data:image/png;base64,${t.image_128}` : null,
      })
    }
    const qtyByVariant = new Map()
    for (const q of quants) {
      const vid = Array.isArray(q.product_id) ? q.product_id[0] : null
      if (vid) qtyByVariant.set(vid, (qtyByVariant.get(vid) || 0) + (parseFloat(q.quantity) || 0))
    }

    // 4) Indexer par catégorie
    const byCategory = {}
    for (const cat of CATEGORIES) {
      byCategory[cat.id] = { ...cat, articles: new Map(), sizesSet: new Set() }
    }

    for (const v of variants) {
      const variantName = v.display_name || v.name || ''
      const cleaned = cleanName(variantName)
      const prefix = detectPrefix(cleaned)
      if (!prefix) continue

      // V- : les cakes existent en (1) [1 part] et (6) ; on n'affiche pas les (1) en vitrine,
      // SAUF pour le comptage du soir (?vcake1=1) où l'on compte les parts individuelles restantes.
      if (prefix === 'V-' && extractSize(cleaned) === 1 && !req.query.vcake1) continue

      const tmplId = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null
      const tmplInfo = tmplById.get(tmplId) || { sequence: 99, image_url_fallback: null }
      // Le (N) final n'est un nombre de personnes que pour les entremets/cakes.
      // Pour MI- (mignardises), (18)/(28) = nb de pièces → pas une « taille » : on garde tout dans une seule liste.
      const size = prefix === 'MI-' ? null : extractSize(cleaned)
      const image_url = v.image_128
        ? `data:image/png;base64,${v.image_128}`
        : tmplInfo.image_url_fallback

      if (!byCategory[prefix].articles.has(cleaned)) {
        byCategory[prefix].articles.set(cleaned, {
          name: cleaned,
          code: String(tmplId),
          variant_id: v.id,
          barcode: v.barcode || null,
          size,
          image_url,
          display_order: tmplInfo.sequence,
          qty_available: qtyByVariant.get(v.id) || 0,
        })
      }
      if (size !== null) byCategory[prefix].sizesSet.add(size)
    }

    // 5) Résultat final
    const result = CATEGORIES.map(cat => {
      const data = byCategory[cat.id]
      const articles = [...data.articles.values()].sort((a, b) => {
        if (a.display_order !== b.display_order) return a.display_order - b.display_order
        return a.name.localeCompare(b.name, 'fr')
      })
      const sizes = [...data.sizesSet].sort((a, b) => a - b).map(String)

      const articlesBySize = {}
      for (const s of sizes) articlesBySize[s] = []
      articlesBySize['_none'] = []
      for (const a of articles) {
        if (a.size === null) articlesBySize['_none'].push(a)
        else {
          const key = String(a.size)
          if (!articlesBySize[key]) articlesBySize[key] = []
          articlesBySize[key].push(a)
        }
      }

      return {
        id: cat.id,
        emoji: cat.emoji,
        label: cat.label,
        nb_articles: articles.length,
        sizes,
        has_size_tabs: sizes.length > 0,
        articles,
        articlesBySize,
      }
    })

    return res.status(200).json({
      location: locationName,
      generated_at: new Date().toISOString(),
      total_articles: result.reduce((s, c) => s + c.nb_articles, 0),
      categories: result,
    })
  } catch (e) {
    console.error('[catalog-from-odoo] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

// ============================================================
// ÉCONOMAT — produits achetables (purchase_ok) préfixés MP-/P-
// ============================================================
function cleanEconomatName(name) {
  if (!name) return ''
  let s = String(name).replace(/^\[\d+\]\s*/, '').trim()  // retire le code [447]
  s = s.replace(/^(MP-|P-)\s*/i, '').trim()               // retire le préfixe MP-/P-
  return s
}

// ============================================================
// STOCK PROD — articles SM- + stock à un lieu Odoo (vitrine/annexe)
// ============================================================
const STOCK_PROD_LIEUX = {
  vitrine: 'WHLVP/Stock/Stock Prod',
  annexe:  'WHPDX/Stock Prod annexe',
}
// Emplacements comptés par les onglets Inventaire.
const INVENTAIRE_LIEUX = { annexe: 62, prod: 52 }
// Porte le comptage de l'app dans Odoo, dans la colonne « quantité comptée ».
// Rien ne bouge en stock ici : Odoo garde l'écart en attente, et c'est Layla
// qui applique depuis Odoo — d'où le nom de l'écran là-bas, « Ajustements
// d'inventaire ». Un comptage égal au stock n'est pas écrit : il n'ajouterait
// qu'une ligne à zéro dans une liste déjà longue.
async function handleInventaireOdoo(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST attendu' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const lieu = String(req.query.inventaireOdoo || '').toLowerCase() === 'prod' ? 'prod' : 'annexe'
    const LOC = INVENTAIRE_LIEUX[lieu]
    const comptages = (body.comptages || [])
      .map(c => ({ id: Number(c.product_id), qty: Number(c.quantite) }))
      .filter(c => c.id > 0 && Number.isFinite(c.qty))
    if (!comptages.length) return res.status(400).json({ error: 'aucun comptage' })
    if (body.test) return res.status(200).json({ test: true, ecrits: 0, crees: 0, pareils: 0, sautes: [] })

    const uid = await odooAuthenticate()
    const quants = await odooSearchRead(uid, 'stock.quant',
      [['location_id', 'child_of', LOC], ['product_id', 'in', comptages.map(c => c.id)]],
      ['id', 'product_id', 'location_id', 'quantity'], { limit: 2000 })
    const parProduit = {}
    for (const q of quants) (parProduit[q.product_id[0]] = parProduit[q.product_id[0]] || []).push(q)

    let ecrits = 0, crees = 0, pareils = 0
    const sautes = []
    for (const c of comptages) {
      const liste = parProduit[c.id] || []
      if (liste.length > 1) {
        // le même article à deux emplacements : on ne choisit pas à sa place
        sautes.push((liste[0].product_id[1] || '') + ' — ' + liste.length + ' emplacements')
        continue
      }
      if (liste.length === 1) {
        if (Math.abs((liste[0].quantity || 0) - c.qty) < 0.001) { pareils++; continue }
        await odooEcrire(uid, 'stock.quant', 'write',
          [[liste[0].id], { inventory_quantity: c.qty, inventory_quantity_set: true }])
        ecrits++
      } else {
        if (Math.abs(c.qty) < 0.001) { pareils++; continue }   // rien chez Odoo, rien compté
        await odooEcrire(uid, 'stock.quant', 'create',
          [{ product_id: c.id, location_id: LOC, inventory_quantity: c.qty, inventory_quantity_set: true }])
        crees++
      }
    }
    console.log(`[inventaire-odoo] ${lieu} : ${ecrits} ecrits, ${crees} crees, ${pareils} identiques, ${sautes.length} sautes`)
    return res.status(200).json({ ecrits, crees, pareils, sautes })
  } catch (e) {
    return res.status(200).json({ error: (e.message || String(e)).slice(0, 300) })
  }
}

// Un seul inventaire par lieu : le stock positif, le négatif ET les articles à
// zéro y vivent ensemble. Deux listes séparées obligeaient à compter deux fois,
// et un article changeait de liste selon l'humeur du stock Odoo.

// On part du stock RÉEL de l'emplacement (stock.quant), pas du catalogue : on ne
// compte que ce qui est censé s'y trouver. On garde les matières premières (MP-)
// et les semi-finis (SM…, écrit de 5 façons dans Odoo : SM- SM. SM SMT. SMSu-).
// Les fiches archivées sortent d'elles-mêmes : product.product les ignore.
async function handleInventaire(req, res) {
  try {
    const lieu = String(req.query.inventaire || '').toLowerCase() === 'prod' ? 'prod' : 'annexe'
    const LOC = INVENTAIRE_LIEUX[lieu]
    const uid = await odooAuthenticate()
    const quants = await odooSearchRead(uid, 'stock.quant',
      [['location_id', 'child_of', LOC]], ['product_id', 'quantity'], { limit: 5000 })

    const qtyById = new Map()
    for (const q of quants) {
      const pid = Array.isArray(q.product_id) ? q.product_id[0] : null
      if (pid) qtyById.set(pid, (qtyById.get(pid) || 0) + (parseFloat(q.quantity) || 0))
    }

    const ids = [...qtyById.keys()]
    const prods = []
    for (let i = 0; i < ids.length; i += 200) {
      prods.push(...await odooSearchRead(uid, 'product.product',
        [['id', 'in', ids.slice(i, i + 200)]], ['id', 'display_name', 'uom_id', 'categ_id']))
    }

    const articles = []
    for (const p of prods) {
      const nom = String(p.display_name || '').replace(/^\[\d+\]\s*/, '')
      const fam = /^MP[-.]/.test(nom) ? 'Matières premières'
        // « Sm- Le Citron Framboise » s'écrit avec un m minuscule : sans le
        // drapeau i, 14 articles de l'annexe et 9 de Prod étaient invisibles.
        : /^SM/i.test(nom) ? 'Semi-finis' : null
      if (!fam) continue
      const qty = Math.round((qtyById.get(p.id) || 0) * 100) / 100
      articles.push({
        id: p.id, nom, fam,
        uom: (p.uom_id && p.uom_id[1]) || '',
        cat: (p.categ_id && p.categ_id[1]) || 'Sans catégorie',
        qty,
      })
    }
    // ── Articles à ZÉRO qui appartiennent quand même à l'annexe ─────────────
    // La liste ci-dessus part du stock : un article tombé à zéro en disparaît, et
    // personne ne peut donc le compter (c'est ce qui a obligé à en rajouter 21 à
    // la main au premier inventaire). On récupère donc aussi ceux qui ont
    // réellement circulé dans ce lieu sur l'année — pas tout le catalogue Odoo,
    // qui n'a rien à voir avec l'annexe.
    const depuis = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const bouges = new Set()
    for (const champ of ['location_id', 'location_dest_id']) {
      const g = await odooReadGroup(uid, 'stock.move.line',
        [[champ, 'child_of', LOC], ['date', '>=', depuis], ['state', '=', 'done']],
        ['product_id'], ['product_id'])
      for (const r of g) if (Array.isArray(r.product_id)) bouges.add(r.product_id[0])
    }
    const aZero = [...bouges].filter(id => !qtyById.has(id))
    const infosZero = []
    for (let i = 0; i < aZero.length; i += 200) {
      infosZero.push(...await odooSearchRead(uid, 'product.product',
        [['id', 'in', aZero.slice(i, i + 200)], ['active', '=', true]],
        ['id', 'display_name', 'uom_id', 'categ_id']))
    }
    for (const p of infosZero) {
      const nom = String(p.display_name || '').replace(/^\[\d+\]\s*/, '')
      const fam = /^MP[-.]/.test(nom) ? 'Matières premières'
        : /^SM/i.test(nom) ? 'Semi-finis' : null
      if (!fam) continue
      articles.push({
        id: p.id, nom, fam,
        uom: (p.uom_id && p.uom_id[1]) || '',
        cat: (p.categ_id && p.categ_id[1]) || 'Sans catégorie',
        qty: 0,
      })
    }

    const rang = f => f === 'Matières premières' ? 0 : f === 'Semi-finis' ? 1 : 2
    articles.sort((a, b) =>
      (rang(a.fam) - rang(b.fam))
      || a.cat.localeCompare(b.cat, 'fr')
      || a.nom.localeCompare(b.nom, 'fr'))

    return res.status(200).json({ lieu, articles })
  } catch (e) {
    console.error('[inventaire]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

async function handleStockProd(req, res) {
  try {
    const lieu = String(req.query.stockProd || '').toLowerCase()
    const locationName = STOCK_PROD_LIEUX[lieu]
    if (!locationName) return res.status(400).json({ error: 'lieu invalide (vitrine|annexe)' })

    const uid = await odooAuthenticate()
    const variants = await odooSearchRead(uid, 'product.product',
      [['active', '=', true], ['name', '=ilike', 'SM-%']],
      ['id', 'name'], { limit: 2000 })
    if (!variants.length) return res.status(200).json({ lieu, location: locationName, articles: [] })

    const variantIds = variants.map(v => v.id)
    const quants = await odooSearchRead(uid, 'stock.quant',
      [['location_id.complete_name', '=', locationName], ['product_id', 'in', variantIds]],
      ['product_id', 'quantity'])
    const qtyByVariant = new Map()
    for (const q of quants) {
      const vid = Array.isArray(q.product_id) ? q.product_id[0] : null
      if (vid) qtyByVariant.set(vid, (qtyByVariant.get(vid) || 0) + (parseFloat(q.quantity) || 0))
    }

    // Règles de réapprovisionnement Odoo (min/max) à ce lieu, si elles existent.
    let minByVariant = new Map(), maxByVariant = new Map()
    try {
      const orderpoints = await odooSearchRead(uid, 'stock.warehouse.orderpoint',
        [['location_id.complete_name', '=', locationName], ['product_id', 'in', variantIds]],
        ['product_id', 'product_min_qty', 'product_max_qty'])
      for (const o of orderpoints) {
        const vid = Array.isArray(o.product_id) ? o.product_id[0] : null
        if (vid) { minByVariant.set(vid, parseFloat(o.product_min_qty) || 0); maxByVariant.set(vid, parseFloat(o.product_max_qty) || 0) }
      }
    } catch (e) { console.warn('[stockProd orderpoint]', e.message) }

    // On garde TOUS les articles SM- (même ceux à 0 / sans ligne de stock à ce lieu),
    // pour que l'admin puisse les activer et régler min/max dans le catalogue.
    // qty = 0 si aucun stock à cette location. La vue non-admin n'affiche que les actifs.
    const byName = new Map()
    for (const v of variants) {
      const name = cleanName(v.name)
      if (!name) continue
      const cur = byName.get(name) || { qty: 0, odoo_min: null, odoo_max: null }
      cur.qty += qtyByVariant.get(v.id) || 0
      if (minByVariant.has(v.id)) cur.odoo_min = minByVariant.get(v.id)
      if (maxByVariant.has(v.id)) cur.odoo_max = maxByVariant.get(v.id)
      byName.set(name, cur)
    }
    const articles = [...byName.entries()]
      .map(([name, o]) => ({ name, qty: Math.round(o.qty * 100) / 100, odoo_min: o.odoo_min, odoo_max: o.odoo_max }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return res.status(200).json({ lieu, location: locationName, articles })
  } catch (e) {
    console.error('[catalog-from-odoo stockProd] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

// Produits transférables entre les deux ateliers : on cherche dans TOUT le
// catalogue stockable (les semi-finis SM ne sont pas achetables, ils seraient
// invisibles avec le filtre de l'économat). Renvoie l'unité de STOCK, celle
// dans laquelle Odoo compte les mouvements internes.
async function handleTransferts(req, res) {
  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo env vars manquantes)' })
    }
    const q = (req.query.q || '').trim()
    if (q.length < 2) return res.status(200).json({ products: [] })
    const uid = await odooAuthenticate()
    const domain = [['active', '=', true], ['type', '=', 'product']]
    // Recherche mot à mot (ET) : « flan vanille » trouve « SM- flan vanille 20 cm ».
    const mots = q.split(/\s+/).map(w => w.trim()).filter(w => w.length >= 2).slice(0, 5)
    for (const m of mots) domain.push(['name', 'ilike', m])
    const rows = await odooSearchRead(uid, 'product.product', domain,
      ['id', 'display_name', 'uom_id', 'image_128'], { limit: 40 })
    const products = rows.map(r => ({
      id: r.id,
      nom: r.display_name,
      unite: Array.isArray(r.uom_id) ? r.uom_id[1] : 'Units',
      image: r.image_128 ? `data:image/png;base64,${r.image_128}` : null,
    }))
    return res.status(200).json({ products })
  } catch (e) {
    console.error('[catalog-from-odoo transferts]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

async function handleEconomat(req, res) {
  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo env vars manquantes)' })
    }
    const q = (req.query.q || '').trim()
    const idsParam = (req.query.ids || '').trim()
    const ids = idsParam ? idsParam.split(',').map(s => parseInt(s, 10)).filter(Boolean) : null
    const withImage = !!q || !!ids

    const uid = await odooAuthenticate()

    let domain
    if (ids) {
      domain = [['id', 'in', ids]]
    } else {
      domain = [['purchase_ok', '=', true], ['active', '=', true]]
      if (q) {
        // Recherche MOT À MOT (OU) : « Canette Coca Cola » doit trouver
        // « Coca Cola 33cl ». Chercher la phrase entière ne donnait rien.
        // Et on ne restreint plus aux préfixes MP-/P- : les fournitures C-,
        // FS-… sont aussi achetables et étaient invisibles ici.
        const mots = q.split(/\s+/).map(w => w.trim()).filter(w => w.length >= 3).slice(0, 5)
        if (mots.length) {
          for (let i = 0; i < mots.length - 1; i++) domain.push('|')
          for (const m of mots) domain.push(['name', 'ilike', m])
        } else {
          domain.push(['name', 'ilike', q])
        }
      } else {
        // Sans recherche : la liste de référence reste les MP-/P- (sinon des
        // milliers de lignes).
        domain.push('|', ['name', '=ilike', 'MP-%'], ['name', '=ilike', 'P-%'])
      }
    }

    const fields = ['id', 'name', 'display_name', 'uom_po_id', 'categ_id']
    if (withImage) fields.push('image_128')

    const limit = ids ? ids.length : (q ? 60 : 2000)
    const rows = await odooSearchRead(uid, 'product.product', domain, fields, { limit })

    let products = rows.map(p => ({
      odoo_id: p.id,
      name: cleanEconomatName(p.display_name || p.name),
      odoo_name: p.display_name || p.name,
      unit: Array.isArray(p.uom_po_id) ? p.uom_po_id[1] : null,
      // Catégorie Odoo : sert à deviner un article qu'on COMMANDE (les frais).
      categ: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      image_url: (withImage && p.image_128) ? `data:image/png;base64,${p.image_128}` : null,
    }))

    if (q) {
      // Les plus proches d'abord : nombre de mots de la recherche présents
      // dans le nom du produit.
      const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const mots = norm(q).split(/\s+/).filter(w => w.length >= 3)
      const pertinence = t => { const n = norm(t); return mots.reduce((s, m) => s + (n.includes(m) ? 1 : 0), 0) }
      products = products
        .map(p => ({ p, s: pertinence(p.odoo_name) }))
        .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name, 'fr'))
        .map(x => x.p)
    } else {
      products.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }

    return res.status(200).json({ count: products.length, products })
  } catch (e) {
    console.error('[catalog-from-odoo economat] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

