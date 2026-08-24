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
async function validerOrdre(uid, name, forcer) {
  const mo = (await odooSearchRead(uid, 'mrp.production', [['name', '=', name]],
    ['id', 'name', 'state', 'product_qty', 'qty_producing']))[0]
  if (!mo) return { name, ok: false, message: 'ordre introuvable' }
  if (mo.state === 'done') return { name, ok: true, message: 'déjà terminé' }
  if (mo.state === 'cancel') return { name, ok: false, message: 'ordre annulé' }
  try {
    if (!mo.qty_producing || mo.qty_producing !== mo.product_qty) {
      await odooCall(uid, 'mrp.production', 'write', [[mo.id], { qty_producing: mo.product_qty }])
    }
    const r = await odooCall(uid, 'mrp.production', 'button_mark_done', [[mo.id]])
    // Odoo renvoie une fenêtre de confirmation quand quelque chose cloche
    if (r && typeof r === 'object' && r.res_model) {
      if (!forcer) return { name, ok: false, message: 'Odoo demande une confirmation (stock insuffisant ?)' }
      const ctx = r.context || {}
      const wiz = await odooCall(uid, r.res_model, 'create', [{}], { context: ctx })
      await odooCall(uid, r.res_model, 'process', [[wiz]], { context: ctx })
    }
    const apres = (await odooSearchRead(uid, 'mrp.production', [['id', '=', mo.id]], ['state']))[0]
    return { name, ok: apres && apres.state === 'done', message: apres ? apres.state : '' }
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
  glacage: { id: 6966, noms: ['SM. Glacage Royal CD*', 'SM. glacage cake design'], titre: 'Glaçage royal' },
  'pate-sucre': { id: 2940, noms: ['SM Pate a sucre Melange CD'], titre: 'Pâte à sucre' },
}
const prepaDe = cle => PREPAS[cle] || PREPAS.glacage

// Les recettes mélangent les kg et les grammes d'une ligne à l'autre (le CMC
// est en kg, le sucre glace en g) : on ramène tout en grammes.
// Une tournée n'utilise qu'une couleur ou deux : l'équipe choisit lesquelles,
// les autres ne sont pas mises dans l'ordre de fabrication.
const estColorant = n => /colorant/i.test(String(n))

const enG = (q, u) => (/^kg$/i.test(String(u)) ? Math.round(q * 1000000) / 1000 : q)

// Retrouve l'article (par son numéro, puis par son nom en secours) et sa recette,
// quel que soit son nom du moment.
async function produitPrepa(uid, cle) {
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

async function fetchPrepa(uid, cle) {
  const { prod, bom, conf } = await produitPrepa(uid, cle)
  if (!prod) return { erreur: `article « ${conf.titre} » introuvable dans Odoo` }
  if (!bom) return { erreur: 'recette introuvable dans Odoo pour ' + prod.display_name }
  const lignes = await odooSearchRead(uid, 'mrp.bom.line', [['bom_id', '=', bom.id]],
    ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })

  // on se cale sur un ordre existant de la production pour l'emplacement
  const modele = (await odooSearchRead(uid, 'mrp.production', [['name', 'like', 'WHLVP/MO/']],
    ['picking_type_id', 'location_src_id', 'location_dest_id', 'company_id'], { limit: 1, order: 'id desc' }))[0]
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
        stock: memeUnite ? Math.round(enG(st.qty, st.unite) * 1000) / 1000 : null,
      }
    }),
  }
}

// Ces préparations se consomment sans être déclarées : le stock Odoo gonfle
// pour rien. Règle de Layla : à la PREMIÈRE tournée d'une journée, on repart de
// zéro (ce qui restait a été consommé), en disant combien et sur combien de
// jours. Les tournées suivantes du même jour ne remettent rien à zéro.
async function remiseAZeroPrepa(uid, prod, lieu) {
  const dernier = (await odooSearchRead(uid, 'stock.move',
    [['product_id', '=', prod.id], ['state', '=', 'done'], ['is_inventory', '=', true]],
    ['date'], { limit: 1, order: 'date desc' }))[0]
  const jourDe = d => String(d || '').slice(0, 10)
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (dernier && jourDe(dernier.date) === aujourdhui) return null      // déjà remis à zéro aujourd'hui

  const quants = await odooSearchRead(uid, 'stock.quant',
    [['product_id', '=', prod.id], ['location_id', 'child_of', lieu]], ['id', 'quantity'])
  const reste = quants.reduce((s, q) => s + (q.quantity || 0), 0)
  if (reste <= 0.001) return null

  for (const q of quants) {
    await odooCall(uid, 'stock.quant', 'write', [[q.id], { inventory_quantity: 0, inventory_quantity_set: true }])
  }
  await odooCall(uid, 'stock.quant', 'action_apply_inventory', [quants.map(q => q.id)])

  const jours = dernier
    ? Math.max(1, Math.round((new Date(aujourdhui) - new Date(jourDe(dernier.date))) / 86400000))
    : null
  const unite = Array.isArray(prod.uom_id) ? prod.uom_id[1] : 'g'
  return {
    consomme: Math.round(enG(reste, unite)),
    jours,
    depuis: dernier ? jourDe(dernier.date) : null,
    // Sans remise à zéro précédente, ce qui traînait n'est pas de la
    // consommation mesurée : c'est du stock accumulé depuis toujours.
    premiere: !dernier,
  }
}

