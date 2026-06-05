// Connexion sécurisée : vérifie les identifiants (même logique que l'app via
// verify_login) PUIS renvoie un JWT signé avec le secret JWT du projet Supabase.
// Ce JWT permettra à l'app de prouver son identité à la base (pour resserrer la
// RLS ensuite). Tant que la RLS n'est pas resserrée, ça ne change rien au fonctionnement.
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!jwtSecret || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured (env manquante)' })
  }
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' })

  try {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
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
      exp: now + 60 * 60 * 12, // 12 h
    }, jwtSecret)

    return res.status(200).json({ user, token })
  } catch (e) {
    console.error('[api/login]', e?.message || e)
    return res.status(500).json({ error: e?.message || 'erreur serveur' })
  }
}
