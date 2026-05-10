import { supabase } from './supabase'

// ============================================================
// CATEGORIES (dropdown Recap Ventes)
// ============================================================
export const VENTE_CATEGORIES = [
  { id: 'CD',     label: 'Vente CD',          prefixes: ['CD-', 'GM-', 'GMD-'], emoji: '🎂', dbCategory: 'CD',    viewMode: 'hour-client' },
  { id: 'LIVR',   label: 'Vente Livraisons',  prefixes: [],                      emoji: '🚚', dbCategory: 'LIVR',  viewMode: 'delivery' },
  { id: 'PROD',   label: 'Vente Prod',        prefixes: ['E-', 'MI-', 'GS-'],   emoji: '🍰', dbCategory: 'PROD',  viewMode: 'product' },
  { id: 'CLT',    label: 'Vente par client',  prefixes: ['E-', 'MI-', 'GS-'],   emoji: '👤', dbCategory: 'PROD',  viewMode: 'hour-client' },
  { id: 'RAHN',   label: 'Vente RA H N',      prefixes: ['RA-', 'H-', 'N-'],     emoji: '🥐', dbCategory: 'RAHN',  viewMode: 'hour-client' },
  { id: 'SALES',  label: 'Vente Salés',       prefixes: ['SA-', 'SAK-'],         emoji: '🥪', dbCategory: 'SALES', viewMode: 'hour-client' },
  { id: 'VIENN',  label: 'Vente Vienn/Jus',   prefixes: ['V-', 'B-'],            emoji: '🥖', dbCategory: 'VIENN', viewMode: 'hour-client' },
  { id: 'ALL',    label: 'Toutes commandes',  prefixes: [],                      emoji: '📋', dbCategory: null,    viewMode: 'delivery-all' },
  { id: 'ODOO',   label: 'Récap 16h',         prefixes: [],                      emoji: '📊', dbCategory: null,    viewMode: 'odoo-table' },
]

// ============================================================
// LOAD DEPUIS SUPABASE
// ============================================================
export async function loadSalesLinesForDate(date) {
  const [yyyy, mm, dd] = String(date).split('-').map(Number)
  const start = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0))
  const end = new Date(Date.UTC(yyyy, mm - 1, dd + 1, 0, 0, 0))

  const { data, error } = await supabase
    .from('sales_lines')
    .select('*')
    .gte('delivery_at', start.toISOString())
    .lt('delivery_at', end.toISOString())
    .order('delivery_at', { ascending: true })

  if (error) {
    console.error('[loadSalesLines] erreur:', error)
    return []
  }
  return data || []
}

export async function loadSalesLinesForRange(fromDate, daysCount) {
  const [yyyy, mm, dd] = String(fromDate).split('-').map(Number)
  const start = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0))
  const end = new Date(Date.UTC(yyyy, mm - 1, dd + daysCount, 0, 0, 0))

  const { data, error } = await supabase
    .from('sales_lines')
    .select('*')
    .gte('delivery_at', start.toISOString())
    .lt('delivery_at', end.toISOString())
    .order('delivery_at', { ascending: true })

  if (error) {
    console.error('[loadSalesLinesForRange] erreur:', error)
    return []
  }
  return data || []
}

// ============================================================
// VUES PROD / SALES (rules de filtrage)
// ============================================================

// Definition des prefixes par categorie de vue
// SA- et SAK- = Salés stricts
// GS- = peut être Prod OU Sales selon le pattern (voir GS_PROD_PATTERNS)
export const PROD_VIEW_CATEGORIES = {
  prod:  {
    label: 'Production',
    emoji: '🥐',
    prefixes: ['E-', 'MI-', 'V-'],
  },
  sales: {
    label: 'Salés',
    emoji: '🥪',
    prefixes: ['SA-', 'SAK-', 'GS-'],
  },
}

// Patterns GS- qui vont en Prod (gateaux secs, cookies, mini cakes sucres)
// → Ces produits, bien que prefixe GS-, doivent apparaitre en Prod et PAS en Sales
const GS_PROD_PATTERNS = [
  /^GS-\s*plateau\s*gateau\s*sec/i,
  /^GS-\s*cookies?\b/i,
  /^GS-\s*plateau\s*mini\s*cakes?\s*sucr/i,
]

