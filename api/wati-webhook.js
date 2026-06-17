// /api/wati-webhook.js
// Webhook entrant Wati : Wati appelle cette URL automatiquement à chaque
// message WhatsApp. On enregistre le message dans Supabase (find-or-create du
// fil par numéro). PAS d'envoi ici (phase 2).
//
// Sécurité : un mot de passe secret doit être passé dans l'URL configurée chez
// Wati, ex : https://<app>.vercel.app/api/wati-webhook?token=XXXX
// (ou en-tête x-wati-token). Variable d'env Vercel : WATI_WEBHOOK_SECRET.
//
// ⚠️ HYPOTHÈSES sur le format Wati (à confirmer au 1er vrai message) :
//   - waId        : numéro WhatsApp du client (présent entrant ET sortant)
//   - senderName  : nom du contact
//   - text        : texte du message
//   - type        : 'text' | 'image' | 'document' | 'audio' | ...
//   - data        : URL du média si type != text
//   - id          : id WhatsApp du message (dédoublonnage)
//   - timestamp   : epoch (secondes le plus souvent)
//   - owner       : true = message ENVOYÉ par l'entreprise via Wati, false/absent = reçu du client
// Si Wati renvoie d'autres noms de champs, on ajuste les fallbacks ci-dessous.

import { createClient } from '@supabase/supabase-js'
import { sendPushToTargets } from './push.js'
import crypto from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.query?.action !== 'task-reminders' && req.query?.action !== 'fetch-photo' && req.query?.action !== 'conges-notif') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' })
  }

  // Rappels quotidiens : déclenché par le cron Vercel (méthode GET autorisée).
  if (req.query?.action === 'task-reminders') return handleTaskReminders(req, res)

  // Aiguillage selon ?action= ; sans action = réception entrante (appel de Wati)
  const action = req.query?.action
  if (action === 'login') return handleLogin(req, res)
  if (action === 'send') return handleSend(req, res)
  if (action === 'templates') return handleTemplates(req, res)
  if (action === 'send-template') return handleSendTemplate(req, res)
  if (action === 'search-orders') return handleSearchOrders(req, res)
  if (action === 'order-note') return handleOrderNote(req, res)
  if (action === 'orders-notes') return handleOrdersNotes(req, res)
  if (action === 'cd-load') return handleCdLoad(req, res)
  if (action === 'cd-slot') return handleCdSlot(req, res)
  if (action === 'notify-modif') return handleNotifyModif(req, res)
  if (action === 'client-cd-count') return handleClientCdCount(req, res)
  if (action === 'clients-cd-counts') return handleClientsCdCounts(req, res)
  if (action === 'order-clients') return handleOrderClients(req, res)
  if (action === 'invoice-pdf') return handleInvoicePdf(req, res)
  if (action === 'invoices-search') return handleInvoicesSearch(req, res)
  if (action === 'devis-list') return handleDevisList(req, res)
  if (action === 'devis-confirm') return handleDevisConfirm(req, res)
  if (action === 'devis-cancel') return handleDevisCancel(req, res)
  if (action === 'devis-restore') return handleDevisRestore(req, res)
  if (action === 'product-labels') return handleProductLabels(req, res)
  if (action === 'product-labels-group') return handleProductLabelsGroup(req, res)
  if (action === 'orders-confirmed') return handleOrdersConfirmed(req, res)
  if (action === 'devis-photos') return handleDevisPhotos(req, res)
  if (action === 'suggest') return handleSuggest(req, res)
  if (action === 'correct') return handleCorrect(req, res)
  if (action === 'delete-message') return handleDeleteMessage(req, res)
  if (action === 'fetch-photo') return handleFetchPhoto(req, res)
  if (action === 'conges-notif') return handleCongesNotif(req, res)
  if (action === 'order-catalog') return handleOrderCatalog(req, res)
  if (action === 'order-product') return handleOrderProduct(req, res)
  if (action === 'order-product-search') return handleOrderProductSearch(req, res)
  if (action === 'order-clients-search') return handleOrderClientsSearch(req, res)
  if (action === 'order-create-client') return handleOrderCreateClient(req, res)
  if (action === 'order-create-devis') return handleOrderCreateDevis(req, res)
  if (action === 'order-create-ocp') return handleOrderCreateOcp(req, res)
  if (action === 'order-sizes') return handleOrderSizes(req, res)
  if (action === 'order-warehouses') return handleOrderWarehouses(req, res)
  if (action === 'order-set-warehouse') return handleSetWarehouse(req, res)
  if (action === 'vitrine-reserved') return handleVitrineReserved(req, res)
  if (action === 'vitrine-reservations') return handleVitrineReservations(req, res)
  if (action === 'order-line') return handleOrderLine(req, res)
  if (action === 'count-devis-internet') return handleCountDevisInternet(req, res)
  return handleInbound(req, res)
}

// ============================================================
// CONNEXION SÉCURISÉE (?action=login) — vérifie les identifiants (verify_login)
// puis renvoie un JWT signé avec le secret JWT du projet (pour resserrer la RLS).
// ============================================================
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}
async function handleLogin(req, res) {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!jwtSecret) return res.status(500).json({ error: 'SUPABASE_JWT_SECRET manquant' })
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' })
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
    const { data, error } = await supabase.rpc('verify_login', {
      p_username: String(username).trim().toLowerCase(),
      p_password: password,
    })
    if (error) throw error
    if (!data || data.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' })
    const user = data[0]
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt({
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      app_role: user.role || null,
      iat: now,
      exp: now + 60 * 60 * 12,
    }, jwtSecret)
    return res.status(200).json({ user, token })
  } catch (e) {
    console.error('[login]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// ============================================================
// RÉCEPTION — Wati appelle cette URL (protégé par token dans l'URL)
// ============================================================
async function handleInbound(req, res) {
  // --- Sécurité : mot de passe partagé ---
  const secret = process.env.WATI_WEBHOOK_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'WATI_WEBHOOK_SECRET non configuré' })
  }
  const token = req.query?.token || req.headers['x-wati-token']
  if (token !== secret) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const p = req.body || {}

  // --- Extraction des champs (avec fallbacks défensifs) ---
  const phone = p.waId || p.phone || p.whatsappNumber || null
  const name = p.senderName || p.name || null
  const body = p.text || p.body || p.message || null
  const type = p.type || 'text'
  const mediaUrl = type !== 'text' ? (p.data || p.mediaUrl || null) : null
  const waMsgId = p.id || p.whatsappMessageId || p.messageId || null
  const sentAt = parseTimestamp(p.timestamp || p.created)
  const senderType = p.owner === true ? 'agent' : 'client'

  // Événement sans contenu = souvent un accusé de réception WhatsApp
  // (sent/delivered/read/failed) : pas de message à enregistrer, mais on met à
  // jour le statut de réception du message concerné.
  if (!phone || (!body && !mediaUrl)) {
    try {
      const supa = createClient(supabaseUrl, supabaseServiceKey)
      await maybeUpdateDeliveryStatus(supa, p)
    } catch (e) { console.warn('[delivery-status]', e?.message || e) }
    return res.status(200).json({ ok: true, ignored: true })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const conv = await getOrCreateConversation(supabase, phone, name)

    // Anti-doublon : Wati renvoie aussi nos propres messages sortants (owner=true).
    // Si l'app les a déjà enregistrés (sender_user_id rempli, récent), on ignore l'écho.
    if (senderType === 'agent') {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      let dupQuery = supabase.from('messages').select('id')
        .eq('conversation_id', conv.id)
        .in('sender_type', ['agent', 'system'])
        .gte('created_at', since)
      dupQuery = body
        ? dupQuery.eq('body', body)
        : dupQuery.is('body', null).not('media_url', 'is', null)
      const { data: dup } = await dupQuery.limit(1)
      if (dup && dup.length > 0) return res.status(200).json({ ok: true, echoSkipped: true })
    }

    // Média entrant : le lien Wati exige le token -> on télécharge et on ré-héberge.
    let storedMedia = mediaUrl
    if (mediaUrl) {
      const rehosted = await rehostWatiMedia(supabase, mediaUrl)
      if (rehosted) storedMedia = rehosted
    }

    // Insère le message (dédoublonné sur wa_message_id si Wati renvoie le webhook)
    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: senderType,
      body: body || null,
      media_url: storedMedia || null,
      media_type: (mediaUrl && type && type !== 'text') ? type : null,
      sent_at: sentAt,
      wa_message_id: waMsgId || null,
    })
    if (msgErr) {
      if (msgErr.code === '23505') {
        return res.status(200).json({ ok: true, duplicate: true })
      }
      throw msgErr
    }

    // Met à jour le fil : date du dernier message (+ dernier reçu si entrant)
    const patch = { last_message_at: sentAt, updated_at: new Date().toISOString() }
    if (senderType === 'client') {
      patch.last_inbound_at = sentAt
      // Compteur "non lus" type WhatsApp : +1 à chaque message client.
      patch.unread_count = (conv.unread_count || 0) + 1
      // Un message client rouvre une conversation fermée → elle redevient
      // "à prendre" (non assignée) pour forcer quelqu'un à la reprendre.
      if (conv.status === 'fermee') { patch.status = 'non_assignee'; patch.assigned_to = null }
    }
    if (!conv.client_name && name) patch.client_name = name
    await supabase.from('conversations').update(patch).eq('id', conv.id)

    // Notif push aux users ayant accès aux Conversations (entrant client seulement).
    // Le push ne doit jamais faire échouer le webhook -> on isole avec catch.
    if (senderType === 'client') {
      await notifyConversationUsers(supabase, conv.id, name || conv.client_name || phone, body, mediaUrl)
        .catch(e => console.warn('[wati push]', e?.message || e))
    }

    // Auto-réponses : (1) message d'absence hors horaires (une seule fois par période
    // fermée), sinon (2) réponses par mot-clé (RIB, etc.). Sur message client texte.
    let autoReplied = false
    if (senderType === 'client' && body) {
      autoReplied = await maybeClosedAutoReply(supabase, conv, phone)
        .catch(e => { console.warn('[closed-reply]', e?.message || e); return false })
      if (!autoReplied) {
        autoReplied = await maybeAutoReply(supabase, conv, phone, body)
          .catch(e => { console.warn('[auto-reply]', e?.message || e); return false })
      }
    }

    // (Brouillon de réponse IA à la réception : DÉSACTIVÉ — coûtait un appel IA par
    // message reçu. La correction et « suggérer 3 réponses » restent, à la demande.)

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[wati-webhook]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// ============================================================
// AUTO-RÉPONSES — déclenchées par mot-clé sur un message client.
// Le texte vient des "réponses rapides" (quick_replies) → modifiable dans l'app.
// Ajouter une règle = une ligne { quickReplyId, test }.
// `test` = regex ; \b...\b = mot entier (donc "votre rib" OK, "terrible" non).
// ============================================================
// `test` = déclenche ; `exclude` (optionnel) = empêche si le client parle d'AUTRE chose
// (ex : « je vous envoie MON rib » -> on ne renvoie pas notre RIB).
const AUTO_RULES = [
  // [1] RIB / virement — si le client veut payer par virement.
  // Exclut : son propre rib ("mon rib") + virement DÉJÀ effectué ("j'ai fait le virement").
  { quickReplyId: 1,  test: /\b(rib|iban|virement)\b|compte\s+bancaire|coordonn[ée]es?\s+bancaires?|num[ée]ro\s+de\s+compte/i, exclude: /\bmon\s+(rib|iban|compte)\b|(virement|paiement)\s+(fait|effectu|envoy|valid|pass|re[çc]u)|\b(ai|avons|a)\s+(fait|effectu|envoy|pay|valid|re[çc]u)|d[ée]j[àa]\s+(fait|pay|envoy)/i },
  // [19] Localisation / adresse — pas si le client envoie LA SIENNE.
  { quickReplyId: 19, test: /\b(localisation|localis|adresse|maps?|o[uù]\s+(êtes|etes)|vous\s+(êtes|etes)\s+o[uù]|fin\s+kayn|win\s+kayn)\b/i, exclude: /\b(ma|mon|notre)\s+(localisation|adresse)\b|voici\s+ma\s+localis|je\s+vous\s+(donne|envoie)\s+(ma|mon)/i },
  // [27] Livraison (zones validées)
  { quickReplyId: 27, test: /\b(livraison|livrer|livrez|livr[ée]e?|tawsil|tawssil|توصيل)\b/i },
  // [28] Horaires d'ouverture. "ferme" seul (gâteau ferme) exclu : on exige une
  // forme conjuguée (fermez/fermer/fermes/fermé/fermés...), pas le nom "ferme".
  { quickReplyId: 28, test: /\bhoraire|\bouvert|\bouvr|\bferm(é|ée|ées|és|ez|er|es|ent)|مفتوح|الوقت/i },
]

// Message d'absence hors horaires (ouvert 10h–20h, heure du Maroc). Envoyé UNE seule
// fois par période fermée (≈ 14h) pour ne pas re-spammer le client à chaque message.
const CLOSED_MESSAGE = `Merci pour votre message et pour l'intérêt que vous portez à nos créations 🥰🍰

Nous sommes actuellement fermés. Notre équipe vous répondra dès l'ouverture, tous les jours de 10h à 20h.

Pour passer commande, vous pouvez créer une demande de devis directement sur notre site, on vous contactera au plus vite :
🔗 https://lily-gourmet.com

Pour une commande urgente, merci de nous appeler à partir de 10h, nous serons heureux de vous servir selon nos disponibilités :
📞 0667-873258, 0670-055833 ou au 0537-653186`

function moroccoHour() {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', hourCycle: 'h23' }).format(new Date())
  return parseInt(h, 10)
}

// Renvoie true si le message d'absence a été envoyé (donc fermé + pas déjà envoyé).
async function maybeClosedAutoReply(supabase, conv, phone) {
  const h = moroccoHour()
  if (Number.isNaN(h) || (h >= 10 && h < 20)) return false   // ouvert 10h–20h → rien
  // Une seule fois par période fermée : pas de renvoi si déjà envoyé dans les 14 dernières heures.
  const since = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('messages').select('id')
    .eq('conversation_id', conv.id).eq('sender_type', 'system').eq('body', CLOSED_MESSAGE)
    .gte('created_at', since).limit(1)
  if (recent && recent.length) return false
  await sendAutoReply(supabase, conv, phone, CLOSED_MESSAGE)
  return true
}

// Renvoie true si une auto-réponse a bien été envoyée (sert à ne pas préparer
// de brouillon IA quand le client a déjà reçu sa réponse automatiquement).
async function maybeAutoReply(supabase, conv, phone, body) {
  for (const rule of AUTO_RULES) {
    if (!rule.test.test(body)) continue
    if (rule.exclude && rule.exclude.test(body)) continue
    const { data: qr } = await supabase
      .from('quick_replies').select('body').eq('id', rule.quickReplyId).maybeSingle()
    if (!qr?.body) return false
    // Anti-spam : pas la même auto-réponse 2x dans la conversation en moins de 10 min.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('messages').select('id')
      .eq('conversation_id', conv.id).eq('sender_type', 'system').eq('body', qr.body)
      .gte('created_at', since).limit(1)
    if (recent && recent.length) return false
    await sendAutoReply(supabase, conv, phone, qr.body)
    return true  // une seule auto-réponse par message
  }
  return false
}

async function sendAutoReply(supabase, conv, phone, text) {
  const apiToken = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (!apiToken || !apiEndpoint) return
  const number = String(phone).replace(/\D/g, '')
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  const url = `${base}/api/v1/sendSessionMessage/${number}?${new URLSearchParams({ messageText: text })}`
  const r = await fetch(url, { method: 'POST', headers: { Authorization: authHeader, Accept: 'application/json' } })
  if (!r.ok) { console.warn('[auto-reply] WATI status', r.status); return }
  const now = new Date().toISOString()
  await supabase.from('messages').insert({
    conversation_id: conv.id, sender_type: 'system', body: text, sent_at: now,
  })
  await supabase.from('conversations')
    .update({ last_message_at: now, updated_at: now }).eq('id', conv.id)
}

// ============================================================
// ACCUSÉS DE RÉCEPTION WhatsApp (sent / delivered / read / failed)
// Wati envoie des événements de statut sans contenu. On retrouve le message
// sortant par son id Wati (wa_message_id) et on met à jour delivery_status.
// ============================================================
const DELIVERY_RANK = { sent: 1, delivered: 2, read: 3 }

// Déduit { status, msgId } d'un événement Wati, ou null si ce n'est pas un statut.
function extractDeliveryStatus(p) {
  const raw = `${p.eventType || ''} ${p.type || ''} ${p.statusString || ''} ${p.status || ''} ${p.ackType || ''}`.toLowerCase()
  let status = null
  if (/fail|undeliver|error/.test(raw)) status = 'failed'
  else if (/read|seen/.test(raw)) status = 'read'
  else if (/deliver/.test(raw)) status = 'delivered'
  else if (/\bsent\b/.test(raw)) status = 'sent'
  if (!status) return null
  const msgId = p.whatsappMessageId || p.whatsapp_message_id || p.messageId || p.id || null
  return { status, msgId }
}

async function maybeUpdateDeliveryStatus(supabase, p) {
  const info = extractDeliveryStatus(p)
  if (!info) return
  if (!info.msgId) { console.warn('[delivery-status] statut sans id :', JSON.stringify(p).slice(0, 300)); return }
  const { data: msg } = await supabase
    .from('messages').select('id, delivery_status')
    .eq('wa_message_id', info.msgId).maybeSingle()
  if (!msg) { console.warn('[delivery-status] message introuvable, wa_message_id =', info.msgId); return }
  // failed l'emporte (sauf si déjà lu) ; sinon on ne redescend jamais (sent<delivered<read).
  if (info.status !== 'failed') {
    if ((DELIVERY_RANK[info.status] || 0) <= (DELIVERY_RANK[msg.delivery_status] || 0)) return
  } else if (msg.delivery_status === 'read') return
  await supabase.from('messages').update({ delivery_status: info.status }).eq('id', msg.id)
}

