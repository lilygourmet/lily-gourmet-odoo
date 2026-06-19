// Liste les images d'une catégorie fourre-tout à reclasser (id + nom), en lots.
//   node scripts/ps-cat-worklist.mjs test
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const theme = process.argv[2] || 'test'
const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, nom').eq('theme', theme).range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
mkdirSync('cake-photos/_naming', { recursive: true })
readdirSync('cake-photos/_naming').filter(f => /^batchT-/.test(f)).forEach(f => unlinkSync(`cake-photos/_naming/${f}`))
const S = 100; let nb = 0
for (let s = 0; s < rows.length; s += S) { writeFileSync(`cake-photos/_naming/batchT-${s}.json`, JSON.stringify(rows.slice(s, s + S).map(r => ({ id: r.id, nom: r.nom })))); nb++ }
console.log(`${rows.length} images dans « ${theme} » · ${nb} lot(s) batchT-*`)
