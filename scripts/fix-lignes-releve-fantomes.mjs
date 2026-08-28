// Nettoyage : lignes de relevé affichées dans « Reçus banque non liés » alors que leur
// dépôt est DÉJÀ rapproché à une enveloppe (verte). Elles sont arrivées là lors d'un
// ré-import d'une période déjà rapprochée, quand le relevé écrivait le libellé
// autrement (ex. import du 07/08 : 175 fausses lignes).
// On les marque comme prises (used_by) → elles sortent de « à lier ».
//
// Prudence : on ne traite QUE les cas sans ambiguïté (une seule ligne libre et une
// seule enveloppe verte pour un même couple date + montant).
//
// Usage :
//   node scripts/fix-lignes-releve-fantomes.mjs        -> repère seulement (rien modifié)
//   node scripts/fix-lignes-releve-fantomes.mjs --go   -> applique

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const f of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) {
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        process.env[m[1]] = v
      }
    }
  } catch { /* fichier absent, on ignore */ }
}

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const GO = process.argv.includes('--go')
const sb = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Lecture par pages de 1000 (limite Supabase).
async function all(table, select, tune = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tune(sb.from(table).select(select)).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const lignes = await all('caisse_releve_lignes', 'key,ligne_date,amount,label,used_by,ignored')
const envs = await all('caisse_enveloppes', 'id,amount_cash,note_proof', q => q.eq('releve_status', 'trouve'))

const cle = (d, montant) => `${d}|${Math.round(Number(montant) * 100)}`

// Enveloppes vertes, groupées par date + montant de LEUR ligne de relevé.
const envParCle = new Map()
for (const e of envs) {
  const d = (e.note_proof || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
  const k = cle(d, e.amount_cash)
  if (!envParCle.has(k)) envParCle.set(k, [])
  envParCle.get(k).push(e)
}
// Enveloppes déjà revendiquées par une ligne : on n'y touche pas.
const dejaPrises = new Set(lignes.filter(l => l.used_by).map(l => l.used_by))

// Lignes libres, groupées elles aussi.
const libresParCle = new Map()
for (const l of lignes.filter(l => !l.used_by && !l.ignored)) {
  const k = cle(l.ligne_date, l.amount)
  if (!libresParCle.has(k)) libresParCle.set(k, [])
  libresParCle.get(k).push(l)
}

const aCorriger = []
const ambigus = []
for (const [k, ls] of libresParCle) {
  const es = (envParCle.get(k) || []).filter(e => !dejaPrises.has(e.id))
  if (!es.length) continue                              // vraie ligne à lier : on laisse
  if (ls.length === 1 && es.length === 1) aCorriger.push({ ligne: ls[0], env: es[0] })
  else ambigus.push({ k, lignes: ls.length, envs: es.length })
}

console.log(`${lignes.length} lignes de relevé · ${envs.length} enveloppes rapprochées`)
console.log(`→ ${aCorriger.length} lignes à barrer (déjà rapprochées)`)
console.log(`→ ${ambigus.length} cas ambigus laissés tels quels (plusieurs dépôts même jour/même montant)`)
for (const { ligne, env } of aCorriger.slice(0, 10)) {
  console.log(`   ${ligne.ligne_date}  ${ligne.amount} dh  « ${(ligne.label || '').slice(0, 40)} »  → enveloppe #${env.id}`)
}
if (aCorriger.length > 10) console.log(`   … et ${aCorriger.length - 10} autres`)

if (!GO) {
  console.log('\nRien modifié. Relance avec --go pour appliquer.')
  process.exit(0)
}
let n = 0
for (const { ligne, env } of aCorriger) {
  const { error } = await sb.from('caisse_releve_lignes').update({ used_by: env.id }).eq('key', ligne.key)
  if (error) { console.error('Échec sur', ligne.key, error.message); continue }
  n++
}
console.log(`\n✅ ${n} lignes barrées.`)
