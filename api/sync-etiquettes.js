// Serverless function Vercel - Sync catalogue Etiquettes Odoo -> Supabase
// Endpoint: POST /api/sync-etiquettes
// Sync les product.template avec prefixes E-, GS-, SU- et leurs images
// Auth: header "Authorization: Bearer <SYNC_SECRET_TOKEN>" OU ?token=...

import { createClient } from '@supabase/supabase-js'

const STORAGE_BUCKET = 'etiquettes'

// Tailles standard pour les entremets (en personnes)
const ENTREMETS_SIZES = [5, 10, 15, 20]

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
    console.log('[sync-etiquettes] Authentification Odoo...')
    const uid = await odooAuthenticate()

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    console.log('[sync-etiquettes] Recuperation product.template Odoo...')
    const articles = await fetchEtiquettesArticles(uid)
    console.log(`[sync-etiquettes] ${articles.length} articles E-/GS-/SU- trouves`)

    console.log('[sync-etiquettes] Sync images vers Supabase Storage...')
    const imagesByTemplateId = await syncImages(supabase, uid, articles)

    console.log('[sync-etiquettes] Upsert dans Supabase...')
    const stats = await upsertArticles(supabase, articles, imagesByTemplateId)

    return res.status(200).json({
      success: true,
      duration_ms: Date.now() - startTime,
      total_articles: articles.length,
      ...stats,
    })
  } catch (e) {
    console.error('[sync-etiquettes] ERREUR:', e)
    return res.status(500).json({
      success: false,
      error: e.message,
      stack: e.stack,
    })
  }
}

// ==========================================
// ODOO JSON-RPC HELPERS
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

// ==========================================
// FETCH ARTICLES E-/GS-/SU-
// ==========================================

function detectCategory(name) {
  // Retire un prefixe Odoo eventuel comme [411] avant le test
  const clean = String(name || '').replace(/^\[\d+\]\s*/, '').trim()

  if (/^E-/i.test(clean)) return 'cd'
  if (/^GS-/i.test(clean)) return 'gs'
  if (/^SU-/i.test(clean)) return 'su'
  return null
}

async function fetchEtiquettesArticles(uid) {
  // On recupere TOUS les product.template puis on filtre par prefixe
  // (plus simple et fiable que de filtrer par nom dans Odoo)
  const all = await odooSearchRead(uid, 'product.template',
    [
      ['sale_ok', '=', true],
      ['active', '=', true],
    ],
    ['id', 'name', 'sale_ok', 'image_1024', 'sequence'],
    { limit: 5000 }
  )

  const result = []
  for (const t of all) {
    const cat = detectCategory(t.name)
    if (!cat) continue

    // Exclure les plateaux (trop gros, pas pour etiquettes)
    if (/plateau/i.test(t.name)) continue

    result.push({
      odoo_template_id: t.id,
      category: cat,
      name: t.name,
      sale_ok: !!t.sale_ok,
      image_b64: t.image_1024 || null,
      sequence: t.sequence || 0,
      // Tailles : pour les entremets uniquement (5/10/15/20 standard)
      // Tiramisu et autres exceptions seront geres cote UI selon ce qui existe
      sizes: cat === 'cd' ? ENTREMETS_SIZES : null,
    })
  }

  // Tri par categorie puis sequence puis nom
  result.sort((a, b) => {
    if (a.category !== b.category) {
      const order = { cd: 0, gs: 1, su: 2 }
      return order[a.category] - order[b.category]
    }
    if (a.sequence !== b.sequence) return a.sequence - b.sequence
    return a.name.localeCompare(b.name)
  })

  return result
}

// ==========================================
// SYNC IMAGES VERS SUPABASE STORAGE
// ==========================================

async function syncImages(supabase, uid, articles) {
  // Liste les images deja en storage pour eviter de re-uploader
  const { data: existing } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list('', { limit: 1000 })

  const existingFiles = new Set((existing || []).map(f => f.name))

  const imagesByTemplateId = new Map()
  let uploaded = 0
  let skipped = 0

  for (const article of articles) {
    const fileName = `${article.odoo_template_id}.jpg`
    const publicUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName).data.publicUrl

    if (existingFiles.has(fileName)) {
      // Image deja la, on garde l'URL
      imagesByTemplateId.set(article.odoo_template_id, publicUrl)
      skipped++
      continue
    }

    if (!article.image_b64) continue

    try {
      // Decoder base64 et uploader
      const buffer = Buffer.from(article.image_b64, 'base64')
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (upErr) {
        console.error(`[sync-etiquettes] Upload image ${fileName} echec:`, upErr.message)
        continue
      }

      imagesByTemplateId.set(article.odoo_template_id, publicUrl)
      uploaded++
    } catch (e) {
      console.error(`[sync-etiquettes] Erreur image ${fileName}:`, e.message)
    }
  }

  console.log(`[sync-etiquettes] Images: ${uploaded} uploadees, ${skipped} deja en cache`)
  return imagesByTemplateId
}

// ==========================================
// UPSERT VERS SUPABASE
// ==========================================

async function upsertArticles(supabase, articles, imagesByTemplateId) {
  const rows = articles.map(a => ({
    odoo_template_id: a.odoo_template_id,
    category: a.category,
    name: a.name,
    sale_ok: a.sale_ok,
    image_url: imagesByTemplateId.get(a.odoo_template_id) || null,
    sizes: a.sizes,
    display_order: a.sequence,
    synced_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('etiquettes_articles')
    .upsert(rows, { onConflict: 'odoo_template_id' })

  if (error) throw new Error(`Supabase upsert error: ${error.message}`)

  // Compte par categorie
  const byCategory = { cd: 0, gs: 0, su: 0 }
  for (const a of articles) byCategory[a.category]++

  return {
    upserted: rows.length,
    by_category: byCategory,
    images_count: imagesByTemplateId.size,
  }
}
