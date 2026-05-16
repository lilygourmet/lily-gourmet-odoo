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

    // 2) Charge les lignes 'evening' du stock_day (= ce que le café a compté)
    const { data: items, error: itemsErr } = await supabase
      .from('stock_day_items')
      .select('id, product_name, product_code, qty_odoo_initial, source')
      .eq('stock_day_id', stock_day_id)

    if (itemsErr) {
      console.error('[stock-odoo-snapshot] load items error:', itemsErr)
      return res.status(500).json({ error: 'Erreur lecture lignes' })
    }

    // Index : par product_code pour les lignes 'evening' uniquement
    // (les éventuelles lignes 'odoo_only' déjà créées seront écrasées plus bas)
    const eveningByCode = new Map()
    const oldOdooOnlyIds = []
    for (const it of (items || [])) {
      if (it.source === 'evening' && it.product_code) {
        // Si plusieurs lignes evening pour le même code (multi-fraîcheur), on prend la première
        if (!eveningByCode.has(it.product_code)) {
          eveningByCode.set(it.product_code, it)
        }
      } else if (it.source === 'odoo_only') {
        oldOdooOnlyIds.push(it.id)
      }
    }

    // 3) Auth Odoo + récupération stock.quant
    console.log('[stock-odoo-snapshot] Odoo authentication...')
    const uid = await odooAuthenticate()

    // Filtre location : on prend tous les emplacements 'internal' dont le nom
    // contient "Vente" (à ajuster selon ton arbo Odoo réelle).
    // IMPORTANT : utiliser '=' (égalité stricte) sur complete_name pour ne PAS
    // additionner les sous-emplacements (genre /Stock/Stock Vente + /Stock/Stock Prod).
    const stockLocationDomain = process.env.ODOO_STOCK_LOCATION_NAME
      ? [['location_id.complete_name', '=', process.env.ODOO_STOCK_LOCATION_NAME]]
      : [['location_id.usage', '=', 'internal'], ['location_id.name', 'ilike', 'Vente']]

    console.log('[stock-odoo-snapshot] Odoo search ALL stock.quant in location...')
    // On récupère TOUT le stock du lieu (pas de filtre product_tmpl_id)
    // Puis on filtrera par préfixe ensuite côté JS
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      stockLocationDomain,
      ['product_id', 'product_tmpl_id', 'quantity', 'location_id'],
      { limit: 2000 }
    )

    // Préfixes vitrine à conserver (case insensitive)
    const ALLOWED_PREFIXES = ['E-', 'GS-', 'MI-', 'V-', 'RA-', 'H-', 'N-']
    const PREFIX_CATEGORY = {
      'E-': 'E',
      'GS-': 'GS',
      'MI-': 'MI',
      'V-': 'V',
      'RA-': 'RA',
      'H-': 'H',
      'N-': 'N',
    }

    function detectPrefix(name) {
      if (!name) return null
      // Retirer le code Odoo [123] devant si présent
      const cleaned = name.replace(/^\[\d+\]\s*/, '').trim()
      for (const p of ALLOWED_PREFIXES) {
        if (cleaned.toUpperCase().startsWith(p.toUpperCase())) {
          return p
        }
      }
      return null
    }

    function cleanName(name) {
      if (!name) return ''
      return name.replace(/^\[\d+\]\s*/, '').trim()
    }

    // 4) Pour chaque quant : agréger par product_tmpl_id et filtrer par préfixe
    // odooArticles : { templateId: { templateId, productName, prefix, qty } }
    const odooArticles = new Map()
    for (const q of quants) {
      let tmplId = null
      let displayName = null
      if (Array.isArray(q.product_tmpl_id)) {
        tmplId = q.product_tmpl_id[0]
        displayName = q.product_tmpl_id[1] // utile fallback
      }
      // Fallback : récupérer le nom depuis product_id
      if (!displayName && Array.isArray(q.product_id)) {
        displayName = q.product_id[1]
      }
      if (!tmplId) continue
      const prefix = detectPrefix(displayName)
      if (!prefix) continue // pas un préfixe vitrine → on ignore

      const code = String(tmplId)
      const qty = parseFloat(q.quantity) || 0

      if (odooArticles.has(code)) {
        // Somme (au cas où plusieurs variants/locations pour le même tmpl_id)
        odooArticles.get(code).qty += qty
      } else {
        odooArticles.set(code, {
          templateId: code,
          productName: cleanName(displayName),
          prefix,
          qty,
        })
      }
    }

    console.log('[stock-odoo-snapshot] Stock found for', odooArticles.size, 'articles (filtered by prefix)')

    // 5) Mettre à jour les lignes 'evening' existantes + créer des 'odoo_only' pour les nouveaux
    const nowISO = new Date().toISOString()
    let updatedEvening = 0
    let insertedOdooOnly = 0

    // 5a) Update lignes evening (avec qty_odoo_snapshot)
    for (const [code, eveningItem] of eveningByCode.entries()) {
      const odooEntry = odooArticles.get(code)
      const qty = odooEntry ? Math.round(odooEntry.qty) : null

      const patch = {
        qty_odoo_snapshot: qty,
        qty_odoo_snapshot_at: nowISO,
      }
      if (initial && (eveningItem.qty_odoo_initial === null || eveningItem.qty_odoo_initial === undefined)) {
        patch.qty_odoo_initial = qty
        patch.qty_odoo_initial_at = nowISO
      }

      const { error: upErr } = await supabase
        .from('stock_day_items')
        .update(patch)
        .eq('id', eveningItem.id)
      if (upErr) {
        console.error('[stock-odoo-snapshot] update evening item error:', upErr, 'item=', eveningItem.id)
        continue
      }
      updatedEvening++

      // Marquer comme traité (pour ne pas le recréer en odoo_only)
      odooArticles.delete(code)
    }

    // 5b) Supprimer les anciennes lignes 'odoo_only' (on les recrée à chaque refresh)
    if (oldOdooOnlyIds.length > 0) {
      const { error: delErr } = await supabase
        .from('stock_day_items')
        .delete()
        .in('id', oldOdooOnlyIds)
      if (delErr) {
        console.error('[stock-odoo-snapshot] delete old odoo_only error:', delErr)
      }
    }

    // 5c) Créer les lignes 'odoo_only' pour articles Odoo non comptés
    if (odooArticles.size > 0) {
      const newRows = []
      for (const [code, entry] of odooArticles.entries()) {
        newRows.push({
          stock_day_id,
          product_name: entry.productName,
          product_code: code,
          category: PREFIX_CATEGORY[entry.prefix] || 'AUTRE',
          freshness: 'fresh',
          source: 'odoo_only',
          qty_counted: null,
          qty_odoo_snapshot: Math.round(entry.qty),
          qty_odoo_snapshot_at: nowISO,
          ...(initial ? { qty_odoo_initial: Math.round(entry.qty), qty_odoo_initial_at: nowISO } : {}),
        })
      }
      const { error: insErr } = await supabase
        .from('stock_day_items')
        .insert(newRows)
      if (insErr) {
        console.error('[stock-odoo-snapshot] insert odoo_only error:', insErr)
      } else {
        insertedOdooOnly = newRows.length
      }
    }

    console.log('[stock-odoo-snapshot] Done.', updatedEvening, 'evening updated,', insertedOdooOnly, 'odoo_only inserted')

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
      evening_updated: updatedEvening,
      odoo_only_inserted: insertedOdooOnly,
      timestamp: nowISO,
      is_initial: initial,
    })
  } catch (e) {
    console.error('[stock-odoo-snapshot] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

