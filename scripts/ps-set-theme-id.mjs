// Met à jour ps_photos.theme par ID, depuis un JSON { "<id>": "<theme>", ... }
//   node scripts/ps-set-theme-id.mjs /tmp/pscat-3.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const map = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let ok = 0, fail = 0, lastErr = ''
const entries = Object.entries(map)
for (let i = 0; i < entries.length; i += 10) {
  await Promise.all(entries.slice(i, i + 10).map(async ([id, theme]) => {
    if (!theme || !String(theme).trim()) return
    const { error } = await sb.from('ps_photos').update({ theme: String(theme).trim().slice(0, 60) }).eq('id', id)
    if (error) { fail++; lastErr = error.message } else ok++
  }))
}
console.log(`maj ${ok} ok, ${fail} échec(s)` + (fail ? ` (${lastErr})` : ''))
