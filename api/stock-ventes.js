import { FUSEAU_MAROC } from '../src/lib/fuseauMaroc.js'
// ============================================================
// CE QUI A ÉTÉ VENDU, ET À QUELLES HEURES.
//
// « Est-ce qu'on fait rentrer vendu ? » (Layla, 2026-09-22) — non, et il ne
// faut surtout pas : saisir les ventes à la main doublerait la caisse, et deux
// sources finissent toujours par diverger. C'est Odoo qui le sait déjà.
//
// Puis : « une colonne informative de vendu. Avec un détail si on clique, des
// horaires vendus de cet article. »
//
// Le « vendu » n'est donc pas déduit d'un calcul — il vient de la CAISSE
// (`pos.order.line`). C'est un fait, et il rend l'écart lisible :
//
//     reçu 28  +  reste 0  −  vendu 22  =  devrait rester 6   ·  compté 6 ✅
//
// Quand ça ne tombe pas juste, l'écart est exactement ce qui est parti sans
// vente : vol, casse non saisie, ou erreur de comptage.
//
// ⚠️ LECTURE SEULE. Rien n'est écrit dans Odoo, ici ou ailleurs.
// ============================================================

const LIMITE_LIGNES = 6000

async function odooJsonRpc(service, method, args) {
  const r = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`)
  const d = await r.json()
  if (d.error) throw new Error(`Odoo: ${d.error.data?.message || d.error.message}`)
  return d.result
}

let _uid = null
async function uid() {
  if (_uid) return _uid
  _uid = await odooJsonRpc('common', 'authenticate',
    [process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD, {}])
  if (!_uid) throw new Error('Odoo authentication failed')
  return _uid
}
const sr = async (model, domain, fields, opts = {}) => odooJsonRpc('object', 'execute_kw',
  [process.env.ODOO_DB, await uid(), process.env.ODOO_PASSWORD, model, 'search_read', [domain, fields], opts])

/** Le nom d'Odoo, sans sa référence entre crochets — comme partout ailleurs. */
const sansRef = t => String(t || '').replace(/^\[[^\]]*\]\s*/, '').trim()
/** La clé de rapprochement : c'est par le NOM qu'on relie caisse et comptage. */
const cle = t => sansRef(t).replace(/\s+/g, ' ').trim().toLowerCase()

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const jour = String(req.query.jour || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return res.status(400).json({ error: 'jour attendu au format AAAA-MM-JJ' })
  }
  if (!process.env.ODOO_URL || !process.env.ODOO_DB) {
    return res.status(500).json({ error: 'Server misconfigured (Odoo)' })
  }
  try {
    // ⚠️ LA JOURNÉE DE CAISSE VA AU-DELÀ DE MINUIT ? Non — mais les ventes du
    // soir comptent, et le comptage a lieu à 19 h. On prend donc la journée
    // ENTIÈRE : c'est elle qu'Odoo a déduite du stock.
    const lignes = await sr('pos.order.line',
      [['order_id.date_order', '>=', `${jour} 00:00:00`],
        ['order_id.date_order', '<=', `${jour} 23:59:59`]],
      ['product_id', 'qty', 'order_id'], { limit: LIMITE_LIGNES })

    if (!lignes.length) return res.status(200).json({ jour, ventes: {} })

    // Les heures viennent de la COMMANDE, pas de la ligne : une seule lecture
    // pour toutes, sinon c'est un aller-retour par ticket.
    const ids = [...new Set(lignes.map(l => (Array.isArray(l.order_id) ? l.order_id[0] : null)).filter(Boolean))]
    const cmds = ids.length
      ? await sr('pos.order', [['id', 'in', ids]], ['date_order'], { limit: LIMITE_LIGNES })
      : []
    const quand = new Map(cmds.map(c => [c.id, c.date_order]))

    const par = {}
    for (const l of lignes) {
      const nom = sansRef(Array.isArray(l.product_id) ? l.product_id[1] : '')
      if (!nom) continue
      const k = cle(nom)
      const d = String(quand.get(Array.isArray(l.order_id) ? l.order_id[0] : null) || '')
      // ⚠️ Odoo stocke en UTC ; la boutique vit à Casablanca (UTC+1). Une heure
      // d'écart sur un horaire de vente, et la lecture ne veut plus rien dire.
      // ⚠️ PAS le français ici : `fr-FR` rend « 10 h », et on se retrouvait avec
      // « 10 hh:7 » à l'écran. `en-GB` rend « 10 », tout court.
      // ⚠️ `en-GB` et pas `fr-FR` : le français rend « 10 h 07 », avec un « h »
      // au milieu. Ici on veut « 10:07 », tout court.
      const h = d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleTimeString('en-GB',
        { timeZone: FUSEAU_MAROC, hour: '2-digit', minute: '2-digit', hour12: false })
        : null
      const e = par[k] || (par[k] = { produit: nom, total: 0, moments: [] })
      const q = Number(l.qty) || 0
      e.total += q
      // ⚠️ L'HEURE EXACTE, PAS LA TRANCHE (Layla, 2026-09-22 : « mets-moi
      // l'heure exacte d'achat »). « 10h : 7 » disait combien, jamais quand —
      // or c'est le QUAND qui permet de rapprocher une vente d'une découpe,
      // d'un passage, d'un soupçon. Sept ventes à 10 h 03 et sept ventes
      // étalées sur l'heure ne racontent pas la même histoire.
      if (h) e.moments.push({ h, qty: q })
    }
    for (const k of Object.keys(par)) {
      par[k].total = Math.round(par[k].total * 100) / 100
      par[k].moments.sort((a, b) => a.h.localeCompare(b.h))
    }

    return res.status(200).json({ jour, ventes: par })
  } catch (e) {
    return res.status(200).json({ error: (e.message || String(e)).slice(0, 300) })
  }
}
