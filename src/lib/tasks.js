import { supabase } from './supabase'

// ============================================================
// TÂCHES À FAIRE
// ============================================================

const SEL = `
  *,
  from_user:profiles!tasks_from_user_id_fkey(id, username, full_name),
  to_user:profiles!tasks_to_user_id_fkey(id, username, full_name)
`

/**
 * Charge les tâches reçues par un user.
 * @param {string} userId
 * @param {string} statusFilter - 'todo' | 'done' | 'all'
 */
export async function loadTasksReceived(userId, statusFilter = 'all') {
  let query = supabase
    .from('tasks')
    .select(SEL)
    .eq('to_user_id', userId)
    .order('sent_at', { ascending: false })

  if (statusFilter !== 'all') query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Charge les tâches envoyées par un user.
 * @param {string} userId
 */
export async function loadTasksSent(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(SEL)
    .eq('from_user_id', userId)
    .order('sent_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Compte les tâches non lues pour un user (pour le badge header).
 */
export async function countUnreadTasks(userId) {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('to_user_id', userId)
    .eq('status', 'todo')
    .eq('is_read', false)
  if (error) throw error
  return count || 0
}

/**
 * Crée une nouvelle tâche.
 * @param {object} params
 *   - title (obligatoire)
 *   - description (optionnel)
 *   - fromUserId
 *   - toUserId
 *   - isUrgent (boolean)
 */
export async function createTask({ title, description, fromUserId, toUserId, isUrgent = false }) {
  if (!title?.trim()) throw new Error('Le titre est obligatoire')
  if (!fromUserId) throw new Error('Expéditeur manquant')
  if (!toUserId) throw new Error('Destinataire manquant')

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      is_urgent: !!isUrgent,
      status: 'todo',
      is_read: false,
      sent_at: new Date().toISOString(),
    })
    .select(SEL)
    .single()
  if (error) throw error
  return data
}

/**
 * Marque une tâche comme lue (uniquement si le user est le destinataire).
 * @param {number} taskId
 */
export async function markTaskRead(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('is_read', false)
    .select(SEL)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

/**
 * Marque une tâche comme faite.
 * @param {number} taskId
 */
export async function markTaskDone(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'done',
      done_at: new Date().toISOString(),
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select(SEL)
    .single()
  if (error) throw error
  return data
}

/**
 * Défaire une tâche (la remet en 'todo'). Seul l'expéditeur peut le faire.
 * @param {number} taskId
 * @param {string} currentUserId - le user qui fait l'action (pour vérifier qu'il est bien l'expéditeur)
 */
export async function undoTaskDone(taskId, currentUserId) {
  const { data: before, error: errBefore } = await supabase
    .from('tasks')
    .select('from_user_id')
    .eq('id', taskId)
    .single()
  if (errBefore) throw errBefore
  if (before.from_user_id !== currentUserId) {
    throw new Error('Seul l\'expéditeur peut défaire une tâche')
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'todo',
      done_at: null,
    })
    .eq('id', taskId)
    .select(SEL)
    .single()
  if (error) throw error
  return data
}

/**
 * Supprime une tâche (seul l'expéditeur peut le faire).
 */
export async function deleteTask(taskId, currentUserId) {
  const { data: before } = await supabase
    .from('tasks')
    .select('from_user_id')
    .eq('id', taskId)
    .single()
  if (before?.from_user_id !== currentUserId) {
    throw new Error('Seul l\'expéditeur peut supprimer une tâche')
  }
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

/**
 * Charge tous les users (pour le sélecteur de destinataire).
 */
export async function loadAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .order('username')
  if (error) throw error
  return data || []
}
