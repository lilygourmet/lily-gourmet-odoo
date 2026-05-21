// Toutes les queries Supabase isolées pour le module Caisse
import { supabase } from './supabase'
import { monthBounds, todayISO } from '../components/Caisse/_helpers'

// ============================================================
// AUDIT LOG (helper - silencieux, ne fait jamais planter l'appel parent)
// ============================================================

async function logAction({ entityType, entityId, action, description, amount = null, before = null, after = null, actorId = null }) {
  try {
    await supabase.from('caisse_audit_log').insert({
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      action,
      description,
      amount,
      before_value: before,
      after_value: after,
      actor_id: actorId,
    })
  } catch (e) {
    console.warn('[caisse_audit_log] log failed:', e?.message)
  }
}

export async function loadAuditLog({ entityType = null, entityId = null, actorId = null, limit = 100, offset = 0 } = {}) {
  let q = supabase
    .from('caisse_audit_log')
    .select('*, actor:profiles!caisse_audit_log_actor_id_fkey(id, username, full_name)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (entityType) q = q.eq('entity_type', entityType)
  if (entityId)   q = q.eq('entity_id', String(entityId))
  if (actorId)    q = q.eq('actor_id', actorId)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ============================================================
// DESTINATAIRES
// ============================================================

export async function loadDestinataires({ activeOnly = true } = {}) {
  let q = supabase.from('caisse_destinataires').select('*').order('position').order('id')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function createDestinataire({ name, type, color_key, linked_caisse_owner = null }) {
  const { data, error } = await supabase
    .from('caisse_destinataires')
    .insert({ name, type, color_key, linked_caisse_owner, position: 100 })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDestinataire(id, updates) {
  const { error } = await supabase.from('caisse_destinataires').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteDestinataire(id) {
  // Si utilisé → on désactive seulement
  const { data: used } = await supabase
    .from('caisse_enveloppes')
    .select('id', { count: 'exact', head: true })
    .eq('destinataire_id', id)
  // count vient via header, on fait simple : on tente l'update
  const { error } = await supabase.from('caisse_destinataires').update({ active: false }).eq('id', id)
  if (error) throw error
}

// ============================================================
// ENVELOPPES
// ============================================================

export async function loadEnveloppesByMonth(year, month) {
  const { start, end } = monthBounds(year, month)
  const sel = '*, destinataire:caisse_destinataires(*), assigner:profiles!caisse_enveloppes_assigned_by_fkey(username, full_name)'

  // On charge 2 ensembles : sessions du mois (sans assigned_date) + affectations du mois
  const [r1, r2] = await Promise.all([
    supabase.from('caisse_enveloppes').select(sel)
      .gte('session_date', start).lt('session_date', end)
      .order('session_date', { ascending: true }).order('source'),
    supabase.from('caisse_enveloppes').select(sel)
      .gte('assigned_date', start).lt('assigned_date', end)
      .order('assigned_date', { ascending: true }).order('source'),
  ])
  if (r1.error) throw r1.error
  if (r2.error) throw r2.error

  // Fusion : une enveloppe avec assigned_date n'apparaît que dans son mois d'affectation
  const map = new Map()
  for (const e of (r1.data || [])) {
    if (!e.assigned_date) map.set(e.id, e)
  }
  for (const e of (r2.data || [])) {
    map.set(e.id, e)
  }
  const list = Array.from(map.values())
  list.sort((a, b) => {
    const da = a.assigned_date || a.session_date
    const db = b.assigned_date || b.session_date
    return da.localeCompare(db) || (a.source || '').localeCompare(b.source || '')
  })
  return list
}

export async function loadEnveloppesUnassigned() {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*')
    .is('destinataire_id', null)
    .order('session_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadEnveloppesByDestinataireMonth(destinataireId, year, month) {
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .eq('destinataire_id', destinataireId)
    .gte('session_date', start)
    .lt('session_date', end)
    .order('session_date', { ascending: true })
  if (error) throw error
  return data || []
}

export async function assignEnveloppe(envId, destinataireId, userId, assignedDate = null) {
  const effectiveDate = assignedDate || todayISO()
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      destinataire_id: destinataireId,
      assigned_at: new Date().toISOString(),
      assigned_by: userId,
      assigned_date: effectiveDate,
      proof_date: effectiveDate, // date par défaut = date d'affectation
    })
    .eq('id', envId)
  if (error) throw error

  // Si le destinataire est une caisse-gérée, on crée l'entrée correspondante
  const { data: env } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .eq('id', envId)
    .single()
  if (env?.destinataire?.type === 'caisse_geree' && env.destinataire.linked_caisse_owner) {
    await supabase.from('caisse_mouvements').insert({
      caisse_owner: env.destinataire.linked_caisse_owner,
      type: 'entree',
      source_type: 'enveloppe',
      source_ref: env.id,
      amount: env.amount_cash,
      label: `Enveloppe ${env.source} · ${env.session_date}`,
      mvt_date: effectiveDate, // date d'effet = date d'affectation
      created_by: userId,
    })
  }

  // Log
  await logAction({
    entityType: 'enveloppe',
    entityId: envId,
    action: 'assign',
    description: `Enveloppe ${env?.source || ''} (${env?.session_date || ''}) → ${env?.destinataire?.name || '?'} le ${effectiveDate}`,
    amount: env?.amount_cash,
    after: { destinataire_id: destinataireId, assigned_date: effectiveDate },
    actorId: userId,
  })
}

export async function unassignEnveloppe(envId, actorId = null) {
  // Récupérer info avant pour le log
  const { data: before } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(name)')
    .eq('id', envId)
    .single()

  // Si une entrée caisse-gérée a été créée, on la supprime
  await supabase.from('caisse_mouvements').delete().eq('source_type', 'enveloppe').eq('source_ref', envId)
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      destinataire_id: null,
      assigned_at: null,
      assigned_by: null,
      assigned_date: null,
      proof_url: null,
      proof_date: null,
      proof_uploaded_at: null,
    })
    .eq('id', envId)
  if (error) throw error

  await logAction({
    entityType: 'enveloppe',
    entityId: envId,
    action: 'unassign',
    description: `Désaffectation enveloppe ${before?.source || ''} (${before?.session_date || ''}) — était sur ${before?.destinataire?.name || '?'}`,
    amount: before?.amount_cash,
    before: { destinataire_id: before?.destinataire_id, assigned_date: before?.assigned_date },
    actorId,
  })
}

export async function reassignEnveloppe(envId, newDestinataireId, userId, assignedDate = null) {
  await unassignEnveloppe(envId, userId)
  await assignEnveloppe(envId, newDestinataireId, userId, assignedDate)
}

export async function updateEnveloppeDate(envId, newDate) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({ proof_date: newDate })
    .eq('id', envId)
  if (error) throw error
}

export async function setEnveloppeProof(envId, proofUrl, proofDate, amountProof = null, noteProof = null, actorId = null) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      proof_url: proofUrl,
      proof_date: proofDate,
      proof_uploaded_at: new Date().toISOString(),
      amount_proof: amountProof,
      note_proof: noteProof,
    })
    .eq('id', envId)
  if (error) throw error

  const { data: env } = await supabase
    .from('caisse_enveloppes')
    .select('source, session_date, destinataire:caisse_destinataires(name)')
    .eq('id', envId)
    .single()
  await logAction({
    entityType: 'enveloppe',
    entityId: envId,
    action: 'proof_upload',
    description: `Preuve déposée pour ${env?.source || ''} (${env?.session_date || ''}) → ${env?.destinataire?.name || '?'} le ${proofDate}`,
    amount: amountProof,
    after: { proof_url: proofUrl, proof_date: proofDate, amount_proof: amountProof, note_proof: noteProof },
    actorId,
  })
}

