// api/catalog-from-odoo.js
// Récupère en LIVE depuis Odoo le catalogue de la vitrine,
// groupé par 8 catégories (E-, GS-, V-, MI-, SU-, RA-, H-, N-)
// avec leurs tailles dynamiques (détectées depuis les variantes existantes).
//
// GET /api/catalog-from-odoo
//   → public (pas de token), car appelé par tous les utilisateurs depuis la Vitrine

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

// =========================================================
// Configuration des 8 catégories
// =========================================================
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

// =========================================================
// HANDLER
// =========================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  // Cache CDN 5min : pas besoin de re-frapper Odoo à chaque ouverture de Vitrine
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo env vars manquantes)' })
    }

    const uid = await odooAuthenticate()
    const locationName = process.env.ODOO_STOCK_LOCATION_NAME || 'WHLVP/Stock/Stock Vente'

    // 1) Récupérer tous les quants du lieu vitrine (variantes en stock)
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      [['location_id.complete_name', '=', locationName]],
      ['product_id', 'product_tmpl_id', 'quantity'],
      { limit: 3000 }
    )

    // 2) Récupérer les détails templates (pour image + barcode + display_order)
    const tmplIds = [...new Set(quants
      .map(q => Array.isArray(q.product_tmpl_id) ? q.product_tmpl_id[0] : null)
      .filter(Boolean))]
    const templates = await odooSearchRead(
      uid,
      'product.template',
      [['id', 'in', tmplIds]],
      ['id', 'name', 'image_128', 'sequence'],
      { limit: 500 }
    )
    const tmplById = new Map()
    for (const t of templates) {
      tmplById.set(t.id, {
        id: t.id,
        name: cleanName(t.name),
        image_url: t.image_128 ? `data:image/png;base64,${t.image_128}` : null,
        sequence: t.sequence || 99,
      })
    }

    // 3) Récupérer les détails des variantes (barcode pour scan)
    const variantIds = [...new Set(quants
      .map(q => Array.isArray(q.product_id) ? q.product_id[0] : null)
      .filter(Boolean))]
    const variants = await odooSearchRead(
      uid,
      'product.product',
      [['id', 'in', variantIds]],
      ['id', 'barcode'],
      { limit: 1000 }
    )
    const barcodeByVariant = new Map()
    for (const v of variants) {
      if (v.barcode) barcodeByVariant.set(v.id, v.barcode)
    }

    // 4) Indexer : catégorie → article (unique par nom de variante)
    //    Pour chaque catégorie on collecte :
    //      - articles par variante (avec taille extraite)
    //      - liste des tailles distinctes présentes
    const byCategory = {}
    for (const cat of CATEGORIES) {
      byCategory[cat.id] = {
        ...cat,
        articles: new Map(),  // variantName -> article info
        sizesSet: new Set(),
      }
    }

    for (const q of quants) {
      const variantName = Array.isArray(q.product_id) ? q.product_id[1] : null
      const variantId = Array.isArray(q.product_id) ? q.product_id[0] : null
      const tmplId = Array.isArray(q.product_tmpl_id) ? q.product_tmpl_id[0] : null
      if (!variantName || !tmplId) continue

      const prefix = detectPrefix(variantName)
      if (!prefix) continue

      const cleanedName = cleanName(variantName)
      const size = extractSize(variantName)
      const tmpl = tmplById.get(tmplId) || { image_url: null, sequence: 99 }

      if (!byCategory[prefix].articles.has(cleanedName)) {
        byCategory[prefix].articles.set(cleanedName, {
          name: cleanedName,
          code: String(tmplId),
          variant_id: variantId,
          barcode: barcodeByVariant.get(variantId) || null,
          size: size,                  // null si pas de taille suffixée
          image_url: tmpl.image_url,
          display_order: tmpl.sequence,
        })
      }
      if (size !== null) byCategory[prefix].sizesSet.add(size)
    }

    // 5) Construire le résultat final
    const result = CATEGORIES.map(cat => {
      const data = byCategory[cat.id]
      const articles = [...data.articles.values()]
        .sort((a, b) => {
          if (a.display_order !== b.display_order) return a.display_order - b.display_order
          return a.name.localeCompare(b.name, 'fr')
        })

      const sizes = [...data.sizesSet].sort((a, b) => a - b).map(String)

      // Group articles par taille pour l'UI (clé '_none' pour articles sans taille)
      const articlesBySize = {}
      for (const s of sizes) articlesBySize[s] = []
      articlesBySize['_none'] = []
      for (const a of articles) {
        if (a.size === null) {
          articlesBySize['_none'].push(a)
        } else {
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
        sizes,                     // ex: ['1', '5', '10', '15'] ou []
        has_size_tabs: sizes.length > 0,
        articles,                  // liste à plat pour fallback
        articlesBySize,            // groupé pour les onglets
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

