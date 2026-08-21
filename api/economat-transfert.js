// api/economat-transfert.js
// Crée dans Odoo un transfert interne EN BROUILLON à partir d'une demande
// d'économat. Rien n'est confirmé : le brouillon attend une validation humaine.
//
// POST { badge, badgeLabel, demandeur, lignes: [{ odooProductId, nom, qty, unite }] }
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

// ── Odoo LG traiteur (2e base, société « LG traiteur ») ────────────────
// Les articles marqués odoo_source = 'lgt' n'existent QUE là-bas. Ce ne sont
// pas des transferts internes mais des ACHATS : on crée une DEMANDE DE PRIX
// (bon de commande fournisseur en brouillon), une par fournisseur. C'est
// l'économe qui la confirme, et Odoo génère alors la réception tout seul.
// picking_type 86 = « LGT prod: Réceptions », comme sur les achats existants.
const LGT_PICKING_TYPE = 86

async function odoo2JsonRpc(service, method, args) {
  const res = await fetch(`${process.env.ODOO2_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message || data.error.message || 'Erreur Odoo LG traiteur')
  return data.result
}

let _uid2 = null
async function auth2() {
  if (_uid2) return _uid2
  const uid = await odoo2JsonRpc('common', 'authenticate', [process.env.ODOO2_DB, process.env.ODOO2_USER, process.env.ODOO2_PASSWORD, {}])
  if (!uid) throw new Error('Connexion Odoo LG traiteur refusée')
  _uid2 = uid
  return uid
}
const exec2 = (uid, model, method, args, kw = {}) =>
  odoo2JsonRpc('object', 'execute_kw', [process.env.ODOO2_DB, uid, process.env.ODOO2_PASSWORD, model, method, args, kw])

// ── Transferts entre les deux ateliers (onglets Transferts MP / Produits SM) ──
// Emplacements Odoo et type de transfert interne « prod annexe -> prod » (n° 75).
// Le sens inverse réutilise le même type avec les lieux échangés : Odoo n'a pas
// de type « prod -> prod annexe » et on ne touche pas à sa configuration.
const PROD_ANNEXE = 62, PROD_BOUTIQUE = 52, TYPE_INTERNE_PRODS = 75

async function handleTransfertStock(req, res) {
  const { sens, lignes, origine } = req.body || {}
  if (!Array.isArray(lignes) || !lignes.length) {
    return res.status(400).json({ error: 'Aucune ligne à transférer' })
  }
  const [src, dest] = sens === 'boutique_annexe'
    ? [PROD_BOUTIQUE, PROD_ANNEXE]
    : [PROD_ANNEXE, PROD_BOUTIQUE]
  const uid = await auth()
  // Unité de STOCK du produit (un transfert interne ne se compte pas en unité d'achat).
  const ids = [...new Set(lignes.map(l => Number(l.odooProductId)).filter(Boolean))]
  if (!ids.length) return res.status(400).json({ error: 'Lignes sans produit Odoo' })
  const prods = await exec(uid, 'product.product', 'read', [ids, ['id', 'uom_id']])
  const uomOf = new Map(prods.map(p => [p.id, Array.isArray(p.uom_id) ? p.uom_id[0] : null]))

  const moves = lignes.map(l => {
    const pid = Number(l.odooProductId)
    const texte = String(l.nom || '').slice(0, 200)
    return [0, 0, {
      name: texte,
      description_picking: texte,
      product_id: pid,
      product_uom_qty: Number(l.qty) || 0,
      product_uom: uomOf.get(pid),
      location_id: src,
      location_dest_id: dest,
    }]
  })
  const id = await exec(uid, 'stock.picking', 'create', [{
    picking_type_id: TYPE_INTERNE_PRODS,
    location_id: src,
    location_dest_id: dest,
    origin: String(origine || 'Transfert app').slice(0, 200),
    move_ids_without_package: moves,
  }])
  const [pick] = await exec(uid, 'stock.picking', 'read', [[id], ['name', 'state']])
  return res.status(200).json({ ok: true, id, name: pick?.name, state: pick?.state })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })
  try {
    // Transfert entre ateliers (≠ demande d'économat) — même fonction pour rester
    // sous la limite de 12 fonctions Vercel.
    if (req.body?.mode === 'stock') return await handleTransfertStock(req, res)
    if (!process.env.ODOO_URL || !process.env.ODOO_USERNAME) {
      return res.status(500).json({ error: 'Odoo non configuré côté serveur' })
    }
    const { badge, badgeLabel, demandeur, lignes } = req.body || {}
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne à transférer' })
    }
    // Les articles LG traiteur partent dans l'autre Odoo : ils ne dépendent
    // pas du badge, mais de leur fournisseur.
    const lignesLgt = lignes.filter(l => l.source === 'lgt')
    const lignesLg = lignes.filter(l => l.source !== 'lgt')

    const dest = DESTINATIONS[badge]
    if (lignesLg.length && !dest) {
      return res.status(400).json({
        error: badge
          ? `Le badge « ${badgeLabel || badge} » n'a pas de destination de stock définie.`
          : "Aucun badge sur ce compte : impossible de savoir où envoyer le stock.",
      })
    }

    const origine = `ÉCONOMAT — ${demandeur || 'demande'}${badgeLabel ? ` (${badgeLabel})` : ''}`
    const transferts = []

    const uid = lignesLg.length ? await auth() : null

    // Unité de chaque produit. Par défaut l'unité d'ACHAT (uom_po_id), celle
    // qu'affiche l'économat : « 1 » sur « Chocolat Callebaut Couverture Noir »
    // veut dire 1 pack de 2,5 kg, pas 1 kg — Odoo convertit seul.
    // MAIS si l'article économat affiche l'unité de STOCK (Glucose Atomisé
    // demandé au kg alors qu'il s'achète par pack de 25 kg), on suit ce que
    // voit l'employé. C'est donc l'unité de l'article qui décide, pas une
    // liste d'exceptions : changer l'unité dans l'économat suffit.
    async function uomChooser(execFn, u, lot, avecAutre) {
      const ids = [...new Set(lot.map(l => Number(l.odooProductId)).filter(Boolean))]
      if (avecAutre) ids.push(AUTRE_ACHAT)
      const prods = ids.length ? await execFn(u, 'product.product', 'read', [ids, ['id', 'uom_id', 'uom_po_id']]) : []
      const infoOf = new Map(prods.map(p => [p.id, p]))
      const meme = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
      return (pid, uniteAffichee) => {
        const p = infoOf.get(pid)
        if (!p) return null
        const stock = Array.isArray(p.uom_id) ? p.uom_id : null
        const achat = Array.isArray(p.uom_po_id) ? p.uom_po_id : null
        if (stock && meme(uniteAffichee, stock[1])) return stock[0]
        return (achat || stock || [null])[0]
      }
    }

    const enMove = (l, choisirUom, srcLoc, destLoc, pidDefaut) => {
      const pid = Number(l.odooProductId) || pidDefaut
      const texte = String(l.nom || '').slice(0, 200)
      return [0, 0, {
        // description renseignée sur CHAQUE ligne : sans elle, Odoo fusionne les
        // lignes d'un même produit (tous les « Autre achat » n'en feraient qu'une).
        name: texte,
        description_picking: texte,
        product_id: pid,
        product_uom_qty: Number(l.qty) || 1,
        product_uom: choisirUom(pid, l.unite),
        location_id: srcLoc,
        location_dest_id: destLoc,
      }]
    }

    // 1) Odoo Lily Gourmet : le transfert interne habituel, vers le lieu du badge
    if (lignesLg.length) {
      const choisirUom = await uomChooser(exec, uid, lignesLg, true)
      const id = await exec(uid, 'stock.picking', 'create', [{
        picking_type_id: dest.type,
        location_id: dest.src,
        location_dest_id: dest.dest,
        origin: origine,
        move_ids_without_package: lignesLg.map(l => enMove(l, choisirUom, dest.src, dest.dest, AUTRE_ACHAT)),
      }])
      const [pick] = await exec(uid, 'stock.picking', 'read', [[id], ['name', 'state']])
      transferts.push({ source: 'principal', id, name: pick?.name, state: pick?.state, fournisseur: null })
    }

    // 2) Odoo LG traiteur : une DEMANDE DE PRIX par fournisseur.
    //    Prix laissé à 0 : c'est justement ce qu'on demande au fournisseur.
    if (lignesLgt.length) {
      const uid2 = await auth2()
      const choisirUom2 = await uomChooser(exec2, uid2, lignesLgt, false)
      const parFournisseur = new Map()
      for (const l of lignesLgt) {
        const k = Number(l.fournisseurId) || 0   // 0 = fournisseur inconnu
        if (!parFournisseur.has(k)) parFournisseur.set(k, [])
        parFournisseur.get(k).push(l)
      }
      const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ')
      for (const [fid, lot] of parFournisseur) {
        // Sans fournisseur connu, Odoo refuse la demande de prix (le contact
        // est obligatoire) : on le signale plutôt que d'échouer en silence.
        if (!fid) {
          transferts.push({ source: 'lgt', erreur: 'sans fournisseur',
            articles: lot.map(l => l.nom), fournisseur: null })
          continue
        }
        const lignesPo = lot.map(l => {
          const pid = Number(l.odooProductId)
          if (!pid) return null
          return [0, 0, {
            product_id: pid,
            name: String(l.nom || '').slice(0, 200),
            product_qty: Number(l.qty) || 1,
            product_uom: choisirUom2(pid, l.unite),
            price_unit: 0,
            date_planned: demain,
          }]
        }).filter(Boolean)
        if (!lignesPo.length) continue
        const id = await exec2(uid2, 'purchase.order', 'create', [{
          partner_id: fid,
          picking_type_id: LGT_PICKING_TYPE,
          origin: origine,
          date_planned: demain,
          order_line: lignesPo,
        }])
        const [po] = await exec2(uid2, 'purchase.order', 'read', [[id], ['name', 'state']])
        transferts.push({ source: 'lgt', id, name: po?.name, state: po?.state, fournisseur: lot[0]?.fournisseurNom || null })
      }
    }

    // name/id gardés pour ne rien casser chez les appelants existants
    return res.status(200).json({ ok: true, transferts, id: transferts[0]?.id, name: transferts[0]?.name })
  } catch (e) {
    console.error('[economat-transfert]', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
