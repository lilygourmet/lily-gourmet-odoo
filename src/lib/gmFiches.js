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

// Repartit la quantite totale entre les parfums listes par Odoo.
// Odoo repete un parfum par "case" de la boite : "boite de 24 (Oréo, Vanille, Oréo, Vanille)"
// = 2 cases Oréo + 2 cases Vanille. Sur 2 boites (48 cupcakes) -> 24 Oréo + 24 Vanille.
export function splitParfums(item) {
  const list = Array.isArray(item?.parfums) ? item.parfums.filter(p => p && !/^mixte$/i.test(p)) : []
  if (list.length === 0) return []
  const total = getRealQuantity(item)
  if (!total) return []
  const counts = new Map()
  for (const p of list) counts.set(p, (counts.get(p) || 0) + 1)
  return [...counts].map(([parfum, n]) => ({ parfum, qty: Math.round(total * n / list.length) }))
}

// Parfums venus d'Odoo, dedoublonnes : ['Vanille'] ou ['Sellou', 'Nougat'] pour un mixte.
export function odooParfumsNames(item, typeGm) {
  return [...new Set(extractParfumsFromName(item?.title, typeGm))]
}

// Libelle des parfums d'Odoo a afficher sur l'article : « 12 Vanille » ou « Sellou + Nougat ».
export function odooParfumsLabel(item, typeGm) {
  const split = splitParfums(item)
  if (split.length > 0) return split.map(p => `${p.qty} ${p.parfum}`).join(', ')
  return odooParfumsNames(item, typeGm).join(' + ')
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
// Certains produits n'ont que la taille seule dans la parenthese
// Ex: "Sablés boite de 18 (Grand)" -> taille = "Grand", et surtout PAS un parfum
const TAILLE_SEULE = /^(grand|petit|mini|moyen)$/i

export function extractTailleFromName(productName) {
  if (!productName) return null
  const m = String(productName).match(TAILLE_KEYWORDS)
  if (m) return m[0]
  // Certains titres ecrivent « Sables boite de 12 Taille : Grand » (hors parenthese).
  const libelle = String(productName).match(/taille\s*:\s*([^·|\n]+)/i)
  if (libelle) {
    const v = libelle[1].trim().split(/\s{2,}|,/)[0].trim()
    if (TAILLE_SEULE.test(v) || TAILLE_KEYWORDS.test(v)) return v
  }
  // Taille seule : uniquement dans la parenthese (sinon "Plateau grand format" matcherait)
  const paren = String(productName).match(/\(([^)]+)\)/)
  if (paren) {
    const seule = paren[1].split(',').map(s => s.trim()).find(p => TAILLE_SEULE.test(p))
    if (seule) return seule
  }
  return null
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
    // ignore les tailles (Grand personnalisé, Mini simple, mais aussi "Grand" seul)
    if (TAILLE_KEYWORDS.test(p)) continue
    if (TAILLE_SEULE.test(p)) continue
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

// Helper : nom de couleur -> id (insensible casse/accents). Renvoie null si introuvable.
export function colorIdByName(palette, name) {
  if (!name || !Array.isArray(palette)) return null
  const t = stripAccents(name)
  const hit = palette.find(c => stripAccents(c.nom) === t)
  return hit ? hit.id : null
}
function stripAccents(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Pré-fiche accessoire saisie à la prise de commande (table gm_prefiches, clé = odoo_line_id).
export async function loadGmPrefiche(odooLineId) {
  if (!odooLineId) return null
  const { data, error } = await supabase
    .from('gm_prefiches')
    .select('*')
    .eq('odoo_line_id', odooLineId)
    .maybeSingle()
  if (error) { console.error('[gm_prefiches] load', error); return null }
  return data || null
}

// Parse la ligne « Accessoire : 12 pièces · couleur Rose · forme Cœur » (saisie à la prise
// de commande, colonne order_items.acc_details) → { qty, couleur, forme } (null si vide).
export function parseAccDetails(str) {
  if (!str) return null
  const s = String(str)
  const qtyM = s.match(/(\d+)\s*pi[eè]ce/i)
  const colM = s.match(/couleur\s+([^·]+)/i)
  const formeM = s.match(/forme\s+([^·]+)/i)
  const out = {
    qty: qtyM ? parseInt(qtyM[1], 10) : null,
    couleur: colM ? colM[1].trim() : null,
    forme: formeM ? formeM[1].trim() : null,
  }
  return (out.qty || out.couleur || out.forme) ? out : null
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
  // upsert (et non insert) : re-cocher un lot déjà fait ne lève plus d'erreur d'unicité
  // (cas d'un lot identique partagé par plusieurs commandes en vue « par produit »).
  const { data, error } = await supabase
    .from('gm_done')
    .upsert({ order_item_id: orderItemId, lot_idx: lotIdx, done_by: userId }, { onConflict: 'order_item_id,lot_idx' })
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

// Charge l'historique des actions gm_done (14 derniers jours)
export async function loadGmLogs(daysBack = 14) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('gm_done')
    .select(`
      id, order_item_id, lot_idx, done_at, done_by,
      profiles:done_by(full_name, username),
      order_items:order_item_id(title, quantity, pers, order_id, orders:order_id(order_num, client_name))
    `)
    .gte('done_at', since.toISOString())
    .order('done_at', { ascending: false })
    .limit(500)

  if (error) {
    console.warn('[loadGmLogs] join echec, fallback:', error)
    const { data: simple } = await supabase
      .from('gm_done')
      .select('*')
      .gte('done_at', since.toISOString())
      .order('done_at', { ascending: false })
      .limit(500)
    return simple || []
  }
  return data || []
}

// ============================================================
// AGREGATION POUR VUE PATISSIER
// ============================================================

// Charge toutes les commandes (avec items + fiches GM) pour une date
// Retourne : [{ order, items: [{ item, fiche }] }]
// Le commercial saisit la repartition des lots pour UNE boite ("9 ; 9" sur une boite de 18).
// Sur 2 boites il faut 18 + 18, pas 9 + 9. On ne corrige que si le compte tombe juste,
// pour ne pas toucher aux prefiches deja saisies en total.
function scalePreficheLots(lots, item) {
  const boites = parseFloat(item?.quantity) || 0
  if (boites <= 1 || lots.length === 0) return lots
  const total = lots.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0)
  if (total * boites !== getRealQuantity(item)) return lots
  return lots.map(l => ({ ...l, qty: (parseFloat(l.qty) || 0) * boites }))
}

// Le commercial saisit ses lots sans parfum (il ne choisit que couleur/quantite).
// Si Odoo ne donne qu'UN parfum pour l'article, on le repose sur chaque lot.
function fillLotsParfum(lots, item) {
  if (!Array.isArray(lots) || lots.length === 0) return lots
  if (lots.some(l => l.parfum)) return lots
  const split = splitParfums(item)
  if (split.length !== 1) return lots
  return lots.map(l => ({ ...l, parfum: split[0].parfum }))
}

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
    .select('id, order_id, type, title, quantity, pers, parfum, parfums, image_urls, taille_value, acc_details, odoo_line_id')
    .in('order_id', orderIds)
    .eq('type', 'GM')

  if (e2) throw e2
  if (!items || items.length === 0) return []

  const itemIds = items.map(i => i.id)
  const lineIds = items.map(i => i.odoo_line_id).filter(Boolean)
  const [{ data: fiches }, { data: dones }, { data: prefiches }] = await Promise.all([
    supabase.from('gm_fiches').select('*').in('order_item_id', itemIds),
    supabase.from('gm_done').select('*').in('order_item_id', itemIds),
    lineIds.length ? supabase.from('gm_prefiches').select('*').in('odoo_line_id', lineIds) : Promise.resolve({ data: [] }),
  ])

  const fichesByItem = {}
  for (const f of fiches || []) fichesByItem[f.order_item_id] = f
  // Brouillons saisis par le commercial à la prise de commande (clé = odoo_line_id).
  const prefByLine = {}
  for (const p of prefiches || []) prefByLine[p.odoo_line_id] = p
  const donesByItem = {}
  for (const d of dones || []) {
    if (!donesByItem[d.order_item_id]) donesByItem[d.order_item_id] = []
    donesByItem[d.order_item_id].push(d)
  }

  const itemsByOrder = {}
  for (const it of items) {
    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
    let fiche = fichesByItem[it.id] || null
    // Pas de fiche validée mais un brouillon du commercial → on l'affiche directement
    // (marqué _fromPrefiche pour l'étiquette « à confirmer »).
    if (!fiche && it.odoo_line_id) {
      const pf = prefByLine[it.odoo_line_id]
      if (pf && pf.type_gm) {
        fiche = {
          type_gm: pf.type_gm,
          lots: scalePreficheLots(Array.isArray(pf.lots) ? pf.lots : [], it),
          parfum_normal: !!pf.parfum_normal,
          tete_position: pf.tete_position || null,
          _fromPrefiche: true,
        }
      }
    }
    // "Parfum normal" + parfums connus -> un lot par parfum, pour pouvoir cocher
    // "6 Caramel Beurre salé faits, le reste pas encore" comme sur les cakepops.
    if (fiche && fiche.parfum_normal && !fiche.is_mixte) {
      const split = splitParfums(it)
      if (split.length > 0) {
        fiche = {
          ...fiche,
          parfum_normal: false,
          lots: split.map(p => ({ ...makeEmptyLot(p.parfum), qty: p.qty })),
        }
      }
    }
    // Lots sans parfum (saisie commerciale) : on remet celui d'Odoo quand il n'y en a qu'un.
    if (fiche && !fiche.parfum_normal) {
      const withParfum = fillLotsParfum(fiche.lots, it)
      if (withParfum !== fiche.lots) fiche = { ...fiche, lots: withParfum }
    }
    itemsByOrder[it.order_id].push({
      item: it,
      fiche,
      dones: donesByItem[it.id] || [],
    })
  }

  // Commandes qui ont au moins 1 item GM
  const gmOrders = orders.filter(o => itemsByOrder[o.id] && itemsByOrder[o.id].length > 0)

  // Agent RÉEL qui a pris la commande (créé/confirmé le devis dans l'app), depuis
  // devis_traitements. On préfère celui qui a « confirmé », sinon le 1er qui l'a traitée.
  const nums = [...new Set(gmOrders.map(o => o.order_num).filter(Boolean))]
  if (nums.length) {
    const { data: tr } = await supabase
      .from('devis_traitements').select('order_num, action, user_name, created_at')
      .in('order_num', nums).order('created_at', { ascending: true })
    const byOrder = {}
    for (const r of (tr || [])) { (byOrder[r.order_num] ||= []).push(r) }
    for (const o of gmOrders) {
      const rows = byOrder[o.order_num] || []
      o.handler = (rows.find(r => r.action === 'confirme' && r.user_name) || rows.find(r => r.user_name) || {}).user_name || null
    }
  }

  return gmOrders.map(o => ({ order: o, items: itemsByOrder[o.id] }))
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
  // Item coche "tout fait" avant d'etre eclate en lots par parfum : on le laisse fait
  if (dones.some(d => d.lot_idx === -1)) return true
  const lotsCount = (fiche.lots || []).length
  if (lotsCount === 0) return false
  for (let i = 0; i < lotsCount; i++) {
    if (!dones.some(d => d.lot_idx === i)) return false
  }
  return true
}

