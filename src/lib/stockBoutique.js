// src/lib/stockBoutique.js
// CRUD + Realtime Supabase + sync Odoo pour le module Stock Boutique v2.1
//
// Workflow : matin (Hamza) -> midi (café reçoit) -> soir (café compte aveugle)
//            -> submit (snapshot initial Odoo) -> audit valide -> audited
// L'audit peut rafraîchir le snapshot Odoo à tout moment (même après audited).
// =============================================================

import { supabase } from './supabase'

// =============================================================
// HELPERS DATE
// =============================================================

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function yesterdayISO() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// =============================================================
// STOCK_DAY
// =============================================================

export async function getOrCreateStockDay(day = todayISO()) {
  const { data: existing, error: e1 } = await supabase
    .from('stock_day')
    .select('*')
    .eq('day', day)
    .maybeSingle()

  if (e1) {
    console.error('[stockBoutique] getOrCreateStockDay read:', e1)
    throw e1
  }
  if (existing) return existing

  const { data, error } = await supabase
    .from('stock_day')
    .insert({ day, status: 'open' })
    .select()
    .single()

  if (error) {
    console.error('[stockBoutique] getOrCreateStockDay insert:', error)
    throw error
  }
  return data
}

export async function loadStockDay(day) {
  const { data, error } = await supabase
    .from('stock_day')
    .select('*')
    .eq('day', day)
    .maybeSingle()
  if (error) {
    console.error('[stockBoutique] loadStockDay:', error)
    return null
  }
  return data
}

