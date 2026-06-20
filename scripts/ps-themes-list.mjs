// Liste les thèmes distincts (avec compte) → cake-photos/_naming/themes.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const c = {}; rows.forEach(r => c[r.theme] = (c[r.theme] || 0) + 1)
const list = Object.entries(c).map(([theme, n]) => ({ theme, n })).sort((a, b) => b.n - a.n)
mkdirSync('cake-photos/_naming', { recursive: true })
writeFileSync('cake-photos/_naming/themes.json', JSON.stringify(list, null, 0))
console.log(`${list.length} thèmes distincts (sur ${rows.length} images) → cake-photos/_naming/themes.json`)
