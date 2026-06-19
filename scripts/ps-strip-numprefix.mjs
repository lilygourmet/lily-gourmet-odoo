// Enlève le préfixe numérique des noms ("037 Logo PAPA" -> "Logo PAPA").
//   node scripts/ps-strip-numprefix.mjs           (aperçu)
//   node scripts/ps-strip-numprefix.mjs --apply
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, nom').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const fix = []
for (const r of rows) {
  const nn = (r.nom || '').replace(/^\d+[\s_]+/, '').trim()   // enlève "037 " ou "037_" au début
  if (nn && nn !== r.nom) fix.push({ id: r.id, nom: nn, old: r.nom })
}
console.log(`${fix.length} noms à nettoyer`); console.log('Exemples:', fix.slice(0, 8).map(f => `${f.old} -> ${f.nom}`))
if (!APPLY) { console.log('\n(aperçu) --apply pour appliquer.'); process.exit(0) }
let ok = 0
for (let i = 0; i < fix.length; i += 10) await Promise.all(fix.slice(i, i + 10).map(async f => { const { error } = await sb.from('ps_photos').update({ nom: f.nom }).eq('id', f.id); if (!error) ok++ }))
console.log(`Terminé : ${ok} renommés.`)
