// api/stock-odoo-snapshot.js
// Serverless function Vercel — Récupère le stock.quant Odoo et met à jour
// les snapshots des lignes 'evening' d'un stock_day.
//
// Endpoint: POST /api/stock-odoo-snapshot
// Body JSON: { user_id, stock_day_id, initial?: boolean }
//   - user_id : identifie le user qui déclenche (vérif perm)
//   - stock_day_id : le jour à snapshoter
//   - initial : si true, écrit aussi qty_odoo_initial (jamais écrasé après)
//                       par défaut false (= rafraîchissement)
//
// Auth : vérifie que le user est admin ou a perm_stock_audit (ou perm_stock_cafe
//        pour l'auto-snapshot au submit).
//
// Logique :
//   1. Vérifie auth + perm
//   2. Charge les lignes 'evening' du stock_day (product_code distinct)
//   3. Appelle Odoo authenticate + stock.quant search_read filtré sur le location
//      "Stock Vente" (à confirmer)
//   4. Pour chaque ligne, met à jour qty_odoo_snapshot (+ qty_odoo_initial si initial=true)
//   5. Met à jour last_odoo_refresh_at sur stock_day

import { createClient } from '@supabase/supabase-js'

// =========================================================
// HELPERS ODOO (réutilisés du pattern sync-odoo.js)
// =========================================================

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
// HANDLER
// =========================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user_id, stock_day_id, initial = false } = req.body || {}
    if (!user_id || !stock_day_id) {
      return res.status(400).json({ error: 'user_id et stock_day_id requis' })
    }

    if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured (Supabase)' })
    }
    if (!process.env.ODOO_URL || !process.env.ODOO_DB || !process.env.ODOO_USERNAME || !process.env.ODOO_PASSWORD) {
      return res.status(500).json({ error: 'Server misconfigured (Odoo)' })
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // 1) Auth + perm
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, role, active, perm_stock_audit, perm_stock_cafe')
      .eq('id', user_id)
      .maybeSingle()

    if (profileErr) return res.status(500).json({ error: 'Erreur lecture profil' })
    if (!profile) return res.status(404).json({ error: 'Utilisateur introuvable' })
    if (!profile.active) return res.status(403).json({ error: 'Compte désactivé' })

    const isAdmin = profile.role === 'admin'
    const canAudit = isAdmin || profile.perm_stock_audit
    const canCafe = isAdmin || profile.perm_stock_cafe

    // Pour un refresh manuel : il faut audit ou admin
    // Pour un initial=true (au submit) : café suffit
    if (initial && !canCafe && !canAudit) {
      return res.status(403).json({ error: 'Permission refusée (perm_stock_cafe ou perm_stock_audit requis)' })
    }
    if (!initial && !canAudit) {
      return res.status(403).json({ error: 'Permission refusée (perm_stock_audit requis pour rafraîchir)' })
    }

    // 2) Charge les lignes 'evening' du stock_day
    const { data: items, error: itemsErr } = await supabase
      .from('stock_day_items')
      .select('id, product_name, product_code, qty_odoo_initial')
      .eq('stock_day_id', stock_day_id)
      .eq('source', 'evening')

    if (itemsErr) {
      console.error('[stock-odoo-snapshot] load items error:', itemsErr)
      return res.status(500).json({ error: 'Erreur lecture lignes' })
    }
    if (!items || items.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucune ligne evening à snapshoter',
        items_updated: 0,
      })
    }

    // Codes produits distincts (filtre Odoo)
    const productCodes = [...new Set(items
      .map(i => i.product_code)
      .filter(c => c && c.trim()))]

    if (productCodes.length === 0) {
      console.warn('[stock-odoo-snapshot] Aucun product_code disponible — impossible de filtrer Odoo')
      return res.status(200).json({
        success: true,
        message: 'Aucun product_code sur les lignes — snapshot impossible',
        items_updated: 0,
      })
    }

    // 3) Auth Odoo + récupération stock.quant
    console.log('[stock-odoo-snapshot] Odoo authentication...')
    const uid = await odooAuthenticate()

    // Filtre location : on prend tous les emplacements 'internal' dont le nom
    // contient "Vente" (à ajuster selon ton arbo Odoo réelle).
    // Si tu veux un location plus précis, change le domaine ici.
    const stockLocationDomain = process.env.ODOO_STOCK_LOCATION_NAME
      ? [['location_id.complete_name', 'ilike', process.env.ODOO_STOCK_LOCATION_NAME]]
      : [['location_id.usage', '=', 'internal'], ['location_id.name', 'ilike', 'Vente']]

    // productCodes contient des odoo_template_id (= product.template id) en string.
    // On les convertit en int pour le filtre Odoo.
    const templateIds = productCodes.map(c => parseInt(c, 10)).filter(n => !isNaN(n))

    console.log('[stock-odoo-snapshot] Odoo search stock.quant for', templateIds.length, 'template ids...')
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      [
        ...stockLocationDomain,
        ['product_id.product_tmpl_id', 'in', templateIds],
      ],
      ['product_id', 'product_tmpl_id', 'quantity', 'location_id'],
      { limit: 1000 }
    )

    // 4) Construire un mapping templateId -> quantité totale (sommer si plusieurs variants/locations matchent)
    // product_tmpl_id est un champ Many2one renvoyant [id, "Nom"]
    const stockByCode = {}
    for (const q of quants) {
      let tmplId = null
      if (Array.isArray(q.product_tmpl_id)) {
        tmplId = q.product_tmpl_id[0]
      } else if (typeof q.product_tmpl_id === 'number') {
        tmplId = q.product_tmpl_id
      }
      if (!tmplId) continue
      const code = String(tmplId)
      const qty = parseFloat(q.quantity) || 0
      stockByCode[code] = (stockByCode[code] || 0) + qty
    }

    console.log('[stock-odoo-snapshot] Stock found for', Object.keys(stockByCode).length, 'codes')

    // 5) Update chaque ligne
    const nowISO = new Date().toISOString()
    let updated = 0
    for (const it of items) {
      const code = it.product_code
      const qty = code ? Math.round(stockByCode[code] || 0) : null
      // qty peut être null si le code n'a pas été trouvé dans Odoo
      // (article fictif ou pas dans le bon location) — on garde null pour distinction

      const patch = {
        qty_odoo_snapshot: qty,
        qty_odoo_snapshot_at: nowISO,
      }
      // Si initial=true ET qty_odoo_initial pas encore défini, on le pose
      if (initial && (it.qty_odoo_initial === null || it.qty_odoo_initial === undefined)) {
        patch.qty_odoo_initial = qty
        patch.qty_odoo_initial_at = nowISO
      }

      const { error: upErr } = await supabase
        .from('stock_day_items')
        .update(patch)
        .eq('id', it.id)
      if (upErr) {
        console.error('[stock-odoo-snapshot] update item error:', upErr, 'item=', it.id)
        continue
      }
      updated++
    }

    // 6) Update stock_day.last_odoo_refresh_at
    const { error: dayErr } = await supabase
      .from('stock_day')
      .update({
        last_odoo_refresh_at: nowISO,
        last_odoo_refresh_by: user_id,
      })
      .eq('id', stock_day_id)
    if (dayErr) console.error('[stock-odoo-snapshot] update stock_day error:', dayErr)

    return res.status(200).json({
      success: true,
      triggered_by: profile.username,
      items_updated: updated,
      items_total: items.length,
      products_in_odoo: Object.keys(stockByCode).length,
      products_requested: productCodes.length,
      timestamp: nowISO,
      is_initial: initial,
    })
  } catch (e) {
    console.error('[stock-odoo-snapshot] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

