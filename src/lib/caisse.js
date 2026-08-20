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
  const base = '*, destinataire:caisse_destinataires(*), assigner:profiles!caisse_enveloppes_assigned_by_fkey(username, full_name)'
  const withPret = base + ', pretpar:profiles!caisse_enveloppes_pret_banque_by_fkey(username, full_name)'
  // L'enveloppe reste TOUJOURS dans son mois de session POS (date originale Odoo).
  const q = sel => supabase
    .from('caisse_enveloppes').select(sel)
    .gte('session_date', start).lt('session_date', end)
    .order('session_date', { ascending: true }).order('source')
  // Filet de sécurité : si la colonne pret_banque_by n'existe pas encore (SQL pas lancé),
  // on recharge sans le join « compté par » pour ne pas casser l'écran.
  let { data, error } = await q(withPret)
  if (error && /pret_banque/i.test(error.message || '')) ({ data, error } = await q(base))
  if (error) throw error
  return data || []
}

// Marque (ou démarque) une enveloppe « comptée, prête à envoyer en banque » + traçabilité.
export async function setEnveloppePretBanque(envId, ready, userId) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      pret_banque_at: ready ? new Date().toISOString() : null,
      pret_banque_by: ready ? (userId || null) : null,
    })
    .eq('id', envId)
  if (error) throw error
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
    const owner = env.destinataire.linked_caisse_owner
    await supabase.from('caisse_mouvements').insert({
      caisse_owner: owner,
      type: 'entree',
      source_type: 'enveloppe',
      source_ref: env.id,
      amount: env.amount_cash,
      label: `Enveloppe ${env.source} · ${env.session_date}`,
      mvt_date: effectiveDate, // date d'effet = date d'affectation
      created_by: userId,
      // Le/la propriétaire de la caisse (Layla LG, Meriem…) doit valider la réception
      // de l'enveloppe avant qu'elle compte dans son solde.
      reception_status: 'pending',
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

/**
 * Met à jour la date d'affectation effective (= mois dans lequel l'enveloppe apparaît).
 * Met aussi à jour le mvt_date du mouvement caisse lié (caisse-gérée) pour qu'il soit cohérent.
 */
export async function updateEnveloppeAssignedDate(envId, newAssignedDate, actorId = null) {
  // 1. Récupérer l'état avant
  const { data: before } = await supabase
    .from('caisse_enveloppes')
    .select('id, assigned_date, source, session_date, destinataire:caisse_destinataires(name, type, linked_caisse_owner)')
    .eq('id', envId)
    .single()

  // 2. Mettre à jour assigned_date
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({ assigned_date: newAssignedDate })
    .eq('id', envId)
  if (error) throw error

  // 3. Si caisse-gérée, mettre à jour le mvt_date du mouvement caisse lié
  if (before?.destinataire?.type === 'caisse_geree') {
    await supabase
      .from('caisse_mouvements')
      .update({ mvt_date: newAssignedDate })
      .eq('source_type', 'enveloppe')
      .eq('source_ref', envId)
  }

  // 4. Log
  await logAction({
    entityType: 'enveloppe',
    entityId: envId,
    action: 'update_date',
    description: `Date effective changée pour ${before?.source || ''} (${before?.session_date || ''}) → ${newAssignedDate}`,
    before: { assigned_date: before?.assigned_date },
    after: { assigned_date: newAssignedDate },
    actorId,
  })
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
  // « En attente » : on cache les versements marqués « ignorés » (ils restent visibles dans « Toutes »).
  if (statusFilter === 'ignored')   return list.filter(e =>  e.releve_ignore)
  if (statusFilter === 'pending')   return list.filter(e => !e.proof_url && !e.releve_ignore)
  if (statusFilter === 'done')      return list.filter(e =>  e.proof_url)
  return list
}

// Marque un versement comme « ignoré » (ou réactive) → sort/rentre dans « En attente ».
// reason : raison facultative (« rien à lier », etc.), effacée à la réactivation.
export async function setEnveloppeIgnore(envId, ignore, reason = null) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({ releve_ignore: !!ignore, releve_ignore_reason: ignore ? (reason || null) : null })
    .eq('id', envId)
  if (error) throw error
}

// ============================================================
// RAPPROCHEMENT RELEVÉ BMCI (enveloppes Banque)
// ============================================================

// Enveloppes affectées à un destinataire "banque", dont la date est dans [dMin, dMax].
export async function loadBanqueEnvelopesBetween(dMin, dMax) {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .not('destinataire_id', 'is', null)
    .gte('session_date', dMin)
    .lte('session_date', dMax)
    .order('session_date', { ascending: false })
  if (error) throw error
  return (data || []).filter(e => e.destinataire?.type === 'banque')
}

// Upload du relevé PDF (partagé par toutes les enveloppes rapprochées). Renvoie le chemin.
export async function uploadReleve(file) {
  const path = `releves/${Date.now()}.pdf`
  const { error } = await supabase.storage.from('caisse-preuves').upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return path
}

// Mémorise les lignes du relevé NON attribuées (pour rattachement manuel ultérieur).
export async function saveUnmatchedReleveLines(lines) {
  if (!lines || !lines.length) return
  const { error } = await supabase
    .from('caisse_releve_lignes')
    .upsert(lines, { onConflict: 'key', ignoreDuplicates: true })
  if (error) throw error
}

// Trace d'un import de relevé bancaire (historique « qu'est-ce que j'ai déjà importé »).
export async function saveReleveImport(row) {
  const { error } = await supabase.from('caisse_releve_imports').insert(row)
  if (error) throw error
}

// Liste des derniers imports de relevés, du plus récent au plus ancien.
export async function loadReleveImports(limit = 50) {
  const { data, error } = await supabase
    .from('caisse_releve_imports')
    .select('*, importer:profiles!caisse_releve_imports_imported_by_fkey(username, full_name)')
    .order('imported_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Toutes les lignes du relevé encore libres (reçues en banque, non liées à Odoo).
export async function loadAllFreeReleveLines() {
  const { data, error } = await supabase
    .from('caisse_releve_lignes')
    .select('*')
    .is('used_by', null)
    .not('ignored', 'is', true)            // lignes ignorées manuellement exclues
    .not('label', 'ilike', '%lanacash%')   // lignes TPE Lanacash exclues
    .not('label', 'ilike', '%LNC.%')       // idem, forme abrégée « VIRT RECU LNC. »
    .order('ligne_date', { ascending: false })
  if (error) throw error
  // Dédoublonnage : un même dépôt vu sous 2 dates (opération vs valeur) ou 2 libellés
  // (« N » / « N° ») → même MONTANT + même n° de versement (unique) → on garde 1 ligne.
  const seen = new Set()
  const out = []
  for (const r of (data || [])) {
    // n° de versement = le PLUS LONG nombre du libellé (évite de confondre avec un code court).
    const nums = (r.label || '').match(/\d{5,}/g) || []
    const ref = nums.sort((a, b) => b.length - a.length || (a < b ? 1 : -1))[0]
    const k = ref ? `${Math.round(Number(r.amount) * 100)}|${ref}` : `row|${r.key || r.id}`
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
  }
  return out
}

// Ignore (ou réactive) une ligne de relevé « à lier », avec une raison facultative.
export async function setReleveLineIgnore(key, ignore, reason = null) {
  const { error } = await supabase
    .from('caisse_releve_lignes')
    .update({ ignored: !!ignore, ignore_reason: ignore ? (reason || null) : null })
    .eq('key', key)
  if (error) throw error
}

// Lignes de relevé IGNORÉES (rangées à part), avec leur raison.
export async function loadIgnoredReleveLines() {
  const { data, error } = await supabase
    .from('caisse_releve_lignes')
    .select('*')
    .eq('ignored', true)
    .order('ligne_date', { ascending: false })
  if (error) throw error
  return data || []
}

// Lignes du relevé DÉJÀ liées (used_by ≠ NULL), avec l'enveloppe/versement rattaché·e
// (destination, date, montant Odoo) — pour « voir les montants déjà liés ».
export async function loadAllLinkedReleveLines() {
  const { data: lines, error } = await supabase
    .from('caisse_releve_lignes')
    .select('*')
    .not('used_by', 'is', null)
    .order('ligne_date', { ascending: false })
  if (error) throw error
  const ids = [...new Set((lines || []).map(l => l.used_by).filter(Boolean))]
  let envById = {}
  if (ids.length) {
    const { data: envs } = await supabase
      .from('caisse_enveloppes')
      .select('id, source, session_date, amount_cash, payment_method, destinataire:caisse_destinataires(name)')
      .in('id', ids)
    envById = Object.fromEntries((envs || []).map(e => [e.id, e]))
  }
  return (lines || []).map(l => ({ ...l, env: envById[l.used_by] || null }))
}

// Lignes du relevé encore libres (non rattachées) d'un montant donné, du MÊME
// type que l'enveloppe : chèque↔remise chèque, virement↔virement reçu, espèces↔versement.
// (même correspondance que le rapprochement auto, candidatesFor)
export async function loadFreeReleveLines(amount, paymentMethod = 'cash') {
  const a = Number(amount)
  const types = paymentMethod === 'cheque' ? ['cheque_depot']
    : paymentMethod === 'virement' ? ['virement_recu', 'autre']
    : ['versement']
  const { data, error } = await supabase
    .from('caisse_releve_lignes')
    .select('*')
    .is('used_by', null)
    .not('ignored', 'is', true)            // lignes ignorées manuellement exclues
    .not('label', 'ilike', '%lanacash%')   // lignes TPE Lanacash exclues
    .not('label', 'ilike', '%LNC.%')       // idem, forme abrégée « VIRT RECU LNC. »
    .gte('amount', a - 0.005)
    .lte('amount', a + 0.005)
    .in('type', types)
    .order('ligne_date', { ascending: false })
  if (error) throw error
  return data || []
}

// Rattache manuellement une ligne du relevé à une enveloppe → enveloppe verte + ligne prise.
export async function attachReleveLine(env, line) {
  await setEnveloppeReleve(env.id, {
    proofUrl: line.releve_url || undefined,
    proofDate: line.ligne_date || undefined,
    status: 'trouve',
    libelle: `${line.ligne_date} · ${line.label}`.slice(0, 220),
    candidates: null,
  })
  await supabase.from('caisse_releve_lignes').update({ used_by: env.id }).eq('key', line.key)
}

// Lie une ligne de relevé (depuis « Reçus non liés ») à une enveloppe choisie.
// Enregistre amount_proof = montant réel du relevé -> écart si ≠ du montant Odoo.
export async function linkReleveLineToEnv(env, line) {
  await setEnveloppeReleve(env.id, {
    proofUrl: line.releve_url || undefined,
    proofDate: line.ligne_date || undefined,
    status: 'trouve',
    libelle: `${line.ligne_date} · ${line.label}`.slice(0, 220),
    candidates: null,
  })
  await supabase.from('caisse_enveloppes').update({ amount_proof: Number(line.amount) }).eq('id', env.id)
  await supabase.from('caisse_releve_lignes').update({ used_by: env.id }).eq('key', line.key)
}

// Retire la preuve manuelle d'une enveloppe (photo/PDF uploadée) -> repasse en attente.
export async function clearEnveloppeProof(envId) {
  const { error } = await supabase.from('caisse_enveloppes')
    .update({ proof_url: null, amount_proof: null, note_proof: null, proof_uploaded_at: null })
    .eq('id', envId)
  if (error) throw error
}

// Enveloppes affectées à la Banque, encore en attente (sans preuve) — toutes dates.
export async function loadPendingBanqueEnvelopes() {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .not('destinataire_id', 'is', null)
    .is('proof_url', null)
    .order('session_date', { ascending: false })
  if (error) throw error
  return (data || []).filter(e => e.destinataire?.type === 'banque' && !e.releve_ignore)
}

// Enveloppes Banque ayant un ÉCART de montant (amount_proof ≠ amount_cash),
// PAS encore validé. Les écarts validés partent dans « Validés » (loadBanqueEcartsValides).
export async function loadBanqueEnvelopesWithEcart() {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .not('destinataire_id', 'is', null)
    .not('amount_proof', 'is', null)
    .is('ecart_valide_at', null)
    .order('session_date', { ascending: false })
  if (error) throw error
  return (data || []).filter(e =>
    e.destinataire?.type === 'banque' &&
    Math.abs(Number(e.amount_proof) - Number(e.amount_cash)) >= 0.005)
}

// Écarts déjà VALIDÉS (vérifiés) : rangés à part, plus dans la liste « Écart ».
export async function loadBanqueEcartsValides() {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires(*)')
    .not('destinataire_id', 'is', null)
    .not('amount_proof', 'is', null)
    .not('ecart_valide_at', 'is', null)
    .order('ecart_valide_at', { ascending: false })
  if (error) throw error
  return (data || []).filter(e =>
    e.destinataire?.type === 'banque' &&
    Math.abs(Number(e.amount_proof) - Number(e.amount_cash)) >= 0.005)
}

// Valide un écart (le sort de la liste « Écart ») / annule la validation.
export async function setEcartValide(envId, valide, userId = null) {
  const { error } = await supabase
    .from('caisse_enveloppes')
    .update({
      ecart_valide_at: valide ? new Date().toISOString() : null,
      ecart_valide_by: valide ? userId : null,
    })
    .eq('id', envId)
  if (error) throw error
}

// Lignes du relevé déjà attribuées à des enveloppes "trouvées" (pour ne pas les reproposer).
export async function loadConfirmedReleveLines() {
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('note_proof')
    .eq('releve_status', 'trouve')
    .not('note_proof', 'is', null)
  if (error) throw error
  return (data || []).map(r => r.note_proof)
}

// Annule un rapprochement : remet l'enveloppe à zéro ET libère la ligne du relevé
// (elle retourne dans « non liés » et redevient suggérable).
export async function clearEnveloppeReleve(envId) {
  const { data: env } = await supabase.from('caisse_enveloppes')
    .select('amount_cash, note_proof, proof_url, payment_method').eq('id', envId).single()

  // 1) Libérer une ligne déjà mémorisée et rattachée à cette enveloppe
  await supabase.from('caisse_releve_lignes').update({ used_by: null }).eq('used_by', envId)

  // 2) Si la ligne n'était pas mémorisée (match auto à l'import), la (ré)insérer comme LIBRE
  const np = env?.note_proof || ''
  if (np.includes(' · ') && !np.includes(' | ') && np !== 'Confirmé manuellement') {
    const sep = np.indexOf(' · ')
    const d = np.slice(0, sep)
    const label = np.slice(sep + 3)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const amt = Number(env.amount_cash)
      const type = env.payment_method === 'cash' ? 'versement' : env.payment_method === 'cheque' ? 'cheque_depot' : 'virement_recu'
      await supabase.from('caisse_releve_lignes').upsert([{
        key: `${d}|${Math.round(amt * 100)}|${label.slice(0, 50)}`,
        ligne_date: d, amount: amt, label: label.slice(0, 120), type,
        releve_url: env.proof_url, used_by: null,
      }], { onConflict: 'key' })
    }
  }

  // 3) Remettre l'enveloppe à zéro
  const { error } = await supabase.from('caisse_enveloppes').update({
    releve_status: null, releve_candidates: null,
    proof_url: null, proof_date: null, note_proof: null, proof_uploaded_at: null,
  }).eq('id', envId)
  if (error) throw error
}

// Applique le résultat d'un rapprochement sur une enveloppe.
export async function setEnveloppeReleve(envId, { proofUrl, proofDate, status, libelle, candidates }) {
  const updates = { releve_status: status }
  if (proofUrl)  updates.proof_url = proofUrl
  if (proofDate) updates.proof_date = proofDate
  if (libelle != null) updates.note_proof = libelle
  if (candidates !== undefined) updates.releve_candidates = candidates
  if (proofUrl)  updates.proof_uploaded_at = new Date().toISOString()
  const { error } = await supabase.from('caisse_enveloppes').update(updates).eq('id', envId)
  if (error) throw error
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

export async function loadCaisseBalance(caisseOwner, beforeDate = null) {
  // Solde = somme des entrées - somme des sorties depuis la dernière clôture
  // Pour v1 : on prend tout depuis le début
  // beforeDate (optionnel) : ne compte que les mouvements AVANT cette date (solde de départ d'un mois).
  let qEntrees = supabase
    .from('caisse_mouvements')
    .select('amount, reception_status')
    .eq('caisse_owner', caisseOwner)
    .eq('type', 'entree')
  let qSorties = supabase
    .from('caisse_mouvements')
    .select('amount')
    .eq('caisse_owner', caisseOwner)
    .eq('type', 'sortie')
  if (beforeDate) { qEntrees = qEntrees.lt('mvt_date', beforeDate); qSorties = qSorties.lt('mvt_date', beforeDate) }
  const { data: entrees } = await qEntrees
  const { data: sorties } = await qSorties
  // Exclure les entrées en attente de validation
  const totalIn  = (entrees || [])
    .filter(m => m.reception_status !== 'pending')
    .reduce((s, m) => s + Number(m.amount), 0)
  const totalOut = (sorties || []).reduce((s, m) => s + Number(m.amount), 0)
  return totalIn - totalOut
}

export async function loadMonthStats(caisseOwner, year, month) {
  const mvts = await loadMouvementsMonth(caisseOwner, year, month)
  // Exclure les entrées 'pending' (en attente de validation)
  const entrees = mvts.filter(m => m.type === 'entree' && m.reception_status !== 'pending').reduce((s, m) => s + Number(m.amount), 0)
  const sorties = mvts.filter(m => m.type === 'sortie').reduce((s, m) => s + Number(m.amount), 0)
  // Sorties par catégorie
  const byCat = {}
  mvts.filter(m => m.type === 'sortie').forEach(m => {
    byCat[m.category || 'Autre'] = (byCat[m.category || 'Autre'] || 0) + Number(m.amount)
  })
  return { entrees, sorties, byCat }
}

// Stats par catégorie UNIFIÉES : Meriem (dépenses réelles) + Hamid + Pions (courses).
// L'argent CONFIÉ (avances Hamid/courses, avances staff, transferts) n'est PAS une
// catégorie : seule la dépense réelle compte.
export async function loadCategoryStats(year, month) {
  const { start, end } = monthBounds(year, month)
  const HANDOFF = ['hamid_avance', 'course_avance', 'avance', 'transfert_caisse', 'salaire_reliquat']

  const [mvtRes, hamidRes, courseRes] = await Promise.all([
    supabase.from('caisse_mouvements').select('amount, category, source_type')
      .eq('caisse_owner', 'meriem').eq('type', 'sortie')
      .gte('mvt_date', start).lt('mvt_date', end),
    supabase.from('caisse_hamid_depenses').select('amount, category')
      .neq('confirm_status', 'pending')
      .gte('depense_date', start).lt('depense_date', end),
    supabase.from('caisse_courses_depenses').select('amount, category, course:caisse_courses(given_date)'),
  ])

  const cat = {}
  const add = (c, col, amt) => {
    const k = c || 'Autre'
    if (!cat[k]) cat[k] = { meriem: 0, hamid: 0, pions: 0, total: 0 }
    cat[k][col] += Number(amt || 0)
    cat[k].total += Number(amt || 0)
  }
  ;(mvtRes.data || []).filter(m => !HANDOFF.includes(m.source_type)).forEach(m => add(m.category, 'meriem', m.amount))
  ;(hamidRes.data || []).forEach(h => add(h.category, 'hamid', h.amount))
  ;(courseRes.data || []).filter(d => { const gd = d.course?.given_date; return gd && gd >= start && gd < end }).forEach(d => add(d.category, 'pions', d.amount))

  return cat
}

// Détecte si une catégorie indique un transfert vers la caisse Meriem
// (insensible à la casse et aux accents)
function isTransfertVersMeriem(category) {
  if (!category) return false
  const normalized = String(category).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  return normalized === 'caisse meriem'
}

export async function addMouvement({ caisseOwner, type, sourceType, amount, category, label, mvtDate, hasFacture = false, receptionStatus = null, userId }) {
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
      reception_status: receptionStatus,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error

  // TRANSFERT AUTO : Layla LG → Meriem
  // Si Layla LG fait une sortie avec un libellé contenant "caisse meriem",
  // on crée automatiquement une entrée chez Meriem en attente de validation.
  if (
    caisseOwner === 'layla_lg' &&
    type === 'sortie' &&
    sourceType === 'manuelle' &&
    isTransfertVersMeriem(category)
  ) {
    try {
      await supabase.from('caisse_mouvements').insert({
        caisse_owner: 'meriem',
        type: 'entree',
        source_type: 'transfert_caisse',
        source_ref: data.id,
        amount,
        label: 'Transfert depuis Layla LG',
        mvt_date: mvtDate,
        created_by: userId,
        reception_status: 'pending',
      })
      await logAction({
        entityType: 'mouvement',
        entityId: data.id,
        action: 'transfert_auto',
        description: `Transfert auto Layla LG → Meriem (${amount} dh, en attente de validation)`,
        amount: Number(amount),
        actorId: userId,
      })
    } catch (e) {
      console.error('Transfert auto Layla LG → Meriem échec:', e?.message)
      // Ne pas faire échouer la sortie de Layla LG si le transfert échoue
    }
  }

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

// Marque/démarque un mouvement comme "facture à récupérer" (apparaît dans l'onglet Factures).
export async function setMouvementFacture(id, hasFacture, actorId = null) {
  const { error } = await supabase.from('caisse_mouvements')
    .update({ has_facture: !!hasFacture, facture_status: hasFacture ? 'pending' : null })
    .eq('id', id)
  if (error) throw error
  await logAction({
    entityType: 'mouvement', entityId: id,
    action: hasFacture ? 'facture_add' : 'facture_remove',
    description: hasFacture ? 'Marqué « facture à récupérer »' : 'Retiré des factures',
    actorId,
  })
}

export async function updateMouvement(id, updates, actorId = null, reason = null) {
  const { data: before } = await supabase.from('caisse_mouvements').select('*').eq('id', id).single()
  const { error } = await supabase.from('caisse_mouvements').update(updates).eq('id', id)
  if (error) throw error
  await logAction({
    entityType: 'mouvement',
    entityId: id,
    action: 'update',
    description: `Modification mouvement : ${before?.label || ''}${reason ? ` — Raison : ${reason}` : ''}`,
    amount: updates?.amount != null ? Number(updates.amount) : before?.amount,
    before, after: updates,
    actorId,
  })
}

export async function deleteMouvement(id, actorId = null, reason = null) {
  const { data: before } = await supabase.from('caisse_mouvements').select('*').eq('id', id).single()

  // Si on supprime une sortie Layla LG qui a généré un transfert vers Meriem,
  // supprimer aussi le mouvement miroir SI Meriem ne l'a pas encore validé
  if (before?.caisse_owner === 'layla_lg' && before?.type === 'sortie') {
    const { data: mirror } = await supabase
      .from('caisse_mouvements')
      .select('id, reception_status')
      .eq('source_type', 'transfert_caisse')
      .eq('source_ref', id)
      .maybeSingle()
    if (mirror && mirror.reception_status === 'pending') {
      await supabase.from('caisse_mouvements').delete().eq('id', mirror.id)
    }
    // Si Meriem a déjà validé (status 'received'), on laisse intact côté Meriem
    // (sécurité : éviter de modifier l'historique de Meriem)
  }

  const { error } = await supabase.from('caisse_mouvements').delete().eq('id', id)
  if (error) throw error
  await logAction({
    entityType: 'mouvement',
    entityId: id,
    action: 'delete',
    description: `Suppression mouvement caisse ${before?.caisse_owner || ''} : ${before?.label || ''}${reason ? ` — Raison : ${reason}` : ''}`,
    amount: before?.amount,
    before,
    actorId,
  })
}

// ============================================================
// VALIDATION DE RÉCEPTION (entrées automatiques)
// ============================================================

/**
 * Charger les entrées en attente de validation pour une caisse donnée.
 */
export async function loadPendingReceptions(caisseOwner) {
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('caisse_owner', caisseOwner)
    .eq('type', 'entree')
    .eq('reception_status', 'pending')
    .order('mvt_date', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Valider la réception d'un mouvement d'entrée.
 * @param {number} mouvementId
 * @param {string|null} actorId
 */
export async function validateReception(mouvementId, actorId = null) {
  const { data: before } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('id', mouvementId)
    .single()

  const updates = {
    reception_status: 'received',
    received_at: new Date().toISOString(),
    received_by: actorId,
  }
  const { error } = await supabase
    .from('caisse_mouvements')
    .update(updates)
    .eq('id', mouvementId)
  if (error) throw error

  await logAction({
    entityType: 'mouvement',
    entityId: mouvementId,
    action: 'reception_validated',
    description: `Réception validée : ${before?.label || ''}`,
    amount: before?.amount,
    before: { reception_status: before?.reception_status },
    after: updates,
    actorId,
  })
}

const PROOF_BUCKET = 'caisse-preuves'

/**
 * Upload une preuve photo/PDF pour un mouvement sortie.
 * @param {number} mouvementId
 * @param {File} file - le fichier (PNG, JPG, PDF, etc.)
 * @param {string|null} actorId - user.id pour l'audit log
 * @returns {Promise<{url: string}>}
 */
export async function uploadMouvementProof(mouvementId, file, actorId = null) {
  if (!file) throw new Error('Aucun fichier fourni')

  // 1) Charger le mouvement avant (pour audit)
  const { data: before, error: errBefore } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('id', mouvementId)
    .single()
  if (errBefore) throw errBefore

  // 2) Upload vers Storage : mouvements/mvt_<id>/<timestamp>.<ext>
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase()
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `mouvements/mvt_${mouvementId}/${ts}.${ext}`

  const { error: errUp } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (errUp) throw errUp

  // 3) URL signée 1 an
  const { data: signed, error: errSign } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (errSign) throw errSign
  const url = signed.signedUrl

  // 4) UPDATE caisse_mouvements
  const updates = {
    proof_url: url,
    proof_uploaded_at: new Date().toISOString(),
    proof_status: 'with_proof',
  }
  const { error: errUpd } = await supabase
    .from('caisse_mouvements')
    .update(updates)
    .eq('id', mouvementId)
  if (errUpd) throw errUpd

  // 5) Audit log
  await logAction({
    entityType: 'mouvement',
    entityId: mouvementId,
    action: 'proof_upload',
    description: `Preuve ajoutée : ${before?.label || ''}`,
    amount: before?.amount,
    before: { proof_status: before?.proof_status, proof_url: before?.proof_url },
    after: updates,
    actorId,
  })

  return { url }
}

/**
 * Déclare qu'il n'y a pas de preuve disponible pour ce mouvement.
 * @param {number} mouvementId
 * @param {string|null} actorId
 */
export async function declareMouvementNoProof(mouvementId, actorId = null) {
  const { data: before } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('id', mouvementId)
    .single()

  const updates = {
    proof_status: 'no_proof_declared',
    proof_url: null,
    proof_uploaded_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('caisse_mouvements')
    .update(updates)
    .eq('id', mouvementId)
  if (error) throw error

  await logAction({
    entityType: 'mouvement',
    entityId: mouvementId,
    action: 'proof_no_proof',
    description: `Pas de preuve déclaré : ${before?.label || ''}`,
    amount: before?.amount,
    before: { proof_status: before?.proof_status },
    after: updates,
    actorId,
  })
}

/**
 * Permet de revenir en arrière sur "Pas de preuve" pour repasser en pending
 * (utilisé quand Meriem veut finalement uploader une preuve)
 */
export async function resetMouvementProof(mouvementId, actorId = null) {
  const { data: before } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('id', mouvementId)
    .single()

  const updates = {
    proof_status: 'pending',
    proof_url: null,
    proof_uploaded_at: null,
  }
  const { error } = await supabase
    .from('caisse_mouvements')
    .update(updates)
    .eq('id', mouvementId)
  if (error) throw error

  await logAction({
    entityType: 'mouvement',
    entityId: mouvementId,
    action: 'proof_reset',
    description: `Statut preuve réinitialisé : ${before?.label || ''}`,
    amount: before?.amount,
    before: { proof_status: before?.proof_status, proof_url: before?.proof_url },
    after: updates,
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

// ============================================================
// FAVORIS DE DÉPENSE DU LIVREUR (gérés par Hamid lui-même)
// ============================================================
export async function loadLivreurFavoris() {
  const { data, error } = await supabase
    .from('caisse_livreur_favoris')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addLivreurFavori({ label, category, needsProof, userId }) {
  const { data, error } = await supabase
    .from('caisse_livreur_favoris')
    .insert({ label, category: category || null, needs_proof: !!needsProof, created_by: userId })
    .select().single()
  if (error) throw error
  return data
}

export async function deleteLivreurFavori(id) {
  const { error } = await supabase
    .from('caisse_livreur_favoris')
    .update({ active: false })
    .eq('id', id)
  if (error) throw error
}

// Dépenses déclarées par Hamid en attente de confirmation par Meriem.
export async function loadPendingHamidDepenses() {
  const { data, error } = await supabase
    .from('caisse_hamid_depenses')
    .select('*')
    .eq('confirm_status', 'pending')
    .order('depense_date', { ascending: false })
  if (error) throw error
  return data || []
}

// Meriem met / change la catégorie d'une dépense Hamid (Hamid ne saisit pas de catégorie).
export async function setHamidDepenseCategory(id, category, actorId = null) {
  const { error } = await supabase
    .from('caisse_hamid_depenses')
    .update({ category: category || null })
    .eq('id', id)
  if (error) throw error
  try {
    await logAction({ entityType: 'hamid_depense', entityId: id, action: 'set_category', description: `Catégorie Hamid : ${category || '—'}`, actorId })
  } catch (_) {}
}

// Meriem décide si une dépense Hamid a une facture à récupérer (chèque).
export async function setHamidDepenseFacture(id, isFacture, actorId = null) {
  const { error } = await supabase
    .from('caisse_hamid_depenses')
    .update({ is_facture: !!isFacture, facture_status: isFacture ? 'pending' : null })
    .eq('id', id)
  if (error) throw error
  try {
    await logAction({ entityType: 'hamid_depense', entityId: id, action: isFacture ? 'facture_add' : 'facture_remove', description: isFacture ? 'Marqué « facture à récupérer »' : 'Retiré des factures', actorId })
  } catch (_) {}
}

// Meriem confirme une dépense déclarée par Hamid -> elle compte dans le solde.
export async function confirmHamidDepense(id, actorId = null) {
  const { data: before } = await supabase.from('caisse_hamid_depenses').select('*').eq('id', id).single()
  const { error } = await supabase
    .from('caisse_hamid_depenses')
    .update({ confirm_status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: actorId })
    .eq('id', id)
  if (error) throw error
  try {
    await logAction({
      entityType: 'hamid_depense', entityId: id, action: 'confirm',
      description: `Dépense Hamid confirmée : ${before?.label || ''} (${before?.amount} dh)`,
      amount: -Number(before?.amount || 0), actorId,
    })
  } catch (_) {}
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
    .neq('confirm_status', 'pending')   // les dépenses déclarées par Hamid ne comptent qu'après confirmation
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

export async function ajouterDepenseHamid({ amount, category, label, mvtDate, userId, isFacture = false }) {
  const { data, error } = await supabase
    .from('caisse_hamid_depenses')
    .insert({
      amount, category, label, depense_date: mvtDate, created_by: userId,
      is_facture: !!isFacture,
      facture_status: isFacture ? 'pending' : null,
    })
    .select().single()
  if (error) throw error
  return data
}

// Crée une session Hamid groupée : N lignes + 1 preuve commune optionnelle.
// Chaque ligne = { amount, category, label, isFacture }.
export async function addHamidSession({ sessionDate, lignes, userId, proofFile = null, confirmStatus = 'confirmed' }) {
  const validLignes = (lignes || []).filter(l => Number(l.amount) > 0)
  if (validLignes.length === 0) throw new Error('Au moins une ligne avec un montant > 0 est requise')

  // 1) Crée la session
  const { data: session, error: sErr } = await supabase
    .from('caisse_hamid_sessions')
    .insert({ session_date: sessionDate, user_id: userId })
    .select().single()
  if (sErr) throw sErr

  // 2) Crée les dépenses liées à la session
  const rows = validLignes.map(l => ({
    amount: Number(l.amount),
    category: l.category || null,
    label: l.label || null,
    depense_date: sessionDate,
    created_by: userId,
    is_facture: !!l.isFacture,
    facture_status: l.isFacture ? 'pending' : null,
    hamid_session_id: session.id,
    confirm_status: confirmStatus,
  }))
  const { error: dErr } = await supabase.from('caisse_hamid_depenses').insert(rows)
  if (dErr) {
    // Rollback : on supprime la session si l'insertion des dépenses a échoué
    await supabase.from('caisse_hamid_sessions').delete().eq('id', session.id)
    throw dErr
  }

  // 3) Upload de la preuve commune. La photo est obligatoire (sauf pourboire) :
  // si elle est fournie mais que l'envoi échoue, on ANNULE toute la session
  // pour ne jamais enregistrer une dépense « sans preuve ».
  if (proofFile) {
    try {
      await uploadHamidSessionProof(session.id, proofFile, userId)
    } catch (e) {
      await supabase.from('caisse_hamid_depenses').delete().eq('hamid_session_id', session.id)
      await supabase.from('caisse_hamid_sessions').delete().eq('id', session.id)
      throw new Error('La photo n\'a pas pu être envoyée. Réessaie (vérifie ta connexion).')
    }
  }

  return session
}

// Upload une preuve commune (photo/PDF) pour une session Hamid.
// La preuve couvre toutes les dépenses liées à cette session.
export async function uploadHamidSessionProof(sessionId, file, actorId = null) {
  if (!file) throw new Error('Aucun fichier fourni')
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase()
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `hamid/session_${sessionId}/${ts}.${ext}`

  const { error: errUp } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (errUp) throw errUp

  const { data: signed, error: errSign } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (errSign) throw errSign
  const url = signed.signedUrl

  const { error: errUpd } = await supabase
    .from('caisse_hamid_sessions')
    .update({ proof_url: url, proof_uploaded_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (errUpd) throw errUpd

  try { await logAction({ entityType: 'hamid_session', entityId: sessionId, action: 'proof_upload', description: `Preuve ajoutée à la session Hamid #${sessionId}`, actorId }) } catch (_) {}
  return { url }
}

// Charge les sessions du mois avec leurs dépenses associées.
export async function loadHamidSessionsMonth(year, month) {
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_hamid_sessions')
    .select('*, depenses:caisse_hamid_depenses!hamid_session_id(*)')
    .gte('session_date', start)
    .lt('session_date', end)
    .order('session_date', { ascending: false })
  if (error) throw error
  return data || []
}

// Supprime une session Hamid + toutes ses dépenses associées (admin).
export async function deleteHamidSession(sessionId, actorId = null) {
  // Les dépenses ont ON DELETE SET NULL, donc on les supprime explicitement avant.
  const { error: dErr } = await supabase
    .from('caisse_hamid_depenses')
    .delete()
    .eq('hamid_session_id', sessionId)
  if (dErr) throw dErr
  const { error } = await supabase.from('caisse_hamid_sessions').delete().eq('id', sessionId)
  if (error) throw error
  try { await logAction({ entityType: 'hamid_session', entityId: sessionId, action: 'delete', description: `Suppression session Hamid #${sessionId}`, actorId }) } catch (_) {}
}

// Upload une preuve (photo/PDF) pour une dépense de Hamid
export async function uploadHamidDepenseProof(depenseId, file, actorId = null) {
  if (!file) throw new Error('Aucun fichier fourni')
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase()
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `hamid/dep_${depenseId}/${ts}.${ext}`

  const { error: errUp } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (errUp) throw errUp

  const { data: signed, error: errSign } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (errSign) throw errSign
  const url = signed.signedUrl

  const { error: errUpd } = await supabase
    .from('caisse_hamid_depenses')
    .update({ proof_url: url, proof_uploaded_at: new Date().toISOString() })
    .eq('id', depenseId)
  if (errUpd) throw errUpd

  try { await logAction({ entityType: 'hamid_depense', entityId: depenseId, action: 'proof_upload', description: `Preuve ajoutée à la dépense Hamid #${depenseId}`, actorId }) } catch (_) {}
  return { url }
}

// Supprime une dépense de Hamid (admin)
export async function deleteHamidDepense(id, actorId = null) {
  const { error } = await supabase.from('caisse_hamid_depenses').delete().eq('id', id)
  if (error) throw error
  try { await logAction({ entityType: 'hamid_depense', entityId: id, action: 'delete', description: `Suppression dépense Hamid #${id}`, actorId }) } catch (_) {}
}

// Factures issues des dépenses de Hamid (marquées "à récupérer")
export async function loadHamidFacturesAll() {
  const { data, error } = await supabase
    .from('caisse_hamid_depenses')
    .select('*')
    .eq('is_facture', true)
    .order('depense_date', { ascending: false })
  if (error) throw error
  return data || []
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
// COURSES confiées à des "pions" (occasionnels, nom libre)
// ============================================================

export async function loadCoursesMonth(year, month) {
  const { start, end } = monthBounds(year, month)
  const { data, error } = await supabase
    .from('caisse_courses')
    .select('*, depenses:caisse_courses_depenses(*)')
    .gte('given_date', start)
    .lt('given_date', end)
    .order('given_date', { ascending: false })
  if (error) throw error
  return data || []
}

// Donner de l'argent à une personne (nom libre) pour des courses → sortie caisse Meriem
export async function donnerCourse({ person, amount, date, userId }) {
  const mvt = await addMouvement({
    caisseOwner: 'meriem', type: 'sortie', sourceType: 'course_avance',
    amount: Number(amount), category: null, label: `🛒 Courses · ${person}`,
    mvtDate: date, hasFacture: false, userId,
  })
  const { data, error } = await supabase
    .from('caisse_courses')
    .insert({ person: person.trim(), amount_given: Number(amount), given_date: date, sortie_mouvement_id: mvt.id, created_by: userId })
    .select().single()
  if (error) { try { await deleteMouvement(mvt.id) } catch (_) {} ; throw error }
  await logAction({ entityType: 'course', entityId: data.id, action: 'create', description: `🛒 Courses confiées à ${person} : ${Number(amount)} dh`, amount: Number(amount), actorId: userId })
  return data
}

// Régler une course : détail des dépenses (lignes catégorisées) + rendu auto
export async function reglerCourse({ course, lignes, date, userId }) {
  const spent = lignes.reduce((s, l) => s + Number(l.amount || 0), 0)
  const returned = Number(course.amount_given) - spent
  if (lignes.length) {
    const rows = lignes.map(l => ({
      course_id: course.id, amount: Number(l.amount || 0), category: l.category || null, label: l.label || null,
      is_facture: !!l.is_facture, facture_status: l.is_facture ? 'pending' : null,
    }))
    const { error: e1 } = await supabase.from('caisse_courses_depenses').insert(rows)
    if (e1) throw e1
  }
  let entreeId = null
  if (returned > 0.001) {
    const mvt = await addMouvement({
      caisseOwner: 'meriem', type: 'entree', sourceType: 'course_rendu',
      amount: returned, category: null, label: `Rendu courses · ${course.person}`, mvtDate: date, userId,
    })
    entreeId = mvt.id
  }
  const { error: e2 } = await supabase.from('caisse_courses')
    .update({ status: 'regle', settled_at: new Date().toISOString(), entree_mouvement_id: entreeId })
    .eq('id', course.id)
  if (e2) throw e2
  await logAction({ entityType: 'course', entityId: course.id, action: 'update', description: `Règlement courses ${course.person} : dépensé ${spent}, rendu ${returned}`, amount: spent, actorId: userId })
}

export async function deleteCourse(courseId) {
  const { data: c } = await supabase.from('caisse_courses').select('sortie_mouvement_id, entree_mouvement_id').eq('id', courseId).single()
  if (c?.sortie_mouvement_id) { try { await deleteMouvement(c.sortie_mouvement_id) } catch (_) {} }
  if (c?.entree_mouvement_id) { try { await deleteMouvement(c.entree_mouvement_id) } catch (_) {} }
  const { error } = await supabase.from('caisse_courses').delete().eq('id', courseId)
  if (error) throw error
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

// Factures issues des courses (lignes de dépense marquées "à récupérer")
export async function loadCourseFacturesAll() {
  const { data, error } = await supabase
    .from('caisse_courses_depenses')
    .select('*, course:caisse_courses(person, given_date)')
    .eq('is_facture', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Récupère plusieurs factures via UN chèque (retrait banque) : les regroupe,
// crée UNE seule entrée (le total du chèque) dans la caisse Layla LG.
// items = [{ kind: 'mvt' | 'course', id, amount }]
export async function recupererFacturesParCheque({ items, cheque, date, userId }) {
  if (!items || items.length === 0) throw new Error('Aucune facture sélectionnée')
  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0)
  const chequeVal = (cheque || '').trim() || null
  const patch = { facture_status: 'recovered', facture_recovered_at: date, facture_cheque: chequeVal }

  const mvtIds = items.filter(i => i.kind === 'mvt').map(i => i.id)
  const courseIds = items.filter(i => i.kind === 'course').map(i => i.id)
  const hamidIds = items.filter(i => i.kind === 'hamid').map(i => i.id)
  if (mvtIds.length) {
    const { error } = await supabase.from('caisse_mouvements').update(patch).in('id', mvtIds)
    if (error) throw error
  }
  if (courseIds.length) {
    const { error } = await supabase.from('caisse_courses_depenses').update(patch).in('id', courseIds)
    if (error) throw error
  }
  if (hamidIds.length) {
    const { error } = await supabase.from('caisse_hamid_depenses').update(patch).in('id', hamidIds)
    if (error) throw error
  }

  // L'entrée du chèque n'est PAS comptée tout de suite : le chèque met des jours à
  // être débité. Elle arrive en « Réceptions à valider » (pending) et ne compte dans
  // le solde qu'après validation (accord admin), quand le chèque est réellement débité.
  await addMouvement({
    caisseOwner: 'layla_lg',
    type: 'entree',
    sourceType: 'facture_recup',
    amount: total,
    label: `Chèque ${chequeVal || '—'} · ${items.length} facture${items.length > 1 ? 's' : ''}`,
    mvtDate: date,
    receptionStatus: 'pending',
    userId,
  })

  await logAction({
    entityType: 'mouvement', entityId: null, action: 'create',
    description: `Récupération chèque ${chequeVal || '—'} : ${items.length} facture(s) · ${total} dh`,
    amount: total, actorId: userId,
  })
}

// Retire le marquage « facture » d'une ligne (kind = 'mvt' | 'course' | 'hamid').
// Sert à décocher un achat marqué facture par erreur.
export async function retirerFacture({ kind, id, userId = null }) {
  if (kind === 'mvt') {
    const { error } = await supabase.from('caisse_mouvements')
      .update({ has_facture: false, facture_status: null }).eq('id', id)
    if (error) throw error
  } else if (kind === 'course') {
    const { error } = await supabase.from('caisse_courses_depenses')
      .update({ is_facture: false, facture_status: null }).eq('id', id)
    if (error) throw error
  } else if (kind === 'hamid') {
    const { error } = await supabase.from('caisse_hamid_depenses')
      .update({ is_facture: false, facture_status: null }).eq('id', id)
    if (error) throw error
  } else {
    throw new Error('Type de facture inconnu')
  }
  await logAction({
    entityType: kind === 'mvt' ? 'mouvement' : kind, entityId: id,
    action: 'facture_remove', description: 'Retiré des factures (pas une facture)', actorId: userId,
  })
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
  // Le report d'un mois précédent N'EST PLUS déduit automatiquement : il reste
  // « en attente » et c'est l'utilisateur qui le coche dans la composition
  // (chacune son report, déduit quand on veut).
  const { data, error } = await supabase
    .from('caisse_salaires')
    .insert({ beneficiaire, month, year, target_amount: Number(target_amount) || 0, status: 'brouillon' })
    .select().single()
  if (error) throw error
  return data
}

// Reports en attente de CE bénéficiaire, issus de mois antérieurs à (year, month).
// = salaires avec reliquat > 0 marqué report_<ben> (ou ancien report_mois_suivant),
// pas encore déduits (report_applique). À cocher dans la composition.
export async function loadPendingReports(beneficiaire, year, month) {
  const reportKey = `report_${beneficiaire}`
  const { data, error } = await supabase
    .from('caisse_salaires')
    .select('id, beneficiaire, month, year, reliquat_amount, reliquat_destination')
    .eq('beneficiaire', beneficiaire)
    .in('reliquat_destination', [reportKey, 'report_mois_suivant'])
    .gt('reliquat_amount', 0)
  if (error) throw error
  return (data || []).filter(r => (r.year * 12 + r.month) < (year * 12 + month))
}

// Journal du reliquat : enregistre (sans rien écraser) le reliquat CRÉÉ par un salaire
// et les reports APPLIQUÉS dessus. Idempotent (re-validation = remplace les lignes de ce salaire).
export async function recordReliquatHistory(salaire, reliquat, appliedReports) {
  const ben = salaire.beneficiaire
  // Applications : on remplace celles attachées à ce salaire cible
  await supabase.from('caisse_reliquat_historique').delete().eq('type', 'applique').eq('target_salaire_id', salaire.id)
  if (appliedReports && appliedReports.length) {
    await supabase.from('caisse_reliquat_historique').insert(appliedReports.map(r => ({
      type: 'applique', beneficiaire: ben, amount: Number(r.reliquat_amount),
      source_salaire_id: r.id, source_month: r.month, source_year: r.year,
      target_salaire_id: salaire.id, target_month: salaire.month, target_year: salaire.year,
    })))
  }
  // Création : on remplace celle de ce salaire
  await supabase.from('caisse_reliquat_historique').delete().eq('type', 'cree').eq('source_salaire_id', salaire.id)
  if (reliquat > 0) {
    await supabase.from('caisse_reliquat_historique').insert({
      type: 'cree', beneficiaire: ben, amount: Number(reliquat),
      source_salaire_id: salaire.id, source_month: salaire.month, source_year: salaire.year,
    })
  }
}

// Reconstitue l'historique des reliquats CRÉÉS à partir des salaires passés
// (le montant reste stocké sur chaque salaire). Idempotent. Renvoie le nb d'entrées.
// Les « applications » passées ne sont pas reconstituables (l'info d'origine avait été écrasée).
export async function backfillReliquatHistory() {
  const { data: sals, error } = await supabase
    .from('caisse_salaires')
    .select('id, beneficiaire, month, year, reliquat_amount')
    .gt('reliquat_amount', 0)
  if (error) throw error
  let n = 0
  for (const s of (sals || [])) {
    await supabase.from('caisse_reliquat_historique').delete().eq('type', 'cree').eq('source_salaire_id', s.id)
    const { error: insErr } = await supabase.from('caisse_reliquat_historique').insert({
      type: 'cree', beneficiaire: s.beneficiaire, amount: Number(s.reliquat_amount),
      source_salaire_id: s.id, source_month: s.month, source_year: s.year,
    })
    if (insErr) throw insErr
    n++
  }
  return n
}

// Historique complet du reliquat (plus récent d'abord).
export async function loadReliquatHistory() {
  const { data, error } = await supabase
    .from('caisse_reliquat_historique')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Marque des reports comme « déduits » (consommés) — appelé à la validation.
export async function markReportsApplied(reportIds) {
  if (!reportIds || reportIds.length === 0) return
  const { error } = await supabase
    .from('caisse_salaires')
    .update({ reliquat_destination: 'report_applique' })
    .in('id', reportIds)
  if (error) throw error
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

// ---- Piocher dans la caisse Layla LG pour composer un salaire ----

// Enveloppes déjà rangées dans la caisse Layla LG et pas encore prises par un salaire.
// En cocher une la fera SORTIR de la caisse (unassignEnveloppe à la sauvegarde).
export async function loadCaisseLaylaEnveloppes(year) {
  const { start, end } = monthBounds(year, 0)   // toute l'année
  const { data, error } = await supabase
    .from('caisse_enveloppes')
    .select('*, destinataire:caisse_destinataires!inner(name, linked_caisse_owner)')
    .eq('destinataire.linked_caisse_owner', 'layla_lg')
    .is('salaire_id', null)
    .gte('session_date', start)
    .lt('session_date', end)
    .order('session_date', { ascending: false })
  if (error) throw error
  return (data || []).map(e => ({ ...e, from_caisse: true }))
}

// Montants pris dans le solde de la caisse Layla LG pour ce salaire (= sorties liées).
export async function loadSalaireCaissePrises(salaireId) {
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .select('*')
    .eq('source_type', 'salaire')
    .eq('source_ref', salaireId)
    .order('mvt_date', { ascending: false })
  if (error) throw error
  return data || []
}

// Prend un montant dans la caisse Layla LG (sortie de caisse) pour compléter un salaire.
export async function addSalaireCaissePrise({ salaire, amount, userId }) {
  const label = `Salaire ${salaire.beneficiaire} ${salaire.month}/${salaire.year}`
  const { data, error } = await supabase
    .from('caisse_mouvements')
    .insert({
      caisse_owner: 'layla_lg',
      type: 'sortie',
      source_type: 'salaire',
      source_ref: salaire.id,
      amount,
      category: 'Salaire',
      label,
      mvt_date: todayISO(),
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw error
  await logAction({
    entityType: 'mouvement',
    entityId: data.id,
    action: 'create',
    description: `↑ Sortie caisse layla_lg : ${label}`,
    amount: -Number(amount),
    after: { caisse_owner: 'layla_lg', type: 'sortie', amount, label },
    actorId: userId,
  })
  return data
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
      payer:profiles!caisse_avances_payer_id_fkey(id, username, full_name),
      remboursements:caisse_avance_remboursements(id, amount, mode, note, rb_date)
    `)
    .order('avance_date', { ascending: false })

  if (beneficiaryId) q = q.eq('beneficiary_id', beneficiaryId)
  if (status === 'pending')  q = q.is('refunded_at', null)
  if (status === 'refunded') q = q.not('refunded_at', 'is', null)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// Remboursement PARTIEL d'une avance. mode: 'especes' | 'virement' | 'achat_lg'.
// espèces/virement → crée une ENTRÉE dans la caisse Meriem. achat_lg → baisse juste la dette.
export async function addAvanceRemboursement({ avanceId, amount, mode, note, date, userId }) {
  const amt = Number(amount)
  const today = todayISO()
  const { data: avance, error: errLoad } = await supabase
    .from('caisse_avances')
    .select(`*, beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(name), remboursements:caisse_avance_remboursements(amount)`)
    .eq('id', avanceId).single()
  if (errLoad) throw errLoad
  const paidSoFar = (avance.remboursements || []).reduce((s, r) => s + Number(r.amount), 0)
  const benefName = avance.beneficiaire?.name || '?'

  let mvtId = null
  if (mode === 'especes' || mode === 'virement') {
    const mvt = await addMouvement({
      caisseOwner: 'meriem', type: 'entree', sourceType: 'avance', amount: amt,
      category: `Prêt ${benefName}`,
      label: `💸 Remb. ${benefName} (${mode === 'virement' ? 'virement' : 'espèces'})${note ? ' — ' + note : ''}`,
      mvtDate: date || today, hasFacture: false, userId,
    })
    mvtId = mvt.id
  }

  const { error } = await supabase.from('caisse_avance_remboursements').insert({
    avance_id: avanceId, amount: amt, mode, note: note || null, rb_date: date || today,
    mouvement_id: mvtId, created_by: userId,
  })
  if (error) { if (mvtId) { try { await deleteMouvement(mvtId) } catch {} } throw error }

  // Soldée si tout est remboursé
  if (!avance.refunded_at && paidSoFar + amt >= Number(avance.amount) - 0.005) {
    await supabase.from('caisse_avances')
      .update({ refunded_at: new Date().toISOString(), refunded_note: 'Soldée (remboursements)' })
      .eq('id', avanceId)
  }
  await logAction({ entityType: 'avance', entityId: avanceId, action: 'remboursement',
    description: `Remboursement ${amt} (${mode}) — ${benefName}`, amount: amt, actorId: userId })
}

// Supprime un remboursement partiel (annule son entrée caisse + ré-ouvre l'avance).
export async function deleteAvanceRemboursement(rbId, actorId = null) {
  const { data: rb } = await supabase.from('caisse_avance_remboursements').select('*').eq('id', rbId).single()
  if (rb?.mouvement_id) { try { await deleteMouvement(rb.mouvement_id) } catch {} }
  await supabase.from('caisse_avance_remboursements').delete().eq('id', rbId)
  if (rb?.avance_id) {
    await supabase.from('caisse_avances').update({ refunded_at: null, refunded_note: null }).eq('id', rb.avance_id)
  }
  await logAction({ entityType: 'avance', entityId: rb?.avance_id, action: 'remboursement_suppr', description: 'Remboursement annulé', actorId })
}

/**
 * Récap par bénéficiaire : combien chacun doit (avances non remboursées)
 */
// « Payé pour LG » par une perso (Nezha/Layla) : crédit en leur faveur.
export async function addLgPaiementPerso({ beneficiaryId, amount, note, date, userId }) {
  const { error } = await supabase.from('caisse_lg_paiements_perso').insert({
    beneficiary_id: beneficiaryId, amount: Number(amount), note: note || null,
    paid_date: date || todayISO(), created_by: userId,
  })
  if (error) throw error
  await logAction({ entityType: 'avance', entityId: beneficiaryId, action: 'paye_lg', description: `Payé pour LG : ${amount}${note ? ' — ' + note : ''}`, amount: Number(amount), actorId: userId })
}

export async function deleteLgPaiementPerso(id) {
  const { error } = await supabase.from('caisse_lg_paiements_perso').delete().eq('id', id)
  if (error) throw error
}

export async function loadLgPaiementsPerso() {
  const { data, error } = await supabase
    .from('caisse_lg_paiements_perso')
    .select('*, beneficiaire:caisse_destinataires!caisse_lg_paiements_perso_beneficiary_id_fkey(id, name, color_key)')
    .order('paid_date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadAvancesSummary() {
  const { data: avs, error: e1 } = await supabase
    .from('caisse_avances')
    .select(`amount, beneficiary_id,
      beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(id, name, color_key),
      remboursements:caisse_avance_remboursements(amount)`)
    .is('refunded_at', null)
  if (e1) throw e1
  const { data: lgs, error: e2 } = await supabase
    .from('caisse_lg_paiements_perso')
    .select('amount, beneficiary_id, beneficiaire:caisse_destinataires!caisse_lg_paiements_perso_beneficiary_id_fkey(id, name, color_key)')
  if (e2) throw e2

  const map = {}
  const ensure = (id, benef) => {
    if (!map[id]) map[id] = { beneficiary_id: id, name: benef?.name || '?', color_key: benef?.color_key, total_due: 0, count: 0 }
    return map[id]
  }
  for (const a of (avs || [])) {
    const paid = (a.remboursements || []).reduce((s, r) => s + Number(r.amount), 0)
    const e = ensure(a.beneficiary_id, a.beneficiaire)
    e.total_due += Math.max(0, (Number(a.amount) || 0) - paid)
    e.count += 1
  }
  for (const l of (lgs || [])) {
    ensure(l.beneficiary_id, l.beneficiaire).total_due -= Number(l.amount) || 0  // crédit → net peut être négatif (LG doit)
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
    mvtDate: avanceDate || todayISO(),
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
      avance_date: avanceDate || todayISO(),
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
    mvtDate: todayISO(),
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
// ============================================================
// RECHERCHE TRANSVERSALE
// ============================================================

/**
 * Recherche libre dans toutes les caisses :
 * - mouvements (Meriem / Layla LG / Hamid)
 * - enveloppes (sessions Odoo)
 * - avances (Meriem → Layla / Nezha)
 * - salaires (Nezha / Layla)
 *
 * Détecte automatiquement si la query est :
 * - un montant (ex "250") → match exact ±0
 * - une date (ex "2026-05-22", "22/05", "22/05/2026") → filtre sur la date de l'item
 * - du texte → ilike %query% sur labels / catégories / motifs / noms
 *
 * Retourne une liste unifiée de résultats au format :
 * {
 *   kind: 'mouvement' | 'enveloppe' | 'avance' | 'salaire',
 *   id: string,
 *   date: 'YYYY-MM-DD',          // pour tri
 *   amount: number,
 *   type: 'entree' | 'sortie' | null, // pour signe
 *   label: string,                // ligne principale
 *   sublabel: string,             // info secondaire
 *   colorKey: string,             // clé COLOR_PALETTE pour badge
 *   raw: any,                     // objet brut
 * }
 */
export async function searchCaisse(query) {
  const q = (query || '').trim()
  if (!q) return []

  // --- 1. Détection du type de query --------------------------------
  // Montant : nombre pur (avec virgule ou point)
  const numNormalized = q.replace(',', '.').replace(/\s/g, '')
  const isAmount = /^-?\d+(\.\d+)?$/.test(numNormalized)
  const amount = isAmount ? Number(numNormalized) : null

  // Date ISO complète (YYYY-MM-DD)
  const isoMatch = q.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  // Date FR (DD/MM/YYYY ou DD/MM)
  const frMatch  = q.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  let dateISO = null
  if (isoMatch) {
    dateISO = q
  } else if (frMatch) {
    const dd = frMatch[1].padStart(2, '0')
    const mm = frMatch[2].padStart(2, '0')
    let yyyy = frMatch[3]
    if (!yyyy) yyyy = String(new Date().getFullYear())
    else if (yyyy.length === 2) yyyy = '20' + yyyy
    dateISO = `${yyyy}-${mm}-${dd}`
  }
  const isDate = !!dateISO

  const isText = !isAmount && !isDate

  // --- 2. Helpers ---------------------------------------------------
  const escapeIlike = s => String(s).replace(/[%_]/g, ch => '\\' + ch)
  const ilikePattern = `%${escapeIlike(q)}%`

  // Pour chaque source on retourne [] si la query n'a pas de sens pour cette source.

  // --- 3. Recherche MOUVEMENTS -------------------------------------
  async function searchMouvements() {
    let req = supabase.from('caisse_mouvements')
      .select('*')
      .order('mvt_date', { ascending: false })
      .limit(200)

    if (isAmount)      req = req.eq('amount', amount)
    else if (isDate)   req = req.eq('mvt_date', dateISO)
    else if (isText)   req = req.or(`label.ilike.${ilikePattern},category.ilike.${ilikePattern}`)

    const { data, error } = await req
    if (error) { console.warn('search mvt:', error.message); return [] }

    const ownerColor = {
      meriem:   'vert_clair',
      layla_lg: 'vert_teal',
      hamid:    'jaune',
    }
    const ownerName = {
      meriem:   'Meriem',
      layla_lg: 'Layla LG',
      hamid:    'Hamid',
    }

    return (data || []).map(m => ({
      kind: 'mouvement',
      id: 'mvt-' + m.id,
      date: m.mvt_date,
      amount: Number(m.amount),
      type: m.type,
      label: m.label || (m.category || 'Mouvement'),
      sublabel: `${m.type === 'entree' ? '↓ Entrée' : '↑ Sortie'} · Caisse ${ownerName[m.caisse_owner] || m.caisse_owner}${m.category ? ' · ' + m.category : ''}`,
      colorKey: ownerColor[m.caisse_owner] || 'gris',
      raw: m,
    }))
  }

  // --- 4. Recherche ENVELOPPES -------------------------------------
  async function searchEnveloppes() {
    const sel = '*, destinataire:caisse_destinataires(*)'
    let req = supabase.from('caisse_enveloppes').select(sel)
      .order('session_date', { ascending: false })
      .limit(200)

    if (isAmount) {
      // Match sur amount_cash OU amount_proof
      req = req.or(`amount_cash.eq.${amount},amount_proof.eq.${amount}`)
    } else if (isDate) {
      req = req.or(`session_date.eq.${dateISO},assigned_date.eq.${dateISO},proof_date.eq.${dateISO}`)
    } else if (isText) {
      // Texte : on filtre côté client après requête générale (limite 200 récentes)
      // car il n'y a pas de champ texte direct sur les enveloppes.
      req = req.limit(500)
    }

    const { data, error } = await req
    if (error) { console.warn('search env:', error.message); return [] }

    let list = data || []
    if (isText) {
      const lc = q.toLowerCase()
      list = list.filter(e => {
        const src = (e.source || '').toLowerCase()
        const dest = (e.destinataire?.name || '').toLowerCase()
        const pm = (e.payment_method || '').toLowerCase()
        const note = (e.note_proof || '').toLowerCase()
        return src.includes(lc) || dest.includes(lc) || pm.includes(lc) || note.includes(lc)
      }).slice(0, 200)
    }

    return list.map(e => ({
      kind: 'enveloppe',
      id: 'env-' + e.id,
      date: e.assigned_date || e.session_date,
      amount: Number(e.amount_cash || 0),
      type: null,
      label: `Enveloppe ${e.source || ''} · ${e.payment_method === 'cheque' ? 'Chèque' : e.payment_method === 'virement' ? 'Virement' : 'Espèces'}${e.virement_client ? ' (' + e.virement_client + ')' : ''}`,
      sublabel: e.destinataire?.name ? `→ ${e.destinataire.name}` : '⏳ À affecter',
      colorKey: e.destinataire?.color_key || 'gris',
      raw: e,
    }))
  }

  // --- 5. Recherche AVANCES ----------------------------------------
  async function searchAvances() {
    const sel = `
      *,
      beneficiaire:caisse_destinataires!caisse_avances_beneficiary_id_fkey(id, name, color_key)
    `
    let req = supabase.from('caisse_avances').select(sel)
      .order('avance_date', { ascending: false })
      .limit(200)

    if (isAmount)      req = req.eq('amount', amount)
    else if (isDate)   req = req.or(`avance_date.eq.${dateISO},refunded_at.gte.${dateISO}T00:00:00,refunded_at.lt.${dateISO}T23:59:59`)
    else if (isText)   req = req.ilike('motif', ilikePattern)

    const { data, error } = await req
    if (error) { console.warn('search avance:', error.message); return [] }

    let list = data || []
    // Pour le texte, on ajoute aussi un match sur le nom du bénéficiaire (côté client)
    if (isText) {
      const lc = q.toLowerCase()
      // On refait une 2ème requête plus large pour matcher sur le nom bénéficiaire
      const { data: extra } = await supabase.from('caisse_avances').select(sel)
        .order('avance_date', { ascending: false }).limit(500)
      const byName = (extra || []).filter(a => (a.beneficiaire?.name || '').toLowerCase().includes(lc))
      const seen = new Set(list.map(a => a.id))
      for (const a of byName) if (!seen.has(a.id)) list.push(a)
      list = list.slice(0, 200)
    }

    return list.map(a => ({
      kind: 'avance',
      id: 'av-' + a.id,
      date: a.avance_date,
      amount: Number(a.amount),
      type: null,
      label: `Avance → ${a.beneficiaire?.name || '?'}`,
      sublabel: `${a.motif || 'Sans motif'}${a.refunded_at ? ' · ✓ Remboursée' : ' · ⏳ En attente'}`,
      colorKey: a.beneficiaire?.color_key || 'violet',
      raw: a,
    }))
  }

  // --- 6. Recherche SALAIRES ---------------------------------------
  async function searchSalaires() {
    let req = supabase.from('caisse_salaires').select('*')
      .order('year', { ascending: false }).order('month', { ascending: false })
      .limit(200)

    if (isAmount) {
      req = req.or(`target_amount.eq.${amount},reliquat_amount.eq.${amount}`)
    } else if (isDate) {
      // Une date isolée → match sur paid_at (le seul timestamp précis)
      req = req.gte('paid_at', `${dateISO}T00:00:00`).lt('paid_at', `${dateISO}T23:59:59`)
    } else if (isText) {
      // Texte : match sur beneficiaire (nezha / layla) ou status
      req = req.or(`beneficiaire.ilike.${ilikePattern},status.ilike.${ilikePattern},reliquat_destination.ilike.${ilikePattern}`)
    }

    const { data, error } = await req
    if (error) { console.warn('search salaire:', error.message); return [] }

    return (data || []).map(s => ({
      kind: 'salaire',
      id: 'sal-' + s.id,
      date: s.paid_at ? s.paid_at.slice(0, 10) : `${s.year}-${String(s.month).padStart(2, '0')}-01`,
      amount: Number(s.target_amount || 0),
      type: null,
      label: `Salaire ${s.beneficiaire === 'nezha' ? 'Nezha' : 'Layla'}`,
      sublabel: `${String(s.month).padStart(2, '0')}/${s.year} · ${s.status}${s.reliquat_amount ? ' · reliquat ' + s.reliquat_amount + ' dh' : ''}`,
      colorKey: s.beneficiaire === 'nezha' ? 'orange' : 'corail',
      raw: s,
    }))
  }

  // --- 7. Lancement en parallèle + fusion --------------------------
  const [mvts, envs, avs, sals] = await Promise.all([
    searchMouvements(),
    searchEnveloppes(),
    searchAvances(),
    searchSalaires(),
  ])

  const all = [...mvts, ...envs, ...avs, ...sals]
  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return {
    results: all.slice(0, 300),
    counts: {
      total: all.length,
      mouvement: mvts.length,
      enveloppe: envs.length,
      avance:    avs.length,
      salaire:   sals.length,
    },
    queryType: isAmount ? 'amount' : isDate ? 'date' : 'text',
  }
}

// ============================================================
// RAPPROCHEMENT BANCAIRE — suspects vérifiés / justifiés
// ============================================================

/** Charge les lignes marquées : Map(txn_key -> 'justifie' | 'refuse'). */
export async function loadRapproVerifies() {
  const { data, error } = await supabase.from('caisse_rappro_verifies').select('txn_key, note')
  if (error) throw error
  return new Map((data || []).map(r => [r.txn_key, r.note || 'justifie']))
}

/** Marque une ligne du relevé : status = 'justifie' (sort de l'écart) ou 'refuse' (reste). */
export async function setRapproVerified({ txnKey, amount, txnDate, userId, status }) {
  const { error } = await supabase.from('caisse_rappro_verifies').upsert({
    txn_key: txnKey, amount, txn_date: txnDate, verified_by: userId || null, note: status || 'justifie',
  })
  if (error) throw error
}

/** Annule la vérification d'une ligne. */
export async function unsetRapproVerified(txnKey) {
  const { error } = await supabase.from('caisse_rappro_verifies').delete().eq('txn_key', txnKey)
  if (error) throw error
}

// ---- Liens manuels TPE : cartes CMI non trouvées (partagé entre admins) ----
// kind = 'link' (reliée à un paiement Odoo, odooRef) | 'regul' (à régulariser, note).
export async function loadRapproLinks() {
  const { data, error } = await supabase.from('caisse_rappro_links').select('cmi_key, kind, odoo_ref, note')
  if (error) throw error
  return new Map((data || []).map(r => [r.cmi_key, { kind: r.kind, odooRef: r.odoo_ref || null, note: r.note || null }]))
}
export async function setRapproLink({ cmiKey, kind, amount, txnDate, odooRef = null, note = null, userId }) {
  const { error } = await supabase.from('caisse_rappro_links').upsert({
    cmi_key: cmiKey, kind, amount, txn_date: txnDate, odoo_ref: odooRef, note, linked_by: userId || null,
  })
  if (error) throw error
}
export async function unsetRapproLink(cmiKey) {
  const { error } = await supabase.from('caisse_rappro_links').delete().eq('cmi_key', cmiKey)
  if (error) throw error
}

// ---- Relevé importé PARTAGÉ (pour que tous les admins voient le même rapprochement) ----
/** Sauvegarde le relevé importé (excel+pdf) en base, partagé entre tous les utilisateurs. */
export async function saveRapproBank(data) {
  const { error } = await supabase.from('caisse_rappro_bank')
    .upsert({ id: 'current', data, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
}
/** Charge le relevé importé partagé (ou null). */
export async function loadRapproBank() {
  const { data, error } = await supabase.from('caisse_rappro_bank').select('data').eq('id', 'current').maybeSingle()
  if (error) return null
  return data?.data || null
}
/** Efface le relevé partagé (réinitialisation). */
export async function clearRapproBank() {
  await supabase.from('caisse_rappro_bank').delete().eq('id', 'current')
}
