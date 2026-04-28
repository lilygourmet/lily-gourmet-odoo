import { supabase } from './supabase'

// ============================================================
// Detection automatique du type GM depuis le nom du produit
// Couvre GM-, GMD-, RA- (RA = sellou/nougat traite comme sellou-nougat)
// ============================================================

const TYPE_PATTERNS = [
  { type: 'cupcake',    regex: /cupcake/i },
  { type: 'cakepop',    regex: /cake[\s-]?pop/i },
  { type: 'donut',      regex: /donut|do[uw]nut/i },
  { type: 'magnum',     regex: /magnum/i },
  { type: 'sable',      regex: /sabl[eé]/i },
  // RA- Chocolat sellou/nougat ET Boite signature Sellou/Nougat sont traites pareil
  { type: 'sellou_nougat', regex: /sellou|nougat/i },
]

export function detectTypeFromName(productName) {
  if (!productName) return null
  for (const p of TYPE_PATTERNS) {
    if (p.regex.test(productName)) return p.type
  }
  return null
}

// Detecte si le produit est mixte (Sellou+Nougat OU Nutella+Caramel)
export function isMixteProduct(productName) {
  if (!productName) return false
  return /\bmixte\b/i.test(productName)
}

// Extrait la taille de boite ("boite de 12" -> 12) depuis le titre
export function extractBoiteSize(productName) {
  if (!productName) return null
  const m = String(productName).match(/boite\s+de\s+(\d+)/i)
  return m ? parseInt(m[1], 10) : null
}

// Calcule la quantite reelle de pieces a produire
// 1 boite de 18 × 2 unites = 36 pieces
// Priorite : (1) item.pers si dispo, (2) parser "boite de X" dans le titre, (3) quantity tel quel
export function getRealQuantity(item) {
  if (!item) return 0
  const qty = parseFloat(item.quantity) || 0
  let pers = parseFloat(item.pers) || 0
  if (!pers) {
    // Fallback : extraire depuis le titre
    const fromTitle = extractBoiteSize(item.title)
    if (fromTitle) pers = fromTitle
  }
  if (pers > 0) return qty * pers
  return qty
}

// Pour les produits mixtes, retourne les 2 sous-parfums automatiques
export function getMixteParfums(typeGm) {
  if (typeGm === 'sellou_nougat') return ['Sellou', 'Nougat']
  if (typeGm === 'cakepop' || typeGm === 'magnum') return ['Nutella', 'Caramel']
  return []
}

// Liste des "tailles" cupcake/sablés qui apparaissent dans la parenthese mais NE SONT PAS des parfums
// Ex: "Cupcake boite de 12 (Mini personnalisé, Chocolat, Vanille)"
//     -> taille = "Mini personnalisé", parfums = ["Chocolat", "Vanille"]
const TAILLE_KEYWORDS = /(grand|petit|mini)\s+(personnalis[ée]?|simple)/i

export function extractTailleFromName(productName) {
  if (!productName) return null
  const m = String(productName).match(TAILLE_KEYWORDS)
  return m ? m[0] : null
}

// Extrait les parfums depuis les parentheses du nom Odoo
// Ex: "Cupcake boite de 12 (Mini personnalisé, Chocolat)" -> ['Chocolat']
//     "Magnum (mixte)" -> ['Nutella', 'Caramel'] (auto via isMixteProduct)
//     "Boite signature Sellou/Nougat (boite de 8, Nougat)" -> ['Nougat']
//     "Boite signature Sellou/Nougat (boite de 20, mixte)" -> ['Sellou', 'Nougat']
export function extractParfumsFromName(productName, typeGm) {
  if (!productName) return []
  if (isMixteProduct(productName)) return getMixteParfums(typeGm)

  const result = []

  // On regarde dans la parenthese (= les options de la commande)
  // PAS dans le nom du produit lui-meme (ex: "Boite signature Sellou/Nougat" est juste un titre)
  const parenMatch = productName.match(/\(([^)]+)\)/)
  if (!parenMatch) {
    // Pas de parenthese : pour sellou_nougat, on cherche dans le nom (cas RA- Chocolat sellou)
    if (typeGm === 'sellou_nougat') {
      const hasSellou = /\bsellou\b/i.test(productName)
      const hasNougat = /\bnougat\b/i.test(productName)
      // Pour "RA- Chocolat sellou" : si UN SEUL des deux, on prend celui-la
      if (hasSellou && !hasNougat) result.push('Sellou')
      else if (hasNougat && !hasSellou) result.push('Nougat')
    }
    return result
  }

  const parts = parenMatch[1].split(',').map(s => s.trim())
  for (const p of parts) {
    // ignore les nombres purs et "boite de X"
    if (/^\d+$/.test(p)) continue
    if (/^boite\s+de/i.test(p)) continue
    // ignore les tailles (Grand personnalisé, Mini simple, etc.)
    if (TAILLE_KEYWORDS.test(p)) continue
    if (p) result.push(p)
  }

  return result
}