// Helper : verifie si un nom de produit matche un des prefixes
// (ignore le code Odoo [123] eventuel en tete)
function matchesAnyPrefix(name, prefixes) {
  const cleaned = String(name).replace(/^\[\d+\]\s*/, '').toUpperCase()
  return prefixes.some(p => cleaned.startsWith(p.toUpperCase()))
}

// Filtre les sales_lines pour une categorie ('prod' | 'sales' | array)
export function filterLinesForProdCategory(lines, category) {
  const categories = Array.isArray(category) ? category : [category]
  const wantsProd = categories.includes('prod')
  const wantsSales = categories.includes('sales')
  if (!wantsProd && !wantsSales) return []

  return lines.filter(l => {
    // 1) Exclure les annulees
    // Plusieurs noms de colonnes possibles selon comment le sync stocke l'etat
    const state = l.state || l.odoo_state || l.status || ''
    if (state === 'cancel' || state === 'cancelled' || state === 'annule') return false
    // Si la quantite est 0 c'est aussi annule
    const qty = parseFloat(l.quantity) || 0
    if (qty === 0) return false

    const name = (l.product_name || '').trim()
    if (!name) return false

    // Nom sans le code Odoo [123] eventuel pour les tests de pattern
    const cleanedName = name.replace(/^\[\d+\]\s*/, '')
    const isGsProdPattern = GS_PROD_PATTERNS.some(rx => rx.test(cleanedName))
    const isGs = /^GS-/i.test(cleanedName)

    // 2) Logique d'inclusion par prefix
    // Cas A : on veut PROD ET SALES (cumul) → on prend tout ce qui matche un des prefixes
    if (wantsProd && wantsSales) {
      const allPrefixes = [...PROD_VIEW_CATEGORIES.prod.prefixes, ...PROD_VIEW_CATEGORIES.sales.prefixes]
      return matchesAnyPrefix(name, allPrefixes)
    }

    // Cas B : on veut PROD seulement
    if (wantsProd) {
      // Inclure E-, MI-, V- (prefixes de prod)
      if (matchesAnyPrefix(name, PROD_VIEW_CATEGORIES.prod.prefixes)) return true
      // Inclure GS- SI c'est un pattern prod (cookies, plateaux, mini cakes)
      if (isGs && isGsProdPattern) return true
      return false
    }

    // Cas C : on veut SALES seulement
    if (wantsSales) {
      // Inclure SA-, SAK-
      if (matchesAnyPrefix(name, ['SA-', 'SAK-'])) return true
      // Inclure GS- SI ce n'est PAS un pattern prod
      if (isGs && !isGsProdPattern) return true
      return false
    }

    return false
  })
}

// ============================================================
// GROUPEMENTS POUR L'AFFICHAGE
// ============================================================

export function groupByHourThenClient(lines) {
  const result = new Map()
  for (const line of lines) {
    const dt = new Date(line.delivery_at)
    const hourKey = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`
    const orderNum = line.order_num || ''
    const clientName = line.client_name || 'Sans nom'
    const clientKey = `${orderNum}|${clientName}`

    if (!result.has(hourKey)) result.set(hourKey, new Map())
    const clientMap = result.get(hourKey)
    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, { clientName, orderNum, items: [] })
    }
    clientMap.get(clientKey).items.push(line)
  }
  return result
}

export function groupDeliveriesWithFullOrder(livrLines, allLines) {
  const linesByOrder = new Map()
  for (const line of allLines) {
    const num = line.order_num || ''
    if (!linesByOrder.has(num)) linesByOrder.set(num, [])
    linesByOrder.get(num).push(line)
  }

  const result = new Map()
  const seenOrders = new Set()
  for (const livr of livrLines) {
    const orderNum = livr.order_num || ''
    if (seenOrders.has(orderNum)) continue
    seenOrders.add(orderNum)

    const dt = new Date(livr.delivery_at)
    const hourKey = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`
    const clientName = livr.client_name || 'Sans nom'
    const clientKey = `${orderNum}|${clientName}`

    if (!result.has(hourKey)) result.set(hourKey, new Map())
    const clientMap = result.get(hourKey)

    const orderLines = linesByOrder.get(orderNum) || []
    const sortedLines = [...orderLines].sort((a, b) => {
      if (a.category === 'LIVR' && b.category !== 'LIVR') return -1
      if (a.category !== 'LIVR' && b.category === 'LIVR') return 1
      return 0
    })

    clientMap.set(clientKey, { clientName, orderNum, items: sortedLines })
  }
  return result
}

