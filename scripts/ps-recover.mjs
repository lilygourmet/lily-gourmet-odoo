// Récupère les images présentes dans le cache local (_cloud) mais plus en base → catégorie "🔄 Récupérés".
//   node scripts/ps-recover.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const ids = new Set(); let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id').range(from, from + 999); if (error) { console.log(error.message); break } data.forEach(r => ids.add(r.id)); if (data.length < 1000) break; from += 1000 }
const orphans = readdirSync('cake-photos/_cloud').filter(f => /\.png$/.test(f)).map(f => f.replace('.png', '')).filter(id => !ids.has(id))
console.log(`${orphans.length} images à récupérer…`)

let ok = 0, fail = 0, lastErr = ''
const CC = 8
for (let i = 0; i < orphans.length; i += CC) {
  await Promise.all(orphans.slice(i, i + CC).map(async oldId => {
    try {
      const buf = readFileSync(`cake-photos/_cloud/${oldId}.png`)
      const path = `Recuperes/${oldId}.png`
      const { error: up } = await sb.storage.from('photoshop').upload(path, buf, { contentType: 'image/png', upsert: true })
      if (up) throw up
      const { error } = await sb.from('ps_photos').insert({ theme: '🔄 Récupérés', nom: '(récupéré)', path })
      if (error) throw error
      ok++
    } catch (e) { fail++; lastErr = e?.message || String(e) }
  }))
  if ((i / CC) % 20 === 0) console.log(`  ${ok + fail}/${orphans.length}`)
}
console.log(`Terminé : ${ok} récupérée(s), ${fail} échec(s)` + (fail ? ' (' + lastErr + ')' : ''))