// ============================================================
// Labels et emojis
// ============================================================

export const TYPE_LABELS = {
  cupcake: 'Cupcakes',
  cakepop: 'Cakepops',
  donut:   'Donuts',
  magnum:  'Magnums',
  sable:   'Sablés',
  sellou_nougat: 'Sellou/Nougat',
}

export const TYPE_EMOJIS = {
  cupcake: '🧁',
  cakepop: '🍭',
  donut:   '🍩',
  magnum:  '🍦',
  sable:   '🍪',
  sellou_nougat: '📦',
}

// ============================================================
// Specs par type (qui pilote le formulaire)
// ============================================================

export const TYPE_SPEC = {
  cupcake: {
    label: 'Cupcakes',
    hasParfumNormal: true,        // toggle "couleur" / "parfum normal"
    hasLots: true,                 // creer plusieurs lots
    lotHasZigzag: false,
    lotHasPerles: false,
    lotHasForme: false,
    hasTetePosition: false,
  },
  cakepop: {
    label: 'Cakepops',
    hasParfumNormal: false,
    hasLots: true,
    lotHasZigzag: true,
    lotHasPerles: true,
    lotHasForme: false,
    hasTetePosition: true,         // tete haut / tete bas (global)
  },
  magnum: {
    label: 'Magnums',
    hasParfumNormal: false,
    hasLots: true,
    lotHasZigzag: true,
    lotHasPerles: true,
    lotHasForme: false,
    hasTetePosition: false,
  },
  donut: {
    label: 'Donuts',
    hasParfumNormal: false,
    hasLots: true,
    lotHasZigzag: true,
    lotHasPerles: true,
    lotHasForme: false,
    hasTetePosition: false,
  },
  sable: {
    label: 'Sablés',
    hasParfumNormal: false,
    hasLots: true,
    lotHasZigzag: false,
    lotHasPerles: false,
    lotHasForme: true,             // chaque lot a une forme
    hasTetePosition: false,
    formeOptions: [
      { value: 'rond',      label: 'Rond' },
      { value: 'carre',     label: 'Carré' },
      { value: 'ovale',     label: 'Ovale' },
      { value: 'coeur',     label: 'Coeur' },
      { value: 'etoile',    label: 'Etoile' },
      { value: 'hexagone',  label: 'Hexagone' },
      { value: 'decoupoir', label: 'Découpoir' },
    ],
    bordOptions: [
      { value: 'simple',   label: 'Simple' },
      { value: 'froufrou', label: 'Froufrou' },
    ],
  },
  sellou_nougat: {
    label: 'Sellou/Nougat',
    hasParfumNormal: false,
    hasLots: true,
    lotHasZigzag: false,
    lotHasPerles: false,
    lotHasForme: false,
    hasTetePosition: false,
  },
}

// ============================================================
// Structure d'un LOT (stocke dans gm_fiches.lots jsonb)
// {
//   parfum: string|null,           // "Vanille", "Sellou", "Nutella" (auto pour mixte)
//   couleur_id: uuid|null,         // FK vers gm_palette.id
//   qty: number,                   // quantite de ce lot
//   zigzag_couleur_id: uuid|null,  // si zigzag actif
//   has_zigzag: boolean,
//   perles_couleur_id: uuid|null,  // si perles actives
//   has_perles: boolean,
//   forme: string|null,            // pour sablés
//   bord: string|null,             // pour sablés (rond/carré uniquement)
// }
// ============================================================

export function makeEmptyLot(parfum = null) {
  return {
    parfum,
    couleur_id: null,
    qty: 0,
    has_zigzag: false,
    zigzag_couleur_id: null,
    has_perles: false,
    perles_couleur_id: null,
    forme: null,
    bord: null,
  }
}