export function sumQty(lines) {
  return lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0)
}

export function stripOdooPrefix(name) {
  if (!name) return ''
  let s = String(name).trim()
  s = s.replace(/^\[\d+\]\s*/, '')
  const nl = s.indexOf('\n')
  if (nl !== -1) s = s.substring(0, nl).trim()
  return s
}

export function groupByProductWithDelivered(lines) {
  const result = new Map()
  for (const line of lines) {
    const cleanName = stripOdooPrefix(line.product_name)
    if (!cleanName) continue
    if (!result.has(cleanName)) {
      result.set(cleanName, { name: cleanName, ordered: 0, delivered: 0, lines: [] })
    }
    const entry = result.get(cleanName)
    entry.ordered += parseFloat(line.quantity) || 0
    entry.delivered += parseFloat(line.qty_delivered) || 0
    entry.lines.push(line)
  }
  for (const entry of result.values()) {
    entry.remaining = entry.ordered - entry.delivered
  }
  const sorted = [...result.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  return new Map(sorted)
}

export function groupByProduct(lines) {
  const result = new Map()
  for (const line of lines) {
    const name = (line.product_name || '').trim() || 'Sans nom'
    if (!result.has(name)) {
      result.set(name, { product_name: name, totalQty: 0, lines: [] })
    }
    const entry = result.get(name)
    entry.totalQty += parseFloat(line.quantity) || 0
    entry.lines.push(line)
  }
  const sorted = [...result.entries()].sort((a, b) => b[1].totalQty - a[1].totalQty)
  return new Map(sorted)
}

export function linesForCategory(allLines, cat) {
  if (!cat) return []
  if (cat.dbCategory === null) return allLines
  let lines = allLines.filter(l => l.category === cat.dbCategory)
  if (cat.dbCategory === 'CD') {
    lines = lines.filter(l => {
      const name = l.product_name || ''
      if (/\btopper\b/i.test(name)) return false
      if (/^(CD-|GM-|GMD-)\s*Bougies/i.test(name)) return false
      if (/D[ée]coration\s+suppl[ée]mentaire/i.test(name)) return false
      return true
    })
  }
  return lines
}

export function filterLines(lines, opts = {}) {
  const {
    clientsMode = 'not_contains', clientsTerms = '',
    articlesMode = 'not_contains', articlesTerms = '',
  } = opts

  const cTerms = clientsTerms.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const aTerms = articlesTerms.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  if (cTerms.length === 0 && aTerms.length === 0) return lines

  return lines.filter(line => {
    const client = (line.client_name || '').toLowerCase()
    const product = (line.product_name || '').toLowerCase()

    if (cTerms.length > 0) {
      const matchAny = cTerms.some(t => client.includes(t))
      if (clientsMode === 'contains' && !matchAny) return false
      if (clientsMode === 'not_contains' && matchAny) return false
    }
    if (aTerms.length > 0) {
      const matchAny = aTerms.some(t => product.includes(t))
      if (articlesMode === 'contains' && !matchAny) return false
      if (articlesMode === 'not_contains' && matchAny) return false
    }
    return true
  })
}

export function groupAllOrdersByHour(allLines) {
  const byOrder = new Map()
  for (const line of allLines) {
    const num = line.order_num || ''
    if (!byOrder.has(num)) {
      byOrder.set(num, { firstLine: line, lines: [] })
    }
    byOrder.get(num).lines.push(line)
  }

  const result = new Map()
  for (const [orderNum, { firstLine, lines }] of byOrder.entries()) {
    const dt = new Date(firstLine.delivery_at)
    const hourKey = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`
    const clientName = firstLine.client_name || 'Sans nom'
    const clientKey = `${orderNum}|${clientName}`

    if (!result.has(hourKey)) result.set(hourKey, new Map())

    const sorted = [...lines].sort((a, b) => {
      const orderA = a.category === 'LIVR' ? 0 : a.category === 'CD' ? 1 : 2
      const orderB = b.category === 'LIVR' ? 0 : b.category === 'CD' ? 1 : 2
      return orderA - orderB
    })

    result.get(hourKey).set(clientKey, { clientName, orderNum, items: sorted })
  }
  return result
}
