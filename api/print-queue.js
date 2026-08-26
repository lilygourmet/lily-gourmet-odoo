// /api/print-queue.js
// Boite aux lettres entre l'app et le PC d'impression de la boutique.
//
// L'app depose ses tickets dans la table print_jobs (Supabase). Le PC ne peut
// pas etre appele directement par le navigateur : un site en « https » n'a pas
// le droit d'appeler un « http » sur le reseau local (Safari et l'iPad le
// refusent sans reglage possible), et l'adresse du PC change quand la box la
// redistribue. Alors c'est le PC qui vient CHERCHER le travail ici.
//
//   GET  ?token=...&printerIp=...&found=1  -> { jobs: [{ id, text, cut }] }
//        (donne aussi signe de vie, et passe les tickets pris en « printing »)
//   POST ?token=...   body { id, ok, error } -> { ok: true }
//        (le PC dit si le ticket est sorti ou non)
//
// Le PC ne detient qu'un jeton dedie (PRINT_TOKEN) : s'il etait recopie, il ne
// donnerait acces qu'a l'impression, a rien d'autre dans la base.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

// Un ticket pris par le PC mais jamais confirme (PC eteint en plein travail,
// coupure) ne doit pas rester « en cours » pour toujours : au bout de 3 min on
// le declare rate, pour que la personne devant l'ecran ait une reponse.
const ABANDON_MS = 3 * 60 * 1000

export default async function handler(req, res) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase non configure' })
  }
  const token = req.query?.token || req.headers['x-print-token']
  if (!process.env.PRINT_TOKEN || token !== process.env.PRINT_TOKEN) {
    return res.status(401).json({ error: 'Jeton invalide' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    if (req.method === 'GET') return await pull(req, res, supabase)
    if (req.method === 'POST') return await done(req, res, supabase)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('[print-queue]', e)
    return res.status(500).json({ error: e.message })
  }
}

// ----- Le PC vient chercher du travail -----
async function pull(req, res, supabase) {
  // Signe de vie : l'app affiche « PC d'impression allume » a partir de ca.
  await supabase.from('print_helper_status').upsert({
    id: 1,
    last_seen: new Date().toISOString(),
    printer_ip: req.query.printerIp || null,
    printer_found: req.query.found === '1',
  })

  // Tickets pris mais jamais confirmes -> declares rates.
  const limite = new Date(Date.now() - ABANDON_MS).toISOString()
  await supabase
    .from('print_jobs')
    .update({ status: 'error', error: "Le PC n'a pas confirme (3 min)" })
    .eq('status', 'printing')
    .lt('taken_at', limite)

  const { data: jobs, error } = await supabase
    .from('print_jobs')
    .select('id, text, cut')
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(20)
  if (error) throw error

  if (jobs?.length) {
    const ids = jobs.map(j => j.id)
    await supabase
      .from('print_jobs')
      .update({ status: 'printing', taken_at: new Date().toISOString() })
      .in('id', ids)
  }

  // Menage : les tickets de plus de 2 jours n'interessent plus personne.
  const vieux = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  await supabase.from('print_jobs').delete().lt('created_at', vieux)

  return res.status(200).json({ jobs: jobs || [] })
}

// ----- Le PC dit ce que le ticket est devenu -----
async function done(req, res, supabase) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const id = body.id
  if (!id) return res.status(400).json({ error: 'id manquant' })

  const { error } = await supabase
    .from('print_jobs')
    .update({
      status: body.ok ? 'done' : 'error',
      error: body.ok ? null : (body.error || 'Impression refusee'),
      printed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  return res.status(200).json({ ok: true })
}