// ============================================================
// ENVOI — réponse d'un commercial (?action=send), appelé par l'app
// ============================================================
async function handleSend(req, res) {
  const apiToken = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (!apiToken || !apiEndpoint) {
    return res.status(500).json({ error: 'WATI_API_TOKEN / WATI_API_ENDPOINT manquant' })
  }

  const { conversationId, clientPhone, userId, text, mediaPath, mediaType } = req.body || {}
  if (!conversationId || !clientPhone || !userId) {
    return res.status(400).json({ error: 'conversationId, clientPhone, userId requis' })
  }
  if (!text && !mediaPath) {
    return res.status(400).json({ error: 'texte ou pièce jointe requis' })
  }

  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // SÉCURITÉ anti-fuite : le destinataire est TOUJOURS le téléphone de CETTE conversation
  // (source de vérité), jamais le clientPhone reçu — qui peut être périmé si l'app a changé
  // de conversation entre-temps (sinon le message partait chez le mauvais client).
  let recipient = clientPhone
  try {
    const { data: convRow } = await supabase.from('conversations').select('client_phone').eq('id', conversationId).maybeSingle()
    if (convRow?.client_phone) recipient = convRow.client_phone
  } catch { /* repli sur clientPhone */ }
  const number = String(recipient).replace(/\D/g, '') // chiffres uniquement (garde l'indicatif)

  try {
    // Si pièce jointe : URL signée temporaire pour que Wati puisse la récupérer
    let fileUrl = null
    if (mediaPath) {
      const { data, error } = await supabase.storage
        .from('conversation-media')
        .createSignedUrl(mediaPath, 3600)
      if (error) throw error
      fileUrl = data?.signedUrl
    }

    // Appel Wati
    let watiUrl
    if (fileUrl) {
      const qs = new URLSearchParams({ fileUrl })
      if (text) qs.set('caption', text)
      watiUrl = `${base}/api/v1/sendSessionFileViaUrl/${number}?${qs.toString()}`
    } else {
      const qs = new URLSearchParams({ messageText: text })
      watiUrl = `${base}/api/v1/sendSessionMessage/${number}?${qs.toString()}`
    }
    console.log(`[WATI session] to ${number} · ${fileUrl ? 'file' : 'text'} · url ${watiUrl.split('?')[0]}`)
    const watiRes = await fetch(watiUrl, {
      method: 'POST',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    const rawBody = await watiRes.text()
    let watiData = {}
    try { watiData = JSON.parse(rawBody) } catch { /* réponse non JSON */ }
    console.log('[WATI session] status', watiRes.status, '· body', rawBody)
    if (!watiRes.ok || watiData?.result === false) {
      const msg = watiData?.info || watiData?.message || rawBody || `erreur ${watiRes.status}`
      return res.status(502).json({ error: `Envoi WhatsApp refusé : ${msg}` })
    }

    // Enregistre le message (sortant) côté Supabase
    const sentAt = new Date().toISOString()
    const { data: msg, error: insErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_user_id: userId,
        body: text || null,
        media_url: mediaPath || null,
        media_type: mediaType || null,
        sent_at: sentAt,
        wa_message_id: watiData?.id || watiData?.messageId || null,
        delivery_status: 'sent',
      })
      .select('*, sender:profiles!messages_sender_user_id_fkey(id, username, full_name)')
      .single()
    if (insErr) throw insErr

    // On met à jour la date du dernier message mais on NE change PAS le statut.
    // Si la conversation était fermée, elle reste fermée : on n'embête pas
    // les commerciaux avec un fil refermé. Seul un message entrant du client
    // (géré dans handleInbound) la rouvrira automatiquement.
    await supabase.from('conversations')
      .update({ last_message_at: sentAt, updated_at: sentAt, suggested_reply: null, unread_count: 0, marked_unread: false })
      .eq('id', conversationId)

    // Clôture automatique : si le message contient la phrase de confirmation
    // de commande ("...commande numéro XXXX a bien été confirmée..."), on ferme
    // la conversation. Insensible aux accents/majuscules ; le numéro est libre.
    const norm = (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (/commande\s+numero\s+\S+\s+a\s+bien\s+ete\s+confirme/.test(norm)) {
      await supabase.from('conversations')
        .update({ status: 'fermee', assigned_to: null, updated_at: sentAt })
        .eq('id', conversationId)
      await supabase.from('conversation_events').insert({
        conversation_id: conversationId, type: 'closed', by_user_id: userId,
      })
    }

    return res.status(200).json({ ok: true, message: msg })
  } catch (e) {
    console.error('[wati-send]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// ============================================================
// SUGGESTIONS IA (action=suggest) — 3 réponses via Claude Haiku
// ============================================================
const SUGGEST_SYSTEM = `Tu es l'assistante commerciale virtuelle de Lily Gourmet, une pâtisserie et traiteur marocain artisanal de qualité. Le ton de la marque est chaleureux, féminin, classe, avec une touche marocaine authentique.

Tu vas recevoir une conversation WhatsApp entre un client et une commerciale. Ta mission : proposer 3 réponses possibles que la commerciale pourrait envoyer. La réponse doit traiter TOUS les points et toutes les questions que le client a posés et qui n'ont pas encore reçu de réponse — pas seulement sa dernière ligne. S'il a envoyé plusieurs messages ou plusieurs questions d'affilée, réponds à chacun (une phrase courte par point).

Les 3 réponses doivent avoir 3 tons différents :
1. FORMELLE : vouvoiement, professionnelle, phrases complètes, polie
2. AMICALE : chaleureuse, peut utiliser un emoji 🌸 ou 💖, ton Lily Gourmet (vouvoiement chaleureux ou tutoiement selon le contexte de la conversation)
3. DIRECTE : courte (1-2 phrases max), va droit au but, mais reste polie

Tailles des gâteaux selon le nombre de personnes (table FIXE — donne exactement ces tailles, n'invente JAMAIS une autre combinaison). Les nombres en cm sont des diamètres :
- 5 personnes : 1 étage de 15 cm.
- 10 personnes : 1 étage de 20 cm.
- 15 personnes : 1 étage de 25 cm, OU 2 étages 15 + 20 cm.
- 20 personnes : 1 étage de 30 cm, OU 2 étages 15 + 25 cm.
- 25 personnes : impossible sur 1 seul étage → 2 étages 20 + 25 cm.
- 30 personnes : 1 étage de 35 cm, OU 2 étages 20 + 30 cm, OU 3 étages 15 + 20 + 25 cm.
- Pour un nombre non listé (ex. 12, 40 pers…) ou au-delà de 30 personnes, ne devine pas : propose de vérifier la taille exacte avec l'équipe.
- La taille est une info fixe : tu peux la donner avec assurance. En revanche le PRIX et la DATE doivent toujours être vérifiés avant d'être confirmés.

Parfums des gâteaux d'anniversaire (cake design) : Vanille, Chocolat, Praliné chocolaté, Praliné amandes caramélisées, Citron, Oreo.
- Option Fraisier EN CAKE DESIGN (parfum d'un gâteau d'anniversaire) possible, MAIS dans ce cas le retrait se fait obligatoirement APRÈS 16 h (les fraises arrivent parfois en retard, ce qui peut ralentir toute la préparation) — précise-le à la cliente si elle choisit le parfum fraisier.
- ATTENTION à ne pas confondre : l'ENTREMETS Fraisier (qui n'est PAS un cake design) se récupère, lui, à partir de 13 h (et non 16 h).

Prix des gâteaux d'anniversaire (cake design) : les prix de la liste « PRIX OFFICIELS » sont des prix « À PARTIR DE » (prix de départ), pas des prix fixes. Le tarif final dépend du design, du niveau de détail des décorations, des finitions et du temps de travail. Annonce donc toujours un prix de cake design avec « à partir de » (ex. : 5 personnes à partir de 300 DH), et précise que le prix exact dépend du modèle souhaité.
- IMPORTANT — photo déjà envoyée : si le client a DÉJÀ envoyé une photo (tu verras « [photo envoyée] » dans la conversation), NE lui redemande JAMAIS la photo. Au contraire, accuse réception (« Merci pour la photo »), donne un prix « à partir de » selon le nombre de personnes, explique que le prix exact dépend du design de ce modèle, et propose de revenir vers lui rapidement avec un devis précis (ou de préciser le nombre de personnes / la date). N'invente pas d'horaire d'appel et n'ajoute pas d'info hors sujet.
- Seulement si AUCUNE photo n'a encore été envoyée : invite la cliente à envoyer la photo / le modèle qui lui plaît pour un devis précis.

Pièce montée : le prix ne dépend pas seulement du nombre de personnes, mais surtout du design, du niveau de détail, du temps de travail, du nombre d'étages, et du choix d'un gâteau entièrement comestible, entièrement faux, ou avec quelques faux étages. Comme il y a plusieurs options, ne donne PAS de prix : propose plutôt un rendez-vous sur place pour bien cerner le besoin, et invite la cliente à envoyer à l'avance les modèles qui lui plaisent (on lui dira ce qui est réalisable et ce qui ne l'est pas).

Règles importantes :
- Quand un client exprime l'envie de commander (ex. « je veux passer une commande », « je veux un gâteau ») : accueille-le avec chaleur et enthousiasme (ex. « Avec grand plaisir ! 🌸 »), puis enchaîne pour faire avancer la commande en demandant gentiment les infos utiles — pour quelle occasion, combien de personnes, quel parfum et pour quelle date — en 1 à 2 phrases, sans noyer la cliente sous les questions.
- Adapte le contenu au contexte (commande, devis, livraison, plainte, question générale...)
- Si le client demande un prix : utilise EXCLUSIVEMENT la liste « PRIX OFFICIELS » fournie plus bas. Ne JAMAIS inventer un montant. Si le produit n'y figure pas (ou pièce montée sur mesure), propose de vérifier et de revenir vers lui
- Si le client demande une date, ne JAMAIS confirmer une date sans vérification — propose de vérifier le planning
- Langue de la réponse : réponds dans la langue du dernier message du client. UNIQUE EXCEPTION : la darija marocaine (arabe dialectal, en lettres latines OU arabes) → réponds en FRANÇAIS. Si c'est de l'arabe classique / standard (fusha, arabe littéraire) → réponds en arabe classique. Les autres langues (français, anglais…) → réponds dans cette langue. Tu comprends toujours le message quelle que soit la langue.
- Reste fidèle à l'image Lily Gourmet : artisanale, qualité, chaleureuse`

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tone: { type: 'string', enum: ['formelle', 'amicale', 'directe'] },
          text: { type: 'string' },
        },
        required: ['tone', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
}

// Marqueur lisible d'une pièce jointe, pour que l'IA (qui ne voit pas les images)
// sache qu'une photo / un doc a été envoyé et ne le redemande pas.
function mediaTag(mediaType) {
  if (/image/i.test(mediaType || '')) return '[photo envoyée]'
  if (/audio|voice/i.test(mediaType || '')) return '[message vocal envoyé]'
  if (/video/i.test(mediaType || '')) return '[vidéo envoyée]'
  if (/doc|pdf/i.test(mediaType || '')) return '[document envoyé]'
  return '[pièce jointe]'
}

function parseSuggestions(text) {
  if (!text) return []
  let t = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
  try {
    const obj = JSON.parse(t)
    return Array.isArray(obj.suggestions) ? obj.suggestions : []
  } catch (_) { return [] }
}

// Liste des PRIX OFFICIELS depuis Odoo (= le site). Variantes vendables/publiées,
// regroupées par taille (le parfum ne change pas le prix). Le chiffre entre
// parenthèses dans le nom = nombre de personnes. Cache 1h (les prix bougent peu).
let _priceCache = { text: null, at: 0 }
const PRICE_TTL_MS = 60 * 60 * 1000
async function getCatalogPriceList() {
  if (_priceCache.text !== null && (Date.now() - _priceCache.at) < PRICE_TTL_MS) return _priceCache.text
  try {
    const uid = await odooAuthenticate()
    const tmpls = await odooSearchRead(uid, 'product.template',
      [['is_published', '=', true], ['sale_ok', '=', true]], ['id', 'name'])
    const nameById = new Map((tmpls || []).map(t => [t.id, t.name]))
    const ids = (tmpls || []).map(t => t.id)
    if (!ids.length) { _priceCache = { text: '', at: Date.now() }; return '' }
    const vars = await odooSearchRead(uid, 'product.product',
      [['product_tmpl_id', 'in', ids], ['active', '=', true]],
      ['product_tmpl_id', 'lst_price', 'product_template_attribute_value_ids'], { limit: 2000 })
    const ptavIds = [...new Set((vars || []).flatMap(v => v.product_template_attribute_value_ids || []))]
    const ptav = ptavIds.length
      ? await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
          'product.template.attribute.value', 'read', [ptavIds, ['name', 'attribute_id']]])
      : []
    const ptavMap = new Map((ptav || []).map(a => [a.id, { name: a.name, attr: Array.isArray(a.attribute_id) ? a.attribute_id[1] : '' }]))
    const seen = new Set()
    const lines = []
    for (const v of (vars || [])) {
      if (!(v.lst_price > 0)) continue
      const raw = nameById.get(Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id) || ''
      const tname = raw.replace(/^[A-Z]{1,3}[-.]\s*/, '').trim()   // retire le préfixe interne (E-, CD-, GS-…)
      const vals = (v.product_template_attribute_value_ids || []).map(id => ptavMap.get(id)).filter(Boolean)
      const sizeVal = vals.find(x => /person|taille|pers|nombre|portion|pi[eè]ce|cm/i.test(x.attr)) || vals.find(x => /^\d+$/.test((x.name || '').trim()))
      const line = sizeVal ? `${tname} (${sizeVal.name}) = ${v.lst_price} DH` : `${tname} = ${v.lst_price} DH`
      if (!seen.has(line)) { seen.add(line); lines.push(line) }
    }
    lines.sort()
    _priceCache = { text: lines.join('\n'), at: Date.now() }
    return _priceCache.text
  } catch (e) {
    console.warn('[catalog-prices]', e?.message || e)
    return _priceCache.text || ''   // repli sur l'ancien cache si dispo
  }
}

// Construit la consigne IA : prix officiels (Odoo/site) + phrases types réelles de
// la commerciale (table quick_replies), pour le ton, les formulations et les infos.
async function buildSuggestSystem(supabase) {
  let sys = SUGGEST_SYSTEM
  const prices = await getCatalogPriceList()
  if (prices) {
    sys += `\n\nPRIX OFFICIELS (catalogue du site Lily Gourmet — source unique des prix). Le nombre entre parenthèses dans le nom = nombre de personnes. Quand le client demande le prix d'un produit présent ici, donne CE prix exact avec assurance. Si le produit n'est PAS dans cette liste (ou pièce montée sur mesure), ne donne PAS de prix : propose de vérifier.\n${prices}`
  }
  let examples = ''
  try {
    const { data: qrs } = await supabase
      .from('quick_replies').select('label, body').order('ordre').order('id')
    examples = (qrs || [])
      .filter(q => q.body && q.body.trim())
      .map(q => `• ${q.label} : ${q.body.trim()}`)
      .join('\n')
  } catch (_) { /* sans exemples si la table est indisponible */ }
  if (!examples) return sys
  return sys + `\n\nVoici les phrases types réellement utilisées par la commerciale. Inspire-toi de ce ton, de ces formulations et de ces informations quand c'est pertinent (ne les recopie pas mot pour mot si ça ne colle pas exactement au message du client) :\n${examples}`
}

async function handleSuggest(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquant' })

  const { conversation_id, userId } = req.body || {}
  if (!conversation_id || !userId) {
    return res.status(400).json({ error: 'conversation_id et userId requis' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Droit d'accès : admin ou perm_conversations
  const { data: profile } = await supabase
    .from('profiles').select('role, perm_conversations').eq('id', userId).maybeSingle()
  if (!profile || (profile.role !== 'admin' && profile.perm_conversations !== true)) {
    return res.status(403).json({ error: 'non autorisé' })
  }

  // 20 derniers messages, remis en ordre chronologique
  const { data: msgs, error } = await supabase
    .from('messages')
    .select('sender_type, body, media_url, media_type')
    .eq('conversation_id', conversation_id)
    .order('sent_at', { ascending: false })
    .limit(20)
  if (error) return res.status(500).json({ error: error.message })
  const ordered = (msgs || []).reverse()
  if (ordered.length === 0) return res.status(400).json({ error: 'conversation vide' })

  const transcript = ordered.map(m => {
    const who = m.sender_type === 'client' ? 'Client' : m.sender_type === 'agent' ? 'Commerciale' : 'Système'
    const content = [m.body, m.media_url ? mediaTag(m.media_type) : ''].filter(Boolean).join(' ')
    return `${who} : ${content}`
  }).join('\n')

  try {
    const system = await buildSuggestSystem(supabase)
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system,
        messages: [{
          role: 'user',
          content: `Voici la conversation WhatsApp :\n\n${transcript}\n\nPropose 3 réponses possibles. Réponds à TOUS les points et questions du client restés sans réponse (s'il a envoyé plusieurs messages, traite-les tous, pas seulement sa dernière ligne).`,
        }],
        output_config: { format: { type: 'json_schema', schema: SUGGEST_SCHEMA } },
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('[wati-suggest]', r.status, data?.error?.message)
      return res.status(502).json({ error: data?.error?.message || `Claude erreur ${r.status}` })
    }
    const block = (data.content || []).find(b => b.type === 'text')
    const suggestions = parseSuggestions(block?.text).slice(0, 3)
    if (suggestions.length === 0) return res.status(502).json({ error: 'Réponse IA illisible' })
    return res.status(200).json({ suggestions })
  } catch (e) {
    console.error('[wati-suggest]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Prépare une réponse (IA) DÈS la réception d'un message client et la range dans
// conversations.suggested_reply. Ainsi, à l'ouverture du fil, la réponse est déjà
// écrite dans la zone (zéro attente). On garde le ton "amicale" (voix Lily Gourmet).
// Best-effort : toute erreur est silencieuse, ça ne doit jamais bloquer le webhook.
async function prepareSuggestedReply(supabase, conversationId) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return

  const { data: msgs } = await supabase
    .from('messages')
    .select('sender_type, body, media_url, media_type, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(20)
  const ordered = (msgs || []).reverse()
  if (ordered.length === 0) return

  const transcript = ordered.map(m => {
    const who = m.sender_type === 'client' ? 'Client' : m.sender_type === 'agent' ? 'Commerciale' : 'Système'
    const content = [m.body, m.media_url ? mediaTag(m.media_type) : ''].filter(Boolean).join(' ')
    return `${who} : ${content}`
  }).join('\n')

  // Salutation selon l'heure locale au Maroc : Bonsoir de 18h à 5h, Bonjour sinon.
  const hourPart = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', hour12: false })
    .formatToParts(new Date()).find(p => p.type === 'hour')?.value
  const hour = Number(hourPart)
  const greeting = (Number.isFinite(hour) && (hour >= 18 || hour < 5)) ? 'Bonsoir' : 'Bonjour'

  // « Bonjour » une seule fois par jour : si on a déjà écrit à la cliente
  // aujourd'hui (réponse agent ou auto-réponse), on ne la re-salue pas.
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' })
  const today = dayFmt.format(new Date())
  const alreadyGreetedToday = ordered.some(m =>
    (m.sender_type === 'agent' || m.sender_type === 'system') &&
    m.sent_at && dayFmt.format(new Date(m.sent_at)) === today)
  const greetingInstruction = alreadyGreetedToday
    ? `Pour la réponse DIRECTE : NE remets PAS de salutation (on a déjà salué cette cliente aujourd'hui), réponds directement, garde une formule de politesse minimale, va à l'essentiel sans blabla et sans émoji.`
    : `Pour la réponse DIRECTE : commence par une salutation (si tu réponds en français, écris « ${greeting} » ; sinon salue dans la langue de ta réponse), garde une petite formule de politesse minimale, va à l'essentiel sans blabla et sans émoji.`

  const system = await buildSuggestSystem(supabase)
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system,
      messages: [{
        role: 'user',
        content: `RÈGLE DE LANGUE PRIORITAIRE (applique-la AVANT tout) : repère la langue du DERNIER message du client. Si c'est de l'arabe classique / standard (fusha, ex. « ما هي النكهات المتوفرة لديكم ») → rédige TES 3 réponses ENTIÈREMENT en arabe classique, pas un seul mot de français. Si c'est de la darija marocaine (dialecte, en lettres latines ou arabes, ex. « chhal kayn », « شحال كاين ديال الطعم ») → réponds en FRANÇAIS. Toute autre langue → réponds dans la langue du client.\n\nVoici la conversation WhatsApp :\n\n${transcript}\n\nQuand le client mentionne un jour de la semaine (« samedi »…), « demain » ou « après-demain », il s'agit de la PROCHAINE occurrence à venir : ne demande pas de préciser la date. N'invente JAMAIS de date chiffrée (ne calcule pas le numéro du jour) — reprends simplement le jour tel que le client l'a dit. La disponibilité du créneau reste à vérifier avant de confirmer.\n\nPropose 3 réponses possibles (en respectant la RÈGLE DE LANGUE PRIORITAIRE ci-dessus). Réponds à TOUS les points et questions du client restés sans réponse (s'il a envoyé plusieurs messages ou posé plusieurs questions, traite-les tous, pas seulement sa dernière ligne ; une phrase courte par point). ${greetingInstruction} Si tu ne comprends pas la langue du dernier message du client, écris EXACTEMENT « __INCOMPRIS__ » comme texte de la réponse DIRECTE (rien d'autre).`,
      }],
      output_config: { format: { type: 'json_schema', schema: SUGGEST_SCHEMA } },
    }),
  })
  if (!r.ok) { console.warn('[prepare-suggestion] Claude', r.status); return }
  const data = await r.json().catch(() => ({}))
  const block = (data.content || []).find(b => b.type === 'text')
  const suggestions = parseSuggestions(block?.text)
  // Ton "directe" : court (1-2 phrases), droit au but, sans émoji → brouillon sobre.
  const pick = suggestions.find(s => s.tone === 'directe') || suggestions[0]
  if (!pick?.text) return
  // Langue non comprise : pas de brouillon, la commerciale gère elle-même.
  if (/__INCOMPRIS__/i.test(pick.text)) {
    await supabase.from('conversations').update({ suggested_reply: null }).eq('id', conversationId)
    return
  }
  // Sécurité : on retire TOUT émoji du brouillon (drapeaux, symboles, pictogrammes).
  const clean = pick.text
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  if (!clean) return

  await supabase.from('conversations')
    .update({ suggested_reply: clean }).eq('id', conversationId)
}

// ============================================================
// SUPPRESSION d'un message (action=delete-message)
// Tente l'API delete WATI pour effacer chez le client (fenêtre 15 min
// WhatsApp), et marque le message comme supprimé localement.
// ============================================================
async function handleDeleteMessage(req, res) {
  const { messageId, userId } = req.body || {}
  if (!messageId || !userId) return res.status(400).json({ error: 'messageId et userId requis' })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: profile } = await supabase
    .from('profiles').select('role, perm_conversations').eq('id', userId).maybeSingle()
  if (!profile || (profile.role !== 'admin' && profile.perm_conversations !== true)) {
    return res.status(403).json({ error: 'non autorisé' })
  }

  const { data: msg, error: errMsg } = await supabase
    .from('messages')
    .select('id, wa_message_id, sender_type, deleted_at')
    .eq('id', messageId)
    .maybeSingle()
  if (errMsg)  return res.status(500).json({ error: errMsg.message })
  if (!msg)    return res.status(404).json({ error: 'message introuvable' })
  if (msg.sender_type !== 'agent') return res.status(400).json({ error: "on ne peut supprimer que ses propres messages" })

  // Tentative API WATI (best effort) — fenêtre WhatsApp ≈ 15 min.
  let watiOk = false
  const apiToken    = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (msg.wa_message_id && apiToken && apiEndpoint) {
    const base = apiEndpoint.replace(/\/$/, '')
    const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
    try {
      const r = await fetch(`${base}/api/v1/deleteMessage/${msg.wa_message_id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      })
      const rawBody = await r.text()
      console.log('[wati-delete] status', r.status, '· body', rawBody)
      watiOk = r.ok
    } catch (e) {
      console.warn('[wati-delete] fetch error:', e?.message || e)
    }
  }

  // Marquage local (soft delete) toujours fait.
  const { error: errUpd } = await supabase
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      deleted_at_wati: watiOk,
    })
    .eq('id', messageId)
  if (errUpd) return res.status(500).json({ error: errUpd.message })

  return res.status(200).json({ ok: true, deleted_at_wati: watiOk })
}

// ============================================================
// CORRECTION orthographe/grammaire avant envoi (action=correct)
// ============================================================
async function handleCorrect(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquant' })

  const { text, userId } = req.body || {}
  if (!text || !userId) return res.status(400).json({ error: 'text et userId requis' })

  const raw = String(text)
  // Message court (« ok », « oui », « merci »…) → rien à corriger, on renvoie tel quel.
  if (raw.trim().length < 4) return res.status(200).json({ corrected: raw })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: profile } = await supabase
    .from('profiles').select('role, perm_conversations').eq('id', userId).maybeSingle()
  if (!profile || (profile.role !== 'admin' && profile.perm_conversations !== true)) {
    return res.status(403).json({ error: 'non autorisé' })
  }

  const system = `Tu corriges l'orthographe, la grammaire et la ponctuation d'un message professionnel en français destiné à un client de pâtisserie.
Règles strictes :
- Ajoute systématiquement la ponctuation manquante (majuscule en début de phrase, point/virgule/point d'interrogation/point d'exclamation à la fin).
- Corrige les accents manquants (à, é, è, ê, ç…).
- Garde le sens et le ton (cordial, professionnel).
- Ne change pas les noms propres, les prix, les dates, les heures, les numéros.
- Ne modifie JAMAIS les liens / URLs (http://, https://, www., liens raccourcis…) : recopie-les exactement à l'identique, sans rien ajouter ni corriger dedans.
- Pas d'emoji ajouté ni retiré.
- Tu n'es PAS en conversation : ne parle JAMAIS de toi-même, ne pose aucune question, ne refuse jamais, ne dis jamais que tu es une IA.
- Si le message est court ou n'a rien à corriger (ex : « ok », « merci », « oui »), renvoie-le EXACTEMENT tel quel.
- Renvoie UNIQUEMENT le texte corrigé, sans préambule, sans guillemets, sans explication.`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: String(text) }],
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('[wati-correct]', r.status, data?.error?.message)
      return res.status(200).json({ corrected: raw })   // échec IA → on garde le texte tel quel
    }
    const block = (data.content || []).find(b => b.type === 'text')
    const corrected = (block?.text || '').trim()
    if (!corrected) return res.status(200).json({ corrected: raw })
    // Garde-fous : si l'IA répond un méta-message (sur elle-même / refus) ou gonfle un
    // message très court → on garde l'original au lieu de le remplacer.
    const META = /(pr[êe]t à corriger|soumettre le texte|je suis (une?|un)\s+(ia|assistant|intelligence)|en tant qu[e']\s*(ia|assistant)|je ne peux pas|veuillez me)/i
    const blewUp = raw.trim().length <= 12 && corrected.length > raw.trim().length + 25
    if (META.test(corrected) || blewUp) return res.status(200).json({ corrected: raw })
    return res.status(200).json({ corrected })
  } catch (e) {
    console.error('[wati-correct]', e?.message || e)
    return res.status(200).json({ corrected: raw })   // erreur → texte tel quel
  }
}

// ============================================================
// TEMPLATES — liste (action=templates) + envoi (action=send-template)
// ============================================================
async function handleTemplates(req, res) {
  const apiToken = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (!apiToken || !apiEndpoint) {
    return res.status(500).json({ error: 'WATI_API_TOKEN / WATI_API_ENDPOINT manquant' })
  }
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  try {
    const r = await fetch(`${base}/api/v1/getMessageTemplates?pageSize=100&pageNumber=1`, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(502).json({ error: `Wati templates erreur ${r.status}` })
    const list = data.messageTemplates || data.templates || data.data || []
    return res.status(200).json({ templates: list })
  } catch (e) {
    console.error('[wati-templates]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

async function handleSendTemplate(req, res) {
  const apiToken = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (!apiToken || !apiEndpoint) {
    return res.status(500).json({ error: 'WATI_API_TOKEN / WATI_API_ENDPOINT manquant' })
  }
  const { clientPhone, conversationId, templateName, broadcastName, parameters, bodyText, freeText, userId } = req.body || {}
  if (!clientPhone || !templateName) {
    return res.status(400).json({ error: 'clientPhone et templateName requis' })
  }
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // SÉCURITÉ anti-fuite : si un conversationId est fourni, le destinataire est le téléphone
  // de CETTE conversation (source de vérité), pas un clientPhone qui pourrait être périmé.
  let phoneSrc = clientPhone
  if (conversationId) {
    try {
      const { data: cr } = await supabase.from('conversations').select('client_phone').eq('id', conversationId).maybeSingle()
      if (cr?.client_phone) phoneSrc = cr.client_phone
    } catch { /* repli sur clientPhone */ }
  }
  // Normalise le numéro au format WhatsApp (0… -> 212…) pour ne pas créer un
  // faux contact « 06… » à côté du vrai client enregistré en 212…
  const number = normalizePhone(phoneSrc)
  const digits = String(number).replace(/\D/g, '')

  // Envoi du MODÈLE approuvé (toujours possible). Renvoie { ok, waId, err }.
  async function sendTemplateMessage() {
    const url = `${base}/api/v1/sendTemplateMessage?whatsappNumber=${number}`
    const payload = { template_name: templateName, broadcast_name: broadcastName || `lily_${Date.now()}`, parameters: parameters || [] }
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    const raw = await r.text(); let data = {}; try { data = JSON.parse(raw) } catch { /* non JSON */ }
    if (!r.ok || data?.result === false) return { ok: false, err: data?.info || data?.message || `Wati erreur ${r.status}` }
    return { ok: true, waId: data?.id || data?.messageId || null }
  }

  // Envoi d'un message NORMAL (texte libre, retours à la ligne OK) — ne marche
  // que si la conversation est ouverte (le client a écrit dans les dernières 24h).
  async function sendFreeMessage(textToSend) {
    const qs = new URLSearchParams({ messageText: textToSend })
    const url = `${base}/api/v1/sendSessionMessage/${digits}?${qs.toString()}`
    const r = await fetch(url, { method: 'POST', headers: { Authorization: authHeader, Accept: 'application/json' } })
    const raw = await r.text(); let data = {}; try { data = JSON.parse(raw) } catch { /* non JSON */ }
    if (!r.ok || data?.result === false) return { ok: false, err: data?.info || data?.message || `Wati erreur ${r.status}` }
    return { ok: true, waId: data?.id || data?.messageId || null }
  }

  try {
    // Crée/retrouve le fil d'abord (pour savoir si la session est ouverte).
    const conv = await getOrCreateConversation(supabase, number, null)

    // Session ouverte = un message ENTRANT du client dans les dernières 24h.
    let sessionOpen = false
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: lastIn } = await supabase.from('messages').select('id')
        .eq('conversation_id', conv.id).eq('sender_type', 'client').gte('sent_at', since).limit(1)
      sessionOpen = (lastIn || []).length > 0
    } catch { /* en cas de doute on enverra le modèle */ }

    // Devis/confirmation + conversation ouverte → message normal joliment présenté
    // (un article par ligne). Sinon → modèle. Repli sur le modèle si WATI refuse.
    let sent, sentBody
    if (freeText && sessionOpen) {
      sent = await sendFreeMessage(freeText)
      if (sent.ok) sentBody = freeText
      else sent = null
    }
    if (!sent) {
      sent = await sendTemplateMessage()
      sentBody = bodyText || `[Template] ${templateName}`
    }
    if (!sent.ok) return res.status(502).json({ error: sent.err })

    // Trace le message sortant
    const sentAt = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: 'agent',
      sender_user_id: userId || null,
      body: sentBody,
      sent_at: sentAt,
      wa_message_id: sent.waId,
    })
    // Notifs internes au personnel (tâches, congés, économat) : la conversation
    // doit rester FERMÉE pour ne pas encombrer l'inbox des commerciaux. Les vrais
    // échanges client (devis, confirmation...) restent "en_cours".
    const INTERNAL_NOTIF = new Set(['nouvelle_tache', 'notification_conge', 'rappel_reprise_conge', 'economat_demande', 'nouvelle_demande_economat', 'lily_gourmet_access'])
    // Le destinataire est-il un membre du PERSONNEL ? (numéro = whatsapp d'un profil)
    // → on ferme aussi : les infos auto au personnel ne doivent pas ouvrir une conversation.
    let isStaff = false
    try {
      const d9 = String(number).replace(/\D/g, '').slice(-9)
      if (d9.length >= 8) {
        const { data: st } = await supabase.from('profiles').select('id').ilike('whatsapp', `%${d9}`).limit(1)
        isStaff = !!(st && st.length)
      }
    } catch { /* en cas de doute on ne ferme pas */ }
    // Confirmation de commande = plus rien en attente -> on ferme aussi.
    // (Le devis reste "en_cours" car on attend la réponse du client.)
    const fermerApresEnvoi = isStaff || INTERNAL_NOTIF.has(templateName) || templateName === 'message_de_confirmation'
    const newStatus = fermerApresEnvoi ? 'fermee' : 'en_cours'
    await supabase.from('conversations')
      .update({ last_message_at: sentAt, updated_at: sentAt, status: newStatus })
      .eq('id', conv.id)

    return res.status(200).json({ ok: true, conversationId: conv.id })
  } catch (e) {
    console.error('[wati-send-template]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// ============================================================
// RECHERCHE COMMANDES ODOO — action=search-orders
// Cherche une commande/devis par n° S, nom client, ou téléphone, et renvoie
// les infos prêtes à remplir les templates devis_validation / message_de_confirmation.
// ============================================================
async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`)
  const data = await r.json()
  if (data.error) throw new Error(`Odoo error: ${data.error.data?.message || data.error.message}`)
  return data.result
}
async function odooAuthenticate() {
  const uid = await odooJsonRpc('common', 'authenticate', [
    process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD, {},
  ])
  if (!uid) throw new Error('Odoo authentication failed')
  return uid
}
function odooSearchRead(uid, model, domain, fields, opts = {}) {
  return odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, 'search_read', [domain, fields], opts,
  ])
}

// ============================================================
// PRISE DE COMMANDE — catalogue Odoo (lecture) pour l'écran « Nouvelle commande »
// ============================================================
const ORDER_CATS = [
  { key: 'cd',     label: 'Cake design',   prefixes: ['CD-'] },
  { key: 'e',      label: 'Entremets',     prefixes: ['E-'] },
  { key: 'gm',     label: 'Gourmandises',  prefixes: ['GM-'] },
  { key: 'gs',     label: 'Gâteaux secs / Plateaux', prefixes: ['GS-'] },
  { key: 'mi',     label: 'Mignardises',   prefixes: ['MI-'] },
  { key: 'sa',     label: 'Salé',          prefixes: ['SA-'] },
  { key: 'v',      label: 'Viennoiserie',  prefixes: ['V-'] },
  { key: 'b',      label: 'Boissons',      prefixes: ['B-'], only: /jus/i },
  { key: 'su',     label: 'Surgelés',      prefixes: ['Su-'] },
  { key: 'saison', label: 'Saisonnier',    prefixes: ['RA-', 'H-', 'N-'] },
  { key: 'divers', label: 'Livraison / Autre', names: ['Livraison', 'AUTRE'] },
]
function cleanProductName(n) {
  return String(n || '').replace(/^[A-Za-z]{1,4}-\s*/, '').replace(/\s*CD\*\s*$/i, '').trim()
}
let _orderCatalogCache = null, _orderCatalogAt = 0

async function handleOrderCatalog(req, res) {
  try {
    const fresh = req.body?.fresh
    if (!fresh && _orderCatalogCache && Date.now() - _orderCatalogAt < 3600 * 1000) {
      return res.status(200).json(_orderCatalogCache)
    }
    const uid = await odooAuthenticate()
    const conds = []
    ORDER_CATS.forEach(c => {
      (c.prefixes || []).forEach(p => conds.push(['name', '=ilike', p + '%']))  // insensible à la casse (B-/b-, Su-/SU-)
      ;(c.names || []).forEach(n => conds.push(['name', '=ilike', n]))
    })
    const orBlock = Array(Math.max(0, conds.length - 1)).fill('|').concat(conds)
    const domain = ['&', ['sale_ok', '=', true], ...orBlock]
    const tmpls = await odooSearchRead(uid, 'product.template', domain, ['id', 'name', 'attribute_line_ids', 'image_128'], { limit: 1000 })
    // Produits simples (sans attribut) : on récupère leur variante (id + prix) en un appel
    const simpleIds = tmpls.filter(t => !(t.attribute_line_ids || []).length).map(t => t.id)
    const variantByTmpl = {}
    if (simpleIds.length) {
      const vars = await odooSearchRead(uid, 'product.product', [['product_tmpl_id', 'in', simpleIds]], ['id', 'product_tmpl_id', 'lst_price'])
      for (const v of vars) {
        const tid = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id
        if (!variantByTmpl[tid]) variantByTmpl[tid] = { id: v.id, price: v.lst_price }
      }
    }
    const cats = ORDER_CATS.map(c => ({
      key: c.key, label: c.label,
      items: tmpls
        .filter(t => {
          const nm = (t.name || '').toLowerCase()
          if (c.prefixes) return c.prefixes.some(p => nm.startsWith(p.toLowerCase()))
          if (c.names) return c.names.some(n => nm === n.toLowerCase())
          return false
        })
        .map(t => {
          const configurable = (t.attribute_line_ids || []).length > 0
          const sv = variantByTmpl[t.id]
          return { tmplId: t.id, name: cleanProductName(t.name), configurable, variantId: sv?.id || null, price: sv?.price ?? null, image: t.image_128 ? `data:image/png;base64,${t.image_128}` : null }
        })
        // Restriction optionnelle (ex. Boissons = seulement « Jus … » pour l'instant)
        .filter(it => !c.only || c.only.test(it.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    }))
    _orderCatalogCache = { cats }
    _orderCatalogAt = Date.now()
    return res.status(200).json(_orderCatalogCache)
  } catch (e) {
    console.error('[order-catalog]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Détail d'un produit configurable : ses attributs (option/texte) + ses variantes (à la demande).
async function handleOrderProduct(req, res) {
  const { tmplId } = req.body || {}
  if (!tmplId) return res.status(400).json({ error: 'tmplId requis' })
  try {
    const uid = await odooAuthenticate()
    const lines = await odooSearchRead(uid, 'product.template.attribute.line', [['product_tmpl_id', '=', tmplId]], ['attribute_id', 'value_ids'])
    const valIds = [...new Set(lines.flatMap(l => l.value_ids || []))]
    const vals = valIds.length ? await odooSearchRead(uid, 'product.attribute.value', [['id', 'in', valIds]], ['id', 'name', 'is_custom']) : []
    const valById = {}; vals.forEach(v => { valById[v.id] = v })
    // Attribut "texte" si toutes ses valeurs sont libres (is_custom) → ex. Thème, Âge, Message
    const attributes = lines.map(l => {
      const lvals = (l.value_ids || []).map(id => valById[id]).filter(Boolean)
      const isText = lvals.length > 0 && lvals.every(v => v.is_custom)
      return {
        attrId: Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id,
        name: Array.isArray(l.attribute_id) ? l.attribute_id[1] : '',
        type: isText ? 'text' : 'option',
        values: isText ? [] : lvals.map(v => v.name),
      }
    })
    const prods = await odooSearchRead(uid, 'product.product', [['product_tmpl_id', '=', tmplId]], ['id', 'lst_price', 'product_template_attribute_value_ids'])
    const ptavIds = [...new Set(prods.flatMap(p => p.product_template_attribute_value_ids || []))]
    const ptav = ptavIds.length ? await odooSearchRead(uid, 'product.template.attribute.value', [['id', 'in', ptavIds]], ['id', 'attribute_id', 'name']) : []
    const ptavById = {}; ptav.forEach(x => { ptavById[x.id] = { attrId: Array.isArray(x.attribute_id) ? x.attribute_id[0] : x.attribute_id, val: x.name } })
    const variants = prods.map(p => {
      const values = {}
      for (const id of (p.product_template_attribute_value_ids || [])) { const m = ptavById[id]; if (m) values[m.attrId] = m.val }
      return { id: p.id, price: p.lst_price, values }
    })
    return res.status(200).json({ attributes, variants })
  } catch (e) {
    console.error('[order-product]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Recherche libre dans TOUS les produits Odoo vendables (pour ajouter au lien OCP
// n'importe quel article, pas seulement une catégorie). Renvoie [{tmplId, name, image, configurable}].
async function handleOrderProductSearch(req, res) {
  const q = (req.body?.query || '').trim()
  if (q.length < 2) return res.status(200).json({ products: [] })
  try {
    const uid = await odooAuthenticate()
    const tmpls = await odooSearchRead(uid, 'product.template', [['sale_ok', '=', true], ['name', 'ilike', q]], ['id', 'name', 'attribute_line_ids', 'image_128'], { limit: 30 })
    const products = tmpls.map(t => ({
      tmplId: t.id,
      name: cleanProductName(t.name),
      configurable: (t.attribute_line_ids || []).length > 0,
      image: t.image_128 ? `data:image/png;base64,${t.image_128}` : null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return res.status(200).json({ products })
  } catch (e) {
    console.error('[order-product-search]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

function odooCreate(uid, model, vals) {
  return odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, 'create', [vals]])
}

// Modifie les articles d'une commande existante (sale.order). op = list | add | update | delete.
// On écrit via le champ order_line (commandes one2many Odoo) → les totaux se recalculent.
async function handleOrderLine(req, res) {
  const { op, orderId, lineId, variantId, qty, price, name, desc, discount, photo } = req.body || {}
  if (!orderId) return res.status(400).json({ error: 'commande requise' })
  const DB = process.env.ODOO_DB, PWD = process.env.ODOO_PASSWORD
  try {
    const uid = await odooAuthenticate()

    if (op === 'list') {
      const order = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['order_line', 'state'])
      const ids = order[0]?.order_line || []
      if (!ids.length) return res.status(200).json({ lines: [], state: order[0]?.state || '' })
      const rows = await odooSearchRead(uid, 'sale.order.line', [['id', 'in', ids]],
        ['id', 'name', 'product_uom_qty', 'price_unit', 'price_total', 'discount', 'display_type', 'sequence'])
      rows.sort((a, b) => (a.sequence - b.sequence) || (a.id - b.id))
      const lines = []
      let last = null
      for (const l of rows) {
        if (l.display_type === 'line_note') {
          // Ancien format : warning sur une ligne séparée → rattaché à l'article précédent.
          const t = (l.name || '').replace(/\s+/g, ' ').trim().replace(/^⚠️\s*/, '')
          if (last) (last.warnings ||= []).push({ noteId: l.id, text: t })
          continue
        }
        if (l.display_type) continue
        // Sépare les ⚠️ écrits DANS la description de l'article de son vrai libellé.
        const parts = String(l.name || '').split('\n')
        const nm = parts.filter(p => !/^\s*⚠️/.test(p)).join(' ').replace(/\s+/g, ' ').trim()
        if (/^(Acompte|Down\s+Payment)/i.test(nm)) continue
        const warnings = parts
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => /^\s*⚠️/.test(p))
          .map(({ p, i }) => ({ lineId: l.id, idx: i, text: p.replace(/^\s*⚠️\s*/, '').trim() }))
        // rawName = libellé multiligne (parfum/thème/âge/message), SANS les ⚠️ (gérés à part) → éditable.
        const rawName = parts.filter(p => !/^\s*⚠️/.test(p)).join('\n').replace(/\n+$/, '')
        const item = { id: l.id, name: nm, rawName, qty: l.product_uom_qty, price: l.price_unit, total: l.price_total, discount: l.discount || 0, warnings }
        lines.push(item)
        last = item
      }
      return res.status(200).json({ lines, state: order[0]?.state || '' })
    }

    if (op === 'warn') {
      const w = String(req.body?.warn || '').trim()
      if (!w) return res.status(400).json({ error: 'warning vide' })
      if (!lineId) return res.status(400).json({ error: 'article requis' })
      // Le ⚠️ est écrit DANS la description de l'article ciblé → toujours collé au bon
      // article, sans dépendre de l'ordre des lignes dans Odoo.
      const cur = await odooSearchRead(uid, 'sale.order.line', [['id', '=', lineId]], ['name'])
      const base = (cur[0]?.name || '').replace(/\s+$/, '')
      const newName = `${base}\n⚠️ ${w}`
      await odooJsonRpc('object', 'execute_kw', [DB, uid, PWD, 'sale.order', 'write', [[orderId], { order_line: [[1, lineId, { name: newName }]] }]])
      return res.status(200).json({ ok: true })
    }

    if (op === 'warn-remove') {
      if (!lineId) return res.status(400).json({ error: 'article requis' })
      const idx = Number(req.body?.idx)
      const cur = await odooSearchRead(uid, 'sale.order.line', [['id', '=', lineId]], ['name'])
      const parts = String(cur[0]?.name || '').split('\n')
      if (Number.isInteger(idx) && idx >= 0 && idx < parts.length && /^\s*⚠️/.test(parts[idx])) {
        parts.splice(idx, 1)
        const newName = parts.join('\n').replace(/\n+$/, '')
        await odooJsonRpc('object', 'execute_kw', [DB, uid, PWD, 'sale.order', 'write', [[orderId], { order_line: [[1, lineId, { name: newName }]] }]])
      }
      return res.status(200).json({ ok: true })
    }

    if (op === 'date') {
      // Change la date + l'heure de retrait/livraison (même format qu'à la création).
      const deliveryDate = String(req.body?.deliveryDate || '').trim()
      const deliveryTime = String(req.body?.deliveryTime || '').trim()
      if (!deliveryDate) return res.status(400).json({ error: 'date requise' })
      const time = deliveryTime || '00:00'
      const vals = { commitment_date: moroccoLocalToUtc(deliveryDate, time) }
      const [y, m, d] = deliveryDate.split('-')
      const hh = parseInt(time.split(':')[0], 10)
      if (Number.isFinite(hh)) vals.livraison_hour = `${d}-${m}-${y.slice(2)} ${hh}h-${hh + 1}h`
      await odooJsonRpc('object', 'execute_kw', [DB, uid, PWD, 'sale.order', 'write', [[orderId], vals]])
      return res.status(200).json({ ok: true })
    }

    if (op === 'photo-remove') {
      const attId = Number(req.body?.attId)
      if (!attId) return res.status(400).json({ error: 'photo requise' })
      // Sécurité : on ne supprime que si la pièce jointe appartient à CETTE commande (entête ou une de ses lignes).
      const ord = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['order_line'])
      const lineIds = ord[0]?.order_line || []
      const att = await odooSearchRead(uid, 'ir.attachment', [['id', '=', attId]], ['res_model', 'res_id'])
      const a = att[0]
      const ok = a && ((a.res_model === 'sale.order' && a.res_id === orderId) || (a.res_model === 'sale.order.line' && lineIds.includes(a.res_id)))
      if (!ok) return res.status(400).json({ error: 'photo introuvable pour cette commande' })
      await odooJsonRpc('object', 'execute_kw', [DB, uid, PWD, 'ir.attachment', 'unlink', [[attId]]])
      return res.status(200).json({ ok: true })
    }

    let command
    if (op === 'add') {
      if (!variantId) return res.status(400).json({ error: 'article requis' })
      command = [0, 0, {
        product_id: variantId,
        product_uom_qty: Number(qty) || 1,
        price_unit: Number(price) || 0,
        name: [name || '', desc || ''].filter(Boolean).join('\n'),
      }]
    } else if (op === 'update') {
      if (!lineId) return res.status(400).json({ error: 'ligne requise' })
      const vals = {}
      if (qty !== undefined && qty !== null && qty !== '') vals.product_uom_qty = Number(qty)
      if (price !== undefined && price !== null && price !== '') vals.price_unit = Number(price)
      if (discount !== undefined && discount !== null && discount !== '') vals.discount = Number(discount)
      if (name !== undefined && name !== null) {
        // Réécrit le libellé (thème/âge/message) en PRÉSERVANT les ⚠️ existants (gérés à part dans l'UI).
        const cur = await odooSearchRead(uid, 'sale.order.line', [['id', '=', lineId]], ['name'])
        const warns = String(cur[0]?.name || '').split('\n').filter(p => /^\s*⚠️/.test(p))
        vals.name = [String(name).trim(), ...warns].filter(Boolean).join('\n')
      }
      command = [1, lineId, vals]
    } else if (op === 'delete') {
      if (!lineId) return res.status(400).json({ error: 'ligne requise' })
      command = [2, lineId]
    } else {
      return res.status(400).json({ error: 'op inconnue' })
    }

    await odooJsonRpc('object', 'execute_kw', [DB, uid, PWD, 'sale.order', 'write', [[orderId], { order_line: [command] }]])

    // Photo (modèle de gâteau) → attachée à L'ARTICLE (sale.order.line), pas à l'entête,
    // pour que chaque CD- garde SA propre photo dans le calendrier / l'impression.
    // (Pas de message_post : il rebasculerait la pièce jointe sur la commande entière.)
    if ((op === 'add' || op === 'update') && photo?.data) {
      try {
        let targetLineId = lineId
        if (op === 'add') {
          // La ligne vient d'être créée dans le write ci-dessus → on récupère son id (la plus récente).
          const ord = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['order_line'])
          const ids = ord[0]?.order_line || []
          targetLineId = ids.length ? Math.max(...ids) : null
        }
        if (targetLineId) {
          await odooCreate(uid, 'ir.attachment', {
            name: photo.name || 'photo.jpg',
            datas: photo.data,
            res_model: 'sale.order.line',
            res_id: targetLineId,
            mimetype: photo.mimetype || 'image/jpeg',
          })
        }
      } catch (e) { console.warn('[order-line photo]', e?.message || e) }
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[order-line]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Compte les devis internet (état 'sent') — pour le badge de notification.
// Si `since` (ISO) est fourni, ne compte que ceux créés après (= nouveaux depuis la dernière visite).
async function handleCountDevisInternet(req, res) {
  const since = req.body?.since || null
  // Mode « non traités » : calcul fait CÔTÉ SERVEUR en un seul appel (badge léger).
  if (req.body?.nonTraites) return countDevisInternetNonTraitesServer(res)
  try {
    const uid = await odooAuthenticate()
    const domain = [['state', '=', 'sent'], ['partner_id', 'not ilike', 'vitrin']]
    if (since) domain.push(['date_order', '>', String(since).replace('T', ' ').slice(0, 19)])  // format Odoo (UTC)
    const count = await odooJsonRpc('object', 'execute_kw',
      [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'search_count', [domain]])
    return res.status(200).json({ count: count || 0 })
  } catch (e) {
    console.error('[count-devis-internet]', e?.message || e)
    return res.status(200).json({ count: 0 })   // badge non bloquant
  }
}

// Compte les devis internet (sent) NON TRAITÉS = ni envoyés, ni relancés/confirmés,
// ni dont le client a déjà une conversation. Tout est fait ici (1 seul appel navigateur).
async function countDevisInternetNonTraitesServer(res) {
  try {
    const uid = await odooAuthenticate()
    const orders = await odooSearchRead(uid, 'sale.order',
      [['state', '=', 'sent'], ['partner_id', 'not ilike', 'vitrin']], ['name', 'partner_id'])
    if (!orders.length) return res.status(200).json({ count: 0 })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const [env, tr, msgs] = await Promise.all([
      supabase.from('devis_envois').select('order_num'),
      supabase.from('devis_traitements').select('order_num, action'),
      supabase.from('messages').select('body').in('sender_type', ['agent', 'system']).ilike('body', '%S%'),
    ])
    const envSet = new Set((env.data || []).map(e => e.order_num))
    const trSet = new Set((tr.data || []).filter(t => ['relance', 'confirme'].includes(t.action)).map(t => t.order_num))
    // N° de devis (S…) déjà cités dans NOS messages = ce devis précis a été contacté.
    const refSet = new Set()
    for (const m of msgs.data || []) {
      const matches = (m.body || '').match(/\bS\d{4,}\b/gi)
      if (matches) matches.forEach(s => refSet.add(s.toUpperCase()))
    }

    let n = 0
    for (const o of orders) {
      const contacted = envSet.has(o.name) || trSet.has(o.name) || refSet.has(String(o.name || '').toUpperCase())
      if (!contacted) n++
    }
    return res.status(200).json({ count: n })
  } catch (e) {
    console.error('[count-devis-internet nonTraites]', e?.message || e)
    return res.status(200).json({ count: 0 })   // badge non bloquant
  }
}

// Recherche un client Odoo (res.partner) par nom / téléphone.
async function handleOrderClientsSearch(req, res) {
  const q = (req.body?.query || '').trim()
  if (q.length < 2) return res.status(200).json({ clients: [] })
  try {
    const uid = await odooAuthenticate()
    const domain = ['|', '|', ['name', 'ilike', q], ['phone', 'ilike', q], ['mobile', 'ilike', q]]
    const clients = await odooSearchRead(uid, 'res.partner', domain, ['id', 'name', 'phone', 'mobile'], { limit: 15 })
    return res.status(200).json({ clients })
  } catch (e) {
    console.error('[order-clients-search]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Crée un nouveau client Odoo — SAUF si le numéro existe déjà (on renvoie l'existant).
async function handleOrderCreateClient(req, res) {
  const name = (req.body?.name || '').trim()
  const phone = (req.body?.phone || '').trim()
  if (!name) return res.status(400).json({ error: 'nom requis' })
  try {
    const uid = await odooAuthenticate()
    const digits = phone.replace(/\D/g, '')
    // Format Maroc : un numéro commençant par 0 devient +212 (ex. 0661… → +212661…).
    let normPhone = phone
    if (digits.startsWith('0')) normPhone = '+212' + digits.slice(1)
    else if (digits.startsWith('212')) normPhone = '+' + digits
    // Doublon : on cherche par les 9 derniers chiffres (insensible au préfixe +212/0).
    if (digits.length >= 6) {
      const last9 = digits.slice(-9)
      const found = await odooSearchRead(uid, 'res.partner',
        ['|', ['phone', 'ilike', last9], ['mobile', 'ilike', last9]],
        ['id', 'name', 'phone', 'mobile'], { limit: 5 })
      const match = (found || []).find(c => {
        const cd = String(c.phone || c.mobile || '').replace(/\D/g, '')
        return cd && (cd.endsWith(last9) || digits.endsWith(cd.slice(-9)))
      })
      if (match) {
        return res.status(200).json({ existing: true, id: match.id, name: match.name, phone: match.phone || match.mobile || phone })
      }
    }
    const id = await odooCreate(uid, 'res.partner', { name, phone: normPhone || false })
    return res.status(200).json({ id, name, phone: normPhone })
  } catch (e) {
    console.error('[order-create-client]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Crée un DEVIS (sale.order en brouillon) avec ses lignes.
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Change l'entrepôt d'une commande/devis existant (avant confirmation).
async function handleSetWarehouse(req, res) {
  const { orderId, warehouseId } = req.body || {}
  if (!orderId || !warehouseId) return res.status(400).json({ error: 'orderId et warehouseId requis' })
  try {
    const uid = await odooAuthenticate()
    await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'write', [[orderId], { warehouse_id: Number(warehouseId) }]])
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[order-set-warehouse]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Liste des entrepôts Odoo (stock.warehouse) pour le choix à la création d'un devis.
async function handleOrderWarehouses(req, res) {
  try {
    const uid = await odooAuthenticate()
    const warehouses = await odooSearchRead(uid, 'stock.warehouse', [], ['id', 'name', 'code'], { order: 'name' })
    return res.status(200).json({ warehouses: warehouses || [] })
  } catch (e) {
    console.error('[order-warehouses]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Quantités déjà RÉSERVÉES en vitrine pour un jour : on somme les lignes des commandes
// (devis + confirmées, non annulées) dont l'entrepôt contient « vitrine » et dont la date
// de livraison (commitment_date) tombe ce jour-là. Renvoie { reserved: { [variantId]: qty } }.
async function handleVitrineReserved(req, res) {
  const day = (req.query?.day || req.body?.day || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'jour invalide (YYYY-MM-DD)' })
  try {
    const uid = await odooAuthenticate()
    const whs = await odooSearchRead(uid, 'stock.warehouse', [['name', 'ilike', 'vitrine']], ['id'])
    const whIds = (whs || []).map(w => w.id)
    if (!whIds.length) return res.status(200).json({ reserved: {} })
    const orders = await odooSearchRead(uid, 'sale.order',
      [['warehouse_id', 'in', whIds], ['state', 'in', ['draft', 'sent', 'sale']],
        ['commitment_date', '>=', `${day} 00:00:00`], ['commitment_date', '<=', `${day} 23:59:59`]],
      ['order_line'], { limit: 500 })
    const lineIds = (orders || []).flatMap(o => o.order_line || [])
    const reserved = {}
    if (lineIds.length) {
      const lines = await odooSearchRead(uid, 'sale.order.line', [['id', 'in', lineIds]],
        ['product_id', 'product_uom_qty', 'display_type'])
      for (const l of (lines || [])) {
        if (l.display_type) continue
        const pid = Array.isArray(l.product_id) ? l.product_id[0] : l.product_id
        if (!pid) continue
        reserved[pid] = (reserved[pid] || 0) + (Number(l.product_uom_qty) || 0)
      }
    }
    return res.status(200).json({ reserved })
  } catch (e) {
    console.error('[vitrine-reserved]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Détail des RÉSERVATIONS vitrine d'un jour (pour la checklist « à ranger ») :
// chaque commande vitrine du jour avec client, heure de retrait et articles.
async function handleVitrineReservations(req, res) {
  const day = (req.query?.day || req.body?.day || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'jour invalide (YYYY-MM-DD)' })
  try {
    const uid = await odooAuthenticate()
    const whs = await odooSearchRead(uid, 'stock.warehouse', [['name', 'ilike', 'vitrine']], ['id'])
    const whIds = (whs || []).map(w => w.id)
    if (!whIds.length) return res.status(200).json({ orders: [] })
    const orders = await odooSearchRead(uid, 'sale.order',
      [['warehouse_id', 'in', whIds], ['state', 'in', ['draft', 'sent', 'sale']],
        ['commitment_date', '>=', `${day} 00:00:00`], ['commitment_date', '<=', `${day} 23:59:59`]],
      ['name', 'partner_id', 'commitment_date', 'order_line', 'state'], { order: 'commitment_date asc', limit: 500 })
    if (!orders.length) return res.status(200).json({ orders: [] })
    const lineIds = orders.flatMap(o => o.order_line || [])
    const lines = lineIds.length
      ? await odooSearchRead(uid, 'sale.order.line', [['id', 'in', lineIds]], ['order_id', 'name', 'product_uom_qty', 'display_type'])
      : []
    const linesByOrder = new Map()
    for (const l of (lines || [])) {
      if (l.display_type) continue
      const nm = (l.name || '').replace(/\s+/g, ' ').trim()
      if (/^(Acompte|Down\s+Payment)/i.test(nm)) continue
      const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
      if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
      linesByOrder.get(oid).push({ text: nm, qty: String(l.product_uom_qty) })
    }
    const result = orders.map(o => ({
      id: o.id,
      name: o.name,
      clientName: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
      pickupText: fmtPickup(o.commitment_date),
      state: o.state,
      lines: linesByOrder.get(o.id) || [],
    }))
    return res.status(200).json({ orders: result })
  } catch (e) {
    console.error('[vitrine-reservations]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

async function handleOrderCreateDevis(req, res) {
  const { partnerId, lines, deliveryDate, deliveryTime, note, warehouseId, clientPhone } = req.body || {}
  if (!partnerId) return res.status(400).json({ error: 'client requis' })
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'aucune ligne' })
  try {
    const uid = await odooAuthenticate()
    const orderLines = lines.map(l => [0, 0, {
      product_id: l.variantId,
      product_uom_qty: l.qty || 1,
      price_unit: Number(l.price) || 0,
      discount: Number(l.discount) || 0,
      // Nom de produit + détails (parfums, thème, âge, message) chacun sur sa ligne.
      name: [l.name || '', l.desc || ''].filter(Boolean).join('\n'),
    }])
    const vals = { partner_id: partnerId, order_line: orderLines }
    if (warehouseId) vals.warehouse_id = warehouseId   // entrepôt choisi (ex. Vitrine), sinon défaut Odoo

    // Date + heure de livraison (créneau d'1h, format Odoo "DD-MM-YY HHh-HHh")
    if (deliveryDate) {
      const time = deliveryTime || '00:00'
      vals.commitment_date = moroccoLocalToUtc(deliveryDate, time)
      const [y, m, d] = deliveryDate.split('-')
      const hh = parseInt(time.split(':')[0], 10)
      if (Number.isFinite(hh)) vals.livraison_hour = `${d}-${m}-${y.slice(2)} ${hh}h-${hh + 1}h`
    }

    // Note = note générale + warnings (⚠️) → visibles sur le devis ET au calendrier
    const warns = lines.filter(l => l.warn).map(l => `⚠️ ${escapeHtml(l.name)} : ${escapeHtml(l.warn)}`)
    let noteHtml = note ? escapeHtml(note).replace(/\n/g, '<br/>') : ''
    if (warns.length) noteHtml += (noteHtml ? '<br/><br/>' : '') + warns.join('<br/>')
    if (noteHtml) vals.note = noteHtml

    // Regroupement : si ce client a déjà une commande/devis pour la MÊME date + heure
    // (brouillon OU confirmée — jamais annulée), on y AJOUTE les articles au lieu de créer
    // une 2e commande. Si elle est déjà confirmée, on flague l'ajout (cuisine) pour ne pas le rater.
    let orderId = null
    let merged = false
    let mergedConfirmed = false
    if (vals.commitment_date) {
      try {
        const ex = await odooSearchRead(uid, 'sale.order',
          [['partner_id', '=', partnerId], ['commitment_date', '=', vals.commitment_date], ['state', 'in', ['draft', 'sent', 'sale']]],
          ['id', 'note', 'state'], { order: 'id desc', limit: 1 })
        if (ex && ex.length) {
          orderId = ex[0].id
          merged = true
          mergedConfirmed = ex[0].state === 'sale'
          const writeVals = { order_line: orderLines }
          if (noteHtml) writeVals.note = ex[0].note ? `${ex[0].note}<br/><br/>${noteHtml}` : noteHtml
          await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'write', [[orderId], writeVals]])
          if (mergedConfirmed) {
            try {
              await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'message_post', [[orderId]],
                { body: '⚠️ Article(s) ajouté(s) par le client APRÈS confirmation (via le lien commande) — à vérifier en cuisine.' }])
            } catch (e) { console.warn('[devis-merge chatter]', e?.message || e) }
          }
        }
      } catch (e) { console.warn('[devis-merge]', e?.message || e) }
    }
    if (!orderId) orderId = await odooCreate(uid, 'sale.order', vals)

    // Photos (modèle de gâteau) → attachées à CHAQUE ARTICLE précis (sa ligne), pas à
    // la commande entière. Ainsi chaque gâteau/accessoire montre UNIQUEMENT sa photo
    // (fiche, calendrier, impression), sans déborder sur les autres articles.
    const created = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['name', 'order_line'])
    const allLineIds = (created[0]?.order_line) || []
    // Nos lignes = les dernières créées (en cas de fusion, elles sont ajoutées à la fin).
    const newLineIds = allLineIds.slice(Math.max(0, allLineIds.length - lines.length))
    let nbPhotos = 0
    for (let i = 0; i < lines.length; i++) {
      const ph = lines[i].photo
      const lineId = newLineIds[i]
      if (ph?.data && lineId) {
        try {
          await odooCreate(uid, 'ir.attachment', {
            name: ph.name || `photo-${i + 1}.jpg`,
            datas: ph.data,
            res_model: 'sale.order.line',
            res_id: lineId,
            mimetype: ph.mimetype || 'image/jpeg',
          })
          nbPhotos++
        } catch (e) { console.warn('[order-photo]', e?.message || e) }
      }
    }
    if (nbPhotos) {
      try {
        const s = nbPhotos > 1 ? 's' : ''
        await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'message_post', [[orderId]],
          { body: `📸 ${nbPhotos} photo${s} de modèle ajoutée${s} sur l'article${s} (depuis l'app)` }])
      } catch (e) { console.warn('[order-photo note]', e?.message || e) }
    }

    // Badge « 🎂 Commande » : marque la conversation du client (recherche par 9 derniers chiffres).
    if (clientPhone) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const last9 = String(clientPhone).replace(/\D/g, '').slice(-9)
        if (last9) {
          const { data: convs } = await supabase.from('conversations').select('id').ilike('client_phone', `%${last9}%`).limit(1)
          const conv = (convs || [])[0]
          if (conv) await supabase.from('conversations').update({ link_order_at: new Date().toISOString(), link_order_ref: created[0]?.name || null }).eq('id', conv.id)
        }
      } catch (e) { console.warn('[order-flag-conv]', e?.message || e) }
    }

    // Devis créé via le LIEN client : devis envoyé au client si prix FERME (part fixée),
    // sinon on alerte le commercial qu'une commande en ligne est à chiffrer.
    if (clientPhone && req.body?.source === 'client') {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const orderName = created[0]?.name || ''
        const firm = !!req.body?.firm
        const clientName = (req.body?.clientName || '').trim()
        const number = normalizePhone(clientPhone)
        const conv = await getOrCreateConversation(supabase, number, clientName || null)
        const sentAt = new Date().toISOString()
        if (firm) {
          // Devis DÉTAILLÉ, sans émoticônes (un article par ligne, comme l'onglet Devis).
          const retrait = note ? String(note).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : `${deliveryDate || ''} ${deliveryTime || ''}`.trim()
          // En cas de fusion, on recalcule total + détail sur la commande COMPLÈTE (tous les articles).
          let total, detailLignes
          if (merged) {
            const full = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['amount_total'])
            total = Math.round(full?.[0]?.amount_total || 0)
            const allLines = await odooSearchRead(uid, 'sale.order.line',
              [['order_id', '=', orderId], ['display_type', '=', false], ['product_uom_qty', '>', 0]],
              ['name', 'product_uom_qty', 'price_subtotal'])
            detailLignes = allLines.map(l => `- ${Number(l.product_uom_qty) > 1 ? `${Math.round(l.product_uom_qty)}x ` : ''}${String(l.name).replace(/^(CD-|GM-|GMD-)\s*/i, '').replace(/\n/g, ', ')} : ${Math.round(l.price_subtotal || 0)} DH`).join('\n')
          } else {
            total = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 1), 0)
            detailLignes = lines.map(l => `- ${Number(l.qty) > 1 ? `${l.qty}x ` : ''}${String(l.name).replace(/^(CD-|GM-|GMD-)\s*/i, '')}${l.desc ? ` (${String(l.desc).replace(/\n/g, ', ')})` : ''} : ${Math.round(Number(l.price) || 0)} DH`).join('\n')
          }
          const clientText = `Bonjour ${clientName.split(/\s+/)[0] || ''},\nVoici votre devis ${orderName}${merged ? ' (mis à jour)' : ''} :\n${detailLignes}\nMontant total : ${Math.round(total)} DH\nRetrait : ${retrait}\n\nMerci de nous confirmer pour valider.`
          const tmplDetail = lines.map(l => `${String(l.name).replace(/^(CD-|GM-|GMD-)\s*/i, '')} x${l.qty || 1} - ${Math.round(Number(l.price) || 0)} DH`).join(' ; ')
          const tmplParams = [
            { name: '1', value: clientName.split(/\s+/)[0] || 'Bonjour' },
            { name: '2', value: orderName },
            { name: '3', value: `Montant : ${Math.round(total)} DH. ${tmplDetail}. Retrait : ${retrait}` },
          ]
          try { await sendReminderWhatsapp(supabase, number, clientText, { name: 'devis_validation', parameters: tmplParams }) } catch (e) { console.warn('[client-devis-wa]', e?.message || e) }
          const flag = mergedConfirmed ? ' ⚠️ AJOUT à une commande DÉJÀ CONFIRMÉE — à vérifier en cuisine.' : ''
          await supabase.from('messages').insert({ conversation_id: conv.id, sender_type: 'agent', body: `Commande en ligne : devis ${orderName} envoye au client (total ${Math.round(total)} DH).${flag}`, sent_at: sentAt })
        } else {
          const flag = mergedConfirmed ? ' ⚠️ AJOUT à une commande DÉJÀ CONFIRMÉE — à vérifier en cuisine.' : ''
          await supabase.from('messages').insert({ conversation_id: conv.id, sender_type: 'agent', body: `Commande en ligne recue : devis ${orderName} A CHIFFRER (le client a rempli sa commande, prix a confirmer).${flag}`, sent_at: sentAt })
        }
        await supabase.from('conversations').update({ last_message_at: sentAt, updated_at: sentAt, status: 'en_cours' }).eq('id', conv.id)
        try { await notifyConversationUsers(supabase, conv.id, clientName || number, mergedConfirmed ? `⚠️ Ajout sur commande confirmée ${orderName}` : (firm ? `Devis ${orderName} (commande en ligne)` : `Devis ${orderName} à chiffrer`)) } catch { /* notif best-effort */ }
      } catch (e) { console.warn('[order-client-followup]', e?.message || e) }
    }

    return res.status(200).json({ id: orderId, name: created[0]?.name || null })
  } catch (e) {
    console.error('[order-create-devis]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Ouvre une session web Odoo (pour télécharger le PDF d'un rapport). Renvoie le cookie session_id.
async function odooWebLogin() {
  const r = await fetch(`${process.env.ODOO_URL}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', params: { db: process.env.ODOO_DB, login: process.env.ODOO_USERNAME, password: process.env.ODOO_PASSWORD } }),
  })
  const setCookie = r.headers.get('set-cookie') || ''
  const m = setCookie.match(/session_id=([^;]+)/)
  if (!m) throw new Error('Session Odoo non obtenue')
  return m[1]
}

// Photos (pièces jointes image) d'un devis/commande Odoo. Lecture seule. Renvoie des images base64.
async function handleDevisPhotos(req, res) {
  let orderId = req.body?.orderId
  const orderNum = (req.body?.orderNum || '').trim()
  if (!orderId && !orderNum) return res.status(400).json({ error: 'orderId/orderNum manquant' })
  const limit = Math.max(1, Math.min(12, Number(req.body?.limit) || 12))
  try {
    const uid = await odooAuthenticate()
    // Calendrier : on n'a que le n° (S…) → on résout l'id Odoo réel.
    if (!orderId && orderNum) {
      const o = await odooSearchRead(uid, 'sale.order', [['name', '=', orderNum]], ['id'], { limit: 1 })
      orderId = o[0]?.id
    }
    if (!orderId) return res.status(200).json({ photos: [] })
    // Les photos (cake design) sont attachées aux LIGNES de commande, pas à l'entête.
    const ord = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['order_line'])
    const lineIds = (ord[0]?.order_line) || []
    // pièces jointes image, sur l'entête OU sur les lignes
    const domain = ['&', ['mimetype', 'ilike', 'image'], '|',
      '&', ['res_model', '=', 'sale.order'], ['res_id', '=', orderId],
      '&', ['res_model', '=', 'sale.order.line'], ['res_id', 'in', lineIds]]
    const atts = await odooSearchRead(uid, 'ir.attachment', domain,
      ['id', 'name', 'mimetype', 'datas'], { limit })
    // Dedup : la même image peut être attachée 2 fois (lien client + Articles…).
    // Même contenu base64 = même photo → on ne la garde qu'une fois.
    const seenData = new Set()
    const photos = (atts || [])
      .filter(a => a.datas)
      .filter(a => { if (seenData.has(a.datas)) return false; seenData.add(a.datas); return true })
      .map(a => ({ id: a.id, name: a.name, dataUrl: `data:${a.mimetype || 'image/jpeg'};base64,${a.datas}` }))
    return res.status(200).json({ photos })
  } catch (e) {
    console.error('[devis-photos]', e?.message || e)
    return res.status(200).json({ photos: [], error: e?.message || 'indispo' })
  }
}

// Liste des devis non confirmés (sale.order en brouillon / envoyé). Lecture seule.
async function handleDevisList(req, res) {
  const query = (req.body?.query || '').trim()
  try {
    const uid = await odooAuthenticate()
    // Plancher = hier (tampon de fuseau) : on ne charge pas les anciennes commandes.
    const floor = new Date(); floor.setDate(floor.getDate() - 1)
    const floorStr = `${floor.getFullYear()}-${String(floor.getMonth() + 1).padStart(2, '0')}-${String(floor.getDate()).padStart(2, '0')} 00:00:00`
    // Exclut le pseudo-client "vitrine".
    // On garde TOUS les "Devis internet" (state=sent), et seulement les brouillons RÉCENTS (date >= hier).
    let domain = ['&', ['partner_id', 'not ilike', 'vitrin'],
      '|', ['state', '=', 'sent'],
      '&', ['state', '=', 'draft'], ['commitment_date', '>=', floorStr]]
    if (query.length >= 2) {
      // En recherche : on autorise n'importe quel devis daté (pour retrouver par n°), sans plancher.
      const digits = query.replace(/\D/g, '')
      const ors = [['name', 'ilike', query], ['partner_id', 'ilike', query]]
      if (digits.length >= 6) {
        const last9 = digits.slice(-9)
        ors.push(['partner_id.phone', 'ilike', last9], ['partner_id.mobile', 'ilike', last9])
      }
      domain = ['&', '&', '&', ['state', 'in', ['draft', 'sent']], ['partner_id', 'not ilike', 'vitrin'], ['commitment_date', '!=', false],
        ...Array(ors.length - 1).fill('|'), ...ors]
    }
    const orders = await odooSearchRead(uid, 'sale.order', domain,
      ['name', 'partner_id', 'commitment_date', 'date_order', 'amount_total', 'order_line', 'state', 'note', 'user_id'],
      { order: 'commitment_date asc', limit: 300 })
    if (!orders.length) return res.status(200).json({ orders: [] })

    const partnerIds = [...new Set(orders.map(o => Array.isArray(o.partner_id) ? o.partner_id[0] : null).filter(Boolean))]
    const partners = partnerIds.length
      ? await odooSearchRead(uid, 'res.partner', [['id', 'in', partnerIds]], ['id', 'phone', 'mobile'])
      : []
    const phoneById = new Map(partners.map(p => [p.id, normalizePhone(p.mobile || p.phone)]))

    const lineIds = orders.flatMap(o => Array.isArray(o.order_line) ? o.order_line : [])
    const lines = lineIds.length
      ? await odooSearchRead(uid, 'sale.order.line', [['id', 'in', lineIds]],
          ['id', 'order_id', 'name', 'product_uom_qty', 'price_total', 'display_type'])
      : []
    const linesByOrder = new Map()
    const orderByLine = new Map()
    for (const l of lines) {
      const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
      orderByLine.set(l.id, oid)
      if (l.display_type) continue
      const nm = (l.name || '').replace(/\s+/g, ' ').trim()
      if (/^(Acompte|Down\s+Payment)/i.test(nm)) continue
      if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
      linesByOrder.get(oid).push({ text: nm, qty: String(l.product_uom_qty), price: String(l.price_total) })
    }

    // Quelles commandes ont une photo (sur l'entête OU sur une ligne) — 1 requête.
    const orderIds = orders.map(o => o.id)
    let withPhoto = new Set()
    try {
      const atts = await odooSearchRead(uid, 'ir.attachment',
        ['&', ['mimetype', 'ilike', 'image'], '|',
          '&', ['res_model', '=', 'sale.order'], ['res_id', 'in', orderIds],
          '&', ['res_model', '=', 'sale.order.line'], ['res_id', 'in', lineIds]],
        ['res_model', 'res_id'], { limit: 1000 })
      for (const a of (atts || [])) {
        if (a.res_model === 'sale.order') withPhoto.add(a.res_id)
        else { const oid = orderByLine.get(a.res_id); if (oid) withPhoto.add(oid) }
      }
    } catch (_) { /* attachments indispo → pas d'indicateur photo */ }

    const result = orders.map(o => {
      const pid = Array.isArray(o.partner_id) ? o.partner_id[0] : null
      return {
        id: o.id,
        name: o.name,
        state: o.state,
        clientName: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
        clientPhone: pid ? (phoneById.get(pid) || '') : '',
        amountText: fmtAmount(o.amount_total),
        pickupText: fmtPickup(o.commitment_date),
        dateOrder: o.date_order || '',
        deliveryAt: o.commitment_date || '',
        note: (o.note && typeof o.note === 'string') ? o.note.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
        hasPhoto: withPhoto.has(o.id),
        sellerName: Array.isArray(o.user_id) ? o.user_id[1] : '',
        productLines: linesByOrder.get(o.id) || [],
      }
    })
    return res.status(200).json({ orders: result })
  } catch (e) {
    console.error('[devis-list]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Liste les commandes CONFIRMÉES (sale.order state=sale) avec lignes (qty + prix),
// commentaire et infos client — pour l'affichage "comme les devis".
async function handleOrdersConfirmed(req, res) {
  const query = (req.body?.query || '').trim()
  try {
    const uid = await odooAuthenticate()
    let domain = [['state', '=', 'sale'], ['partner_id', 'not ilike', 'vitrin']]
    if (query.length >= 2) {
      const digits = query.replace(/\D/g, '')
      const ors = [['name', 'ilike', query], ['partner_id', 'ilike', query]]
      if (digits.length >= 6) {
        const last9 = digits.slice(-9)
        ors.push(['partner_id.phone', 'ilike', last9], ['partner_id.mobile', 'ilike', last9])
      }
      domain = ['&', '&', ['state', '=', 'sale'], ['partner_id', 'not ilike', 'vitrin'],
        ...Array(ors.length - 1).fill('|'), ...ors]
    }
    const orders = await odooSearchRead(uid, 'sale.order', domain,
      ['name', 'partner_id', 'commitment_date', 'date_order', 'amount_total', 'order_line', 'state', 'note', 'user_id'],
      { order: 'commitment_date desc', limit: 80 })
    if (!orders.length) return res.status(200).json({ orders: [] })

    const partnerIds = [...new Set(orders.map(o => Array.isArray(o.partner_id) ? o.partner_id[0] : null).filter(Boolean))]
    const partners = partnerIds.length
      ? await odooSearchRead(uid, 'res.partner', [['id', 'in', partnerIds]], ['id', 'phone', 'mobile'])
      : []
    const phoneById = new Map(partners.map(p => [p.id, normalizePhone(p.mobile || p.phone)]))

    const lineIds = orders.flatMap(o => Array.isArray(o.order_line) ? o.order_line : [])
    const lines = lineIds.length
      ? await odooSearchRead(uid, 'sale.order.line', [['id', 'in', lineIds]],
          ['id', 'order_id', 'name', 'product_uom_qty', 'price_total', 'display_type'])
      : []
    const linesByOrder = new Map()
    const orderByLine = new Map()
    for (const l of lines) {
      const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
      orderByLine.set(l.id, oid)
      if (l.display_type) continue
      const nm = (l.name || '').replace(/\s+/g, ' ').trim()
      if (/^(Acompte|Down\s+Payment)/i.test(nm)) continue
      const qty = l.product_uom_qty || 0
      const label = `${qty}× ${nm} — ${fmtAmount(l.price_total)}`
      if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
      linesByOrder.get(oid).push(label)
    }
    const stripHtml = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

    // Quelles commandes ont une photo (entête OU ligne) — pour éviter des appels inutiles.
    const orderIds = orders.map(o => o.id)
    let withPhoto = new Set()
    try {
      const atts = await odooSearchRead(uid, 'ir.attachment',
        ['&', ['mimetype', 'ilike', 'image'], '|',
          '&', ['res_model', '=', 'sale.order'], ['res_id', 'in', orderIds],
          '&', ['res_model', '=', 'sale.order.line'], ['res_id', 'in', lineIds]],
        ['res_model', 'res_id'], { limit: 1000 })
      for (const a of (atts || [])) {
        if (a.res_model === 'sale.order') withPhoto.add(a.res_id)
        else { const oid = orderByLine.get(a.res_id); if (oid) withPhoto.add(oid) }
      }
    } catch (_) { /* indispo */ }

    const result = orders.map(o => {
      const pid = Array.isArray(o.partner_id) ? o.partner_id[0] : null
      return {
        id: o.id,
        name: o.name,
        state: o.state,
        clientName: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
        clientPhone: pid ? (phoneById.get(pid) || '') : '',
        amountText: fmtAmount(o.amount_total),
        pickupText: fmtPickup(o.commitment_date),
        dateOrder: o.date_order || '',
        deliveryAt: o.commitment_date || '',
        productLines: linesByOrder.get(o.id) || [],
        note: stripHtml(o.note),
        sellerName: Array.isArray(o.user_id) ? o.user_id[1] : '',
        hasPhoto: withPhoto.has(o.id),
      }
    })
    return res.status(200).json({ orders: result })
  } catch (e) {
    console.error('[orders-confirmed]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Confirme un devis (sale.order brouillon/envoyé) directement dans Odoo.
// Effet réel côté Odoo (action_confirm) → on vérifie l'état avant d'agir.
async function handleDevisConfirm(req, res) {
  const id = Number(req.body?.id)
  if (!id) return res.status(400).json({ error: 'id du devis requis' })
  try {
    const uid = await odooAuthenticate()
    const found = await odooSearchRead(uid, 'sale.order', [['id', '=', id]], ['name', 'state'])
    if (!found.length) return res.status(404).json({ error: 'Devis introuvable dans Odoo' })
    const { name, state } = found[0]
    if (!['draft', 'sent'].includes(state)) {
      return res.status(409).json({ error: `Ce devis n'est plus à confirmer (état Odoo : ${state})`, name, state })
    }
    // Confirmation réelle dans Odoo
    await odooJsonRpc('object', 'execute_kw', [
      process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'action_confirm', [[id]],
    ])
    const after = await odooSearchRead(uid, 'sale.order', [['id', '=', id]], ['name', 'state'])
    const newState = after[0]?.state || 'sale'
    console.log(`[devis-confirm] ${name} (id ${id}) confirmé par user=${req.body?.actorId || '?'} → ${newState}`)
    return res.status(200).json({ ok: true, name, state: newState })
  } catch (e) {
    console.error('[devis-confirm]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Annule une commande/devis (sale.order) directement dans Odoo (action_cancel).
// Effet réel côté Odoo. Idempotent : si déjà annulé, on renvoie ok.
async function handleDevisCancel(req, res) {
  const id = Number(req.body?.id)
  if (!id) return res.status(400).json({ error: 'id de la commande requis' })
  try {
    const uid = await odooAuthenticate()
    const found = await odooSearchRead(uid, 'sale.order', [['id', '=', id]], ['name', 'state', 'partner_id'])
    if (!found.length) return res.status(404).json({ error: 'Commande introuvable dans Odoo' })
    const { name, state } = found[0]
    const partnerName = Array.isArray(found[0].partner_id) ? found[0].partner_id[1] : ''
    if (state === 'cancel') return res.status(200).json({ ok: true, name, state, already: true })
    await odooJsonRpc('object', 'execute_kw', [
      process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'action_cancel', [[id]],
    ])
    const after = await odooSearchRead(uid, 'sale.order', [['id', '=', id]], ['name', 'state'])
    const newState = after[0]?.state || 'cancel'
    console.log(`[devis-cancel] ${name} (id ${id}) annulé par user=${req.body?.actorId || '?'} → ${newState}`)
    // Devis OCP annulé → notif aux mêmes destinataires (admins + « Notif devis OCP »).
    if (/\bOCP\b/i.test(partnerName)) notifyOcpCancel(name).catch(() => {})
    return res.status(200).json({ ok: true, name, state: newState })
  } catch (e) {
    console.error('[devis-cancel]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Remet une commande ANNULÉE en DEVIS (brouillon) dans Odoo (action_draft).
// Accepte l'id Odoo OU le n° (S…). Effet réel. Idempotent si déjà en devis.
async function handleDevisRestore(req, res) {
  let id = Number(req.body?.id) || null
  const orderNum = (req.body?.orderNum || '').trim()
  if (!id && !orderNum) return res.status(400).json({ error: 'id ou n° de la commande requis' })
  try {
    const uid = await odooAuthenticate()
    const domain = id ? [['id', '=', id]] : [['name', '=', orderNum]]
    const found = await odooSearchRead(uid, 'sale.order', domain, ['id', 'name', 'state'], { limit: 1 })
    if (!found.length) return res.status(404).json({ error: 'Commande introuvable dans Odoo' })
    id = found[0].id
    const { name, state } = found[0]
    if (state === 'draft' || state === 'sent') return res.status(200).json({ ok: true, name, state, already: true })
    await odooJsonRpc('object', 'execute_kw', [
      process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, 'sale.order', 'action_draft', [[id]],
    ])
    const after = await odooSearchRead(uid, 'sale.order', [['id', '=', id]], ['name', 'state'])
    const newState = after[0]?.state || 'draft'
    console.log(`[devis-restore] ${name} (id ${id}) remis en devis par user=${req.body?.actorId || '?'} → ${newState}`)
    return res.status(200).json({ ok: true, id, name, state: newState })
  } catch (e) {
    console.error('[devis-restore]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Construit, à partir de fiches produit (product.template déjà chargées avec les
// champs description), la liste { id, name, descriptif, variants:[{size,price}] }.
async function buildLabelProducts(uid, tmpls) {
  if (!tmpls.length) return []
  const ids = tmpls.map(t => t.id)
  const vars = await odooSearchRead(uid, 'product.product',
    [['product_tmpl_id', 'in', ids], ['active', '=', true]],
    ['product_tmpl_id', 'lst_price', 'product_template_attribute_value_ids'], { limit: 2000 })
  const ptavIds = [...new Set((vars || []).flatMap(v => v.product_template_attribute_value_ids || []))]
  const ptav = ptavIds.length
    ? await odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
        'product.template.attribute.value', 'read', [ptavIds, ['name', 'attribute_id']]])
    : []
  const ptavMap = new Map((ptav || []).map(a => [a.id, { name: a.name, attr: Array.isArray(a.attribute_id) ? a.attribute_id[1] : '' }]))
  const stripHtml = s => (s && typeof s === 'string') ? s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : ''
  const byTmpl = new Map()
  for (const t of tmpls) {
    byTmpl.set(t.id, {
      id: t.id,
      name: (t.name || '').replace(/^[A-Z]{1,3}[-.]\s*/, '').trim(),
      descriptif: stripHtml(t.price_description) || stripHtml(t.description_sale) || stripHtml(t.website_description) || stripHtml(t.description) || '',
      variants: [],
    })
  }
  for (const v of (vars || [])) {
    if (!(v.lst_price > 0)) continue
    const tid = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id
    const entry = byTmpl.get(tid)
    if (!entry) continue
    const vals = (v.product_template_attribute_value_ids || []).map(id => ptavMap.get(id)).filter(Boolean)
    const sizeVal = vals.find(x => /person|taille|pers|nombre|portion|pi[eè]ce|cm/i.test(x.attr)) || vals.find(x => /^\d+$/.test((x.name || '').trim())) || vals[0]
    entry.variants.push({ size: sizeVal ? sizeVal.name : '', price: v.lst_price })
  }
  return [...byTmpl.values()].map(p => {
    const seen = new Set(), uniq = []
    for (const vv of p.variants.sort((a, b) => a.price - b.price)) {
      const k = `${vv.size}|${vv.price}`
      if (!seen.has(k)) { seen.add(k); uniq.push(vv) }
    }
    return { ...p, variants: uniq }
  }).filter(p => p.variants.length > 0)
}

const LABEL_TMPL_FIELDS = ['id', 'name', 'price_description', 'description_sale', 'website_description', 'description']

// Recherche de produits par nom (pour imprimer les étiquettes prix).
async function handleProductLabels(req, res) {
  const query = (req.body?.query || '').trim()
  if (query.length < 2) return res.status(200).json({ products: [] })
  try {
    const uid = await odooAuthenticate()
    const tmpls = await odooSearchRead(uid, 'product.template',
      [['sale_ok', '=', true], ['name', 'ilike', query]], LABEL_TMPL_FIELDS, { limit: 30 })
    return res.status(200).json({ products: await buildLabelProducts(uid, tmpls) })
  } catch (e) {
    console.error('[product-labels]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Génération en lot par famille : entremets / cakes / cookies / viennoiserie.
async function handleProductLabelsGroup(req, res) {
  const group = (req.body?.group || '').trim()
  try {
    const uid = await odooAuthenticate()
    let domain, jsFilter = null
    if (group === 'entremets') {
      domain = [['sale_ok', '=', true], ['name', '=like', 'E-%']]
    } else if (group === 'cookies') {
      domain = [['sale_ok', '=', true], ['name', 'ilike', 'cookie']]
    } else if (group === 'cakes') {
      // Les « cakes » de voyage = produits « V- Cake … » (pas cupcakes / cheesecake / cake design).
      domain = [['sale_ok', '=', true], ['name', '=like', 'V- Cake%']]
    } else if (group === 'viennoiserie') {
      domain = [['sale_ok', '=', true], ['name', '=like', 'V-%']]
      jsFilter = t => /croissant|pain|viennois|brioche|chausson/i.test(t.name || '')
    } else {
      return res.status(400).json({ error: 'groupe inconnu' })
    }
    let tmpls = await odooSearchRead(uid, 'product.template', domain, LABEL_TMPL_FIELDS, { limit: 200 })
    if (jsFilter) tmpls = tmpls.filter(jsFilter)
    return res.status(200).json({ products: await buildLabelProducts(uid, tmpls) })
  } catch (e) {
    console.error('[product-labels-group]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Recherche de factures clients existantes (nom client, n° commande, n° facture). Vide = récentes.
async function handleInvoicesSearch(req, res) {
  const query = (req.body?.query || '').trim()
  try {
    const uid = await odooAuthenticate()
    // On ne garde QUE les factures générées par le POS (boutique) : pos_order_ids
    // non vide. Les factures manuelles / de commande (origine S…) sont exclues.
    let domain = [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['pos_order_ids', '!=', false]]
    if (query.length >= 2) {
      domain = ['&', '&', '&', ['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['pos_order_ids', '!=', false],
        '|', '|', ['name', 'ilike', query], ['invoice_origin', 'ilike', query], ['partner_id', 'ilike', query]]
    }
    const moves = await odooSearchRead(uid, 'account.move', domain,
      ['id', 'name', 'invoice_origin', 'partner_id', 'invoice_date', 'amount_total', 'state'],
      { order: 'invoice_date desc, id desc', limit: 30 })
    const invoices = (moves || []).map(m => ({
      id: m.id,
      name: m.name,
      origin: m.invoice_origin || '',
      partner: Array.isArray(m.partner_id) ? m.partner_id[1] : '',
      date: m.invoice_date || '',
      amount: m.amount_total || 0,
      state: m.state,
    }))
    return res.status(200).json({ invoices })
  } catch (e) {
    console.error('[invoices-search]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Récupère le PDF d'une facture DÉJÀ EXISTANTE dans Odoo (aucune création/modification).
async function handleInvoicePdf(req, res) {
  const orderNum = (req.body?.orderNum || '').trim()
  const invoiceId = req.body?.invoiceId
  try {
    const uid = await odooAuthenticate()

    // Mode diagnostic : renvoie quelques factures clients récentes (pour test).
    if (req.body?.sample) {
      const sample = await odooSearchRead(uid, 'account.move',
        [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
        ['id', 'name', 'invoice_origin', 'state'], { limit: 5, order: 'id desc' })
      return res.status(200).json({ sample })
    }

    let target = null
    if (invoiceId) {
      // PDF directement par id de facture (depuis la recherche).
      const m = await odooSearchRead(uid, 'account.move', [['id', '=', invoiceId]], ['id', 'name', 'state', 'move_type'], { limit: 1 })
      target = m[0] || null
    } else {
      if (!orderNum) return res.status(400).json({ error: 'Numéro de commande manquant' })
      // Trouver les factures de la commande : via sale.order.invoice_ids, sinon invoice_origin.
      let invoices = []
      const so = await odooSearchRead(uid, 'sale.order', [['name', '=', orderNum]], ['invoice_ids'], { limit: 1 })
      const invIds = so[0]?.invoice_ids || []
      if (invIds.length) {
        invoices = await odooSearchRead(uid, 'account.move', [['id', 'in', invIds]], ['id', 'name', 'state', 'move_type'])
      }
      if (!invoices.length) {
        invoices = await odooSearchRead(uid, 'account.move',
          [['invoice_origin', '=', orderNum], ['move_type', '=', 'out_invoice']],
          ['id', 'name', 'state', 'move_type'])
      }
      const clientInv = invoices.filter(m => m.move_type === 'out_invoice')
      target = clientInv.find(m => m.state === 'posted') || clientInv[0] || null
    }
    if (!target) return res.status(200).json({ error: 'Aucune facture trouvée.' })

    // Télécharger le PDF du rapport facture (session web).
    const session = await odooWebLogin()
    const pdfUrl = `${process.env.ODOO_URL}/report/pdf/account.report_invoice/${target.id}`
    const pr = await fetch(pdfUrl, { headers: { Cookie: `session_id=${session}` } })
    if (!pr.ok) return res.status(502).json({ error: `PDF Odoo indisponible (HTTP ${pr.status})` })
    const b64 = Buffer.from(await pr.arrayBuffer()).toString('base64')
    return res.status(200).json({ name: target.name, state: target.state, pdf: b64 })
  } catch (e) {
    console.error('[invoice-pdf]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// "1 650,00 DH"
function fmtAmount(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n) || 0) + ' DH'
}
// "24/05/2026 15:00" depuis le format Odoo "YYYY-MM-DD HH:MM:SS" (stocké en UTC).
// Converti à l'heure du Maroc (Africa/Casablanca gère aussi le Ramadan/UTC+0).
// Convertit une date + heure LOCALE (Maroc) en datetime UTC "YYYY-MM-DD HH:MM:SS" pour Odoo.
// Odoo stocke en UTC ; sans ça, "19:00" saisi s'affichait "20:00" (Maroc = UTC+1).
function moroccoLocalToUtc(dateStr, timeStr) {
  const [Y, M, D] = String(dateStr).split('-').map(Number)
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number)
  // Décalage Maroc (UTC+1, ou UTC+0 pendant le Ramadan) calculé pour CETTE date.
  const probe = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0))
  const loc = new Date(probe.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }))
  const utc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetH = Math.round((loc - utc) / 3600000)
  const dt = new Date(Date.UTC(Y, M - 1, D, (hh || 0) - offsetH, mm || 0, 0))
  return dt.toISOString().slice(0, 19).replace('T', ' ')
}

function fmtPickup(s) {
  if (!s) return ''
  const d = new Date(String(s).replace(' ', 'T') + 'Z')
  if (isNaN(d)) return String(s)
  return d.toLocaleString('fr-FR', {
    timeZone: 'Africa/Casablanca',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
// Numéro au format WATI (chiffres, indicatif marocain) : 0661… -> 212661…
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('212')) return d
  if (d.startsWith('0')) return '212' + d.slice(1)
  return d
}

// Renvoie tous les clients ayant au moins un devis/commande : { name, phone }.
// Sert à la mise à jour EN MASSE des noms de conversations.
async function handleOrderClients(req, res) {
  try {
    const uid = await odooAuthenticate()
    const orders = await odooSearchRead(uid, 'sale.order', [], ['partner_id'], { limit: 10000, order: 'id desc' })
    const pids = [...new Set(orders.map(o => Array.isArray(o.partner_id) ? o.partner_id[0] : null).filter(Boolean))]
    if (!pids.length) return res.status(200).json({ clients: [] })
    const partners = await odooSearchRead(uid, 'res.partner', [['id', 'in', pids]], ['id', 'name', 'phone', 'mobile'], { limit: pids.length })
    const clients = partners
      .map(p => ({ name: (p.name || '').trim(), phone: normalizePhone(p.mobile || p.phone) }))
      .filter(c => c.name && c.phone)
    return res.status(200).json({ clients })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Nettoie une note Odoo (stockée en HTML) → texte simple.
function cleanOdooNote(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim()
}

// Note (commentaire) d'UNE commande Odoo par n° (ex. « ⚠️ … chocolat blanc… »).
async function handleOrderNote(req, res) {
  const orderNum = (req.body?.orderNum || '').trim()
  if (!orderNum) return res.status(200).json({ note: '' })
  try {
    const uid = await odooAuthenticate()
    const orders = await odooSearchRead(uid, 'sale.order', [['name', '=', orderNum]], ['note'], { limit: 1 })
    return res.status(200).json({ note: cleanOdooNote(orders[0]?.note) })
  } catch (e) {
    console.error('[order-note]', e?.message || e)
    return res.status(200).json({ note: '' })
  }
}

// Notes de PLUSIEURS commandes en UN seul appel (pour l'impression en lot). { notes: { S123: "…" } }
async function handleOrdersNotes(req, res) {
  const nums = Array.isArray(req.body?.orderNums) ? req.body.orderNums.filter(Boolean) : []
  if (!nums.length) return res.status(200).json({ notes: {} })
  try {
    const uid = await odooAuthenticate()
    const orders = await odooSearchRead(uid, 'sale.order', [['name', 'in', nums]], ['name', 'note'], { limit: nums.length })
    const notes = {}
    for (const o of orders) { const t = cleanOdooNote(o.note); if (t) notes[o.name] = t }
    return res.status(200).json({ notes })
  } catch (e) {
    console.error('[orders-notes]', e?.message || e)
    return res.status(200).json({ notes: {} })
  }
}

// Vrai cake design ? (exclut les pseudo-produits CD- Bougies / Topper, comme le calendrier).
function isRealCakeLine(name) {
  const head = String(name || '').split(/\b(?:th[èe]me|message|âge|age)\b/i)[0]
  return !/bougie|topper/i.test(head)
}

// Heure Maroc (0-23) d'une date UTC Odoo "YYYY-MM-DD HH:MM:SS". Gère Ramadan/UTC+0.
function moroccoHourFromUtc(utcStr) {
  if (!utcStr) return null
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z')
  if (isNaN(d)) return null
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', hourCycle: 'h23' }).format(d))
}

// Charge CAKE DESIGN (CD-) par créneau horaire d'un jour donné (pour guider le planning).
// Entrée { date: "YYYY-MM-DD" } → { counts: { 16: 4, 14: 1, … } } (nb de CD- par heure Maroc).
async function handleCdLoad(req, res) {
  const date = (req.body?.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(200).json({ counts: {} })
  try {
    const uid = await odooAuthenticate()
    const startUtc = moroccoLocalToUtc(date, '00:00')
    const endUtc = moroccoLocalToUtc(date, '23:59')
    const orders = await odooSearchRead(uid, 'sale.order',
      [['commitment_date', '>=', startUtc], ['commitment_date', '<=', endUtc], ['state', '!=', 'cancel']],
      ['id', 'commitment_date', 'order_line'])
    if (!orders.length) return res.status(200).json({ counts: {} })
    const lineIds = orders.flatMap(o => Array.isArray(o.order_line) ? o.order_line : [])
    const cdLines = lineIds.length ? await odooSearchRead(uid, 'sale.order.line',
      [['id', 'in', lineIds], ['product_id.product_tmpl_id.name', '=ilike', 'CD-%'], ['product_uom_qty', '>', 0]],
      ['order_id', 'name']) : []
    const hourByOrder = new Map()
    for (const o of orders) hourByOrder.set(o.id, moroccoHourFromUtc(o.commitment_date))
    const counts = {}
    for (const l of cdLines) {
      if (!isRealCakeLine(l.name)) continue
      const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
      const h = hourByOrder.get(oid)
      if (h == null) continue
      counts[h] = (counts[h] || 0) + 1
    }
    return res.status(200).json({ counts })
  } catch (e) {
    console.error('[cd-load]', e?.message || e)
    return res.status(200).json({ counts: {} })
  }
}

// Nb de personnes depuis un nom de ligne CD- (formats « (10, … » ou « personnes : 10 »).
function persFromLineName(name) {
  const s = String(name || '')
  let m = s.match(/nombre de personnes\s*:?\s*(\d+)/i)
  if (m) return Number(m[1])
  m = s.match(/\((\d+)\b/)
  if (m) return Number(m[1])
  m = s.match(/(\d+)\s*(pers|personne|portion)/i)
  if (m) return Number(m[1])
  return null
}

// Détail des CAKE DESIGN d'un créneau (photo + nb pers) → pour juger si on peut en ajouter.
// Entrée { date, hour } → { items: [{ orderRef, pers, photo }] }.
async function handleCdSlot(req, res) {
  const date = (req.body?.date || '').trim()
  const hour = Number(req.body?.hour)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hour)) return res.status(200).json({ items: [] })
  try {
    const uid = await odooAuthenticate()
    const startUtc = moroccoLocalToUtc(date, '00:00')
    const endUtc = moroccoLocalToUtc(date, '23:59')
    const orders = await odooSearchRead(uid, 'sale.order',
      [['commitment_date', '>=', startUtc], ['commitment_date', '<=', endUtc], ['state', '!=', 'cancel']],
      ['id', 'name', 'commitment_date', 'order_line'])
    const inHour = orders.filter(o => moroccoHourFromUtc(o.commitment_date) === hour)
    if (!inHour.length) return res.status(200).json({ items: [] })
    const lineIds = inHour.flatMap(o => Array.isArray(o.order_line) ? o.order_line : [])
    const cdLinesRaw = lineIds.length ? await odooSearchRead(uid, 'sale.order.line',
      [['id', 'in', lineIds], ['product_id.product_tmpl_id.name', '=ilike', 'CD-%'], ['product_uom_qty', '>', 0]],
      ['id', 'order_id', 'name']) : []
    const cdLines = cdLinesRaw.filter(l => isRealCakeLine(l.name))
    if (!cdLines.length) return res.status(200).json({ items: [] })
    const lineToOrder = new Map(cdLines.map(l => [l.id, Array.isArray(l.order_id) ? l.order_id[0] : l.order_id]))
    const orderById = new Map(inHour.map(o => [o.id, o]))
    const cdLineIds = cdLines.map(l => l.id)
    const oids = [...new Set([...lineToOrder.values()])]
    // 1re image par commande (entête OU ligne CD-)
    const atts = await odooSearchRead(uid, 'ir.attachment',
      ['&', ['mimetype', 'ilike', 'image'], '|',
        '&', ['res_model', '=', 'sale.order'], ['res_id', 'in', oids],
        '&', ['res_model', '=', 'sale.order.line'], ['res_id', 'in', cdLineIds]],
      ['res_model', 'res_id', 'mimetype', 'datas'], { limit: 60 })
    const photoByOrder = new Map()
    for (const a of (atts || [])) {
      if (!a.datas) continue
      const oid = a.res_model === 'sale.order' ? a.res_id : lineToOrder.get(a.res_id)
      if (oid && !photoByOrder.has(oid)) photoByOrder.set(oid, `data:${a.mimetype || 'image/jpeg'};base64,${a.datas}`)
    }
    const items = cdLines.map(l => {
      const oid = lineToOrder.get(l.id)
      return { orderRef: orderById.get(oid)?.name || '', pers: persFromLineName(l.name), photo: photoByOrder.get(oid) || null }
    })
    return res.status(200).json({ items })
  } catch (e) {
    console.error('[cd-slot]', e?.message || e)
    return res.status(200).json({ items: [] })
  }
}

// Notif « nouvelle commande OCP » aux admins + personnes ayant la permission « Notif devis OCP ».
// detail = devis complet (articles + quantités), SANS les prix, sur une seule ligne.
async function notifyOcpOrder(orderName, date, detail) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: users } = await supabase.from('profiles').select('whatsapp, active').or('role.eq.admin,perm_notif_ocp.eq.true')
    const recipients = (users || []).filter(u => (u.active === undefined || u.active) && String(u.whatsapp || '').replace(/\D/g, '').length >= 8)
    if (!recipients.length) return
    const text = `🍽️ Devis OCP ${orderName}${date ? ` (livraison ${date})` : ''} :\n${detail || '—'}`
    for (const u of recipients) {
      await sendReminderWhatsapp(supabase, u.whatsapp, text, { name: 'wati_info', parameters: [{ name: '1', value: text }] })
    }
    console.log(`[ocp-notif] ${recipients.length} destinataire(s) pour ${orderName}`)
  } catch (e) { console.warn('[ocp-notif]', e?.message || e) }
}

// Notif « devis OCP ANNULÉ » aux mêmes destinataires (admins + « Notif devis OCP »).
async function notifyOcpCancel(orderName) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: users } = await supabase.from('profiles').select('whatsapp, active').or('role.eq.admin,perm_notif_ocp.eq.true')
    const recipients = (users || []).filter(u => (u.active === undefined || u.active) && String(u.whatsapp || '').replace(/\D/g, '').length >= 8)
    if (!recipients.length) return
    const text = `❌ Devis OCP ${orderName} ANNULÉ.`
    for (const u of recipients) {
      await sendReminderWhatsapp(supabase, u.whatsapp, text, { name: 'wati_info', parameters: [{ name: '1', value: text }] })
    }
    console.log(`[ocp-cancel] ${recipients.length} destinataire(s) pour ${orderName}`)
  } catch (e) { console.warn('[ocp-cancel]', e?.message || e) }
}

// Crée le devis OCP (lien dédié). Retrouve OCP SA, résout les variantes (entremets par taille,
// plateaux en GRAND format, jus par parfum), met les articles hors Odoo sur « Autre » + description,
// ajoute la livraison (Hay Riad 40 / Technopolis 70). Devis brouillon.
// Tailles (variantes) de PLUSIEURS produits en 1 appel (pour afficher les entremets vite).
// Entrée { tmplIds:[…] } → { sizes: { tmplId: [{id, size}] } }.
async function handleOrderSizes(req, res) {
  const tmplIds = (req.body?.tmplIds || []).filter(Boolean)
  if (!tmplIds.length) return res.status(200).json({ sizes: {} })
  try {
    const uid = await odooAuthenticate()
    const variants = await odooSearchRead(uid, 'product.product', [['product_tmpl_id', 'in', tmplIds]], ['id', 'product_tmpl_id', 'product_template_attribute_value_ids'])
    const ptavIds = [...new Set(variants.flatMap(v => v.product_template_attribute_value_ids || []))]
    const ptav = ptavIds.length ? await odooSearchRead(uid, 'product.template.attribute.value', [['id', 'in', ptavIds]], ['id', 'name', 'attribute_id']) : []
    const byId = {}; ptav.forEach(x => { byId[x.id] = { name: x.name, attr: Array.isArray(x.attribute_id) ? x.attribute_id[1] : '' } })
    const sizes = {}
    for (const v of variants) {
      const t = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id
      let size = '', attr = ''
      for (const id of (v.product_template_attribute_value_ids || [])) {
        const p = byId[id]
        if (p && /personne|taille|pi[èe]ce|format/i.test(p.attr)) { size = p.name; attr = p.attr; break }
      }
      ;(sizes[t] ||= []).push({ id: v.id, size, attr })
    }
    for (const t in sizes) sizes[t].sort((a, b) => (parseInt(a.size) || 0) - (parseInt(b.size) || 0))
    return res.status(200).json({ sizes })
  } catch (e) { console.error('[order-sizes]', e?.message || e); return res.status(200).json({ sizes: {} }) }
}

async function handleOrderCreateOcp(req, res) {
  const { zone, date, time, items } = req.body || {}
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'aucun article' })
  try {
    const uid = await odooAuthenticate()
    let p = await odooSearchRead(uid, 'res.partner', [['name', '=ilike', 'LG traiteur OCP']], ['id', 'name'], { limit: 1 })
    if (!p.length) p = await odooSearchRead(uid, 'res.partner', [['name', 'ilike', 'traiteur OCP']], ['id', 'name'], { limit: 1 })
    if (!p.length) p = await odooSearchRead(uid, 'res.partner', [['name', 'ilike', 'OCP']], ['id', 'name'], { limit: 1 })
    if (!p.length) return res.status(404).json({ error: 'Client OCP introuvable dans Odoo' })
    const partnerId = p[0].id
    // Pré-charge TOUT en quelques requêtes (au lieu d'1 par article) → rapide, pas de timeout.
    const variantIds = [...new Set(items.filter(i => i.variantId).map(i => i.variantId))]
    const tmplIds = [...new Set(items.filter(i => !i.variantId && i.tmplId).map(i => i.tmplId))]
    const [autreP, vP, tP, livP] = await Promise.all([
      odooSearchRead(uid, 'product.product', [['name', 'ilike', 'Autre']], ['id'], { limit: 1 }),
      variantIds.length ? odooSearchRead(uid, 'product.product', [['id', 'in', variantIds]], ['id', 'lst_price']) : Promise.resolve([]),
      tmplIds.length ? odooSearchRead(uid, 'product.product', [['product_tmpl_id', 'in', tmplIds]], ['id', 'product_tmpl_id', 'display_name', 'lst_price']) : Promise.resolve([]),
      odooSearchRead(uid, 'product.product', [['product_tmpl_id', '=', 2558]], ['id'], { limit: 1 }),
    ])
    const autreId = autreP[0]?.id || null
    const vPrice = {}; vP.forEach(x => { vPrice[x.id] = x.lst_price })
    const byTmpl = {}; tP.forEach(x => { const t = Array.isArray(x.product_tmpl_id) ? x.product_tmpl_id[0] : x.product_tmpl_id; (byTmpl[t] ||= []).push(x) })

    const orderLines = []
    const fruits = []
    const autreOne = []
    const addAutre = (txt) => { if (autreId) orderLines.push([0, 0, { product_id: autreId, product_uom_qty: 1, price_unit: 0, name: `À préciser : ${txt}` }]) }
    for (const it of items) {
      if (it.autre) { autreOne.push(it.autre); continue }
      if (it.free) {
        if (it.group === 'fruits') fruits.push(`${it.name} × ${it.qty}${it.unit ? ' ' + it.unit : ''}`)
        else addAutre(`${it.name} × ${it.qty}${it.unit ? ' ' + it.unit : ''}`)
        continue
      }
      // Article Odoo — PRIX RÉEL ; NOM = celui envoyé par le lien (recap = devis = prod).
      if (it.variantId) { orderLines.push([0, 0, { product_id: it.variantId, product_uom_qty: it.qty || 1, price_unit: vPrice[it.variantId] || 0, name: it.name }]); continue }
      const vs = it.tmplId ? (byTmpl[it.tmplId] || []) : []
      if (!vs.length) { addAutre(`${it.name} × ${it.qty}`); continue }
      let v
      if (it.variantHint) { const h = String(it.variantHint).toLowerCase(); v = vs.find(x => (x.display_name || '').toLowerCase().includes(h)) || vs[0] }
      else v = vs[0]
      orderLines.push([0, 0, { product_id: v.id, product_uom_qty: it.qty || 1, price_unit: v.lst_price || 0, name: it.name }])
    }
    if (fruits.length) addAutre(`Fruits — ${fruits.join(', ')}`)
    autreOne.forEach(addAutre)

    const delivPrice = /techno/i.test(zone || '') ? 70 : 40
    if (livP.length) orderLines.push([0, 0, { product_id: livP[0].id, product_uom_qty: 1, price_unit: delivPrice, name: `Livraison — ${zone || ''}` }])

    const vals = { partner_id: partnerId, order_line: orderLines }
    if (date) vals.commitment_date = moroccoLocalToUtc(date, time || '09:00')
    const orderId = await odooCreate(uid, 'sale.order', vals)
    const ord = await odooSearchRead(uid, 'sale.order', [['id', '=', orderId]], ['name'])
    const orderName = ord[0]?.name || ''
    console.log(`[ocp-devis] ${orderName} pour ${p[0].name} (${orderLines.length} lignes)`)
    // Détail du devis SANS prix (articles + quantités), sur une seule ligne pour le modèle WhatsApp.
    const detailParts = items.map(it => {
      if (it.autre) return `• À préciser: ${String(it.autre).replace(/\s+/g, ' ').trim()}`
      const q = Number(it.qty) || 1
      const nm = String(it.name || '').replace(/\s+/g, ' ').trim()
      return nm ? `• ${nm}${q > 1 ? ` ×${q}` : ''}${(it.free && it.unit) ? ` (${it.unit})` : ''}` : ''
    }).filter(Boolean)
    if (zone) detailParts.push(`• Livraison ${zone}`)
    let detail = detailParts.join('\n')   // 1 article par ligne
    if (detail.length > 950) detail = detail.slice(0, 950) + '…'
    notifyOcpOrder(orderName, date, detail).catch(() => {})
    return res.status(200).json({ ok: true, id: orderId, name: orderName, partner: p[0].name })
  } catch (e) {
    console.error('[ocp-devis]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

async function handleSearchOrders(req, res) {
  const query = (req.body?.query || '').trim()
  try {
    const uid = await odooAuthenticate()

    // Recherche vide => dernières commandes. Sinon domaine OR : n° S, nom
    // client, ou téléphone (avec variante 0… -> 212…).
    let domain = []
    if (query.length >= 2) {
      const digits = query.replace(/\D/g, '')
      const ors = [['name', 'ilike', query], ['partner_id', 'ilike', query]]
      if (digits.length >= 6) {
        // Cherche par les 9 derniers chiffres (insensible au préfixe 0 / 212 / +212).
        const last9 = digits.slice(-9)
        if (last9.length >= 6) {
          ors.push(['partner_id.phone', 'ilike', last9], ['partner_id.mobile', 'ilike', last9])
        }
      }
      domain = Array(ors.length - 1).fill('|').concat(ors)
    }

    const orders = await odooSearchRead(uid, 'sale.order', domain,
      ['name', 'partner_id', 'commitment_date', 'amount_total', 'order_line', 'state', 'invoice_status'],
      { order: 'date_order desc', limit: 15 })
    if (!orders.length) return res.status(200).json({ orders: [] })

    // Téléphones clients (mobile préféré) en un seul appel
    const partnerIds = [...new Set(orders.map(o => Array.isArray(o.partner_id) ? o.partner_id[0] : null).filter(Boolean))]
    const partners = partnerIds.length
      ? await odooSearchRead(uid, 'res.partner', [['id', 'in', partnerIds]], ['id', 'phone', 'mobile'])
      : []
    const phoneById = new Map(partners.map(p => [p.id, normalizePhone(p.mobile || p.phone)]))

    // Lignes de commande (produits réels uniquement)
    const lineIds = orders.flatMap(o => Array.isArray(o.order_line) ? o.order_line : [])
    const lines = lineIds.length
      ? await odooSearchRead(uid, 'sale.order.line', [['id', 'in', lineIds]],
          ['order_id', 'name', 'product_uom_qty', 'price_total', 'display_type'])
      : []
    const linesByOrder = new Map()
    for (const l of lines) {
      if (l.display_type) continue                          // sections / notes
      const nm = (l.name || '').replace(/\s+/g, ' ').trim() // texte sur une ligne
      if (/^(Acompte|Down\s+Payment)/i.test(nm)) continue   // acomptes
      const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
      if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
      linesByOrder.get(oid).push({ text: nm, qty: String(l.product_uom_qty), price: String(l.price_total) })
    }

    const result = orders.map(o => {
      const pid = Array.isArray(o.partner_id) ? o.partner_id[0] : null
      return {
        id: o.id,
        name: o.name,
        state: o.state,
        invoiceStatus: o.invoice_status || '',
        clientName: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
        clientPhone: pid ? (phoneById.get(pid) || '') : '',
        amountText: fmtAmount(o.amount_total),
        pickupText: fmtPickup(o.commitment_date),
        deliveryAt: o.commitment_date || '',
        productLines: linesByOrder.get(o.id) || [],
      }
    })
    return res.status(200).json({ orders: result })
  } catch (e) {
    console.error('[wati-search-orders]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Notif WhatsApp aux personnes « perm_notif_modif » qu'une modification de commande est à traiter.
// Côté SERVEUR (clé service) : lecture fiable des profils + envoi robuste (session sinon modèle nouvelle_tache).
async function handleNotifyModif(req, res) {
  const { orderRef, clientName, description } = req.body || {}
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: users } = await supabase.from('profiles').select('id, whatsapp').eq('perm_notif_modif', true)
    const recipients = (users || []).filter(u => String(u.whatsapp || '').replace(/\D/g, '').length >= 8)
    if (!recipients.length) return res.status(200).json({ sent: 0, total: 0, reason: 'aucun destinataire (perm_notif_modif + numéro)' })
    const text = `🔧 Modification à traiter${orderRef ? ' · ' + orderRef : ''}${clientName ? ' · ' + clientName : ''}${description ? ' · ' + description : ''}`
      .replace(/\s*\n\s*/g, ' · ').slice(0, 250)
    let sent = 0
    for (const u of recipients) {
      const ok = await sendReminderWhatsapp(supabase, u.whatsapp, text, { name: 'nouvelle_tache', parameters: [{ name: '1', value: text }] })
      if (ok) sent++
    }
    console.log(`[notify-modif] ${sent}/${recipients.length} envoyés`)
    return res.status(200).json({ sent, total: recipients.length })
  } catch (e) {
    console.error('[notify-modif]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Compte les commandes CAKE DESIGN (CD-) d'un client, par téléphone (pour le badge « client fidèle »).
// = commandes distinctes non annulées avec un produit « CD- » ET SANS ligne d'acompte
//   (le client a déjà commandé un cake design sans donner d'acompte).
async function handleClientCdCount(req, res) {
  const phone = String(req.body?.clientPhone || '').trim()
  const last9 = phone.replace(/\D/g, '').slice(-9)
  if (last9.length < 8) return res.status(200).json({ count: 0 })
  try {
    const uid = await odooAuthenticate()
    const partners = await odooSearchRead(uid, 'res.partner',
      ['|', ['phone', 'ilike', last9], ['mobile', 'ilike', last9]], ['id'])
    const pids = partners.map(p => p.id)
    if (!pids.length) return res.status(200).json({ count: 0 })
    // Commandes (non annulées) du client contenant un cake design.
    const cdLines = await odooSearchRead(uid, 'sale.order.line',
      [['order_id.partner_id', 'in', pids], ['order_id.state', '!=', 'cancel'], ['product_id.product_tmpl_id.name', '=ilike', 'CD-%']],
      ['order_id'])
    const cdOrderIds = [...new Set((cdLines || []).map(l => Array.isArray(l.order_id) ? l.order_id[0] : l.order_id))]
    if (!cdOrderIds.length) return res.status(200).json({ count: 0 })
    // Parmi celles-ci, repère celles qui contiennent un ACOMPTE (à exclure).
    const allLines = await odooSearchRead(uid, 'sale.order.line', [['order_id', 'in', cdOrderIds]], ['order_id', 'name'])
    const avecAcompte = new Set()
    for (const l of (allLines || [])) {
      if (/^\s*(Acompte|Down\s*Payment)/i.test(l.name || '')) avecAcompte.add(Array.isArray(l.order_id) ? l.order_id[0] : l.order_id)
    }
    const count = cdOrderIds.filter(id => !avecAcompte.has(id)).length
    return res.status(200).json({ count })
  } catch (e) {
    console.error('[client-cd-count]', e?.message || e)
    return res.status(200).json({ count: 0 })   // badge non bloquant
  }
}

// Version EN LOT : compte CD- sans acompte pour une liste de téléphones (badge ⭐ dans la liste).
// Renvoie { counts: { <9 derniers chiffres>: nombre } }.
async function handleClientsCdCounts(req, res) {
  const phones = Array.isArray(req.body?.phones) ? req.body.phones : []
  const last9s = [...new Set(phones.map(p => String(p || '').replace(/\D/g, '').slice(-9)).filter(x => x.length >= 8))]
  if (!last9s.length) return res.status(200).json({ counts: {} })
  try {
    const uid = await odooAuthenticate()
    const orConds = []
    for (const l9 of last9s) orConds.push(['phone', 'ilike', l9], ['mobile', 'ilike', l9])
    const partnerDomain = orConds.length > 1 ? Array(orConds.length - 1).fill('|').concat(orConds) : orConds
    const partners = await odooSearchRead(uid, 'res.partner', partnerDomain, ['id', 'phone', 'mobile'])
    if (!partners.length) return res.status(200).json({ counts: {} })
    const pidToL9 = new Map()
    for (const p of partners) {
      const full = String(p.mobile || p.phone || '').replace(/\D/g, '')
      pidToL9.set(p.id, last9s.find(l9 => full.endsWith(l9) || full.includes(l9)) || full.slice(-9))
    }
    const pids = partners.map(p => p.id)
    const cdLines = await odooSearchRead(uid, 'sale.order.line',
      [['order_id.partner_id', 'in', pids], ['order_id.state', '!=', 'cancel'], ['product_id.product_tmpl_id.name', '=ilike', 'CD-%']], ['order_id'])
    const cdOrderIds = [...new Set((cdLines || []).map(l => Array.isArray(l.order_id) ? l.order_id[0] : l.order_id))]
    if (!cdOrderIds.length) return res.status(200).json({ counts: {} })
    const orders = await odooSearchRead(uid, 'sale.order', [['id', 'in', cdOrderIds]], ['id', 'partner_id'])
    const orderPartner = new Map(orders.map(o => [o.id, Array.isArray(o.partner_id) ? o.partner_id[0] : o.partner_id]))
    const allLines = await odooSearchRead(uid, 'sale.order.line', [['order_id', 'in', cdOrderIds]], ['order_id', 'name'])
    const avecAcompte = new Set()
    for (const l of (allLines || [])) {
      if (/^\s*(Acompte|Down\s*Payment)/i.test(l.name || '')) avecAcompte.add(Array.isArray(l.order_id) ? l.order_id[0] : l.order_id)
    }
    const counts = {}
    for (const oid of cdOrderIds) {
      if (avecAcompte.has(oid)) continue
      const l9 = pidToL9.get(orderPartner.get(oid))
      if (l9) counts[l9] = (counts[l9] || 0) + 1
    }
    return res.status(200).json({ counts })
  } catch (e) {
    console.error('[clients-cd-counts]', e?.message || e)
    return res.status(200).json({ counts: {} })
  }
}

// Notif push aux users ayant accès aux Conversations (perm_conversations = true).
async function notifyConversationUsers(supabase, conversationId, title, body, mediaUrl) {
  const { data: users } = await supabase
    .from('profiles')
    .select('id')
    .eq('perm_conversations', true)
    .eq('active', true)
  if (!users || users.length === 0) return
  const preview = body ? body.slice(0, 50) : (mediaUrl ? '📎 Pièce jointe' : 'Nouveau message')
  await sendPushToTargets({
    userIds: users.map(u => u.id),
    title: title || 'Nouveau message',
    body: preview,
    url: `/?conv=${conversationId}`,
    tag: `conv-${conversationId}`,
  })
}

// Extensions -> MIME autorisés par le bucket conversation-media
const REHOST_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf',
  opus: 'audio/ogg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4',
  mp3: 'audio/mpeg', aac: 'audio/aac', amr: 'audio/amr', webm: 'audio/webm',
}

// Télécharge un fichier Wati (lien protégé par le token) et le ré-héberge dans
// le bucket conversation-media. Retourne le chemin stocké, ou null si échec
// (dans ce cas on garde le lien Wati d'origine pour ne pas perdre le message).
async function rehostWatiMedia(supabase, watiUrl) {
  try {
    const apiToken = process.env.WATI_API_TOKEN
    if (!apiToken) return null
    const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
    const r = await fetch(watiUrl, { headers: { Authorization: authHeader } })
    if (!r.ok) return null
    const m = /fileName=([^&]+)/.exec(watiUrl)
    const fileName = m ? decodeURIComponent(m[1]) : watiUrl
    const ext = (fileName.split('.').pop() || '').toLowerCase()
    const contentType = REHOST_MIME[ext]
    if (!contentType) return null
    const buf = Buffer.from(await r.arrayBuffer())
    const path = `inbound/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from('conversation-media')
      .upload(path, buf, { contentType, upsert: false })
    if (error) return null
    return path
  } catch (_) {
    return null
  }
}

// Retrouve le fil par numéro, sinon le crée.
// On compare sur les 9 derniers chiffres pour tolérer les formats différents
// (212…, 0…, espaces) et éviter de créer un doublon pour le même client.
async function getOrCreateConversation(supabase, phone, name) {
  const last9 = String(phone || '').replace(/\D/g, '').slice(-9)
  if (last9.length >= 8) {
    const { data: matches } = await supabase
      .from('conversations')
      .select('id, client_name, status, assigned_to, unread_count')
      .ilike('client_phone', `%${last9}`)
      .limit(1)
    if (matches && matches.length) return matches[0]
  } else {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id, client_name, status, assigned_to, unread_count')
      .eq('client_phone', phone)
      .maybeSingle()
    if (existing) return existing
  }

  // Personnel (numéro = whatsapp d'un profil) → conversation créée FERMÉE (n'encombre pas l'inbox client).
  let status = 'non_assignee'
  try {
    if (last9.length >= 8) {
      const { data: staff } = await supabase.from('profiles').select('id').ilike('whatsapp', `%${last9}`).limit(1)
      if (staff && staff.length) status = 'fermee'
    }
  } catch { /* défaut non_assignee */ }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ client_phone: phone, client_name: name || null, status })
    .select('id, client_name, status, assigned_to, unread_count')
    .single()
  if (error) {
    // Course possible : un autre webhook a créé le fil au même instant
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('conversations')
        .select('id, client_name, status, assigned_to, unread_count')
        .eq('client_phone', phone)
        .single()
      return again
    }
    throw error
  }
  return created
}

// ============================================================
// RAPPELS QUOTIDIENS — cron Vercel (GET /api/task-reminders)
// Pour chaque destinataire ayant des tâches « à faire » + un numéro WhatsApp,
// envoie UN message récapitulatif. Session si conversation ouverte, sinon modèle.
// ============================================================
async function handleTaskReminders(req, res) {
  // Sécurité : autorisé seulement si déclenché par le cron Vercel (en-tête
  // x-vercel-cron) ou avec le bon CRON_SECRET.
  const cronSecret = process.env.CRON_SECRET
  const authed = !!req.headers['x-vercel-cron']
    || (cronSecret && (req.headers.authorization === `Bearer ${cronSecret}` || req.query.secret === cronSecret))
  if (!authed) return res.status(401).json({ error: 'unauthorized' })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, title, to_user_id, to_user:profiles!tasks_to_user_id_fkey(whatsapp, full_name, username)')
      .eq('status', 'todo')
      .limit(1000)
    if (error) throw error

    // Regroupe par destinataire (un seul message par personne)
    const byUser = new Map()
    for (const t of (tasks || [])) {
      const phone = t.to_user?.whatsapp
      if (!phone) continue
      if (!byUser.has(t.to_user_id)) byUser.set(t.to_user_id, { phone, titles: [] })
      byUser.get(t.to_user_id).titles.push(t.title)
    }

    let reminded = 0
    for (const { phone, titles } of byUser.values()) {
      const n = titles.length
      const list = titles.slice(0, 8).map(x => '• ' + x).join('\n')
      const text = `⏰ Rappel : tu as ${n} tâche${n > 1 ? 's' : ''} à faire :\n${list}${n > 8 ? '\n…' : ''}`
      const ok = await sendReminderWhatsapp(supabase, phone, text)
      if (ok) reminded++
    }

    // ============================================================
    // Rappels de reprise de congé : envoyé le matin de la VEILLE de la vraie
    // reprise (= prochain jour travaillé après le congé, jour off et fériés
    // sautés), pour que "demain" soit toujours juste dans le message/modèle.
    // Anti-doublon via wati_notif_rappel_retour_sent_at.
    // ============================================================
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = jourSuivantYMD(today)
    const cutoffReprise = (() => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })()
    let congesRappels = 0
    try {
      // Congés terminés dans les 7 derniers jours, rappel pas encore envoyé.
      const { data: congesRecents } = await supabase
        .from('conges')
        .select('id, employe_id, date_debut, date_fin')
        .eq('statut', 'valide')
        .gte('date_fin', cutoffReprise)
        .lte('date_fin', today)
        .is('wati_notif_rappel_retour_sent_at', null)
      const { data: feriesData } = await supabase.from('jours_feries').select('date').gte('date', cutoffReprise)
      const feriesSet = new Set((feriesData || []).map(f => f.date))
      for (const c of (congesRecents || [])) {
        const { phone, nom, emp } = await getEmployePhone(supabase, c.employe_id)
        if (!phone) continue
        // On n'envoie QUE la veille de la vraie reprise. Tant que ce n'est pas
        // demain, on attend : le cron repasse chaque jour.
        if (dateRepriseYMD(emp, c.date_fin, feriesSet) !== tomorrow) continue
        // Congé "splité" mais continu : si un autre congé validé enchaîne juste
        // après (jours intermédiaires = jours de repos), on n'envoie PAS le rappel
        // maintenant -> il partira à la fin du vrai bloc continu.
        const { data: nexts } = await supabase.from('conges')
          .select('date_debut')
          .eq('employe_id', c.employe_id).eq('statut', 'valide')
          .gt('date_debut', c.date_fin)
          .order('date_debut', { ascending: true }).limit(1)
        if (nexts && nexts[0] && congesContinus(emp, c.date_fin, nexts[0].date_debut)) continue
        const text = buildCongeMessage('rappel_retour', c, nom, null, emp, feriesSet)
        const ok = await sendReminderWhatsapp(supabase, phone, text, congeTemplate('rappel_retour', c, nom, emp, feriesSet))
        if (ok) {
          await supabase.from('conges')
            .update({ wati_notif_rappel_retour_sent_at: new Date().toISOString() })
            .eq('id', c.id)
          congesRappels++
        }
      }
    } catch (e) {
      console.warn('[task-reminders] congés rappels:', e?.message || e)
    }

    return res.status(200).json({ ok: true, people: byUser.size, reminded, congesRappels })
  } catch (e) {
    console.error('[task-reminders]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}

// Envoi WhatsApp serveur : message de session d'abord (fenêtre 24 h), sinon modèle.
// template (optionnel) = { name, parameters } : modèle approuvé à utiliser hors
// fenêtre 24 h (sinon repli sur 'nouvelle_tache').
async function sendReminderWhatsapp(supabase, rawPhone, text, template = null) {
  const apiToken = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (!apiToken || !apiEndpoint) return false
  const number = String(rawPhone).replace(/\D/g, '').replace(/^0/, '212')
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`

  // 1) Message de session (gratuit, si le client a écrit dans les 24 h)
  try {
    const qs = new URLSearchParams({ messageText: text }).toString()
    const r = await fetch(`${base}/api/v1/sendSessionMessage/${number}?${qs}`, {
      method: 'POST', headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d?.result !== false) {
      await traceOutgoing(supabase, number, text)
      return true
    }
  } catch { /* on tente le modèle */ }

  // 2) Modèle (hors fenêtre 24 h) — numéro en ?whatsappNumber=
  try {
    const r = await fetch(`${base}/api/v1/sendTemplateMessage?whatsappNumber=${number}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(template
        ? { template_name: template.name, broadcast_name: `conge_${Date.now()}`, parameters: template.parameters }
        : { template_name: 'nouvelle_tache', broadcast_name: `rappel_${Date.now()}`, parameters: [{ name: '1', value: text.replace(/\n/g, ' ').slice(0, 250) }] }
      ),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d?.result !== false) {
      await traceOutgoing(supabase, number, text)
      return true
    }
  } catch { /* abandon silencieux */ }
  return false
}

// Trace le message sortant dans le fil de conversation correspondant (si présent).
async function traceOutgoing(supabase, number, body) {
  try {
    const conv = await getOrCreateConversation(supabase, number, null)
    const sentAt = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conv.id, sender_type: 'agent', body, sent_at: sentAt,
    })
    // Notif interne (tâche/congé/rappel) : la conversation reste FERMÉE pour ne
    // pas encombrer l'inbox. Si l'employé répond, un message entrant la rouvrira.
    await supabase.from('conversations').update({ last_message_at: sentAt, updated_at: sentAt, status: 'fermee' }).eq('id', conv.id)
  } catch { /* trace best-effort */ }
}

// ============================================================
// PHOTO CLIENT — récupère la photo de profil WATI/WhatsApp pour un n°
// et l'enregistre sur la conversation. Best-effort : si WATI ne renvoie
// pas de photo (cas fréquent à cause de la privacy WhatsApp), on stocke
// juste la date de tentative pour ne pas re-tenter trop souvent.
// ============================================================
async function handleFetchPhoto(req, res) {
  const phone = (req.query?.phone || '').toString().trim()
  if (!phone) return res.status(400).json({ error: 'phone manquant' })

  const apiToken = process.env.WATI_API_TOKEN
  const apiEndpoint = process.env.WATI_API_ENDPOINT
  if (!apiToken || !apiEndpoint) return res.status(500).json({ error: 'WATI config manquante' })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const base = apiEndpoint.replace(/\/+$/, '')
  // Le wAid WhatsApp = n° sans le + (ex: "212661234567"). On tolère les deux.
  const wAid = phone.replace(/^\+/, '').replace(/\s+/g, '')

  let photoUrl = null
  try {
    const url = `${base}/api/v1/getContacts?attribute=wAid&attributeValue=${encodeURIComponent(wAid)}&pageSize=1&pageNumber=1`
    const watiRes = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } })
    if (watiRes.ok) {
      const data = await watiRes.json()
      const list = data?.contact_list || data?.contacts || data?.items || (Array.isArray(data) ? data : [])
      const contact = list?.[0] || data?.contact || null
      photoUrl = contact?.photo || contact?.displayPicture || contact?.profilePicture || null
    } else {
      console.warn('[fetch-photo] WATI', watiRes.status)
    }
  } catch (e) {
    console.warn('[fetch-photo] erreur:', e?.message || e)
  }

  // Met à jour toutes les conversations correspondant à ce n°. Toujours marquer
  // fetched_at (même si null) pour ne pas re-spammer WATI à chaque ouverture.
  await supabase.from('conversations').update({
    client_photo_url: photoUrl || null,
    client_photo_fetched_at: new Date().toISOString(),
  }).eq('client_phone', phone)

  return res.status(200).json({ photo: photoUrl })
}

// ============================================================
// CONGÉS — notif WhatsApp à la validation, au rejet et au rappel reprise.
// Appelé depuis l'UI (action=conges-notif) ou depuis le cron quotidien
// (handleTaskReminders qui balaie aussi les rappels de reprise).
// ============================================================
function fmtDateFR(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

function joursEntre(debut, fin) {
  if (!debut || !fin) return 0
  return Math.round((new Date(fin + 'T00:00:00') - new Date(debut + 'T00:00:00')) / 86400000) + 1
}

function jourSuivantYMD(ymd) {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function getEmployePhone(supabase, employeId) {
  // Priorité au numéro saisi directement sur l'employé.
  const { data: emp } = await supabase
    .from('employes')
    .select('id, nom, telephone, planning_type, planning_jour_off, planning_paire_off_1, planning_paire_off_2, planning_impaire_off_1, planning_impaire_off_2')
    .eq('id', employeId)
    .maybeSingle()
  if (!emp) return { phone: null, nom: null, emp: null }
  if (emp.telephone) return { phone: emp.telephone, nom: emp.nom, emp }
  // Repli : numéro WhatsApp du user lié.
  const { data: prof } = await supabase
    .from('profiles')
    .select('whatsapp')
    .eq('employe_id', employeId)
    .maybeSingle()
  return { phone: prof?.whatsapp || null, nom: emp.nom, emp }
}

// Jour de repos COMPLET de l'employé (la demi-journée compte comme travaillée).
function _jourReposEmp(emp) {
  if (!emp) return null
  if (emp.planning_type === 'fixe') return emp.planning_jour_off || null
  if (emp.planning_type === 'alt') {
    const paire   = [emp.planning_paire_off_1,   emp.planning_paire_off_2  ].filter(Boolean)
    const impaire = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    return paire.find(d => impaire.includes(d)) || null
  }
  return null
}
// Deux congés sont "continus" si tous les jours strictement entre la fin de l'un
// et le début de l'autre sont des jours de repos (ou s'il n'y a aucun jour entre).
function congesContinus(emp, finYMD, nextDebutYMD) {
  const J = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  const off = _jourReposEmp(emp)
  const d = new Date(finYMD + 'T00:00:00'); d.setDate(d.getDate() + 1)
  const end = new Date(nextDebutYMD + 'T00:00:00')
  while (d < end) {
    if (J[d.getDay()] !== off) return false   // un jour travaillé au milieu -> pas continu
    d.setDate(d.getDate() + 1)
  }
  return true
}

// Date de reprise = prochain jour réellement travaillé après la fin du congé.
// On saute le jour de repos hebdo ET les jours fériés. Garde-fou à 14 jours.
function dateRepriseYMD(emp, finYMD, feriesSet = null) {
  const J = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  const off = _jourReposEmp(emp)
  const d = new Date(finYMD + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  for (let i = 0; i < 14; i++) {
    const ymd = d.toISOString().slice(0, 10)
    const isOff   = off && J[d.getDay()] === off
    const isFerie = feriesSet && feriesSet.has(ymd)
    if (!isOff && !isFerie) break
    d.setDate(d.getDate() + 1)
  }
  return d.toISOString().slice(0, 10)
}

function buildCongeMessage(type, conge, nom, solde = null, emp = null, feriesSet = null) {
  const debut = fmtDateFR(conge.date_debut)
  const fin   = fmtDateFR(conge.date_fin)
  const nbJ   = joursEntre(conge.date_debut, conge.date_fin)
  const prenom = (nom || '').split(' ')[0] || ''
  if (type === 'validation') {
    let msg = `Bonjour ${prenom},\nVotre congé du ${debut} au ${fin} (${nbJ} jour${nbJ > 1 ? 's' : ''}) a été validé.`
    if (solde && solde.pris != null && solde.pris !== '' && solde.dispo != null && solde.dispo !== '') {
      const f = v => { const n = Number(v); return (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',') }
      msg += `\nVous avez pris ${f(solde.pris)} jour(s) de congé cette année, il vous reste ${f(solde.dispo)} jour(s) (récupération incluse).`
    }
    return msg + `\nBon repos !`
  }
  if (type === 'rejet') {
    return `Bonjour ${prenom},\nVotre demande de congé du ${debut} au ${fin} n'a pas été validée.\nMerci de te rapprocher de l'administration.`
  }
  if (type === 'rappel_retour') {
    const repriseYMD = emp ? dateRepriseYMD(emp, conge.date_fin, feriesSet) : jourSuivantYMD(conge.date_fin)
    const reprise = fmtDateFR(repriseYMD)
    return `Bonjour ${prenom},\nPetit rappel : votre reprise est prévue le ${reprise}. À très vite !`
  }
  return `Bonjour ${prenom}, notification congés.`
}

// Modèle WhatsApp approuvé à utiliser hors fenêtre 24 h, selon le type.
// rappel_retour -> rappel_reprise_conge ({{1}}=prénom, {{2}}=date reprise)
// validation    -> notification_conge   ({{1}}=prénom, {{2}}=début, {{3}}=fin)
// rejet         -> pas de modèle approuvé (repli session uniquement)
function congeTemplate(type, conge, nom, emp = null, feriesSet = null) {
  const prenom = (nom || '').split(' ')[0] || ''
  if (type === 'rappel_retour') {
    const repriseYMD = emp ? dateRepriseYMD(emp, conge.date_fin, feriesSet) : jourSuivantYMD(conge.date_fin)
    return {
      name: 'rappel_reprise_conge',
      parameters: [
        { name: '1', value: prenom },
        { name: '2', value: fmtDateFR(repriseYMD) },
      ],
    }
  }
  if (type === 'validation') {
    return {
      name: 'notification_conge',
      parameters: [
        { name: '1', value: prenom },
        { name: '2', value: fmtDateFR(conge.date_debut) },
        { name: '3', value: fmtDateFR(conge.date_fin) },
      ],
    }
  }
  return null
}

async function handleCongesNotif(req, res) {
  const congeId = req.query?.congeId
  const type = req.query?.type || 'validation'   // 'validation' | 'rejet' | 'rappel_retour'
  if (!congeId) return res.status(400).json({ error: 'congeId requis' })
  if (!['validation', 'rejet', 'rappel_retour'].includes(type)) return res.status(400).json({ error: 'type invalide' })

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: conge, error } = await supabase
    .from('conges')
    .select('*')
    .eq('id', congeId)
    .maybeSingle()
  if (error)  return res.status(500).json({ error: error.message })
  if (!conge) return res.status(404).json({ error: 'congé introuvable' })

  const { phone, nom, emp } = await getEmployePhone(supabase, conge.employe_id)
  if (!phone) return res.status(200).json({ ok: false, reason: 'pas de numéro téléphone pour cet employé' })

  const { data: feriesData } = await supabase.from('jours_feries').select('date').gte('date', conge.date_fin)
  const feriesSet = new Set((feriesData || []).map(f => f.date))
  const text = buildCongeMessage(type, conge, nom, { pris: req.query?.pris, dispo: req.query?.dispo }, emp, feriesSet)
  const ok = await sendReminderWhatsapp(supabase, phone, text, congeTemplate(type, conge, nom, emp, feriesSet))

  // Anti-doublon : on note la date d'envoi sur la colonne correspondante.
  const patch = {}
  if (type === 'validation')    patch.wati_notif_validation_sent_at = new Date().toISOString()
  if (type === 'rejet')          patch.wati_notif_rejet_sent_at = new Date().toISOString()
  if (type === 'rappel_retour') patch.wati_notif_rappel_retour_sent_at = new Date().toISOString()
  if (ok && Object.keys(patch).length > 0) {
    await supabase.from('conges').update(patch).eq('id', congeId)
  }

  return res.status(200).json({ ok, phone, type })
}

// Wati envoie souvent un epoch en secondes ; on tolère ms et chaîne ISO.
function parseTimestamp(ts) {
  if (!ts) return new Date().toISOString()
  const n = Number(ts)
  if (!Number.isNaN(n)) {
    const ms = n > 1e12 ? n : n * 1000
    return new Date(ms).toISOString()
  }
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
