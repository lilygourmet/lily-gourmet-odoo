import { supabase } from './supabase'
import { memoCache } from './memoCache'

// ============================================================
// CONVERSATIONS WHATSAPP
// Lecture + assignation manuelle ("Je prends"). Pas d'envoi ici.
// ============================================================

// On joint le commercial assigné (FK conversations.assigned_to -> profiles.id)
const CONV_SEL = `
  *,
  assigned:profiles!conversations_assigned_to_fkey(id, username, full_name)
`

/**
 * Charge les conversations selon un filtre.
 * filter : 'all' (toutes) | 'mine' (à moi) | 'unassigned' (non assignées)
 * Tri : dernier message en premier.
 */
export async function loadConversations(filter = 'all', userId = null) {
  let query = supabase
    .from('conversations')
    .select(CONV_SEL)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1000)   // plafond de sécurité : les 1000 conversations les plus récentes

  if (filter === 'mine' && userId) query = query.eq('assigned_to', userId)
  if (filter === 'unassigned') query = query.eq('status', 'non_assignee')

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// Durée écoulée, format court : "10 min", "2h", "1 jour", "3 jours".
function formatElapsed(ts) {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 jour' : `${d} jours`
}

/**
 * État d'urgence d'une conversation pour la liste (emoji + texte + ton).
 * Retourne null si rien à signaler (échange normal récent).
 * Priorité : fermée > client attend +30min > silence +3j > non assignée.
 */
export function conversationUrgency(conv) {
  if (conv.status === 'fermee') return { emoji: '✅', text: 'Fermée', tone: 'muted' }

  const now = Date.now()
  const lastInbound = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : null
  const lastMsg = conv.last_message_at ? new Date(conv.last_message_at).getTime() : null
  // Le client a parlé en dernier si aucun message agent n'est venu après lui
  const clientSpokeLast = lastInbound && (!lastMsg || lastMsg <= lastInbound)

  // 🔴 client attend une réponse depuis > 30 min
  if (clientSpokeLast && (now - lastInbound) > 30 * 60 * 1000) {
    return { emoji: '🔴', text: `Attend une réponse depuis ${formatElapsed(lastInbound)}`, tone: 'urgent' }
  }
  // 🟡 silence client > 3 jours (l'agent a parlé en dernier, pas de réponse)
  if (!clientSpokeLast && lastMsg && (now - lastMsg) > 3 * 24 * 60 * 60 * 1000) {
    return { emoji: '🟡', text: `Silence depuis ${formatElapsed(lastMsg)} — à relancer`, tone: 'warn' }
  }
  // 🆕 nouvelle conversation à prendre (non assignée récente)
  if (conv.status === 'non_assignee') {
    return { emoji: '🆕', text: 'Nouvelle conversation à prendre', tone: 'muted' }
  }
  return null
}

/**
 * File d'attente : si le client a parlé en dernier (il attend une réponse),
 * renvoie le timestamp (ms) de son dernier message ; sinon null.
 * Sert à trier l'inbox : plus l'attente est ancienne, plus on remonte en haut.
 * Les conversations fermées ne sont jamais "en attente".
 */
export function conversationWaitingSince(conv) {
  if (conv.status === 'fermee') return null
  const lastInbound = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : null
  if (!lastInbound) return null
  const lastMsg = conv.last_message_at ? new Date(conv.last_message_at).getTime() : null
  const clientSpokeLast = !lastMsg || lastMsg <= lastInbound
  return clientSpokeLast ? lastInbound : null
}

/**
 * Compte pour le badge de l'onglet : { unassigned, unread }.
 * On compte les conversations qui demandent une ACTION (= ce qui apparaît en
 * rouge dans la liste), pas les messages :
 * - unassigned = conversations à prendre (status='non_assignee').
 * - unread = conversations DÉJÀ assignées mais qui attendent une réponse
 *   (le client a parlé en dernier) ou marquées « non lu » à la main.
 * Les deux ensembles sont disjoints → le total (unassigned + unread) ne
 * double-compte pas.
 */
export async function countConversationBadges() {
  const { data } = await supabase
    .from('conversations')
    .select('status, last_inbound_at, last_message_at, marked_unread')
    .neq('status', 'fermee')
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(1000)

  let unassigned = 0, unread = 0
  for (const c of (data || [])) {
    const lastInbound = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : null
    const lastMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : null
    const clientSpokeLast = lastInbound && (!lastMsg || lastMsg <= lastInbound)
    // On ne compte que ce qui demande une action : client a parlé en dernier
    // OU marquée « non lu » à la main. Une conversation non assignée déjà
    // répondue (auto-réponse) ne compte donc plus → colle au « Non lues » de l'inbox.
    if (!clientSpokeLast && !c.marked_unread) continue
    if (c.status === 'non_assignee') unassigned++
    else unread++
  }
  return { unassigned, unread }
}

