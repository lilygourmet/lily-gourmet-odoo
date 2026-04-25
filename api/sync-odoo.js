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
    console.log(`[sync] ${orders.length} commandes (sale+cancel), ${lines.length} lignes`)

    const linesByOrderId = new Map()
    for (const line of lines) {
      const orderId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id
      if (!linesByOrderId.has(orderId)) linesByOrderId.set(orderId, [])
      linesByOrderId.get(orderId).push(line)
    }

    const parsed = parseOdooOrders(orders, linesByOrderId)
    console.log(`[sync] ${parsed.length} commandes avec items CD/GM`)

    enrichWithLineIds(parsed, linesByOrderId)

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    console.log('[sync] Traitement images attachments...')
    const imagesByLineId = await syncLineAttachments(supabase, uid, parsed)

    applyImageFallback(parsed, imagesByLineId)

    const stats = await syncToSupabase(supabase, parsed)

    return res.status(200).json({
      success: true,
      duration_ms: Date.now() - startTime,
      odoo_orders_fetched: orders.length,
      orders_with_cd_gm: parsed.length,
      lines_with_images: imagesByLineId.size,
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

  // On fetch sale + cancel pour pouvoir afficher les annulees barrees
  const orders = await odooSearchRead(uid, 'sale.order',
    [
      ['state', 'in', ['sale', 'cancel']],
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
// MATCHING : retrouve le line_id de chaque item parse
// ==========================================

function enrichWithLineIds(parsedOrders, linesByOrderId) {
  for (const po of parsedOrders) {
    const odooLines = linesByOrderId.get(po.odooId) || []

    const cdGmLines = odooLines.filter(line => {
      const trimmed = (line.name || '').trim()
      if (!/^(CD-|GM-)/i.test(trimmed)) return false
      if (/^(CD-|GM-)\s*Bougies/i.test(trimmed)) return false
      if (/D[ée]coration\s+suppl[ée]mentaire/i.test(trimmed)) return false
      const qty = parseFloat(line.product_uom_qty) || 0
      if (qty === 0) return false
      return true
    })

    po.items.forEach((item, idx) => {
      const odooLine = cdGmLines[idx]
      if (odooLine) {
        item.lineId = odooLine.id
        item.productId = Array.isArray(odooLine.product_id) ? odooLine.product_id[0] : null
      } else {
        item.lineId = null
        item.productId = null
      }
    })
  }
}

// ==========================================
// FETCH + UPLOAD ATTACHMENTS DES LIGNES
// ==========================================

async function syncLineAttachments(supabase, uid, parsedOrders) {
  const result = new Map()

  const lineIds = []
  for (const po of parsedOrders) {
    for (const item of po.items) {
      if (item.lineId) lineIds.push(item.lineId)
    }
  }
  if (lineIds.length === 0) return result

  const allAttachments = []
  const batchSize = 100
  for (let i = 0; i < lineIds.length; i += batchSize) {
    const batch = lineIds.slice(i, i + batchSize)
    const atts = await odooSearchRead(uid, 'ir.attachment',
      [
        ['res_model', '=', 'sale.order.line'],
        ['res_id', 'in', batch],
        ['mimetype', 'ilike', 'image/'],
      ],
      ['id', 'res_id', 'name', 'mimetype', 'file_size'],
      {}
    )
    allAttachments.push(...atts)
  }

  console.log(`[sync] ${allAttachments.length} attachments image trouves`)
  if (allAttachments.length === 0) return result

  const attsByLineId = new Map()
  for (const att of allAttachments) {
    const lineId = att.res_id
    if (!attsByLineId.has(lineId)) attsByLineId.set(lineId, [])
    attsByLineId.get(lineId).push(att)
  }

  const { data: existingFiles, error: listErr } = await supabase
    .storage.from(STORAGE_BUCKET).list('', { limit: 5000 })

  const existingSet = new Set()
  if (!listErr && existingFiles) {
    for (const f of existingFiles) existingSet.add(f.name)
  }

  const toDownload = []
  for (const att of allAttachments) {
    const ext = guessExt(att.mimetype)
    const fileName = `line_${att.res_id}_att_${att.id}.${ext}`
    if (!existingSet.has(fileName)) {
      toDownload.push({ att, fileName })
    }
  }

  console.log(`[sync] ${toDownload.length} images a telecharger depuis Odoo`)

  if (toDownload.length > 0) {
    const dlBatchSize = 10
    for (let i = 0; i < toDownload.length; i += dlBatchSize) {
      const slice = toDownload.slice(i, i + dlBatchSize)
      const ids = slice.map(s => s.att.id)
      const datas = await odooRead(uid, 'ir.attachment', ids, ['datas'])

      for (let j = 0; j < slice.length; j++) {
        const { att, fileName } = slice[j]
        const data = datas.find(d => d.id === att.id)
        if (!data?.datas) continue

        const buffer = Buffer.from(data.datas, 'base64')
        const { error: upErr } = await supabase
          .storage.from(STORAGE_BUCKET)
          .upload(fileName, buffer, {
            contentType: att.mimetype,
            upsert: true,
          })
        if (upErr) {
          console.error(`[sync] Erreur upload ${fileName}: ${upErr.message}`)
        }
      }
    }
  }

  for (const [lineId, atts] of attsByLineId) {
    const urls = []
    for (const att of atts) {
      const ext = guessExt(att.mimetype)
      const fileName = `line_${lineId}_att_${att.id}.${ext}`
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName)
      if (data?.publicUrl) urls.push(data.publicUrl)
    }
    if (urls.length > 0) result.set(lineId, urls)
  }

  return result
}

function guessExt(mimetype) {
  if (!mimetype) return 'bin'
  if (mimetype.includes('jpeg') || mimetype.includes('jpg')) return 'jpg'
  if (mimetype.includes('png')) return 'png'
  if (mimetype.includes('webp')) return 'webp'
  if (mimetype.includes('gif')) return 'gif'
  if (mimetype.includes('heic')) return 'heic'
  return 'bin'
}

// ==========================================
// FALLBACK : GM- sans photo prend les photos des CD- de la commande
// ==========================================

function applyImageFallback(parsedOrders, imagesByLineId) {
  for (const po of parsedOrders) {
    const cdImages = []
    for (const item of po.items) {
      if (item.type === 'CD' && item.lineId) {
        const urls = imagesByLineId.get(item.lineId)
        if (urls && urls.length > 0) cdImages.push(...urls)
      }
    }

    for (const item of po.items) {
      const ownUrls = item.lineId ? imagesByLineId.get(item.lineId) : null
      if (ownUrls && ownUrls.length > 0) {
        item.image_urls = ownUrls
      } else if (item.type === 'GM' && cdImages.length > 0) {
        item.image_urls = [...cdImages]
      } else {
        item.image_urls = []
      }
    }
  }
}

// ==========================================
// DETECTION DES MODIFICATIONS
// ==========================================

// Champs qu'on suit pour la detection de modifications
const TRACKED_FIELDS = [
  'title', 'theme', 'message', 'age', 'parfums',
  'etages_count', 'pers', 'taille_value',
  'quantity', 'image_urls', 'warnings',
]

// Compare 2 valeurs (gere arrays/objets via JSON)
function isEqual(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

// Renvoie un objet avec les champs modifies (avant/apres)
// Ex: { title: { from: "x", to: "y" }, parfums: { from: [...], to: [...] } }
function diffItems(existingItem, newRow) {
  const changes = {}

  // Mapping entre les champs JS du parser et les colonnes Supabase
  const fieldMap = {
    title: 'title',
    theme: 'theme',
    message: 'message',
    age: 'age',
    parfums: 'parfums',
    etages_count: 'etages_count',
    pers: 'pers',
    taille_value: 'taille_value',
    quantity: 'quantity',
    image_urls: 'image_urls',
    warnings: 'warnings',
  }

  for (const field of TRACKED_FIELDS) {
    const col = fieldMap[field]
    const oldVal = existingItem[col]
    const newVal = newRow[col]
    if (!isEqual(oldVal, newVal)) {
      changes[field] = { from: oldVal, to: newVal }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

// ==========================================
// SYNC SUPABASE (intelligent + diff)
// ==========================================

async function syncToSupabase(supabase, parsedOrders) {
  let added = 0
  let updated = 0
  let cancelled = 0
  let itemsAdded = 0
  let itemsUpdated = 0
  let itemsModified = 0  // nb d'items qui ont eu un changement detecte
  let itemsDeleted = 0
  let warningResets = 0
  const errors = []

  for (const po of parsedOrders) {
    try {
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
        .select('id, odoo_state')
        .eq('odoo_id', po.odooId)
        .maybeSingle()

      let orderId
      let isNewOrder = false
      if (existingOrder) {
        const { error } = await supabase
          .from('orders').update(orderRow).eq('id', existingOrder.id)
        if (error) throw error
        orderId = existingOrder.id
        // Comptage : si l'etat passe a 'cancel', on incrémente cancelled
        if (po.odooState === 'cancel' && existingOrder.odoo_state !== 'cancel') {
          cancelled++
        }
        updated++
      } else {
        const { data, error } = await supabase
          .from('orders').insert(orderRow).select('id').single()
        if (error) throw error
        orderId = data.id
        isNewOrder = true
        added++
      }

      // Recupere TOUS les champs des items existants pour faire le diff
      const { data: existingItems } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)

      const existingByIdx = new Map()
      for (const it of (existingItems || [])) existingByIdx.set(it.item_idx, it)

      const newIdxSet = new Set()
      const orderChanges = {}  // resume des changements au niveau commande
      let orderHasChanges = false

      for (let idx = 0; idx < po.items.length; idx++) {
        const item = po.items[idx]
        newIdxSet.add(idx)

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
          image_urls: item.image_urls || [],
          quantity: item.quantity,
        }

        const existing = existingByIdx.get(idx)
        if (existing) {
          // Detection des modifications
          const changes = diffItems(existing, itemBaseRow)

          const updateRow = { ...itemBaseRow }
          if (changes) {
            updateRow.last_changes = changes
            updateRow.modified_at = new Date().toISOString()
            itemsModified++
            orderChanges[`item_${idx}`] = Object.keys(changes)
            orderHasChanges = true
          }

          const { error } = await supabase
            .from('order_items')
            .update(updateRow)
            .eq('id', existing.id)
          if (error) throw error
          itemsUpdated++

          // Reset warning_reads si warning a change
          const oldWarnings = JSON.stringify(existing.warnings || [])
          const newWarnings = JSON.stringify(item.warnings || [])
          if (oldWarnings !== newWarnings) {
            await supabase.from('warning_reads').delete().eq('item_id', existing.id)
            warningResets++
          }
        } else {
          // Nouvel item
          const fullRow = {
            order_id: orderId,
            item_idx: idx,
            ...itemBaseRow,
          }
          const { error } = await supabase.from('order_items').insert(fullRow)
          if (error) throw error
          itemsAdded++
          // Si la commande existait deja mais qu'un item est ajoute, c'est une modif
          if (!isNewOrder) {
            orderChanges[`item_${idx}`] = ['ajoute']
            orderHasChanges = true
          }
        }
      }

      // Items supprimes
      for (const [idx, existing] of existingByIdx) {
        if (!newIdxSet.has(idx)) {
          await supabase.from('order_items').delete().eq('id', existing.id)
          itemsDeleted++
          orderChanges[`item_${idx}`] = ['supprime']
          orderHasChanges = true
        }
      }

      // Met a jour le drapeau "modifie" au niveau commande (si pas nouveau et qu'il y a eu changement)
      if (!isNewOrder && orderHasChanges) {
        await supabase
          .from('orders')
          .update({
            modified_at: new Date().toISOString(),
            last_changes_summary: orderChanges,
          })
          .eq('id', orderId)
      }
    } catch (e) {
      console.error(`[sync] Erreur sur ${po.orderNum}:`, e.message)
      errors.push({ orderNum: po.orderNum, error: e.message })
    }
  }

  return {
    added,
    updated,
    cancelled,
    items_added: itemsAdded,
    items_updated: itemsUpdated,
    items_modified: itemsModified,
    items_deleted: itemsDeleted,
    warning_resets: warningResets,
    errors_count: errors.length,
    errors,
  }
}