// Calcul des dimensions auto pour les sables
export function getSableDimensionLabel(forme, taille) {
  if (!forme || !taille) return ''
  if (forme === 'rond')  return taille === 'mini' ? '5 cm' : '7 cm'
  if (forme === 'carre') return taille === 'mini' ? '4×4 cm' : '6×6 cm'
  if (forme === 'decoupoir') return ''
  return taille === 'mini' ? 'Mini' : 'Grand'
}

// ============================================================
// CRUD fiches
// ============================================================

export async function loadFichesForOrder(orderId) {
  const { data: items, error: e1 } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)

  if (e1) throw e1
  if (!items || items.length === 0) return []

  const itemIds = items.map(i => i.id)
  const { data, error } = await supabase
    .from('gm_fiches')
    .select('*')
    .in('order_item_id', itemIds)

  if (error) throw error
  return data || []
}

export async function loadFiche(orderItemId) {
  const { data, error } = await supabase
    .from('gm_fiches')
    .select('*')
    .eq('order_item_id', orderItemId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function saveFiche(orderItemId, fiche) {
  const payload = {
    order_item_id: orderItemId,
    type_gm: fiche.type_gm,
    taille: fiche.taille || null,
    forme: fiche.forme || null,
    bord: fiche.bord || null,
    couleurs: fiche.couleurs || [],
    voir_couleur_gateau: fiche.voir_couleur_gateau || false,
    zigzag_mode: fiche.zigzag_mode || null,
    zigzag_couleurs: fiche.zigzag_couleurs || [],
    decos: fiche.decos || [],
    // Nouveaux champs (lots)
    lots: fiche.lots || [],
    parfum_normal: fiche.parfum_normal || false,
    tete_position: fiche.tete_position || null,
    odoo_parfums: fiche.odoo_parfums || [],
    is_mixte: fiche.is_mixte || false,
    note_patissier: fiche.note_patissier || null,
    updated_at: new Date().toISOString(),
  }

  const existing = await loadFiche(orderItemId)
  if (existing) {
    const { data, error } = await supabase
      .from('gm_fiches')
      .update(payload)
      .eq('order_item_id', orderItemId)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('gm_fiches')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

export async function deleteFiche(orderItemId) {
  const { error } = await supabase
    .from('gm_fiches')
    .delete()
    .eq('order_item_id', orderItemId)
  if (error) throw error
  return true
}

// ============================================================
// Validation : la somme des qty des lots == quantity commandee
// ============================================================
export function isLotsValid(lots, expectedQty) {
  if (!Array.isArray(lots)) return false
  const total = lots.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0)
  return Math.round(total) === Math.round(expectedQty)
}

export function lotsTotal(lots) {
  if (!Array.isArray(lots)) return 0
  return lots.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0)
}

// ============================================================
// PALETTE : charger les couleurs Pantone partagees
// ============================================================
export async function loadPalette() {
  const { data, error } = await supabase
    .from('gm_palette')
    .select('*')
    .order('ordre', { ascending: true })
  if (error) throw error
  return data || []
}

// Helper : id couleur -> objet {nom, hex}
export function findColor(palette, id) {
  if (!id || !Array.isArray(palette)) return null
  return palette.find(c => c.id === id) || null
}

// ============================================================
// GM_DONE : marquer un lot ou un item comme fait
// ============================================================

export async function loadDoneForDate(date) {
  // date format YYYY-MM-DD : on charge les done pour cette journee
  // (en passant par les order_items qui ont une commande livree ce jour)
  const [yyyy, mm, dd] = String(date).split('-').map(Number)
  const start = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0))
  const end = new Date(Date.UTC(yyyy, mm - 1, dd + 1, 0, 0, 0))

  const { data, error } = await supabase
    .from('gm_done')
    .select('*, order_items!inner(order_id, orders!inner(delivery_at))')
    .gte('order_items.orders.delivery_at', start.toISOString())
    .lt('order_items.orders.delivery_at', end.toISOString())

  if (error) {
    // Fallback : load tous les done sans filtre date (cas RLS strict)
    console.warn('[loadDoneForDate] join echec, fallback sur tous les done', error)
    const { data: all, error: e2 } = await supabase.from('gm_done').select('*')
    if (e2) throw e2
    return all || []
  }
  return data || []
}

