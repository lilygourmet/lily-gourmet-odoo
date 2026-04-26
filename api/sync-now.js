// Serverless function Vercel - Sync declenchee depuis l'app
// Endpoint: POST /api/sync-now
// Body JSON: { user_id }
// Verifie que le user existe, est actif, et a perm_sync (ou role=admin)
// Puis appelle /api/sync-odoo

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user_id } = req.body || {}
    if (!user_id) {
      return res.status(400).json({ error: 'user_id requis' })
    }

    if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    if (!process.env.SYNC_SECRET_TOKEN) {
      return res.status(500).json({ error: 'SYNC_SECRET_TOKEN missing' })
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, role, active, perm_sync')
      .eq('id', user_id)
      .maybeSingle()

    if (profileErr) {
      return res.status(500).json({ error: 'Erreur lecture profil' })
    }
    if (!profile) {
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }
    if (!profile.active) {
      return res.status(403).json({ error: 'Compte desactive' })
    }

    const isAdmin = profile.role === 'admin'
    if (!isAdmin && !profile.perm_sync) {
      return res.status(403).json({ error: 'Permission refusee' })
    }

    const baseUrl = `https://${req.headers.host}`
    const syncUrl = `${baseUrl}/api/sync-odoo`

    const syncRes = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SYNC_SECRET_TOKEN}`,
      },
    })

    const syncData = await syncRes.json()

    if (!syncRes.ok) {
      return res.status(syncRes.status).json({
        error: syncData.error || 'Erreur sync',
        details: syncData,
      })
    }

    return res.status(200).json({
      success: true,
      triggered_by: profile.username,
      ...syncData,
    })
  } catch (e) {
    console.error('[sync-now] Erreur:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