// Crée l'ordre de fabrication et le confirme. Il part ensuite dans « À valider »
// avec tout le reste.
async function creerOrdrePrepa(uid, cle, tournees, colorants) {
  const { prod, bom, conf } = await produitPrepa(uid, cle)
  if (!prod || !bom) throw new Error(`article ou recette de « ${conf.titre} » introuvable dans Odoo`)
  const modele = (await odooSearchRead(uid, 'mrp.production', [['name', 'like', 'WHLVP/MO/']],
    ['picking_type_id', 'location_src_id', 'location_dest_id', 'company_id'], { limit: 1, order: 'id desc' }))[0]
  if (!modele) throw new Error('aucun ordre WHLVP pour servir de modèle')
  const remise = await remiseAZeroPrepa(uid, prod, modele.location_src_id[0])
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
  const lignes = await odooSearchRead(uid, 'mrp.bom.line', [['bom_id', '=', bom.id]],
    ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })
  const lieuProd = (await odooSearchRead(uid, 'stock.location', [['usage', '=', 'production']], ['id'], { limit: 1 }))[0]
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
  await odooCall(uid, 'mrp.production', 'action_confirm', [[id]])
  const cree = (await odooSearchRead(uid, 'mrp.production', [['id', '=', id]], ['name', 'product_qty', 'state']))[0]
  const uniteBom = Array.isArray(bom.product_uom_id) ? bom.product_uom_id[1] : 'g'
  return { id, name: cree.name, qty: enG(cree.product_qty, uniteBom), produit: prod.display_name, etat: cree.state, remise }
}

