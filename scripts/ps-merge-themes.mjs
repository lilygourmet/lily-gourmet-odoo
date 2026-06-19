// Fusionne les thèmes quasi-identiques (variantes -Recovered, copie en conflit, casse, numéro final).
//   node scripts/ps-merge-themes.mjs           (aperçu)
//   node scripts/ps-merge-themes.mjs --apply   (applique)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

// clé de regroupement : minuscule, sans accents, sans -Recovered / copie en conflit / numéro final / ponctuation
const key = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(copie en conflit.*?\)/g, '')
  .replace(/[-_ ]*recovered/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()
  .replace(/\s*\d+$/, '').trim()

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }

// compte par thème brut
const cnt = {}; rows.forEach(r => { cnt[r.theme] = (cnt[r.theme] || 0) + 1 })
// groupes par clé
const groups = {}; Object.keys(cnt).forEach(th => { const k = key(th); (groups[k] ||= []).push(th) })
// pour chaque groupe, display = le plus PROPRE (sans Recovered/copie/numéro), puis nettoyé
const score = t => (/recovered/i.test(t) ? 100 : 0) + (/copie en conflit/i.test(t) ? 50 : 0) + (/\d+$/.test(t.trim()) ? 5 : 0) + (t === t.toLowerCase() ? 1 : 0)
const display = {}
Object.entries(groups).forEach(([k, list]) => {
  const best = list.slice().sort((a, b) => score(a) - score(b) || cnt[b] - cnt[a] || a.length - b.length)[0]
  const clean = best.replace(/\(copie en conflit.*?\)/ig, '').replace(/[-_ ]*recovered/ig, '').replace(/\s+/g, ' ').trim()
  display[k] = clean || best
})

const themesBefore = Object.keys(cnt).length
const themesAfter = Object.keys(groups).length
const merges = Object.entries(groups).filter(([, l]) => l.length > 1)
console.log(`Thèmes : ${themesBefore} → ${themesAfter} (${merges.length} groupes fusionnés)`)
console.log('Exemples de fusion :')
merges.slice(0, 12).forEach(([k, l]) => console.log(`  → "${display[k]}"  ⟵  ${l.filter(t => t !== display[k]).join(', ')}`))

if (!APPLY) { console.log('\n(aperçu) Relance avec --apply pour appliquer.'); process.exit(0) }

// applique : pour chaque thème brut différent du display de son groupe → update
let upd = 0
for (const th of Object.keys(cnt)) {
  const d = display[key(th)]
  if (d && d !== th) { const { error } = await sb.from('ps_photos').update({ theme: d }).eq('theme', th); if (!error) upd++ }
}
console.log(`Terminé : ${upd} thème(s) fusionné(s).`)
