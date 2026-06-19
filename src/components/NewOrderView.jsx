import { useState, useEffect } from 'react'
import { loadOrderCatalog, loadOrderProduct, searchClients, createClient, createDevis, loadWarehouses } from '../lib/commande'
import { loadPrevisions, loadVitrineReserved } from '../lib/previsionsVitrine'
import { confirmDevis, recordDevisTraitement, recordDevisEnvoi, searchOrders } from '../lib/conversations'
import NewConversationModal from './Conversations/NewConversationModal'
import { loadLivreurs, assignDelivery, setLivraisonLocalisation } from '../lib/deliveries'
import { confirmDialog } from '../lib/confirmDialog'
import { toast } from '../lib/toast'
import Skeleton from './Skeleton'

import { ConfiguratorModal, PRICE_EDITABLE } from './ProductConfigurator'
import CakeDayPlanning from './CakeDayPlanning'

// Lit un fichier image en base64 (sans le préfixe data:) pour l'envoyer à Odoo.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function NewOrderView({ user, initialClient = null }) {
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCat, setActiveCat] = useState(null)
  const [cart, setCart] = useState([])          // [{key,name,sub,price,qty,editable,catKey}]
  const [cfg, setCfg] = useState(null)          // produit en cours de configuration
  const [refreshing, setRefreshing] = useState(false)
  // Client + détails commande
  const [client, setClient] = useState(null)    // { id, name, phone }
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTime, setDeliveryTime] = useState('16:00')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [lastCreated, setLastCreated] = useState(null)  // { id, name, phone, clientName, confirmed }
  const [confirming, setConfirming] = useState(false)
  const [waModal, setWaModal] = useState(null)          // { phone, name, order } pour envoyer devis/confirmation
  const [livreurs, setLivreurs] = useState([])
  const [livreurId, setLivreurId] = useState(null)
  const [livraisonLoc, setLivraisonLoc] = useState('')   // adresse / localisation pour le livreur
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')   // '' = entrepôt par défaut Odoo

  useEffect(() => { loadLivreurs().then(setLivreurs).catch(() => {}) }, [])
  useEffect(() => { loadWarehouses().then(setWarehouses).catch(() => {}) }, [])
  const hasLivraison = cart.some(l => /^livraison$/i.test((l.name || '').trim()))
  // Date minimum = aujourd'hui (on n'autorise pas une commande pour un jour passé).
  const today = new Date()
  const minOrderDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Réservation Vitrine : on charge prévu + réservé du jour pour afficher le restant par article.
  const [vitrinePrev, setVitrinePrev] = useState(null)   // { prev: {variantId: qtyPrevue}, reserved: {variantId: qty} } | null
  useEffect(() => {
    if (!warehouseId) { setVitrinePrev(null); return }
    const dayP = deliveryDate || minOrderDate
    let cancelled = false
    Promise.all([loadPrevisions(dayP), loadVitrineReserved(dayP).catch(() => ({}))])
      .then(([rows, reserved]) => {
        if (cancelled) return
        const prev = {}
        for (const r of rows) prev[r.variant_id] = Number(r.qty_prevue) || 0
        setVitrinePrev({ prev, reserved })
      })
      .catch(() => { if (!cancelled) setVitrinePrev(null) })
    return () => { cancelled = true }
  }, [warehouseId, deliveryDate])

  // Ouvre l'envoi WhatsApp (template devis ou confirmation) avec la commande pré-sélectionnée.
  async function openWaSend(forConfirmation) {
    if (!lastCreated?.name) return
    try {
      const orders = await searchOrders(lastCreated.name)
      const order = (orders || []).find(o => o.name === lastCreated.name) || orders?.[0]
      if (!order) { toast.error('Commande introuvable pour l\'envoi.'); return }
      if (forConfirmation) order.state = 'sale'  // force le template de confirmation
      setWaModal({ phone: lastCreated.phone, name: lastCreated.clientName || order.clientName || '', order })
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function confirmOrder() {
    if (!lastCreated?.id) return
    setConfirming(true)
    try {
      await confirmDevis(lastCreated.id, user?.id)
      recordDevisTraitement({ order_num: lastCreated.name, action: 'confirme', user_id: user?.id, user_name: user?.full_name || user?.username }).catch(() => {})
      toast.success('Commande confirmée ✓')
      setLastCreated(prev => prev ? { ...prev, confirmed: true } : prev)
      if (lastCreated.phone && await confirmDialog('Envoyer le message de confirmation au client sur WhatsApp ?', { confirmLabel: 'Envoyer' })) {
        openWaSend(true)
      }
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setConfirming(false) }
  }
  // Modal « Nouveau client »
  const [ncOpen, setNcOpen] = useState(false)
  const [ncPrenom, setNcPrenom] = useState('')
  const [ncNom, setNcNom] = useState('')
  const [ncPhone, setNcPhone] = useState('')
  const [ncBusy, setNcBusy] = useState(false)

  function openNewClient() {
    setNcPrenom(clientQuery.trim()); setNcNom(''); setNcPhone(''); setNcOpen(true)
  }
  async function saveNewClient() {
    if (!ncPrenom.trim()) { toast.error('Le prénom est obligatoire.'); return }
    if (!ncNom.trim()) { toast.error('Le nom de famille est obligatoire.'); return }
    if (!ncPhone.trim()) { toast.error('Le numéro de téléphone est obligatoire.'); return }
    setNcBusy(true)
    try {
      const fullName = `${ncPrenom.trim()} ${ncNom.trim()}`.trim()
      const c = await createClient(fullName, ncPhone.trim())
      setClient({ id: c.id, name: c.name, phone: c.phone })
      setClientQuery(c.name); setClientResults([]); setNcOpen(false)
      if (c.existing) toast.info(`Ce numéro est déjà attribué à ${c.name} — client sélectionné (pas de doublon créé).`)
      else toast.success('Client créé ✓')
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setNcBusy(false) }
  }

  // Recherche client (temporisée)
  useEffect(() => {
    const q = clientQuery.trim()
    if (q.length < 2 || (client && client.name === q)) { setClientResults([]); return }
    let cancel = false
    const t = setTimeout(() => {
      searchClients(q).then(r => { if (!cancel) setClientResults(r) }).catch(() => {})
    }, 300)
    return () => { cancel = true; clearTimeout(t) }
  }, [clientQuery, client])

  // Pré-remplissage depuis une conversation WhatsApp (nom + téléphone). Une seule fois.
  const [initClientDone, setInitClientDone] = useState(false)
  useEffect(() => {
    if (initClientDone || !initialClient) return
    const phone = (initialClient.phone || '').trim()
    const name = (initialClient.name || '').trim()
    if (!phone && !name) return
    setInitClientDone(true)
    const last9 = s => String(s || '').replace(/\D/g, '').slice(-9)
    if (phone) {
      searchClients(phone).then(res => {
        const match = (res || []).find(c => last9(c.phone || c.mobile) === last9(phone))
        if (match) {
          setClient({ id: match.id, name: match.name, phone: match.phone || match.mobile })
          setClientQuery(match.name)
          toast.success(`Client trouvé : ${match.name}`)
        } else {
          // Pas dans Odoo → on pré-remplit la création du client (à confirmer).
          const parts = name.split(/\s+/)
          setNcPrenom(parts[0] || name); setNcNom(parts.slice(1).join(' ')); setNcPhone(phone); setNcOpen(true)
        }
      }).catch(() => {
        const parts = name.split(/\s+/)
        setNcPrenom(parts[0] || name); setNcNom(parts.slice(1).join(' ')); setNcPhone(phone); setNcOpen(true)
      })
    } else {
      setClientQuery(name)
    }
  }, [initialClient, initClientDone])

  async function handleCreate() {
    if (!client) { toast.error('Choisis ou crée un client d\'abord.'); return }
    if ((client.name || '').trim().split(/\s+/).filter(Boolean).length < 2) {
      toast.error('Le client doit avoir un nom ET un prénom (2 mots). Corrige sa fiche ou crée un client complet.')
      return
    }
    if (cart.length === 0) return
    if (hasLivraison && !livreurId) { toast.error('Assigne un livreur avant de créer (ligne Livraison).'); return }
    if (!deliveryDate) { toast.error('La date de retrait/livraison est obligatoire (sinon la commande n\'apparaît pas au calendrier).'); return }
    if (deliveryDate < minOrderDate) { toast.error('La date de retrait/livraison ne peut pas être dans le passé.'); return }
    const missing = cart.find(l => !l.variantId)
    if (missing) { toast.error('Ligne sans produit Odoo : ' + missing.name); return }
    setCreating(true)
    try {
      // Lignes structurées (description aérée + warning + photo base64)
      const lines = await Promise.all(cart.map(async l => {
        const base = { variantId: l.variantId, qty: l.qty, price: l.price, discount: Number(l.discount) || 0, name: l.name, desc: l.desc || '', warn: l.warn || '' }
        if (l.photoFile) {
          const data = await fileToBase64(l.photoFile)
          base.photo = { name: l.photoName || l.photoFile.name, data, mimetype: l.photoFile.type || 'image/jpeg' }
        }
        return base
      }))
      const r = await createDevis({
        partnerId: client.id,
        deliveryDate: deliveryDate || null, deliveryTime,
        note: note.trim() || null,
        warehouseId: warehouseId ? Number(warehouseId) : null,
        lines,
      })
      recordDevisTraitement({ order_num: r.name, action: 'created', user_id: user?.id, user_name: user?.full_name || user?.username }).catch(() => {})
      // Assignation livreur si une ligne « Livraison » est présente et un livreur choisi
      if (hasLivraison && livreurId) {
        assignDelivery({ orderNum: r.name, livreurId, byUserId: user?.id, titre: `🚚 Livraison ${r.name}`, description: client.name || '', dueDate: deliveryDate || null }).catch(() => {})
      }
      // Adresse / localisation pour le livreur (champ dédié, table livraisons)
      if (hasLivraison && livraisonLoc.trim()) {
        setLivraisonLocalisation(r.name, livraisonLoc.trim()).catch(() => {})
      }
      toast.success(`Devis ${r.name || ''} créé en brouillon ✓`)
      setLastCreated({ id: r.id, name: r.name, phone: client.phone || '', clientName: client.name, confirmed: false })
      setCart([]); setNote(''); setClient(null); setClientQuery(''); setLivreurId(null); setWarehouseId(''); setLivraisonLoc('')
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setCreating(false) }
  }

  function refresh() {
    setRefreshing(true)
    loadOrderCatalog(true)
      .then(c => { setCats(c); if (!c.find(x => x.key === activeCat)) setActiveCat(c[0]?.key || null) })
      .catch(e => toast.error('Erreur : ' + e.message))
      .finally(() => setRefreshing(false))
  }

  useEffect(() => {
    loadOrderCatalog()
      .then(c => { setCats(c); setActiveCat(c[0]?.key || null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const cat = cats.find(c => c.key === activeCat)
  const total = cart.reduce((s, it) => s + it.price * it.qty * (1 - (Number(it.discount) || 0) / 100), 0)

  function addLine(line) {
    setCart(prev => {
      // regroupe si identique (même nom+sub+prix)
      const i = prev.findIndex(x => x.name === line.name && x.sub === line.sub && x.price === line.price)
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n }
      return [...prev, { ...line, key: Date.now() + '' + Math.random(), qty: 1 }]
    })
  }
  function setQty(key, d) {
    setCart(prev => prev.flatMap(x => x.key === key ? (x.qty + d <= 0 ? [] : [{ ...x, qty: x.qty + d }]) : [x]))
  }
  function setPrice(key, v) {
    setCart(prev => prev.map(x => x.key === key ? { ...x, price: Number(v) || 0 } : x))
  }
  function setDiscount(key, v) {
    setCart(prev => prev.map(x => x.key === key ? { ...x, discount: Math.min(100, Math.max(0, Number(v) || 0)) } : x))
  }
  function removeLine(key) { setCart(prev => prev.filter(x => x.key !== key)) }

  function onTileClick(item) {
    if (!item.configurable) {
      let name = item.name
      // « Autre » : on saisit ce que c'est (description = nom de la ligne).
      if (activeCat === 'divers' && /^autre$/i.test(item.name)) {
        const d = window.prompt('Décris l\'article « Autre » (ce que c\'est) :', '')
        if (d === null) return
        name = d.trim() || 'Autre'
      }
      addLine({ name, sub: '', price: item.price ?? 0, editable: PRICE_EDITABLE.has(activeCat), catKey: activeCat, variantId: item.variantId })
      return
    }
    setCfg({ item, catKey: activeCat, loading: true, attributes: [], variants: [], sel: {}, text: {}, warn: '', photo: '' })
    loadOrderProduct(item.tmplId)
      .then(d => setCfg(c => c && c.item.tmplId === item.tmplId ? { ...c, loading: false, attributes: d.attributes, variants: d.variants } : c))
      .catch(e => { toast.error('Erreur : ' + e.message); setCfg(null) })
  }

  return (
    <div className="md:flex md:items-start min-h-[calc(100dvh-60px)]">
      {/* Colonne articles */}
      <div className="md:flex-1 md:min-w-0 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="font-fraunces italic text-[26px] text-ink">Nouvelle commande</h1>
          <button onClick={refresh} disabled={refreshing}
            title="Resynchroniser le catalogue depuis Odoo (articles ajoutés / retirés / prix)"
            className="px-3 py-1.5 border border-line text-ink-soft rounded-full text-[12px] font-medium hover:border-bordeaux transition-all disabled:opacity-50">
            🔄 {refreshing ? 'Synchro…' : 'Actualiser'}
          </button>
        </div>

        {loading && <Skeleton rows={4} />}
        {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}

        {!loading && !error && (
          <>
            <div className="flex gap-1.5 flex-wrap mb-4">
              {cats.map(c => (
                <button key={c.key} onClick={() => setActiveCat(c.key)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${activeCat === c.key ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-cream-warm text-ink-soft border-line hover:border-bordeaux'}`}>
                  {c.label} <span className="opacity-60">({c.items.length})</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {(cat?.items || []).map(item => (
                <button key={item.tmplId} onClick={() => onTileClick(item)}
                  className={`text-center rounded-xl border p-2 bg-cream-warm hover:border-bordeaux hover:-translate-y-px transition-all shadow-sm ${item.configurable ? 'border-dashed border-bordeaux/50' : 'border-line'}`}>
                  {item.image
                    ? <img src={item.image} alt="" loading="lazy" className="w-full aspect-square object-cover rounded-lg mb-1.5" />
                    : <div className="w-full aspect-square rounded-lg bg-cream mb-1.5 flex items-center justify-center text-ink-mute text-[11px]">Pas de photo</div>}
                  <div className="text-[13px] font-semibold text-ink leading-tight">{item.name}</div>
                  <div className="text-[13px] font-bold text-bordeaux mt-1">
                    {item.configurable ? 'configurer' : `${item.price ?? '—'} DH`}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Panier */}
      <div className="md:w-[360px] md:flex-shrink-0 md:border-l border-line bg-cream-warm p-4 md:sticky md:top-0 md:h-[calc(100dvh-60px)] md:overflow-y-auto">
        <h2 className="font-fraunces italic text-[20px] text-ink mb-2">🛒 Panier</h2>

        {/* Client */}
        <div className="mb-3 relative">
          <div className="text-[11px] font-semibold text-ink-soft mb-1">Client</div>
          {client ? (
            <div className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-2">
              <span className="flex-1 text-[13px] font-medium text-ink truncate">{client.name}{client.phone ? ` · ${client.phone}` : ''}</span>
              <button onClick={() => { setClient(null); setClientQuery('') }} className="text-ink-mute text-[13px]" title="Changer">✕</button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5">
                <input value={clientQuery} onChange={e => setClientQuery(e.target.value)}
                  placeholder="🔍 nom ou téléphone…"
                  className="flex-1 px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                <button onClick={openNewClient} className="px-2.5 py-2 border border-bordeaux text-bordeaux rounded-lg text-[12px] font-medium whitespace-nowrap">+ Nouveau</button>
              </div>
              {clientResults.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg max-h-48 overflow-auto">
                  {clientResults.map(c => (
                    <button key={c.id} onClick={() => { setClient({ id: c.id, name: c.name, phone: c.phone || c.mobile }); setClientResults([]); setClientQuery(c.name) }}
                      className="w-full text-left px-3 py-2 hover:bg-cream-warm text-[13px] border-b border-line/50 last:border-0">
                      <span className="font-medium text-ink">{c.name}</span>
                      {(c.phone || c.mobile) && <span className="text-ink-mute"> · {c.phone || c.mobile}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="text-center text-ink-mute italic text-[13px] py-6">Panier vide — choisis un article.</div>
        ) : (
          <div className="space-y-1">
            {cart.map(it => (
              <div key={it.key} className="flex items-start gap-2 py-2 border-b border-line">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{it.name}</div>
                  {it.sub && <div className="text-[11px] text-ink-mute leading-snug">{it.sub}</div>}
                  {vitrinePrev && it.variantId != null && vitrinePrev.prev[it.variantId] != null && (() => {
                    const restant = vitrinePrev.prev[it.variantId] - Number(vitrinePrev.reserved[it.variantId] || 0)
                    return <div className={`text-[11px] font-semibold ${restant <= 0 ? 'text-[#A32D2D]' : restant <= 2 ? 'text-amber-700' : 'text-emerald-700'}`}>Vitrine : reste {restant}{restant <= 0 ? ' ⚠️' : ''}</div>
                  })()}
                  <div className="flex items-center gap-1.5 mt-1">
                    {it.editable ? (
                      <input type="number" value={it.price} onChange={e => setPrice(it.key, e.target.value)}
                        className="w-16 px-1.5 py-0.5 border border-line rounded text-[12px] text-right" />
                    ) : (
                      <span className="text-[12px] text-ink-soft">{it.price} DH</span>
                    )}
                    <span className="text-[11px] text-ink-mute">DH</span>
                    <button onClick={() => setQty(it.key, -1)} className="w-6 h-6 rounded border border-line text-bordeaux">−</button>
                    <span className="w-5 text-center text-[13px] font-semibold">{it.qty}</span>
                    <button onClick={() => setQty(it.key, 1)} className="w-6 h-6 rounded border border-line text-bordeaux">+</button>
                    <span className="text-[11px] text-ink-mute ml-2">remise</span>
                    <input type="number" min="0" max="100" value={it.discount || 0} onChange={e => setDiscount(it.key, e.target.value)}
                      className="w-12 px-1.5 py-0.5 border border-line rounded text-[12px] text-right" />
                    <span className="text-[11px] text-ink-mute">%</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold">{Math.round(it.price * it.qty * (1 - (Number(it.discount) || 0) / 100))} DH</div>
                  {Number(it.discount) > 0 && <div className="text-[10px] text-ink-mute line-through">{it.price * it.qty} DH</div>}
                  <button onClick={() => removeLine(it.key)} className="text-[#A32D2D] text-[13px]">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasLivraison && (
          <div className="mt-3 p-2.5 rounded-lg bg-bordeaux/5 border border-bordeaux/20">
            <div className="text-[11px] font-semibold text-ink-soft mb-1.5">🚚 Assigner le livreur</div>
            <div className="flex gap-1.5 flex-wrap">
              {livreurs.length === 0 && <span className="text-[11px] text-ink-mute italic">Aucun livreur trouvé.</span>}
              {livreurs.map(l => (
                <button key={l.id} onClick={() => setLivreurId(livreurId === l.id ? null : l.id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${livreurId === l.id ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line hover:border-bordeaux'}`}>
                  {l.full_name || l.username}
                </button>
              ))}
            </div>
            <div className="mt-2.5">
              <div className="text-[11px] font-semibold text-ink-soft mb-1">📍 Adresse / localisation (pour le livreur)</div>
              <textarea value={livraisonLoc} onChange={e => setLivraisonLoc(e.target.value)} rows={2}
                placeholder="Adresse écrite, lien Google Maps / WhatsApp, ou coordonnées GPS…"
                className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
            </div>
          </div>
        )}

        {/* Entrepôt : seulement « Réservation Vitrine » + défaut Odoo */}
        {warehouses.filter(w => /vitrine/i.test(w.name)).length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold text-ink-soft mb-1">Entrepôt</div>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
              className="w-full px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white">
              <option value="">Entrepôt par défaut</option>
              {warehouses.filter(w => /vitrine/i.test(w.name)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        {/* Date de retrait/livraison + note */}
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-ink-soft mb-1">Retrait / livraison <span className="text-bordeaux">*</span> (obligatoire)</div>
          <div className="flex gap-1.5">
            <input type="date" value={deliveryDate} min={minOrderDate} onChange={e => setDeliveryDate(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white" />
            <input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)}
              className="px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white" />
          </div>
          {/* Planning cake design du jour : guide le commercial à répartir (pas tout à 16h). */}
          {deliveryDate && cart.some(c => /^CD-/i.test((c.name || '').trim())) && (
            <CakeDayPlanning date={deliveryDate} selectedHour={parseInt(deliveryTime, 10)}
              onPick={h => setDeliveryTime(`${String(h).padStart(2, '0')}:00`)} />
          )}
        </div>
        <div className="mt-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Note générale (précisions livraison…)"
            className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
        </div>

        <div className="flex justify-between items-center mt-3 pt-3 border-t-2 border-line text-[18px]">
          <span>Total</span><b className="text-bordeaux">{total} DH</b>
        </div>
        <button
          onClick={handleCreate}
          disabled={cart.length === 0 || !client || creating || !deliveryDate || (hasLivraison && !livreurId)}
          className="mt-3 w-full py-3 bg-bordeaux text-cream rounded-full text-[14px] font-medium disabled:opacity-50">
          {creating ? 'Création…' : 'Créer le devis (brouillon Odoo)'}
        </button>
        {!client && cart.length > 0 && <div className="text-[11px] text-bordeaux text-center mt-2">Choisis un client pour créer le devis.</div>}
        {hasLivraison && !livreurId && cart.length > 0 && <div className="text-[11px] text-bordeaux text-center mt-2">Assigne un livreur (ligne Livraison) avant de créer.</div>}
        {!deliveryDate && cart.length > 0 && <div className="text-[11px] text-bordeaux text-center mt-2">Choisis une date de retrait/livraison (obligatoire).</div>}
        <div className="text-[11px] text-ink-mute text-center mt-1">Le devis est créé en brouillon dans Odoo (tu le confirmes/envoies comme d'habitude).</div>

        {lastCreated && (
          <div className="mt-3 p-3 rounded-xl bg-bordeaux/5 border border-bordeaux/30 text-center space-y-2">
            <div className="text-[12px] text-ink">Devis <b>{lastCreated.name}</b> créé ✓{lastCreated.confirmed ? ' · confirmé' : ''}</div>
            {lastCreated.phone ? (
              <button
                onClick={() => openWaSend(false)}
                className="w-full py-2.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-full text-[13px] font-medium">
                📱 Envoyer le devis sur WhatsApp
              </button>
            ) : (
              <div className="text-[11px] text-ink-mute">Ce client n'a pas de numéro — ajoute-le dans Odoo pour pouvoir le contacter.</div>
            )}
            {!lastCreated.confirmed && (
              <button onClick={confirmOrder} disabled={confirming}
                className="w-full py-2.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[13px] font-medium disabled:opacity-50">
                {confirming ? 'Confirmation…' : '✅ Confirmer la commande'}
              </button>
            )}
          </div>
        )}
      </div>

      {cfg && (
        <ConfiguratorModal
          cfg={cfg}
          onChange={setCfg}
          onClose={() => setCfg(null)}
          onAdd={(line) => { addLine(line); setCfg(null) }}
          priceEditable={PRICE_EDITABLE.has(activeCat)}
        />
      )}

      {waModal && (
        <NewConversationModal
          user={user}
          initialPhone={waModal.phone}
          initialName={waModal.name}
          initialOrder={waModal.order}
          onClose={() => setWaModal(null)}
          onSent={() => { recordDevisEnvoi(waModal.order?.name, waModal.phone, user?.id).catch(() => {}); setWaModal(null) }}
        />
      )}

      {ncOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50" onClick={() => !ncBusy && setNcOpen(false)}>
          <div className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-3">Nouveau client</h3>
            <label className="block text-[11px] font-semibold text-ink-soft mb-1">Prénom</label>
            <input value={ncPrenom} onChange={e => setNcPrenom(e.target.value)} autoFocus
              className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-3" />
            <label className="block text-[11px] font-semibold text-ink-soft mb-1">Nom de famille</label>
            <input value={ncNom} onChange={e => setNcNom(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-3" />
            <label className="block text-[11px] font-semibold text-ink-soft mb-1">Téléphone <span className="text-bordeaux">*</span> (obligatoire)</label>
            <input value={ncPhone} onChange={e => setNcPhone(e.target.value)} type="tel" placeholder="ex : 0612345678"
              className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNcOpen(false)} disabled={ncBusy} className="px-3 py-2 text-[12px] border border-line rounded-lg text-ink-soft">Annuler</button>
              <button onClick={saveNewClient} disabled={ncBusy} className="px-4 py-2 text-[12px] font-medium bg-bordeaux text-cream rounded-lg disabled:opacity-50">{ncBusy ? '…' : 'Créer le client'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
