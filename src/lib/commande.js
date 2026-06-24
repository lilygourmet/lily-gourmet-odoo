// ============================================================
// Prise de commande : lecture du catalogue Odoo (via le webhook serveur,
// les identifiants Odoo ne doivent jamais être côté navigateur).
// ============================================================

let _catalogPromise = null
const CAT_CACHE_KEY = 'lg_catalog_v1'
const catalogDay = () => new Date().toLocaleDateString('en-CA')   // 'AAAA-MM-JJ' (date locale)

/** Catalogue groupé (CD/E/GM/SA/V/Saisonnier). Gardé en mémoire + navigateur
 *  TOUTE LA JOURNÉE (filet : recharge auto 1×/jour) → ré-ouvertures instantanées.
 *  La mise à jour se fait via le bouton « Mettre à jour » (force=true). */
export async function loadOrderCatalog(force = false) {
  if (force) { _catalogPromise = null; try { localStorage.removeItem(CAT_CACHE_KEY) } catch { /* ignore */ } }
  if (!_catalogPromise) {
    // 1) cache navigateur : valable tant qu'on est le même jour (sinon on recharge une fois)
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(CAT_CACHE_KEY) || 'null')
        if (c && Array.isArray(c.data) && c.day === catalogDay()) { _catalogPromise = Promise.resolve(c.data); return _catalogPromise }
      } catch { /* ignore */ }
    }
    // 2) sinon, on télécharge + on met en cache
    _catalogPromise = fetch('/api/wati-webhook?action=order-catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fresh: !!force }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Erreur ${r.status}`)
        const cats = d.cats || []
        try { localStorage.setItem(CAT_CACHE_KEY, JSON.stringify({ day: catalogDay(), data: cats })) } catch { /* quota → tant pis */ }
        return cats
      })
      .catch(e => { _catalogPromise = null; throw e })
  }
  return _catalogPromise
}

async function post(action, body) {
  const res = await fetch('/api/wati-webhook?action=' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d
}

/** Recherche un client Odoo par nom / téléphone. */
export async function searchClients(query) {
  return (await post('order-clients-search', { query })).clients || []
}

/** Recherche libre dans tous les produits Odoo vendables : [{ tmplId, name, image, configurable }]. */
export async function searchOrderProducts(query) {
  return (await post('order-product-search', { query })).products || []
}

/** Crée un client Odoo. Renvoie { id, name, phone }. */
export async function createClient(name, phone) {
  return post('order-create-client', { name, phone })
}

/** Crée un devis (brouillon) Odoo. Renvoie { id, name }. */
export async function createDevis(payload) {
  return post('order-create-devis', payload)
}

/** Crée le devis OCP (lien dédié) : { zone, date, time, items:[{tmplId,kind,size,variantHint,name,qty,free,unit,autre}] }. */
export async function createOcpDevis(payload) {
  return post('order-create-ocp', payload)
}

/** Tailles de plusieurs produits en 1 appel → { tmplId: [{id, size}] }. */
export async function loadOrderSizes(tmplIds) {
  if (!tmplIds || !tmplIds.length) return {}
  const d = await post('order-sizes', { tmplIds })
  return d?.sizes || {}
}

/** Liste des entrepôts Odoo : [{ id, name, code }]. */
export async function loadWarehouses() {
  return (await post('order-warehouses', {})).warehouses || []
}

/** Change l'entrepôt d'une commande/devis existant. */
export async function setOrderWarehouse(orderId, warehouseId) {
  return post('order-set-warehouse', { orderId, warehouseId })
}

/** Liste les articles éditables d'une commande : [{ id, name, qty, price, total }]. */
export async function loadOrderLines(orderId) {
  return (await post('order-line', { op: 'list', orderId })).lines || []
}

/** Ajoute un article à une commande existante (photo optionnelle). */
export async function addOrderLine(orderId, { variantId, qty, price, name, desc, photo }) {
  return post('order-line', { op: 'add', orderId, variantId, qty, price, name, desc, photo })
}

/** Modifie un article : quantité, prix, libellé (thème/âge/message), remise %, photo. */
export async function updateOrderLine(orderId, lineId, { qty, price, name, discount, photo } = {}) {
  return post('order-line', { op: 'update', orderId, lineId, qty, price, name, discount, photo })
}

/** Supprime un article d'une commande. */
export async function deleteOrderLine(orderId, lineId) {
  return post('order-line', { op: 'delete', orderId, lineId })
}

/** Ajoute un warning (⚠️ Attention) dans la description d'un ARTICLE précis. */
export async function addOrderWarning(orderId, lineId, warn) {
  return post('order-line', { op: 'warn', orderId, lineId, warn })
}

/** Retire un warning (⚠️) de la description d'un article (par son index de ligne). */
export async function removeOrderWarning(orderId, lineId, idx) {
  return post('order-line', { op: 'warn-remove', orderId, lineId, idx })
}

/** Change la date + l'heure de retrait/livraison d'une commande (même confirmée). */
export async function updateOrderDate(orderId, deliveryDate, deliveryTime) {
  return post('order-line', { op: 'date', orderId, deliveryDate, deliveryTime })
}

/** Supprime une photo (pièce jointe) d'une commande, par son id Odoo. */
export async function removeOrderPhoto(orderId, attId) {
  return post('order-line', { op: 'photo-remove', orderId, attId })
}

const _productCache = {}
/** Détail d'un produit configurable : { attributes, variants }. Caché par produit. */
export async function loadOrderProduct(tmplId) {
  if (_productCache[tmplId]) return _productCache[tmplId]
  const res = await fetch('/api/wati-webhook?action=order-product', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmplId }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  _productCache[tmplId] = d
  return d
}

// Charge le nombre de CAKE DESIGN (CD-) déjà prévus par créneau horaire d'un jour
// (pour guider le planning). Renvoie { 16: 4, 14: 1, … } (heure Maroc → nb de CD-).
export async function loadCdLoad(date) {
  if (!date) return {}
  try {
    const res = await fetch('/api/wati-webhook?action=cd-load', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    const d = await res.json().catch(() => ({}))
    return d?.counts || {}
  } catch { return {} }
}

// Charge CD- du jour groupée par heure : { byHour: { 12:[{photo,pers,isDevis,orderRef}], ... } }
// Pour le planning « Charge CD » du calendrier (vignettes photo + nb pers).
export async function loadCdDay(date, part) {
  if (!date) return {}
  try {
    const res = await fetch('/api/wati-webhook?action=cd-day', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, part }),
    })
    const d = await res.json().catch(() => ({}))
    return d?.byHour || {}
  } catch { return {} }
}

// Détail des CD- d'un créneau (photo + nb pers) → pour juger si on peut en ajouter.
export async function loadCdSlot(date, hour) {
  if (!date || hour == null) return []
  try {
    const res = await fetch('/api/wati-webhook?action=cd-slot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, hour }),
    })
    const d = await res.json().catch(() => ({}))
    return d?.items || []
  } catch { return [] }
}
