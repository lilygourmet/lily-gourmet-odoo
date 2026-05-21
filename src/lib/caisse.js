// Toutes les queries Supabase isolées pour le module Caisse
import { supabase } from './supabase'
import { monthBounds, todayISO } from '../components/Caisse/_helpers'

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
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*), assigner:profiles!caisse_enveloppes_assigned_by_fkey(username, full_name)')
    .gte('session_date', start)
    .lt('session_date', end)
    .order('session_date', { ascending: true })
    .order('source')
  if (error) throw error
  return data || []
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

export async function assignEnveloppe(envId, destinataireId, userId) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      destinataire_id: destinataireId,
      assigned_at: new Date().toISOString(),
      assigned_by: userId,
      proof_date: todayISO(), // date par défaut = jour du clic
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
      mvt_date: env.session_date,
      created_by: userId,
    })
  }
}

export async function unassignEnveloppe(envId) {
  // Si une entrée caisse-gérée a été créée, on la supprime
  await supabase.from('caisse_mouvements').delete().eq('source_type', 'enveloppe').eq('source_ref', envId)
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      destinataire_id: null,
      assigned_at: null,
      assigned_by: null,
      proof_url: null,
      proof_date: null,
      proof_uploaded_at: null,
    })
    .eq('id', envId)
  if (error) throw error
}

export async function reassignEnveloppe(envId, newDestinataireId, userId) {
  await unassignEnveloppe(envId)
  await assignEnveloppe(envId, newDestinataireId, userId)
}

export async function updateEnveloppeDate(envId, newDate) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({ proof_date: newDate })
    .eq('id', envId)
  if (error) throw error
}

export async function setEnveloppeProof(envId, proofUrl, proofDate, amountProof = null, noteProof = null) {
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
  return data
}

export async function updateMouvement(id, updates) {
  const { error } = await supabase.from('caisse_mouvements').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteMouvement(id) {
  const { error } = await supabase.from('caisse_mouvements').delete().eq('id', id)
  if (error) throw error
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
    // Si c'est nezha_perso ou layla_perso, c'est juste un tracking → pas de caisse à créditer pour l'instant
  }
}

export async function deleteSalaire(salaireId) {
  // Détache les enveloppes d'abord
  await supabase.from('caisse_enveloppes').update({ salaire_id: null }).eq('salaire_id', salaireId)
  await supabase.from('caisse_salaires').delete().eq('id', salaireId)
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
// ============================================================

/**
 * Liste les avances (avec join sur le bénéficiaire et le payeur)
 * @param {Object} opts - { beneficiaryId?, status? }
 *   - status : 'all' | 'pending' | 'refunded'
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
 * Retourne [{ beneficiary_id, name, color_key, total_due, count }]
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
 * Crée une nouvelle avance
 */
export async function createAvance({ payerId, beneficiaryId, amount, motif, avanceDate, userId }) {
  const { data, error } = await supabase
    .from('caisse_avances')
    .insert({
      payer_id: payerId,
      beneficiary_id: beneficiaryId,
      amount: Number(amount),
      motif: motif || null,
      avance_date: avanceDate || new Date().toISOString().slice(0, 10),
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Marque une avance comme remboursée
 */
export async function markAvanceRefunded(avanceId, note = null) {
  const { data, error } = await supabase
    .from('caisse_avances')
    .update({
      refunded_at: new Date().toISOString(),
      refunded_note: note,
    })
    .eq('id', avanceId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Annule un remboursement (au cas où erreur)
 */
export async function unmarkAvanceRefunded(avanceId) {
  const { error } = await supabase
    .from('caisse_avances')
    .update({ refunded_at: null, refunded_note: null })
    .eq('id', avanceId)
  if (error) throw error
}

/**
 * Supprime une avance (erreur de saisie)
 */
export async function deleteAvance(avanceId) {
  const { error } = await supabase
    .from('caisse_avances')
    .delete()
    .eq('id', avanceId)
  if (error) throw error
}
