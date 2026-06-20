// Liste les images d'une catégorie (déf. Divers) avec leur fichier local, pour reclassement VISION.
//   node scripts/ps-divers-worklist.mjs "Divers"
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const theme = process.argv[2] || 'Divers'
const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, nom').eq('theme', theme).range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const jobs = rows.filter(r => existsSync(`cake-photos/_cloud/${r.id}.png`)).map(r => ({ id: r.id, local: resolve(`cake-photos/_cloud/${r.id}.png`), nom: r.nom }))
mkdirSync('cake-photos/_naming', { recursive: true })
readdirSync('cake-photos/_naming').filter(f => /^batchD-/.test(f)).forEach(f => unlinkSync(`cake-photos/_naming/${f}`))
const S = 25; let nb = 0
for (let s = 0; s < jobs.length; s += S) { writeFileSync(`cake-photos/_naming/batchD-${s}.json`, JSON.stringify(jobs.slice(s, s + S))); nb++ }
console.log(`${jobs.length} images « ${theme} » avec fichier local · ${nb} lot(s) batchD-* · (sur ${rows.length})`)
