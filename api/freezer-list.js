// ============================================================
// API: GET /api/freezer-list?dates=YYYY-MM-DD,YYYY-MM-DD
// Retourne la liste des MOs cakedesign (composants CD) a sortir du congelateur
// par jour, avec scode + WHLVP/MO/#### + taille + parfum
// Format : { items: [{ date, mo_id, mo_name, taille, parfum, scode, hour, minute }] }
// ============================================================

async function odooJsonRpc(service, method, args) {
  const url = `${process.env.ODOO_URL}/jsonrpc`
  const body = { jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}: ${await r.text()}`)
  const data = await r.json()
  if (data.error) throw new Error(`Odoo error: ${data.error.data?.message || data.error.message}`)
  return data.result
}

// uid Odoo fixe (mot de passe renvoyé à chaque requête) → gardé en mémoire pour ne pas se reconnecter à chaque appel.
let _odooUid = null
async function odooAuth() {
  if (_odooUid) return _odooUid
  const uid = await odooJsonRpc('common', 'authenticate', [
    process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_PASSWORD, {},
  ])
  if (!uid) throw new Error('Odoo authentication failed')
  _odooUid = uid
  return uid
}

async function odooSearchRead(uid, model, domain, fields, opts = {}) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD,
    model, 'search_read', [domain, fields], opts,
  ])
}

// Parse les noms de produits cakedesign Odoo :
//  - "20 cm CD* (Citron)" / "15 cm cakedesign (Vanille)" -> { taille: "15 cm", parfum: "Vanille" }
//  - "40x40 Cakedesign CD* (Praliné)" -> { taille: "40×40", parfum: "Praliné" }
//  - "35x35 Cakedesign CD* (Vanille)" -> { taille: "35×35", parfum: "Vanille" }
//  - "CD- Cakedesign Plaque supreme amande CD*" -> { taille: "Plaque suprême amande", parfum: "" }
// Exclut explicitement :
//  - "CD- Ganache cakedesign (...)" : c'est un ingrédient, pas un composant à sortir
function parseCakedesign(productName) {
  if (!productName) return null
  const n = productName.trim()
  // Exclusions : ingrédients / sous-recettes (pas des fonds à sortir du congélateur)
  if (/ganache\s+cakedesign/i.test(n)) return null   // ganache = ingrédient
  if (/^\s*MP-/i.test(n)) return null                // MP- = matière première
  if (/^\s*SM\b/i.test(n)) return null               // SM CD* = crèmes/craquant/bases montées à part
  // Doit être un composant cakedesign
  if (!/(cakedesign|CD\*)/i.test(n)) return null
  const cleanP = (s) => (s || '').replace(/\bCD\*?\b/ig, '').replace(/cakedesign/ig, '').replace(/\s+/g, ' ').trim()
  let m
  // Bombé : "18cm bombé Cakedesign CD*"
  if ((m = n.match(/(\d+)\s*cm\s*bomb[ée]/i))) return { taille: `${m[1]} cm bombé`, parfum: '' }
  // Cœur : "Coeur 15p Cakedesign CD*"
  if ((m = n.match(/c(?:oe|œ)ur\s*(\d+)\s*p\b/i))) return { taille: `Cœur ${m[1]}p`, parfum: '' }
  // Carré / rectangle : "40x40 Cakedesign CD*" (parfum entre parenthèses si présent)
  if ((m = n.match(/(\d+)\s*[x×]\s*(\d+)\s*cakedesign/i))) {
    const pm = n.match(/\(([^)]+)\)/)
    return { taille: `${m[1]}×${m[2]}`, parfum: pm && !/pers/i.test(pm[1]) ? pm[1].trim() : '' }
  }
  // Rond : "15 cm cakedesign (Vanille)", "20 cm CD* vanille Bleu", "CD- Cakedesign 40 cm (40 pers) CD* (Oréo)"
  if ((m = n.match(/(\d+)\s*cm/i))) {
    let parfum = ''
    const allParens = [...n.matchAll(/\(([^)]+)\)/g)].map(x => x[1].trim())
    const flav = allParens.filter(p => !/pers/i.test(p))   // ignore "(40 pers)"
    if (flav.length) parfum = flav[flav.length - 1]         // dernier parfum réel, ex. "(Oréo)"
    else if (allParens.length === 0) { const a = n.match(/\d+\s*cm\s*(?:CD\*?|cakedesign)\s*(.+)$/i); if (a) parfum = cleanP(a[1]) }
    return { taille: `${m[1]} cm`, parfum }
  }
  // Plaque : "CD- Cakedesign Plaque Oreo CD*", "Plaque fraisier"…
  if ((m = n.match(/plaque\s+(.+?)\s*(?:CD\*?\s*)?$/i))) return { taille: `Plaque ${cleanP(m[1])}`.replace(/\s+/g, ' ').trim(), parfum: '' }
  // Letter Cake
  if (/letter\s*cake/i.test(n)) return { taille: 'Letter Cake', parfum: '' }

  return null
}

async function fetchListForDate(date, uid, includeDone = false) {
  const startUTC = `${date} 00:00:00`
  const endUTC = `${date} 23:59:59`

  // 1) MOs WHLVP du jour. Futur = à faire (exclut done) ; passé/historique = on garde aussi les terminés.
  const productions = await odooSearchRead(uid, 'mrp.production', [
    ['date_planned_finished', '>=', startUTC],
    ['date_planned_finished', '<=', endUTC],
    ['state', 'not in', includeDone ? ['cancel'] : ['cancel', 'done']],
    ['name', 'ilike', 'WHLVP'],
  ], ['id', 'name', 'origin', 'state', 'product_id', 'product_qty'])

  if (!productions.length) return []

  // 2) MO ENFANTS au format "X cm cakedesign|CD*"
  const childMos = []
  for (const p of productions) {
    const productName = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
    const parsed = parseCakedesign(productName)
    if (!parsed) continue
    childMos.push({
      id: p.id,
      name: p.name,
      productName,
      productQty: p.product_qty || 1,
      origin: p.origin || '',
      state: p.state,
      taille: parsed.taille,
      parfum: parsed.parfum,
    })
  }

  if (childMos.length === 0) return []

  // 3) Trouver les parents pour récupérer le scode (origin du parent) + le productName parent
  const parentNames = [...new Set(childMos.map(c => c.origin).filter(o => /^WHLVP\/MO\//i.test(o)))]
  const parentMap = {}  // parentName -> { scode, productName }
  if (parentNames.length > 0) {
    const parents = await odooSearchRead(uid, 'mrp.production', [
      ['name', 'in', parentNames],
    ], ['id', 'name', 'origin', 'product_id'])
    for (const par of parents) {
      const m = (par.origin || '').match(/S\d{3,}/i)
      const parentProductName = Array.isArray(par.product_id) ? par.product_id[1] : ''
      parentMap[par.name] = {
        scode: m ? m[0].toUpperCase() : '',
        productName: parentProductName,
      }
    }
  }

  // 4) Heures de livraison via sale.order
  // scodes = ceux des MO parents WHLVP + ceux rattachés directement à la commande (grands gâteaux).
  const directScodes = childMos
    .map(c => (c.origin || '').match(/S\d{3,}/i)).filter(Boolean).map(x => x[0].toUpperCase())
  const scodes = [...new Set([...Object.values(parentMap).map(p => p.scode).filter(Boolean), ...directScodes])]
  const orderInfo = {}
  if (scodes.length > 0) {
    const orders = await odooSearchRead(uid, 'sale.order', [['name', 'in', scodes]],
      ['name', 'commitment_date', 'partner_id', 'state'])
    for (const o of orders) orderInfo[o.name] = o
  }

  // 5) Construit les items
  const items = []
  for (const child of childMos) {
    const parent = parentMap[child.origin] || { scode: '', productName: '' }
    // scode : via le MO parent (fond enfant d'un MO WHLVP), OU directement dans l'origine
    // (grand gâteau / plaque : le fond est le MO rattaché à la commande S#### elle-même).
    let scode = parent.scode
    if (!scode) { const ds = (child.origin || '').match(/S\d{3,}/i); if (ds) scode = ds[0].toUpperCase() }
    // Si pas de parfum (cas Plaque suprême amande), extraire du parent
    let parfum = child.parfum
    if (!parfum && parent.productName) {
      // Parent "CD- Cake Design X étages (pers, forme, parfum…)" : on jette le nombre de
      // personnes et la forme, on garde le(s) vrai(s) parfum(s).
      const pm = parent.productName.match(/\(([^)]+)\)/)
      if (pm) {
        const FORMES = /^(rond|carr[ée]|rectangle|ovale|c(?:oe|œ)ur|bomb[ée]|fleur|[ée]toile|plaque|letter\s*cake|number\s*cake)$/i
        const toks = pm[1].split(',').map(t => t.trim())
          .filter(t => t && !/^\d+$/.test(t) && !/pers/i.test(t) && !FORMES.test(t))
        if (toks.length) parfum = toks.join(', ')
      }
    }
    // Ignorer les MO sans scode (= stock/réapprovisionnement, pas une commande client)
    if (!scode) continue
    const ord = orderInfo[scode]
    // Ne pas montrer les composants d'une commande client ANNULÉE
    if (ord && ord.state === 'cancel') continue
    let hour = 0, minute = 0, clientName = ''
    if (ord) {
      if (ord.commitment_date) {
        const dt = new Date(ord.commitment_date.replace(' ', 'T') + 'Z')
        hour = dt.getHours()
        minute = dt.getMinutes()
      }
      clientName = Array.isArray(ord.partner_id) ? ord.partner_id[1] : ''
    }
    items.push({
      date,
      mo_id: child.id,
      mo_name: child.name,
      taille: child.taille,
      parfum: parfum || '',
      scode,
      client_name: clientName,
      hour,
      minute,
      qty: Math.max(1, Math.round(child.productQty || 1)),
      history: includeDone,
      made: child.state === 'done',   // fabriqué dans Odoo (pour l'historique du passé)
    })
  }
  return items
}


// ============================================================
// « Check CD- » : le double contrôle des sorties de congélateur.
// Un gâteau sorti porte un ordre « N cm cakedesign » (le B). Sa recette
// contient l'étage congelé « N cm CD* » (le A). On ne valide le B dans Odoo
// que si le A est en stock ; un B sans A (Cœur, bombé, Rose/Bleu) n'est
// jamais traité automatiquement — Layla s'en occupe à la main.
// ============================================================
const EST_ETAGE_CD = n => /^\s*\d+\s*cm\s*CD\*/i.test(String(n || ''))

async function etatsCheckCd(uid, moIds) {
  const mos = await odooSearchRead(uid, 'mrp.production', [['id', 'in', moIds]],
    ['id', 'name', 'product_id', 'product_qty', 'state', 'move_raw_ids'])
  if (!mos.length) return []

  const idsMoves = mos.flatMap(m => m.move_raw_ids || [])
  const moves = idsMoves.length
    ? await odooCall(uid, 'stock.move', 'read', [idsMoves,
        ['id', 'raw_material_production_id', 'product_id', 'product_uom_qty', 'reserved_availability']])
    : []
  const parOrdre = {}
  for (const mv of moves) {
    const par = Array.isArray(mv.raw_material_production_id) ? mv.raw_material_production_id[0] : null
    if (par) (parOrdre[par] ||= []).push(mv)
  }

  // le stock des étages, lu LÀ OÙ la fabrication puise
  const lieuCD = await lieuStockProd(uid)
  const idsEtages = [...new Set(moves.filter(mv => EST_ETAGE_CD(mv.product_id[1]))
    .map(mv => mv.product_id[0]))]
  const stockDe = {}
  if (idsEtages.length) {
    for (const p of await odooCall(uid, 'product.product', 'read', [idsEtages, ['free_qty']],
      lieuCD ? { context: { location: lieuCD.id } } : {})) stockDe[p.id] = p.free_qty || 0
  }

  return mos.map(m => {
    const etage = (parOrdre[m.id] || []).find(mv => EST_ETAGE_CD(mv.product_id[1]))
    if (m.state === 'done') return { mo_id: m.id, mo_name: m.name, dispo: 'valide', etage: etage ? etage.product_id[1] : null }
    if (m.state === 'cancel') return { mo_id: m.id, mo_name: m.name, dispo: 'hors', etage: null, raison: 'ordre annulé dans Odoo' }
    if (!etage) return { mo_id: m.id, mo_name: m.name, dispo: 'hors', etage: null, raison: "pas d'étage « N cm CD* » dans la recette" }
    const besoin = etage.product_uom_qty || 0
    const libre = stockDe[etage.product_id[0]] || 0
    // Odoo met le stock DE CÔTÉ pour un ordre : il n'est alors plus « libre »,
    // mais il appartient bien à cet ordre-là. Sans ça, un étage déjà réservé
    // pour son gâteau passait pour manquant.
    const reserve = etage.reserved_availability || 0
    const stock = Math.max(libre, reserve)
    return {
      mo_id: m.id, mo_name: m.name,
      etage: etage.product_id[1], besoin, stock,
      dispo: stock >= besoin ? 'ok' : 'manque',
    }
  })
}


// Le client est venu chercher sa commande : elle passe en caisse (POS), et le
// gâteau entier « CD- Cake Design x étages » — le parent des étages — peut être
// validé. Chaque ligne POS porte son devis d'origine (S52071), ce qui donne le
// parent sans ambiguïté. Appelé chaque matin à 8h ; avec `dry`, il se contente
// de lister ce qui reste à valider, pour l'afficher dans l'écran.
async function parentsEncaisses(uid, jours, dry) {
  const depuis = new Date(Date.now() - jours * 86400000)
  const iso = d => d.toISOString().slice(0, 19).replace('T', ' ')
  // Tous les gâteaux cake design, pas seulement les « CD- Cake Design N étages » :
  // il y a aussi les Gateau Forme (carré, cœur…), Letter Cake, Créa' Cake, et les
  // grands formats 35/40/45 cm. La ganache est un ingrédient, pas un gâteau.
  const lignes = await odooSearchRead(uid, 'pos.order.line',
    [['product_id.name', '=ilike', 'CD-%'], ['product_id.name', 'not ilike', 'ganache'],
     ['create_date', '>=', iso(depuis)]],
    ['order_id', 'product_id', 'sale_order_origin_id'], { limit: 300 })
  if (!lignes.length) return []

  const codes = [...new Set(lignes
    .map(l => (Array.isArray(l.sale_order_origin_id) ? l.sale_order_origin_id[1] : '').trim())
    .filter(Boolean))]
  if (!codes.length) return []

  // les ordres du gâteau entier rattachés à ces commandes, encore ouverts
  const mos = await odooSearchRead(uid, 'mrp.production',
    [['product_id.name', '=ilike', 'CD-%'], ['product_id.name', 'not ilike', 'ganache'],
     ['state', 'in', ['confirmed', 'progress', 'to_close']]],
    ['id', 'name', 'origin', 'product_id', 'components_availability', 'move_raw_ids'], { limit: 500 })

  const retenus = []
  for (const code of codes) {
    for (const m of mos.filter(x => String(x.origin || '').includes(code))) {
      if (!retenus.some(o => o.mo.name === m.name)) retenus.push({ mo: m, code })
    }
  }
  if (!retenus.length) return []

  // Règle de Layla : un gâteau entier ne se valide QUE si son étage monté
  // (« 25 cm cakedesign (Chocolat) »…) est disponible. Les autres composants
  // (polystyrène, support, pâte à sucre) ne bloquent pas — leur stock est
  // souvent négatif dans Odoo sans que ça empêche de travailler.
  const idsMoves = retenus.flatMap(r => r.mo.move_raw_ids || [])
  const moves = idsMoves.length
    ? await odooCall(uid, 'stock.move', 'read', [idsMoves,
        ['raw_material_production_id', 'product_id', 'product_uom_qty', 'reserved_availability']])
    : []
  const etagesDe = {}
  for (const mv of moves) {
    if (!/cakedesign/i.test(mv.product_id[1] || '')) continue
    const par = Array.isArray(mv.raw_material_production_id) ? mv.raw_material_production_id[0] : null
    if (par) (etagesDe[par] ||= []).push(mv)
  }
  const lieuCD = await lieuStockProd(uid)
  const idsEtages = [...new Set(Object.values(etagesDe).flat().map(mv => mv.product_id[0]))]
  const stockDe = {}
  if (idsEtages.length) {
    for (const p of await odooCall(uid, 'product.product', 'read', [idsEtages, ['free_qty']],
      lieuCD ? { context: { location: lieuCD.id } } : {})) stockDe[p.id] = p.free_qty || 0
  }

  const out = []
  for (const { mo: m, code } of retenus) {
    const base = { mo_id: m.id, mo_name: m.name, produit: Array.isArray(m.product_id) ? m.product_id[1] : '', scode: code }
    const etages = etagesDe[m.id] || []
    if (!etages.length) { out.push({ ...base, ok: false, message: "pas d'étage monté dans la recette" }); continue }
    // Un étage déjà RÉSERVÉ pour ce gâteau lui appartient : il compte comme
    // disponible, même si Odoo ne le voit plus comme « libre ».
    const dispoDe = mv => Math.max(stockDe[mv.product_id[0]] || 0, mv.reserved_availability || 0)
    const manquant = etages.find(mv => dispoDe(mv) < (mv.product_uom_qty || 0))
    if (manquant) {
      out.push({ ...base, ok: false,
        message: `${manquant.product_id[1]} pas disponible (${dispoDe(manquant)} pour ${manquant.product_uom_qty})` })
      continue
    }
    base.etage = etages.map(mv => mv.product_id[1]).join(', ')
    if (dry) { out.push({ ...base, ok: false, message: 'prêt à valider' }); continue }
    const r = await validerOrdre(uid, m.name, false)
    out.push({ ...base, ok: r.ok, message: r.message })
  }
  return out
}

async function odooCall(uid, model, method, args, kwargs = {}) {
  return await odooJsonRpc('object', 'execute_kw', [
    process.env.ODOO_DB, uid, process.env.ODOO_PASSWORD, model, method, args, kwargs,
  ])
}

// ============================================================
// Valide un ordre de fabrication dans Odoo (irréversible).
// Sans « forcer », on s'arrête dès qu'Odoo demande une confirmation
// (composants manquants, quantités différentes) et on renvoie son message.
// ============================================================
// Un montage cake design (un gâteau : « 20 cm CD* (Chocolat) », « 40x40
// Cakedesign CD* »…), par opposition aux préparations « SM… ».
const lieuProduction = uid => memo('lieuprod', async () =>
  (await odooSearchRead(uid, 'stock.location', [['usage', '=', 'production']], ['id'], { limit: 1 }))[0])

// La fabrication cake design ne se fait QU'À LA BOUTIQUE, dans « Stock Prod »
// (décision de Layla, 2026-08-28). On cherche par le nom court : l'emplacement
// garde le même nom même si on le range ailleurs dans l'arbre Odoo.
const lieuStockProd = uid => memo('lieustockprod', async () =>
  (await odooSearchRead(uid, 'stock.location',
    [['name', '=', 'Stock Prod'], ['usage', '=', 'internal']], ['id'], { limit: 1 }))[0])

// Jamais compté comme manquant : l'eau du robinet (elle ne se gère pas en
// stock, elle est toujours là) et la génoise (son stock restera négatif un
// moment — décision de Layla).
const toujoursDispo = n => /eau\s*robinet|^\s*MP-\s*Eau|genoise/i.test(String(n || ''))

const estMontageCD = n => /CD\*/i.test(String(n)) && !/^SM[\s.]/i.test(String(n))

/**
 * Le glaçage royal n'est dans aucune recette : son stock ne descendait jamais.
 * Règle de Layla : au PREMIER montage cake design validé, tout ce qui reste en
 * stock part dans cet ordre-là — peu importe le parfum. Le stock retombe à zéro
 * pour une vraie raison, rattachée à un gâteau, sans toucher à l'inventaire.
 * Les montages suivants ne trouvent plus rien : ils ne consomment rien.
 */
async function integrerGlacage(uid, mo) {
  const nom = Array.isArray(mo.product_id) ? mo.product_id[1] : ''
  if (!estMontageCD(nom)) return null
  const { prod } = await produitPrepa(uid, 'glacage')
  if (!prod || prod.id === mo.product_id[0]) return null
  const lieu = Array.isArray(mo.location_src_id) ? mo.location_src_id[0] : null
  if (!lieu) return null

  const deja = await odooSearchRead(uid, 'stock.move',
    [['raw_material_production_id', '=', mo.id], ['product_id', '=', prod.id]], ['id'], { limit: 1 })
  if (deja.length) return null                                  // déjà dedans

  const quants = await odooSearchRead(uid, 'stock.quant',
    [['product_id', '=', prod.id], ['location_id', 'child_of', lieu]], ['quantity'])
  const reste = Math.round(quants.reduce((s, q) => s + (q.quantity || 0), 0) * 1000) / 1000
  if (reste <= 0.001) return null                               // plus de glaçage : rien à intégrer

  const lieuProd = await lieuProduction(uid)
  await odooCall(uid, 'mrp.production', 'write', [[mo.id], {
    move_raw_ids: [[0, 0, {
      name: prod.display_name,
      product_id: prod.id,
      product_uom_qty: reste,
      product_uom: Array.isArray(prod.uom_id) ? prod.uom_id[0] : undefined,
      location_id: lieu,
      location_dest_id: lieuProd ? lieuProd.id : undefined,
      company_id: Array.isArray(mo.company_id) ? mo.company_id[0] : undefined,
    }]],
  }])
  // Ajoutée à un ordre déjà confirmé, la ligne naît en brouillon : il faut la
  // confirmer et la réserver pour qu'Odoo la consomme à la validation.
  const cree = (await odooSearchRead(uid, 'stock.move',
    [['raw_material_production_id', '=', mo.id], ['product_id', '=', prod.id]], ['id', 'state'], { limit: 1 }))[0]
  if (cree && cree.state === 'draft') {
    await odooCall(uid, 'stock.move', '_action_confirm', [[cree.id]]).catch(() => {})
    await odooCall(uid, 'stock.move', '_action_assign', [[cree.id]]).catch(() => {})
  }
  // la quantité consommée est renseignée juste après, avec celle des autres
  // composants (voir validerOrdre) : Odoo ne la calcule pas pour nous
  const unite = Array.isArray(prod.uom_id) ? prod.uom_id[1] : 'kg'
  return Math.round(enG(reste, unite))
}

/**
 * Après validation d'une préparation, réserve aussitôt sa part chez le ou les
 * ordres qui l'attendent. Sans ça, la crème faite pour un gâteau reste libre et
 * un autre ordre peut la consommer avant lui.
 */
async function reserverPourLeParent(uid, mo) {
  const parents = String(mo.origin || '').split(',').map(x => x.trim())
    .filter(x => /^WH.*\/MO\//i.test(x))
  if (!parents.length) return null
  const pm = await odooSearchRead(uid, 'mrp.production',
    [['name', 'in', parents], ['state', 'in', ['confirmed', 'progress', 'to_close']]], ['id', 'name'], { limit: 10 })
  if (!pm.length) return null
  await odooCall(uid, 'mrp.production', 'action_assign', [pm.map(m => m.id)]).catch(() => { })
  return pm.map(m => m.name).join(', ')
}

async function validerOrdre(uid, name, forcer, quantites = null, ajouts = null) {
  const mo = (await odooSearchRead(uid, 'mrp.production', [['name', '=', name]],
    ['id', 'name', 'state', 'product_qty', 'qty_producing', 'product_id', 'location_src_id', 'company_id', 'origin']))[0]
  if (!mo) return { name, ok: false, message: 'ordre introuvable' }
  if (mo.state === 'done') return { name, ok: true, message: 'déjà terminé' }
  if (mo.state === 'cancel') return { name, ok: false, message: 'ordre annulé' }
  try {
    const glacage = await integrerGlacage(uid, mo)
    if (!mo.qty_producing || mo.qty_producing !== mo.product_qty) {
      await odooCall(uid, 'mrp.production', 'write', [[mo.id], { qty_producing: mo.product_qty }])
    }
    // Un ingrédient que la recette ne prévoyait pas : on l'ajoute à l'ordre.
    // Passer par `write` sur la production (et non par un stock.move seul) est
    // ce qui fait qu'Odoo confirme la nouvelle ligne au lieu de la laisser en
    // brouillon — une ligne brouillon ne serait pas consommée à la validation.
    for (const a of ajouts || []) {
      const q = Number(a.qty)
      if (!(q > 0) || !a.produit) continue
      const lp = await lieuProduction(uid)
      await odooCall(uid, 'mrp.production', 'write', [[mo.id], {
        move_raw_ids: [[0, 0, {
          name: Array.isArray(mo.product_id) ? mo.product_id[1] : name,
          product_id: Number(a.produit),
          product_uom_qty: q,
          product_uom: Number(a.uom) || undefined,
          location_id: mo.location_src_id[0],
          location_dest_id: lp ? lp.id : mo.location_src_id[0],
          company_id: mo.company_id[0],
          quantity_done: q,
        }]],
      }])
    }
    // Ce que l'équipe a noté à l'écran fait foi : on l'écrit avant tout le reste.
    for (const [moveId, valeur] of Object.entries(quantites || {})) {
      const q = Number(valeur)
      if (!(q >= 0)) continue
      await odooCall(uid, 'stock.move', 'write', [[Number(moveId)], { quantity_done: q }]).catch(() => { })
    }
    // Validé par programme, Odoo ne remplit pas les quantités consommées des
    // composants — il refuse alors la validation (« You must indicate a
    // non-zero amount consumed for at least one of your components »). On les
    // renseigne à ce qui était demandé, sans écraser ce qui est déjà saisi.
    const raws = await odooSearchRead(uid, 'stock.move',
      [['raw_material_production_id', '=', mo.id], ['state', 'not in', ['done', 'cancel']]],
      ['product_uom_qty', 'quantity_done'], { limit: 50 })
    for (const r of raws) {
      if (r.quantity_done > 0 || !(r.product_uom_qty > 0)) continue
      await odooCall(uid, 'stock.move', 'write', [[r.id], { quantity_done: r.product_uom_qty }]).catch(() => { })
    }
    const r = await odooCall(uid, 'mrp.production', 'button_mark_done', [[mo.id]])
    // Odoo renvoie une fenêtre de confirmation quand quelque chose cloche.
    if (r && typeof r === 'object' && r.res_model) {
      // Souvent, ce qui cloche n'est QUE la génoise ou l'eau du robinet, dont
      // le stock reste négatif : on ne bloque pas pour ça. On regarde ce qui
      // manque vraiment (ces deux-là exclus) et on passe outre si c'est vide.
      let manqueVrai = true
      try {
        const ctrl = (await manquesDesOrdres(uid, [name]))[0]
        manqueVrai = !ctrl || ctrl.manques.length > 0
      } catch { manqueVrai = true }
      if (!forcer && manqueVrai) {
        return { name, ok: false, message: 'Odoo demande une confirmation (stock insuffisant ?)' }
      }
      const ctx = r.context || {}
      const wiz = await odooCall(uid, r.res_model, 'create', [{}], { context: ctx })
      // Chaque fenêtre d'Odoo a son propre bouton : « mrp.consumption.warning »
      // (écart de consommation) se valide par action_confirm, le reliquat par
      // action_close_mo. On essaie dans l'ordre le plus probable.
      const boutons = {
        'mrp.consumption.warning': ['action_confirm', 'action_set_qty'],
        'mrp.production.backorder': ['action_close_mo', 'action_backorder'],
      }[r.res_model] || ['process', 'action_confirm']
      let passe = false
      for (const bouton of boutons) {
        try { await odooCall(uid, r.res_model, bouton, [[wiz]], { context: ctx }); passe = true; break }
        catch { /* on tente le bouton suivant */ }
      }
      if (!passe) return { name, ok: false, message: `Odoo demande une confirmation (${r.res_model}) qu'on ne sait pas donner` }
    }
    const apres = (await odooSearchRead(uid, 'mrp.production', [['id', '=', mo.id]], ['state']))[0]
    const fini = apres && apres.state === 'done'
    // La production vient d'entrer en stock : tant que personne ne la réserve,
    // n'importe quel autre ordre peut la prendre (le stock d'Odoo est commun).
    // On la réserve tout de suite pour le gâteau qui l'attend.
    const pour = fini ? await reserverPourLeParent(uid, mo) : null
    return { name, ok: fini, message: apres ? apres.state : '', glacage, pour }
  } catch (e) {
    return { name, ok: false, message: (e.message || String(e)).slice(0, 300) }
  }
}

