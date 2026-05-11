// ============================================================
// Serverless function Vercel : sync MO Cake Design Odoo -> Supabase
// Endpoint POST /api/sync-freezer (avec Authorization: Bearer SYNC_SECRET_TOKEN)
// Aussi appele automatiquement par cron Vercel toutes les 10 minutes.
// Synchronise les MO WHLVP du jour J au jour J+14 dans la table freezer_mos.
// ============================================================
import { createClient } from '@supabase/supabase-js'

async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const body = { jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }
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

async function odooAuth() {
  const uid = await odooJsonRpc('common', 'authenticate', [
    process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD, {},
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

// Parse les noms de produits cakedesign Odoo
function parseCakedesign(productName) {
  if (!productName) return null
  if (/ganache\s+cakedesign/i.test(productName)) return null

  // Rond : "15 cm cakedesign (Vanille)" ou "20 cm CD* (Citron)"
  let m = productName.match(/(\d+)\s*cm\s+(?:CD\*?|cakedesign)\s*\(([^)]+)\)/i)
  if (m) return { taille: `${m[1]} cm`, parfum: m[2].trim() }

  // Carre : "40x40 Cakedesign CD* (Praline)" ou "35x35 cakedesign (Praline)"
  m = productName.match(/(\d+)\s*x\s*(\d+)\s*cakedesign(?:\s+CD\*?)?\s*\(([^)]+)\)/i)
  if (m) return { taille: `${m[1]}×${m[2]}`, parfum: m[3].trim() }

  // Plaque supreme amande
  if (/cakedesign\s+plaque\s+supreme\s+amande/i.test(productName)) {
    return { taille: 'Plaque suprême amande', parfum: '' }
  }
  return null
}

// Fetch MO + parents + sale.order en BULK sur toute la fenetre (1 appel par modele)
// au lieu d'une boucle 3 calls par date. Bien plus rapide.
async function fetchAllItemsBulk(uid, dates) {
  if (dates.length === 0) return []

  // 1) Calcul de la fenetre totale (min et max des dates)
  const sorted = [...dates].sort()
  const startUTC = `${sorted[0]} 00:00:00`
  const endUTC = `${sorted[sorted.length - 1]} 23:59:59`

  // 2) Tous les MOs WHLVP non termines de la fenetre, en 1 seul appel
  const productions = await odooSearchRead(uid, 'mrp.production', [
    ['date_planned_finished', '>=', startUTC],
    ['date_planned_finished', '<=', endUTC],
    ['state', 'not in', ['cancel', 'done']],
    ['name', 'ilike', 'WHLVP'],
  ], ['id', 'name', 'origin', 'state', 'product_id', 'product_qty', 'date_planned_finished'])

  if (!productions.length) return []

  // 3) Filtre sur les MO enfants au format cakedesign
  const childMos = []
  for (const p of productions) {
    const productName = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
    const parsed = parseCakedesign(productName)
    if (!parsed) continue
    const finishedAt = p.date_planned_finished
      ? new Date(p.date_planned_finished.replace(' ', 'T') + 'Z')
      : null
    if (!finishedAt) continue
    const date = `${finishedAt.getFullYear()}-${String(finishedAt.getMonth() + 1).padStart(2, '0')}-${String(finishedAt.getDate()).padStart(2, '0')}`
    childMos.push({
      id: p.id,
      name: p.name,
      productName,
      productQty: p.product_qty || 1,
      origin: p.origin || '',
      state: p.state,
      taille: parsed.taille,
      parfum: parsed.parfum,
      date,
    })
  }
  if (childMos.length === 0) return []

  // 4) Trouver les parents pour scode + productName parent (1 appel batch)
  const parentNames = [...new Set(childMos.map(c => c.origin).filter(o => /^WHLVP\/MO\//i.test(o)))]
  const parentMap = {}
  if (parentNames.length > 0) {
    const parents = await odooSearchRead(uid, 'mrp.production',
      [['name', 'in', parentNames]],
      ['id', 'name', 'origin', 'product_id']
    )
    for (const par of parents) {
      const m = (par.origin || '').match(/S\d{3,}/i)
      const parentProductName = Array.isArray(par.product_id) ? par.product_id[1] : ''
      parentMap[par.name] = {
        scode: m ? m[0].toUpperCase() : '',
        productName: parentProductName,
      }
    }
  }

  // 5) Heures de livraison via sale.order (1 appel batch)
  const scodes = [...new Set(Object.values(parentMap).map(p => p.scode).filter(Boolean))]
  const orderInfo = {}
  if (scodes.length > 0) {
    const orders = await odooSearchRead(uid, 'sale.order',
      [['name', 'in', scodes]],
      ['name', 'commitment_date', 'partner_id']
    )
    for (const o of orders) orderInfo[o.name] = o
  }

  // 6) Construire les items finaux
  const items = []
  for (const child of childMos) {
    const parent = parentMap[child.origin] || { scode: '', productName: '' }
    const scode = parent.scode
    let parfum = child.parfum
    if (!parfum && parent.productName) {
      const pm = parent.productName.match(/\(([^,)]+)(?:,\s*([^)]+))?\)/)
      if (pm) parfum = (pm[2] || pm[1] || '').trim()
    }
    if (!scode) continue   // pas de scode = stock, on ignore

    const ord = orderInfo[scode]
    let hour = 0, minute = 0, clientName = ''
    if (ord) {
      if (ord.commitment_date) {
        try {
          const dt = new Date(ord.commitment_date.replace(' ', 'T') + 'Z')
          if (!isNaN(dt.getTime())) {
            hour = dt.getHours()
            minute = dt.getMinutes()
          }
        } catch {}
      }
      clientName = Array.isArray(ord.partner_id) ? ord.partner_id[1] : ''
    }

    items.push({
      mo_id: child.id,
      mo_name: child.name,
      date: child.date,
      taille: child.taille,
      parfum: parfum || '',
      scode,
      client_name: clientName,
      hour,
      minute,
      qty: Math.max(1, Math.round(child.productQty || 1)),
      odoo_state: child.state,
    })
  }

  return items
}

// ============================================================
// Handler principal
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const startTime = Date.now()

  // Auth :
  //  - Header Bearer ou ?token=... : sync forcee
  //  - Sans token : autorise UNIQUEMENT si la derniere sync date de plus de 5 min
  //    (rate-limit naturel : empeche le spam mais permet l'auto-sync depuis l'app)
  //  - Header x-vercel-cron : appel automatique depuis cron Vercel (si plan Pro)
  const authHeader = req.headers['authorization'] || ''
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : ''
  const tokenFromQuery = (req.query?.token || '').toString().trim()
  const providedToken = tokenFromHeader || tokenFromQuery
  const isCron = req.headers['x-vercel-cron'] === '1'
  const hasValidToken = providedToken && providedToken === process.env.SYNC_SECRET_TOKEN

  if (!process.env.SYNC_SECRET_TOKEN) {
    return res.status(500).json({ error: 'SYNC_SECRET_TOKEN missing' })
  }

  // Si pas de token valide et pas un cron, on accepte uniquement si la derniere
  // sync date de plus de 5 minutes (anti-spam)
  if (!isCron && !hasValidToken) {
    try {
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      )
      const { data: lastRow } = await supabase
        .from('freezer_mos')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastRow && lastRow.synced_at) {
        const lastTs = new Date(lastRow.synced_at).getTime()
        if (Date.now() - lastTs < 5 * 60 * 1000) {
          return res.status(429).json({
            error: 'Sync trop recente',
            last_sync: lastRow.synced_at,
            retry_after_seconds: Math.ceil((5 * 60 * 1000 - (Date.now() - lastTs)) / 1000),
          })
        }
      }
    } catch (e) {
      console.warn('[sync-freezer] rate-limit check error:', e.message)
      // En cas d'erreur, on bloque par defaut
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Construit la liste des dates J0 a J+13 (14 jours)
    const today = new Date()
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dates = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      dates.push(fmt(d))
    }

    console.log('[sync-freezer] Auth Odoo...')
    const uid = await odooAuth()

    console.log('[sync-freezer] Fetch MOs en bulk pour 14 jours...')
    const items = await fetchAllItemsBulk(uid, dates)
    console.log(`[sync-freezer] ${items.length} items recuperes`)

    // Upsert en bulk dans Supabase
    const rows = items.map(it => ({
      mo_id: it.mo_id,
      mo_name: it.mo_name,
      date: it.date,
      taille: it.taille,
      parfum: it.parfum,
      scode: it.scode,
      client_name: it.client_name,
      hour: it.hour,
      minute: it.minute,
      qty: it.qty,
      odoo_state: it.odoo_state,
      synced_at: new Date().toISOString(),
    }))

    // Supprime les MO de la fenetre qui n'existent plus dans Odoo (terminees, annulees)
    const liveIds = new Set(items.map(i => i.mo_id))
    const { data: dbExisting } = await supabase
      .from('freezer_mos')
      .select('mo_id')
      .gte('date', dates[0])
      .lte('date', dates[dates.length - 1])

    const toDelete = (dbExisting || [])
      .map(r => r.mo_id)
      .filter(id => !liveIds.has(id))

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('freezer_mos')
        .delete()
        .in('mo_id', toDelete)
      if (delErr) console.warn('[sync-freezer] Delete error:', delErr.message)
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('freezer_mos')
        .upsert(rows, { onConflict: 'mo_id' })
      if (error) throw new Error(`Supabase upsert: ${error.message}`)
    }

    return res.status(200).json({
      success: true,
      duration_ms: Date.now() - startTime,
      items_count: items.length,
      deleted_count: toDelete.length,
      dates: [dates[0], dates[dates.length - 1]],
    })
  } catch (e) {
    console.error('[sync-freezer] ERREUR:', e)
    return res.status(500).json({ success: false, error: e.message })
  }
}
