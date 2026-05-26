// /api/push.js
// Endpoint Vercel regroupant 2 actions push (distinguees par ?action=) :
//   - ?action=subscribe : enregistre l'abonnement push d'un user dans Supabase
//   - ?action=send      : envoie une notification push a tous les abonnes d'un role
// Fusion de push-subscribe.js + push-send.js (1 seule fonction pour rester sous
// la limite Hobby de 12 fonctions). Les anciennes URLs sont preservees via des
// rewrites dans vercel.json.

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const vapidPublic = process.env.VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
const vapidContact = process.env.VAPID_CONTACT || 'mailto:contact@lilygourmet.com'

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidContact, vapidPublic, vapidPrivate)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' })
  }

  const action = req.query?.action
  if (action === 'subscribe') return handleSubscribe(req, res)
  if (action === 'send') return handleSend(req, res)
  return res.status(400).json({ error: "action requise : 'subscribe' ou 'send'" })
}

// --- Enregistre l'abonnement push d'un user dans Supabase ---
async function handleSubscribe(req, res) {
  const { user_id, role, subscription } = req.body || {}
  if (!user_id || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'user_id + subscription.endpoint requis' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Upsert sur (endpoint) : si l'endpoint existe deja on met a jour le user/role
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id,
      role: role || 'cafe',
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh || '',
      auth: subscription.keys?.auth || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })

  if (error) {
    console.error('[push-subscribe]', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ ok: true })
}

// --- Envoie une notification push a tous les abonnes d'un role ---
async function handleSend(req, res) {
  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID keys missing' })
  }

  const { role = 'cafe', title, body, url, tag } = req.body || {}
  if (!title || !body) {
    return res.status(400).json({ error: 'title et body requis' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Recupere les abonnements actifs pour ce role
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('role', role)
  if (error) {
    console.error('[push-send] supabase', error)
    return res.status(500).json({ error: error.message })
  }
  if (!subs || subs.length === 0) {
    return res.status(200).json({ sent: 0, total: 0, note: 'aucun abonne' })
  }

  const payload = JSON.stringify({
    title,
    body,
    url: url || '/',
    tag: tag || 'lily-vitrine',
  })

  let sent = 0
  const failedIds = []
  await Promise.all(subs.map(async (s) => {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    }
    try {
      await webpush.sendNotification(subscription, payload)
      sent++
    } catch (e) {
      // 410 Gone ou 404 Not Found : l'abonnement n'est plus valide, on le supprime
      const status = e?.statusCode
      if (status === 410 || status === 404) {
        failedIds.push(s.id)
      } else {
        console.warn('[push-send] err for', s.endpoint, status, e?.message)
      }
    }
  }))

  // Nettoie les abonnements expires
  if (failedIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', failedIds)
  }

  return res.status(200).json({
    sent,
    total: subs.length,
    cleaned: failedIds.length,
  })
}