// Pour le suivi banque/perso
export async function loadEnveloppesForSuivi({ type, month, year, statusFilter = 'pending' }) {
  // type: 'banque' | 'perso'
  const { start, end } = monthBounds(year, month)
  let q = supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .not('destinataire_id', 'is', null)
    .gte('session_date', start)
    .lt('session_date', end)
    .order('session_date', { ascending: false })
  const { data, error } = await q
  if (error) throw error
  const list = (data || []).filter(e => e.destinataire?.type === type)
  if (statusFilter === 'pending')   return list.filter(e => !e.proof_url)
  if (statusFilter === 'done')      return list.filter(e =>  e.proof_url)
  return list
}

// ============================================================
// MOUVEMENTS CAISSE
// ============================================================

export async function loadMouvementsMonth(caisseOwner, year, month) {
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('caisse_owner', caisseOwner)
    .gte('mvt_date', start)
    .lt('mvt_date', end)
    .order('mvt_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadCaisseBalance(caisseOwner) {
  // Solde = somme des entrées - somme des sorties depuis la dernière clôture
  // Pour v1 : on prend tout depuis le début
  const { data: entrees } = await supabase
    .from('caisse_mouvements')
    .select('amount')
    .eq('caisse_owner', caisseOwner)
    .eq('type', 'entree')
  const { data: sorties } = await supabase
    .from('caisse_mouvements')
    .select('amount')
    .eq('caisse_owner', caisseOwner)
    .eq('type', 'sortie')
  const totalIn  = (entrees || []).reduce((s, m) => s + Number(m.amount), 0)
  const totalOut = (sorties || []).reduce((s, m) => s + Number(m.amount), 0)
  return totalIn - totalOut
}

export async function loadMonthStats(caisseOwner, year, month) {
  const mvts = await loadMouvementsMonth(caisseOwner, year, month)
  const entrees = mvts.filter(m => m.type === 'entree').reduce((s, m) => s + Number(m.amount), 0)
  const sorties = mvts.filter(m => m.type === 'sortie').reduce((s, m) => s + Number(m.amount), 0)
  // Sorties par catégorie
  const byCat = {}
  mvts.filter(m => m.type === 'sortie').forEach(m => {
    byCat[m.category || 'Autre'] = (byCat[m.category || 'Autre'] || 0) + Number(m.amount)
  })
  return { entrees, sorties, byCat }
}

export async function addMouvement({ caisseOwner, type, sourceType, amount, category, label, mvtDate, hasFacture = false, userId }) {
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .insert({
      caisse_owner: caisseOwner,
      type,
      source_type: sourceType,
      amount,
      category: category || null,
      label,
      mvt_date: mvtDate,
      has_facture: hasFacture,
      facture_status: hasFacture ? 'pending' : null,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error

  // Ne pas logger les mouvements auto liés à une enveloppe ou à une avance (déjà loggués par le parent)
  if (sourceType !== 'enveloppe' && sourceType !== 'avance') {
    await logAction({
      entityType: 'mouvement',
      entityId: data.id,
      action: 'create',
      description: `${type === 'entree' ? '↓ Entrée' : '↑ Sortie'} caisse ${caisseOwner} : ${label}${category ? ' · ' + category : ''}`,
      amount: type === 'sortie' ? -Number(amount) : Number(amount),
      after: { caisse_owner: caisseOwner, type, amount, category, label, mvt_date: mvtDate },
      actorId: userId,
    })
  }
  return data
}

export async function updateMouvement(id, updates, actorId = null) {
  const { data: before } = await supabase.from('caisse_mouvements').select('*').eq('id', id).single()
  const { error } = await supabase.from('caisse_mouvements').update(updates).eq('id', id)
  if (error) throw error
  await logAction({
    entityType: 'mouvement',
    entityId: id,
    action: 'update',
    description: `Modification mouvement : ${before?.label || ''}`,
    amount: updates?.amount != null ? Number(updates.amount) : before?.amount,
    before, after: updates,
    actorId,
  })
}

export async function deleteMouvement(id, actorId = null) {
  const { data: before } = await supabase.from('caisse_mouvements').select('*').eq('id', id).single()
  const { error } = await supabase.from('caisse_mouvements').delete().eq('id', id)
  if (error) throw error
  await logAction({
    entityType: 'mouvement',
    entityId: id,
    action: 'delete',
    description: `Suppression mouvement caisse ${before?.caisse_owner || ''} : ${before?.label || ''}`,
    amount: before?.amount,
    before,
    actorId,
  })
}

// ============================================================
// CATÉGORIES
// ============================================================

export async function loadCategories(caisseOwner) {
  const { data, error } = await supabase
    .from('caisse_categories')
    .select('*')
    .eq('caisse_owner', caisseOwner)
    .eq('active', true)
    .order('position')
  if (error) throw error
  return data || []
}

export async function createCategorie({ caisseOwner, name, emoji }) {
  const { data, error } = await supabase
    .from('caisse_categories')
    .insert({ caisse_owner: caisseOwner, name, emoji: emoji || '❓', position: 100 })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCategorie(id, updates) {
  const { error } = await supabase.from('caisse_categories').update(updates).eq('id', id)
  if (error) throw error
}

export async function categorieUsageCount(catId, caisseOwner, catName) {
  // On compte par nom de catégorie (parce que caisse_mouvements stocke le name, pas l'id)
  const { count, error } = await supabase
    .from('caisse_mouvements')
    .select('id', { count: 'exact', head: true })
    .eq('caisse_owner', caisseOwner)
    .eq('category', catName)
  if (error) throw error
  return count || 0
}

// ============================================================
// HAMID
// ============================================================

export async function loadHamidAvancesMonth(year, month) {
  // Les avances sont dans caisse_mouvements avec category='Avance Hamid'
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('caisse_owner', 'meriem')
    .eq('type', 'sortie')
    .eq('category', 'Avance Hamid')
    .gte('mvt_date', start)
    .lt('mvt_date', end)
    .order('mvt_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadHamidDepensesMonth(year, month) {
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_hamid_depenses')
    .select('*')
    .gte('depense_date', start)
    .lt('depense_date', end)
    .order('depense_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadHamidBalance() {
  // Solde Hamid = somme des avances - somme des dépenses
  const { data: avances } = await supabase
    .from('caisse_mouvements')
    .select('amount')
    .eq('caisse_owner', 'meriem')
    .eq('type', 'sortie')
    .eq('category', 'Avance Hamid')
  const { data: depenses } = await supabase
    .from('caisse_hamid_depenses')
    .select('amount')
  // Aussi les "Hamid rend l'argent" (entrée caisse Meriem source_type='hamid_rendu')
  const { data: rendus } = await supabase
    .from('caisse_mouvements')
    .select('amount')
    .eq('caisse_owner', 'meriem')
    .eq('source_type', 'hamid_rendu')
  const totalAv  = (avances  || []).reduce((s, m) => s + Number(m.amount), 0)
  const totalDep = (depenses || []).reduce((s, m) => s + Number(m.amount), 0)
  const totalRendu = (rendus || []).reduce((s, m) => s + Number(m.amount), 0)
  return totalAv - totalDep - totalRendu
}

export async function donnerAHamid({ amount, label, mvtDate, userId }) {
  // Crée une sortie Meriem catégorie "Avance Hamid"
  return await addMouvement({
    caisseOwner: 'meriem',
    type: 'sortie',
    sourceType: 'hamid_avance',
    amount, category: 'Avance Hamid', label, mvtDate, hasFacture: false, userId,
  })
}

export async function ajouterDepenseHamid({ amount, category, label, mvtDate, userId }) {
  const { data, error } = await supabase
    .from('caisse_hamid_depenses')
    .insert({ amount, category, label, depense_date: mvtDate, created_by: userId })
    .select().single()
  if (error) throw error
  return data
}

export async function hamidRendArgent({ amount, label, mvtDate, userId }) {
  // Entrée dans caisse Meriem
  return await addMouvement({
    caisseOwner: 'meriem',
    type: 'entree',
    sourceType: 'hamid_rendu',
    amount, category: null, label: label || `Hamid rend l'argent`, mvtDate, userId,
  })
}

// ============================================================
// FACTURES (sorties Meriem avec has_facture = true)
// ============================================================

export async function loadFacturesAll() {
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('caisse_owner', 'meriem')
    .eq('has_facture', true)
    .order('mvt_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadFacturesStats(year) {
  // Total / récupéré / reliquat pour l'année donnée
  const start = `${year}-01-01`
  const end   = `${year + 1}-01-01`
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .select('amount, facture_status')
    .eq('caisse_owner', 'meriem')
    .eq('has_facture', true)
    .gte('mvt_date', start)
    .lt('mvt_date', end)
  if (error) throw error
  const list = data || []
  const total      = list.reduce((s, m) => s + Number(m.amount), 0)
  const recovered  = list.filter(m => m.facture_status === 'recovered').reduce((s, m) => s + Number(m.amount), 0)
  const pending    = list.filter(m => m.facture_status === 'pending'  ).reduce((s, m) => s + Number(m.amount), 0)
  return {
    total, recovered, pending,
    countAll: list.length,
    countPending:  list.filter(m => m.facture_status === 'pending'  ).length,
    countRecovered:list.filter(m => m.facture_status === 'recovered').length,
  }
}

export async function marquerFactureRecuperee({ mouvementId, recoveredDate, userId }) {
  // 1) Marque la facture
  const { data: mvt, error: e1 } = await supabase
    .from('caisse_mouvements')
    .update({ facture_status: 'recovered', facture_recovered_at: new Date().toISOString() })
    .eq('id', mouvementId)
    .select()
    .single()
  if (e1) throw e1
  // 2) Crée une entrée dans la caisse Layla LG
  await addMouvement({
    caisseOwner: 'layla_lg',
    type: 'entree',
    sourceType: 'facture_recup',
    amount: mvt.amount,
    label: `Récupération facture · ${mvt.label}`,
    mvtDate: recoveredDate,
    userId,
  })
  // On stocke le ref dans la nouvelle entrée pour traçabilité
  await supabase.from('caisse_mouvements')
    .update({ source_ref: mouvementId })
    .eq('caisse_owner', 'layla_lg')
    .eq('source_type', 'facture_recup')
    .order('created_at', { ascending: false })
    .limit(1)
}

// ============================================================
// SALAIRES
// ============================================================

export async function loadSalairesYear(year) {
  const { data, error } = await supabase
    .from('caisse_salaires')
    .select('*')
    .eq('year', year)
    .order('month', { ascending: false })
    .order('beneficiaire')
  if (error) throw error
  return data || []
}

export async function loadSalaireMonth(year, month) {
  const { data, error } = await supabase
    .from('caisse_salaires')
    .select('*')
    .eq('year', year).eq('month', month)
  if (error) throw error
  return data || []
}

export async function loadSalairesDefaut() {
  const { data, error } = await supabase.from('caisse_salaires_defaut').select('*')
  if (error) throw error
  const map = {}
  ;(data || []).forEach(s => { map[s.beneficiaire] = Number(s.amount) })
  return map
}

export async function setSalaireDefaut(beneficiaire, amount) {
  const { error } = await supabase
    .from('caisse_salaires_defaut')
    .upsert({ beneficiaire, amount })
  if (error) throw error
}

export async function createSalaire({ beneficiaire, month, year, target_amount }) {
  const { data, error } = await supabase
    .from('caisse_salaires')
    .insert({ beneficiaire, month, year, target_amount, status: 'brouillon' })
    .select().single()
  if (error) throw error
  return data
}

export async function loadSalaireEnveloppes(salaireId) {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*')
    .eq('salaire_id', salaireId)
    .order('session_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function setSalaireEnveloppes(salaireId, envIds) {
  // 1) Détache toutes les enveloppes actuelles
  await supabase.from('caisse_enveloppes').update({ salaire_id: null }).eq('salaire_id', salaireId)
  // 2) Attache les nouvelles
  if (envIds.length > 0) {
    await supabase.from('caisse_enveloppes').update({ salaire_id: salaireId }).in('id', envIds)
  }
}

export async function loadAvailableEnveloppesForSalaire(year, month) {
  // Enveloppes non affectées à un destinataire ET non attachées à un salaire
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*')
    .is('destinataire_id', null)
    .is('salaire_id', null)
    .gte('session_date', start)
    .lt('session_date', end)
    .order('session_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function markSalairePret(salaireId, reliquatAmount, reliquatDestination) {
  const { error } = await supabase
    .from('caisse_salaires')
    .update({
      status: 'pret',
      reliquat_amount: reliquatAmount,
      reliquat_destination: reliquatDestination,
    })
    .eq('id', salaireId)
  if (error) throw error
}

export async function markSalairePaye(salaireId, userId) {
  const { data: sal } = await supabase.from('caisse_salaires').select('*').eq('id', salaireId).single()
  if (!sal) return
  const { error } = await supabase
    .from('caisse_salaires')
    .update({ status: 'paye', paid_at: new Date().toISOString() })
    .eq('id', salaireId)
  if (error) throw error
  // Si reliquat → entrée dans la caisse de destination
  if (sal.reliquat_amount > 0 && sal.reliquat_destination) {
    const owner = sal.reliquat_destination === 'caisse_meriem' ? 'meriem'
                : sal.reliquat_destination === 'caisse_layla_lg' ? 'layla_lg' : null
    if (owner) {
      await addMouvement({
        caisseOwner: owner,
        type: 'entree',
        sourceType: 'salaire_reliquat',
        amount: sal.reliquat_amount,
        label: `Reliquat salaire ${sal.beneficiaire} ${sal.month}/${sal.year}`,
        mvtDate: todayISO(),
        userId,
      })
    }
  }
  await logAction({
    entityType: 'salaire',
    entityId: salaireId,
    action: 'pay',
    description: `Salaire ${sal.beneficiaire} ${sal.month}/${sal.year} payé`,
    amount: sal.target_amount,
    after: { status: 'paye' },
    actorId: userId,
  })
}

export async function deleteSalaire(salaireId, actorId = null) {
  const { data: before } = await supabase.from('caisse_salaires').select('*').eq('id', salaireId).single()
  // Détache les enveloppes d'abord
  await supabase.from('caisse_enveloppes').update({ salaire_id: null }).eq('salaire_id', salaireId)
  await supabase.from('caisse_salaires').delete().eq('id', salaireId)
  await logAction({
    entityType: 'salaire',
    entityId: salaireId,
    action: 'delete',
    description: `Suppression salaire ${before?.beneficiaire || ''} ${before?.month || ''}/${before?.year || ''}`,
    amount: before?.target_amount,
    before,
    actorId,
  })
}

// ============================================================
// CLÔTURE MOIS
// ============================================================

export async function cloturerMois({ caisseOwner, year, month, balance, userId }) {
  // 1) Insert clôture
  const { error: e1 } = await supabase.from('caisse_cloture_mois').insert({
    caisse_owner: caisseOwner, year, month, closing_balance: balance, closed_by: userId,
  })
  if (e1) throw e1
  // 2) Verrouille les mouvements du mois
  const { start, end } = monthBounds(year, month)
  await supabase
    .from('caisse_mouvements')
    .update({ month_locked: true })
    .eq('caisse_owner', caisseOwner)
    .gte('mvt_date', start)
    .lt('mvt_date', end)
  await logAction({
    entityType: 'cloture',
    entityId: `${caisseOwner}-${year}-${month}`,
    action: 'close_month',
    description: `Clôture caisse ${caisseOwner} pour ${month}/${year} (solde ${balance})`,
    amount: balance,
    after: { caisse_owner: caisseOwner, year, month, balance },
    actorId: userId,
  })
}

export async function loadClotures(caisseOwner) {
  const { data, error } = await supabase
    .from('caisse_cloture_mois')
    .select('*')
    .eq('caisse_owner', caisseOwner)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  if (error) throw error
  return data || []
}

export async function isMonthClosed(caisseOwner, year, month) {
  const { data } = await supabase
    .from('caisse_cloture_mois')
    .select('id')
    .eq('caisse_owner', caisseOwner)
    .eq('year', year).eq('month', month)
    .limit(1)
  return (data || []).length > 0
}

// ============================================================
// SESSIONS POS
// ============================================================

export async function loadPosConfigs() {
  const { data, error } = await supabase
    .from('caisse_pos_sessions_config')
    .select('*')
    .order('name')
  if (error) throw error
  return data || []
}

export async function togglePosConfig(id, active) {
  const { error } = await supabase
    .from('caisse_pos_sessions_config')
    .update({ active })
    .eq('id', id)
  if (error) throw error
}

// ============================================================
// STORAGE PREUVES
// ============================================================

export async function uploadPreuve(file, envId) {
  const ext = file.name.split('.').pop()
  const path = `env_${envId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('caisse-preuves').upload(path, file, {
    cacheControl: '3600', upsert: false,
  })
  if (error) throw error
  // URL signée valide 1 an
  const { data } = await supabase.storage.from('caisse-preuves').createSignedUrl(path, 60 * 60 * 24 * 365)
  return data?.signedUrl || null
}

export async function getPreuveSignedUrl(path) {
  if (path?.startsWith('http')) return path
  const { data } = await supabase.storage.from('caisse-preuves').createSignedUrl(path, 60 * 60)
  return data?.signedUrl
}

// ============================================================
// AVANCES (Meriem avance pour Layla/Nezha)
// Connectées à la caisse Meriem : avance = sortie auto, remboursé = entrée auto
// ============================================================

/**
 * Liste les avances (avec join sur le bénéficiaire et le payeur)
 */
export async function loadAvances({ beneficiaryId, status = 'pending' } = {}) {
  let q = supabase
    .from('caisse_avances')
    .select(`
      *,
      beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(id, name, color_key),
      payer:profiles!caisse_avances_payer_id_fkey(id, username, full_name)
    `)
    .order('avance_date', { ascending: false })

  if (beneficiaryId) q = q.eq('beneficiary_id', beneficiaryId)
  if (status === 'pending')  q = q.is('refunded_at', null)
  if (status === 'refunded') q = q.not('refunded_at', 'is', null)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Récap par bénéficiaire : combien chacun doit (avances non remboursées)
 */
export async function loadAvancesSummary() {
  const { data, error } = await supabase
    .from('caisse_avances')
    .select(`
      amount,
      beneficiary_id,
      beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(id, name, color_key)
    `)
    .is('refunded_at', null)

  if (error) throw error

  const map = {}
  for (const a of (data || [])) {
    const key = a.beneficiary_id
    if (!map[key]) {
      map[key] = {
        beneficiary_id: key,
        name: a.beneficiaire?.name || '?',
        color_key: a.beneficiaire?.color_key,
        total_due: 0,
        count: 0,
      }
    }
    map[key].total_due += Number(a.amount) || 0
    map[key].count += 1
  }
  return Object.values(map)
}

/**
 * Crée une nouvelle avance + un mouvement de SORTIE dans la caisse de Meriem
 */
export async function createAvance({ payerId, beneficiaryId, beneficiaryName, amount, motif, avanceDate, userId }) {
  // 1. Créer le mouvement de sortie dans la caisse Meriem
  const labelSortie = motif
    ? `💸 Avance pour ${beneficiaryName} — ${motif}`
    : `💸 Avance pour ${beneficiaryName}`
  const categoryName = `Prêt ${beneficiaryName}`

  const mvt = await addMouvement({
    caisseOwner: 'meriem',
    type: 'sortie',
    sourceType: 'avance',
    amount: Number(amount),
    category: categoryName,
    label: labelSortie,
    mvtDate: avanceDate || new Date().toISOString().slice(0, 10),
    hasFacture: false,
    userId,
  })

  // 2. Créer l'avance liée au mouvement
  const { data, error } = await supabase
    .from('caisse_avances')
    .insert({
      payer_id: payerId,
      beneficiary_id: beneficiaryId,
      amount: Number(amount),
      motif: motif || null,
      avance_date: avanceDate || new Date().toISOString().slice(0, 10),
      created_by: userId,
      sortie_mouvement_id: mvt.id,
    })
    .select()
    .single()

  if (error) {
    try { await deleteMouvement(mvt.id) } catch (e) { console.error('rollback mouvement:', e) }
    throw error
  }
  await logAction({
    entityType: 'avance',
    entityId: data.id,
    action: 'create',
    description: `💸 Avance pour ${beneficiaryName} : ${Number(amount)} dh${motif ? ' (' + motif + ')' : ''}`,
    amount: Number(amount),
    after: { beneficiary_id: beneficiaryId, amount, motif, avance_date: avanceDate },
    actorId: userId,
  })
  return data
}

/**
 * Marque une avance comme remboursée + crée un mouvement d'ENTRÉE dans la caisse
 */
export async function markAvanceRefunded(avanceId, note = null, userId = null) {
  // 1. Charger l'avance pour récupérer le montant + nom bénéficiaire
  const { data: avance, error: errLoad } = await supabase
    .from('caisse_avances')
    .select(`
      *,
      beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(id, name)
    `)
    .eq('id', avanceId)
    .single()
  if (errLoad) throw errLoad
  if (avance.refunded_at) throw new Error('Avance déjà remboursée')

  // 2. Créer le mouvement d'entrée
  const benefName = avance.beneficiaire?.name || '?'
  const labelEntree = avance.motif
    ? `💸 Remb. ${benefName} — ${avance.motif}`
    : `💸 Remb. ${benefName}`
  const categoryName = `Prêt ${benefName}`

  const mvt = await addMouvement({
    caisseOwner: 'meriem',
    type: 'entree',
    sourceType: 'avance',
    amount: Number(avance.amount),
    category: categoryName,
    label: labelEntree,
    mvtDate: new Date().toISOString().slice(0, 10),
    hasFacture: false,
    userId: userId || avance.created_by,
  })

  // 3. Marquer l'avance comme remboursée
  const { data, error } = await supabase
    .from('caisse_avances')
    .update({
      refunded_at: new Date().toISOString(),
      refunded_note: note,
      entree_mouvement_id: mvt.id,
    })
    .eq('id', avanceId)
    .select()
    .single()

  if (error) {
    try { await deleteMouvement(mvt.id) } catch (e) { console.error('rollback mouvement:', e) }
    throw error
  }
  await logAction({
    entityType: 'avance',
    entityId: avanceId,
    action: 'refund',
    description: `💸 Avance ${benefName} remboursée${note ? ' (' + note + ')' : ''}`,
    amount: Number(avance.amount),
    after: { refunded_at: data.refunded_at, refunded_note: note },
    actorId: userId,
  })
  return data
}

/**
 * Annule un remboursement : supprime le mouvement d'entrée et réinitialise
 */
export async function unmarkAvanceRefunded(avanceId, actorId = null) {
  // 1. Charger l'avance pour récupérer entree_mouvement_id
  const { data: avance, error: errLoad } = await supabase
    .from('caisse_avances')
    .select('entree_mouvement_id, amount, beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(name)')
    .eq('id', avanceId)
    .single()
  if (errLoad) throw errLoad

  // 2. Supprimer le mouvement d'entrée s'il existe
  if (avance.entree_mouvement_id) {
    try {
      await deleteMouvement(avance.entree_mouvement_id)
    } catch (e) {
      console.warn('[unmarkAvanceRefunded] suppression mouvement entrée:', e.message)
    }
  }

  // 3. Réinitialiser l'avance
  const { error } = await supabase
    .from('caisse_avances')
    .update({
      refunded_at: null,
      refunded_note: null,
      entree_mouvement_id: null,
    })
    .eq('id', avanceId)
  if (error) throw error

  await logAction({
    entityType: 'avance',
    entityId: avanceId,
    action: 'unrefund',
    description: `Remboursement annulé : ${avance.beneficiaire?.name || '?'} (${avance.amount} dh)`,
    amount: avance?.amount,
    actorId,
  })
}

/**
 * Supprime une avance ET les mouvements caisse associés (erreur de saisie)
 */
export async function deleteAvance(avanceId, actorId = null) {
  // 1. Charger l'avance pour récupérer les IDs de mouvements liés + info pour le log
  const { data: avance, error: errLoad } = await supabase
    .from('caisse_avances')
    .select('sortie_mouvement_id, entree_mouvement_id, amount, motif, beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(name)')
    .eq('id', avanceId)
    .single()
  if (errLoad) throw errLoad

  // 2. Supprimer l'avance d'abord (les FK avec ON DELETE SET NULL ne posent pas problème)
  const { error } = await supabase
    .from('caisse_avances')
    .delete()
    .eq('id', avanceId)
  if (error) throw error

  // 3. Supprimer les mouvements caisse liés
  if (avance.sortie_mouvement_id) {
    try { await deleteMouvement(avance.sortie_mouvement_id) } catch (e) { console.warn('del sortie:', e.message) }
  }
  if (avance.entree_mouvement_id) {
    try { await deleteMouvement(avance.entree_mouvement_id) } catch (e) { console.warn('del entree:', e.message) }
  }

  await logAction({
    entityType: 'avance',
    entityId: avanceId,
    action: 'delete',
    description: `Suppression avance : ${avance.beneficiaire?.name || '?'} (${avance.amount} dh)${avance.motif ? ' — ' + avance.motif : ''}`,
    amount: avance?.amount,
    before: avance,
    actorId,
  })
}
