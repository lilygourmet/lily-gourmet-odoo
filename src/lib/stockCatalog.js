// src/lib/stockCatalog.js
// Extraction du catalogue articles E- depuis order_items existants
// + tri par taille (1) / (5) / (10) / autres

import { supabase } from './supabase.js';

// Cache en mémoire (recharge à chaque session)
let cachedCatalog = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extrait la taille depuis un nom d'article : "E- Tatin (1)" → "1"
 * Retourne null si pas de taille (ex: "E- Miss Pistache")
 */
export function extractSize(productName) {
  const match = productName.match(/\((\d+)\)\s*$/);
  return match ? match[1] : null;
}

/**
 * Nettoie le nom : retire le préfixe [NNN] s'il y en a un
 * "[176] E- Tatin (1)" → "E- Tatin (1)"
 */
export function cleanProductName(name) {
  if (!name) return '';
  return name.replace(/^\[\d+\]\s*/, '').trim();
}

/**
 * Extrait le code Odoo : "[176] E- Tatin (1)" → "176"
 */
export function extractProductCode(name) {
  if (!name) return null;
  const match = name.match(/^\[(\d+)\]/);
  return match ? match[1] : null;
}

/**
 * Récupère tous les articles E- distincts depuis order_items
 * Filtre uniquement les entremets (E-)
 * Tri : taille (1) / (5) / (10) / sans taille
 */
export async function fetchEntremetsCatalog() {
  // Cache hit
  if (cachedCatalog && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  const { data, error } = await supabase
    .from('order_items')
    .select('name')
    .ilike('name', '%E-%');

  if (error) {
    console.error('[stockCatalog] fetch error:', error);
    return { sizes: {}, all: [] };
  }

  // Dédup par nom nettoyé
  const seen = new Set();
  const articles = [];
  
  for (const row of data || []) {
    const clean = cleanProductName(row.name);
    if (!clean.toLowerCase().includes('e-')) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    
    articles.push({
      name: clean,
      code: extractProductCode(row.name),
      size: extractSize(clean)
    });
  }

  // Tri par taille puis par nom
  articles.sort((a, b) => {
    const sa = a.size || 'z';
    const sb = b.size || 'z';
    if (sa !== sb) {
      // (1) avant (5) avant (10) avant sans taille
      const order = { '1': 1, '5': 2, '10': 3, '8': 4, '15': 5 };
      return (order[sa] || 99) - (order[sb] || 99);
    }
    return a.name.localeCompare(b.name);
  });

  // Groupement par taille
  const sizes = {
    '1': articles.filter(a => a.size === '1' || !a.size),
    '5': articles.filter(a => a.size === '5'),
    '10': articles.filter(a => a.size === '10' || a.size === '8' || a.size === '15')
  };

  cachedCatalog = { sizes, all: articles };
  cacheTimestamp = Date.now();
  
  return cachedCatalog;
}

/**
 * Vide le cache (utile si on ajoute un nouvel article via une commande)
 */
export function invalidateCatalog() {
  cachedCatalog = null;
  cacheTimestamp = 0;
}

/**
 * Catégorie d'un article (E / GS / V / H / P)
 */
export function getCategory(name) {
  const clean = cleanProductName(name);
  const match = clean.match(/^([A-Z]+)-/);
  return match ? match[1] : 'E';
}

