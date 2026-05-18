// /api/push-subscribe.js
// Endpoint Vercel : enregistre l'abonnement push d'un user dans Supabase

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