/**
 * Mémorise que le user vient de visiter l'onglet Conversations (remet "non lus" à 0).
 */
export async function markConversationsVisited(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ last_visited_conversations: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

// ============================================================
// « Nettoyage du jour » : état par utilisateur (dates stockées sur profiles).
// ============================================================
/** Renvoie { done, skip } : le jour du dernier nettoyage fait / de la dernière échappatoire utilisée. */
export async function loadCleanupState(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('conv_cleanup_date, conv_cleanup_skip_date')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return { done: data?.conv_cleanup_date || null, skip: data?.conv_cleanup_skip_date || null }
}
/** Marque le nettoyage comme FAIT pour ce jour (plus de blocage jusqu'à demain). */
export async function setCleanupDone(userId, day) {
  await supabase.from('profiles').update({ conv_cleanup_date: day }).eq('id', userId)
}
/** Marque l'échappatoire « Tout garder » comme utilisée pour ce jour (ne débloque pas définitivement). */
export async function setCleanupSkip(userId, day) {
  await supabase.from('profiles').update({ conv_cleanup_skip_date: day }).eq('id', userId)
}

/** Pose (true) ou enlève (false) l'étiquette "non lu" sur une conversation précise. */
export async function setConversationUnread(conversationId, value) {
  const { error } = await supabase
    .from('conversations')
    .update({ marked_unread: value })
    .eq('id', conversationId)
  if (error) throw error
}

/** Marque une conversation comme lue : enlève l'étiquette + remet le compteur à 0. */
export async function markConversationRead(conversationId) {
  const { error } = await supabase
    .from('conversations')
    .update({ marked_unread: false, unread_count: 0, link_order_at: null })
    .eq('id', conversationId)
  if (error) throw error
}

/**
 * Conversation simplement OUVERTE (pas encore répondue) : on enlève l'étiquette
 * manuelle et le surlignage "commande", MAIS on garde le compteur "non lu" vert
 * tant que l'équipe n'a pas répondu (il sera remis à 0 à l'envoi d'une réponse).
 */
export async function markConversationOpened(conversationId) {
  const { error } = await supabase
    .from('conversations')
    .update({ marked_unread: false, link_order_at: null })
    .eq('id', conversationId)
  if (error) throw error
}

/**
 * Recherche dans le CONTENU des messages : renvoie les ids de conversations
 * dont au moins un message contient le terme. Limité pour rester rapide.
 */
export async function searchMessageConversationIds(term) {
  const t = (term || '').trim()
  if (t.length < 2) return []
  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .ilike('body', `%${t}%`)
    .limit(200)
  if (error) throw error
  return [...new Set((data || []).map(m => m.conversation_id))]
}

/**
 * Charge une conversation seule (pour la vue détail).
 */
export async function loadConversation(conversationId) {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONV_SEL)
    .eq('id', conversationId)
    .single()
  if (error) throw error
  return data
}

/**
 * Charge les messages d'une conversation, du plus ancien au plus récent.
 */
export async function loadMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_user_id_fkey(id, username, full_name)')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * "Je prends" : assigne la conversation au commercial et passe en 'en_cours'.
 * Écrit aussi une ligne dans le journal d'audit (conversation_events).
 */
