// Supprime tout un thème (fichiers + lignes).
//   node scripts/ps-del-theme.mjs "Asmae benz photo"
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const theme = process.argv[2]
if (!theme) { console.error('Usage: node scripts/ps-del-theme.mjs "<theme>"'); process.exit(1) }
const { data, error } = await sb.from('ps_photos').select('id, path').eq('theme', theme)
if (error) { console.error(error.message); process.exit(1) }
if (!data.length) { console.log('Aucune ligne pour ce thème.'); process.exit(0) }
await sb.storage.from('photoshop').remove(data.map(r => r.path))
await sb.from('ps_photos').delete().in('id', data.map(r => r.id))
console.log(`Thème « ${theme} » supprimé : ${data.length} image(s).`)
