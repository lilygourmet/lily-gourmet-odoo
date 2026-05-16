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

    // Fonction de normalisation : tout en minuscule, espaces simples, retire les [xxx]
    function normName(s) {
      if (!s) return ''
      return s
        .replace(/^\[\d+\]\s*/, '')   // retire le préfixe [123]
        .replace(/\s+/g, ' ')         // espaces multiples → un seul
        .trim()
        .toLowerCase()
    }

    // Index : par NOM normalisé pour les lignes 'evening' (matching robuste)
    // (les éventuelles lignes 'odoo_only' déjà créées seront écrasées plus bas)
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

    // 4) Pour chaque quant : indexer par VARIANT (product_id), pas par template.
    //    Chaque variant = une taille distincte dans Odoo (ex: "E- Black Forest (1)" id=3126).
    //    On garde aussi un index par template pour les fallbacks (cas Miss Pistache sans tailles).
    //
    // odooVariants : Map<nameKey, { variantName, variantId, tmplId, prefix, qty }>
    //   où nameKey = nom normalisé de la VARIANTE (display_name sans [123])
    // odooTemplates : Map<tmplBaseNameKey, { tmplId, tmplName, prefix, totalQty }>
    //   où tmplBaseNameKey = nom normalisé du TEMPLATE (le "parent" générique)
    const odooVariants = new Map()
    const odooTemplates = new Map()

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
      // Fallback si tmplName vide : on déduit du variant
      if (!tmplName && variantName) tmplName = variantName
      if (!tmplId || !variantName) continue

      const prefix = detectPrefix(variantName)
      if (!prefix) continue // pas un préfixe vitrine → ignore

      const qty = parseFloat(q.quantity) || 0
      const variantKey = normName(variantName)        // ex: "e- black forest (1)"
      const tmplKey = normName(tmplName)              // ex: "e- black forest"

      // Index VARIANT (somme si plusieurs quants pour le même variant)
      if (odooVariants.has(variantKey)) {
        odooVariants.get(variantKey).qty += qty
      } else {
        odooVariants.set(variantKey, {
          variantName: cleanName(variantName),
          variantId,
          tmplId: String(tmplId),
          tmplName: cleanName(tmplName),
          prefix,
          qty,
        })
      }

      // Index TEMPLATE (somme TOUTES variantes confondues, pour fallback Miss Pistache)
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

    // Helpers : utilitaires pour identifier les variantes par suffixe (1)/(5)/(10)/(15)/(20)
    function hasVariantSuffix(name) {
      return /\(\d+\)\s*$/.test(name)
    }
    function extractBaseName(name) {
      return name.replace(/\s*\(\d+\)\s*$/, '').trim()
    }

    // Pour chaque template ayant des VARIANTES par taille dans Odoo, on liste son nameKey
    // afin de savoir s'il faut afficher les variantes (et pas le template seul).
    const templateHasSizeVariants = new Map() // tmplKey -> Set<variantKey>
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

    // Helper : résoudre la qty Odoo d'une ligne envoyée par Hamza.
    //   1. Match VARIANT exact par nom normalisé → qty du variant
    //   2. Sinon, si le template existe mais SANS aucune variante de taille
    //      (cas Miss Pistache : template "E- Miss Pistache" avec 1 seule variante sans suffixe)
    //      → fallback sur totalQty du template (du même nom de base)
    //   3. Sinon null
    // Retourne : { qty: number|null, matchedVariantKey: string|null, matchedTmplKey: string|null }
    function resolveOdooQty(eveningName) {
      const variantKey = normName(eveningName)
      // 1) Match variant exact
      if (odooVariants.has(variantKey)) {
        return {
          qty: odooVariants.get(variantKey).qty,
          matchedVariantKey: variantKey,
          matchedTmplKey: null,
        }
      }
      // 2) Fallback template : on cherche le template du même nom de base
      //    SEULEMENT si ce template n'a PAS de variantes par taille (sinon = erreur de matching)
      const baseKey = extractBaseName(variantKey)
      if (odooTemplates.has(baseKey)) {
        const hasSizeVariants = templateHasSizeVariants.has(baseKey)
        if (!hasSizeVariants) {
          // Template sans variantes par taille (ex: Miss Pistache) → on prend le total
          return {
            qty: odooTemplates.get(baseKey).totalQty,
            matchedVariantKey: null,
            matchedTmplKey: baseKey,
          }
        }
      }
      // 3) Pas de match
      return { qty: null, matchedVariantKey: null, matchedTmplKey: null }
    }

    // 5a) Update lignes evening (matching par nom de variant, fallback template)
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

      // Marquer comme matché (pour ne pas recréer en odoo_only)
      if (matchedVariantKey) usedVariantKeys.add(matchedVariantKey)
      if (matchedTmplKey) usedTmplKeys.add(matchedTmplKey)
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

    // 5c) Créer les lignes 'odoo_only' pour articles Odoo NON comptés par le café
    //
    // Règle d'affichage :
    //   - Pour les templates AVEC variantes par taille : afficher chaque variante non matchée
    //     (ex: si Hamza n'a pas envoyé "E- Black Forest (15)", on crée une ligne odoo_only pour elle)
    //   - Pour les templates SANS variantes (Miss Pistache, Tatin) : afficher le template seul s'il
    //     n'a pas déjà été matché
    const newRows = []

    // Cas A : variantes par taille (suffixe (1)/(5)/(10)/...)
    for (const [variantKey, v] of odooVariants.entries()) {
      if (usedVariantKeys.has(variantKey)) continue // déjà matché à une ligne evening
      if (!hasVariantSuffix(variantKey)) continue   // pas une variante taille (sera traité cas B)

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

    // Cas B : templates SANS variantes par taille (Miss Pistache, Tatin, etc.)
    //   → on affiche un total template (sauf si déjà matché via fallback template OU
    //     via un variant sans suffixe du même template)
    for (const [tmplKey, t] of odooTemplates.entries()) {
      if (usedTmplKeys.has(tmplKey)) continue
      if (templateHasSizeVariants.has(tmplKey)) continue // le cas A s'en occupe

      // On vérifie aussi qu'aucun variant sans suffixe de ce template n'a déjà été matché
      // (cas où le variant Odoo s'appelle "E- Miss Pistache" sans suffixe et a été matché)
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

