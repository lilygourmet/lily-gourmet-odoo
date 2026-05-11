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

    // === DEBUG TEMPORAIRE : afficher les 5 premiers articles avec leur prix ===
    console.log('[sync-etiquettes][DEBUG] echantillon de 5 articles avec leur prix Odoo :')
    for (const a of articles.slice(0, 5)) {
      console.log(`  - [${a.category}] ${a.name} -> price: ${a.price} (type: ${typeof a.price})`)
    }
    // === FIN DEBUG ===

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
  // 1. Recupere TOUS les product.template puis filtre par prefixe
  const all = await odooSearchRead(uid, 'product.template',
    [
      ['sale_ok', '=', true],
      ['active', '=', true],
    ],
    ['id', 'name', 'sale_ok', 'image_1024', 'sequence', 'list_price'],
    { limit: 5000 }
  )

  const filtered = []
  for (const t of all) {
    const cat = detectCategory(t.name)
    if (cat === null) continue
    if (/plateau/i.test(t.name)) continue           // pas de plateaux
    if (/miss\s*pistache/i.test(t.name)) continue   // exclu
    if (/paris\s*brest/i.test(t.name)) continue     // exclu
    if (/maatouk/i.test(t.name)) continue           // exclu (Supreme amande/pistache Maatouk)
    if (/\btatin\b/i.test(t.name)) continue         // exclu

    filtered.push({
      odoo_template_id: t.id,
      category: cat,
      name: t.name,
      sale_ok: !!t.sale_ok,
      image_b64: t.image_1024 || null,
      sequence: t.sequence || 0,
      price: parseFloat(t.list_price) || 0,
      sizes: null,   // sera rempli juste apres pour les entremets
    })
  }

  // 2. Pour les entremets (cd) : recuperer les vraies tailles via les variantes
  const entremetsIds = filtered.filter(a => a.category === 'cd').map(a => a.odoo_template_id)
  if (entremetsIds.length > 0) {
    const sizesByTemplateId = await fetchEntremetsSizes(uid, entremetsIds)
    for (const article of filtered) {
      if (article.category === 'cd') {
        const sizes = sizesByTemplateId.get(article.odoo_template_id)
        // Si pas de variantes trouvees, fallback sur 5/10/15/20
        article.sizes = sizes && sizes.length > 0 ? sizes : ENTREMETS_SIZES
      }
    }
  }

  // 3. Tri par categorie puis alphabetique sur le nom (sans le prefixe [123])
  filtered.sort((a, b) => {
    if (a.category !== b.category) {
      const order = { cd: 0, gs: 1, su: 2 }
      return order[a.category] - order[b.category]
    }
    const cleanA = a.name.replace(/^\[\d+\]\s*/, '').trim()
    const cleanB = b.name.replace(/^\[\d+\]\s*/, '').trim()
    return cleanA.localeCompare(cleanB, 'fr')
  })

  return filtered
}

// Recupere les tailles reelles (en personnes) depuis les variantes Odoo
// Les tailles sont des "product.attribute.value" liees au template via attribute_line_ids
async function fetchEntremetsSizes(uid, templateIds) {
  const result = new Map()

  // 1. Recupere les attribute lines pour ces templates
  const attrLines = await odooSearchRead(uid, 'product.template.attribute.line',
    [
      ['product_tmpl_id', 'in', templateIds],
    ],
    ['id', 'product_tmpl_id', 'attribute_id', 'value_ids'],
    { limit: 5000 }
  )

  // 2. Collecte tous les value_ids pour les charger en une fois
  const allValueIds = new Set()
  for (const line of attrLines) {
    if (Array.isArray(line.value_ids)) {
      for (const v of line.value_ids) allValueIds.add(v)
    }
  }

  if (allValueIds.size === 0) return result

  // 3. Charge les valeurs (ex: "5", "10", "15"...)
  const values = await odooSearchRead(uid, 'product.attribute.value',
    [['id', 'in', Array.from(allValueIds)]],
    ['id', 'name', 'attribute_id'],
    { limit: 5000 }
  )

  const valueById = new Map()
  for (const v of values) {
    valueById.set(v.id, v)
  }

  // 4. Pour chaque template, extraire les tailles numeriques
  // On filtre uniquement les valeurs qui sont des nombres (= "Nombre de personnes")
  for (const line of attrLines) {
    const tmplId = Array.isArray(line.product_tmpl_id) ? line.product_tmpl_id[0] : line.product_tmpl_id
    if (!result.has(tmplId)) result.set(tmplId, [])

    for (const valueId of (line.value_ids || [])) {
      const v = valueById.get(valueId)
      if (!v) continue
      // Le nom de la valeur est typiquement "5", "10", "15", "20"
      const num = parseInt(String(v.name).trim(), 10)
      if (!isNaN(num) && num >= 1 && num <= 100) {
        result.get(tmplId).push(num)
      }
    }
  }

  // 5. Pour chaque template : tri + dedup + EXCLUSION du 1 (individuels)
  for (const [tmplId, sizes] of result.entries()) {
    const unique = [...new Set(sizes)].filter(s => s > 1).sort((a, b) => a - b)
    result.set(tmplId, unique)
  }

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
    price: a.price || 0,
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