// ============================================================
// Préparations que l'équipe lance elle-même (glaçage royal, pâte à sucre) :
// la recette (nomenclature), le stock des ingrédients, et la création de
// l'ordre de fabrication quand la tournée est faite. Ces articles n'ont ni
// règle mini/maxi ni ordre dans Odoo : c'est l'équipe qui décide combien elle
// en fait. Tout ce qui sort d'ici est en GRAMMES (règle de Layla).
// ============================================================
const PREPAS = {
  // Le glaçage part dans le premier montage cake design validé (integrerGlacage).
  glacage: { id: 6966, noms: ['SM. Glacage Royal CD*', 'SM. glacage cake design'], titre: 'Glaçage royal' },
  'pate-sucre': { id: 2940, noms: ['SM Pate a sucre Melange CD'], titre: 'Pâte à sucre' },
}
const prepaDe = cle => PREPAS[cle] || PREPAS.glacage

// Chaque aller-retour vers Odoo coûte ~120 ms : on garde 10 minutes en mémoire
// ce qui ne bouge pas (la recette, l'emplacement de production). Les stocks,
// eux, sont relus à chaque ouverture.
const _memo = {}
async function memo(cle, calcul) {
  const vu = _memo[cle]
  if (vu && Date.now() - vu.t < 600000) return vu.v
  const v = await calcul()
  _memo[cle] = { t: Date.now(), v }
  return v
}

