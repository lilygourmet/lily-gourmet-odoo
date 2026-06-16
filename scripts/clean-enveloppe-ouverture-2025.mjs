// Nettoyage : supprime les enveloppes de caisse issues d'une session POS
// OUVERTE avant 2026 (ex : ouverte le 31/12/2025, clôturée en janvier 2026).
// Ces enveloppes avaient été créées par l'ancienne logique basée sur la clôture.
//
// Usage :
//   node scripts/clean-enveloppe-ouverture-2025.mjs            -> repère seulement (rien supprimé)
//   node scripts/clean-enveloppe-ouverture-2025.mjs --delete   -> supprime pour de bon

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Charge .env et .env.local dans process.env (sans rien afficher).
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

const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
const DO_DELETE = process.argv.includes('--delete')

async function rpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  })
  const j = await res.json()
  if (j.error) throw new Error(JSON.stringify(j.error))
  return j.result
}

const uid = await rpc('common', 'login', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD])

// Sessions clôturées mais OUVERTES avant 2026 (celles à exclure désormais).
const sessions = await rpc('object', 'execute_kw', [
  ODOO_DB, uid, ODOO_PASSWORD,
  'pos.session', 'search_read',
  [[['state', '=', 'closed'], ['start_at', '<', '2026-01-01 00:00:00'], ['stop_at', '>=', '2026-01-01 00:00:00']]],
  { fields: ['id', 'name', 'start_at', 'stop_at'] },
])

if (sessions.length === 0) {
  console.log('Aucune session ouverte en 2025 et clôturée en 2026. Rien à nettoyer.')
  process.exit(0)
}

console.log(`Sessions concernées (ouvertes avant 2026) : ${sessions.length}`)
for (const s of sessions) console.log(`  - #${s.id} ${s.name} | ouverte ${s.start_at} | clôturée ${s.stop_at}`)

const sb = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const sessionIds = sessions.map(s => s.id)

const { data: envs, error } = await sb
  .from('caisse_enveloppes')
  .select('id, odoo_session_id, source, session_date, payment_method, amount_cash, destinataire_id')
  .in('odoo_session_id', sessionIds)
if (error) throw error

if (!envs || envs.length === 0) {
  console.log('\nAucune enveloppe en base pour ces sessions. Rien à supprimer.')
  process.exit(0)
}

console.log(`\nEnveloppes en base à supprimer : ${envs.length}`)
for (const e of envs) {
  console.log(`  - id=${e.id} | ${e.source} | ${e.session_date} | ${e.payment_method} | ${e.amount_cash ?? ''} | affectée=${e.destinataire_id ? 'oui' : 'non'}`)
}

if (!DO_DELETE) {
  console.log('\n(Mode repérage — rien supprimé.)')
  console.log('Pour supprimer pour de bon, relance avec :  --delete')
  process.exit(0)
}

const { error: delErr } = await sb.from('caisse_enveloppes').delete().in('id', envs.map(e => e.id))
if (delErr) throw delErr
console.log(`\n✅ ${envs.length} enveloppe(s) supprimée(s).`)
