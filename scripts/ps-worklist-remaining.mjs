// Liste les images encore au nom GÉNÉRIQUE en base, mappées vers leur fichier local.
// Sortie : cake-photos/_naming/remaining.json + lots batchR-<s>.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ROOT = 'cake-photos'
const slug = s => String(s).replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || '_divers'

// map path stockage -> fichier local
const local = {}
for (const folder of readdirSync(ROOT)) {
  if (folder.startsWith('_')) continue
  const dir = join(ROOT, folder); if (!statSync(dir).isDirectory()) continue
  for (const f of readdirSync(dir)) if (/\.(png|jpe?g|webp)$/i.test(f)) local[`${slug(folder)}/${f}`] = resolve(join(dir, f))
}

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('path, nom, theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const generic = n => n === '' || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement|[0-9]+)(\b|_| |$)/.test(n || '')

const jobs = rows.filter(r => generic(r.nom) && local[r.path]).map(r => ({ path: r.path, local: local[r.path], theme: r.theme }))
mkdirSync(`${ROOT}/_naming`, { recursive: true })
writeFileSync(`${ROOT}/_naming/remaining.json`, JSON.stringify(jobs))
const S = 20; let nb = 0
for (let s = 0; s < jobs.length; s += S) { writeFileSync(`${ROOT}/_naming/batchR-${s}.json`, JSON.stringify(jobs.slice(s, s + S))); nb++ }
console.log(`${jobs.length} images génériques restantes · ${nb} lot(s) batchR-*`)
