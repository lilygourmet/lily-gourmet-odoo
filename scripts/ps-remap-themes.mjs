// Renomme/fusionne des thèmes en masse depuis { "ancien thème": "nouvelle famille", ... }
//   node scripts/ps-remap-themes.mjs /tmp/thememap.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const map = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let ok = 0, fail = 0, lastErr = ''
for (const [oldT, newT] of Object.entries(map)) {
  if (!newT || oldT === newT) continue
  const { error } = await sb.from('ps_photos').update({ theme: String(newT).slice(0, 60) }).eq('theme', oldT)
  if (error) { fail++; lastErr = error.message } else ok++
}
console.log(`${ok} thème(s) remappé(s), ${fail} échec(s)` + (fail ? ' (' + lastErr + ')' : ''))
