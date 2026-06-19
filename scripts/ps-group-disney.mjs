// Regroupe les thèmes Disney sous "Disney · …" (et les princesses, dont Elsa/Frozen, sous "Disney · Princesses").
//   node scripts/ps-group-disney.mjs           (aperçu)
//   node scripts/ps-group-disney.mjs --apply
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// princesses (dont Elsa/Frozen) -> "Disney · Princesses"
const PRINCESS = ['princess', 'princesse', 'reine des neiges', 'frozen', 'elsa', 'anna', 'olaf', 'ariel', 'sirene', 'jasmine', 'aladdin', 'raiponce', 'cendrillon', 'aurore', 'blanche neige', 'snow white', 'sofia', 'sophia', 'belle', 'vaiana', 'moana', 'mulan', 'pocahontas']
// autres Disney/Pixar -> "Disney · <thème>"
const DISNEY = ['mickey', 'minnie', 'nemo', 'dory', 'toy story', 'roi lion', 'lion king', 'simba', 'tinkerbell', 'clochette', 'winnie', 'dumbo', 'cars', 'mcqueen', 'stitch', 'lilo', 'peter pan', 'bambi', 'pluto', 'donald', 'dingo', 'goofy', 'alice', 'merveilles', 'raiponce', 'planes', 'monstre', 'nemo']
const hit = (t, list) => { const s = norm(t); return list.some(k => new RegExp(`(^|[^a-z0-9])${k.replace(/ /g, '[^a-z0-9]+')}([^a-z0-9]|$)`).test(s)) }

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const cnt = {}; rows.forEach(r => { cnt[r.theme] = (cnt[r.theme] || 0) + 1 })

const plan = []   // [theme, newTheme, count]
for (const th of Object.keys(cnt)) {
  if (norm(th).startsWith('disney')) continue
  let nt = null
  if (hit(th, PRINCESS)) nt = 'Disney · Princesses'
  else if (hit(th, DISNEY)) nt = `Disney · ${th.replace(/[-_ ]*Recovered/ig, '').trim()}`
  if (nt && nt !== th) plan.push([th, nt, cnt[th]])
}
plan.sort((a, b) => a[1].localeCompare(b[1]))
console.log(`${plan.length} thèmes → Disney (${plan.reduce((s, p) => s + p[2], 0)} images)`)
plan.forEach(([t, nt, c]) => console.log(`  "${t}" (${c}) → ${nt}`))

if (!APPLY) { console.log('\n(aperçu) Vérifie la liste. --apply pour appliquer.'); process.exit(0) }
let ok = 0
for (const [t, nt] of plan) { const { error } = await sb.from('ps_photos').update({ theme: nt }).eq('theme', t); if (!error) ok++ }
console.log(`Terminé : ${ok} thème(s) regroupé(s).`)
