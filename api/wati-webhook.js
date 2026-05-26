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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' })
  }

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

    // Insère le message (dédoublonné sur wa_message_id si Wati renvoie le webhook)
    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: senderType,
      body: body || null,
      media_url: mediaUrl || null,
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
    if (senderType === 'client') patch.last_inbound_at = sentAt
    if (!conv.client_name && name) patch.client_name = name
    await supabase.from('conversations').update(patch).eq('id', conv.id)

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[wati-webhook]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}

// Retrouve le fil par numéro, sinon le crée.
async function getOrCreateConversation(supabase, phone, name) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, client_name')
    .eq('client_phone', phone)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ client_phone: phone, client_name: name || null, status: 'non_assignee' })
    .select('id, client_name')
    .single()
  if (error) {
    // Course possible : un autre webhook a créé le fil au même instant
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('conversations')
        .select('id, client_name')
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
