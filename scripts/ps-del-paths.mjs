// Supprime des images précises (fichier + ligne) à partir d'un JSON de chemins.
//   node scripts/ps-del-paths.mjs /tmp/psdel.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const paths = JSON.parse(readFileSync(process.argv[2], 'utf8'))
await sb.storage.from('photoshop').remove(paths)
const { error } = await sb.from('ps_photos').delete().in('path', paths)
console.log(error ? error.message : `${paths.length} supprimée(s).`)