// Les recettes mélangent les kg et les grammes d'une ligne à l'autre (le CMC
// est en kg, le sucre glace en g) : on ramène tout en grammes.
// Une tournée n'utilise qu'une couleur ou deux : l'équipe choisit lesquelles,
// les autres ne sont pas mises dans l'ordre de fabrication.
const estColorant = n => /colorant/i.test(String(n))

const enG = (q, u) => (/^kg$/i.test(String(u)) ? Math.round(q * 1000000) / 1000 : q)

// Retrouve l'article (par son numéro, puis par son nom en secours) et sa recette,
// quel que soit son nom du moment.
async function produitPrepa(uid, cle) {
  return await memo('prepa:' + cle, () => _produitPrepa(uid, cle))
}
async function _produitPrepa(uid, cle) {
  const conf = prepaDe(cle)
  let prod = (await odooSearchRead(uid, 'product.product', [['id', '=', conf.id]],
    ['id', 'display_name', 'uom_id', 'product_tmpl_id']))[0]
  if (!prod) {
    prod = (await odooSearchRead(uid, 'product.product', [['name', 'in', conf.noms]],
      ['id', 'display_name', 'uom_id', 'product_tmpl_id']))[0]
  }
  if (!prod) return { conf }
  const bom = (await odooSearchRead(uid, 'mrp.bom', [['product_tmpl_id', '=', prod.product_tmpl_id[0]]],
    ['id', 'product_qty', 'product_uom_id']))[0]
  return { prod, bom, conf }
}

// L'ordre WHLVP le plus récent sert de gabarit (emplacements, société).
const modeleWhlvp = uid => memo('modele', async () =>
  (await odooSearchRead(uid, 'mrp.production', [['name', 'like', 'WHLVP/MO/']],
    ['picking_type_id', 'location_src_id', 'location_dest_id', 'company_id'], { limit: 1, order: 'id desc' }))[0])

async function fetchPrepa(uid, cle) {
  const { prod, bom, conf } = await produitPrepa(uid, cle)
  if (!prod) return { erreur: `article « ${conf.titre} » introuvable dans Odoo` }
  if (!bom) return { erreur: 'recette introuvable dans Odoo pour ' + prod.display_name }
  const [lignes, modele] = await Promise.all([
    memo('bomlines:' + bom.id, () => odooSearchRead(uid, 'mrp.bom.line', [['bom_id', '=', bom.id]],
      ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })),
    modeleWhlvp(uid),
  ])
  const lieu = modele && Array.isArray(modele.location_src_id) ? modele.location_src_id[0] : null

  const ids = [prod.id, ...lignes.map(l => l.product_id[0])]
  const stocks = await odooCall(uid, 'product.product', 'read', [ids, ['display_name', 'free_qty', 'uom_id']],
    lieu ? { context: { location: lieu } } : {})
  const stockDe = {}
  for (const p of stocks) {
    stockDe[p.id] = {
      qty: Math.max(0, p.free_qty || 0),
      unite: ((Array.isArray(p.uom_id) ? p.uom_id[1] : 'u') || 'u').replace(/^units?$/i, 'u'),
    }
  }
  const uniteBom = Array.isArray(bom.product_uom_id) ? bom.product_uom_id[1] : 'g'
  return {
    quoi: cle,
    titre: conf.titre,
    produit: prod.display_name,
    tournee: enG(bom.product_qty, uniteBom),                    // ce que produit une tournée, en g
    recette: lignes.map(l => {
      const u = Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : 'u'
      const st = stockDe[l.product_id[0]]
      const memeUnite = st && /^(g|kg)$/i.test(st.unite) && /^(g|kg)$/i.test(u)
      const nomL = Array.isArray(l.product_id) ? l.product_id[1] : ''
      return {
        id: l.product_id[0],
        produit: nomL,
        colorant: estColorant(nomL),
        qty: enG(l.product_qty, u),
        dispo: toujoursDispo(nomL),
        stock: memeUnite ? Math.round(enG(st.qty, st.unite) * 1000) / 1000 : null,
      }
    }),
  }
}

// Marque les ordres que l'app a créés elle-même : eux seuls pourront être
// annulés quand on décoche. On ne touche jamais à un ordre venu d'Odoo.
const ORIGINE_APP = 'LG-APP'

/**
 * Crée dans Odoo l'ordre de fabrication d'une préparation que l'équipe vient de
 * faire alors qu'Odoo n'en demandait pas (une crème au beurre nature, par
 * exemple : ni ordre, ni règle mini/maxi). `qtyKg` est la quantité fabriquée.
 */
async function creerOfPreparation(uid, nomProduit, qtyKg, parents = []) {
  const prod = (await odooSearchRead(uid, 'product.product',
    [['name', '=', nomProduit]], ['id', 'display_name', 'uom_id', 'product_tmpl_id'], { limit: 1 }))[0]
  if (!prod) throw new Error('article introuvable dans Odoo : ' + nomProduit)
  const bom = (await odooSearchRead(uid, 'mrp.bom',
    [['product_tmpl_id', '=', prod.product_tmpl_id[0]]], ['id', 'product_qty', 'product_uom_id'], { limit: 1 }))[0]
  if (!bom) throw new Error('recette introuvable dans Odoo pour ' + prod.display_name)

  const uniteBom = Array.isArray(bom.product_uom_id) ? bom.product_uom_id[1] : 'kg'
  const qty = Math.round((/^kg$/i.test(uniteBom) ? qtyKg : qtyKg * 1000) * 1000) / 1000
  if (!(qty > 0)) throw new Error('quantité invalide')

  const modele = await modeleWhlvp(uid)
  if (!modele) throw new Error('aucun ordre WHLVP pour servir de modèle')
  const id = await odooCall(uid, 'mrp.production', 'create', [{
    product_id: prod.id,
    product_qty: qty,
    product_uom_id: Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined,
    bom_id: bom.id,
    // Rattaché aux gâteaux pour lesquels on le fabrique — Odoo accepte
    // plusieurs origines séparées par des virgules. Le repère LG-APP reste au
    // bout pour savoir que l'app l'a créé.
    origin: [...parents, ORIGINE_APP].join(','),
    picking_type_id: modele.picking_type_id[0],
    location_src_id: modele.location_src_id[0],
    location_dest_id: modele.location_dest_id[0],
    company_id: modele.company_id[0],
  }])
  // Odoo ne déroule pas la nomenclature quand l'ordre est créé par programme
  const [lignes, lieuProd] = await Promise.all([
    memo('bomlines:' + bom.id, () => odooSearchRead(uid, 'mrp.bom.line', [['bom_id', '=', bom.id]],
      ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })),
    lieuProduction(uid),
  ])
  const facteur = bom.product_qty ? qty / bom.product_qty : 1
  for (const l of lignes) {
    await odooCall(uid, 'stock.move', 'create', [{
      name: prod.display_name,
      product_id: l.product_id[0],
      product_uom_qty: Math.round(l.product_qty * facteur * 1000) / 1000,
      product_uom: l.product_uom_id[0],
      location_id: modele.location_src_id[0],
      location_dest_id: lieuProd ? lieuProd.id : modele.location_dest_id[0],
      raw_material_production_id: id,
      company_id: modele.company_id[0],
    }])
  }
  await moveDuFini(uid, id, prod, qty, Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined, modele)
  await odooCall(uid, 'mrp.production', 'action_confirm', [[id]])
  await odooCall(uid, 'mrp.production', 'action_assign', [[id]]).catch(() => { })
  const cree = (await odooSearchRead(uid, 'mrp.production', [['id', '=', id]], ['name', 'product_qty', 'state']))[0]
  return { id, name: cree.name, produit: prod.display_name, qty: cree.product_qty, etat: cree.state }
}

/**
 * Annule dans Odoo les ordres d'une coche qu'on retire. Un ordre DÉJÀ VALIDÉ
 * n'est jamais touché : sa production est entrée en stock, on ne peut pas la
 * défaire d'un clic. Les ordres créés par l'app sont supprimés, ceux venus
 * d'Odoo sont annulés (ils gardent une trace là-bas).
 */