// Cle de fusion pour aggreger des lots IDENTIQUES (meme taille, parfum, couleur, zigzag, perles, forme, bord)
function lotFusionKey(lot, productType, taille) {
  return [
    productType,
    taille || '',
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

      const taille = extractTailleFromName(item.title)

      // Cas parfum_normal : 1 entree speciale
      if (fiche.parfum_normal) {
        const parfum = '__normal__'
        const key = `normal|${item.id}`
        if (!tree[typeGm][parfum]) tree[typeGm][parfum] = {}
        tree[typeGm][parfum][key] = {
          qty: getRealQuantity(item),
          taille,
          lot: { parfum: 'Parfum normal', qty: getRealQuantity(item) },
          sources: [{ itemId: item.id, lotIdx: -1, orderNum: order.order_num, clientName: order.client_name, note: fiche.note_patissier || null }],
          doneCount: dones.length > 0 ? 1 : 0,
          totalSources: 1,
        }
        continue
      }

      const lots = Array.isArray(fiche.lots) ? fiche.lots : []
      // Lots sans parfum (mixte, ou boite a plusieurs parfums) : on groupe sous les parfums
      // d'Odoo (« Sellou + Nougat ») au lieu de « (sans parfum) ».
      const parfumsOdoo = odooParfumsNames(item, typeGm).join(' + ')
      lots.forEach((lot, lotIdx) => {
        const parfum = lot.parfum || parfumsOdoo || '__sansparfum__'
        if (!tree[typeGm][parfum]) tree[typeGm][parfum] = {}
        const key = lotFusionKey(lot, typeGm, taille)

        if (!tree[typeGm][parfum][key]) {
          tree[typeGm][parfum][key] = {
            qty: 0,
            taille,
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
          note: fiche.note_patissier || null,
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
