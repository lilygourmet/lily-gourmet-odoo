import { supabase } from './supabase'

// ============================================================
// WATI INFO — envoyer une simple information par WhatsApp à 1+ personnes
// (≠ tâche). Même logique d'envoi que les tâches : conversation ouverte
// (message de session, gratuit) sinon modèle Wati « wati_info ».
// ============================================================

const WA_INFO_TEMPLATE = 'wati_info'

function normalizePhone(raw) {
  let n = String(raw || '').replace(/\D/g, '')
  if (!n) return ''
  if (n.startsWith('0')) n = '212' + n.slice(1)
  return n
}

// Envoie l'info à un user. Renvoie true si le message est parti.
async function sendInfoToUser(toUserId, fromUserId, message) {
  const { data: u } = await supabase.from('profiles').select('whatsapp').eq('id', toUserId).maybeSingle()
  const phone = normalizePhone(u?.whatsapp)
  if (!phone) return false
  const text = `📢 ${message}`
  const { data: conv } = await supabase.from('conversations').select('id').eq('client_phone', phone).maybeSingle()
  if (conv?.id) {
    const r = await fetch('/api/wati-webhook?action=send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conv.id, clientPhone: phone, userId: fromUserId, text }),
    })
    if (r.ok) return true
  }
  const r2 = await fetch('/api/wati-webhook?action=send-template', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPhone: phone, templateName: WA_INFO_TEMPLATE, parameters: [{ name: '1', value: message }], userId: fromUserId }),
  }).catch(() => null)
  return !!(r2 && r2.ok)
}

/**
 * Envoie une info à une liste de destinataires (ids profiles) + enregistre l'historique.
 * @returns {{ sent:number, total:number }}
 */
export async function sendWatiInfo({ message, recipientIds, cible, userId, userName }) {
  const msg = (message || '').trim()
  if (!msg) throw new Error('Le message est vide')
  if (!recipientIds?.length) throw new Error('Aucun destinataire')

  let sent = 0
  for (let i = 0; i < recipientIds.length; i += 8) {
    const chunk = recipientIds.slice(i, i + 8)
    const res = await Promise.all(chunk.map(uid => sendInfoToUser(uid, userId, msg).catch(() => false)))
    sent += res.filter(Boolean).length
  }

  await supabase.from('wati_infos').insert({
    sender_user_id: userId || null,
    sender_name: userName || null,
    message: msg,
    cible: cible || null,
    recipient_count: recipientIds.length,
  })

  return { sent, total: recipientIds.length }
}

/**
 * Groupes (définis côté Employés) + les comptes (profils) qui en font partie.
 * Membre d'un groupe = compte actif dont l'employé lié a ce groupe (repli : groupe du compte).
 * @returns {Promise<Array<{ nom:string, profileIds:string[] }>>}
 */
// Logique PURE (testée) : à partir des noms de groupes, des employés (id→groupe) et des
// profils, renvoie [{ nom, profileIds }] des groupes ayant au moins 1 membre actif.
// Le groupe d'un profil vient de SON employé (employe_id) ; repli sur profiles.groupe.
export function resolveGroupes({ groupeNames = [], employes = [], profiles = [] }) {
  const groupeByEmploye = new Map((employes || []).map(e => [e.id, e.groupe]))
  const membersByGroup = {}
  for (const p of (profiles || [])) {
    if (p.active === false) continue
    const g = (p.employe_id && groupeByEmploye.get(p.employe_id)) || p.groupe
    if (!g) continue
    ;(membersByGroup[g] || (membersByGroup[g] = [])).push(p.id)
  }
  const names = (groupeNames && groupeNames.length)
    ? groupeNames
    : Object.keys(membersByGroup).sort((a, b) => a.localeCompare(b))
  // On ne garde que les groupes ayant au moins un membre avec compte.
  return names.map(nom => ({ nom, profileIds: membersByGroup[nom] || [] })).filter(g => g.profileIds.length > 0)
}

export async function loadGroupesPourInfo() {
  const [groupesRes, empsRes, profsRes] = await Promise.all([
    supabase.from('employe_groupes').select('nom').order('sort', { ascending: true }).order('nom'),
    supabase.from('employes').select('id, groupe').not('groupe', 'is', null),
    supabase.from('profiles').select('id, employe_id, groupe, active'),
  ])
  return resolveGroupes({
    groupeNames: (groupesRes.data || []).map(g => g.nom),
    employes: empsRes.data || [],
    profiles: profsRes.data || [],
  })
}

export async function loadWatiInfos() {
  const { data, error } = await supabase
    .from('wati_infos').select('*')
    .order('sent_at', { ascending: false }).limit(50)
  if (error) throw error
  return data || []
}
