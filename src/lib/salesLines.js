import { supabase } from './supabase'

// Definition des 7 categories de ventes (correspond aux prefixes)
// `dbCategory` : valeur de sales_lines.category a filtrer (peut etre identique a id ou differente)
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
export function linesForCategory(allLines, cat) {
  const dbCat = cat.dbCategory || cat.id
  return allLines.filter(l => l.category === dbCat)
}
