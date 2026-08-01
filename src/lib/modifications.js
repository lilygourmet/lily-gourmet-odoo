import { supabase } from './supabase'

// ============================================================
// DEMANDES DE MODIFICATION DE COMMANDE
// Le commercial déclenche depuis une conversation (bouton « Modification »).
// L'équipe perm_modification les traite dans l'onglet « Modifications ».
// ============================================================

// `auto_odoo` = compte-rendu de ce que l'app a déjà fait toute seule dans Odoo
// (ordres de fabrication annulés). Champ à part : `description` part dans la
// notification WhatsApp, qui refuse les retours à la ligne.
export async function createModification({ order_ref, client_name, client_phone, conversation_id, requested_by, description = null, justificatif_path = null, auto_odoo = null }) {
  const { data, error } = await supabase
    .from('modifications')
    .insert({ order_ref, client_name, client_phone, conversation_id, requested_by, status: 'a_traiter', description, justificatif_path, auto_odoo })
    .select().single()
  if (error) throw error
  notifyModifUsers(data).catch(() => {})   // notif WhatsApp aux personnes désignées (non bloquant)
  return data
}

// Notif WhatsApp aux personnes « perm_notif_modif » — entièrement CÔTÉ SERVEUR
// (clé service = lecture fiable des profils + envoi robuste). Non bloquant.
// Renvoie { sent, total } (pour pouvoir afficher le résultat si besoin).
async function notifyModifUsers(modif) {
  try {
    const r = await fetch('/api/wati-webhook?action=notify-modif', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderRef: modif.order_ref, clientName: modif.client_name, description: modif.description }),
    })
    return await r.json().catch(() => ({}))
  } catch (e) { console.warn('[modif] notif WhatsApp:', e.message); return {} }
}

export async function loadModificationsATraiter() {
  const { data, error } = await supabase
    .from('modifications')
    .select('*')
    .eq('status', 'a_traiter')
    .order('requested_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function markModificationFaite(id, note, userId) {
  const { data, error } = await supabase
    .from('modifications')
    .update({ status: 'fait', note: note || null, done_by: userId, done_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function countModificationsATraiter() {
  const { count, error } = await supabase
    .from('modifications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'a_traiter')
  if (error) return 0
  return count || 0
}

// Historique : les modifications déjà traitées (les plus récentes d'abord).
export async function loadModificationsFaites(limit = 100) {
  const { data, error } = await supabase
    .from('modifications')
    .select('*')
    .eq('status', 'fait')
    .order('done_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
