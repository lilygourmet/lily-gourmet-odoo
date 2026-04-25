import { supabase } from './supabase'

// Nettoie les caractères null / unicode invalides
function cleanStr(s) {
  if (typeof s !== 'string') return s
  return s.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}
function cleanArr(a) {
  return Array.isArray(a) ? a.map(cleanStr) : a
}

// ============================================================
// Helper : normaliser les dates pour comparaison
// ============================================================
function normalizeDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toISOString()
  } catch {
    return String(d)
  }
}

// ============================================================
// Helper : signature d'un item pour comparaison rapide
// ============================================================
function buildItemSignature(item) {
  return JSON.stringify({
    type: item.type,
    title: (item.title || '').trim(),
    etages: item.etages || null,
    pers: item.pers || null,
    parfums: (item.parfums || []).map(p => (p || '').trim()).slice().sort(),
    theme: (item.theme || '').trim(),
    message: (item.message || '').trim(),
    age: (item.age || '').trim(),
    warningText: (item.warningText || '').trim(),
    isGift: item.isGift || false,
    quantity: item.quantity || 1,
  })
}

function buildOrderSignature(order) {
  return JSON.stringify({
    clientName: (order.clientName || '').trim(),
    deliveryAt: normalizeDate(order.deliveryAt),
    sellerName: (order.sellerName || '').trim(),
    items: (order.items || []).map(buildItemSignature).sort(),
  })
}

function buildDbItemSignature(item) {
  return JSON.stringify({
    type: item.type,
    title: (item.title || '').trim(),
    etages: item.etages_count || null,
    pers: item.pers || null,
    parfums: (item.parfums || []).map(p => (p || '').trim()).slice().sort(),
    theme: (item.theme || '').trim(),
    message: (item.message || '').trim(),
    age: (item.age || '').trim(),
    warningText: (item.warnings?.text || '').trim(),
    isGift: item.warnings?.isGift || false,
    quantity: item.quantity || 1,
  })
}

function buildDbOrderSignature(dbOrder) {
  return JSON.stringify({
    clientName: (dbOrder.client_name || '').trim(),
    deliveryAt: normalizeDate(dbOrder.delivery_at),
    sellerName: (dbOrder.seller_name || '').trim(),
    items: (dbOrder.order_items || []).map(buildDbItemSignature).sort(),
  })
}

// ============================================================
// SAUVEGARDE (avec skip intelligent si rien n'a changé)
// ============================================================
export async function saveOrdersFromPdf(parsedOrders, pdfFilename, userId, forceReupload = false) {
  const result = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  for (const order of parsedOrders) {
    try {
      const { data: existing } = await supabase
        .from('orders')
        .select(`
          id, client_name, delivery_at, seller_name,
          order_items (id, type, title, etages_count, pers, parfums, theme, message, age, warnings, image_urls, quantity)
        `)
        .eq('order_num', order.orderNum)
        .maybeSingle()

      if (existing && !forceReupload) {
        const newSig = buildOrderSignature(order)
        const oldSig = buildDbOrderSignature(existing)
        if (newSig === oldSig) {
          result.skipped++
          continue
        }
      }

      let orderId

      if (existing) {
        const { error: updErr } = await supabase
          .from('orders')
          .update({
            client_name: cleanStr(order.clientName),
            delivery_at: order.deliveryAt,
            seller_name: cleanStr(order.sellerName),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)

        if (updErr) throw updErr
        orderId = existing.id

        await supabase.from('order_items').delete().eq('order_id', orderId)

        result.updated++
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('orders')
          .insert({
            order_num: order.orderNum,
            client_name: cleanStr(order.clientName),
            delivery_at: order.deliveryAt,
            seller_name: cleanStr(order.sellerName),
            uploaded_by: userId,
            pdf_filename: pdfFilename,
          })
          .select('id')
          .single()

        if (insErr) throw insErr
        orderId = inserted.id
        result.inserted++
      }

      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx]
        const imageUrls = item.image_urls || item.imageUrls || []

        console.log('🔍 Item:', item.title, '— quantity:', item.quantity)

        const { error: itemErr } = await supabase
          .from('order_items')
          .insert({
            order_id: orderId,
            item_idx: idx,
            type: item.type,
            title: cleanStr(item.title),
            etages_count: item.etages || null,
            pers: item.pers || null,
            parfums: cleanArr(item.parfums || []),
            theme: cleanStr(item.theme),
            message: cleanStr(item.message),
            age: cleanStr(item.age),
            warnings: {
              text: cleanStr(item.warningText) || null,
              isGift: item.isGift || false,
            },
            image_urls: imageUrls,
            quantity: item.quantity || 1,
          })

        if (itemErr) {
          console.error('❌ INSERT ERROR:', itemErr)
          throw itemErr
        }
      }
    } catch (err) {
      console.error(`❌ ${order.orderNum}`, err)
      result.errors.push({ orderNum: order.orderNum, error: err.message })
    }
  }

  return result
}

