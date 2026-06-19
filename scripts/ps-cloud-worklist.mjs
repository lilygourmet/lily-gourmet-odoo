// Liste les images cloud au nom GÉNÉRIQUE (fichier local cake-photos/_cloud/<id>.png).
// Sortie : cake-photos/_naming/cloud.json + lots batchC-<s>.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const generic = n => !n || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement|[Ss]hape|[Ff]orme|\d|img|image|dsc|photo|capture|screen|sans[ _]?titre|untitled|sl[0-9])/i.test(n.trim())

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, nom, theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const jobs = rows.filter(r => generic(r.nom) && existsSync(`cake-photos/_cloud/${r.id}.png`))
  .map(r => ({ id: r.id, local: resolve(`cake-photos/_cloud/${r.id}.png`), theme: r.theme }))

mkdirSync('cake-photos/_naming', { recursive: true })
// nettoie d'anciens lots cloud
readdirSync('cake-photos/_naming').filter(f => /^batchC-/.test(f)).forEach(f => unlinkSync(`cake-photos/_naming/${f}`))
writeFileSync('cake-photos/_naming/cloud.json', JSON.stringify(jobs))
const S = 25; let nb = 0
for (let s = 0; s < jobs.length; s += S) { writeFileSync(`cake-photos/_naming/batchC-${s}.json`, JSON.stringify(jobs.slice(s, s + S))); nb++ }
console.log(`${jobs.length} images à nommer · ${nb} lot(s) batchC-* · (sur ${rows.length} en base)`)