async function annulerOfApp(uid, names) {
  // Choix de Layla : décocher ne touche PAS aux ordres d'Odoo. Ils sortent
  // simplement de la liste et restent disponibles pour un re-cochage — sinon
  // chaque hésitation détruisait un ordre qu'Odoo ne sait pas ressusciter, et
  // l'app devait en recréer un (cas vécu : 200162 annulé, puis 200168 créé).
  // Seuls les ordres créés par l'app disparaissent : eux n'ont plus de raison
  // d'être, et l'app saura en refaire un au besoin.
  const mos = await odooSearchRead(uid, 'mrp.production',
    [['name', 'in', names], ['state', 'in', ['draft', 'confirmed', 'progress']]],
    ['id', 'name', 'origin'], { limit: 50 })
  const siens = mos.filter(m => String(m.origin || '').includes(ORIGINE_APP))
  if (!siens.length) return { annules: 0, noms: [] }
  const ids = siens.map(m => m.id)
  await odooCall(uid, 'mrp.production', 'action_cancel', [ids]).catch(() => { })
  await odooCall(uid, 'mrp.production', 'write', [ids, { state: 'cancel' }]).catch(() => { })
  await odooCall(uid, 'mrp.production', 'unlink', [ids]).catch(() => { })
  return { annules: ids.length, noms: siens.map(m => m.name) }
}

  // Le mouvement du PRODUIT FINI : sans lui, l'ordre ne fait rien entrer en
  // stock et Odoo refuse même de le valider (« mrp_production_qty_positive »).
  // Odoo le crée depuis son interface, pas par l'API. Il va de l'emplacement de
  // production vers le stock, comme celui d'un ordre créé par Odoo.
  async function moveDuFini(uid2, idOrdre, prod2, qte, uomId, modele2) {
    const lp = await lieuProduction(uid2)
    await odooCall(uid2, 'stock.move', 'create', [{
      name: prod2.display_name,
      product_id: prod2.id,
      product_uom_qty: qte,
      product_uom: uomId,
      location_id: lp ? lp.id : modele2.location_dest_id[0],
      location_dest_id: modele2.location_src_id[0],
      production_id: idOrdre,
      picking_type_id: modele2.picking_type_id[0],
      company_id: modele2.company_id[0],
    }])
  }

// Crée l'ordre de fabrication et le confirme. Il part ensuite dans « À valider »
// avec tout le reste.
async function creerOrdrePrepa(uid, cle, tournees, colorants) {
  const { prod, bom, conf } = await produitPrepa(uid, cle)
  if (!prod || !bom) throw new Error(`article ou recette de « ${conf.titre} » introuvable dans Odoo`)
  const modele = await modeleWhlvp(uid)
  if (!modele) throw new Error('aucun ordre WHLVP pour servir de modèle')
  const qty = Math.round(bom.product_qty * tournees * 1000) / 1000
  const id = await odooCall(uid, 'mrp.production', 'create', [{
    product_id: prod.id,
    product_qty: qty,
    product_uom_id: Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined,
    bom_id: bom.id,
    picking_type_id: modele.picking_type_id[0],
    location_src_id: modele.location_src_id[0],
    location_dest_id: modele.location_dest_id[0],
    company_id: modele.company_id[0],
  }])

  // Créé par programme, Odoo ne déroule PAS la nomenclature (les composants ne
  // sont ajoutés que par l'interface) : on crée nous-mêmes les lignes, sinon
  // l'ordre arrive vide — cas vécu avec WHLVP/MO/199870.
  const [lignes, lieuProd] = await Promise.all([
    memo('bomlines:' + bom.id, () => odooSearchRead(uid, 'mrp.bom.line', [['bom_id', '=', bom.id]],
      ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })),
    lieuProduction(uid),
  ])
  const facteur = bom.product_qty ? qty / bom.product_qty : 1
  const choix = colorants || {}
  for (const l of lignes) {
    const nomL = Array.isArray(l.product_id) ? l.product_id[1] : ''
    const uL = Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : 'g'
    let quantite = Math.round(l.product_qty * facteur * 1000) / 1000
    if (estColorant(nomL)) {
      const g = choix[l.product_id[0]]
      if (!(g > 0)) continue                                   // couleur non retenue : pas dans l'ordre
      quantite = /^kg$/i.test(uL) ? Math.round(g) / 1000 : Math.round(g)
    }
    await odooCall(uid, 'stock.move', 'create', [{
      name: prod.display_name,
      product_id: l.product_id[0],
      product_uom_qty: quantite,
      product_uom: l.product_uom_id[0],
      location_id: modele.location_src_id[0],
      location_dest_id: lieuProd ? lieuProd.id : modele.location_dest_id[0],
      raw_material_production_id: id,
      company_id: modele.company_id[0],
    }])
  }
  await moveDuFini(uid, id, prod, qty, Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined, modele)
  await odooCall(uid, 'mrp.production', 'action_confirm', [[id]])
  // même règle que partout : créé par programme, l'ordre ne réserve rien tout
  // seul — on le lui demande, sinon ses ingrédients restent libres pour d'autres
  await odooCall(uid, 'mrp.production', 'action_assign', [[id]]).catch(() => { })
  const cree = (await odooSearchRead(uid, 'mrp.production', [['id', '=', id]], ['name', 'product_qty', 'state']))[0]
  const uniteBom = Array.isArray(bom.product_uom_id) ? bom.product_uom_id[1] : 'g'
  return { id, name: cree.name, qty: enG(cree.product_qty, uniteBom), produit: prod.display_name, etat: cree.state }
}

// ============================================================
// Ce qui manque pour fabriquer ces ordres (lecture seule).
// La génoise est ignorée : son stock restera négatif un moment (Layla).
// ============================================================
async function manquesDesOrdres(uid, names) {
  const mos = await odooSearchRead(uid, 'mrp.production', [['name', 'in', names]],
    ['id', 'name', 'product_id', 'product_qty', 'product_uom_id', 'origin', 'state', 'components_availability', 'location_src_id', 'date_planned_start'])
  if (!mos.length) return []
  const moves = await odooSearchRead(uid, 'stock.move',
    [['raw_material_production_id', 'in', mos.map(m => m.id)]],
    ['raw_material_production_id', 'product_id', 'product_uom_qty', 'product_uom', 'reserved_availability', 'quantity_done'], { limit: 500 })
  const idsProd = [...new Set(moves.map(m => m.product_id[0]))]
  const stockParLieu = {}          // "lieu:produit" → { qty, unite }
  const lieux = [...new Set(mos.map(m => (Array.isArray(m.location_src_id) ? m.location_src_id[0] : null)).filter(Boolean))]
  for (const lieu of lieux) {
    const lus = await odooCall(uid, 'product.product', 'read', [idsProd, ['free_qty', 'uom_id']], { context: { location: lieu } })
    for (const p of lus) {
      stockParLieu[lieu + ':' + p.id] = {
        qty: Math.max(0, p.free_qty || 0),
        unite: ((Array.isArray(p.uom_id) ? p.uom_id[1] : 'u') || 'u').replace(/^units?$/i, 'u'),
      }
    }
  }
  // ramène une quantité dans l'unité demandée (g ↔ kg uniquement ; sinon null)
  const convertir = (q, de, vers) => {
    const a = String(de || '').toLowerCase(), b = String(vers || '').toLowerCase()
    if (a === b) return q
    if (a === 'g' && b === 'kg') return q / 1000
    if (a === 'kg' && b === 'g') return q * 1000
    return null
  }
  return mos.map(m => {
    const lignes = moves.filter(x => x.raw_material_production_id[0] === m.id).map(x => {
      const nomP = Array.isArray(x.product_id) ? x.product_id[1] : ''
      const ignore = toujoursDispo(nomP)
      const uniteLigne = (Array.isArray(x.product_uom) ? x.product_uom[1] : 'u').replace(/^units?$/i, 'u')
      const lieu = Array.isArray(m.location_src_id) ? m.location_src_id[0] : null
      const st = stockParLieu[lieu + ':' + x.product_id[0]]
      // ce qui est déjà réservé pour cet ordre s'ajoute à ce qu'il peut prendre
      const brut = st ? convertir(st.qty, st.unite, uniteLigne) : 0
      const dispo = brut === null ? null : brut + (x.reserved_availability || 0)
      const comparable = dispo !== null                       // unités incompatibles → on n'affirme rien
      return {
        id: x.id,
        produit: nomP, besoin: x.product_uom_qty, unite: uniteLigne,
        // ce qui sera consommé — modifiable au moment de valider
        consomme: x.quantity_done > 0 ? x.quantity_done : x.product_uom_qty,
        dispo: comparable ? Math.round(dispo * 100) / 100 : null, ignore,
        manque: (ignore || !comparable) ? 0 : Math.max(0, x.product_uom_qty - dispo),
      }
    })
    return {
      name: m.name, produit: (Array.isArray(m.product_id) ? m.product_id[1] : ''),
      qty: m.product_qty, unite: (Array.isArray(m.product_uom_id) ? m.product_uom_id[1] : 'u'),
      etat: m.state, pour: m.origin || '', dispo: m.components_availability || '',
      quand: m.date_planned_start || '',
      lieu: Array.isArray(m.location_src_id) ? m.location_src_id[1] : '',
      lignes,                                   // toute la recette, pour noter les consommations
      manques: lignes.filter(l => l.manque > 0.0001),
    }
  })
}