// Indique quelles commandes doivent être re-extraites (pour skip photos)
export async function getOrderNumsNeedingUpload(parsedOrders, forceReupload = false) {
  if (forceReupload) {
    return new Set(parsedOrders.map(o => o.orderNum))
  }

  const orderNums = parsedOrders.map(o => o.orderNum)
  if (orderNums.length === 0) return new Set()

  const { data: existing } = await supabase
    .from('orders')
    .select(`
      order_num, client_name, delivery_at, seller_name,
      order_items (id, type, title, etages_count, pers, parfums, theme, message, age, warnings, quantity)
    `)
    .in('order_num', orderNums)

  const existingByNum = new Map()
  for (const e of existing || []) {
    existingByNum.set(e.order_num, e)
  }

  const toUpload = new Set()
  for (const order of parsedOrders) {
    const old = existingByNum.get(order.orderNum)
    if (!old) {
      toUpload.add(order.orderNum)
      continue
    }
    const newSig = buildOrderSignature(order)
    const oldSig = buildDbOrderSignature(old)
    if (newSig !== oldSig) {
      toUpload.add(order.orderNum)
    }
  }
  return toUpload
}

// ============================================================
// SUPPRESSION D'UNE COMMANDE (admin)
// ============================================================
export async function deleteOrder(orderId) {
  const { data: order } = await supabase
    .from('orders')
    .select(`pdf_filename, order_items (image_urls)`)
    .eq('id', orderId)
    .single()

  if (order?.order_items) {
    const imagePaths = []
    for (const item of order.order_items) {
      if (Array.isArray(item.image_urls)) {
        for (const url of item.image_urls) {
          const match = url.match(/\/images\/([^?]+)/)
          if (match) imagePaths.push(match[1])
        }
      }
    }
    if (imagePaths.length > 0) {
      await supabase.storage.from('images').remove(imagePaths)
    }
  }

  const { error } = await supabase.from('orders').delete().eq('id', orderId)
  if (error) {
    console.error('❌ deleteOrder :', error)
    return false
  }
  return true
}

// ============================================================
// NETTOYAGE AUTO : supprimer commandes livrées il y a + de 14 jours
// ============================================================
export async function cleanupOldOrders() {
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
  fourteenDaysAgo.setHours(0, 0, 0, 0)

  const { data: oldOrders, error: fetchErr } = await supabase
    .from('orders')
    .select(`id, order_num, order_items (image_urls)`)
    .lt('delivery_at', fourteenDaysAgo.toISOString())

  if (fetchErr) {
    console.error('❌ cleanupOldOrders fetch :', fetchErr)
    return { deleted: 0, photos: 0 }
  }

  if (!oldOrders || oldOrders.length === 0) {
    return { deleted: 0, photos: 0 }
  }

  const imagePaths = []
  for (const o of oldOrders) {
    for (const item of o.order_items || []) {
      if (Array.isArray(item.image_urls)) {
        for (const url of item.image_urls) {
          const match = url.match(/\/images\/([^?]+)/)
          if (match) imagePaths.push(match[1])
        }
      }
    }
  }

  if (imagePaths.length > 0) {
    await supabase.storage.from('images').remove(imagePaths)
  }

  const orderIds = oldOrders.map(o => o.id)
  const { error: delErr } = await supabase.from('orders').delete().in('id', orderIds)

  if (delErr) {
    console.error('❌ cleanupOldOrders delete :', delErr)
    return { deleted: 0, photos: 0 }
  }

  console.log(`🧹 Nettoyage auto : ${oldOrders.length} commande(s) + ${imagePaths.length} photo(s) supprimée(s)`)
  return { deleted: oldOrders.length, photos: imagePaths.length }
}

