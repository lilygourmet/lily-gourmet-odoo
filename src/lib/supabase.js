import { createClient } from '@supabase/supabase-js'

// Récupère les clefs depuis le fichier .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Renvoie le JWT de connexion (stocké au login) s'il est valide et non expiré,
// sinon null → la base retombe sur le rôle "anon" (comme avant). Rétro-compatible.
function currentAccessToken() {
  try {
    const t = localStorage.getItem('lily_jwt')
    if (!t) return null
    const parts = t.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null // expiré
    return t
  } catch {
    return null
  }
}

// Crée la connexion à Supabase. `accessToken` = on s'identifie avec notre JWT
// signé (le rôle/identité serviront à resserrer la RLS). Sans JWT → anon.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => currentAccessToken(),
})