// Serverless function Vercel - Sync Odoo -> Supabase
// Endpoint: POST /api/sync-odoo
// Auth: header "Authorization: Bearer <SYNC_SECRET_TOKEN>" OU ?token=...

import { createClient } from '@supabase/supabase-js'
import { parseOdooOrders } from '../src/lib/odooParser.js'

const STORAGE_BUCKET = 'product-images'

// ==========================================
// HANDLER PRINCIPAL
// ==========================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verification du token
  const authHeader = req.headers['authorization'] || ''
  const tokenFromHeader = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim() : ''
  const tokenFromQuery = (req.query?.token || '').toString().trim()
  const providedToken = tokenFromHeader || tokenFromQuery

  if (!process.env.SYNC_SECRET_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: SYNC_SECRET_TOKEN missing' })
  }
  if (providedToken !== process.env.SYNC_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const startTime = Date.now()

  try {
    console.log('[sync] Authentification Odoo...')
    const uid = await odooAuthenticate()

    console.log('[sync] Recuperation commandes Odoo...')
    const { orders, lines } = await fetchOdooOrders(uid)
    console.log(`[sync] ${orders.length} commandes, ${lines.length} lignes`)

    // Group lignes par order_id (et garde aussi product_id par ligne)
    const linesByOrderId = new Map()
    for (const line of lines) {
      const orderId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id
      if (!linesByOrderId.has(orderId)) linesByOrderId.set(orderId, [])
      linesByOrderId.get(orderId).push(line)
    }

    const parsed = parseOdooOrders(orders, linesByOrderId)
    console.log(`[sync] ${parsed.length} commandes avec items CD/GM`)

    // Pour chaque item parse, on retrouve son product_id (depuis la ligne Odoo correspondante)
    // Le parser ne le fait pas, on l'ajoute ici en faisant le matching par titre/index
    enrichWithProductIds(parsed, linesByOrderId)

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Upload des images produits (avec cache pour ne pas re-uploader)
    console.log('[sync] Traitement images produits...')
    const productImageUrls = await syncProductImages(supabase, uid, parsed)
    console.log(`[sync] ${productImageUrls.size} images en cache`)

    // Sync vers Supabase
    const stats = await syncToSupabase(supabase, parsed, productImageUrls)

    return res.status(200).json({
      success: true,
      duration_ms: Date.now() - startTime,
      odoo_orders_fetched: orders.length,
      orders_with_cd_gm: parsed.length,
      images_in_cache: productImageUrls.size,
      ...stats,
    })
  } catch (e) {
    console.error('[sync] ERREUR:', e)
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
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}: ${await r.text()}`)
  const data = await r.json()
  if (data.error) throw new Error(`Odoo error: ${data.error.data?.message || data.error.message}`)
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
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
    model, 'search_read', [domain, fields], opts,
  ])
}

async function odooRead(uid, model, ids, fields) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
    model, 'read', [ids], { fields },
  ])
}

async function fetchOdooOrders(uid) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in14Days = new Date(today)
  in14Days.setDate(in14Days.getDate() + 14)

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const dateStart = fmtDate(today)
  const dateEnd = fmtDate(new Date(in14Days.getTime() + 86399999))

  const orders = await odooSearchRead(uid, 'sale.order',
    [
      ['state', '=', 'sale'],
      ['commitment_date', '>=', dateStart],
      ['commitment_date', '<=', dateEnd],
    ],
    ['id', 'name', 'partner_id', 'commitment_date', 'livraison_hour', 'state', 'note', 'order_line'],
    { order: 'commitment_date asc', limit: 500 }
  )

  const allLineIds = []
  for (const o of orders) {
    if (Array.isArray(o.order_line)) allLineIds.push(...o.order_line)
  }

  let lines = []
  if (allLineIds.length > 0) {
    lines = await odooSearchRead(uid, 'sale.order.line',
      [['id', 'in', allLineIds]],
      ['id', 'order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit'],
      {}
    )
  }
  return { orders, lines }
}

// ==========================================
// MATCHING : retrouve le product_id Odoo de chaque item parse
// ==========================================

function enrichWithProductIds(parsedOrders, linesByOrderId) {
  for (const po of parsedOrders) {
    const odooLines = linesByOrderId.get(po.odooId) || []

    // On filtre les lignes Odoo qui correspondent a un item CD/GM (meme logique que le parser)
    const cdGmLines = odooLines.filter(line => {
      const trimmed = (line.name || '').trim()
      if (!/^(CD-|GM-)/i.test(trimmed)) return false
      if (/^(CD-|GM-)\s*Bougies/i.test(trimmed)) return false
      if (/D[ée]coration\s+suppl[ée]mentaire/i.test(trimmed)) return false
      const qty = parseFloat(line.product_uom_qty) || 0
      if (qty === 0) return false
      return true
    })

    // On match par index : le i-eme item parse correspond a la i-eme ligne CD/GM
    po.items.forEach((item, idx) => {
      const odooLine = cdGmLines[idx]
      if (odooLine && Array.isArray(odooLine.product_id)) {
        item.productId = odooLine.product_id[0]
      } else {
        item.productId = null
      }
    })
  }
}

// ==========================================
// SYNC IMAGES PRODUITS (avec cache)
// ==========================================

async function syncProductImages(supabase, uid, parsedOrders) {
  // Map<productId, publicUrl>
  const result = new Map()

  // 1. Recolte tous les productId distincts
  const productIds = new Set()
  for (const po of parsedOrders) {
    for (const item of po.items) {
      if (item.productId) productIds.add(item.productId)
    }
  }

  if (productIds.size === 0) return result

  // 2. Pour chaque productId, on regarde si on a deja l'image dans le bucket
  // On nomme les fichiers comme product_<id>.jpg
  const fileNames = Array.from(productIds).map(pid => `product_${pid}.jpg`)

  // List les fichiers existants dans le bucket
  const { data: existingFiles, error: listErr } = await supabase
    .storage.from(STORAGE_BUCKET).list('', { limit: 1000 })

  const existingSet = new Set()
  if (!listErr && existingFiles) {
    for (const f of existingFiles) existingSet.add(f.name)
  }

  // 3. Pour ceux qui manquent, on telecharge depuis Odoo et upload dans Supabase
  const missingProductIds = Array.from(productIds).filter(pid => !existingSet.has(`product_${pid}.jpg`))

  if (missingProductIds.length > 0) {
    console.log(`[sync] ${missingProductIds.length} images a telecharger depuis Odoo`)

    // Recupere les images en batch (limite a 50 par appel pour eviter timeout)
    const batchSize = 20
    for (let i = 0; i < missingProductIds.length; i += batchSize) {
      const batch = missingProductIds.slice(i, i + batchSize)
      const products = await odooRead(uid, 'product.product', batch, ['id', 'image_1024'])

      for (const p of products) {
        if (!p.image_1024) continue
        const fileName = `product_${p.id}.jpg`
        // Decode base64 -> Buffer
        const buffer = Buffer.from(p.image_1024, 'base64')
        const { error: uploadErr } = await supabase
          .storage.from(STORAGE_BUCKET)
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          })
        if (uploadErr) {
          console.error(`[sync] Erreur upload image ${fileName}:`, uploadErr.message)
        }
      }
    }
  }

  // 4. Genere les URLs publiques pour tous les productIds (existants + nouveaux)
  for (const pid of productIds) {
    const fileName = `product_${pid}.jpg`
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName)
    if (data?.publicUrl) result.set(pid, data.publicUrl)
  }

  return result
}

// ==========================================
// SYNC SUPABASE (intelligent)
// ==========================================

async function syncToSupabase(supabase, parsedOrders, productImageUrls) {
  let added = 0
  let updated = 0
  let itemsAdded = 0
  let itemsUpdated = 0
  let itemsDeleted = 0
  let warningResets = 0
  const errors = []

  for (const po of parsedOrders) {
    try {
      // ==========================================
      // 1) UPSERT order (sans toucher seller_*)
      // ==========================================
      const orderRow = {
        order_num: po.orderNum,
        client_name: po.clientName,
        delivery_at: po.deliveryAt.toISOString(),
        delivery_slot: po.deliverySlot,
        odoo_id: po.odooId,
        odoo_state: po.odooState,
        synced_at: new Date().toISOString(),
      }

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('odoo_id', po.odooId)
        .maybeSingle()

      let orderId
      if (existingOrder) {
        const { error } = await supabase
          .from('orders').update(orderRow).eq('id', existingOrder.id)
        if (error) throw error
        orderId = existingOrder.id
        updated++
      } else {
        const { data, error } = await supabase
          .from('orders').insert(orderRow).select('id').single()
        if (error) throw error
        orderId = data.id
        added++
      }

      // ==========================================
      // 2) SYNC items (intelligent : par item_idx)
      // ==========================================

      // Recupere les items existants pour cette commande
      const { data: existingItems } = await supabase
        .from('order_items')
        .select('id, item_idx, warnings')
        .eq('order_id', orderId)

      const existingByIdx = new Map()
      for (const it of (existingItems || [])) {
        existingByIdx.set(it.item_idx, it)
      }

      // Pour chaque item parse, on UPDATE ou INSERT
      const newIdxSet = new Set()
      for (let idx = 0; idx < po.items.length; idx++) {
        const item = po.items[idx]
        newIdxSet.add(idx)

        const imageUrl = item.productId ? productImageUrls.get(item.productId) : null
        const imageUrls = imageUrl ? [imageUrl] : []

        const itemBaseRow = {
          type: item.type,
          title: item.title,
          theme: item.theme,
          message: item.message,
          age: item.age,
          parfum: item.parfums?.length === 1 ? item.parfums[0] : null,
          parfums: item.parfums || [],
          etages_count: item.etages,
          pers: item.pers,
          taille_value: item.taille_value,
          taille_unit: null,
          warnings: item.warnings || [],
          image_urls: imageUrls,
          quantity: item.quantity,
        }

        const existing = existingByIdx.get(idx)
        if (existing) {
          // UPDATE : on ne touche PAS a polys, delivered_at, delivered_by
          const { error } = await supabase
            .from('order_items')
            .update(itemBaseRow)
            .eq('id', existing.id)
          if (error) throw error
          itemsUpdated++

          // Si le warning a change, reset des warning_reads
          const oldWarnings = JSON.stringify(existing.warnings || [])
          const newWarnings = JSON.stringify(item.warnings || [])
          if (oldWarnings !== newWarnings) {
            await supabase.from('warning_reads').delete().eq('item_id', existing.id)
            warningResets++
          }
        } else {
          // INSERT : nouveau item
          const fullRow = {
            order_id: orderId,
            item_idx: idx,
            ...itemBaseRow,
          }
          const { error } = await supabase.from('order_items').insert(fullRow)
          if (error) throw error
          itemsAdded++
        }
      }

      // Items qui n'existent plus dans Odoo : DELETE
      for (const [idx, existing] of existingByIdx) {
        if (!newIdxSet.has(idx)) {
          await supabase.from('order_items').delete().eq('id', existing.id)
          itemsDeleted++
        }
      }
    } catch (e) {
      console.error(`[sync] Erreur sur ${po.orderNum}:`, e.message)
      errors.push({ orderNum: po.orderNum, error: e.message })
    }
  }

  return {
    added,
    updated,
    items_added: itemsAdded,
    items_updated: itemsUpdated,
    items_deleted: itemsDeleted,
    warning_resets: warningResets,
    errors_count: errors.length,
    errors,
  }
}
