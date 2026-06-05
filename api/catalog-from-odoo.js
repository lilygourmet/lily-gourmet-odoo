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

async function odooAuthenticate() {
  const uid = await odooJsonRpc('common', 'login', [
    process.env.ODOO_DB,
    process.env.ODOO_USERNAME,
    process.env.ODOO_PASSWORD,
  ])
  if (!uid) throw new Error('Odoo auth failed')
  return uid
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

  // Mode stock prod : articles SM- + stock à un lieu donné (vitrine/annexe).
  // GET /api/catalog-from-odoo?stockProd=vitrine|annexe
  if (req.query.stockProd) return handleStockProd(req, res)

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

    // 2) Templates (sequence + image fallback)
    const tmplIds = [...new Set(variants
      .map(v => Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null)
      .filter(Boolean))]
    const templates = await odooSearchRead(
      uid,
      'product.template',
      [['id', 'in', tmplIds]],
      ['id', 'name', 'sequence', 'image_128'],
      { limit: 500 }
    )
    const tmplById = new Map()
    for (const t of templates) {
      tmplById.set(t.id, {
        sequence: t.sequence || 99,
        image_url_fallback: t.image_128 ? `data:image/png;base64,${t.image_128}` : null,
      })
    }

    // 3) Quants (info indicative, pas filtre)
    const locationName = process.env.ODOO_STOCK_LOCATION_NAME || 'WHLVP/Stock/Stock Vente'
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      [
        ['location_id.complete_name', '=', locationName],
        ['product_id', 'in', variants.map(v => v.id)],
      ],
      ['product_id', 'quantity'],
      { limit: 3000 }
    )
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

      const tmplId = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null
      const tmplInfo = tmplById.get(tmplId) || { sequence: 99, image_url_fallback: null }
      const size = extractSize(cleaned)
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

    // On ne garde QUE les articles réellement présents à ce lieu (qui ont une
    // ligne de stock — quant — à cette location), pas tout le catalogue SM-.
    const byName = new Map()
    for (const v of variants) {
      if (!qtyByVariant.has(v.id)) continue
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
      domain = [['purchase_ok', '=', true], ['active', '=', true], '|', ['name', '=ilike', 'MP-%'], ['name', '=ilike', 'P-%']]
      if (q) domain.push(['name', 'ilike', q])
    }

    const fields = ['id', 'name', 'display_name', 'uom_po_id']
    if (withImage) fields.push('image_128')

    const limit = ids ? ids.length : (q ? 60 : 2000)
    const rows = await odooSearchRead(uid, 'product.product', domain, fields, { limit })

    const products = rows.map(p => ({
      odoo_id: p.id,
      name: cleanEconomatName(p.display_name || p.name),
      odoo_name: p.display_name || p.name,
      unit: Array.isArray(p.uom_po_id) ? p.uom_po_id[1] : null,
      image_url: (withImage && p.image_128) ? `data:image/png;base64,${p.image_128}` : null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    return res.status(200).json({ count: products.length, products })
  } catch (e) {
    console.error('[catalog-from-odoo economat] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

