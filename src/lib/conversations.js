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