// Café envoie le comptage du soir à l'équipe audit + déclenche snapshot Odoo initial
export async function submitStockDay(stockDayId, userId) {
  const { data, error } = await supabase
    .from('stock_day')
    .update({
      status: 'submitted',
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', stockDayId)
    .select()
    .single()
  if (error) throw error
  
  // Déclenche immédiatement le snapshot Odoo initial (best effort, ne bloque pas)
  try {
    await triggerOdooSnapshot(stockDayId, userId, true)
  } catch (e) {
    console.warn('[stockBoutique] Snapshot Odoo initial échoué (non bloquant):', e.message)
  }
  
  return data
}

// Café veut corriger : repasse en 'open' (uniquement si pas encore audité)
export async function reopenStockDay(stockDayId) {
  const { data, error } = await supabase
    .from('stock_day')
    .update({
      status: 'open',
      submitted_by: null,
      submitted_at: null,
    })
    .eq('id', stockDayId)
    .neq('status', 'audited')
    .select()
    .single()
  if (error) throw error
  return data
}

// Équipe audit valide définitivement
export async function auditStockDay(stockDayId, userId, notes = null) {
  const { data, error } = await supabase
    .from('stock_day')
    .update({
      status: 'audited',
      audited_by: userId,
      audited_at: new Date().toISOString(),
      audit_notes: notes,
    })
    .eq('id', stockDayId)
    .select()
    .single()
  if (error) throw error
  return data
}

// =============================================================
// SNAPSHOT ODOO (refresh manuel ou auto au submit)
// =============================================================

/**
 * Déclenche le snapshot Odoo pour un stock_day.
 * @param {string} stockDayId
 * @param {string} userId
 * @param {boolean} initial - si true, écrit aussi qty_odoo_initial (jamais écrasé)
 *                            normalement appelé uniquement au submit.
 */
export async function triggerOdooSnapshot(stockDayId, userId, initial = false) {
  const res = await fetch('/api/stock-odoo-snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      stock_day_id: stockDayId,
      initial,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

// =============================================================
// STOCK_DAY_ITEMS
// =============================================================

export async function loadDayItems(stockDayId) {
  const { data, error } = await supabase
    .from('stock_day_items')
    .select('*')
    .eq('stock_day_id', stockDayId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[stockBoutique] loadDayItems:', error)
    return []
  }
  return data || []
}

export async function loadYesterdayLeftovers() {
  const yDay = yesterdayISO()
  const yStockDay = await loadStockDay(yDay)
  if (!yStockDay) return []

  const { data, error } = await supabase
    .from('stock_day_items')
    .select('*')
    .eq('stock_day_id', yStockDay.id)
    .eq('source', 'evening')
    .in('freshness', ['fresh', 'yesterday'])
    .gt('qty_counted', 0)
    .order('product_name', { ascending: true })

  if (error) {
    console.error('[stockBoutique] loadYesterdayLeftovers:', error)
    return []
  }
  return data || []
}

export async function upsertItem(itemData) {
  const { data, error } = await supabase
    .from('stock_day_items')
    .upsert(itemData, { onConflict: 'stock_day_id,product_name,freshness,source' })
    .select()
    .single()

  if (error) {
    console.error('[stockBoutique] upsertItem:', error)
    throw error
  }
  return data
}

export async function updateItem(itemId, patch) {
  const { data, error } = await supabase
    .from('stock_day_items')
    .update(patch)
    .eq('id', itemId)
    .select()
    .single()

  if (error) {
    console.error('[stockBoutique] updateItem:', error)
    throw error
  }
  return data
}

export async function deleteItem(itemId) {
  const { error } = await supabase
    .from('stock_day_items')
    .delete()
    .eq('id', itemId)
  if (error) throw error
  return true
}

// =============================================================
// FLUX MATIN (PÂTISSIER)
// =============================================================

export function advanceFreshness(current) {
  if (current === 'fresh') return 'yesterday'
  if (current === 'yesterday') return 'twodays'
  if (current === 'twodays') return 'loss'
  return current
}

export async function applyLeftoverDecisions(todayStockDayId, decisions, userId) {
  for (const d of decisions) {
    const { leftoverItem, decision, lossReason } = d
    const qty = leftoverItem.qty_counted || 0
    if (qty <= 0) continue

    const newFreshness = decision === 'loss' ? 'loss' : advanceFreshness(leftoverItem.freshness)

    const { error: insertErr } = await supabase
      .from('stock_day_items')
      .insert({
        stock_day_id: todayStockDayId,
        product_name: leftoverItem.product_name,
        product_code: leftoverItem.product_code,
        category: leftoverItem.category || 'E',
        freshness: newFreshness,
        source: 'leftover',
        qty_announced: qty,
        qty_received: qty,
        decision,
        loss_reason: decision === 'loss' ? (lossReason || 'Casse matin pâtissier') : null,
        reception_status: 'confirmed',
        announced_by: userId,
        announced_at: new Date().toISOString(),
        received_by: userId,
        received_at: new Date().toISOString(),
      })
    if (insertErr) {
      console.error('[stockBoutique] applyLeftoverDecisions insert:', insertErr)
      throw insertErr
    }
  }
}

export async function sendMorningItem(stockDayId, productName, productCode, qty, userId) {
  // INSERT direct (pas upsert) car la contrainte unique est partielle (sans evening)
  // et PostgREST ne sait pas l'utiliser dans ON CONFLICT.
  // Si Hamza envoie 2x dans la journée, ça créera 2 lignes (qui s'additionneront à la réception).
  const { data, error } = await supabase
    .from('stock_day_items')
    .insert({
      stock_day_id: stockDayId,
      product_name: productName,
      product_code: productCode || null,
      category: 'E',
      freshness: 'fresh',
      source: 'morning',
      qty_announced: qty,
      qty_received: null,
      reception_status: 'pending',
      announced_by: userId,
      announced_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[stockBoutique] sendMorningItem:', error)
    throw error
  }
  return data
}

// =============================================================
// FLUX RÉCEPTION (CAFÉ MIDI)
// =============================================================

export async function confirmReception(itemId, qtyReceived, userId) {
  return updateItem(itemId, {
    qty_received: qtyReceived,
    reception_status: 'confirmed',
    received_by: userId,
    received_at: new Date().toISOString(),
  })
}

export async function noteDiscrepancy(itemId, qtyReceived, note, userId) {
  return updateItem(itemId, {
    qty_received: qtyReceived,
    reception_status: 'discrepancy',
    reception_note: note,
    received_by: userId,
    received_at: new Date().toISOString(),
    discrepancy_status: 'pending_patissier', // workflow : balle au pâtissier
  })
}

// Pâtissier répond : "effectivement 7" (= il accepte la qty du café)
export async function patissierAcceptCafeQty(itemId, userId) {
  return updateItem(itemId, {
    discrepancy_status: 'resolved',
    discrepancy_ack_at: new Date().toISOString(),
    discrepancy_ack_by: userId,
    // discrepancy_final_qty est qty_received (la valeur du café)
  })
}

// Pâtissier répond : "effectivement 8 - recompte stp" (= il maintient sa qty)
export async function patissierRequestRecount(itemId, patissierMessage, userId) {
  return updateItem(itemId, {
    discrepancy_status: 'pending_cafe',
    discrepancy_patissier_message: patissierMessage || null,
    discrepancy_patissier_responded_at: new Date().toISOString(),
    discrepancy_patissier_responded_by: userId,
  })
}

// Café répond après recompte : "effectivement 8" (accepte qty pâtissier)
export async function cafeAcceptPatissierQty(itemId, userId) {
  return updateItem(itemId, {
    discrepancy_status: 'resolved',
    qty_received: null, // sera remplacé par qty_announced à la lecture
    discrepancy_ack_at: new Date().toISOString(),
    discrepancy_ack_by: userId,
    discrepancy_resolved_in_favor_of: 'patissier',
  })
}

// Café répond après recompte : "toujours 7" (désaccord final → audit tranche)
export async function cafeMaintainCount(itemId, userId) {
  return updateItem(itemId, {
    discrepancy_status: 'unresolved',
    discrepancy_ack_at: new Date().toISOString(),
    discrepancy_ack_by: userId,
  })
}

// Ces fonctions s'ajoutent à la suite de cafeMaintainCount (vers ligne 367)
// dans src/lib/stockBoutique.js

// ============================================================
// AUDIT — Arbitrage final des écarts
// ============================================================

/**
 * Audit modifie les quantités directement (sans trancher de "camp").
 * Sert quand l'audit a vérifié physiquement et corrige les chiffres.
 * Marque automatiquement le discrepancy comme résolu par audit.
 */

/**
 * Audit tranche en faveur du patissier ou du café (sans modifier les chiffres).
 * inFavorOf = 'patissier' | 'cafe'
 */

/**
 * Charge les items source='morning' avec écart en conflit (pour le bouton "Trancher").
 * Retourne les items eux-mêmes (pas le report agrégé), avec leurs colonnes discrepancy_*.
 */


// ============================================================
// AUDIT — Arbitrage final des écarts (V3)
// ============================================================
//
// L'arbitrage modifie qty_announced (colonne "Apporté") du morning item :
// - "Patissier a raison" : aucun changement sur les qty, juste statut
// - "Café a raison"      : qty_announced = qty_received (la valeur du café devient l'apporté)
// - "Corriger qty"       : qty_announced = nouvelle valeur saisie
//
// L'arbitrage NE TOUCHE PAS aux items evening (le comptage du soir reste indépendant).

/**
 * Audit modifie directement la qty annoncée (sans choisir de camp).
 * Cas d'usage : "vérifié, c'est en fait 7 qu'il avait apporté".
 */
export async function auditOverrideQty(itemId, { qty_announced }, note, userId) {
  const patch = {
    discrepancy_status: 'audit_resolved',
    discrepancy_ack_at: new Date().toISOString(),
    discrepancy_ack_by: userId,
    discrepancy_resolved_in_favor_of: null,
  }
  if (qty_announced !== undefined && qty_announced !== null) {
    patch.qty_announced = qty_announced
  }
  if (note) patch.audit_note = note
  return updateItem(itemId, patch)
}

/**
 * Audit tranche en faveur d'un camp.
 * - 'patissier' : qty_announced reste tel quel (le patissier avait raison)
 * - 'cafe'      : qty_announced = qty_received (le café avait raison, sa valeur devient la vérité)
 */
export async function auditResolveInFavorOf(itemId, inFavorOf, note, userId) {
  if (inFavorOf !== 'patissier' && inFavorOf !== 'cafe') {
    throw new Error("inFavorOf doit être 'patissier' ou 'cafe'")
  }

  // Charger l'item pour récupérer qty_received si tranche en faveur du café
  const { data: morningItem, error: eGet } = await supabase
    .from('stock_day_items')
    .select('*')
    .eq('id', itemId)
    .single()
  if (eGet) throw eGet

  const patch = {
    discrepancy_status: 'audit_resolved',
    discrepancy_ack_at: new Date().toISOString(),
    discrepancy_ack_by: userId,
    discrepancy_resolved_in_favor_of: inFavorOf,
  }
  if (note) patch.audit_note = note

  // Si café a raison → la qty annoncée devient ce que le café a reçu
  if (inFavorOf === 'cafe' && morningItem.qty_received !== null && morningItem.qty_received !== undefined) {
    patch.qty_announced = morningItem.qty_received
  }

  return updateItem(itemId, patch)
}

/**
 * Charge les items source='morning' avec écart (en attente ou tranché par audit).
 */
export async function loadDiscrepancyItems(stockDayId) {
  const { data, error } = await supabase
    .from('stock_day_items')
    .select('*')
    .eq('stock_day_id', stockDayId)
    .eq('source', 'morning')
    .in('discrepancy_status', ['pending_patissier', 'pending_cafe', 'unresolved', 'audit_resolved'])
    .order('discrepancy_status', { ascending: true })
  if (error) throw error
  return data || []
}


export async function addSurpriseReceptionItem(stockDayId, productName, productCode, qty, userId) {
  // INSERT direct (pas upsert) — voir explication dans sendMorningItem
  const { data, error } = await supabase
    .from('stock_day_items')
    .insert({
      stock_day_id: stockDayId,
      product_name: productName,
      product_code: productCode || null,
      category: 'E',
      freshness: 'fresh',
      source: 'morning',
      qty_announced: 0,
      qty_received: qty,
      reception_status: 'discrepancy',
      reception_note: 'Reçu non annoncé par Hamza',
      received_by: userId,
      received_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[stockBoutique] addSurpriseReceptionItem:', error)
    throw error
  }
  return data
}

// =============================================================
// FLUX SOIR (CAFÉ — COMPTAGE AVEUGLE)
// =============================================================

export async function addEveningCount(stockDayId, productName, productCode, qty, freshness, userId) {
  // INSERT direct (pas upsert) pour permettre plusieurs lignes même article/fraîcheur
  const { data, error } = await supabase
    .from('stock_day_items')
    .insert({
      stock_day_id: stockDayId,
      product_name: productName,
      product_code: productCode || null,
      category: 'E',
      freshness: freshness || 'fresh',
      source: 'evening',
      qty_counted: qty,
      counted_by: userId,
      counted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[stockBoutique] addEveningCount:', error)
    throw error
  }
  return data
}

export async function updateEveningCount(itemId, qty, userId) {
  return updateItem(itemId, {
    qty_counted: qty,
    counted_by: userId,
    counted_at: new Date().toISOString(),
  })
}

export async function loadEveningCounts(stockDayId) {
  const { data, error } = await supabase
    .from('stock_day_items')
    .select('*')
    .eq('stock_day_id', stockDayId)
    .eq('source', 'evening')
    .order('product_name', { ascending: true })

  if (error) {
    console.error('[stockBoutique] loadEveningCounts:', error)
    return []
  }
  return data || []
}

// =============================================================
// FLUX AUDIT (rapport écarts + comparaison Odoo)
// =============================================================

/**
 * Construit le rapport d'écarts pour un jour.
 *
 * Pour chaque article (toutes fraîcheurs confondues) :
 *   - counted        = somme qty_counted (lignes evening)
 *   - odoo_initial   = somme qty_odoo_initial (snapshot au submit, figé)
 *   - odoo_current   = somme qty_odoo_snapshot (dernier rafraîchissement)
 *   - morning        = somme qty_received (lignes morning aujourd'hui)
 *   - leftover       = somme qty_received (lignes leftover, hors loss)
 *   - gap_initial    = odoo_initial - counted   (figé au submit)
 *   - gap_current    = odoo_current - counted   (à l'instant)
 *
 * Tri : articles avec écart courant non nul en premier.
 */
export async function buildAuditReport(stockDayId) {
  const items = await loadDayItems(stockDayId)

  const eveningItems = items.filter(it => it.source === 'evening')
  const morningItems = items.filter(it => it.source === 'morning')
  const leftoverItems = items.filter(it => it.source === 'leftover' && it.freshness !== 'loss')
  const odooOnlyItems = items.filter(it => it.source === 'odoo_only')

  // Tous les noms de produits qu'on doit afficher
  const allProductNames = new Set()
  eveningItems.forEach(i => allProductNames.add(i.product_name))
  morningItems.forEach(i => allProductNames.add(i.product_name))
  leftoverItems.forEach(i => allProductNames.add(i.product_name))
  odooOnlyItems.forEach(i => allProductNames.add(i.product_name))

  // Mapping préfixe → ordre catégorie
  const PREFIX_ORDER = { 'E-': 1, 'GS-': 2, 'MI-': 3, 'V-': 4, 'RA-': 5, 'H-': 6, 'N-': 7 }
  const PREFIX_LABEL = {
    'E-': 'E- Entremets',
    'GS-': 'GS- Gâteaux secs',
    'MI-': 'MI- Mignardises',
    'V-': 'V- Viennoiseries',
    'RA-': 'RA- Rahn',
    'H-': 'H-',
    'N-': 'N-',
  }

  function detectPrefix(name) {
    if (!name) return null
    const cleaned = name.replace(/^\[\d+\]\s*/, '').trim().toUpperCase()
    for (const p of Object.keys(PREFIX_ORDER)) {
      if (cleaned.startsWith(p)) return p
    }
    return null
  }

  const rows = []
  for (const productName of allProductNames) {
    const evList = eveningItems.filter(i => i.product_name === productName)
    const isCounted = evList.length > 0
    const counted = evList.reduce((s, i) => s + (i.qty_counted || 0), 0)

    // Odoo snapshots : soit sur lignes 'evening', soit sur 'odoo_only'
    const odooSources = [...evList, ...odooOnlyItems.filter(i => i.product_name === productName)]
    const odooInitialList = odooSources.filter(i => i.qty_odoo_initial !== null && i.qty_odoo_initial !== undefined)
    const odooInitial = odooInitialList.length > 0
      ? odooInitialList.reduce((s, i) => s + i.qty_odoo_initial, 0)
      : null

    const odooCurrentList = odooSources.filter(i => i.qty_odoo_snapshot !== null && i.qty_odoo_snapshot !== undefined)
    const odooCurrent = odooCurrentList.length > 0
      ? odooCurrentList.reduce((s, i) => s + i.qty_odoo_snapshot, 0)
      : null

    const morning = morningItems
      .filter(i => i.product_name === productName)
      .reduce((s, i) => s + (i.qty_received || i.qty_announced || 0), 0)
    const morningAnnounced = morningItems
      .filter(i => i.product_name === productName)
      .reduce((s, i) => s + (i.qty_announced || 0), 0)
    const morningReceived = morningItems
      .filter(i => i.product_name === productName)
      .reduce((s, i) => s + (i.qty_received || 0), 0)
    const leftover = leftoverItems
      .filter(i => i.product_name === productName)
      .reduce((s, i) => s + (i.qty_received || 0), 0)

    const gapInitial = (isCounted && odooInitial !== null) ? odooInitial - counted : null
    const gapCurrent = (isCounted && odooCurrent !== null) ? odooCurrent - counted : null

    const prefix = detectPrefix(productName)
    rows.push({
      product_name: productName,
      prefix,
      category_label: prefix ? PREFIX_LABEL[prefix] : 'Autres',
      is_counted: isCounted,
      qty_counted: isCounted ? counted : null,
      qty_odoo_initial: odooInitial,
      qty_odoo_current: odooCurrent,
      qty_morning: morning,
      qty_morning_announced: morningAnnounced,
      qty_morning_received: morningReceived,
      qty_leftover: leftover,
      qty_expected_local: morning + leftover,
      gap_initial: gapInitial,
      gap_current: gapCurrent,
      gap_vs_local: isCounted ? (morning + leftover) - counted : null,
    })
  }

  // Tri : par catégorie (E→GS→MI→V→RA→H→N), puis alphabétique
  rows.sort((a, b) => {
    const oa = PREFIX_ORDER[a.prefix] || 99
    const ob = PREFIX_ORDER[b.prefix] || 99
    if (oa !== ob) return oa - ob
    return a.product_name.localeCompare(b.product_name, 'fr')
  })

  return rows
}

// =============================================================
// REALTIME
// =============================================================

export function subscribeToDayItems(stockDayId, callbacks = {}) {
  const channel = supabase
    .channel(`stock_items_${stockDayId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'stock_day_items',
      filter: `stock_day_id=eq.${stockDayId}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT' && callbacks.onInsert) {
        callbacks.onInsert(payload.new)
      } else if (payload.eventType === 'UPDATE' && callbacks.onUpdate) {
        callbacks.onUpdate(payload.new, payload.old)
      } else if (payload.eventType === 'DELETE' && callbacks.onDelete) {
        callbacks.onDelete(payload.old)
      }
    })
    .subscribe()
  return channel
}

export function subscribeToStockDay(stockDayId, callback) {
  const channel = supabase
    .channel(`stock_day_${stockDayId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'stock_day',
      filter: `id=eq.${stockDayId}`,
    }, (payload) => {
      if (callback) callback(payload.new, payload.old)
    })
    .subscribe()
  return channel
}

// =============================================================
// HISTORIQUE
// =============================================================

export async function loadDaySummary(daysBack = 30) {
  const dateStart = new Date()
  dateStart.setDate(dateStart.getDate() - daysBack)
  const fromISO = `${dateStart.getFullYear()}-${String(dateStart.getMonth() + 1).padStart(2, '0')}-${String(dateStart.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('stock_day_summary')
    .select('*')
    .gte('day', fromISO)
    .order('day', { ascending: false })

  if (error) {
    console.error('[stockBoutique] loadDaySummary:', error)
    return []
  }
  return data || []
}

// =============================================================
// PERMS
// =============================================================

export function canStockPatissier(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_patissier === true
}

export function canStockCafe(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_cafe === true
}

export function canStockAudit(user) {
  if (!user) return false
  return user.role === 'admin' || user.perm_stock_audit === true
}

export function canSeeStock(user) {
  return canStockPatissier(user) || canStockCafe(user) || canStockAudit(user)
}