export async function markLotDone(orderItemId, lotIdx, userId) {
  const { data, error } = await supabase
    .from('gm_done')
    .insert({ order_item_id: orderItemId, lot_idx: lotIdx, done_by: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function unmarkLotDone(orderItemId, lotIdx) {
  const { error } = await supabase
    .from('gm_done')
    .delete()
    .eq('order_item_id', orderItemId)
    .eq('lot_idx', lotIdx)
  if (error) throw error
  return true
}

export async function markItemAllDone(orderItemId, lotsCount, userId) {
  // Marquer tous les lots de l'item comme faits
  const rows = []
  for (let i = 0; i < lotsCount; i++) {
    rows.push({ order_item_id: orderItemId, lot_idx: i, done_by: userId })
  }
  const { error } = await supabase
    .from('gm_done')
    .upsert(rows, { onConflict: 'order_item_id,lot_idx' })
  if (error) throw error
  return true
}

export async function unmarkItemAllDone(orderItemId) {
  const { error } = await supabase
    .from('gm_done')
    .delete()
    .eq('order_item_id', orderItemId)
  if (error) throw error
  return true
}

// ============================================================
// AGREGATION POUR VUE PATISSIER
// ============================================================

// Charge toutes les commandes (avec items + fiches GM) pour une date
// Retourne : [{ order, items: [{ item, fiche }] }]
export async function loadOrdersWithFichesForDate(date) {
  const [yyyy, mm, dd] = String(date).split('-').map(Number)
  const start = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0))
  const end = new Date(Date.UTC(yyyy, mm - 1, dd + 1, 0, 0, 0))
  return await _loadOrdersWithFichesForBounds(start, end)
}

export async function loadOrdersWithFichesForRange(fromDate, daysCount) {
  const [yyyy, mm, dd] = String(fromDate).split('-').map(Number)
  const start = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0))
  const end = new Date(Date.UTC(yyyy, mm - 1, dd + daysCount, 0, 0, 0))
  return await _loadOrdersWithFichesForBounds(start, end)
}

async function _loadOrdersWithFichesForBounds(start, end) {
  const { data: orders, error: e1 } = await supabase
    .from('orders')
    .select('id, order_num, client_name, delivery_at, delivery_slot, odoo_state')
    .gte('delivery_at', start.toISOString())
    .lt('delivery_at', end.toISOString())
    .neq('odoo_state', 'cancel')
    .order('delivery_at', { ascending: true })

  if (e1) throw e1
  if (!orders || orders.length === 0) return []

  const orderIds = orders.map(o => o.id)
  const { data: items, error: e2 } = await supabase
    .from('order_items')
    .select('id, order_id, type, title, quantity, pers, parfum, parfums, image_urls, taille_value')
    .in('order_id', orderIds)
    .eq('type', 'GM')

  if (e2) throw e2
  if (!items || items.length === 0) return []

  const itemIds = items.map(i => i.id)
  const [{ data: fiches }, { data: dones }] = await Promise.all([
    supabase.from('gm_fiches').select('*').in('order_item_id', itemIds),
    supabase.from('gm_done').select('*').in('order_item_id', itemIds),
  ])

  const fichesByItem = {}
  for (const f of fiches || []) fichesByItem[f.order_item_id] = f
  const donesByItem = {}
  for (const d of dones || []) {
    if (!donesByItem[d.order_item_id]) donesByItem[d.order_item_id] = []
    donesByItem[d.order_item_id].push(d)
  }

  const itemsByOrder = {}
  for (const it of items) {
    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
    itemsByOrder[it.order_id].push({
      item: it,
      fiche: fichesByItem[it.id] || null,
      dones: donesByItem[it.id] || [],
    })
  }

  // Filtrer les commandes qui ont au moins 1 item GM
  return orders
    .filter(o => itemsByOrder[o.id] && itemsByOrder[o.id].length > 0)
    .map(o => ({ order: o, items: itemsByOrder[o.id] }))
}

// Verifie si un lot est marque fait (compare lot_idx)
export function isLotDone(dones, lotIdx) {
  if (!Array.isArray(dones)) return false
  return dones.some(d => d.lot_idx === lotIdx)
}

// Verifie si tous les lots d'un item sont faits
export function isItemFullyDone(fiche, dones) {
  if (!fiche || !Array.isArray(dones)) return false
  if (fiche.parfum_normal) return dones.length > 0  // 1 done suffit pour parfum_normal
  const lotsCount = (fiche.lots || []).length
  if (lotsCount === 0) return false
  for (let i = 0; i < lotsCount; i++) {
    if (!dones.some(d => d.lot_idx === i)) return false
  }
  return true
}

