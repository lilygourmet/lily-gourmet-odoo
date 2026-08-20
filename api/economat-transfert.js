// api/economat-transfert.js
// Crée dans Odoo un transfert interne EN BROUILLON à partir d'une demande
// d'économat. Rien n'est confirmé : le brouillon attend une validation humaine.
//
// POST { badge, badgeLabel, demandeur, lignes: [{ odooProductId, nom, qty }] }
//   → { ok, name, id }   (name = référence Odoo, ex. E-ACP/INTAPDX/02275)

async function odooJsonRpc(service, method, args) {
  const res = await fetch(`${process.env.ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message || data.error.message || 'Erreur Odoo')
  return data.result
}

let _uid = null
async function auth() {
  if (_uid) return _uid
  const uid = await odooJsonRpc('common', 'login', [process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD])
  if (!uid) throw new Error('Connexion Odoo refusée')
  _uid = uid
  return uid
}
const exec = (uid, model, method, args, kw = {}) =>
  odooJsonRpc('object', 'execute_kw', [process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, method, args, kw])

// Où va le stock, selon le BADGE de l'employé — pas la catégorie d'articles :
// le stock part vers son lieu de travail, quel que soit l'onglet où il commande.
// src/dest sont repris explicitement pour que le transfert ne dépende pas d'un
// réglage Odoo modifié plus tard. Les 8 badges de la table economat_profils.
const DESTINATIONS = {
  boutique:                 { type: 52, src: 8, dest: 51 },  // → WHLVP/Stock/Stock Vente
  cake_design:              { type: 51, src: 8, dest: 52 },  // → WHLVP/Stock/Stock Prod
  prod_finition_cd:         { type: 51, src: 8, dest: 52 },  // → WHLVP/Stock/Stock Prod
  menage_boutique:          { type: 51, src: 8, dest: 52 },  // → WHLVP/Stock/Stock Prod
  prod_annex:               { type: 74, src: 8, dest: 62 },  // → WHPDX/Stock Prod annexe
  chocolat_cuisine_menage:  { type: 74, src: 8, dest: 62 },  // badge « Chocolat » (ancien code)
  cuisine:                  { type: 74, src: 8, dest: 62 },
  menage_annex:             { type: 74, src: 8, dest: 62 },
}
// Article fourre-tout pour ce qui n'est pas au catalogue Odoo (consommable :
// n'affecte aucun stock). Le nom réel est porté par la description de la ligne.
const AUTRE_ACHAT = 3159

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  try {
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Odoo non configuré côté serveur' })
    }
    const { badge, badgeLabel, demandeur, lignes } = req.body || {}
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne à transférer' })
    }
    const dest = DESTINATIONS[badge]
    if (!dest) {
      return res.status(400).json({
        error: badge
          ? `Le badge « ${badgeLabel || badge} » n'a pas de destination de stock définie.`
          : "Aucun badge sur ce compte : impossible de savoir où envoyer le stock.",
      })
    }

    const uid = await auth()

    // Unité de chaque produit. On prend l'unité d'ACHAT (uom_po_id), pas celle
    // de stock : c'est elle qui est affichée dans l'économat. « 1 » sur
    // « MP- Chocolat Callebaut Couverture Noir » veut dire 1 pack de 2,5 kg,
    // pas 1 kg — Odoo fait la conversion en kg tout seul.
    const ids = [...new Set(lignes.map(l => Number(l.odooProductId)).filter(Boolean))]
    ids.push(AUTRE_ACHAT)
    const prods = await exec(uid, 'product.product', 'read', [ids, ['id', 'uom_id', 'uom_po_id']])
    const uomOf = new Map(prods.map(p => [
      p.id,
      (Array.isArray(p.uom_po_id) ? p.uom_po_id[0] : null) || (Array.isArray(p.uom_id) ? p.uom_id[0] : null),
    ]))

    const moves = lignes.map(l => {
      const pid = Number(l.odooProductId) || AUTRE_ACHAT
      const texte = String(l.nom || '').slice(0, 200)
      return [0, 0, {
        // description renseignée sur CHAQUE ligne : sans elle, Odoo fusionne les
        // lignes d'un même produit (tous les « Autre achat » n'en feraient qu'une).
        name: texte,
        description_picking: texte,
        product_id: pid,
        product_uom_qty: Number(l.qty) || 1,
        product_uom: uomOf.get(pid),
        location_id: dest.src,
        location_dest_id: dest.dest,
      }]
    })

    const id = await exec(uid, 'stock.picking', 'create', [{
      picking_type_id: dest.type,
      location_id: dest.src,
      location_dest_id: dest.dest,
      origin: `ÉCONOMAT — ${demandeur || 'demande'}${badgeLabel ? ` (${badgeLabel})` : ''}`,
      move_ids_without_package: moves,
    }])

    const [pick] = await exec(uid, 'stock.picking', 'read', [[id], ['name', 'state']])
    return res.status(200).json({ ok: true, id, name: pick?.name, state: pick?.state })
  } catch (e) {
    console.error('[economat-transfert]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