export async function assignConversation(conversationId, userId) {
  const { data, error } = await supabase
    .from('conversations')
    .update({
      assigned_to: userId,
      status: 'en_cours',
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error

  await supabase.from('conversation_events').insert({
    conversation_id: conversationId,
    type: 'assigned',
    by_user_id: userId,
  })

  return data
}

/** Clôture une conversation (statut 'fermee') et la désassigne. */
export async function closeConversation(conversationId, userId) {
  const { data, error } = await supabase
    .from('conversations')
    // Clôture : on GARDE les étiquettes (elles doivent survivre à une réouverture par le client ou un commercial).
    .update({ status: 'fermee', assigned_to: null, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  await supabase.from('conversation_events').insert({
    conversation_id: conversationId, type: 'closed', by_user_id: userId,
  })
  return data
}

/** Qui a fermé la conversation (dernier événement 'closed') → { name, at } ou null. */
export async function loadClosedBy(conversationId) {
  const { data: ev } = await supabase
    .from('conversation_events')
    .select('by_user_id, created_at')
    .eq('conversation_id', conversationId).eq('type', 'closed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!ev?.by_user_id) return null
  const { data: p } = await supabase
    .from('profiles').select('full_name, username').eq('id', ev.by_user_id).maybeSingle()
  return { name: p?.full_name || p?.username || null, at: ev.created_at }
}

// Étiquettes par défaut (servent de repli si la table n'est pas encore chargée).
export const CONV_LABELS = [
  { key: 'a_relancer',  label: 'À relancer',   color: '#E08A00', bg: '#FFF3D6' },
  { key: 'devis_envoye', label: 'Devis envoyé', color: '#1456a0', bg: '#E6F1FB' },
  { key: 'a_encaisser', label: 'À encaisser',  color: '#A32D2D', bg: '#FBD9D0' },
]

// Palette de couleurs proposée pour créer une étiquette (couleur du texte + fond clair).
export const LABEL_PALETTE = [
  { color: '#E08A00', bg: '#FFF3D6' }, // orange
  { color: '#1456a0', bg: '#E6F1FB' }, // bleu
  { color: '#A32D2D', bg: '#FBD9D0' }, // rouge
  { color: '#2E7D32', bg: '#E3F3E4' }, // vert
  { color: '#993556', bg: '#F7E3EA' }, // bordeaux
  { color: '#6A3FB5', bg: '#EEE6FB' }, // violet
  { color: '#0E7C86', bg: '#DFF3F4' }, // turquoise
  { color: '#555555', bg: '#ECECEC' }, // gris
]

/** Charge les étiquettes définies (table conversation_labels). Repli sur CONV_LABELS si vide/erreur.
 *  Caché 10 min (change rarement) ; le cache est vidé après création/modif/suppression. */
async function _loadConvLabels() {
  const { data, error } = await supabase
    .from('conversation_labels')
    .select('key, label, color, bg, sort')
    .order('sort', { ascending: true })
  if (error || !data?.length) return CONV_LABELS
  return data
}
export const loadConvLabels = memoCache(_loadConvLabels)

function slugifyLabel(label) {
  const base = String(label || '').toLowerCase().normalize('NFD')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return (base || 'etiquette') + '_' + Date.now().toString(36).slice(-4)
}

/** Crée une étiquette. color/bg viennent d'une entrée de LABEL_PALETTE. */
export async function createConvLabel({ label, color, bg, sort = 99 }) {
  const key = slugifyLabel(label)
  const { error } = await supabase.from('conversation_labels').insert({ key, label: label.trim(), color, bg, sort })
  if (error) throw error
  loadConvLabels.clear()
  return key
}

/** Modifie une étiquette existante (label / couleur). */
export async function updateConvLabel(key, fields) {
  const { error } = await supabase.from('conversation_labels').update(fields).eq('key', key)
  if (error) throw error
  loadConvLabels.clear()
}

/** Supprime une étiquette. */
export async function deleteConvLabel(key) {
  const { error } = await supabase.from('conversation_labels').delete().eq('key', key)
  if (error) throw error
  loadConvLabels.clear()
}
/** Met à jour les étiquettes d'une conversation (tableau de clés). */
export async function setConversationLabels(conversationId, labels) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ labels: labels || [], updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  return data
}

/** Renomme le client d'une conversation à la MAIN (marque name_manual=true → ne sera plus écrasé par Odoo). */
export async function updateConversationClientName(conversationId, name) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ client_name: name?.trim() || null, name_manual: true, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  return data
}

/** Met le nom de la conversation depuis Odoo (devis/commande). N'écrase JAMAIS un
 * nom saisi à la main (name_manual). Renvoie la conv mise à jour, ou null si rien fait. */
export async function setConversationNameFromOdoo(conversationId, clientPhone, currentName, nameManual) {
  if (nameManual) return null
  if (!clientPhone) return null
  let orders = []
  try { orders = await searchOrders(clientPhone) } catch { return null }
  // On ne garde que les commandes/devis dont le téléphone correspond vraiment.
  const num = String(clientPhone).replace(/\D/g, '')
  const match = (orders || []).find(o => {
    const op = String(o.clientPhone || '').replace(/\D/g, '')
    return op && (op.endsWith(num.slice(-9)) || num.endsWith(op.slice(-9)))
  })
  const realName = match?.clientName?.trim()
  if (!realName || realName === (currentName || '').trim()) return null
  const { data, error } = await supabase
    .from('conversations')
    .update({ client_name: realName, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) return null
  return data
}

/** Récupère tous les clients ayant un devis/commande (nom + téléphone) depuis Odoo. */
export async function fetchOrderClients() {
  const res = await fetch('/api/wati-webhook?action=order-clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'Odoo erreur')
  return d.clients || []
}

/** Met à jour EN MASSE les noms des conversations depuis Odoo (devis/commande).
 * N'écrase pas les noms saisis à la main (name_manual). Renvoie le nb mis à jour. */
export async function batchUpdateNamesFromOdoo() {
  const [convs, clients] = await Promise.all([loadConversations('all'), fetchOrderClients()])
  const byPhone = new Map()
  for (const c of clients) { const k = String(c.phone).replace(/\D/g, '').slice(-9); if (k) byPhone.set(k, c.name) }
  const toUpdate = []
  for (const conv of convs) {
    if (conv.name_manual) continue
    const k = String(conv.client_phone || '').replace(/\D/g, '').slice(-9)
    if (!k) continue
    const real = byPhone.get(k)
    if (real && real !== (conv.client_name || '').trim()) toUpdate.push({ id: conv.id, name: real })
  }
  let updated = 0
  for (let i = 0; i < toUpdate.length; i += 20) {
    const chunk = toUpdate.slice(i, i + 20)
    await Promise.all(chunk.map(u =>
      supabase.from('conversations').update({ client_name: u.name, updated_at: new Date().toISOString() }).eq('id', u.id)
        .then(() => { updated++ }).catch(() => {})
    ))
  }
  return updated
}

/** Enregistre la note interne (privée, visible équipe) d'une conversation. */
export async function updateConversationNote(conversationId, note) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ internal_note: note?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  return data
}

/** Rouvre une conversation (en_cours si assignée, sinon non_assignee). */
export async function reopenConversation(conversationId, userId) {
  const { data: cur } = await supabase
    .from('conversations').select('assigned_to').eq('id', conversationId).single()
  const status = cur?.assigned_to ? 'en_cours' : 'non_assignee'
  const { data, error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  await supabase.from('conversation_events').insert({
    conversation_id: conversationId, type: 'reopened', by_user_id: userId,
  })
  return data
}

// ============================================================
// PAIEMENTS (preuves de virement transférées en interne)
// ============================================================

const PAYMENT_SEL = `
  *,
  conversation:conversations!messages_conversation_id_fkey(id, client_name, client_phone),
  validator:profiles!messages_payment_validated_by_fkey(id, username, full_name),
  rejector:profiles!messages_payment_rejected_by_fkey(id, username, full_name)
`

/** Marque un message comme preuve de paiement (n° commande + nom + montant optionnels). */
export async function markPaymentProof(messageId, orderRef, clientName, amount) {
  const { data, error } = await supabase
    .from('messages')
    .update({
      is_payment_proof: true,
      payment_order_ref: orderRef?.trim() || null,
      payment_client_name: clientName?.trim() || null,
      payment_amount: amount ?? null,
    })
    .eq('id', messageId)
    .select('*, sender:profiles!messages_sender_user_id_fkey(id, username, full_name)')
    .single()
  if (error) throw error
  return data
}

/** Annule le marquage d'une preuve de paiement. */
export async function unmarkPaymentProof(messageId) {
  const { data, error } = await supabase
    .from('messages')
    .update({ is_payment_proof: false, payment_order_ref: null, payment_client_name: null, payment_amount: null, payment_validated_at: null, payment_validated_by: null, payment_rejected_at: null, payment_rejected_by: null, payment_rejection_reason: null })
    .eq('id', messageId)
    .select('*, sender:profiles!messages_sender_user_id_fkey(id, username, full_name)')
    .single()
  if (error) throw error
  return data
}

/** Charge les preuves de paiement (les plus récentes d'abord) avec infos client. */
export async function loadPaymentsToValidate() {
  const { data, error } = await supabase
    .from('messages')
    .select(PAYMENT_SEL)
    .eq('is_payment_proof', true)
    .order('sent_at', { ascending: false })
  if (error) throw error
  return data || []
}

/** Marque un paiement comme validé (efface un éventuel refus). */
export async function validatePayment(messageId, userId) {
  const { data, error } = await supabase
    .from('messages')
    .update({ payment_validated_at: new Date().toISOString(), payment_validated_by: userId, payment_rejected_at: null, payment_rejected_by: null, payment_rejection_reason: null })
    .eq('id', messageId)
    .select(PAYMENT_SEL)
    .single()
  if (error) throw error
  return data
}

/** Refuse un paiement avec un motif (efface une éventuelle validation). */
export async function rejectPayment(messageId, userId, reason) {
  const { data, error } = await supabase
    .from('messages')
    .update({ payment_rejected_at: new Date().toISOString(), payment_rejected_by: userId, payment_rejection_reason: reason?.trim() || null, payment_validated_at: null, payment_validated_by: null })
    .eq('id', messageId)
    .select(PAYMENT_SEL)
    .single()
  if (error) throw error
  return data
}

// ============================================================
// PHRASES TYPES (réponses rapides, communes à l'équipe)
// ============================================================

// Caché 10 min (change rarement) ; le cache est vidé après création/modif/suppression/réordonnancement.
async function _loadQuickReplies() {
  const { data, error } = await supabase
    .from('quick_replies').select('*').order('ordre').order('id')
  if (error) throw error
  return data || []
}
export const loadQuickReplies = memoCache(_loadQuickReplies)

export async function createQuickReply(label, body, mediaPath = null, emoji = null) {
  const { data, error } = await supabase
    .from('quick_replies').insert({ label: label.trim(), body, media_path: mediaPath, emoji: emoji || null }).select().single()
  if (error) throw error
  loadQuickReplies.clear()
  return data
}

export async function updateQuickReply(id, label, body, mediaPath = null, emoji = null) {
  const { error } = await supabase
    .from('quick_replies').update({ label: label.trim(), body, media_path: mediaPath, emoji: emoji || null }).eq('id', id)
  if (error) throw error
  loadQuickReplies.clear()
}

export async function deleteQuickReply(id) {
  const { error } = await supabase.from('quick_replies').delete().eq('id', id)
  if (error) throw error
  loadQuickReplies.clear()
}

/** Enregistre un nouvel ordre des phrases (ordre = position dans la liste). */
export async function reorderQuickReplies(orderedIds) {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('quick_replies').update({ ordre: i }).eq('id', id)
  ))
  loadQuickReplies.clear()
}

// ============================================================
// TEMPLATES (initier une conversation)
// ============================================================

/** Suggère 3 réponses (IA) au dernier message du client. */
export async function suggestReplies(conversationId, userId) {
  const res = await fetch('/api/wati-webhook?action=suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.suggestions || []
}

/** Supprime un message (tente WATI + soft delete local). */
export async function deleteMessage(messageId, userId) {
  const res = await fetch('/api/wati-webhook?action=delete-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data   // { ok, deleted_at_wati }
}

/** Corrige orthographe/grammaire d'un message avant envoi. */
export async function correctText(text, userId) {
  const res = await fetch('/api/wati-webhook?action=correct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.corrected || text
}

/** Liste des templates WhatsApp approuvés (via Wati). */
export async function fetchTemplates() {
  const res = await fetch('/api/wati-webhook?action=templates', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.templates || []
}

/** Liste les devis non confirmés (Odoo brouillon/envoyé). Vide = tous (récents). */
export async function loadDevis(query = '') {
  const res = await fetch('/api/wati-webhook?action=devis-list', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.orders || []
}

// Liste les commandes confirmées (sale.order state=sale) avec qty/prix/commentaire.
export async function loadConfirmedOrders(query = '') {
  const res = await fetch('/api/wati-webhook?action=orders-confirmed', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.orders || []
}

// Journal « qui a traité » : enregistre une action (confirme / annulation) sur une commande.
export async function recordDevisTraitement({ order_num, action, user_id, user_name, detail = null }) {
  const base = { order_num, action, user_id: user_id || null, user_name: user_name || null }
  try {
    const { error } = await supabase.from('devis_traitements').insert({ ...base, detail: detail || null })
    if (error) throw error
  } catch (_) {
    // Repli si la colonne `detail` n'existe pas encore : on enregistre au moins l'action.
    try { await supabase.from('devis_traitements').insert(base) } catch (_) { /* non bloquant */ }
  }
}

// Journal complet des actions sur les commandes (le plus récent d'abord) — fenêtre admin.
// select('*') = résilient si la colonne `detail` n'est pas encore créée.
// `search` : filtre côté base par n° de commande ou nom (pour retrouver une commande même ancienne).
export async function loadDevisTraitementsJournal({ limit = 400, search = '' } = {}) {
  let q = supabase.from('devis_traitements').select('*').order('created_at', { ascending: false }).limit(limit)
  const s = (search || '').trim().replace(/[%,()]/g, ' ')
  if (s) q = q.or(`order_num.ilike.%${s}%,user_name.ilike.%${s}%`)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
// Qui a PRIS/CONFIRMÉ la commande dans l'app (vendeur « app ») : on prend la personne
// du « confirme », sinon la 1ʳᵉ action ayant un nom. null si rien. Résilient.
export async function loadOrderHandler(orderNum) {
  if (!orderNum) return null
  const { data, error } = await supabase
    .from('devis_traitements').select('action, user_name, created_at')
    .eq('order_num', orderNum).order('created_at', { ascending: true })
  if (error || !data?.length) return null
  const confirme = data.find(r => r.action === 'confirme' && r.user_name)
  return (confirme || data.find(r => r.user_name) || {}).user_name || null
}

// Note (commentaire) d'une commande Odoo par n° — ex. « ⚠️ … chocolat blanc 10 hajj… ».
// Récupérée en direct d'Odoo (pas dans les données synchronisées du calendrier).
export async function loadOrderNote(orderNum) {
  if (!orderNum) return ''
  try {
    const r = await fetch('/api/wati-webhook?action=order-note', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNum }),
    })
    const d = await r.json()
    return d?.note || ''
  } catch { return '' }
}

// Corrige (ou efface) le commentaire d'une commande directement dans Odoo.
// Renvoie la note telle qu'Odoo l'a enregistrée.
export async function saveOrderNote(orderNum, note) {
  const r = await fetch('/api/wati-webhook?action=order-note', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNum, note: String(note ?? '') }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Enregistrement impossible')
  return d?.note || ''
}

// Notes de PLUSIEURS commandes en UN seul appel (impression en lot) → map { S123: "…" }.
export async function loadOrdersNotes(orderNums) {
  const nums = (orderNums || []).filter(Boolean)
  if (!nums.length) return {}
  try {
    const r = await fetch('/api/wati-webhook?action=orders-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNums: nums }),
    })
    const d = await r.json()
    return d?.notes || {}
  } catch { return {} }
}

// Vendeurs « app » de PLUSIEURS commandes en UNE requête → map { S123: "Nom" }.
export async function loadOrdersHandlers(orderNums) {
  const nums = (orderNums || []).filter(Boolean)
  if (!nums.length) return {}
  const { data, error } = await supabase
    .from('devis_traitements').select('order_num, action, user_name, created_at')
    .in('order_num', nums).order('created_at', { ascending: true })
  if (error || !data?.length) return {}
  const byOrder = {}
  for (const r of data) { (byOrder[r.order_num] ||= []).push(r) }
  const map = {}
  for (const [num, rows] of Object.entries(byOrder)) {
    const name = (rows.find(r => r.action === 'confirme' && r.user_name) || rows.find(r => r.user_name) || {}).user_name
    if (name) map[num] = name
  }
  return map
}

// Map order_num -> dernière action { action, user_name, created_at }. Résilient ({} si table absente).
export async function loadDevisTraitements() {
  const { data, error } = await supabase
    .from('devis_traitements').select('order_num, action, user_name, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)   // les 2000 traitements les plus récents suffisent (devis affichés = récents)
  if (error) return {}
  const map = {}
  for (const r of data || []) { if (!map[r.order_num]) map[r.order_num] = r }
  return map
}

// Numéros de téléphone qui ont déjà une conversation (= clients déjà contactés).
export async function loadConversationPhones() {
  const { data, error } = await supabase.from('conversations').select('client_phone')
  if (error) return []
  return (data || []).map(c => c.client_phone).filter(Boolean)
}

// Compte les devis internet (état 'sent') ; avec `since` (ISO) = nouveaux depuis la dernière visite.
export async function countNouveauxDevisInternet(since = null) {
  try {
    const res = await fetch('/api/wati-webhook?action=count-devis-internet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since }),
    })
    const d = await res.json().catch(() => ({}))
    return d.count || 0
  } catch { return 0 }
}

// Compte les devis internet (état 'sent') NON TRAITÉS = qui traînent encore dans l'onglet
// « Devis internet ». Calcul fait CÔTÉ SERVEUR (1 appel léger) pour ne pas ralentir l'app :
// avant, ça chargeait toute la liste Odoo + toute la table conversations depuis le navigateur.
export async function countDevisInternetNonTraites() {
  try {
    const res = await fetch('/api/wati-webhook?action=count-devis-internet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonTraites: true }),
    })
    const d = await res.json().catch(() => ({}))
    return d.count || 0
  } catch { return 0 }
}

// Numéros de commande (S…) déjà mentionnés dans NOS messages WhatsApp (agent/system).
// Sert à savoir si un client a été contacté pour CETTE commande précise.
export async function loadContactedOrderRefs() {
  const set = new Set()
  // Borné aux 8000 messages les plus récents (id décroissant) : évite de charger
  // TOUTE la table messages dans le navigateur ; les devis affichés sont récents.
  const { data, error } = await supabase
    .from('messages').select('body')
    .in('sender_type', ['agent', 'system'])
    .ilike('body', '%S%')
    .order('id', { ascending: false })
    .limit(8000)
  if (error) return set
  for (const m of data || []) {
    const matches = (m.body || '').match(/\bS\d{4,}\b/gi)
    if (matches) matches.forEach(s => set.add(s.toUpperCase()))
  }
  return set
}

// Téléphones (9 derniers chiffres) ayant déjà une conversation WhatsApp entamée.
// Sert à masquer un « devis internet » dont le client est déjà en contact.
export async function loadConversationPhoneKeys() {
  const { data, error } = await supabase.from('conversations').select('client_phone')
  const set = new Set()
  if (error) return set
  for (const c of data || []) {
    const k = String(c.client_phone || '').replace(/\D/g, '').slice(-9)
    if (k.length >= 9) set.add(k)
  }
  return set
}

// Confirme un devis dans Odoo (action réelle). Renvoie { ok, name, state }.
export async function confirmDevis(id, actorId = null) {
  const res = await fetch('/api/wati-webhook?action=devis-confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, actorId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  if (data?.name) untagDevisEnvoye(data.name)   // confirmé → l'étiquette « Devis envoyé » part
  // Confirmer ne synchronise pas tout seul → on relance la synchro en arrière-plan
  // pour que la commande apparaisse tout de suite en Prod / Calendrier (sans bloquer l'écran).
  if (actorId) {
    fetch('/api/sync-now', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: actorId }),
    }).catch(() => {})
  }
  return data
}

export async function cancelDevis(id, actorId = null) {
  const res = await fetch('/api/wati-webhook?action=devis-cancel', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, actorId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

/** Remet une commande annulée en DEVIS (par n° S… ou id Odoo). Effet réel dans Odoo. */
export async function restoreDevis({ id = null, orderNum = null, actorId = null }) {
  const res = await fetch('/api/wati-webhook?action=devis-restore', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, orderNum, actorId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

/** Suivi des devis envoyés : map { order_num: { count, last } }. Résilient ({} si table absente). */
export async function loadDevisEnvois() {
  const { data, error } = await supabase
    .from('devis_envois').select('order_num, sent_at').order('sent_at', { ascending: false })
  if (error) return {}
  const map = {}
  for (const r of data || []) {
    if (!r.order_num) continue
    if (!map[r.order_num]) map[r.order_num] = { count: 0, last: r.sent_at }
    map[r.order_num].count++
    if (r.sent_at > map[r.order_num].last) map[r.order_num].last = r.sent_at
  }
  return map
}

/** Enregistre l'envoi d'un devis (pour le marquer "déjà envoyé") + étiquette « Devis envoyé ». */
export async function recordDevisEnvoi(orderNum, clientPhone, userId) {
  try {
    await supabase.from('devis_envois').insert({ order_num: orderNum, client_phone: clientPhone || null, sent_by: userId || null })
  } catch (_) { /* non bloquant */ }
  await tagDevisEnvoye(orderNum, clientPhone)
}

// Retrouve la conversation d'un client (par tél, repli sur le n° de commande lié).
async function convIdForDevis(orderNum, clientPhone) {
  const last9 = String(clientPhone || '').replace(/\D/g, '').slice(-9)
  if (last9) {
    const { data } = await supabase.from('conversations').select('id').ilike('client_phone', `%${last9}%`).limit(1)
    if (data?.[0]) return data[0].id
  }
  if (orderNum) {
    const { data } = await supabase.from('conversations').select('id').eq('link_order_ref', orderNum).limit(1)
    if (data?.[0]) return data[0].id
  }
  return null
}

/** Ajoute l'étiquette « Devis envoyé » à la conversation du client. */
export async function tagDevisEnvoye(orderNum, clientPhone = null) {
  try {
    const id = await convIdForDevis(orderNum, clientPhone)
    if (!id) return
    const { data } = await supabase.from('conversations').select('labels').eq('id', id).single()
    const cur = Array.isArray(data?.labels) ? data.labels : []
    if (cur.includes('devis_envoye')) return
    await supabase.from('conversations').update({ labels: [...cur, 'devis_envoye'], updated_at: new Date().toISOString() }).eq('id', id)
  } catch (_) { /* non bloquant */ }
}

/** Retire l'étiquette « Devis envoyé » (devis confirmé) des conversations liées au n°. */
export async function untagDevisEnvoye(orderNum) {
  try {
    if (!orderNum) return
    const { data } = await supabase.from('conversations').select('id, labels').eq('link_order_ref', orderNum)
    for (const c of (data || [])) {
      const cur = Array.isArray(c.labels) ? c.labels : []
      if (cur.includes('devis_envoye')) await supabase.from('conversations').update({ labels: cur.filter(l => l !== 'devis_envoye'), updated_at: new Date().toISOString() }).eq('id', c.id)
    }
  } catch (_) { /* non bloquant */ }
}

/** Photos (pièces jointes image) d'un devis/commande Odoo. limit=1 pour une vignette. */
export async function loadDevisPhotos(orderId, limit) {
  const res = await fetch('/api/wati-webhook?action=devis-photos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, limit }),
  })
  const data = await res.json().catch(() => ({}))
  return data.photos || []
}

// Photos d'une commande par N° (le calendrier n'a pas l'id Odoo, seulement S…).
export async function loadOrderPhotosByNum(orderNum, limit) {
  if (!orderNum) return []
  const res = await fetch('/api/wati-webhook?action=devis-photos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNum, limit }),
  })
  const data = await res.json().catch(() => ({}))
  return data.photos || []
}

/** Recherche une commande/devis Odoo par n° S, nom client ou téléphone. */
export async function searchOrders(query) {
  const res = await fetch('/api/wati-webhook?action=search-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.orders || []
}

/** Envoie un message template (initie une conversation). */
export async function sendTemplate({ clientPhone, templateName, broadcastName, parameters, bodyText, freeText, userId }) {
  const res = await fetch('/api/wati-webhook?action=send-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPhone, templateName, broadcastName, parameters, bodyText, freeText, userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

// ============================================================
// ENVOI (réponse d'un commercial)
// ============================================================

const MEDIA_BUCKET = 'conversation-media'
const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16 MB (limite vidéo WhatsApp)

/**
 * Upload d'une pièce jointe (image ou PDF) dans le bucket privé.
 * Retourne le CHEMIN du fichier (on génère des URL signées à la demande).
 */
export async function uploadConversationMedia(file, userId) {
  if (!file) return null
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Fichier trop volumineux (max 16 MB)')
  }
  const ts = Date.now()
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${ts}_${cleanName}`

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error

  return path
}

/**
 * Génère une URL signée (lien temporaire, 1h) pour afficher une pièce jointe stockée.
 */
export async function getMediaSignedUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data?.signedUrl || null
}

/**
 * Envoie un message (texte et/ou média) via Wati puis l'enregistre dans Supabase.
 * Passe par la fonction serveur (le token Wati ne doit jamais être côté navigateur).
 * `mediaPath` = chemin retourné par uploadConversationMedia (optionnel).
 * Retourne le message inséré (avec l'expéditeur joint).
 */
export async function sendMessage({ conversationId, clientPhone, userId, text, mediaPath, mediaType }) {
  const res = await fetch('/api/wati-webhook?action=send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, clientPhone, userId, text, mediaPath, mediaType }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.message
}

/** Nombre de commandes Cake Design (CD-) d'un client — pour le badge « client fidèle ». */
export async function loadClientCdCount(clientPhone) {
  const res = await fetch('/api/wati-webhook?action=client-cd-count', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPhone }),
  })
  const d = await res.json().catch(() => ({}))
  return d.count || 0
}

/** Mémorise « fidèle » sur des conversations (une fois acquis, plus de re-check Odoo). */
export async function markConversationsFidele(ids) {
  if (!ids?.length) return
  await supabase.from('conversations').update({ fidele: true }).in('id', ids)
}

/** EN LOT : { <9 derniers chiffres>: nb CD- sans acompte } pour une liste de téléphones (étoile dans la liste). */
export async function loadClientsCdCounts(phones) {
  const res = await fetch('/api/wati-webhook?action=clients-cd-counts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phones }),
  })
  const d = await res.json().catch(() => ({}))
  return d.counts || {}
}
