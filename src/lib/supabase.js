import { createClient } from '@supabase/supabase-js'

// Récupère les clefs depuis le fichier .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Crée la connexion à Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,     // garde la session active même si tu fermes l'onglet
    autoRefreshToken: true,   // rafraîchit automatiquement le token avant qu'il expire
  },
})