// ============================================================
// Mode « fabrication » (?mode=fabrication&jours=7) : tous les OF CD* encore à
// faire sur la période, avec leurs OF enfants (les préparations SM CD*).
// Deux familles selon l'origine : OP/… = prévision de stock (règle de réassort),
// S… = pour la commande d'un client.
// ============================================================
async function fetchFabrication(uid, jours) {
  const j0 = new Date(); j0.setHours(0, 0, 0, 0)
  const j1 = new Date(j0); j1.setDate(j1.getDate() + jours)
  // Un ordre confirmé dont la date est passée reste À FAIRE (il est en retard) :
  // on remonte 30 jours en arrière. Au-delà, ce sont des ordres oubliés (2022…).
  // Dans Odoo, un ordre non terminé RESTE à faire : on garde les retards.
  // Mais pas les fossiles (42 ordres de 2022 jamais terminés) → 12 mois glissants.
  const jRetard = new Date(j0); jRetard.setFullYear(jRetard.getFullYear() - 1)
  const iso = d => d.toISOString().slice(0, 19).replace('T', ' ')

  // Tout l'écran (ordres ET stocks) se limite à l'atelier cake design de la
  // boutique : ce qui se fabrique à l'annexe ne le regarde pas.
  const lieuCD = await lieuStockProd(uid)
  const lieuProd = lieuCD ? lieuCD.id : null
  const dansAtelierCD = lieuProd ? [['location_src_id', '=', lieuProd]] : []

  const mos = await odooSearchRead(uid, 'mrp.production', [
    ['state', 'in', ['confirmed', 'progress', 'to_close']],   // pas les brouillons
    ['product_id.name', 'ilike', 'CD*'],
    ['date_planned_start', '>=', iso(jRetard)],
    ['date_planned_start', '<=', iso(j1)],
    ...dansAtelierCD,
  ], ['id', 'name', 'origin', 'state', 'product_id', 'product_qty', 'product_uom_id',
      'date_planned_start', 'components_availability', 'location_src_id'],
  { limit: 500, order: 'date_planned_start asc' })

  // Les préparations TERMINÉES ces derniers jours. Sans elles, une crème faite
  // hier et validée disparaît de l'écran : l'app la redemanderait aujourd'hui
  // alors qu'elle est faite et réservée pour son gâteau (cas WHLVP/MO/200441).
  // Elles n'entrent QUE dans la liste des ordres, jamais dans les gâteaux à faire.
  const jFinis = new Date(j0); jFinis.setDate(jFinis.getDate() - 10)
  const finis = await odooSearchRead(uid, 'mrp.production', [
    ['state', '=', 'done'],
    ['product_id.name', 'ilike', 'CD*'],
    ['date_planned_start', '>=', iso(jFinis)],
    ...dansAtelierCD,
  ], ['id', 'name', 'origin', 'state', 'product_id', 'product_qty', 'product_uom_id',
      'date_planned_start', 'components_availability', 'location_src_id'],
  { limit: 500, order: 'date_planned_start desc' })

  const nom = m => (Array.isArray(m.product_id) ? m.product_id[1] : '') || ''
  const uom = m => {
    const u = (Array.isArray(m.product_uom_id) ? m.product_uom_id[1] : '') || 'u'
    return /unit/i.test(u) ? 'u' : u
  }
  const origines = m => String(m.origin || '').split(',').map(x => x.trim()).filter(Boolean)
  const parNom = new Map(mos.map(m => [m.name, m]))
  // un OF est « enfant » si l'une de ses origines est un autre OF de la liste
  const estEnfant = m => origines(m).some(o => o !== m.name && parNom.has(o))
  const enfantsDe = p => mos.filter(m => m !== p && origines(m).includes(p.name))

  const fmt = m => ({
    id: m.id, name: m.name, produit: nom(m), qty: m.product_qty, unite: uom(m),
    // « 20 cm CD* (Chocolat) » → taille « 20 cm » + parfum « Chocolat » (gros titres de l'écran).
    // parseCakedesign ne rend le parfum que pour les ronds/carrés : pour « 18cm bombé »,
    // « Cœur 5p »… on le reprend de la dernière parenthèse (en ignorant « (40 pers) »).
    ...(() => {
      const base = parseCakedesign(nom(m)) || { taille: '', parfum: '' }
      if (base.parfum) return base
      const parens = [...String(nom(m)).matchAll(/\(([^)]+)\)/g)].map(x => x[1].trim()).filter(x => !/pers/i.test(x))
      return { ...base, parfum: parens.length ? parens[parens.length - 1] : '' }
    })(),
    prepa: /^SM\s+CD\*/i.test(nom(m)),
    etat: m.state, quand: m.date_planned_start,
    dispo: m.components_availability || '',
    origine: origines(m).filter(o => !parNom.has(o)).join(', '),
  })

  // Recette de chaque OF = ses composants (ce qu'il faut sortir/préparer).
  // Une seule requête pour tous les OF ; les grammes > 1 kg sont convertis en kg.
  const moves = mos.length ? await odooSearchRead(uid, 'stock.move',
    [['raw_material_production_id', 'in', mos.map(m => m.id)]],
    ['raw_material_production_id', 'product_id', 'product_uom_qty', 'product_uom', 'reserved_availability'], { limit: 1000 }) : []
  const aFabriquer = new Set(mos.map(m => nom(m)))
  const recettes = {}
  for (const mv of moves) {
    const moId = Array.isArray(mv.raw_material_production_id) ? mv.raw_material_production_id[0] : mv.raw_material_production_id
    let q = mv.product_uom_qty || 0
    let u = (Array.isArray(mv.product_uom) ? mv.product_uom[1] : '') || 'u'
    if (/^g$/i.test(u) && q >= 1000) { q = q / 1000; u = 'kg' }
    if (/unit/i.test(u)) u = 'u'
    const p = (Array.isArray(mv.product_id) ? mv.product_id[1] : '') || ''
    // Ce qui est réservé POUR CET ORDRE lui est disponible, même si le stock
    // général ne le compte plus (free_qty l'exclut). Sans ça l'app redemande de
    // refaire une crème déjà réservée au gâteau.
    let res = mv.reserved_availability || 0
    if (/^g$/i.test((Array.isArray(mv.product_uom) ? mv.product_uom[1] : '') || '') && res >= 1000) res = res / 1000
    ;(recettes[moId] ||= []).push({
      produit: p, qty: Math.round(q * 100) / 100, unite: u,
      reserve: Math.round(res * 100) / 100, aFaire: aFabriquer.has(p),
    })
  }

  // Recettes des préparations maison (nomenclature Odoo), pour pouvoir déplier
  // « Crème au beurre Chocolat » directement dans la recette du gâteau.
  // Deux niveaux : les composants du gâteau, puis les composants de ces préparations.
  const estPrepaNom = n => /^SM\b/i.test(String(n || ''))
  const bomLignesIds = []                     // ids produits vus dans les nomenclatures
  const catalogue = await fetchCatalogue(uid, bomLignesIds)
  const recettesPrepa = {}
  // on part des préparations vues dans les OF ET de toutes celles du catalogue
  // (sinon ouvrir une recette ne montre rien les jours sans ordre de fabrication)
  let aChercher = [...new Set([
    ...moves.map(mv => (Array.isArray(mv.product_id) ? mv.product_id[1] : '')),
    ...catalogue.flatMap(c => c.lignes.map(l => l.produit)),
  ].filter(estPrepaNom))]
  for (let niveau = 0; niveau < 2 && aChercher.length; niveau++) {
    const boms = await odooSearchRead(uid, 'mrp.bom', [['product_tmpl_id.name', 'in', aChercher]],
      ['id', 'product_tmpl_id', 'product_qty', 'product_uom_id'], { limit: 200 })
    if (!boms.length) break
    const lignes = await odooSearchRead(uid, 'mrp.bom.line', [['bom_id', 'in', boms.map(b => b.id)]],
      ['bom_id', 'product_id', 'product_qty', 'product_uom_id'], { limit: 1000 })
    const suivant = []
    for (const b of boms) {
      const nomProd = Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[1] : ''
      if (!nomProd || recettesPrepa[nomProd]) continue
      recettesPrepa[nomProd] = {
        qty: b.product_qty,
        unite: (Array.isArray(b.product_uom_id) ? b.product_uom_id[1] : 'u').replace(/^units?$/i, 'u'),
        lignes: lignes.filter(l => l.bom_id[0] === b.id).map(l => {
          const p = (Array.isArray(l.product_id) ? l.product_id[1] : '') || ''
          if (Array.isArray(l.product_id)) bomLignesIds.push(l.product_id[0])
          if (estPrepaNom(p)) suivant.push(p)
          let q = l.product_qty || 0
          let u = (Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : 'u')
          if (/^g$/i.test(u) && q >= 1000) { q = q / 1000; u = 'kg' }
          return { produit: p, qty: Math.round(q * 1000) / 1000, unite: u.replace(/^units?$/i, 'u'), prepa: estPrepaNom(p) }
        }),
      }
    }
    aChercher = [...new Set(suivant.filter(n => !recettesPrepa[n]))]
  }

  // Recette d'un ordre : ses composants réels. Si Odoo n'en a mis aucun (cas vécu :
  // le 18 cm bombé n'a de nomenclature que pour « Praliné Chocolaté », pas pour
  // « Chocolat »), on retombe sur la nomenclature du produit filtrée par parfum ;
  // si elle ne couvre pas ce parfum non plus, la recette reste vide et l'écran le dit.
  const recetteDeSecours = (m) => {
    const nomComplet = nom(m)
    const tmpl = nomComplet.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const parfum = (String(nomComplet).match(/\(([^)]+)\)\s*$/) || [])[1] || ''
    const c = catalogue.find(x => x.template === tmpl)
    if (!c) return []
    const f = (m.product_qty || 1) / (c.qtyBase || 1)
    return c.lignes
      .filter(l => !l.parfums.length || l.parfums.includes(parfum.trim()))
      .map(l => {
        let q = l.qty * f, u = l.unite
        if (/^g$/i.test(u) && q >= 1000) { q = q / 1000; u = 'kg' }
        return { produit: l.produit, qty: Math.round(q * 100) / 100, unite: u }
      })
  }

  const racines = mos.filter(m => !estEnfant(m)).map(p => {
    const brute = recettes[p.id] || []
    const lignes = brute.length ? brute : recetteDeSecours(p)
    return {
      ...fmt(p),
      recetteVide: lignes.length === 0,
      recette: lignes.map(l => ({ ...l, aFaire: estPrepaNom(l.produit) && !!recettesPrepa[l.produit] })),
    }
  })

  // Une préparation lancée pour un gâteau a pour origine l'OF du gâteau (hors de
  // cette liste car ce n'est pas un CD*) : on remonte d'un cran pour retrouver la
  // commande client (S…) et le gâteau concerné.
  const aRemonter = [...new Set(racines.map(r => r.origine).filter(o => /^WH.*\/MO\//i.test(o)))]
  const parents = aRemonter.length
    ? await odooSearchRead(uid, 'mrp.production', [['name', 'in', aRemonter]], ['name', 'origin', 'product_id'])
    : []
  const infoParent = {}
  for (const par of parents) {
    infoParent[par.name] = {
      origine: par.origin || '',
      produit: (Array.isArray(par.product_id) ? par.product_id[1] : '') || '',
    }
  }

  // Stock réel : ce qui est déjà au frigo n'est pas à refaire.
  // (free_qty = disponible non réservé, dans l'unité de référence du produit.)
  // On cherche par ID produit : le champ `name` d'une variante ne contient pas le
  // parfum (« 20 cm CD* »), alors qu'Odoo renvoie partout ailleurs le display_name
  // (« 20 cm CD* (Chocolat) ») — sans ça les gâteaux n'avaient jamais de stock.
  const idsProduits = [...new Set([
    ...mos.map(m => (Array.isArray(m.product_id) ? m.product_id[0] : null)),
    ...moves.map(mv => (Array.isArray(mv.product_id) ? mv.product_id[0] : null)),
    ...bomLignesIds,
  ].filter(Boolean))]
  // Stocks lus À L'EMPLACEMENT DE PRODUCTION (celui d'où les ordres puisent),
  // sinon on compterait le stock du magasin et de l'annexe.
  const prods = idsProduits.length
    ? await odooCall(uid, 'product.product', 'read', [idsProduits, ['display_name', 'free_qty', 'qty_available', 'uom_id']],
      lieuProd ? { context: { location: lieuProd } } : {})
    : []
  const stockDe = {}
  for (const pr of prods) {
    stockDe[pr.display_name] = {
      qty: pr.free_qty || 0,
      // ce qu'Odoo affiche : le stock physique. L'écart avec `qty`, c'est ce qui
      // est déjà réservé par des ordres confirmés — sinon on croit à une erreur.
      physique: pr.qty_available || 0,
      unite: ((Array.isArray(pr.uom_id) ? pr.uom_id[1] : 'u') || 'u').replace(/^units?$/i, 'u'),
    }
  }
  // Compare un besoin au stock. Ne convertit que g ↔ kg (le reste doit correspondre),
  // sinon renvoie null : mieux vaut ne rien affirmer que se tromper de quantité.
  const enStock = (produit, besoin, unite) => {
    const st = stockDe[produit]
    if (toujoursDispo(produit)) return { dispo: st ? st.qty : 0, assez: true, manque: 0 }
    if (!st || !besoin) return null
    const k = u => String(u || '').toLowerCase()
    let dispo = st.qty
    if (k(st.unite) !== k(unite)) {
      if (k(st.unite) === 'g' && k(unite) === 'kg') dispo = st.qty / 1000
      else if (k(st.unite) === 'kg' && k(unite) === 'g') dispo = st.qty * 1000
      else return null
    }
    // Un stock négatif (écart de saisie fréquent dans Odoo) compte comme zéro :
    // sinon on afficherait « manque 10 675 kg » pour un besoin de 1,24 kg.
    const utile = Math.max(0, dispo)
    return {
      dispo: Math.round(dispo * 100) / 100,
      assez: utile >= besoin,
      manque: Math.round(Math.min(besoin, besoin - utile) * 100) / 100,
    }
  }
  const avecStock = l => {
    const st = enStock(l.produit, l.qty, l.unite)
    if (!st || !(l.reserve > 0)) return { ...l, stock: st }
    // le réservé pour cet ordre s'ajoute à ce qu'il peut prendre
    const dispo = (st.dispo || 0) + l.reserve
    return { ...l, stock: { dispo, assez: dispo >= l.qty - 0.001, manque: Math.max(0, l.qty - dispo) } }
  }
  for (const r of racines) r.recette = r.recette.map(avecStock)
  for (const r of Object.values(recettesPrepa)) r.lignes = r.lignes.map(avecStock)

  const limiteJour = iso(j0).slice(0, 10)
  const ofs = racines.map(r => {
    const up = infoParent[r.origine]
    const src = up ? up.origine : r.origine
    return {
      ...r,
      enRetard: String(r.quand || '').slice(0, 10) < limiteJour,
      stock: enStock(r.produit, r.qty, r.unite),
      pour: up ? up.produit : '',
      origine: src || r.origine,
      type: /^OP\//i.test(src) ? 'prevision' : 'commande',
      scode: (String(src).match(/S\d{3,}/i) || [''])[0].toUpperCase(),
    }
  })
  // Ce qui est réservé pour chaque ordre, composant par composant. L'app en a
  // besoin pour ne pas redemander une crème déjà mise de côté pour un gâteau.
  const idsOrdres = mos.map(m => m.id)
  const reservesPar = {}
  if (idsOrdres.length) {
    const rm = await odooSearchRead(uid, 'stock.move',
      [['raw_material_production_id', 'in', idsOrdres], ['reserved_availability', '>', 0]],
      ['raw_material_production_id', 'product_id', 'reserved_availability', 'product_uom'], { limit: 800 })
    for (const x of rm) {
      const nomOrdre = Array.isArray(x.raw_material_production_id) ? x.raw_material_production_id[1] : ''
      const nomProd = Array.isArray(x.product_id) ? x.product_id[1] : ''
      let q = x.reserved_availability || 0
      const u = (Array.isArray(x.product_uom) ? x.product_uom[1] : '') || ''
      if (/^g$/i.test(u) && q >= 1000) q = q / 1000
      if (!nomOrdre || !nomProd) continue
      ;(reservesPar[nomOrdre] ||= {})[nomProd] = (reservesPar[nomOrdre][nomProd] || 0) + q
    }
  }

  const ordres = [...mos, ...finis].map(m => ({
    name: m.name, id: m.id, produit: nom(m), qty: m.product_qty, unite: uom(m),
    etat: m.state, dispo: m.components_availability || '',
    origine: m.origin || '',
    reserves: reservesPar[m.name] || {},
    pour: origines(m).filter(o => parNom.has(o)).join(', ') || (m.origin || ''),
  }))
  // Les autres ordres WHLVP ouverts (pâte à sucre…) : ils ne s'appellent pas
  // « CD* » mais ce qu'ils produisent compte aussi dans le stock que l'app tient
  // entre le « fait » et la validation.
  const dejaLa = new Set(ordres.map(o => o.name))
  const autres = await odooSearchRead(uid, 'mrp.production',
    [['name', 'like', 'WHLVP/MO/'], ['state', 'in', ['confirmed', 'progress', 'to_close']]],
    ['name', 'product_id', 'product_qty', 'product_uom_id', 'state', 'origin'], { limit: 500, order: 'id desc' })
  for (const m of autres) {
    if (dejaLa.has(m.name)) continue
    ordres.push({
      name: m.name, id: m.id,
      produit: Array.isArray(m.product_id) ? m.product_id[1] : '',
      qty: m.product_qty,
      unite: (Array.isArray(m.product_uom_id) ? m.product_uom_id[1] : 'u').replace(/^units?$/i, 'u'),
      etat: m.state, dispo: '', pour: '', origine: m.origin || '',
    })
  }
  return { ofs, ordres, recettes: recettesPrepa, stocks: stockDe, catalogue }
}

// ============================================================
// Catalogue des fonds cakedesign : pour chaque taille (nomenclature Odoo) et
// chaque parfum, la recette. Les lignes de nomenclature portent la condition de
// parfum (« SI parfum = Chocolat ») : on la traduit en liste de parfums.
// Sert à composer une fabrication libre (« je fais 20 cm et 30 cm en chocolat »).
// ============================================================
async function fetchCatalogue(uid, collecteIds = []) {
  const boms = await odooSearchRead(uid, 'mrp.bom', [['product_tmpl_id.name', 'ilike', 'CD*']],
    ['id', 'product_tmpl_id', 'product_qty', 'product_uom_id'], { limit: 400 })
  const enCm = boms.filter(b => /\d+\s*(cm|x\s*\d)/i.test(Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[1] : ''))
  if (!enCm.length) return []
  const lignes = await odooSearchRead(uid, 'mrp.bom.line', [['bom_id', 'in', enCm.map(b => b.id)]],
    ['bom_id', 'product_id', 'product_qty', 'product_uom_id', 'bom_product_template_attribute_value_ids'], { limit: 3000 })
  const valIds = [...new Set(lignes.flatMap(l => l.bom_product_template_attribute_value_ids || []))]
  const vals = valIds.length ? await odooSearchRead(uid, 'product.template.attribute.value',
    [['id', 'in', valIds]], ['id', 'name'], { limit: 500 }) : []
  const nomVal = {}
  for (const v of vals) nomVal[v.id] = v.name

  return enCm.map(b => {
    const tmpl = Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[1] : ''
    const mesLignes = lignes.filter(l => l.bom_id[0] === b.id).map(l => {
      let q = l.product_qty || 0
      let u = (Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : 'u')
      if (/^g$/i.test(u) && q >= 1000) { q = q / 1000; u = 'kg' }
      if (Array.isArray(l.product_id)) collecteIds.push(l.product_id[0])
      const parfums = (l.bom_product_template_attribute_value_ids || []).map(id => nomVal[id]).filter(Boolean)
      return {
        produit: (Array.isArray(l.product_id) ? l.product_id[1] : '') || '',
        qty: Math.round(q * 1000) / 1000,
        unite: u.replace(/^units?$/i, 'u'),
        parfums,                                  // vide = pour tous les parfums
      }
    })
    const tous = [...new Set(mesLignes.flatMap(l => l.parfums))].sort()
    return {
      template: tmpl,
      taille: (parseCakedesign(tmpl + ' (x)') || {}).taille || tmpl.replace(/\s*CD\*.*$/i, '').trim(),
      qtyBase: b.product_qty || 1,
      parfums: tous,
      lignes: mesLignes,
    }
  }).filter(c => c.parfums.length)
}

// =============================================================
// VITRINE SALÉ → ODOO   (GS- fabriqués à l'annexe)
// -------------------------------------------------------------
// La vitrine salée ne déclare ses boîtes qu'une fois PRÊTES : la marchandise
// existe déjà. L'app crée donc l'ordre de fabrication à l'annexe ET le valide,
// puis pose le transfert annexe → vente EN BROUILLON. C'est un humain qui
// validera ce transfert dans Odoo, une fois la réception vérifiée en boutique
// (la Checklist le prévient par WhatsApp).
// Un GS- dont la recette n'est PAS à l'annexe n'est pas concerné : il garde son
// ancien circuit (devis « Vitrine GS »). Le jour où sa recette passe à
// l'annexe, il bascule tout seul, sans rien changer dans l'app.
// =============================================================

const TYPE_ANNEXE_VENTE = 92            // « Transferts internes prod annexe -> vente »
const ORIGINE_VITRINE = 'VITRINE SALE'

/**
 * Le transfert annexe → vente, laissé EN BROUILLON. Tant qu'un brouillon est
 * ouvert on s'y greffe : la boutique a un seul bon à vérifier, pas un par
 * article. Dès qu'il est validé, la déclaration suivante ouvre un nouveau bon.
 */
async function transfertAnnexeVente(uid, prod, qty, uomId, origine) {
  const type = (await odooSearchRead(uid, 'stock.picking.type', [['id', '=', TYPE_ANNEXE_VENTE]],
    ['default_location_src_id', 'default_location_dest_id'], { limit: 1 }))[0]
  if (!type) return null
  const src = type.default_location_src_id[0]
  const dest = type.default_location_dest_id[0]
  const move = {
    name: prod.display_name,
    product_id: prod.id,
    product_uom_qty: qty,
    product_uom: uomId,
    location_id: src,
    location_dest_id: dest,
  }
  const [ouvert] = await odooSearchRead(uid, 'stock.picking', [
    ['picking_type_id', '=', TYPE_ANNEXE_VENTE],
    ['state', '=', 'draft'],
    ['origin', 'like', ORIGINE_VITRINE + '%'],
  ], ['id', 'name'], { limit: 1, order: 'id desc' })
  if (ouvert) {
    await odooCall(uid, 'stock.move', 'create', [{ ...move, picking_id: ouvert.id }])
    return ouvert.name
  }
  const id = await odooCall(uid, 'stock.picking', 'create', [{
    picking_type_id: TYPE_ANNEXE_VENTE,
    location_id: src,
    location_dest_id: dest,
    origin: `${ORIGINE_VITRINE} ${origine}`.slice(0, 200),
    move_ids_without_package: [[0, 0, move]],
  }])
  const [pick] = await odooSearchRead(uid, 'stock.picking', [['id', '=', id]], ['name'], { limit: 1 })
  return pick ? pick.name : null
}

async function produireGsAnnexe(uid, { tmplId, nom, qty }) {
  const domaine = tmplId ? [['product_tmpl_id', '=', Number(tmplId)]] : [['name', '=', nom]]
  const prod = (await odooSearchRead(uid, 'product.product', domaine,
    ['id', 'display_name', 'product_tmpl_id'], { limit: 1 }))[0]
  if (!prod) return { ignore: true, message: 'article introuvable dans Odoo' }

  const bom = (await odooSearchRead(uid, 'mrp.bom', [['product_tmpl_id', '=', prod.product_tmpl_id[0]]],
    ['id', 'product_qty', 'product_uom_id', 'picking_type_id'], { limit: 1 }))[0]
  if (!bom || !Array.isArray(bom.picking_type_id)) return { ignore: true }

  const type = (await odooSearchRead(uid, 'stock.picking.type', [['id', '=', bom.picking_type_id[0]]],
    ['id', 'default_location_src_id', 'default_location_dest_id', 'company_id', 'warehouse_id'], { limit: 1 }))[0]
  // C'est l'ATELIER de la recette qui décide : rien à faire tant que la recette
  // n'est pas passée à l'annexe.
  if (!type || !/annexe/i.test(String(Array.isArray(type.warehouse_id) ? type.warehouse_id[1] : ''))) {
    return { ignore: true }
  }

  const modele = {
    picking_type_id: [type.id],
    location_src_id: [type.default_location_src_id[0]],
    location_dest_id: [type.default_location_dest_id[0]],
    company_id: [type.company_id[0]],
  }
  const id = await odooCall(uid, 'mrp.production', 'create', [{
    product_id: prod.id,
    product_qty: qty,
    product_uom_id: Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined,
    bom_id: bom.id,
    origin: [ORIGINE_VITRINE, ORIGINE_APP].join(','),
    picking_type_id: type.id,
    location_src_id: modele.location_src_id[0],
    location_dest_id: modele.location_dest_id[0],
    company_id: modele.company_id[0],
  }])
  // Odoo ne déroule pas la nomenclature quand l'ordre est créé par programme.
  const lignes = await odooSearchRead(uid, 'mrp.bom.line', [['bom_id', '=', bom.id]],
    ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })
  const lieuProd = await lieuProduction(uid)
  const facteur = bom.product_qty ? qty / bom.product_qty : 1
  for (const l of lignes) {
    await odooCall(uid, 'stock.move', 'create', [{
      name: prod.display_name,
      product_id: l.product_id[0],
      product_uom_qty: Math.round(l.product_qty * facteur * 1000) / 1000,
      product_uom: l.product_uom_id[0],
      location_id: modele.location_src_id[0],
      location_dest_id: lieuProd ? lieuProd.id : modele.location_dest_id[0],
      raw_material_production_id: id,
      company_id: modele.company_id[0],
    }])
  }
  await moveDuFini(uid, id, prod, qty, Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined, modele)
  await odooCall(uid, 'mrp.production', 'action_confirm', [[id]])
  await odooCall(uid, 'mrp.production', 'action_assign', [[id]]).catch(() => { })
  const of = (await odooSearchRead(uid, 'mrp.production', [['id', '=', id]], ['name'], { limit: 1 }))[0]

  // Les boîtes sont déjà faites : on valide. Un composant qui manque ne doit pas
  // bloquer (le stock des étiquettes est négatif depuis toujours) → on force.
  const res = await validerOrdre(uid, of.name, true)
  const transfert = res.ok
    ? await transfertAnnexeVente(uid, prod, qty, Array.isArray(bom.product_uom_id) ? bom.product_uom_id[0] : undefined, of.name)
    : null
  return { of: of.name, valide: !!res.ok, transfert, message: res.ok ? '' : (res.message || '') }
}

export default async function handler(req, res) {
  try {
    // création de l'ordre de glaçage (POST), quand l'équipe a fait sa tournée
    if (req.method === 'POST' && (req.query.mode === 'prepa' || req.query.mode === 'glacage')) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const t = Math.max(1, Math.min(50, parseInt(body.tournees) || 0))
      if (!t) return res.status(400).json({ error: 'nombre de tournées invalide' })
      const quoi = String(req.query.quoi || 'glacage')
      const uid = await odooAuth()
      if (body.test) {
        const { prod, bom } = await produitPrepa(uid, quoi)
        const u = bom && Array.isArray(bom.product_uom_id) ? bom.product_uom_id[1] : 'g'
        return res.status(200).json({
          id: 0, name: 'TEST (rien créé dans Odoo)', produit: prod ? prod.display_name : quoi,
          qty: bom ? enG(bom.product_qty * t, u) : 0, etat: 'test', test: true,
        })
      }
      const of = await creerOrdrePrepa(uid, quoi, t, body.colorants)
      console.log(`[${quoi}] ${t} tournée(s) par ${body.actorId || '?'} → ${of.name} (${of.qty} g)`)
      return res.status(200).json(of)
    }

    // La vitrine salée a fini ses boîtes (POST) : ordre de fabrication validé à
    // l'annexe + transfert annexe → vente en brouillon.
    if (req.method === 'POST' && req.query.mode === 'vitrine-gs') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const qty = Number(body.qty) || 0
      if (!(qty > 0)) return res.status(400).json({ error: 'quantité invalide' })
      if (body.test) return res.status(200).json({ of: 'TEST (rien créé dans Odoo)', test: true })
      const uid = await odooAuth()
      try {
        const r = await produireGsAnnexe(uid, { tmplId: body.code, nom: body.produit, qty })
        console.log(`[vitrine-gs] ${body.produit} x${qty} -> ${JSON.stringify(r)}`)
        return res.status(200).json(r)
      } catch (e) {
        return res.status(200).json({ error: (e.message || String(e)).slice(0, 300) })
      }
    }

    // L'équipe a fait une préparation qu'Odoo ne demandait pas : on crée l'ordre
    // correspondant, il partira dans « À valider ». (POST)
    if (req.method === 'POST' && req.query.mode === 'creer-of') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const produit = String(body.produit || '')
      const qtyKg = Number(body.qty) || 0
      if (!produit || !(qtyKg > 0)) return res.status(400).json({ error: 'article ou quantité manquante' })
      if (body.test) return res.status(200).json({ name: 'TEST (rien créé dans Odoo)', test: true })
      const uid = await odooAuth()
      try {
        const of = await creerOfPreparation(uid, produit, qtyKg, (body.parents || []).filter(Boolean))
        console.log(`[creer-of] ${produit} ${qtyKg} kg par ${body.actorId || '?'} → ${of.name}`)
        return res.status(200).json(of)
      } catch (e) {
        return res.status(200).json({ error: (e.message || String(e)).slice(0, 300) })
      }
    }

    // On décoche : l'ordre que l'app avait créé n'a plus lieu d'être. (POST)
    if (req.method === 'POST' && req.query.mode === 'annuler-of') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const names = (body.ordres || []).filter(Boolean)
      if (!names.length || body.test) return res.status(200).json({ annules: 0 })
      const uid = await odooAuth()
      return res.status(200).json(await annulerOfApp(uid, names))
    }

    // Réservation des composants dans Odoo (POST). Quand l'équipe coche « fait »,
    // Odoo bloque pour cet ordre ce qu'il peut trouver en stock : personne
    // d'autre ne le voit plus disponible. Réversible (on décoche → on libère),
    // et ça ne valide rien.
    if (req.method === 'POST' && req.query.mode === 'reserver') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const names = (body.ordres || []).filter(Boolean)
      if (!names.length) return res.status(200).json({ ordres: 0 })
      if (body.test) return res.status(200).json({ ordres: names.length, test: true })
      const uid = await odooAuth()
      const mos = await odooSearchRead(uid, 'mrp.production',
        [['name', 'in', names], ['state', 'in', ['confirmed', 'progress', 'to_close']]], ['id'], { limit: 100 })
      if (!mos.length) return res.status(200).json({ ordres: 0 })
      const ids = mos.map(m => m.id)
      try {
        await odooCall(uid, 'mrp.production', body.on ? 'action_assign' : 'do_unreserve', [ids])
      } catch (e) {
        return res.status(200).json({ ordres: 0, message: (e.message || String(e)).slice(0, 200) })
      }
      return res.status(200).json({ ordres: ids.length })
    }

    // validation dans Odoo (POST) : action irréversible, réservée à perm_valider_of côté app
    // Gâteaux entiers dont la commande est passée en caisse.
    // Sans `dry`, on valide (c'est le rendez-vous de 8h) ; avec, on liste.
    if (req.query.mode === 'parents-pos') {
      const jours = Math.min(7, Math.max(1, parseInt(req.query.jours, 10) || 1))
      const dry = req.query.dry === '1'
      const uid = await odooAuth()
      const out = await parentsEncaisses(uid, jours, dry)
      if (!dry) console.log(`[check-cd:parents] ${out.length} gâteau(x) · ${out.map(o => o.mo_name + '=' + (o.ok ? 'ok' : o.message)).join(' | ')}`)
      return res.status(200).json({ parents: out })
    }

    // Check CD- : l'état de chaque gâteau sorti (son étage est-il en stock ?)
    if (req.query.mode === 'check-cd') {
      const ids = String(req.query.mos || '').split(',').map(x => parseInt(x, 10)).filter(Boolean)
      if (!ids.length) return res.status(200).json({ etats: [] })
      const uid = await odooAuth()
      return res.status(200).json({ etats: await etatsCheckCd(uid, ids) })
    }

    // Check CD- : envoyer en validation. On revérifie l'étage juste avant :
    // entre l'affichage et l'envoi, quelqu'un a pu consommer le stock.
    if (req.method === 'POST' && req.query.mode === 'check-cd-valider') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const ids = (body.mos || []).map(x => parseInt(x, 10)).filter(Boolean)
      if (!ids.length) return res.status(400).json({ error: 'aucun gâteau sélectionné' })
      const uid = await odooAuth()
      const etats = await etatsCheckCd(uid, ids)
      const out = []
      for (const e of etats) {
        if (e.dispo === 'valide') { out.push({ ...e, ok: true, message: 'déjà validé dans Odoo' }); continue }
        if (e.dispo !== 'ok') {
          out.push({ ...e, ok: false, message: e.raison || `étage manquant (${e.stock} sur ${e.besoin} demandés)` })
          continue
        }
        if (body.test) { out.push({ ...e, ok: true, message: 'simulé — rien envoyé à Odoo', test: true }); continue }
        const r = await validerOrdre(uid, e.mo_name, false)
        out.push({ ...e, ok: r.ok, message: r.message })
      }
      console.log(`[check-cd] par ${body.actorId || '?'} · ${out.map(o => o.mo_name + '=' + (o.ok ? 'ok' : o.message)).join(' | ')}`)
      return res.status(200).json({ resultats: out })
    }

    if (req.method === 'POST' && req.query.mode === 'valider') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const names = (body.ordres || []).filter(Boolean)
      if (!names.length) return res.status(400).json({ error: 'aucun ordre' })
      if (body.test) {
        return res.status(200).json({
          resultats: names.map(name => ({ name, ok: true, message: 'simulé — rien envoyé à Odoo', test: true })),
        })
      }
      const uid = await odooAuth()
      const out = []
      for (const n of names) out.push(await validerOrdre(uid, n, body.forcer === true, (body.quantites || {})[n], (body.ajouts || {})[n]))
      console.log(`[fabrication:valider] par ${body.actorId || '?'} · forcer=${body.forcer === true} · ${out.map(o => o.name + '=' + (o.ok ? 'ok' : o.message)).join(' | ')}`)
      return res.status(200).json({ resultats: out })
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    // Deuxième usage de cette fonction (limite Vercel Hobby = 12 fonctions) :
    // la liste de fabrication CD*, cf. fetchFabrication.
    // recette du glaçage + stock des ingrédients
    if (req.query.mode === 'ordres') {
      const uid = await odooAuth()
      const mos = await odooSearchRead(uid, 'mrp.production',
        [['name', 'like', 'WHLVP/MO/'], ['state', 'in', ['confirmed', 'progress', 'to_close']]],
        ['name', 'product_id', 'state'], { limit: 500, order: 'id desc' })
      return res.status(200).json({
        ordres: mos.map(m => ({ name: m.name, produit: Array.isArray(m.product_id) ? m.product_id[1] : '', etat: m.state })),
      })
    }

    // La photo d'un article, telle qu'elle est dans Odoo. Servie à part : mise
    // bout à bout, 55 photos pèseraient près d'un mégaoctet dans l'arbre.
    if (req.query.mode === 'photo') {
      const id = parseInt(req.query.id, 10)
      if (!id) return res.status(404).end()
      const uid = await odooAuth()
      // la grande image : en 128 px, la photo est floue dès qu'on l'affiche
      // sur un écran de téléphone
      const t = await odooCall(uid, 'product.template', 'read', [[id], ['image_512', 'image_256', 'image_128']])
      const b64 = t && t[0] && (t[0].image_512 || t[0].image_256 || t[0].image_128)
      if (!b64) return res.status(404).end()
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.status(200).send(Buffer.from(b64, 'base64'))
    }

    // L'arbre de l'annexe. Le premier écran montre les MÈRES — entremets (E-),
    // viennoiseries (V-), mignardises (MI-) et bûches (N-) — et l'on descend
    // vers les préparations. Jamais un morceau tout seul : il se trouve dans sa
    // mère (règle de Layla, 28/08).
    if (req.query.mode === 'annexe') {
      const uid = await odooAuth()
      const lieux = await odooSearchRead(uid, 'stock.location',
        [['complete_name', 'ilike', 'Stock Prod annexe']], ['id'], { limit: 5 })
      if (!lieux.length) return res.status(200).json({ racines: [], recettes: {} })

      const net = n => String(n || '').replace(/^\[\d+\]\s*/, '').trim()
      // Odoo écrit les liens sur le MODÈLE (« Sm- PR Le Citron Framboise »)
      // alors que l'atelier fabrique des VARIANTES (« … (10) ») : sans ça on
      // perd des chaînes entières.
      const modele = n => net(n).replace(/\s*\([^()]*\)\s*$/, '').trim()
      const uniteDe = u => ((Array.isArray(u) ? u[1] : '') || 'u').replace(/^units?$/i, 'u')

      const d0 = new Date(); d0.setDate(d0.getDate() - 90)
      const isoD = d => d.toISOString().slice(0, 19).replace('T', ' ')
      const [mos, boms, lignesBom, tmpl] = await Promise.all([
        odooSearchRead(uid, 'mrp.production', [
          ['location_src_id', 'in', lieux.map(l => l.id)],
          ['state', '=', 'done'],
          ['date_planned_start', '>=', isoD(d0)],
        ], ['product_id'], { limit: 3000 }),
        odooSearchRead(uid, 'mrp.bom', [], ['id', 'product_id', 'product_tmpl_id', 'product_qty', 'product_uom_id'], { limit: 5000 }),
        odooSearchRead(uid, 'mrp.bom.line', [],
          ['bom_id', 'product_id', 'product_qty', 'product_uom_id', 'bom_product_template_attribute_value_ids'],
          { limit: 40000 }),
        odooSearchRead(uid, 'product.template', [], ['id', 'name'], { limit: 8000 }),
      ])

      const combien = {}
      const qtesFaites = {}
      for (const m of mos) {
        const n = net(Array.isArray(m.product_id) ? m.product_id[1] : '')
        if (!n) continue
        combien[n] = (combien[n] || 0) + 1
        ;(qtesFaites[n] ||= []).push(m.product_qty || 0)
      }
      // Certains articles se font par TOURNÉE ENTIÈRE (la pâte à sucre sort
      // toujours en multiples de 6 925 g), d'autres à la quantité voulue. Odoo
      // ne le dit nulle part : on le déduit de ce que l'atelier a réellement
      // produit. Il faut un an et les deux ateliers pour avoir assez de
      // fournées — 90 jours à l'annexe seule ne suffisent pas.
      const dAn = new Date(); dAn.setMonth(dAn.getMonth() - 12)
      const anciens = await odooSearchRead(uid, 'mrp.production', [
        ['location_src_id', 'in', [...lieux.map(l => l.id), 52]],
        ['state', '=', 'done'],
        ['date_planned_start', '>=', isoD(dAn)],
      ], ['product_id', 'product_qty'], { limit: 12000 })
      for (const m of anciens) {
        const n = net(Array.isArray(m.product_id) ? m.product_id[1] : '')
        if (n) (qtesFaites[n] ||= []).push(m.product_qty || 0)
      }

      const tournees = {}
      for (const [n, qs] of Object.entries(qtesFaites)) {
        if (qs.length < 4) continue
        const vals = [...new Set(qs.map(x => Math.round(x * 100) / 100))].filter(x => x > 0).sort((a, b) => a - b)
        if (!vals.length) continue
        const pas = vals[0]
        const toutes = vals.every(x => Math.abs(x / pas - Math.round(x / pas)) < 0.02)
        if (toutes && vals.length > 1) tournees[n] = pas
        else if (vals.length === 1) tournees[n] = pas
      }

      const nomTmpl = new Map(tmpl.map(t => [t.id, net(t.name)]))
      const ingParBom = new Map()
      for (const l of lignesBom) {
        const id = Array.isArray(l.bom_id) ? l.bom_id[0] : l.bom_id
        if (!ingParBom.has(id)) ingParBom.set(id, [])
        ingParBom.get(id).push({
          produit: net(Array.isArray(l.product_id) ? l.product_id[1] : ''),
          qty: l.product_qty,
          unite: uniteDe(l.product_uom_id),
          fabrique: /^\s*(SM|Sm)/.test(net(Array.isArray(l.product_id) ? l.product_id[1] : '')),
          // à quels parfums cette ligne est réservée (vide = tous)
          pour: l.bom_product_template_attribute_value_ids || [],
        })
      }

      // Une recette de modèle sert plusieurs parfums, et chaque ligne dit à
      // quel(s) parfum(s) elle appartient. Sans ce tri, le « 15 cm Vitrine
      // Praliné » afficherait aussi la crème citron.
      const tmplDesBoms = [...new Set(boms.map(b =>
        (Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[0] : b.product_tmpl_id)).filter(Boolean))]
      const variantes = tmplDesBoms.length
        ? await odooSearchRead(uid, 'product.product', [['product_tmpl_id', 'in', tmplDesBoms]],
          ['id', 'display_name', 'product_tmpl_id', 'product_template_attribute_value_ids'], { limit: 12000 })
        : []
      const parTmpl = new Map()
      for (const v of variantes) {
        const t = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : v.product_tmpl_id
        if (!parTmpl.has(t)) parTmpl.set(t, [])
        parTmpl.get(t).push(v)
      }
      const pourCeParfum = (lignes, valeurs) => {
        const mien = new Set(valeurs || [])
        return lignes.filter(l => !l.pour.length || l.pour.some(x => mien.has(x)))
      }

      const carte = {}
      for (const b of boms) {
        const ing = ingParBom.get(b.id) || []
        const base = { sortQty: b.product_qty, sortUnite: uniteDe(b.product_uom_id) }
        if (b.product_id) {
          // recette faite pour une variante précise : rien à trier
          const nom = net(b.product_id[1])
          if (nom && !carte[nom]) carte[nom] = { ...base, lignes: ing }
          if (nom && !carte[modele(nom)]) carte[modele(nom)] = { ...base, lignes: ing }
          continue
        }
        const t = Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[0] : b.product_tmpl_id
        const nomT = nomTmpl.get(t)
        const liste = parTmpl.get(t) || []
        for (const v of liste) {
          const nomV = net(v.display_name)
          if (!nomV || carte[nomV]) continue
          carte[nomV] = { ...base, lignes: pourCeParfum(ing, v.product_template_attribute_value_ids) }
        }
        // le modèle garde la recette entière, pour les articles sans parfum
        if (nomT && !carte[nomT]) carte[nomT] = { ...base, lignes: ing }
      }
      const recetteDe = n => carte[n] || carte[modele(n)]
      const estFini = n => /^(E-|V-|MI-|N-)/i.test(n)
      const aLAnnexe = n => combien[n] !== undefined || combien[modele(n)] !== undefined

      // une mère : un article fini dont la fabrication passe par l'annexe
      const touche = (nom, prof, vus) => {
        if (prof > 6) return false
        for (const cle of [nom, modele(nom)]) {
          if (vus.has(cle)) continue
          vus.add(cle)
          for (const l of (carte[cle] || { lignes: [] }).lignes) {
            if (aLAnnexe(l.produit)) return true
            if (touche(l.produit, prof + 1, vus)) return true
          }
        }
        return false
      }
      const meres = [...new Set(Object.keys(carte)
        .filter(n => estFini(n) && (carte[n].lignes || []).length && touche(n, 0, new Set()))
        .map(modele))]

      // ce que chaque mère fait travailler à l'annexe : les plus grosses devant
      const poids = {}
      const compter = (nom, prof, vus) => {
        if (prof > 6) return 0
        let t = 0
        for (const cle of [nom, modele(nom)]) {
          if (vus.has(cle)) continue
          vus.add(cle)
          for (const l of (carte[cle] || { lignes: [] }).lignes) {
            t += combien[l.produit] || combien[modele(l.produit)] || 0
            t += compter(l.produit, prof + 1, vus)
          }
        }
        return t
      }
      for (const m of meres) poids[m] = compter(m, 0, new Set())

      // On ne montre que ce qui se vend encore. La case « peut être vendu »
      // d'Odoo ne dit pas la vérité (le Fraisier y est à NON alors qu'il fait
      // 1 600 ventes) : on regarde les ventes réelles sur 12 mois glissants,
      // ce qui garde les articles de saison comme les bûches de Noël.
      const dVente = new Date(); dVente.setMonth(dVente.getMonth() - 12)
      const tmplMeres = await odooSearchRead(uid, 'product.template',
        [['name', 'in', meres]], ['id', 'name'], { limit: 400 })
      let vendues = new Set()
      if (tmplMeres.length) {
        const ventes = await odooSearchRead(uid, 'sale.order.line', [
          ['product_template_id', 'in', tmplMeres.map(t => t.id)],
          ['state', 'in', ['sale', 'done']],
          ['create_date', '>=', isoD(dVente)],
        ], ['product_template_id'], { limit: 20000 })
        const nomDe = new Map(tmplMeres.map(t => [t.id, net(t.name)]))
        for (const l of ventes) {
          const n = nomDe.get(Array.isArray(l.product_template_id) ? l.product_template_id[0] : l.product_template_id)
          if (n) vendues.add(n)
        }
        // un article absent du catalogue de vente ne peut pas être jugé : on le garde
        const connus = new Set(tmplMeres.map(t => net(t.name)))
        for (const m of meres) if (!connus.has(m)) vendues.add(m)
      } else {
        vendues = new Set(meres)
      }

      const racines = meres
        .filter(m => vendues.has(m))
        .sort((a, b) => (poids[b] || 0) - (poids[a] || 0))
      // ce qui a été écarté reste proposé derrière le « + » de l'écran
      const ecartees = meres.filter(m => !vendues.has(m)).sort()

      // on ne renvoie que les recettes utiles : les mères et leur descendance
      const aRendre = {}
      const rendre = (nom, prof, vus) => {
        if (prof > 6) return
        for (const cle of [nom, modele(nom)]) {
          if (vus.has(cle)) continue
          vus.add(cle)
          const r = recetteDe(cle)
          if (!r) continue
          aRendre[cle] = r
          for (const l of r.lignes) rendre(l.produit, prof + 1, vus)
        }
      }
      for (const m of meres) rendre(m, 0, new Set())

      // Ce qu'il y a en stock à l'annexe, et les minimums déclarés dans Odoo :
      // c'est ce qui dit s'il y a du travail.
      const nomsArbre = [...new Set(Object.keys(aRendre))]
      const [quants, points, tmplPhotos] = await Promise.all([
        odooSearchRead(uid, 'stock.quant', [['location_id', 'child_of', lieux.map(l => l.id)]],
          ['product_id', 'quantity'], { limit: 3000 }),
        odooSearchRead(uid, 'stock.warehouse.orderpoint', [['location_id', 'in', lieux.map(l => l.id)]],
          ['product_id', 'product_min_qty', 'product_max_qty', 'qty_on_hand'], { limit: 800 }),
        odooSearchRead(uid, 'product.template', [['name', 'in', racines]],
          ['id', 'name', 'image_128'], { limit: 400 }),
      ])
      const stocks = {}
      for (const k of quants) {
        const n = net(Array.isArray(k.product_id) ? k.product_id[1] : '')
        if (n) stocks[n] = (stocks[n] || 0) + (k.quantity || 0)
      }
      const minmax = {}
      for (const o of points) {
        const n = net(Array.isArray(o.product_id) ? o.product_id[1] : '')
        if (!n) continue
        minmax[n] = { min: o.product_min_qty || 0, max: o.product_max_qty || 0 }
        if (stocks[n] === undefined) stocks[n] = o.qty_on_hand || 0
      }
      const photos = {}
      for (const t of tmplPhotos) if (t.image_128) photos[net(t.name)] = t.id

      return res.status(200).json({
        racines, ecartees, photos, stocks, minmax, tournees,
        combien: { ...combien, ...poids }, recettes: aRendre,
      })
    }

    // Les recettes d'une liste d'articles, telles qu'Odoo les tient. L'écran
    // « Fabrication Prod » s'en sert pour montrer ce qu'il faut et multiplier
    // par le nombre de fournées.
    if (req.query.mode === 'recettes') {
      const noms = String(req.query.articles || '').split('|').map(x => x.trim()).filter(Boolean)
      if (!noms.length) return res.status(200).json({ recettes: {} })
      const uid = await odooAuth()
      const prods = await odooSearchRead(uid, 'product.product', [['name', 'in', noms]],
        ['id', 'name', 'product_tmpl_id'], { limit: 200 })
      if (!prods.length) return res.status(200).json({ recettes: {} })

      const boms = await odooSearchRead(uid, 'mrp.bom', [
        '|', ['product_id', 'in', prods.map(p => p.id)],
        ['product_tmpl_id', 'in', prods.map(p => p.product_tmpl_id[0])],
      ], ['id', 'product_id', 'product_tmpl_id', 'product_qty', 'product_uom_id'], { limit: 300 })
      if (!boms.length) return res.status(200).json({ recettes: {} })

      const lignes = await odooSearchRead(uid, 'mrp.bom.line',
        [['bom_id', 'in', boms.map(b => b.id)]],
        ['bom_id', 'product_id', 'product_qty', 'product_uom_id'], { limit: 2000 })
      const parBom = new Map()
      for (const l of lignes) {
        const id = Array.isArray(l.bom_id) ? l.bom_id[0] : l.bom_id
        if (!parBom.has(id)) parBom.set(id, [])
        parBom.get(id).push({
          produit: (Array.isArray(l.product_id) ? l.product_id[1] : '').replace(/^\[\d+\]\s*/, ''),
          qty: l.product_qty,
          unite: ((Array.isArray(l.product_uom_id) ? l.product_uom_id[1] : '') || 'u').replace(/^units?$/i, 'u'),
          // un ingrédient qui se fabrique lui-même : on le montre autrement
          fabrique: /^\s*(\[\d+\]\s*)?SM/i.test(Array.isArray(l.product_id) ? l.product_id[1] : ''),
        })
      }
      // à chaque article, la première recette qui le concerne
      const parProduit = new Map(prods.map(p => [p.id, p.name]))
      const parTmpl = new Map(prods.map(p => [p.product_tmpl_id[0], p.name]))
      const out = {}
      for (const b of boms) {
        const nom = (b.product_id && parProduit.get(b.product_id[0]))
          || (b.product_tmpl_id && parTmpl.get(b.product_tmpl_id[0]))
        if (!nom || out[nom]) continue
        out[nom] = {
          sortQty: b.product_qty,
          sortUnite: ((Array.isArray(b.product_uom_id) ? b.product_uom_id[1] : '') || 'u').replace(/^units?$/i, 'u'),
          lignes: parBom.get(b.id) || [],
        }
      }
      return res.status(200).json({ recettes: out })
    }

    // suggestions d'articles quand on ajoute un ingrédient à la main.
    // On ne propose QUE ce qui est rangé dans le lieu de l'ordre
    // (WHLVP/Stock/Stock Prod) : ailleurs, l'article n'est pas sous la main.
    if (req.query.mode === 'articles') {
      const q = String(req.query.q || '').trim()
      if (q.length < 2) return res.status(200).json({ articles: [] })
      const uid = await odooAuth()
      const modele = await modeleWhlvp(uid)
      const lieu = modele && Array.isArray(modele.location_src_id) ? modele.location_src_id[0] : null
      if (!lieu) return res.status(200).json({ articles: [] })

      const quants = await odooSearchRead(uid, 'stock.quant',
        [['location_id', 'child_of', lieu], ['product_id.name', 'ilike', q]],
        ['product_id', 'quantity'], { limit: 300 })
      const parProduit = new Map()
      for (const k of quants) {
        if (!Array.isArray(k.product_id)) continue
        const [id, nom] = k.product_id
        const d = parProduit.get(id) || { id, nom, qty: 0 }
        d.qty += k.quantity || 0
        parProduit.set(id, d)
      }
      if (!parProduit.size) return res.status(200).json({ articles: [] })

      const unites = await odooCall(uid, 'product.product', 'read', [[...parProduit.keys()], ['uom_id']])
      const uomDe = Object.fromEntries(unites.map(u => [u.id, u.uom_id]))
      // on cherche un ingrédient, pas un gâteau : les matières premières (MP-)
      // et les préparations (SM) passent devant les produits finis
      const rang = n => (/^\s*(\[[^\]]*\]\s*)?MP-/i.test(n) ? 0 : /^\s*(\[[^\]]*\]\s*)?SM/i.test(n) ? 1 : 2)
      return res.status(200).json({
        articles: [...parProduit.values()]
          .map(a => ({
            id: a.id, nom: a.nom, stock: Math.round(a.qty * 100) / 100,
            uom: Array.isArray(uomDe[a.id]) ? uomDe[a.id][0] : null,
            unite: Array.isArray(uomDe[a.id]) ? uomDe[a.id][1] : '',
          }))
          .sort((x, y) => rang(x.nom) - rang(y.nom) || x.nom.localeCompare(y.nom))
          .slice(0, 20),
      })
    }

    if (req.query.mode === 'prepa' || req.query.mode === 'glacage') {
      const uid = await odooAuth()
      return res.status(200).json(await fetchPrepa(uid, String(req.query.quoi || 'glacage')))
    }

    // ce qui manque pour une liste d'ordres (lecture seule)
    if (req.query.mode === 'manques') {
      const names = String(req.query.ordres || '').split(',').map(x => x.trim()).filter(Boolean)
      if (!names.length) return res.status(200).json({ ordres: [] })
      const uid = await odooAuth()
      return res.status(200).json({ ordres: await manquesDesOrdres(uid, names) })
    }

    if (req.query.mode === 'fabrication') {
      const jours = Math.min(60, Math.max(1, parseInt(req.query.jours) || 7))
      const uid = await odooAuth()
      return res.status(200).json(await fetchFabrication(uid, jours))
    }

    const datesParam = req.query.dates || req.query.date
    if (!datesParam) return res.status(400).json({ error: 'dates param required' })
    const dates = String(datesParam).split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    if (dates.length === 0) return res.status(400).json({ error: 'invalid date format' })

    const uid = await odooAuth()
    const allItems = []
    for (const date of dates) {
      // On inclut TOUJOURS les composants déjà fabriqués : ils sont dans le congélateur, donc à sortir.
      const items = await fetchListForDate(date, uid, true)
      allItems.push(...items)
    }
    return res.status(200).json({ items: allItems })
  } catch (e) {
    console.error('[freezer-list] error:', e)
    res.status(500).json({ error: e.message })
  }
}
