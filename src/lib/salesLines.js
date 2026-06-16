import { supabase } from './supabase'

// ============================================================
// CATEGORIES (dropdown Recap Ventes)
// ============================================================
export const VENTE_CATEGORIES = [
  { id: 'CD',     label: 'Vente CD',          prefixes: ['CD-', 'GM-', 'GMD-'],          emoji: '🎂', dbCategory: 'CD',    viewMode: 'hour-client',  showOrders: true  },
  { id: 'LIVR',   label: 'Vente Livraisons',  prefixes: [],                               emoji: '🚚', dbCategory: 'LIVR',  viewMode: 'delivery',     showOrders: true  },
  { id: 'PROD',   label: 'Vente Prod',        prefixes: ['E-', 'MI-', 'GS-'],            emoji: '🍰', dbCategory: 'PROD',  viewMode: 'product',      showOrders: false },
  { id: 'CLT',    label: 'Vente par client',  prefixes: ['E-', 'MI-', 'GS-'],            emoji: '👤', dbCategory: 'PROD',  viewMode: 'hour-client',  showOrders: true  },
  { id: 'RAHN',   label: 'Vente RA H N',      prefixes: ['RA-', 'H-', 'N-'],             emoji: '🥐', dbCategory: 'RAHN',  viewMode: 'hour-client',  showOrders: true  },
  { id: 'SALES',  label: 'Vente Salés',       prefixes: ['SA-', 'SAK-', 'SU-'],          emoji: '🥪', dbCategory: 'SALES', viewMode: 'hour-client',  showOrders: true  },
  { id: 'VIENN',  label: 'Vente Vienn/Jus',   prefixes: ['V-', 'B-'],                    emoji: '🥖', dbCategory: 'VIENN', viewMode: 'hour-client',  showOrders: true  },
  { id: 'ALL',    label: 'Toutes commandes',  prefixes: [],                               emoji: '📋', dbCategory: null,    viewMode: 'delivery-all', showOrders: true  },
  { id: 'ODOO',   label: 'Récap 16h',         prefixes: [],                               emoji: '📊', dbCategory: null,    viewMode: 'odoo-table',   showOrders: false },
]

// ============================================================
// LOAD DEPUIS SUPABASE
// ============================================================
// Récupère le PDF (base64) d'une facture Odoo DÉJÀ existante. Ne crée rien.
// arg = numéro de commande (string) OU { orderNum } OU { invoiceId }.
export async function fetchInvoicePdf(arg) {
  const body = typeof arg === 'string' ? { orderNum: arg } : (arg || {})
  const res = await fetch('/api/wati-webhook?action=invoice-pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`)
  return data   // { name, state, pdf }
}

// Cherche des factures Odoo existantes (nom client, n° commande, n° facture). Vide = récentes.
export async function searchInvoices(query) {
  const res = await fetch('/api/wati-webhook?action=invoices-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query || '' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.invoices || []
}

// Recherche de produits pour imprimer les étiquettes prix (nom, prix, taille, descriptif).
export async function searchProductLabels(query) {
  const res = await fetch('/api/wati-webhook?action=product-labels', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query || '' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.products || []
}

// Génère en lot les produits d'une famille (entremets/cakes/cookies/viennoiserie).
export async function genProductLabelsGroup(group) {
  const res = await fetch('/api/wati-webhook?action=product-labels-group', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.products || []
}

// Ouvre un PDF (base64) dans un nouvel onglet pour impression.
export function openInvoicePdf({ pdf }) {
  const bytes = atob(pdf)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }))
  const w = window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return w
}

// Prix TTC du cake design d'une commande = somme des lignes catégorie CD (CD-/GM-/GMD-).
// Résilient : null si la colonne line_total n'existe pas encore ou pas de cake design.
export async function loadCakeDesignPrice(orderNum) {
  if (!orderNum) return null
  const { data, error } = await supabase
    .from('sales_lines')
    .select('category, line_total')
    .eq('order_num', orderNum)
  if (error || !data) return null
  const cd = data.filter(l => l.category === 'CD')
  if (!cd.length) return null
  const total = cd.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
  return total > 0 ? total : null
}

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

// Charge TOUTES les lignes de commandes données (par n° de commande), quelle que
// soit leur date. Sert à afficher le détail complet d'une livraison même si les
// produits ont une date différente de la ligne « Livraison ».
export async function loadSalesLinesForOrders(orderNums) {
  const nums = [...new Set((orderNums || []).filter(Boolean))]
  if (!nums.length) return []
  const { data, error } = await supabase
    .from('sales_lines')
    .select('*')
    .in('order_num', nums)
  if (error) {
    console.error('[loadSalesLinesForOrders] erreur:', error)
    return []
  }
  return data || []
}

// ============================================================
// VUES PROD / SALES (rules de filtrage)
// ============================================================

// Definition des prefixes par categorie de vue
// SA- et SAK- = Salés stricts
// SU- = Surgelés, integres dans Sales (preparations salees + surgelees)
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
    prefixes: ['SA-', 'SAK-', 'SU-', 'GS-'],
  },
}

// Patterns GS- qui vont en Prod (gateaux secs, cookies, mini cakes sucres)
// → Ces produits, bien que prefixe GS-, doivent apparaitre en Prod et PAS en Sales
const GS_PROD_PATTERNS = [
  /^GS-\s*plateaux?\s*g[âa]teaux?\s*secs?/i,
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
      // Inclure SA-, SAK-, SU- (surgeles)
      if (matchesAnyPrefix(name, ['SA-', 'SAK-', 'SU-'])) return true
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

// "10h-11h" à l'heure du Maroc, depuis un delivery_at (stocké en UTC).
// Évite le décalage si le navigateur n'est pas réglé sur l'heure du Maroc.
function hourRangeKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike)
  const h = isNaN(d) ? 0 : Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Casablanca', hour: '2-digit', hour12: false }).format(d)) % 24
  return `${String(h).padStart(2, '0')}h-${String(h + 1).padStart(2, '0')}h`
}

export function groupByHourThenClient(lines) {
  const result = new Map()
  for (const line of lines) {
    const dt = new Date(line.delivery_at)
    const hourKey = hourRangeKey(dt)
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
    const hourKey = hourRangeKey(dt)
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

    clientMap.set(clientKey, {
      clientName,
      clientPhone: livr.client_phone || null,
      orderNote: livr.order_note || null,
      orderTotal: typeof livr.order_total === 'number' ? livr.order_total : (livr.order_total ? parseFloat(livr.order_total) : null),
      orderAcompte: typeof livr.order_acompte === 'number' ? livr.order_acompte : (livr.order_acompte ? parseFloat(livr.order_acompte) : null),
      orderNum,
      order_id: livr.order_id || null,
      items: sortedLines,
    })
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
    const hourKey = hourRangeKey(dt)
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
