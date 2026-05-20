// api/debug-odoo-structure.js
// Endpoint de debug : interroge Odoo et retourne la structure des produits
// dans WHLVP/Stock/Stock Vente, pour comprendre comment Odoo nomme et organise
// les articles + variantes.
//
// GET /api/debug-odoo-structure?token=XXX
// Token = SYNC_SECRET_TOKEN (pour ne pas exposer à tout le monde)

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Vérif token simple
  const token = req.query.token || req.headers['x-token']
  if (token !== process.env.SYNC_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized — token manquant ou invalide' })
  }

  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo)' })
    }

    const uid = await odooAuthenticate()
    const locationName = process.env.ODOO_STOCK_LOCATION_NAME || 'WHLVP/Stock/Stock Vente'

    // 1) Liste des quants dans le lieu cible
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      [['location_id.complete_name', '=', locationName]],
      ['product_id', 'product_tmpl_id', 'quantity'],
      { limit: 2000 }
    )

    // 2) Extraire les tmpl_id uniques
    const tmplIds = [...new Set(quants.map(q =>
      Array.isArray(q.product_tmpl_id) ? q.product_tmpl_id[0] : null
    ).filter(Boolean))]

    // 3) Récupérer les templates complets (avec variants)
    const templates = await odooSearchRead(
      uid,
      'product.template',
      [['id', 'in', tmplIds]],
      ['id', 'name', 'default_code', 'product_variant_ids', 'product_variant_count', 'attribute_line_ids'],
      { limit: 500 }
    )

    // 4) Pour chaque template, récupérer les variants si > 1
    const templateMap = new Map(templates.map(t => [t.id, t]))
    const variantIdsAll = []
    for (const t of templates) {
      if (Array.isArray(t.product_variant_ids)) {
        variantIdsAll.push(...t.product_variant_ids)
      }
    }
    const variants = await odooSearchRead(
      uid,
      'product.product',
      [['id', 'in', [...new Set(variantIdsAll)]]],
      ['id', 'name', 'display_name', 'default_code', 'product_tmpl_id', 'product_template_attribute_value_ids'],
      { limit: 1000 }
    )

    // 5) Construire un rapport propre
    const variantsByTmpl = {}
    for (const v of variants) {
      const tid = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null
      if (!tid) continue
      if (!variantsByTmpl[tid]) variantsByTmpl[tid] = []
      variantsByTmpl[tid].push({
        id: v.id,
        name: v.name,
        display_name: v.display_name,
        default_code: v.default_code || null,
      })
    }

    // 6) Joindre quants ↔ template
    const report = []
    const quantsByTmpl = {}
    for (const q of quants) {
      const tid = Array.isArray(q.product_tmpl_id) ? q.product_tmpl_id[0] : null
      if (!tid) continue
      if (!quantsByTmpl[tid]) quantsByTmpl[tid] = []
      const pid = Array.isArray(q.product_id) ? q.product_id : null
      quantsByTmpl[tid].push({
        product_variant_id: pid?.[0],
        product_variant_name: pid?.[1],
        quantity: q.quantity,
      })
    }

    for (const t of templates) {
      report.push({
        template_id: t.id,
        template_name: t.name,
        template_default_code: t.default_code || null,
        variant_count: t.product_variant_count,
        variants: variantsByTmpl[t.id] || [],
        quants_in_location: quantsByTmpl[t.id] || [],
        total_qty: (quantsByTmpl[t.id] || []).reduce((s, q) => s + (parseFloat(q.quantity) || 0), 0),
      })
    }

    // Tri par nom
    report.sort((a, b) => (a.template_name || '').localeCompare(b.template_name || '', 'fr'))

    return res.status(200).json({
      location: locationName,
      total_quants: quants.length,
      total_templates: templates.length,
      report,
    })
  } catch (e) {
    console.error('[debug-odoo-structure] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

