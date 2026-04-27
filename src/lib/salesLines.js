import { supabase } from './supabase'

// Definition des categories de ventes (correspond aux prefixes)
// `dbCategory` : valeur de sales_lines.category a filtrer (peut etre identique a id ou differente)
//                Si null, on prend toutes les categories (pour ALL)
// `viewMode` : 'product' = agregation par produit
//              'hour-client' = heure -> (client + order_num) -> produits
//              'delivery' = comme hour-client mais affiche TOUTES les lignes de chaque commande
export const VENTE_CATEGORIES = [
  { id: 'CD',     label: 'Vente CD',          prefixes: ['CD-', 'GM-', 'GMD-'], emoji: '🎂', dbCategory: 'CD',    viewMode: 'hour-client' },
  { id: 'LIVR',   label: 'Vente Livraisons',  prefixes: [],                      emoji: '🚚', dbCategory: 'LIVR',  viewMode: 'delivery' },
  { id: 'PROD',   label: 'Vente Prod',        prefixes: ['E-', 'MI-', 'GS-'],   emoji: '🍰', dbCategory: 'PROD',  viewMode: 'product' },
  { id: 'CLT',    label: 'Vente par client',  prefixes: ['E-', 'MI-', 'GS-'],   emoji: '👤', dbCategory: 'PROD',  viewMode: 'hour-client' },
  { id: 'RAHN',   label: 'Vente RA H N',      prefixes: ['RA-', 'H-', 'N-'],     emoji: '🥐', dbCategory: 'RAHN',  viewMode: 'hour-client' },
  { id: 'SALES',  label: 'Vente Salés',       prefixes: ['SA-', 'SAK-'],         emoji: '🥪', dbCategory: 'SALES', viewMode: 'hour-client' },
  { id: 'VIENN',  label: 'Vente Vienn/Jus',   prefixes: ['V-', 'B-'],            emoji: '🥖', dbCategory: 'VIENN', viewMode: 'hour-client' },
  { id: 'ALL',     label: 'Toutes commandes',  prefixes: [],                      emoji: '📋', dbCategory: null,    viewMode: 'delivery-all' },
  { id: 'ODOO',    label: 'Récap 16h',         prefixes: [],                      emoji: '📊', dbCategory: null,    viewMode: 'odoo-table' },
]

// Charge toutes les sales_lines pour une date donnee
export async function loadSalesLinesForDate(date) {
  // date est une string YYYY-MM-DD venant de l'input
  // On construit explicitement les bornes UTC pour eviter les problemes timezone
  // start = jour selectionne 00:00 UTC, end = jour+1 00:00 UTC
  const [yyyy, mm, dd] = String(date).split('-').map(Number)
  const start = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0))
  const end = new Date(Date.UTC(yyyy, mm - 1, dd + 1, 0, 0, 0))
  console.log('[loadSalesLines] date:', date, 'start:', start.toISOString(), 'end:', end.toISOString())

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
  console.log('[loadSalesLines] DATA recue:', data?.length, 'lignes', data)
  return data || []
}

