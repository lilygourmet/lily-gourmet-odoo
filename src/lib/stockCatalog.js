// src/lib/stockCatalog.js
// Catalogue articles vitrine pour le MODULE STOCK BOUTIQUE
// (Vitrine / Réception Vitrine / Fin de journée)
//
// V3 : lecture LIVE depuis Odoo via /api/catalog-from-odoo
//       avec 8 catégories (E-/GS-/V-/MI-/SU-/RA-/H-/N-) et tailles dynamiques.
//
// Structure retournée :
//   {
//     categories: [
//       { id, emoji, label, sizes, has_size_tabs, articles, articlesBySize, nb_articles },
//       ...
//     ],
//     // Compat ancienne API (catégorie E- par défaut)
//     sizes: { '1': [...], '5': [...], '10': [...], '15': [...] },
//     all: [...]
//   }

// Cache en mémoire (recharge à chaque session)
let cachedCatalog = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Tailles affichées par défaut (compat ancienne API)
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
 */
export function extractSize(productName) {
  if (!productName) return null
  const match = productName.match(/\((\d+)\)\s*$/)
  return match ? match[1] : null
}

/**
 * Extrait le code Odoo si présent
 */
export function extractProductCode(name) {
  if (!name) return null
  const match = name.match(/^\[(\d+)\]/)
  return match ? match[1] : null
}

/**
 * Récupère le catalogue complet depuis Odoo (toutes catégories).
 */
export async function fetchEntremetsCatalog() {
  // Cache hit
  if (cachedCatalog && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCatalog
  }

  try {
    const res = await fetch('/api/catalog-from-odoo')
    if (!res.ok) {
      console.error('[stockCatalog] HTTP error:', res.status, await res.text())
      return emptyCatalog()
    }
    const data = await res.json()
    if (data.error) {
      console.error('[stockCatalog] API error:', data.error)
      return emptyCatalog()
    }

    // data.categories est un tableau de catégories enrichies
    // On construit aussi la structure "sizes" compat pour l'ancien comportement (E- uniquement)
    const entremetsCat = (data.categories || []).find(c => c.id === 'E-')
    const sizesLegacy = {
      '1': [], '5': [], '10': [], '15': [],
    }
    if (entremetsCat) {
      for (const sizeKey of ['1', '5', '10', '15']) {
        sizesLegacy[sizeKey] = entremetsCat.articlesBySize?.[sizeKey] || []
      }
      // Articles sans taille → onglet '1'
      if (entremetsCat.articlesBySize?.['_none']?.length > 0) {
        sizesLegacy['1'] = [...sizesLegacy['1'], ...entremetsCat.articlesBySize['_none']]
      }
    }

    // Tous articles à plat
    const all = []
    for (const cat of (data.categories || [])) {
      all.push(...cat.articles)
    }

    cachedCatalog = {
      categories: data.categories || [],
      sizes: sizesLegacy,
      all,
    }
    cacheTimestamp = Date.now()
    return cachedCatalog
  } catch (e) {
    console.error('[stockCatalog] fetch error:', e)
    return emptyCatalog()
  }
}

function emptyCatalog() {
  return {
    categories: [],
    sizes: { '1': [], '5': [], '10': [], '15': [] },
    all: [],
  }
}

/**
 * Vide le cache (utile après resync Odoo manuel)
 */
export function invalidateCatalog() {
  cachedCatalog = null
  cacheTimestamp = 0
}

/**
 * Catégorie d'un article basée sur préfixe
 */
export function getCategory(name) {
  const clean = cleanProductName(name)
  const match = clean.match(/^([A-Z]+)-/)
  return match ? match[1] : 'E'
}