// ============================================================
// LOAD d'une semaine
// ============================================================
export async function loadOrdersForWeek(monday) {
  const start = new Date(monday)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_num, client_name, delivery_at, seller_name,
      order_items (
        id, item_idx, type, title, etages_count, pers, parfums,
        theme, message, age, warnings, image_urls, polys, quantity
      )
    `)
    .gte('delivery_at', start.toISOString())
    .lt('delivery_at', end.toISOString())
    .order('delivery_at', { ascending: true })

  if (error) {
    console.error('❌ loadOrdersForWeek :', error)
    return []
  }

  return data || []
}

// ============================================================
// LOAD de toutes les commandes (pour la recherche)
// ============================================================
export async function loadAllOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_num, client_name, delivery_at, seller_name,
      order_items (
        id, item_idx, type, title, etages_count, pers, parfums,
        theme, message, age, warnings, image_urls, polys, quantity
      )
    `)
    .order('delivery_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('❌ loadAllOrders :', error)
    return []
  }

  return data || []
}

// ============================================================
// ITEM STEPS (checklist)
// ============================================================
export async function loadItemSteps(itemIds) {
  if (!itemIds || itemIds.length === 0) return {}

  const { data, error } = await supabase
    .from('item_steps')
    .select('item_id, step_key, done_by, done_at')
    .in('item_id', itemIds)
    .eq('done', true)

  if (error) {
    console.error('❌ loadItemSteps :', error)
    return {}
  }

  const map = {}
  for (const row of data || []) {
    map[`${row.item_id}_${row.step_key}`] = {
      done_by: row.done_by,
      done_at: row.done_at,
    }
  }
  return map
}

export async function loadStepsForOrders(orders) {
  const itemIds = []
  for (const order of orders) {
    for (const item of order.order_items || []) {
      itemIds.push(item.id)
    }
  }
  return loadItemSteps(itemIds)
}

export async function checkItemStep(itemId, stepKey, userId) {
  const { error } = await supabase
    .from('item_steps')
    .upsert({
      item_id: itemId,
      step_key: stepKey,
      done: true,
      done_by: userId,
      done_at: new Date().toISOString(),
    }, { onConflict: 'item_id,step_key' })

  if (error) {
    console.error('❌ checkItemStep :', error)
    return false
  }
  return true
}

export async function uncheckItemStep(itemId, stepKey) {
  const { error } = await supabase
    .from('item_steps')
    .delete()
    .eq('item_id', itemId)
    .eq('step_key', stepKey)

  if (error) {
    console.error('❌ uncheckItemStep :', error)
    return false
  }
  return true
}

// ============================================================
// WARNINGS (marquer comme lu)
// ============================================================
export async function loadWarningReads(itemIds) {
  if (!itemIds || itemIds.length === 0) return {}

  const { data, error } = await supabase
    .from('warning_reads')
    .select('item_id, read_by, read_at')
    .in('item_id', itemIds)

  if (error) {
    console.error('❌ loadWarningReads :', error)
    return {}
  }

  const map = {}
  for (const row of data || []) {
    if (!map[row.item_id]) map[row.item_id] = []
    map[row.item_id].push(row)
  }
  return map
}

export async function markWarningAsRead(itemId, userId) {
  const { error } = await supabase
    .from('warning_reads')
    .insert({
      item_id: itemId,
      read_by: userId,
      read_at: new Date().toISOString(),
    })

  if (error) {
    console.error('❌ markWarningAsRead :', error)
    return false
  }
  return true
}

// ============================================================
// POLYS (mise à jour par étage)
// ============================================================
export async function updateItemPolys(itemId, polysObj) {
  const { error } = await supabase
    .from('order_items')
    .update({ polys: polysObj || {} })
    .eq('id', itemId)

  if (error) {
    console.error('❌ updateItemPolys :', error)
    return false
  }
  return true
}

// Helper : lire la valeur d'un poly (gère ancien et nouveau format)
export function getPolyValue(polys, etageKey) {
  if (!polys || !polys[etageKey]) return null
  const p = polys[etageKey]
  if (typeof p === 'object') return p.value || null
  return p
}

// Helper : lire les métadonnées (done_by, done_at) d'un poly
export function getPolyInfo(polys, etageKey) {
  if (!polys || !polys[etageKey]) return null
  const p = polys[etageKey]
  if (typeof p === 'object') {
    return { value: p.value, done_by: p.done_by, done_at: p.done_at }
  }
  return { value: p, done_by: null, done_at: null }
}

// ============================================================
// PROFILES (noms des employés pour les logs)
// ============================================================
let profilesCache = null

export async function loadAllProfiles() {
  if (profilesCache) return profilesCache

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, role')

  if (error) {
    console.error('❌ loadAllProfiles :', error)
    return {}
  }

  const map = {}
  for (const p of data || []) {
    map[p.id] = p
  }
  profilesCache = map
  return map
}

export function clearProfilesCache() {
  profilesCache = null
}