// Cle de fusion pour aggreger des lots IDENTIQUES (meme parfum, couleur, zigzag, perles, forme, bord)
function lotFusionKey(lot, productType) {
  return [
    productType,
    lot.parfum || '',
    lot.couleur_id || '',
    lot.has_zigzag ? '1' : '0',
    lot.zigzag_couleur_id || '',
    lot.has_perles ? '1' : '0',
    lot.perles_couleur_id || '',
    lot.forme || '',
    lot.bord || '',
  ].join('|')
}

// Vue PAR PRODUIT : agrege tous les lots de toutes les commandes du jour
// Groupe : type_gm -> parfum -> [lots fusionnes]
// Retour : [{ typeGm, label, parfums: { parfum: [{ qty, lot, sources: [{itemId, lotIdx, orderNum, clientName}] }] } }]
export function aggregateByProduct(ordersWithFiches) {
  // typeGm -> parfum -> fusionKey -> { qty, lot, sources, doneCount }
  const tree = {}

  for (const { order, items } of ordersWithFiches) {
    for (const { item, fiche, dones } of items) {
      // Items sans fiche : ajout dans une categorie speciale "non_defini"
      if (!fiche) {
        const typeGm = '__non_defini__'
        if (!tree[typeGm]) tree[typeGm] = {}
        const parfum = '__pasdefini__'
        if (!tree[typeGm][parfum]) tree[typeGm][parfum] = {}
        const key = `nodef|${item.id}`
        tree[typeGm][parfum][key] = {
          qty: getRealQuantity(item),
          lot: { parfum: 'Pas défini', qty: getRealQuantity(item) },
          sources: [{ itemId: item.id, lotIdx: -1, orderNum: order.order_num, clientName: order.client_name, qty: getRealQuantity(item), title: item.title }],
          doneCount: 0,
          totalSources: 1,
          notDefined: true,
          itemTitle: item.title,
        }
        continue
      }

      const typeGm = fiche.type_gm
      if (!typeGm) continue

      if (!tree[typeGm]) tree[typeGm] = {}

      // Cas parfum_normal : 1 entree speciale
      if (fiche.parfum_normal) {
        const parfum = '__normal__'
        const key = `normal|${item.id}`
        if (!tree[typeGm][parfum]) tree[typeGm][parfum] = {}
        tree[typeGm][parfum][key] = {
          qty: getRealQuantity(item),
          lot: { parfum: 'Parfum normal', qty: getRealQuantity(item) },
          sources: [{ itemId: item.id, lotIdx: -1, orderNum: order.order_num, clientName: order.client_name }],
          doneCount: dones.length > 0 ? 1 : 0,
          totalSources: 1,
        }
        continue
      }

      const lots = Array.isArray(fiche.lots) ? fiche.lots : []
      lots.forEach((lot, lotIdx) => {
        const parfum = lot.parfum || '__sansparfum__'
        if (!tree[typeGm][parfum]) tree[typeGm][parfum] = {}
        const key = lotFusionKey(lot, typeGm)

        if (!tree[typeGm][parfum][key]) {
          tree[typeGm][parfum][key] = {
            qty: 0,
            lot: { ...lot },  // exemplaire
            sources: [],
            doneCount: 0,
            totalSources: 0,
          }
        }
        const entry = tree[typeGm][parfum][key]
        entry.qty += parseFloat(lot.qty) || 0
        entry.totalSources += 1
        entry.sources.push({
          itemId: item.id,
          lotIdx,
          orderNum: order.order_num,
          clientName: order.client_name,
          qty: parseFloat(lot.qty) || 0,
        })
        if (isLotDone(dones, lotIdx)) entry.doneCount += 1
      })
    }
  }

  // Convertir en array pour le rendu
  const products = []
  for (const typeGm of Object.keys(tree)) {
    const parfumsObj = {}
    for (const parfum of Object.keys(tree[typeGm])) {
      parfumsObj[parfum] = Object.values(tree[typeGm][parfum])
    }
    const isNonDefini = typeGm === '__non_defini__'
    products.push({
      typeGm,
      label: isNonDefini ? 'Pas défini' : (TYPE_LABELS[typeGm] || typeGm),
      emoji: isNonDefini ? '⚠️' : (TYPE_EMOJIS[typeGm] || '✏️'),
      parfums: parfumsObj,
      isNonDefini,
    })
  }
  // Mettre les "non defini" en premier
  products.sort((a, b) => (a.isNonDefini ? -1 : 0) - (b.isNonDefini ? -1 : 0))
  return products
}
