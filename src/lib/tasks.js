import { supabase } from './supabase'

// ============================================================
// TÂCHES À FAIRE
// ============================================================

const SEL = `
  *,
  from_user:profiles!tasks_from_user_id_fkey(id, username, full_name),
  to_user:profiles!tasks_to_user_id_fkey(id, username, full_name)
`

const ATTACHMENT_BUCKET = 'task-attachments'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

// Modèle Wati générique pour notifier une nouvelle tâche (à valider dans Wati).
const WA_TASK_TEMPLATE = 'nouvelle_tache'

// Numéro au format international (Maroc : 0xxxxxxxxx -> 212xxxxxxxxx)
function normalizePhone(raw) {
  let n = String(raw || '').replace(/\D/g, '')
  if (!n) return ''
  if (n.startsWith('0')) n = '212' + n.slice(1)
  return n
}

// Notifie le destinataire d'une tâche par WhatsApp. Non bloquant.
// 1) Conversation ouverte (fenêtre 24 h) -> message de session (gratuit).
// 2) Sinon -> modèle Wati générique.
async function notifyTaskWhatsapp(toUserId, fromUserId, fromName, title) {
  try {
    const { data: u } = await supabase.from('profiles').select('whatsapp').eq('id', toUserId).maybeSingle()
    const phone = normalizePhone(u?.whatsapp)
    if (!phone) return
    const text = `📋 Nouvelle tâche${fromName ? ' de ' + fromName : ''} : ${title}`
    const { data: conv } = await supabase.from('conversations').select('id').eq('client_phone', phone).maybeSingle()
    if (conv?.id) {
      const r = await fetch('/api/wati-webhook?action=send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conv.id, clientPhone: phone, userId: fromUserId, text }),
      })
      if (r.ok) return
    }
    await fetch('/api/wati-webhook?action=send-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPhone: phone, templateName: WA_TASK_TEMPLATE, parameters: [{ name: '1', value: title }], userId: fromUserId }),
    }).catch(() => {})
  } catch (e) {
    console.warn('[tasks] WhatsApp notif:', e.message)
  }
}

/**
* Charge les tâches reçues par un user.
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
* Charge TOUTES les tâches (vue admin équipe), expéditeur + destinataire joints.
*/
export async function loadTeamTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select(SEL)
    .order('sent_at', { ascending: false })
    .limit(500)
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
*   - attachment (optionnel) : { path, name, size, type } — résultat de uploadTaskAttachment
*/
export async function createTask({ title, description, fromUserId, toUserId, isUrgent = false, attachment = null, dueDate = null }) {
  if (!title?.trim()) throw new Error('Le titre est obligatoire')
  if (!fromUserId) throw new Error('Expéditeur manquant')
  if (!toUserId) throw new Error('Destinataire manquant')

  const payload = {
    title: title.trim(),
    description: description?.trim() || null,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    is_urgent: !!isUrgent,
    status: 'todo',
    is_read: false,
    sent_at: new Date().toISOString(),
    due_date: dueDate || null,
  }
  if (attachment) {
    payload.attachment_path = attachment.path
    payload.attachment_name = attachment.name
    payload.attachment_size = attachment.size
    payload.attachment_type = attachment.type
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select(SEL)
    .single()
  if (error) throw error

  // Notif WhatsApp au destinataire (sauf si on se l'envoie à soi-même). Non bloquant.
  if (toUserId && toUserId !== fromUserId) {
    const fromName = data.from_user?.full_name || data.from_user?.username || ''
    notifyTaskWhatsapp(toUserId, fromUserId, fromName, payload.title)
  }

  return data
}

/**
* Marque une tâche comme lue.
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
*/
export async function undoTaskDone(taskId, currentUserId) {
  const { data: before, error: errBefore } = await supabase
    .from('tasks')
    .select('from_user_id, to_user_id')
    .eq('id', taskId)
    .single()
  if (errBefore) throw errBefore
  if (before.from_user_id !== currentUserId && before.to_user_id !== currentUserId) {
    throw new Error('Tu ne peux défaire que tes propres tâches (envoyées ou reçues)')
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
* Supprime aussi la pièce jointe associée si présente.
*/
export async function deleteTask(taskId, currentUserId) {
  const { data: before } = await supabase
    .from('tasks')
    .select('from_user_id, attachment_path')
    .eq('id', taskId)
    .single()
  if (before?.from_user_id !== currentUserId) {
    throw new Error('Seul l\'expéditeur peut supprimer une tâche')
  }
  // Supprimer la pièce jointe du bucket
  if (before?.attachment_path) {
    await deleteAttachment(before.attachment_path)
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

// ============================================================
// PIÈCES JOINTES
// ============================================================

/**
* Upload d'une pièce jointe pour une tâche.
* Retourne : { path, name, size, type }
*/
export async function uploadTaskAttachment(file, userId) {
  if (!file) return null
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`)
  }
  const ts = Date.now()
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${ts}_${cleanName}`

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error

  return {
    path,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
  }
}

/**
* Génère une URL signée pour télécharger une pièce jointe (60s).
*/
export async function getAttachmentURL(path) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60)
  if (error) throw error
  return data?.signedUrl || null
}

/**
* Supprime une pièce jointe du bucket.
*/
export async function deleteAttachment(path) {
  if (!path) return
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([path])
}

// ============================================================
// MODIFICATION D'UNE TÂCHE
// ============================================================

/**
* Modifier une tâche existante (expéditeur uniquement, statut != done).
* Incrémente edited_count et met à jour edited_at.
* Remet la tâche en non lu pour que le destinataire voie la modif.
*/
export async function updateTask(taskId, currentUserId, updates) {
  const { data: task, error: errFetch } = await supabase
    .from('tasks')
    .select('id, from_user_id, status, edited_count, attachment_path')
    .eq('id', taskId)
    .single()
  if (errFetch) throw errFetch

  if (task.from_user_id !== currentUserId) {
    throw new Error("Seul l'expéditeur peut modifier cette tâche")
  }
  if (task.status === 'done') {
    throw new Error("Impossible de modifier une tâche déjà faite")
  }

  // Si on remplace la pièce jointe, supprimer l'ancienne
  if (updates._replaceAttachment && task.attachment_path) {
    await deleteAttachment(task.attachment_path)
  }
  // Si on supprime la pièce jointe sans remplacement
  if (updates._removeAttachment && task.attachment_path) {
    await deleteAttachment(task.attachment_path)
    updates.attachment_path = null
    updates.attachment_name = null
    updates.attachment_size = null
    updates.attachment_type = null
  }
  delete updates._replaceAttachment
  delete updates._removeAttachment

  const payload = {
    ...updates,
    edited_at: new Date().toISOString(),
    edited_count: (task.edited_count || 0) + 1,
    is_read: false,
    read_at: null,
  }
  const { error } = await supabase.from('tasks').update(payload).eq('id', taskId)
  if (error) throw error
}
