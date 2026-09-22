// ============================================================
// LA CLÔTURE AUTOMATIQUE DU COMPTAGE DU SOIR — 23 h.
//
// « Ça doit s'arrêter automatiquement avant que les ventes commencent, pour ne
// pas avoir un rapport faux » (Layla, 2026-09-22), puis, en apprenant qu'ils
// comptent le soir : « en fait ils comptent tout le temps le soir mais ne
// clôturent pas le compte ». Et enfin : « 23 h c'est bien ».
//
// MESURÉ avant d'écrire une ligne. Sur les 1 000 derniers comptages :
//   18 h : 254   ·   19 h : 554   ·   20 h : 192
// Ils comptent donc entre 18 h et 20 h, toujours. Mais la journée, elle, était
// clôturée à 19-20 h une fois sur deux seulement — les autres fois à 08 h 42,
// 09 h 00, 09 h 31, 09 h 39… LE LENDEMAIN MATIN. Or c'est la clôture qui prend
// la photo du stock Odoo : prise le lendemain, elle inclut les ventes du
// matin, et tous les écarts de la journée sont faux. Une journée sur deux.
//
// ⚠️ POURQUOI PAS « DÈS QUE TOUT EST COMPTÉ », qu'elle avait aussi évoqué :
// parce que je ne sais pas si le café VEND ENCORE après avoir compté. S'il
// compte à 20 h et ferme à 22 h, clôturer à 20 h ferait des ventes du soir
// autant d'écarts. 23 h est juste dans les deux cas — on s'en tient là tant
// qu'elle n'a pas tranché.
//
// ⚠️ ET ON NE CLÔT JAMAIS UNE JOURNÉE OÙ RIEN N'A ÉTÉ COMPTÉ : ce serait
// fabriquer exactement le rapport faux qu'on cherche à éviter. Sans comptage,
// la journée reste ouverte et quelqu'un le verra.
// ============================================================

import { createClient } from '@supabase/supabase-js'

/** Le jour, à Casablanca — pas en UTC : à 22 h UTC il est 23 h ici. */
const jourLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' })

export default async function handler(req, res) {
  // Même garde que les autres tâches : le cron de Vercel, ou le secret.
  const authHeader = req.headers['authorization'] || ''
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!req.headers['x-vercel-cron']
    || (cronSecret && (authHeader === `Bearer ${cronSecret}` || (req.query?.secret || '') === cronSecret))
  if (!isCron) return res.status(401).json({ error: 'Unauthorized' })

  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured (Supabase)' })
  }
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  const jour = jourLocal()
  try {
    // ⚠️ SEULEMENT LA JOURNÉE DU JOUR. Une journée oubliée depuis trois jours
    // ne se rattrape pas : sa photo Odoo serait celle d'aujourd'hui, donc un
    // mensonge. On la laisse ouverte plutôt que de la clore de travers.
    const { data: jours, error: eJour } = await sb.from('stock_day')
      .select('id, day, status').eq('day', jour).eq('status', 'open')
    if (eJour) return res.status(500).json({ error: eJour.message })
    if (!jours || !jours.length) {
      return res.status(200).json({ jour, ferme: 0, raison: 'aucune journée ouverte' })
    }

    const faits = []
    for (const j of jours) {
      // Qui a compté, et combien de lignes : c'est ce qui décide.
      const { data: items } = await sb.from('stock_day_items')
        .select('counted_by, counted_at').eq('stock_day_id', j.id)
        .not('counted_at', 'is', null).order('counted_at', { ascending: false }).limit(1000)
      if (!items || !items.length) {
        faits.push({ id: j.id, ferme: false, raison: 'rien de compté' })
        continue
      }
      // ⚠️ La clôture est mise au nom de CELUI QUI A COMPTÉ EN DERNIER, pas
      // d'un compte technique : c'est son travail qu'on ferme, et l'écran dit
      // qui a soumis.
      const par = items[0].counted_by || null

      const { error: eMaj } = await sb.from('stock_day').update({
        status: 'submitted', submitted_by: par, submitted_at: new Date().toISOString(),
      }).eq('id', j.id).eq('status', 'open')
      if (eMaj) { faits.push({ id: j.id, ferme: false, raison: eMaj.message }); continue }

      // LA PHOTO DU STOCK ODOO, prise maintenant — c'est tout l'objet de
      // l'affaire. Elle passe par l'endpoint qui sait le faire, avec le même
      // utilisateur ; s'il échoue, la journée reste close et la photo se
      // rattrape à la main (« Rafraîchir Odoo »).
      let photo = 'non tentée'
      const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
      if (base && par) {
        try {
          const r = await fetch(`${base}/api/stock-odoo-snapshot`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: par, stock_day_id: j.id, initial: true }),
          })
          const d = await r.json().catch(() => ({}))
          photo = d?.error ? `échouée : ${String(d.error).slice(0, 120)}` : 'prise'
        } catch (e) { photo = `échouée : ${(e.message || e).toString().slice(0, 120)}` }
      }
      faits.push({ id: j.id, ferme: true, comptages: items.length, par, photo })
      console.log(`[cloture-auto] ${jour} fermée (${items.length} comptages) — photo ${photo}`)
    }

    return res.status(200).json({ jour, ferme: faits.filter(f => f.ferme).length, faits })
  } catch (e) {
    console.error('[cloture-auto]', e)
    return res.status(500).json({ error: (e.message || String(e)).slice(0, 300) })
  }
}
