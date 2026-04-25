// Serverless function Vercel - Sync Odoo -> Supabase
// Endpoint: POST /api/sync-odoo
// Recupere les commandes Odoo des 2 prochaines semaines et les sync dans Supabase

import { createClient } from '@supabase/supabase-js'
import { parseOdooOrders } from '../src/lib/odooParser.js'

// ==========================================
// HANDLER PRINCIPAL
// ==========================================

export default async function handler(req, res) {
  // CORS pour appel depuis le client
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Accepte POST (manuel) et GET (cron Vercel)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const startTime = Date.now()

  try {
    // 1. Auth Odoo
    console.log('[sync-odoo] Authentification Odoo...')
    const uid = await odooAuthenticate()
    console.log(`[sync-odoo] UID = ${uid}`)

    // 2. Recupere les commandes des 2 prochaines semaines
    console.log('[sync-odoo] Recuperation commandes Odoo...')
    const { orders, lines } = await fetchOdooOrders(uid)
    console.log(`[sync-odoo] ${orders.length} commandes, ${lines.length} lignes`)

    // 3. Group lignes par order_id
    const linesByOrderId = new Map()
    for (const line of lines) {
      const orderId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id
      if (!linesByOrderId.has(orderId)) linesByOrderId.set(orderId, [])
      linesByOrderId.get(orderId).push(line)
    }

    // 4. Parse avec odooParser
    const parsed = parseOdooOrders(orders, linesByOrderId)
    console.log(`[sync-odoo] ${parsed.length} commandes avec items CD/GM`)

    // 5. Upsert dans Supabase
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const stats = await syncToSupabase(supabase, parsed)

    const duration = Date.now() - startTime

    return res.status(200).json({
      success: true,
      duration_ms: duration,
      odoo_orders_fetched: orders.length,
      orders_with_cd_gm: parsed.length,
      ...stats,
    })
  } catch (e) {
    console.error('[sync-odoo] ERREUR:', e)
    return res.status(500).json({
      success: false,
      error: e.message,
      stack: e.stack,
    })
  }
}

// ==========================================
// ODOO JSON-RPC
// ==========================================

async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const body = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service, method, args },
    id: Date.now(),
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!r.ok) {
    throw new Error(`Odoo HTTP ${r.status}: ${await r.text()}`)
  }

  const data = await r.json()
  if (data.error) {
    throw new Error(`Odoo error: ${data.error.data?.message || data.error.message}`)
  }
  return data.result
}

async function odooAuthenticate() {
  const uid = await odooJsonRpc('common', 'authenticate', [
    process.env.ODOO_DB,
    process.env.ODOO_USERNAME,
    process.env.ODOO_PASSWORD,
    {},
  ])
  if (!uid) throw new Error('Odoo authentication failed')
  return uid
}

async function odooSearchRead(uid, model, domain, fields, opts = {}) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_PASSWORD,
    model,
    'search_read',
    [domain, fields],
    opts,
  ])
}

async function fetchOdooOrders(uid) {
  // Plage de dates : aujourd'hui -> dans 14 jours
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in14Days = new Date(today)
  in14Days.setDate(in14Days.getDate() + 14)

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const dateStart = fmtDate(today)
  const dateEnd = fmtDate(new Date(in14Days.getTime() + 86399999)) // fin de journee J+14

  const orders = await odooSearchRead(
    uid,
    'sale.order',
    [
      ['state', '=', 'sale'],
      ['commitment_date', '>=', dateStart],
      ['commitment_date', '<=', dateEnd],
    ],
    ['id', 'name', 'partner_id', 'commitment_date', 'livraison_hour', 'state', 'note', 'order_line'],
    { order: 'commitment_date asc', limit: 500 }
  )

  // Recupere toutes les lignes en une seule requete
  const allLineIds = []
  for (const o of orders) {
    if (Array.isArray(o.order_line)) allLineIds.push(...o.order_line)
  }

  let lines = []
  if (allLineIds.length > 0) {
    lines = await odooSearchRead(
      uid,
      'sale.order.line',
      [['id', 'in', allLineIds]],
      ['id', 'order_id', 'name', 'product_uom_qty', 'price_unit'],
      {}
    )
  }

  return { orders, lines }
}

// ==========================================
// SUPABASE UPSERT
// ==========================================

async function syncToSupabase(supabase, parsedOrders) {
  let added = 0
  let updated = 0
  const errors = []

  for (const po of parsedOrders) {
    try {
      // 1. Upsert order
      const orderRow = {
        order_num: po.orderNum,
        client_name: po.clientName,
        delivery_at: po.deliveryAt.toISOString(),
        delivery_slot: po.deliverySlot,
        odoo_id: po.odooId,
        odoo_state: po.odooState,
        synced_at: new Date().toISOString(),
      }

      // Cherche si la commande existe deja (par odoo_id)
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('odoo_id', po.odooId)
        .maybeSingle()

      let orderId
      if (existing) {
        // UPDATE
        const { error } = await supabase
          .from('orders')
          .update(orderRow)
          .eq('id', existing.id)
        if (error) throw error
        orderId = existing.id
        updated++
      } else {
        // INSERT
        const { data, error } = await supabase
          .from('orders')
          .insert(orderRow)
          .select('id')
          .single()
        if (error) throw error
        orderId = data.id
        added++
      }

      // 2. Supprime les anciens items et leurs steps (cascade)
      // (Plus simple que de diff : on remplace tout)
      await supabase.from('order_items').delete().eq('order_id', orderId)

      // 3. Insert les nouveaux items
      const itemRows = po.items.map((item, idx) => ({
        order_id: orderId,
        item_idx: idx,
        type: item.type,
        title: item.title,
        theme: item.theme,
        message: item.message,
        age: item.age,
        parfum: item.parfums && item.parfums.length === 1 ? item.parfums[0] : null,
        parfums: item.parfums || [],
        etages_count: item.etages,
        pers: item.pers,
        taille_value: item.taille_value,
        taille_unit: null,
        warnings: item.warnings || [],
        quantity: item.quantity,
      }))

      if (itemRows.length > 0) {
        const { error } = await supabase.from('order_items').insert(itemRows)
        if (error) throw error
      }
    } catch (e) {
      console.error(`[sync] Erreur sur ${po.orderNum}:`, e.message)
      errors.push({ orderNum: po.orderNum, error: e.message })
    }
  }

  return { added, updated, errors_count: errors.length, errors }
}