// ============================================================
// Ce qui manque pour fabriquer ces ordres (lecture seule).
// La génoise est ignorée : son stock restera négatif un moment (Layla).
// ============================================================
async function manquesDesOrdres(uid, names) {
  const mos = await odooSearchRead(uid, 'mrp.production', [['name', 'in', names]],
    ['id', 'name', 'product_id', 'product_qty', 'product_uom_id', 'origin', 'state', 'components_availability', 'location_src_id'])
  if (!mos.length) return []
  const moves = await odooSearchRead(uid, 'stock.move',
    [['raw_material_production_id', 'in', mos.map(m => m.id)]],
    ['raw_material_production_id', 'product_id', 'product_uom_qty', 'product_uom'], { limit: 500 })
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
      const ignore = /genoise|eau\s*robinet|^\s*MP-\s*Eau/i.test(nomP)
      const uniteLigne = (Array.isArray(x.product_uom) ? x.product_uom[1] : 'u').replace(/^units?$/i, 'u')
      const lieu = Array.isArray(m.location_src_id) ? m.location_src_id[0] : null
      const st = stockParLieu[lieu + ':' + x.product_id[0]]
      const dispo = st ? convertir(st.qty, st.unite, uniteLigne) : 0
      const comparable = dispo !== null                       // unités incompatibles → on n'affirme rien
      return {
        produit: nomP, besoin: x.product_uom_qty, unite: uniteLigne,
        dispo: comparable ? Math.round(dispo * 100) / 100 : null, ignore,
        manque: (ignore || !comparable) ? 0 : Math.max(0, x.product_uom_qty - dispo),
      }
    })
    return {
      name: m.name, produit: (Array.isArray(m.product_id) ? m.product_id[1] : ''),
      qty: m.product_qty, unite: (Array.isArray(m.product_uom_id) ? m.product_uom_id[1] : 'u'),
      etat: m.state, pour: m.origin || '', dispo: m.components_availability || '',
      lieu: Array.isArray(m.location_src_id) ? m.location_src_id[1] : '',
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

  const mos = await odooSearchRead(uid, 'mrp.production', [
    ['state', 'in', ['confirmed', 'progress', 'to_close']],   // pas les brouillons
    ['product_id.name', 'ilike', 'CD*'],
    ['date_planned_start', '>=', iso(jRetard)],
    ['date_planned_start', '<=', iso(j1)],
  ], ['id', 'name', 'origin', 'state', 'product_id', 'product_qty', 'product_uom_id',
      'date_planned_start', 'components_availability', 'location_src_id'],
  { limit: 500, order: 'date_planned_start asc' })

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
    ['raw_material_production_id', 'product_id', 'product_uom_qty', 'product_uom'], { limit: 1000 }) : []
  const aFabriquer = new Set(mos.map(m => nom(m)))
  const recettes = {}
  for (const mv of moves) {
    const moId = Array.isArray(mv.raw_material_production_id) ? mv.raw_material_production_id[0] : mv.raw_material_production_id
    let q = mv.product_uom_qty || 0
    let u = (Array.isArray(mv.product_uom) ? mv.product_uom[1] : '') || 'u'
    if (/^g$/i.test(u) && q >= 1000) { q = q / 1000; u = 'kg' }
    if (/unit/i.test(u)) u = 'u'
    const p = (Array.isArray(mv.product_id) ? mv.product_id[1] : '') || ''
    ;(recettes[moId] ||= []).push({ produit: p, qty: Math.round(q * 100) / 100, unite: u, aFaire: aFabriquer.has(p) })
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
  const lieuProd = mos.map(m => (Array.isArray(m.location_src_id) ? m.location_src_id[0] : null)).filter(Boolean)[0] || null
  const prods = idsProduits.length
    ? await odooCall(uid, 'product.product', 'read', [idsProduits, ['display_name', 'free_qty', 'uom_id']],
      lieuProd ? { context: { location: lieuProd } } : {})
    : []
  const stockDe = {}
  for (const pr of prods) {
    stockDe[pr.display_name] = {
      qty: pr.free_qty || 0,
      unite: ((Array.isArray(pr.uom_id) ? pr.uom_id[1] : 'u') || 'u').replace(/^units?$/i, 'u'),
    }
  }
  // Compare un besoin au stock. Ne convertit que g ↔ kg (le reste doit correspondre),
  // sinon renvoie null : mieux vaut ne rien affirmer que se tromper de quantité.
  const enStock = (produit, besoin, unite) => {
    const st = stockDe[produit]
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
  const avecStock = l => ({ ...l, stock: enStock(l.produit, l.qty, l.unite) })
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
  const ordres = mos.map(m => ({
    name: m.name, id: m.id, produit: nom(m), qty: m.product_qty, unite: uom(m),
    etat: m.state, dispo: m.components_availability || '',
    pour: origines(m).filter(o => parNom.has(o)).join(', ') || (m.origin || ''),
  }))
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

export default async function handler(req, res) {
  try {
    // création de l'ordre de glaçage (POST), quand l'équipe a fait sa tournée
    if (req.method === 'POST' && (req.query.mode === 'prepa' || req.query.mode === 'glacage')) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const t = Math.max(1, Math.min(50, parseInt(body.tournees) || 0))
      if (!t) return res.status(400).json({ error: 'nombre de tournées invalide' })
      const quoi = String(req.query.quoi || 'glacage')
      const uid = await odooAuth()
      const of = await creerOrdrePrepa(uid, quoi, t, body.colorants)
      console.log(`[${quoi}] ${t} tournée(s) par ${body.actorId || '?'} → ${of.name} (${of.qty} g)`)
      return res.status(200).json(of)
    }

    // validation dans Odoo (POST) : action irréversible, réservée à perm_valider_of côté app
    if (req.method === 'POST' && req.query.mode === 'valider') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const names = (body.ordres || []).filter(Boolean)
      if (!names.length) return res.status(400).json({ error: 'aucun ordre' })
      const uid = await odooAuth()
      const out = []
      for (const n of names) out.push(await validerOrdre(uid, n, body.forcer === true))
      console.log(`[fabrication:valider] par ${body.actorId || '?'} · forcer=${body.forcer === true} · ${out.map(o => o.name + '=' + (o.ok ? 'ok' : o.message)).join(' | ')}`)
      return res.status(200).json({ resultats: out })
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    // Deuxième usage de cette fonction (limite Vercel Hobby = 12 fonctions) :
    // la liste de fabrication CD*, cf. fetchFabrication.
    // recette du glaçage + stock des ingrédients
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
