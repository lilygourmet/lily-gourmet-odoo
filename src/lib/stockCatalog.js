// src/lib/stockCatalog.js
// Catalogue articles E- pour le MODULE STOCK BOUTIQUE uniquement
// (Vitrine / Réception Vitrine / Fin de journée)
//
// Source : table etiquettes_articles
// Filtre : category='cd' AND name ILIKE 'E-%' AND sale_ok=true
//
// Règles métier Stock Boutique :
//   - Pour CHAQUE article E-, on ajoute systématiquement une tuile "taille 1"
//     (les versions individuelles ne sont pas dans le catalogue Odoo mais
//     existent en vitrine).
//   - On garde aussi les tailles présentes dans le catalogue sizes (5/10/15).
//   - Les tailles "exotiques" (6, 8, 20...) sont normalisées vers la plus
//     proche (6→5, 8→10, 20→15).
//   - 4 onglets fixes toujours visibles : 1 / 5 / 10 / 15.

import { supabase } from './supabase.js'

// Cache en mémoire (recharge à chaque session)
let cachedCatalog = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Tailles affichées dans le module Stock Boutique
export const STOCK_SIZES = ['1', '5', '10', '15']

/**
 * Nettoie le nom : retire le préfixe [NNN] s'il y en a un
 */
export function cleanProductName(name) {
  if (!name) return ''
  return name.replace(/^\[\d+\]\s*/, '').trim()
}

/**
 * Extrait la taille d'un nom d'article : "E- Tatin (5)" → "5"
 * Retourne null si pas de taille dans le nom.
 */
export function extractSize(productName) {
  if (!productName) return null
  const match = productName.match(/\((\d+)\)\s*$/)
  return match ? match[1] : null
}

/**
 * Extrait le code Odoo si présent : "[176] E- Tatin" → "176"
 */
export function extractProductCode(name) {
  if (!name) return null
  const match = name.match(/^\[(\d+)\]/)
  return match ? match[1] : null
}

/**
 * Normalise une taille bizarre vers une taille standard 1/5/10/15
 * 6→5, 8→10, 20→15
 */
function normalizeSize(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n <= 1) return '1'
  if (n <= 6) return '5'
  if (n <= 12) return '10'
  return '15' // 15, 20, etc → '15'
}

/**
 * Récupère le catalogue des entremets pour Stock Boutique.
 *
 * Retourne { sizes: { '1': [...], '5': [...], '10': [...], '15': [...] }, all: [...] }
 * Chaque entrée tuile : { name, code, size, odoo_template_id, display_order }
 *   - name : "E- Black Forest (5)" (taille suffixée pour l'affichage et le tracking)
 *   - code : odoo_template_id sous forme de string
 *   - size : "1" / "5" / "10" / "15"
 *   - display_order : ordre d'affichage (1 par défaut)
 */
export async function fetchEntremetsCatalog() {
  // Cache hit
  if (cachedCatalog && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCatalog
  }

  const { data, error } = await supabase
    .from('etiquettes_articles')
    .select('odoo_template_id, name, sizes, display_order, image_url')
    .eq('category', 'cd')
    .eq('sale_ok', true)
    .ilike('name', 'E-%')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[stockCatalog] fetch error:', error)
    return emptyCatalog()
  }

  const articles = []
  // Set des (cleanName + size) déjà ajoutés, pour éviter doublons après normalisation
  const seen = new Set()

  for (const row of data || []) {
    const cleanName = cleanProductName(row.name)
    const code = row.odoo_template_id ? String(row.odoo_template_id) : null
    const order = row.display_order || 99

    // 1) Tuile taille 1 systématique (vitrine = unité)
    const key1 = `${cleanName}|1`
    if (!seen.has(key1)) {
      seen.add(key1)
      articles.push({
        name: `${cleanName} (1)`,
        code,
        size: '1',
        odoo_template_id: row.odoo_template_id,
        display_order: order,
        image_url: row.image_url || null,
      })
    }

    // 2) Tuiles depuis le catalogue sizes (normalisées 5/10/15)
    let sizes = row.sizes
    if (typeof sizes === 'string') {
      try { sizes = JSON.parse(sizes) } catch { sizes = null }
    }
    if (Array.isArray(sizes) && sizes.length > 0) {
      for (const rawSize of sizes) {
        const normSize = normalizeSize(rawSize)
        if (!normSize || normSize === '1') continue // la taille 1 est déjà ajoutée plus haut
        const key = `${cleanName}|${normSize}`
        if (seen.has(key)) continue
        seen.add(key)
        articles.push({
          name: `${cleanName} (${normSize})`,
          code,
          size: normSize,
          odoo_template_id: row.odoo_template_id,
          display_order: order,
          image_url: row.image_url || null,
        })
      }
    }
  }

  // Tri global : display_order, puis taille (1<5<10<15), puis nom
  const sizeRank = { '1': 1, '5': 2, '10': 3, '15': 4 }
  articles.sort((a, b) => {
    if (a.display_order !== b.display_order) {
      return a.display_order - b.display_order
    }
    const ra = sizeRank[a.size] || 99
    const rb = sizeRank[b.size] || 99
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name, 'fr')
  })

  // Groupement par taille pour les onglets du UI (4 onglets fixes)
  const sizes = {
    '1': articles.filter(a => a.size === '1'),
    '5': articles.filter(a => a.size === '5'),
    '10': articles.filter(a => a.size === '10'),
    '15': articles.filter(a => a.size === '15'),
  }

  cachedCatalog = { sizes, all: articles }
  cacheTimestamp = Date.now()

  return cachedCatalog
}

function emptyCatalog() {
  return {
    sizes: { '1': [], '5': [], '10': [], '15': [] },
    all: [],
  }
}

/**
 * Vide le cache (utile après resync etiquettes_articles)
 */
export function invalidateCatalog() {
  cachedCatalog = null
  cacheTimestamp = 0
}

/**
 * Catégorie d'un article (E / GS / V / H / P) — basée sur le préfixe
 */
export function getCategory(name) {
  const clean = cleanProductName(name)
  const match = clean.match(/^([A-Z]+)-/)
  return match ? match[1] : 'E'
}

