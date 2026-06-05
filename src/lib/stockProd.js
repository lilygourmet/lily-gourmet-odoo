// src/lib/stockProd.js
// Stock Prod Vitrine / Annexe : articles SM- depuis Odoo (par lieu) + catalogue
// (actif + stock mini) géré par l'admin.
import { supabase } from './supabase'

export const STOCK_PROD_LIEUX = {
  vitrine: { key: 'vitrine', label: 'Stock Prod Vitrine', emoji: '🛍️' },
  annexe:  { key: 'annexe',  label: 'Stock Prod Annexe',  emoji: '🏭' },
}

// Articles SM- + stock actuel à un lieu (live Odoo).
export async function fetchStockProdOdoo(lieu) {
  const res = await fetch(`/api/catalog-from-odoo?stockProd=${encodeURIComponent(lieu)}`)
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error)
  return d.articles || []
}

// Catalogue (actif + stock_min) d'un lieu.
export async function loadStockProdCatalog(lieu) {
  const { data, error } = await supabase
    .from('stock_prod_catalog')
    .select('*')
    .eq('lieu', lieu)
  if (error) throw error
  return data || []
}

// Crée / met à jour une ligne catalogue (actif et/ou stock_min).
export async function upsertStockProdCatalog(lieu, product_name, patch) {
  const { error } = await supabase
    .from('stock_prod_catalog')
    .upsert({ lieu, product_name, ...patch }, { onConflict: 'lieu,product_name' })
  if (error) throw error
}
