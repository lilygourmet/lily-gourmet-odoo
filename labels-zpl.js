// ============================================================
// API: GET /api/labels-zpl?date=YYYY-MM-DD&count=1
//   - count=1 : retourne juste le nombre d'etiquettes a imprimer
//                (pour afficher le compteur dans le dialog)
//   - count=0 (defaut) : retourne le contenu .zpl en text/plain
//
// Recupere depuis Odoo les composants 'cm CD' non-faits pour les
// ordres de fab dont l'echeance = date demandee. Genere 1 etiquette
// par composant. Format Zebra 50x25mm.
// ============================================================

const DOW_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

// --- Helpers Odoo ---
async function odooJsonRpc(service, method, args) {
  console.log('[odoo] ODOO_URL =', process.env.ODOO_URL ? `OK (${process.env.ODOO_URL.length} chars)` : 'UNDEFINED')
  console.log('[odoo] ODOO_DB =', process.env.ODOO_DB ? 'OK' : 'UNDEFINED')
  console.log('[odoo] ODOO_USERNAME =', process.env.ODOO_USERNAME ? 'OK' : 'UNDEFINED')
  console.log('[odoo] ODOO_PASSWORD =', process.env.ODOO_PASSWORD ? 'OK' : 'UNDEFINED')
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

async function odooAuth() {
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

// --- Format helpers ---
function fmtDateLine(dateStr, hour, minute) {
  // dateStr = 'YYYY-MM-DD'
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d, hour || 0, minute || 0)
  const dow = DOW_FR[date.getDay()]
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(hour || 0).padStart(2, '0')
  const min = String(minute || 0).padStart(2, '0')
  return `${dow} ${dd}/${mm}/${yyyy} ${hh}:${min}`
}

// Extrait "20 cm Citron" depuis "20 cm CD* (Citron)" ou variantes
function parseComponentLabel(productName) {
  if (!productName) return null
  // Match : (digits) cm CD... (parfum) — flexible
  const m = productName.match(/(\d+)\s*cm\s+CD\*?\s*\(([^)]+)\)/i)
  if (!m) return null
  const taille = m[1]
  const parfum = m[2].trim()
  return `${taille} cm ${parfum}`
}

function escZpl(s) {
  return String(s || '').replace(/\^/g, ' ').replace(/~/g, ' ').trim()
}

function buildOneLabel(line1, articleLine, scode) {
  return [
    '^XA',
    '^CI28',
    '^PW400',
    '^LL200',
    '^LH0,0',
    `^FO10,10^A0N,30,30^FD${escZpl(line1)}^FS`,
    `^FO10,50^A0N,28,28^FB380,2,0,L,0^FD${escZpl(articleLine)}^FS`,
    `^FO10,140^A0N,30,30^FD${escZpl(scode)}^FS`,
    '^XZ',
    '',
  ].join('\n')
}

// --- Recuperation des composants CD non-faits pour une date donnee ---
async function fetchLabelsForDate(date) {
  const uid = await odooAuth()

  // 1) Recupere les ordres de fab (mrp.production) dont l'echeance est ce jour
  const startUTC = `${date} 00:00:00`
  const endUTC = `${date} 23:59:59`
  const productions = await odooSearchRead(uid, 'mrp.production', [
    ['date_planned_finished', '>=', startUTC],
    ['date_planned_finished', '<=', endUTC],
    ['state', '!=', 'cancel'],
  ], ['id', 'name', 'origin', 'product_id', 'state'])

  if (!productions.length) return { labels: [], count: 0 }

  // 2) Recupere les composants (stock.move) lies a ces productions
  // production_id sur stock.move pointe vers la MO
  const mpIds = productions.map(p => p.id)
  const moves = await odooSearchRead(uid, 'stock.move', [
    ['raw_material_production_id', 'in', mpIds],
    ['state', '!=', 'done'],
    ['state', '!=', 'cancel'],
  ], ['id', 'product_id', 'raw_material_production_id', 'state', 'product_uom_qty'])

  // 3) Map MO -> S##### depuis 'origin' du mrp.production
  const moById = {}
  for (const p of productions) {
    const orig = (p.origin || '').match(/S\d{3,}/i)
    moById[p.id] = {
      name: p.name,
      scode: orig ? orig[0].toUpperCase() : '',
      origin: p.origin || '',
    }
  }

  // 4) Recupere les commandes (sale.order) pour avoir delivery_at (commitment_date)
  const scodes = [...new Set(Object.values(moById).map(m => m.scode).filter(Boolean))]
  const orderInfo = {}
  if (scodes.length > 0) {
    const orders = await odooSearchRead(uid, 'sale.order', [
      ['name', 'in', scodes],
    ], ['name', 'commitment_date', 'partner_id'])
    for (const o of orders) {
      orderInfo[o.name] = o
    }
  }

  // 5) Construit la liste des etiquettes a generer
  const labels = []
  for (const move of moves) {
    const mo = moById[Array.isArray(move.raw_material_production_id)
      ? move.raw_material_production_id[0]
      : move.raw_material_production_id]
    if (!mo) continue
    const productName = Array.isArray(move.product_id) ? move.product_id[1] : ''
    // Filtre : doit matcher "X cm CD"
    if (!/cm\s+CD/i.test(productName)) continue
    const articleLine = parseComponentLabel(productName)
    if (!articleLine) continue
    const scode = mo.scode
    if (!scode) continue
    const ord = orderInfo[scode]
    let hour = 0, minute = 0
    if (ord && ord.commitment_date) {
      // commitment_date au format "YYYY-MM-DD HH:MM:SS" en UTC
      const dt = new Date(ord.commitment_date.replace(' ', 'T') + 'Z')
      hour = dt.getHours()
      minute = dt.getMinutes()
    }
    // Quantite a produire (1 etiquette par unite)
    const qty = Math.max(1, Math.round(move.product_uom_qty || 1))
    for (let i = 0; i < qty; i++) {
      labels.push({
        line1: fmtDateLine(date, hour, minute),
        article: articleLine,
        scode,
      })
    }
  }

  return { labels, count: labels.length }
}

// --- API handler ---
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const date = req.query.date  // YYYY-MM-DD
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' })
    }

    const { labels, count } = await fetchLabelsForDate(date)

    // Mode count : retourne juste le compteur en JSON
    if (req.query.count === '1') {
      return res.status(200).json({ count })
    }

    // Mode normal : retourne le ZPL en text/plain
    if (count === 0) {
      return res.status(200)
        .setHeader('Content-Type', 'text/plain; charset=utf-8')
        .send('# Aucune etiquette pour ce jour\n')
    }

    let zpl = ''
    for (const lbl of labels) {
      zpl += buildOneLabel(lbl.line1, lbl.article, lbl.scode)
    }

    res.status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="etiquettes-${date}.zpl"`)
      .send(zpl)
  } catch (e) {
    console.error('[labels-zpl] error:', e)
    res.status(500).json({ error: e.message })
  }
}
