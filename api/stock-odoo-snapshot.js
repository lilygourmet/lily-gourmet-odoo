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

    // Fonction de normalisation : tout en minuscule, espaces simples, retire les [xxx]
    function normName(s) {
      if (!s) return ''
      return s
        .replace(/^\[\d+\]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }

    const eveningByName = new Map()
    const oldOdooOnlyIds = []
    for (const it of (items || [])) {
      if (it.source === 'evening') {
        const key = normName(it.product_name)
        if (key && !eveningByName.has(key)) {
          eveningByName.set(key, it)
        }
      } else if (it.source === 'odoo_only') {
        oldOdooOnlyIds.push(it.id)
      }
    }

    // 3) Auth Odoo + récupération stock.quant
    console.log('[stock-odoo-snapshot] Odoo authentication...')
    const uid = await odooAuthenticate()

    const stockLocationDomain = process.env.ODOO_STOCK_LOCATION_NAME
      ? [['location_id.complete_name', '=', process.env.ODOO_STOCK_LOCATION_NAME]]
      : [['location_id.usage', '=', 'internal'], ['location_id.name', 'ilike', 'Vente']]

    console.log('[stock-odoo-snapshot] Odoo search ALL stock.quant in location...')
    const quants = await odooSearchRead(
      uid,
      'stock.quant',
      stockLocationDomain,
      ['product_id', 'product_tmpl_id', 'quantity', 'location_id'],
      { limit: 2000 }
    )

    // NOUVEAU : on récupère aussi TOUS les product.product actifs ET VENDABLES
    // (sale_ok=true) avec un préfixe vitrine, pour pouvoir afficher les produits
    // dont le stock Odoo est à 0 (absents de stock.quant). Les non-vendables
    // (ingredients, composants...) sont ecartes pour ne pas polluer la vue.
    const ALLOWED_PREFIXES = ['E-', 'GS-', 'MI-', 'V-', 'RA-', 'H-', 'N-']
    const prefixOrDomain = ALLOWED_PREFIXES.map(p => ['name', '=ilike', p + '%'])
    // domaine OR pour 7 prefixes : enchaîner '|' n-1 fois en tête + 7 conditions
    const orChain = []
    for (let i = 0; i < prefixOrDomain.length - 1; i++) orChain.push('|')
    const productsDomain = [
      '&', '&',
      ['active', '=', true],
      ['sale_ok', '=', true],
      ...orChain, ...prefixOrDomain,
    ]

    console.log('[stock-odoo-snapshot] Odoo search product.product (actifs+vendables, prefixes vitrine)...')
    const allProducts = await odooSearchRead(
      uid,
      'product.product',
      productsDomain,
      ['name', 'display_name', 'product_tmpl_id', 'sale_ok'],
      { limit: 5000 }
    )
    console.log('[stock-odoo-snapshot]', allProducts.length, 'product.product actifs+vendables trouves')

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

    // 4) Indexer les VARIANTES et TEMPLATES.
    //    On part de allProducts (tous les actifs) pour avoir aussi les qty=0,
    //    puis on additionne les quants par variant.
    const odooVariants = new Map()
    const odooTemplates = new Map()

    // 4a) Initialiser à 0 pour tous les variants actifs
    for (const p of allProducts) {
      const variantName = p.display_name || p.name
      if (!variantName) continue
      const prefix = detectPrefix(variantName)
      if (!prefix) continue
      let tmplId = null
      let tmplName = null
      if (Array.isArray(p.product_tmpl_id)) {
        tmplId = p.product_tmpl_id[0]
        tmplName = p.product_tmpl_id[1]
      }
      if (!tmplName) tmplName = variantName

      const variantKey = normName(variantName)
      const tmplKey = normName(tmplName)

      if (!odooVariants.has(variantKey)) {
        odooVariants.set(variantKey, {
          variantName: cleanName(variantName),
          variantId: p.id,
          tmplId: tmplId ? String(tmplId) : null,
          tmplName: cleanName(tmplName),
          prefix,
          qty: 0, // sera incremente par les quants
        })
      }
      if (!odooTemplates.has(tmplKey)) {
        odooTemplates.set(tmplKey, {
          tmplId: tmplId ? String(tmplId) : null,
          tmplName: cleanName(tmplName),
          prefix,
          totalQty: 0,
        })
      }
    }

    // 4b) Ajouter les quantites depuis les quants (un quant = un variant dans un location)
    for (const q of quants) {
      let tmplId = null
      let tmplName = null
      let variantId = null
      let variantName = null

      if (Array.isArray(q.product_tmpl_id)) {
        tmplId = q.product_tmpl_id[0]
        tmplName = q.product_tmpl_id[1]
      }
      if (Array.isArray(q.product_id)) {
        variantId = q.product_id[0]
        variantName = q.product_id[1]
      }
      if (!tmplName && variantName) tmplName = variantName
      if (!tmplId || !variantName) continue

      const prefix = detectPrefix(variantName)
      if (!prefix) continue

      const qty = parseFloat(q.quantity) || 0
      const variantKey = normName(variantName)
      const tmplKey = normName(tmplName)

      // VARIANT
      if (odooVariants.has(variantKey)) {
        odooVariants.get(variantKey).qty += qty
      } else {
        // Variant pas trouvé dans allProducts (peut-être archivé) : on le crée quand même
        odooVariants.set(variantKey, {
          variantName: cleanName(variantName),
          variantId,
          tmplId: String(tmplId),
          tmplName: cleanName(tmplName),
          prefix,
          qty,
        })
      }

      // TEMPLATE
      if (odooTemplates.has(tmplKey)) {
        odooTemplates.get(tmplKey).totalQty += qty
      } else {
        odooTemplates.set(tmplKey, {
          tmplId: String(tmplId),
          tmplName: cleanName(tmplName),
          prefix,
          totalQty: qty,
        })
      }
    }

    console.log('[stock-odoo-snapshot]', odooVariants.size, 'variants and', odooTemplates.size, 'templates indexed')

    function hasVariantSuffix(name) {
      return /\(\d+\)\s*$/.test(name)
    }
    function extractBaseName(name) {
      return name.replace(/\s*\(\d+\)\s*$/, '').trim()
    }

    const templateHasSizeVariants = new Map()
    for (const [variantKey, v] of odooVariants.entries()) {
      if (!hasVariantSuffix(variantKey)) continue
      const baseKey = extractBaseName(variantKey)
      if (!templateHasSizeVariants.has(baseKey)) {
        templateHasSizeVariants.set(baseKey, new Set())
      }
      templateHasSizeVariants.get(baseKey).add(variantKey)
    }

    // 5) Mettre à jour les lignes 'evening' existantes + créer des 'odoo_only' pour les nouveaux
    const nowISO = new Date().toISOString()
    let updatedEvening = 0
    let insertedOdooOnly = 0

    function resolveOdooQty(eveningName) {
      const variantKey = normName(eveningName)
      if (odooVariants.has(variantKey)) {
        return {
          qty: odooVariants.get(variantKey).qty,
          matchedVariantKey: variantKey,
          matchedTmplKey: null,
        }
      }
      const baseKey = extractBaseName(variantKey)
      if (odooTemplates.has(baseKey)) {
        const hasSizeVariants = templateHasSizeVariants.has(baseKey)
        if (!hasSizeVariants) {
          return {
            qty: odooTemplates.get(baseKey).totalQty,
            matchedVariantKey: null,
            matchedTmplKey: baseKey,
          }
        }
      }
      return { qty: null, matchedVariantKey: null, matchedTmplKey: null }
    }

    const usedVariantKeys = new Set()
    const usedTmplKeys = new Set()
    for (const [nameKey, eveningItem] of eveningByName.entries()) {
      const { qty, matchedVariantKey, matchedTmplKey } = resolveOdooQty(eveningItem.product_name)
      const qtyRounded = qty !== null ? Math.round(qty) : null

      const patch = {
        qty_odoo_snapshot: qtyRounded,
        qty_odoo_snapshot_at: nowISO,
      }
      if (initial && (eveningItem.qty_odoo_initial === null || eveningItem.qty_odoo_initial === undefined)) {
        patch.qty_odoo_initial = qtyRounded
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

      if (matchedVariantKey) usedVariantKeys.add(matchedVariantKey)
      if (matchedTmplKey) usedTmplKeys.add(matchedTmplKey)
    }

    if (oldOdooOnlyIds.length > 0) {
      const { error: delErr } = await supabase
        .from('stock_day_items')
        .delete()
        .in('id', oldOdooOnlyIds)
      if (delErr) {
        console.error('[stock-odoo-snapshot] delete old odoo_only error:', delErr)
      }
    }

    const newRows = []

    // Cas A : variantes par taille (suffixe)
    for (const [variantKey, v] of odooVariants.entries()) {
      if (usedVariantKeys.has(variantKey)) continue
      if (!hasVariantSuffix(variantKey)) continue

      newRows.push({
        stock_day_id,
        product_name: v.variantName,
        product_code: v.tmplId,
        category: PREFIX_CATEGORY[v.prefix] || 'AUTRE',
        freshness: 'fresh',
        source: 'odoo_only',
        qty_counted: null,
        qty_odoo_snapshot: Math.round(v.qty),
        qty_odoo_snapshot_at: nowISO,
        ...(initial ? { qty_odoo_initial: Math.round(v.qty), qty_odoo_initial_at: nowISO } : {}),
      })
    }

    // Cas B : templates sans variantes
    for (const [tmplKey, t] of odooTemplates.entries()) {
      if (usedTmplKeys.has(tmplKey)) continue
      if (templateHasSizeVariants.has(tmplKey)) continue

      let alreadyMatchedAsVariant = false
      for (const [vKey, v] of odooVariants.entries()) {
        if (v.tmplId === t.tmplId && usedVariantKeys.has(vKey)) {
          alreadyMatchedAsVariant = true
          break
        }
      }
      if (alreadyMatchedAsVariant) continue

      newRows.push({
        stock_day_id,
        product_name: t.tmplName,
        product_code: t.tmplId,
        category: PREFIX_CATEGORY[t.prefix] || 'AUTRE',
        freshness: 'fresh',
        source: 'odoo_only',
        qty_counted: null,
        qty_odoo_snapshot: Math.round(t.totalQty),
        qty_odoo_snapshot_at: nowISO,
        ...(initial ? { qty_odoo_initial: Math.round(t.totalQty), qty_odoo_initial_at: nowISO } : {}),
      })
    }

    if (newRows.length > 0) {
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
