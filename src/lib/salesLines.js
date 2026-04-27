import { supabase } from './supabase'

// Definition des 7 categories de ventes (correspond aux prefixes)
export const VENTE_CATEGORIES = [
  { id: 'CD',     label: 'Vente CD',          prefixes: ['CD-', 'GM-', 'GMD-'], emoji: '🎂' },
  { id: 'LIVR',   label: 'Vente Livraisons',  prefixes: [],                      emoji: '🚚' },
  { id: 'PROD',   label: 'Vente Prod',        prefixes: ['E-', 'MI-', 'GS-'],   emoji: '🍰' },
  { id: 'CLT',    label: 'Vente par client',  prefixes: ['CLT'],                 emoji: '👤' },
  { id: 'RAHN',   label: 'Vente RA H N',      prefixes: ['RA-', 'H-', 'N-'],     emoji: '🥐' },
  { id: 'SALES',  label: 'Vente Salés',       prefixes: ['SA-', 'SAK-'],         emoji: '🥪' },
  { id: 'VIENN',  label: 'Vente Vienn/Jus',   prefixes: ['V-', 'B-'],            emoji: '🥖' },
]

// Charge toutes les sales_lines pour une date donnee
export async function loadSalesLinesForDate(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

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

// Groupe les lignes par heure -> client -> articles
export function groupByHourThenClient(lines) {
  const result = new Map()

  for (const line of lines) {
    const dt = new Date(line.delivery_at)
    const hourKey = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`
    const clientKey = line.client_name || 'Sans nom'

    if (!result.has(hourKey)) result.set(hourKey, new Map())
    const clientMap = result.get(hourKey)

    if (!clientMap.has(clientKey)) clientMap.set(clientKey, [])
    clientMap.get(clientKey).push(line)
  }

  return result
}

// Total quantite d'une liste
export function sumQty(lines) {
  return lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0)
}
