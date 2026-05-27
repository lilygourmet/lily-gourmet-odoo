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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' })
  }

  // Aiguillage selon ?action= ; sans action = réception entrante (appel de Wati)
  const action = req.query?.action
  if (action === 'send') return handleSend(req, res)
  if (action === 'templates') return handleTemplates(req, res)
  if (action === 'send-template') return handleSendTemplate(req, res)
  if (action === 'suggest') return handleSuggest(req, res)
  return handleInbound(req, res)
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
        .eq('sender_type', 'agent')
        .not('sender_user_id', 'is', null)
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
      // Un message client rouvre une conversation fermée
      if (conv.status === 'fermee') patch.status = conv.assigned_to ? 'en_cours' : 'non_assignee'
    }
    if (!conv.client_name && name) patch.client_name = name
    await supabase.from('conversations').update(patch).eq('id', conv.id)

    // Notif push aux users ayant accès aux Conversations (entrant client seulement).
    // Le push ne doit jamais faire échouer le webhook -> on isole avec catch.
    if (senderType === 'client') {
      await notifyConversationUsers(supabase, conv.id, name || conv.client_name || phone, body, mediaUrl)
        .catch(e => console.warn('[wati push]', e?.message || e))
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[wati-webhook]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
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
    const watiRes = await fetch(watiUrl, {
      method: 'POST',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    const watiData = await watiRes.json().catch(() => ({}))
    if (!watiRes.ok || watiData?.result === false) {
      const msg = watiData?.info || watiData?.message || `erreur ${watiRes.status}`
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

    await supabase.from('conversations')
      .update({ last_message_at: sentAt, updated_at: sentAt })
      .eq('id', conversationId)

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
  const { clientPhone, templateName, broadcastName, parameters, userId } = req.body || {}
  if (!clientPhone || !templateName) {
    return res.status(400).json({ error: 'clientPhone et templateName requis' })
  }
  const number = String(clientPhone).replace(/\D/g, '')
  const base = apiEndpoint.replace(/\/$/, '')
  const authHeader = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const r = await fetch(`${base}/api/v1/sendTemplateMessage/${number}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: broadcastName || `lily_${Date.now()}`,
        parameters: parameters || [],
      }),
    })
    const data = await r.json().catch(() => ({}))
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
      body: `[Template] ${templateName}`,
      sent_at: sentAt,
      wa_message_id: data?.id || data?.messageId || null,
    })
    await supabase.from('conversations')
      .update({ last_message_at: sentAt, updated_at: sentAt, status: 'en_cours' })
      .eq('id', conv.id)

    return res.status(200).json({ ok: true, conversationId: conv.id })
  } catch (e) {
    console.error('[wati-send-template]', e?.message || e)
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
    .select('id, client_name, status, assigned_to')
    .eq('client_phone', phone)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ client_phone: phone, client_name: name || null, status: 'non_assignee' })
    .select('id, client_name, status, assigned_to')
    .single()
  if (error) {
    // Course possible : un autre webhook a créé le fil au même instant
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('conversations')
        .select('id, client_name, status, assigned_to')
        .eq('client_phone', phone)
        .single()
      return again
    }
    throw error
  }
  return created
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