// Groupe les lignes par heure -> (client + order_num) -> articles
// La cle de niveau 2 est un objet {clientName, orderNum} pour pouvoir afficher
// "S47533 — Lamia" ensemble. Si plusieurs commandes du meme client a la meme heure,
// elles seront separees (ce qui est correct, on veut voir chaque commande)
export function groupByHourThenClient(lines) {
  const result = new Map()

  for (const line of lines) {
    const dt = new Date(line.delivery_at)
    const hourKey = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`

    // Cle composite : on utilise order_num comme cle pour bien isoler chaque commande
    // (un client peut avoir plusieurs commandes au meme creneau)
    const orderNum = line.order_num || ''
    const clientName = line.client_name || 'Sans nom'
    const clientKey = `${orderNum}|${clientName}`

    if (!result.has(hourKey)) result.set(hourKey, new Map())
    const clientMap = result.get(hourKey)

    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, {
        clientName,
        orderNum,
        items: [],
      })
    }
    clientMap.get(clientKey).items.push(line)
  }

  return result
}

// Pour les Livraisons : groupe par heure -> commande, mais montre TOUTES les lignes
// de la commande (pas seulement la ligne LIVR). `livrLines` = lignes filtrees LIVR,
// `allLines` = toutes les lignes du jour (pour retrouver le contenu de chaque commande)
export function groupDeliveriesWithFullOrder(livrLines, allLines) {
  // Index : order_num -> [toutes ses lignes]
  const linesByOrder = new Map()
  for (const line of allLines) {
    const num = line.order_num || ''
    if (!linesByOrder.has(num)) linesByOrder.set(num, [])
    linesByOrder.get(num).push(line)
  }

  // Pour chaque ligne LIVR, recupere toutes les lignes de sa commande
  // (en evitant les doublons si plusieurs LIVR par commande, peu probable mais safe)
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

    // Toutes les lignes de cette commande, livraison en premier
    const orderLines = linesByOrder.get(orderNum) || []
    const sortedLines = [...orderLines].sort((a, b) => {
      if (a.category === 'LIVR' && b.category !== 'LIVR') return -1
      if (a.category !== 'LIVR' && b.category === 'LIVR') return 1
      return 0
    })

    clientMap.set(clientKey, {
      clientName,
      orderNum,
      items: sortedLines,
    })
  }

  return result
}

// Total quantite d'une liste
export function sumQty(lines) {
  return lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0)
}

// Retire le prefixe [XXX] d'un nom de produit (ex: "[241] E- Fraisier (5)" -> "E- Fraisier (5)")
// Retire aussi les notes apres le \n (Thème, Message, etc.)
export function stripOdooPrefix(name) {
  if (!name) return ''
  let s = String(name).trim()
  // Enleve [XXX] au debut
  s = s.replace(/^\[\d+\]\s*/, '')
  // Coupe a la premiere ligne (pas de Thème:, Message:, etc.)
  const nl = s.indexOf('\n')
  if (nl !== -1) s = s.substring(0, nl).trim()
  return s
}

// Groupe les lignes par nom de produit (apres strip du prefixe [XXX])
// Retourne une Map<cleanName, { name, ordered, delivered, remaining, lines[] }>
// Triee par nom alphabetique
export function groupByProductWithDelivered(lines) {
  const result = new Map()

  for (const line of lines) {
    const cleanName = stripOdooPrefix(line.product_name)
    if (!cleanName) continue

    if (!result.has(cleanName)) {
      result.set(cleanName, {
        name: cleanName,
        ordered: 0,
        delivered: 0,
        lines: [],
      })
    }
    const entry = result.get(cleanName)
    entry.ordered += parseFloat(line.quantity) || 0
    entry.delivered += parseFloat(line.qty_delivered) || 0
    entry.lines.push(line)
  }

  // Calcule remaining et trie par nom
  for (const entry of result.values()) {
    entry.remaining = entry.ordered - entry.delivered
  }

  const sorted = [...result.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  return new Map(sorted)
}

// Groupe les lignes par produit (meme product_name = meme groupe)
// Retourne une Map<productName, { product_name, totalQty, lines }>
// Triee par quantite decroissante
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

  // Tri par totalQty decroissant
  const sorted = [...result.entries()].sort((a, b) => b[1].totalQty - a[1].totalQty)
  return new Map(sorted)
}

// Filtre les lignes pour une categorie donnee de VENTE_CATEGORIES
// Utilise `dbCategory` (la vraie valeur stockee en DB) pour filtrer
// Si dbCategory est null, retourne TOUTES les lignes (cas 'ALL' = Toutes commandes)
export function linesForCategory(allLines, cat) {
  if (!cat) return []
  if (cat.dbCategory === null) return allLines
  return allLines.filter(l => l.category === cat.dbCategory)
}

// Filtre les lignes selon des regles configurables
// opts: { clientsMode, clientsTerms, articlesMode, articlesTerms }
//   - clientsMode : 'contains' | 'not_contains'
//   - clientsTerms : string separee par virgule (ex: "vitrine, magasin")
//   - articlesMode : 'contains' | 'not_contains'
//   - articlesTerms : string separee par virgule
// Match insensible a la casse, qui contient
// Si terms est vide => filtre inactif sur ce champ
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

    // Filtre clients
    if (cTerms.length > 0) {
      const matchAny = cTerms.some(t => client.includes(t))
      if (clientsMode === 'contains' && !matchAny) return false
      if (clientsMode === 'not_contains' && matchAny) return false
    }

    // Filtre articles
    if (aTerms.length > 0) {
      const matchAny = aTerms.some(t => product.includes(t))
      if (articlesMode === 'contains' && !matchAny) return false
      if (articlesMode === 'not_contains' && matchAny) return false
    }

    return true
  })
}

// Pour 'Toutes les commandes' : groupe par heure -> commande,
// affiche TOUTES les lignes de chaque commande (toutes categories confondues)
// On parcourt directement toutes les lignes et on les regroupe par order_num.
// La premiere ligne rencontree pour une commande donne l'heure et le nom client.
export function groupAllOrdersByHour(allLines) {
  // Index : order_num -> { firstLine, lines[] }
  const byOrder = new Map()
  for (const line of allLines) {
    const num = line.order_num || ''
    if (!byOrder.has(num)) {
      byOrder.set(num, { firstLine: line, lines: [] })
    }
    byOrder.get(num).lines.push(line)
  }

  // Pour chaque commande, classe sous l'heure de delivery_at de la premiere ligne
  const result = new Map()
  for (const [orderNum, { firstLine, lines }] of byOrder.entries()) {
    const dt = new Date(firstLine.delivery_at)
    const hourKey = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`
    const clientName = firstLine.client_name || 'Sans nom'
    const clientKey = `${orderNum}|${clientName}`

    if (!result.has(hourKey)) result.set(hourKey, new Map())

    // Trie les lignes : LIVR en premier, puis CD, puis le reste
    const sorted = [...lines].sort((a, b) => {
      const orderA = a.category === 'LIVR' ? 0 : a.category === 'CD' ? 1 : 2
      const orderB = b.category === 'LIVR' ? 0 : b.category === 'CD' ? 1 : 2
      return orderA - orderB
    })

    result.get(hourKey).set(clientKey, {
      clientName,
      orderNum,
      items: sorted,
    })
  }

  return result
}
