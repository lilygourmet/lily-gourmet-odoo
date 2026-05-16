// src/lib/stockCatalog.js
// Catalogue articles E- pour le MODULE STOCK BOUTIQUE uniquement
// (Vitrine / Réception Vitrine / Fin de journée)
//
// Source : table etiquettes_articles
// Filtre : category='cd' AND name ILIKE 'E-%' AND sale_ok=true
//
// Règles métier Stock Boutique :
//   - Articles AVEC tailles (sizes non vide dans la DB) :
//     * Une tuile (1) systématique pour la vitrine
//     * Une tuile par taille présente (normalisées : 6→5, 8→10, 20→15)
//   - Articles SANS tailles (sizes=[] dans la DB, ex: Miss Pistache, Tatin) :
//     * 1 seule tuile dans l'onglet "1" avec le NOM NU (sans suffixe (1))
//     * Pour matcher exactement le nom Odoo et éviter le doublon dans l'audit
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
 * Détermine si un article est à taille unique (sizes vide dans la DB)
 */
function isSingleSize(sizes) {
  if (!sizes) return true
  if (Array.isArray(sizes) && sizes.length === 0) return true
  return false
}

/**
 * Récupère le catalogue des entremets pour Stock Boutique.
 *
 * Retourne { sizes: { '1': [...], '5': [...], '10': [...], '15': [...] }, all: [...] }
 * Chaque entrée tuile : { name, code, size, odoo_template_id, display_order, image_url }
 *   - name : "E- Black Forest (5)" pour articles avec tailles
 *            "E- Miss Pistache" (sans suffixe) pour articles à taille unique
 *   - code : odoo_template_id sous forme de string
 *   - size : "1" / "5" / "10" / "15"
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
  // Set des clés déjà ajoutées, pour éviter doublons après normalisation
  const seen = new Set()

  for (const row of data || []) {
    const cleanName = cleanProductName(row.name)
    const code = row.odoo_template_id ? String(row.odoo_template_id) : null
    const order = row.display_order || 99

    // Parser sizes (peut être JSON string, array PG, ou null)
    let sizes = row.sizes
    if (typeof sizes === 'string') {
      try { sizes = JSON.parse(sizes) } catch { sizes = null }
    }

    // CAS A : article à taille unique (Miss Pistache, Tatin, Paris Brest)
    //   → 1 seule tuile dans onglet "1", nom NU sans suffixe (1)
    if (isSingleSize(sizes)) {
      const key = `${cleanName}|single`
      if (seen.has(key)) continue
      seen.add(key)
      articles.push({
        name: cleanName, // nom NU, pas de "(1)"
        code,
        size: '1',
        odoo_template_id: row.odoo_template_id,
        display_order: order,
        image_url: row.image_url || null,
      })
      continue
    }

    // CAS B : article avec tailles → comportement classique

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
    if (Array.isArray(sizes) && sizes.length > 0) {
      for (const rawSize of sizes) {
        const normSize = normalizeSize(rawSize)
        if (!normSize || normSize === '1') continue // taille 1 déjà ajoutée
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

