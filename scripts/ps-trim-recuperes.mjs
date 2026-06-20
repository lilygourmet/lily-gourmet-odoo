// Réduit « 🔄 Récupérés » : garde les 5 plus récentes (→ « 🗑️ Poubelle »), supprime le reste.
//   node scripts/ps-trim-recuperes.mjs            (aperçu)
//   node scripts/ps-trim-recuperes.mjs --apply
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, path, created_at').eq('theme', '🔄 Récupérés').order('created_at', { ascending: false }).range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const keep = rows.slice(0, 5), del = rows.slice(5)
console.log(`Récupérés : ${rows.length} · à garder (→ Poubelle) : ${keep.length} · à supprimer : ${del.length}`)
if (!APPLY) { console.log('(aperçu) --apply pour appliquer.'); process.exit(0) }

await sb.from('ps_photos').update({ theme: '🗑️ Poubelle' }).in('id', keep.map(r => r.id))
let d = 0
for (let i = 0; i < del.length; i += 100) { const c = del.slice(i, i + 100); await sb.storage.from('photoshop').remove(c.map(r => r.path)); await sb.from('ps_photos').delete().in('id', c.map(r => r.id)); d += c.length }
const { count } = await sb.from('ps_photos').select('*', { count: 'exact', head: true })
console.log(`Terminé : ${del.length ? d : 0} supprimées, 5 mises en Poubelle. Total restant : ${count}`)
