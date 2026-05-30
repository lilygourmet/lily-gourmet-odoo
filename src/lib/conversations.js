import { supabase } from './supabase'

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
    return { emoji: '🔴', text: `⏰ Attend une réponse depuis ${formatElapsed(lastInbound)}`, tone: 'urgent' }
  }
  // 🟡 silence client > 3 jours (l'agent a parlé en dernier, pas de réponse)
  if (!clientSpokeLast && lastMsg && (now - lastMsg) > 3 * 24 * 60 * 60 * 1000) {
    return { emoji: '🟡', text: `😴 Silence depuis ${formatElapsed(lastMsg)} - à relancer`, tone: 'warn' }
  }
  // 🆕 nouvelle conversation à prendre (non assignée récente)
  if (conv.status === 'non_assignee') {
    return { emoji: '🆕', text: 'Nouvelle conversation à prendre', tone: 'muted' }
  }
  return null
}

/**
 * Compte pour le badge de l'onglet : { unassigned, unread }.
 * - unassigned = conversations status='non_assignee' (à prendre).
 * - unread = conversations dont last_inbound_at > dernière visite du user.
 *   Si jamais visité (lastVisited null) → toutes celles ayant reçu un message.
 */
export async function countConversationBadges(lastVisited) {
  const { count: unassigned } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'non_assignee')

  let unreadQuery = supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
  unreadQuery = lastVisited
    ? unreadQuery.gt('last_inbound_at', lastVisited)
    : unreadQuery.not('last_inbound_at', 'is', null)
  const { count: unread } = await unreadQuery

  return { unassigned: unassigned || 0, unread: unread || 0 }
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

/** Clôture une conversation (statut 'fermee'). */
export async function closeConversation(conversationId, userId) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ status: 'fermee', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  await supabase.from('conversation_events').insert({
    conversation_id: conversationId, type: 'closed', by_user_id: userId,
  })
  return data
}

/** Renomme le client d'une conversation (utile quand on n'a que le numéro). */
export async function updateConversationClientName(conversationId, name) {
  const { data, error } = await supabase
    .from('conversations')
    .update({ client_name: name?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select(CONV_SEL)
    .single()
  if (error) throw error
  return data
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

export async function loadQuickReplies() {
  const { data, error } = await supabase
    .from('quick_replies').select('*').order('ordre').order('id')
  if (error) throw error
  return data || []
}

export async function createQuickReply(label, body, mediaPath = null) {
  const { data, error } = await supabase
    .from('quick_replies').insert({ label: label.trim(), body, media_path: mediaPath }).select().single()
  if (error) throw error
  return data
}

export async function updateQuickReply(id, label, body, mediaPath = null) {
  const { error } = await supabase
    .from('quick_replies').update({ label: label.trim(), body, media_path: mediaPath }).eq('id', id)
  if (error) throw error
}

export async function deleteQuickReply(id) {
  const { error } = await supabase.from('quick_replies').delete().eq('id', id)
  if (error) throw error
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

/** Liste des templates WhatsApp approuvés (via Wati). */
export async function fetchTemplates() {
  const res = await fetch('/api/wati-webhook?action=templates', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data.templates || []
}

/** Envoie un message template (initie une conversation). */
export async function sendTemplate({ clientPhone, templateName, broadcastName, parameters, userId }) {
  const res = await fetch('/api/wati-webhook?action=send-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPhone, templateName, broadcastName, parameters, userId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}

// ============================================================
// ENVOI (réponse d'un commercial)
// ============================================================

const MEDIA_BUCKET = 'conversation-media'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/**
 * Upload d'une pièce jointe (image ou PDF) dans le bucket privé.
 * Retourne le CHEMIN du fichier (on génère des URL signées à la demande).
 */
export async function uploadConversationMedia(file, userId) {
  if (!file) return null
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Fichier trop volumineux (max 5 MB)')
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
