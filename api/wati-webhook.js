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
  if (action === 'order-clients') return handleOrderClients(req, res)
  if (action === 'invoice-pdf') return handleInvoicePdf(req, res)
  if (action === 'invoices-search') return handleInvoicesSearch(req, res)
  if (action === 'suggest') return handleSuggest(req, res)
  if (action === 'correct') return handleCorrect(req, res)
  if (action === 'delete-message') return handleDeleteMessage(req, res)
  if (action === 'fetch-photo') return handleFetchPhoto(req, res)
  if (action === 'conges-notif') return handleCongesNotif(req, res)
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

  // Événement sans contenu exploitable (statuts delivered/read, etc.) → on ignore
  if (!phone || (!body && !mediaUrl)) {
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

    // Auto-réponse (RIB, etc.) : déclenchée par mot-clé sur message client texte.
    if (senderType === 'client' && body) {
      await maybeAutoReply(supabase, conv, phone, body)
        .catch(e => console.warn('[auto-reply]', e?.message || e))
    }

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

async function maybeAutoReply(supabase, conv, phone, body) {
  for (const rule of AUTO_RULES) {
    if (!rule.test.test(body)) continue
    if (rule.exclude && rule.exclude.test(body)) continue
    const { data: qr } = await supabase
      .from('quick_replies').select('body').eq('id', rule.quickReplyId).maybeSingle()
    if (!qr?.body) return
    // Anti-spam : pas la même auto-réponse 2x dans la conversation en moins de 10 min.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recent } = await supabase
      .from('messages').select('id')
      .eq('conversation_id', conv.id).eq('sender_type', 'system').eq('body', qr.body)
      .gte('created_at', since).limit(1)
    if (recent && recent.length) return
    await sendAutoReply(supabase, conv, phone, qr.body)
    return  // une seule auto-réponse par message
  }
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

  const number = String(clientPhone).replace(/\D/g, '') // chiffres uniquement (garde l'indicatif)
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
      })
      .select('*, sender:profiles!messages_sender_user_id_fkey(id, username, full_name)')
      .single()
    if (insErr) throw insErr

    // On met à jour la date du dernier message mais on NE change PAS le statut.
    // Si la conversation était fermée, elle reste fermée : on n'embête pas
    // les commerciaux avec un fil refermé. Seul un message entrant du client
    // (géré dans handleInbound) la rouvrira automatiquement.
    await supabase.from('conversations')
      .update({ last_message_at: sentAt, updated_at: sentAt })
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

Tu vas recevoir une conversation WhatsApp entre un client et une commerciale. Ta mission : proposer 3 réponses possibles que la commerciale pourrait envoyer au DERNIER message du client.

Les 3 réponses doivent avoir 3 tons différents :
1. FORMELLE : vouvoiement, professionnelle, phrases complètes, polie
2. AMICALE : chaleureuse, peut utiliser un emoji 🌸 ou 💖, ton Lily Gourmet (vouvoiement chaleureux ou tutoiement selon le contexte de la conversation)
3. DIRECTE : courte (1-2 phrases max), va droit au but, mais reste polie

Règles importantes :
- Adapte le contenu au contexte (commande, devis, livraison, plainte, question générale...)
- Si le client demande un prix, ne JAMAIS inventer un montant — propose plutôt de vérifier et de revenir vers lui
- Si le client demande une date, ne JAMAIS confirmer une date sans vérification — propose de vérifier le planning
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

