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

    // Commandes prises via l'app : nom de ligne « propre » (sans CD-/GM- pour le client).
    // Le parser du calendrier exige le préfixe → on le rétablit depuis le PRODUIT Odoo (en mémoire).
    for (const line of lines) {
      const pn = (Array.isArray(line.product_id) ? line.product_id[1] : '').replace(/^\[\d+\]\s*/, '')
      const m = pn.match(/^(CD-|GM-)/i)
      if (m && !/^(CD-|GM-)/i.test((line.name || '').trim())) {
        line.name = `${m[1].toUpperCase()} ${line.name}`
      }
    }

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

    // Sync table sales_lines pour les recaps de ventes
    // On passe TOUTES les commandes Odoo brutes (pas seulement les CD/GM)
    // pour capturer aussi les commandes 100% E-, MI-, SA-, etc.
    if (stats.orderIdMap) {
      await syncSalesLines(supabase, orders, linesByOrderId, stats.orderIdMap, uid)
      delete stats.orderIdMap
    }

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
    console.error('[sync] Stack:', e.stack)
    // Message plus parlant pour les erreurs de date Postgres
    let userMessage = e.message
    if (/string did not match|invalid input syntax|invalid date/i.test(e.message || '')) {
      userMessage = `Format de date invalide reçu d'Odoo : ${e.message}. Voir les logs Vercel pour la commande concernee.`
    }
    return res.status(500).json({
      success: false,
      error: userMessage,
      original_error: e.message,
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
  // Fenêtre de synchro : commandes livrées dans les 90 prochains jours.
  const windowEnd = new Date(today)
  windowEnd.setDate(windowEnd.getDate() + 90)

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const dateStart = fmtDate(today)
  const dateEnd = fmtDate(new Date(windowEnd.getTime() + 86399999))

  // On fetch sale + cancel pour pouvoir afficher les annulees barrees
  const orders = await odooSearchRead(uid, 'sale.order',
    [
      ['state', 'in', ['sale', 'cancel']],
      ['commitment_date', '>=', dateStart],
      ['commitment_date', '<=', dateEnd],
    ],
    ['id', 'name', 'partner_id', 'commitment_date', 'livraison_hour', 'state', 'note', 'order_line', 'user_id', 'create_uid', 'warehouse_id', 'amount_total'],
    { order: 'commitment_date asc', limit: 2000 }
  )

  const allLineIds = []
  for (const o of orders) {
    if (Array.isArray(o.order_line)) allLineIds.push(...o.order_line)
  }

  let lines = []
  if (allLineIds.length > 0) {
    lines = await odooSearchRead(uid, 'sale.order.line',
      [['id', 'in', allLineIds]],
      ['id', 'order_id', 'product_id', 'name', 'product_uom_qty', 'qty_delivered', 'price_unit', 'price_total', 'display_type', 'sequence'],
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
// DETECTION PREFIXE + CATEGORIE pour recaps ventes
// ==========================================

function detectPrefixAndCategory(productName) {
  let name = (productName || '').trim()
  if (!name) return { prefix: null, category: 'AUTRE' }

  // 0) Retirer le prefixe Odoo type [123] si present
  name = name.replace(/^\[\d+\]\s*/, '').trim()

  // 1) Detection speciale : Livraison (pas de prefixe formel)
  if (/livraison/i.test(name)) {
    return { prefix: null, category: 'LIVR' }
  }

  // 2) Detection prefixe : 1-5 caracteres alphanum suivi d'un tiret
  const match = name.match(/^([A-Z][A-Z0-9]{0,4})-\s*/i)
  if (!match) {
    return { prefix: null, category: 'AUTRE' }
  }

  const prefix = match[1].toUpperCase() + '-'

  // 3) Mapping prefixe -> categorie de vente
  const PREFIX_TO_CATEGORY = {
    'CD-': 'CD',
    'GM-': 'CD',
    'GMD-': 'CD',
    'E-': 'PROD',
    'MI-': 'PROD',
    'GS-': 'PROD',
    'SA-': 'SALES',
    'SAK-': 'SALES',
    'RA-': 'RAHN',
    'H-': 'RAHN',
    'N-': 'RAHN',
    'V-': 'VIENN',
    'B-': 'VIENN',
  }

  const category = PREFIX_TO_CATEGORY[prefix] || 'AUTRE'
  return { prefix, category }
}

// ==========================================
// SYNC TABLE sales_lines (toutes les ventes pour recaps)
// Itere sur les commandes Odoo BRUTES (pas seulement les CD/GM)
// pour capturer toutes les ventes : E-, MI-, SA-, etc.
// ==========================================

async function syncSalesLines(supabase, odooOrders, linesByOrderId, orderIdMap, uid) {
  const allRows = []
  const activeLineIds = new Set()      // Lignes Odoo encore valides (qty>0, commande non annulee)
  const obsoleteLineIds = new Set()    // Lignes a supprimer (cancel, qty=0, acompte)

  // Bornes de la fenetre de sync (meme calcul que fetchOdooOrders)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in14Days = new Date(today)
  in14Days.setDate(in14Days.getDate() + 14)

  // Recuperer les telephones des clients en batch
  // On collecte d'abord tous les partner_ids unique
  const partnerIds = new Set()
  for (const o of odooOrders) {
    if (Array.isArray(o.partner_id) && o.partner_id[0]) {
      partnerIds.add(o.partner_id[0])
    }
  }
  const phoneByPartnerId = new Map()
  if (uid && partnerIds.size > 0) {
    try {
      const partners = await odooSearchRead(uid, 'res.partner',
        [['id', 'in', Array.from(partnerIds)]],
        ['id', 'phone', 'mobile'],
        { limit: 5000 }
      )
      for (const p of partners) {
        // Prefere mobile, fallback sur phone
        const tel = (p.mobile || p.phone || '').toString().trim() || null
        if (tel) phoneByPartnerId.set(p.id, tel)
      }
      console.log(`[sync] ${phoneByPartnerId.size} telephones recuperes pour ${partnerIds.size} partners`)
    } catch (e) {
      console.error('[sync] erreur recup telephones partners:', e.message)
    }
  }

  for (const odooOrder of odooOrders) {
    const orderNum = odooOrder.name
    if (!orderNum) continue

    const odooLines = linesByOrderId.get(odooOrder.id) || []

    // Commande annulee : toutes ses lignes sont obsoletes
    if (odooOrder.state === 'cancel') {
      for (const line of odooLines) obsoleteLineIds.add(line.id)
      continue
    }

    const commitmentDate = odooOrder.commitment_date
    if (!commitmentDate) continue

    // Parsing date defensif : log la valeur en cas de format inattendu
    let deliveryAt
    try {
      const dateStr = String(commitmentDate).trim()
      if (!dateStr) continue
      // Odoo renvoie "YYYY-MM-DD HH:MM:SS", on convertit en ISO UTC
      const isoStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z'
      deliveryAt = new Date(isoStr)
      if (isNaN(deliveryAt.getTime())) {
        console.warn(`[sync] commitment_date invalide pour ${orderNum}: "${commitmentDate}"`)
        continue
      }
    } catch (e) {
      console.warn(`[sync] erreur parsing commitment_date pour ${orderNum}: "${commitmentDate}" -> ${e.message}`)
      continue
    }

    const clientName = Array.isArray(odooOrder.partner_id)
      ? odooOrder.partner_id[1]
      : null

    // Telephone client (mobile prefere, fallback phone)
    const partnerId = Array.isArray(odooOrder.partner_id) ? odooOrder.partner_id[0] : null
    const clientPhone = partnerId ? (phoneByPartnerId.get(partnerId) || null) : null

    // Entrepot (warehouse_id renvoye par Odoo sous forme [id, "Nom"])
    const warehouse = Array.isArray(odooOrder.warehouse_id) ? odooOrder.warehouse_id[1] : null

    // Montant total de la commande (TTC, Odoo amount_total)
    const orderTotal = parseFloat(odooOrder.amount_total) || 0

    // Acompte : somme des price_unit des lignes "Acompte" ou "Down Payment".
    // Ces lignes sont generalement saisies avec qty=0 et price_unit=montant verse.
    // On boucle d'abord pour cumuler avant de les ignorer dans la boucle principale.
    let orderAcompte = 0
    for (const l of odooLines) {
      const pname = (l.name || '').trim()
      if (/^(Acompte|Down\s+Payment)/i.test(pname)) {
        const pu = parseFloat(l.price_unit) || 0
        const q = parseFloat(l.product_uom_qty) || 0
        // Si qty=0 le montant verse est dans price_unit. Sinon on prend qty * price_unit
        orderAcompte += q > 0 ? q * pu : pu
      }
    }

    // Note : chercher uniquement les lignes display_type='line_note' qui sont
    // SOUS la ligne Livraison (pas les notes sous d'autres articles).
    // On trie par sequence, on trouve la ligne Livraison, puis on prend les line_note
    // qui suivent immediatement (jusqu'a la prochaine ligne non-note).
    let orderNote = null
    const sortedLines = [...odooLines].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))

    // Helper : nettoie une string de note (retire HTML basique)
    const cleanNoteText = (s) => String(s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()

    // === Parse 1 : notes PAR ARTICLE ===
    // Pour chaque article (ligne avec produit), on collecte les line_note
    // qui le suivent immediatement, jusqu'au prochain article/section/livraison.
    // Exclut explicitement les notes qui suivent la ligne Livraison (= orderNote).
    const notesByLineId = new Map()    // odoo_line_id -> string (notes jointes par \n)
    for (let i = 0; i < sortedLines.length; i++) {
      const ln = sortedLines[i]
      if (ln.display_type) continue   // on cherche des articles, pas des sections/notes
      // C'est un article. Est-ce la ligne Livraison ? Si oui, on l'ignore pour
      // les notes par-article (ses notes vont dans orderNote, gere plus bas).
      const isLivraison = /livraison/i.test(ln.name || '')
      if (isLivraison) continue
      const accum = []
      // 1) ⚠️ ecrits DANS la description de l'article (mecanisme app « Attention sur cet article »)
      for (const p of String(ln.name || '').split(/\r?\n/)) {
        if (/^\s*⚠️/.test(p)) {
          const t = cleanNoteText(p.replace(/^\s*⚠️\s*/, ''))
          if (t) accum.push(t)
        }
      }
      // 2) Anciennes line_note separees qui suivent immediatement
      for (let j = i + 1; j < sortedLines.length; j++) {
        const sub = sortedLines[j]
        if (sub.display_type === 'line_note') {
          const txt = cleanNoteText(sub.name)
          if (txt) accum.push(txt)
        } else {
          break    // article suivant ou section -> stop
        }
      }
      if (accum.length > 0) {
        notesByLineId.set(ln.id, accum.join('\n'))
      }
    }

    // === Parse 2 : orderNote (commande globale) ===
    // Trouve l'index de la ligne Livraison (produit dont le nom contient "Livraison")
    let livrIdx = -1
    for (let i = 0; i < sortedLines.length; i++) {
      const ln = sortedLines[i]
      if (ln.display_type) continue   // skip sections/notes
      if (/livraison/i.test(ln.name || '')) {
        livrIdx = i
        break
      }
    }

    // Si on a trouve une ligne Livraison, on prend les line_note qui suivent
    const noteLines = []
    if (livrIdx >= 0) {
      for (let i = livrIdx + 1; i < sortedLines.length; i++) {
        const ln = sortedLines[i]
        if (ln.display_type === 'line_note') {
          const txt = cleanNoteText(ln.name)
          if (txt) noteLines.push(txt)
        } else {
          // Lignes section ou produit -> on s'arrete
          break
        }
      }
    }

    if (noteLines.length > 0) {
      orderNote = noteLines.join('\n') || null
    }

    // Fallback : si pas de note inline, prendre le champ note de la commande
    if (!orderNote) {
      const cmdNote = cleanNoteText(odooOrder.note)
      if (cmdNote) orderNote = cmdNote
    }

    const supabaseOrderId = orderIdMap.get(odooOrder.id) || null

    // Detecte si un nom d'article catalogue Odoo est un "generique" : dans ce cas
    // la vraie identite du produit est dans la Description (line.name), pas dans
    // le nom du produit catalogue. On gere :
    //   - "AUTRE" tout court (vendeuse met le prefixe XX- dans la description)
    //   - "XX- Autre <quelque chose>" (ex: SA- Autre salé, CD- Autre cake, etc.)
    function isGenericProduct(catalogName) {
      const n = (catalogName || '').trim()
      if (!n) return false
      // Cas 1 : nom = "AUTRE" exact (case insensitive)
      if (/^autre$/i.test(n)) return true
      // Cas 2 : "XX- Autre ..." avec un prefixe categorie
      if (/^(SA|CD|GM|VI|MI|RA|GS|SU|E)-\s*Autre\b/i.test(n)) return true
      return false
    }

    for (const line of odooLines) {
      // Nom de la Description (saisie vendeuse, peut etre precise ou egal au nom catalogue)
      const descriptionName = (line.name || '').trim()
      // Nom du produit dans le catalogue Odoo (stable, ID de produit)
      const catalogName = Array.isArray(line.product_id) ? String(line.product_id[1] || '').trim() : ''

      // Regle : si l'article catalogue est un "generique" (AUTRE / XX- Autre ...),
      // alors on prend la Description comme vrai nom (parce que la description
      // contient le nom precis saisi par la vendeuse). Sinon on prend le nom du
      // catalogue, qui est stable et ne change pas si la vendeuse modifie la
      // description ulterieurement.
      //
      // IMPORTANT : pour les commandes CD- personnalisees, la Description Odoo
      // contient en plus du nom catalogue des lignes "Theme:", "Age:", "Message:"
      // saisies par la vendeuse. On extrait ces lignes et on les colle apres le
      // catalogName, pour que le module Messages puisse retrouver le "Message: ..."
      // tout en gardant un nom catalogue stable pour le matching produit.
      function extractCustomDetails(descName, catName) {
        if (!descName) return ''
        // Si la description est identique au nom catalogue, rien a extraire
        if (descName === catName) return ''
        // On cherche dans la description toutes les lignes du type "Theme:", "Age:", "Message:"
        // (avec ou sans accent, peu importe l'indentation)
        const lines = descName.split(/\r?\n/)
        const extras = []
        for (const ln of lines) {
          const trimmed = ln.trim()
          if (!trimmed) continue
          // Match les champs custom connus (case insensitive, accents optionnels)
          if (/^(Th[èe]me|Age|Message|Inscription|D[ée]dicace|Texte|Couleur|Format|Saveur|Parfum|Garniture|Forme|Date)\s*:/i.test(trimmed)) {
            extras.push('  ' + trimmed)
          }
        }
        return extras.length > 0 ? '\n\n' + extras.join('\n') : ''
      }

      let productName
      if (isGenericProduct(catalogName)) {
        // Generique : on prend tout descriptionName
        productName = descriptionName
      } else {
        // Article catalogue stable + on prefixe avec details custom si presents
        const baseName = catalogName || descriptionName
        const customDetails = extractCustomDetails(descriptionName, catalogName)
        productName = baseName + customDetails
      }

      const qty = parseFloat(line.product_uom_qty) || 0
      const isAcompte = /^(Acompte|Down\s+Payment)/i.test(productName)

      // Ligne obsolete : qty<=0, nom vide, ou acompte
      if (!productName || qty <= 0 || isAcompte) {
        obsoleteLineIds.add(line.id)
        continue
      }

      const qtyDelivered = parseFloat(line.qty_delivered) || 0
      const { prefix, category } = detectPrefixAndCategory(productName)

      activeLineIds.add(line.id)
      allRows.push({
        order_id: supabaseOrderId,
        odoo_line_id: line.id,
        product_name: productName,
        prefix: prefix,
        category: category,
        quantity: qty,
        qty_delivered: qtyDelivered,
        client_name: clientName,
        client_phone: clientPhone,
        order_note: orderNote,
        product_note: notesByLineId.get(line.id) || null,
        warehouse: warehouse,
        order_total: orderTotal,
        order_acompte: orderAcompte,
        line_total: parseFloat(line.price_total) || 0,   // prix TTC de cette ligne
        delivery_at: deliveryAt,
        order_num: orderNum,
      })
    }
  }

  // 1) Supprimer toutes les lignes obsoletes (annulees / qty 0 / acompte) ET
  //    toutes les lignes orphelines dans la fenetre (= en DB mais plus dans Odoo,
  //    typiquement supprimees manuellement d'une commande qui reste active)
  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const dateStart = fmtDate(today)
  const dateEnd = fmtDate(new Date(in14Days.getTime() + 86399999))

  // Recuperer toutes les lignes existantes en DB dans la fenetre
  const { data: existingDbLines, error: fetchErr } = await supabase
    .from('sales_lines')
    .select('odoo_line_id')
    .gte('delivery_at', dateStart)
    .lte('delivery_at', dateEnd)

  if (fetchErr) {
    console.error('[sync sales_lines] erreur fetch existing:', fetchErr)
  }

  const toDeleteIds = new Set(obsoleteLineIds)
  if (existingDbLines) {
    for (const row of existingDbLines) {
      // Si une ligne en DB n'est plus active dans Odoo => orpheline => a supprimer
      if (!activeLineIds.has(row.odoo_line_id)) {
        toDeleteIds.add(row.odoo_line_id)
      }
    }
  }

  if (toDeleteIds.size > 0) {
    const idsArr = Array.from(toDeleteIds)
    // Batch par 500 pour eviter les URL trop longues
    for (let i = 0; i < idsArr.length; i += 500) {
      const slice = idsArr.slice(i, i + 500)
      const { error: delErr } = await supabase
        .from('sales_lines')
        .delete()
        .in('odoo_line_id', slice)
      if (delErr) {
        console.error('[sync sales_lines] erreur suppression:', delErr)
      }
    }
    console.log(`[sync sales_lines] ${toDeleteIds.size} lignes supprimees (annulees/qty0/orphelines)`)
  }

  // 2) Upsert des lignes actives
  if (allRows.length === 0) {
    console.log('[sync sales_lines] aucune ligne active')
    return
  }

  let { error } = await supabase
    .from('sales_lines')
    .upsert(allRows, { onConflict: 'odoo_line_id' })

  // Repli si la colonne line_total n'existe pas encore (SQL pas lancé) → on réessaie
  // sans ce champ pour ne pas bloquer la synchro des autres données.
  if (error && /line_total/i.test(error.message || '')) {
    const stripped = allRows.map(({ line_total, ...r }) => r)
    ;({ error } = await supabase.from('sales_lines').upsert(stripped, { onConflict: 'odoo_line_id' }))
  }

  if (error) {
    console.error('[sync sales_lines] erreur upsert:', error)
  } else {
    console.log(`[sync sales_lines] ${allRows.length} lignes actives mises a jour`)
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

  // Photos ajoutées DEPUIS L'APP : elles sont attachées à la COMMANDE (sale.order),
  // pas à la ligne. On les rattache aux articles CD de la commande pour qu'elles
  // apparaissent dans le calendrier (comme les photos posées directement sur la ligne).
  const orderIds = [...new Set(parsedOrders.map(po => po.odooId).filter(Boolean))]
  const orderAtts = []
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize)
    const atts = await odooSearchRead(uid, 'ir.attachment',
      [['res_model', '=', 'sale.order'], ['res_id', 'in', batch], ['mimetype', 'ilike', 'image/']],
      ['id', 'res_id', 'name', 'mimetype', 'file_size'], {})
    orderAtts.push(...atts)
  }
  if (orderAtts.length > 0) {
    const toDl = orderAtts
      .map(att => ({ att, fileName: `order_${att.res_id}_att_${att.id}.${guessExt(att.mimetype)}` }))
      .filter(x => !existingSet.has(x.fileName))
    for (let i = 0; i < toDl.length; i += 10) {
      const slice = toDl.slice(i, i + 10)
      const datas = await odooRead(uid, 'ir.attachment', slice.map(s => s.att.id), ['datas'])
      for (const { att, fileName } of slice) {
        const data = datas.find(d => d.id === att.id)
        if (!data?.datas) continue
        const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET)
          .upload(fileName, Buffer.from(data.datas, 'base64'), { contentType: att.mimetype, upsert: true })
        if (upErr) console.error(`[sync] Erreur upload ${fileName}: ${upErr.message}`)
      }
    }
    const urlsByOrder = new Map()
    for (const att of orderAtts) {
      const fileName = `order_${att.res_id}_att_${att.id}.${guessExt(att.mimetype)}`
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName)
      if (data?.publicUrl) {
        if (!urlsByOrder.has(att.res_id)) urlsByOrder.set(att.res_id, [])
        urlsByOrder.get(att.res_id).push(data.publicUrl)
      }
    }
    for (const po of parsedOrders) {
      const urls = urlsByOrder.get(po.odooId)
      if (!urls || urls.length === 0) continue
      for (const item of po.items) {
        if (item.type !== 'CD' || !item.lineId) continue
        const merged = [...(result.get(item.lineId) || [])]
        for (const u of urls) if (!merged.includes(u)) merged.push(u)
        result.set(item.lineId, merged)
      }
    }
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

// Valeur « vide » = pas de contenu avant (null, '', tableau vide, « pas de message », « 0 »).
function isEmptyVal(v) {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  const s = String(v).trim().toLowerCase()
  return s === '' || s === 'pas de message' || s === '0'
}
// AJOUT (≠ remplacement) → on NE flague PAS : rien avant, OU un tableau où tout l'ancien
// est encore présent (ex. une 2e photo / un 2e parfum ajouté à ce qui existait déjà).
function isAddition(oldV, newV) {
  if (isEmptyVal(oldV)) return true
  if (Array.isArray(oldV) && Array.isArray(newV)) return oldV.every(x => newV.includes(x))
  return false
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
    if (!isEqual(oldVal, newVal) && !isAddition(oldVal, newVal)) {
      changes[field] = { from: oldVal, to: newVal }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null
}

// ==========================================
// SYNC SUPABASE (intelligent + diff)
// ==========================================

async function syncToSupabase(supabase, parsedOrders) {
  const orderIdMap = new Map()
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
      // Verifie que deliveryAt est une Date valide avant l'ISO
      if (!po.deliveryAt || isNaN(new Date(po.deliveryAt).getTime())) {
        console.warn(`[sync] deliveryAt invalide pour ${po.orderNum}, commande ignoree`)
        continue
      }
      const orderRow = {
        order_num: po.orderNum,
        client_name: po.clientName,
        seller_name: po.sellerName,
        delivery_at: new Date(po.deliveryAt).toISOString(),
        delivery_slot: po.deliverySlot,
        odoo_id: po.odooId,
        odoo_state: po.odooState,
        synced_at: new Date().toISOString(),
      }

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, odoo_state, delivery_at, delivery_slot, client_name, seller_name')
        .eq('odoo_id', po.odooId)
        .maybeSingle()

      let orderId
      let isNewOrder = false
      // orderChanges sera rempli ici par les modifs au niveau commande (date, client, etc.)
      // puis enrichi plus bas par les modifs au niveau items. Initialise tot pour pouvoir
      // pre-remplir avec les changements de l'entete avant le traitement items.
      const orderChanges = {}
      let orderHasChanges = false

      if (existingOrder) {
        // Compare les champs principaux avant l'update pour detecter les modifs
        // au niveau commande (date livraison, client, slot, etat). On compare en
        // chaines normalisees pour eviter les faux positifs (ISO vs timestamp).
        const oldDelivery = existingOrder.delivery_at
          ? new Date(existingOrder.delivery_at).toISOString()
          : null
        if (oldDelivery !== orderRow.delivery_at) {
          orderChanges['delivery_at'] = [oldDelivery, orderRow.delivery_at]
          orderHasChanges = true
        }
        if ((existingOrder.delivery_slot || null) !== (orderRow.delivery_slot || null)) {
          orderChanges['delivery_slot'] = [existingOrder.delivery_slot, orderRow.delivery_slot]
          orderHasChanges = true
        }
        if ((existingOrder.client_name || '') !== (orderRow.client_name || '')) {
          orderChanges['client_name'] = [existingOrder.client_name, orderRow.client_name]
          orderHasChanges = true
        }
        if ((existingOrder.seller_name || '') !== (orderRow.seller_name || '')) {
          orderChanges['seller_name'] = [existingOrder.seller_name, orderRow.seller_name]
          orderHasChanges = true
        }
        if ((existingOrder.odoo_state || '') !== (orderRow.odoo_state || '')) {
          orderChanges['odoo_state'] = [existingOrder.odoo_state, orderRow.odoo_state]
          orderHasChanges = true
        }

        const { error } = await supabase
          .from('orders').update(orderRow).eq('id', existingOrder.id)
        if (error) throw error
        orderId = existingOrder.id
        orderIdMap.set(po.odooId, orderId)
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
        orderIdMap.set(po.odooId, orderId)
        isNewOrder = true
        added++
      }

      // Recupere TOUS les champs des items existants pour faire le diff
      const { data: existingItems } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      // Nettoyage preventif : si un item_idx apparait plusieurs fois (doublons historiques
      // qui auraient echappe a la contrainte UNIQUE, ex. ajoutee apres coup), on garde
      // uniquement le plus ancien et on supprime les autres. Sinon le diff par idx ferait
      // un UPDATE sur 1 seul et laisserait les fantomes en base indefiniment.
      const seenIdx = new Set()
      const dupIdsToDelete = []
      const dedupedExisting = []
      for (const it of (existingItems || [])) {
        if (seenIdx.has(it.item_idx)) {
          dupIdsToDelete.push(it.id)
        } else {
          seenIdx.add(it.item_idx)
          dedupedExisting.push(it)
        }
      }
      if (dupIdsToDelete.length > 0) {
        await supabase.from('order_items').delete().in('id', dupIdsToDelete)
        console.log(`[sync-odoo] order ${po.odooId} : nettoyé ${dupIdsToDelete.length} doublon(s) item_idx`)
      }

      const existingByIdx = new Map()
      for (const it of dedupedExisting) existingByIdx.set(it.item_idx, it)

      const newIdxSet = new Set()
      // orderChanges et orderHasChanges sont deja declares plus haut (entete commande)

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
          // Article AJOUTÉ : on ne flague PAS (un ajout n'est pas un remplacement — demande Layla).
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

  return { orderIdMap, 
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
