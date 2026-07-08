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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
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
