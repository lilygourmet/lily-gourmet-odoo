import { supabase } from './supabase'
import { createTask, uploadTaskAttachment } from './tasks'

// Comptes « responsables d'achat » (reçoivent la tâche).
export async function loadAcheteurs() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .eq('perm_achat', true)
    .eq('active', true)
  if (error) throw error
  return data || []
}

// Réponse déjà enregistrée pour cette commande (null si pas encore répondu).
export async function loadBesoinsAchat(orderNum) {
  if (!orderNum) return null
  const { data } = await supabase.from('besoins_achat').select('*').eq('order_num', orderNum).maybeSingle()
  return data || null
}

/**
 * Valide les besoins d'achat d'une commande.
 * items : [{ key, label, detail }] cochés (peut être vide = « rien de spécial »).
 * Si des items → crée une tâche URGENTE par responsable d'achat (échéance = date commande,
 * photo de la commande en pièce jointe si dispo). Puis mémorise → ne redemande plus.
 */
export async function submitBesoinsAchat({ user, order, items, photoUrl }) {
  if (!user?.id) throw new Error('Utilisateur manquant')
  const orderNum = order?.order_num
  if (!orderNum) throw new Error('Commande sans numéro')

  let firstTaskId = null
  let count = 0

  if (items.length > 0) {
    const acheteurs = await loadAcheteurs()
    if (acheteurs.length === 0) {
      throw new Error("Aucun responsable d'achat défini. Coche « Achat » sur un compte dans Utilisateurs.")
    }

    const who = user.full_name || user.username || 'Cake design'
    const dateStr = order.delivery_at
      ? new Date(order.delivery_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : '—'
    const dueDate = order.delivery_at ? String(order.delivery_at).slice(0, 10) : null
    const title = `🚨 Achats — ${orderNum}`
    const lignes = items.map(i => `• ${i.label}${i.detail ? ' : ' + i.detail : ''}`).join('\n')
    const description =
      `Demandé par : ${who}\n` +
      `Commande : ${orderNum}${order.client_name ? ' — ' + order.client_name : ''}\n` +
      `Date commande : ${dateStr} → à RECEVOIR AVANT\n\n` +
      `À acheter :\n${lignes}\n\n➡️ Prévoir un coursier si nécessaire.`

    // Photo de la commande en pièce jointe (uploadée une fois, réutilisée pour chaque tâche).
    let attachment = null
    if (photoUrl) {
      try {
        const resp = await fetch(photoUrl)
        const blob = await resp.blob()
        const file = new File([blob], `commande-${orderNum}.jpg`, { type: blob.type || 'image/jpeg' })
        attachment = await uploadTaskAttachment(file, user.id)
      } catch (e) { console.warn('[besoins-achat photo]', e?.message || e) }
    }

    for (const a of acheteurs) {
      const task = await createTask({ title, description, fromUserId: user.id, toUserId: a.id, isUrgent: true, dueDate, attachment })
      if (!firstTaskId && task?.id) firstTaskId = task.id
    }
    count = acheteurs.length
  }

  await supabase.from('besoins_achat').upsert({
    order_num: orderNum,
    items,
    task_id: firstTaskId,
    created_by: user.id,
    created_at: new Date().toISOString(),
  }, { onConflict: 'order_num' })

  return { count }
}
