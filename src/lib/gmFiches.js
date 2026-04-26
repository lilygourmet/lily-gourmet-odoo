import { supabase } from './supabase'

// ============================================================
// Detection automatique du type GM depuis le nom du produit
// ============================================================

const TYPE_PATTERNS = [
  { type: 'cupcake', regex: /cupcake/i },
  { type: 'cakepop', regex: /cake[\s-]?pop/i },
  { type: 'donut',   regex: /donut|do[uw]nut/i },
  { type: 'magnum',  regex: /magnum/i },
  { type: 'sable',   regex: /sabl[eé]/i },
]

export function detectTypeFromName(productName) {
  if (!productName) return null
  for (const p of TYPE_PATTERNS) {
    if (p.regex.test(productName)) return p.type
  }
  return null
}

// Labels affichables
export const TYPE_LABELS = {
  cupcake: 'Cupcakes',
  cakepop: 'Cakepops',
  donut:   'Donuts',
  magnum:  'Magnums',
  sable:   'Sables',
}

export const TYPE_EMOJIS = {
  cupcake: '🧁',
  cakepop: '🍭',
  donut:   '🍩',
  magnum:  '🍦',
  sable:   '🍪',
}

// Specifications par type (pour piloter le formulaire)
export const TYPE_SPEC = {
  cupcake: {
    hasParfums: true,
    hasTaille: true,
    tailleOptions: [
      { value: 'mini',  label: 'Mini' },
      { value: 'grand', label: 'Grand' },
    ],
    hasCouleurs: false,
    hasZigzag: false,
    hasPerles: false,
    hasDecos: false,
    hasFormeBord: false,
  },
  cakepop: {
    hasParfums: true,
    hasTaille: false,
    hasCouleurs: true,
    hasZigzag: true,
    hasPerles: true,
    hasDecos: false,
    hasFormeBord: false,
  },
  donut: {
    hasParfums: false,
    hasTaille: false,
    hasCouleurs: true,
    hasZigzag: true,
    hasPerles: false,
    hasDecos: true,
    decosOptions: ['Perles', 'Paillettes', 'Vermicelles'],
    hasFormeBord: false,
  },
  magnum: {
    hasParfums: true,
    hasTaille: false,
    hasCouleurs: true,
    hasZigzag: true,
    hasPerles: false,
    hasDecos: true,
    decosOptions: ['Perles', 'Paillettes', 'Vermicelles'],
    hasFormeBord: false,
  },
  sable: {
    hasParfums: false,
    hasTaille: true,
    tailleOptions: [
      { value: 'mini',  label: 'Mini' },
      { value: 'grand', label: 'Grand' },
    ],
    hasCouleurs: false,
    hasZigzag: false,
    hasPerles: false,
    hasDecos: false,
    hasFormeBord: true,
    formeOptions: [
      { value: 'rond',      label: 'Rond' },
      { value: 'carre',     label: 'Carre' },
      { value: 'etoile',    label: 'Etoile' },
      { value: 'ovale',     label: 'Ovale' },
      { value: 'decoupoir', label: 'Decoupoir' },
    ],
    bordOptions: [
      { value: 'simple',   label: 'Simple' },
      { value: 'froufrou', label: 'Froufrou' },
    ],
  },
}

// Calcul des dimensions auto pour les sables
export function getSableDimensionLabel(forme, taille) {
  if (!forme || !taille) return ''
  if (forme === 'rond') {
    return taille === 'mini' ? '5 cm' : '7 cm'
  }
  if (forme === 'carre') {
    return taille === 'mini' ? '4×4 cm' : '6×6 cm'
  }
  if (forme === 'decoupoir') {
    return ''
  }
  // etoile, ovale = juste mini/grand
  return taille === 'mini' ? 'Mini' : 'Grand'
}

// ============================================================
// CRUD fiches
// ============================================================

export async function loadFichesForOrder(orderId) {
  // Recupere toutes les fiches GM des items d'une commande
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
  // Upsert : met a jour si existe, cree sinon
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
    updated_at: new Date().toISOString(),
  }

  // Verifier si fiche existe deja
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