function parseSuggestions(text) {
  if (!text) return []
  let t = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
  try {
    const obj = JSON.parse(t)
    return Array.isArray(obj.suggestions) ? obj.suggestions : []
  } catch (_) { return [] }
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
    .select('sender_type, body, media_url')
    .eq('conversation_id', conversation_id)
    .order('sent_at', { ascending: false })
    .limit(20)
  if (error) return res.status(500).json({ error: error.message })
  const ordered = (msgs || []).reverse()
  if (ordered.length === 0) return res.status(400).json({ error: 'conversation vide' })

  const transcript = ordered.map(m => {
    const who = m.sender_type === 'client' ? 'Client' : m.sender_type === 'agent' ? 'Commerciale' : 'Système'
    const content = m.body || (m.media_url ? '[pièce jointe]' : '')
    return `${who} : ${content}`
  }).join('\n')

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
        max_tokens: 600,
        system: SUGGEST_SYSTEM,
        messages: [{
          role: 'user',
          content: `Voici la conversation WhatsApp :\n\n${transcript}\n\nPropose 3 réponses possibles au DERNIER message du client.`,
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
      return res.status(502).json({ error: data?.error?.message || `Claude erreur ${r.status}` })
    }
    const block = (data.content || []).find(b => b.type === 'text')
    const corrected = (block?.text || '').trim()
    if (!corrected) return res.status(502).json({ error: 'Réponse IA vide' })
    return res.status(200).json({ corrected })
  } catch (e) {
    console.error('[wati-correct]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
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
  const { clientPhone, templateName, broadcastName, parameters, bodyText, userId } = req.body || {}
  if (!clientPhone || !templateName) {
    return res.status(400).json({ error: 'clientPhone et templateName requis' })
  }
  // Normalise le numéro au format WhatsApp (0… -> 212…) pour ne pas créer un
  // faux contact « 06… » à côté du vrai client enregistré en 212…
  const number = normalizePhone(clientPhone)
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // WATI : le numéro va en PARAMÈTRE d'URL (?whatsappNumber=), pas dans le chemin.
    const url = `${base}/api/v1/sendTemplateMessage?whatsappNumber=${number}`
    const payload = {
      template_name: templateName,
      broadcast_name: broadcastName || `lily_${Date.now()}`,
      parameters: parameters || [],
    }
    console.log(`[WATI] Sending template ${templateName} to ${number}`)
    console.log('[WATI] URL:', url)
    console.log('[WATI] Payload:', JSON.stringify(payload))
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    const raw = await r.text()
    let data = {}
    try { data = JSON.parse(raw) } catch { /* réponse non JSON */ }
    console.log('[WATI] Response status:', r.status)
    console.log('[WATI] Response body:', raw)
    if (!r.ok || data?.result === false) {
      return res.status(502).json({ error: data?.info || data?.message || `Wati erreur ${r.status}` })
    }

    // Crée/maj le fil + trace le message sortant
    const conv = await getOrCreateConversation(supabase, number, null)
    const sentAt = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: 'agent',
      sender_user_id: userId || null,
      body: bodyText || `[Template] ${templateName}`,
      sent_at: sentAt,
      wa_message_id: data?.id || data?.messageId || null,
    })
    // Notifs internes au personnel (tâches, congés, économat) : la conversation
    // doit rester FERMÉE pour ne pas encombrer l'inbox des commerciaux. Les vrais
    // échanges client (devis, confirmation...) restent "en_cours".
    const INTERNAL_NOTIF = new Set(['nouvelle_tache', 'notification_conge', 'rappel_reprise_conge', 'economat_demande', 'nouvelle_demande_economat', 'lily_gourmet_access'])
    // Confirmation de commande = plus rien en attente -> on ferme aussi.
    // (Le devis reste "en_cours" car on attend la réponse du client.)
    const fermerApresEnvoi = INTERNAL_NOTIF.has(templateName) || templateName === 'message_de_confirmation'
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

// Recherche de factures clients existantes (nom client, n° commande, n° facture). Vide = récentes.
async function handleInvoicesSearch(req, res) {
  const query = (req.body?.query || '').trim()
  try {
    const uid = await odooAuthenticate()
    let domain = [['move_type', '=', 'out_invoice']]
    if (query.length >= 2) {
      domain = ['&', ['move_type', '=', 'out_invoice'],
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
      ['name', 'partner_id', 'commitment_date', 'amount_total', 'order_line', 'state'],
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
        clientName: Array.isArray(o.partner_id) ? o.partner_id[1] : '',
        clientPhone: pid ? (phoneById.get(pid) || '') : '',
        amountText: fmtAmount(o.amount_total),
        pickupText: fmtPickup(o.commitment_date),
        productLines: linesByOrder.get(o.id) || [],
      }
    })
    return res.status(200).json({ orders: result })
  } catch (e) {
    console.error('[wati-search-orders]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
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
async function getOrCreateConversation(supabase, phone, name) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, client_name, status, assigned_to, unread_count')
    .eq('client_phone', phone)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ client_phone: phone, client_name: name || null, status: 'non_assignee' })
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
    // Rappels de reprise de congé : envoyé le matin du dernier jour de congé
    // (date_fin = today). Anti-doublon via wati_notif_rappel_retour_sent_at.
    // ============================================================
    const today = new Date().toISOString().slice(0, 10)
    let congesRappels = 0
    try {
      const { data: congesFinAujourdHui } = await supabase
        .from('conges')
        .select('id, employe_id, date_debut, date_fin')
        .eq('statut', 'valide')
        .eq('date_fin', today)
        .is('wati_notif_rappel_retour_sent_at', null)
      for (const c of (congesFinAujourdHui || [])) {
        const { phone, nom } = await getEmployePhone(supabase, c.employe_id)
        if (!phone) continue
        // Congé "splité" mais continu : si un autre congé validé enchaîne juste
        // après (jours intermédiaires = jours de repos), on n'envoie PAS le rappel
        // maintenant -> il partira à la fin du vrai bloc continu.
        const { data: nexts } = await supabase.from('conges')
          .select('date_debut')
          .eq('employe_id', c.employe_id).eq('statut', 'valide')
          .gt('date_debut', c.date_fin)
          .order('date_debut', { ascending: true }).limit(1)
        if (nexts && nexts[0]) {
          const { data: emp } = await supabase.from('employes')
            .select('planning_type, planning_jour_off, planning_paire_off_1, planning_paire_off_2, planning_impaire_off_1, planning_impaire_off_2')
            .eq('id', c.employe_id).maybeSingle()
          if (congesContinus(emp, c.date_fin, nexts[0].date_debut)) continue
        }
        const text = buildCongeMessage('rappel_retour', c, nom)
        const ok = await sendReminderWhatsapp(supabase, phone, text, congeTemplate('rappel_retour', c, nom))
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
    .select('id, nom, telephone')
    .eq('id', employeId)
    .maybeSingle()
  if (!emp) return { phone: null, nom: null }
  if (emp.telephone) return { phone: emp.telephone, nom: emp.nom }
  // Repli : numéro WhatsApp du user lié.
  const { data: prof } = await supabase
    .from('profiles')
    .select('whatsapp')
    .eq('employe_id', employeId)
    .maybeSingle()
  return { phone: prof?.whatsapp || null, nom: emp.nom }
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

function buildCongeMessage(type, conge, nom, solde = null) {
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
    const reprise = fmtDateFR(jourSuivantYMD(conge.date_fin))
    return `Bonjour ${prenom},\nVotre congé se termine aujourd'hui.\nReprise demain ${reprise}. À très vite !`
  }
  return `Bonjour ${prenom}, notification congés.`
}

// Modèle WhatsApp approuvé à utiliser hors fenêtre 24 h, selon le type.
// rappel_retour -> rappel_reprise_conge ({{1}}=prénom, {{2}}=date reprise)
// validation    -> notification_conge   ({{1}}=prénom, {{2}}=début, {{3}}=fin)
// rejet         -> pas de modèle approuvé (repli session uniquement)
function congeTemplate(type, conge, nom) {
  const prenom = (nom || '').split(' ')[0] || ''
  if (type === 'rappel_retour') {
    return {
      name: 'rappel_reprise_conge',
      parameters: [
        { name: '1', value: prenom },
        { name: '2', value: fmtDateFR(jourSuivantYMD(conge.date_fin)) },
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

  const { phone, nom } = await getEmployePhone(supabase, conge.employe_id)
  if (!phone) return res.status(200).json({ ok: false, reason: 'pas de numéro téléphone pour cet employé' })

  const text = buildCongeMessage(type, conge, nom, { pris: req.query?.pris, dispo: req.query?.dispo })
  const ok = await sendReminderWhatsapp(supabase, phone, text, congeTemplate(type, conge, nom))

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
