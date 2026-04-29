// ============================================================
// API: GET /api/labels-zpl?dates=YYYY-MM-DD,YYYY-MM-DD&count=1
//
// Strategie :
// - On recupere les MO WHLVP du jour
// - Pour chaque MO ENFANT au format "X cm cakedesign (parfum)" ou "X cm CD* (parfum)" :
//     son champ 'origin' contient le NOM du MO parent (ex: WHLVP/MO/176833)
// - On cherche le MO parent par son 'name' (qui peut etre du jour ou pas)
// - L'origin du MO parent contient le scode S#####
// - 1 etiquette par MO enfant matchant
// ============================================================

const DOW_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

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

function fmtDateLine(dateStr, hour, minute) {
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

// "20 cm CD* (Citron)" ou "15 cm cakedesign (Vanille)" -> "20 cm Citron"
function parseComponentLabel(productName) {
  if (!productName) return null
  const m = productName.match(/(\d+)\s*cm\s+(?:CD\*?|cakedesign)\s*\(([^)]+)\)/i)
  if (!m) return null
  return `${m[1]} cm ${m[2].trim()}`
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

async function fetchLabelsForDate(date, uid) {
  const startUTC = `${date} 00:00:00`
  const endUTC = `${date} 23:59:59`

  // 1) Tous les MO WHLVP du jour
  const productions = await odooSearchRead(uid, 'mrp.production', [
    ['date_planned_finished', '>=', startUTC],
    ['date_planned_finished', '<=', endUTC],
    ['state', '!=', 'cancel'],
    ['name', 'ilike', 'WHLVP'],
  ], ['id', 'name', 'origin', 'state', 'product_id', 'product_qty'])

  if (!productions.length) return []

  // 2) On filtre les MO ENFANTS (au format "X cm cakedesign|CD*")
  const childMos = []
  for (const p of productions) {
    const productName = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
    if (!productName) continue
    if (!/cm\s+(?:CD\*?|cakedesign)/i.test(productName)) continue
    childMos.push({
      id: p.id,
      name: p.name,
      productName,
      productQty: p.product_qty || 1,
      origin: p.origin || '',
    })
  }

  if (childMos.length === 0) {
    console.log(`[labels-zpl] ${date} -> ${productions.length} MOs, 0 enfants matchants`)
    return []
  }

  // 3) Pour chaque enfant, son 'origin' = nom du MO parent (ex: "WHLVP/MO/176833")
  // On collecte tous les noms de parents a chercher
  const parentNames = [...new Set(childMos.map(c => c.origin).filter(o => /^WHLVP\/MO\//i.test(o)))]

  // 4) On charge tous ces parents en 1 seule requete (sans filtre de date, peut etre n'importe quand)
  let parentMap = {}  // name -> origin (qui contient le scode)
  if (parentNames.length > 0) {
    const parents = await odooSearchRead(uid, 'mrp.production', [
      ['name', 'in', parentNames],
    ], ['id', 'name', 'origin'])
    for (const par of parents) {
      const m = (par.origin || '').match(/S\d{3,}/i)
      if (m) parentMap[par.name] = m[0].toUpperCase()
    }
  }

  // 5) On charge les heures de livraison via sale.order
  const scodes = [...new Set(Object.values(parentMap))]
  const orderInfo = {}
  if (scodes.length > 0) {
    const orders = await odooSearchRead(uid, 'sale.order', [['name', 'in', scodes]],
      ['name', 'commitment_date'])
    for (const o of orders) orderInfo[o.name] = o
  }

  // 6) On genere les etiquettes
  const labels = []
  for (const child of childMos) {
    const articleLine = parseComponentLabel(child.productName)
    if (!articleLine) continue
    const scode = parentMap[child.origin]
    if (!scode) continue
    const ord = orderInfo[scode]
    let hour = 0, minute = 0
    if (ord && ord.commitment_date) {
      const dt = new Date(ord.commitment_date.replace(' ', 'T') + 'Z')
      hour = dt.getHours()
      minute = dt.getMinutes()
    }
    const qty = Math.max(1, Math.round(child.productQty || 1))
    for (let i = 0; i < qty; i++) {
      labels.push({
        date,
        hour, minute,
        line1: fmtDateLine(date, hour, minute),
        article: articleLine,
        scode,
        sortKey: `${date}_${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}_${scode}`,
      })
    }
  }
  console.log(`[labels-zpl] ${date} -> productions=${productions.length}, enfants=${childMos.length}, parents=${parentNames.length}, labels=${labels.length}`)
  return labels
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const datesParam = req.query.dates || req.query.date
    if (!datesParam) return res.status(400).json({ error: 'dates param required' })
    const dates = String(datesParam).split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    if (dates.length === 0) return res.status(400).json({ error: 'invalid date format' })

    const uid = await odooAuth()

    if (req.query.count === '1') {
      const counts = []
      for (const date of dates) {
        const labels = await fetchLabelsForDate(date, uid)
        counts.push({ date, count: labels.length })
      }
      return res.status(200).json({ counts })
    }

    const allLabels = []
    for (const date of dates) {
      const labels = await fetchLabelsForDate(date, uid)
      allLabels.push(...labels)
    }
    allLabels.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

    if (allLabels.length === 0) {
      return res.status(200)
        .setHeader('Content-Type', 'text/plain; charset=utf-8')
        .send('# Aucune etiquette pour ces jours\n')
    }

    let zpl = ''
    for (const lbl of allLabels) {
      zpl += buildOneLabel(lbl.line1, lbl.article, lbl.scode)
    }

    const filenamesPart = dates.length === 1 ? dates[0] : `${dates[0]}_a_${dates[dates.length - 1]}`
    res.status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="etiquettes-${filenamesPart}.zpl"`)
      .send(zpl)
  } catch (e) {
    console.error('[labels-zpl] error:', e)
    res.status(500).json({ error: e.message })
  }
}
