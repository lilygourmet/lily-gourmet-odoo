// api/stock-prod-odoo.js
// Récupère les articles SM- et leur stock actuel à un lieu Odoo donné.
//   GET /api/stock-prod-odoo?lieu=vitrine|annexe
//     vitrine → WHLVP/Stock/Stock Prod
//     annexe  → WHPDX/Stock Prod annexe

const LIEUX = {
  vitrine: 'WHLVP/Stock/Stock Prod',
  annexe:  'WHPDX/Stock Prod annexe',
}

async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const body = { jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.error) throw new Error(`Odoo RPC error: ${data.error.data?.message || data.error.message}`)
  return data.result
}
async function odooAuthenticate() {
  const uid = await odooJsonRpc('common', 'login', [process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD])
  if (!uid) throw new Error('Odoo auth failed')
  return uid
}
async function odooSearchRead(uid, model, domain, fields, opts = {}) {
  return await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, 'search_read', [domain, fields], opts])
}
function cleanName(name) {
  return name ? String(name).replace(/^\[\d+\]\s*/, '').trim() : ''
}

export default async function handler(req, res) {
  try {
    const lieu = String(req.query.lieu || '').toLowerCase()
    const locationName = LIEUX[lieu]
    if (!locationName) return res.status(400).json({ error: 'lieu invalide (vitrine|annexe)' })

    const uid = await odooAuthenticate()

    // 1) Variantes SM- actives
    const variants = await odooSearchRead(uid, 'product.product',
      [['active', '=', true], ['name', '=ilike', 'SM-%']],
      ['id', 'name'], { limit: 2000 })
    if (!variants.length) return res.status(200).json({ lieu, location: locationName, articles: [] })

    // 2) Quantités à ce lieu
    const quants = await odooSearchRead(uid, 'stock.quant',
      [['location_id.complete_name', '=', locationName], ['product_id', 'in', variants.map(v => v.id)]],
      ['product_id', 'quantity'])
    const qtyByVariant = new Map()
    for (const q of quants) {
      const vid = Array.isArray(q.product_id) ? q.product_id[0] : null
      if (vid) qtyByVariant.set(vid, (qtyByVariant.get(vid) || 0) + (parseFloat(q.quantity) || 0))
    }

    // 3) Regroupe par nom nettoyé
    const byName = new Map()
    for (const v of variants) {
      const name = cleanName(v.name)
      if (!name) continue
      byName.set(name, (byName.get(name) || 0) + (qtyByVariant.get(v.id) || 0))
    }
    const articles = [...byName.entries()]
      .map(([name, qty]) => ({ name, qty: Math.round(qty * 100) / 100 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    return res.status(200).json({ lieu, location: locationName, articles })
  } catch (e) {
    console.error('[stock-prod-odoo]', e)
    return res.status(500).json({ error: e.message })
  }
}
