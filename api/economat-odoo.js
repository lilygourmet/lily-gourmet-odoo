// api/economat-odoo.js
// Liste les produits Odoo "économat" : achetables (purchase_ok=true), préfixés MP-/P-.
// Renvoie nom nettoyé, unité d'achat (uom_po_id) et photo (image_128).
//
// GET /api/economat-odoo            -> tous (sans image, léger) pour rattachement par nom
// GET /api/economat-odoo?q=amande   -> recherche par nom (avec image), max 60
// GET /api/economat-odoo?ids=1,2,3  -> ces produits précis (avec image) pour le rafraîchissement

async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
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
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
    model, 'search_read', [domain, fields], opts,
  ])
}

function cleanName(name) {
  if (!name) return ''
  let s = String(name).replace(/^\[\d+\]\s*/, '').trim()  // retire le code Odoo [447]
  s = s.replace(/^(MP-|P-)\s*/i, '').trim()               // retire le préfixe MP-/P-
  return s
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo env vars manquantes)' })
    }

    const q = (req.query.q || '').trim()
    const idsParam = (req.query.ids || '').trim()
    const ids = idsParam ? idsParam.split(',').map(s => parseInt(s, 10)).filter(Boolean) : null
    const withImage = !!q || !!ids  // image seulement en recherche ou refresh (payload léger sinon)

    const uid = await odooAuthenticate()

    let domain
    if (ids) {
      domain = [['id', 'in', ids]]
    } else {
      // purchase_ok=true ET (name MP-% OU P-%)
      domain = [['purchase_ok', '=', true], ['active', '=', true], '|', ['name', '=ilike', 'MP-%'], ['name', '=ilike', 'P-%']]
      if (q) domain.push(['name', 'ilike', q])
    }

    const fields = ['id', 'name', 'display_name', 'uom_po_id']
    if (withImage) fields.push('image_128')

    const limit = ids ? ids.length : (q ? 60 : 2000)
    const rows = await odooSearchRead(uid, 'product.product', domain, fields, { limit })

    const products = rows.map(p => ({
      odoo_id: p.id,
      name: cleanName(p.display_name || p.name),
      odoo_name: p.display_name || p.name,
      unit: Array.isArray(p.uom_po_id) ? p.uom_po_id[1] : null,
      image_url: (withImage && p.image_128) ? `data:image/png;base64,${p.image_128}` : null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))

    return res.status(200).json({ count: products.length, products })
  } catch (e) {
    console.error('[economat-odoo] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
