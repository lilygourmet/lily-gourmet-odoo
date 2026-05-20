// api/debug-catalog-by-prefix.js
// Endpoint debug : retourne le catalogue Odoo groupé par préfixe (E-, GS-, V-, MI-, SU-, RA-)
// pour voir quelles tailles existent dans chaque catégorie.
//
// GET /api/debug-catalog-by-prefix?token=XXX

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

const PREFIXES = ['E-', 'GS-', 'V-', 'MI-', 'SU-', 'RA-']

function cleanName(name) {
  if (!name) return ''
  return name.replace(/^\[\d+\]\s*/, '').trim()
}

function detectPrefix(name) {
  if (!name) return null
  const c = cleanName(name).toUpperCase()
  for (const p of PREFIXES) {
    if (c.startsWith(p)) return p
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

  const token = req.query.token || req.headers['x-token']
  if (token !== process.env.SYNC_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized — token manquant ou invalide' })
  }

  try {
    const uid = await odooAuthenticate()

    // 1) Récupérer les quants dans WHLVP/Stock/Stock Vente
    const locationName = process.env.ODOO_STOCK_LOCATION_NAME || 'WHLVP/Stock/Stock Vente'
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      [['location_id.complete_name', '=', locationName]],
      ['product_id', 'product_tmpl_id', 'quantity'],
      { limit: 3000 }
    )

    // 2) Construire un index par préfixe → par template → variantes
    const result = {}
    for (const p of PREFIXES) result[p] = { templates: {} }

    for (const q of quants) {
      const variantName = Array.isArray(q.product_id) ? q.product_id[1] : null
      const tmplId = Array.isArray(q.product_tmpl_id) ? q.product_tmpl_id[0] : null
      const tmplName = Array.isArray(q.product_tmpl_id) ? q.product_tmpl_id[1] : null
      if (!variantName || !tmplId) continue

      const prefix = detectPrefix(variantName)
      if (!prefix) continue

      const cleanedTmpl = cleanName(tmplName)
      const cleanedVariant = cleanName(variantName)
      const size = extractSize(variantName)

      if (!result[prefix].templates[tmplId]) {
        result[prefix].templates[tmplId] = {
          tmpl_id: tmplId,
          tmpl_name: cleanedTmpl,
          variants: [],
          sizes_found: new Set(),
        }
      }
      const t = result[prefix].templates[tmplId]
      t.variants.push({
        name: cleanedVariant,
        size,
        qty: q.quantity,
      })
      if (size !== null) t.sizes_found.add(size)
    }

    // 3) Construire le rapport final : par préfixe, lister toutes les tailles distinctes trouvées
    const report = {}
    for (const p of PREFIXES) {
      const tmpls = Object.values(result[p].templates)
      const allSizes = new Set()
      for (const t of tmpls) {
        for (const s of t.sizes_found) allSizes.add(s)
      }
      report[p] = {
        prefix: p,
        nb_templates: tmpls.length,
        all_sizes_found: [...allSizes].sort((a, b) => a - b),
        templates: tmpls.map(t => ({
          tmpl_id: t.tmpl_id,
          tmpl_name: t.tmpl_name,
          sizes: [...t.sizes_found].sort((a, b) => a - b),
          nb_variants: t.variants.length,
          variants: t.variants.sort((a, b) => (a.size || 0) - (b.size || 0)),
        })).sort((a, b) => a.tmpl_name.localeCompare(b.tmpl_name, 'fr')),
      }
    }

    return res.status(200).json({
      location: locationName,
      total_quants: quants.length,
      summary: PREFIXES.map(p => ({
        prefix: p,
        nb_templates: report[p].nb_templates,
        all_sizes_found: report[p].all_sizes_found,
      })),
      report,
    })
  } catch (e) {
    console.error('[debug-catalog-by-prefix] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

