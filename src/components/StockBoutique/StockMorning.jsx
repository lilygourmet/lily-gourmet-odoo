// src/components/StockBoutique/StockMorning.jsx
// Écran MATIN — Pâtissier (Hamza)
// 1. Décide quoi faire des restes d'hier (Garde / Casse)
// 2. Envoie sa production fraîche au café (validation incrémentale par article)
// =============================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import AppHeader from '../AppHeader'
import ProductGrid, { isSaleProduct } from './ProductGrid'
import PrintButton from './PrintButton'
import {
  getOrCreateStockDay,
  loadDayItems,
  loadYesterdayLeftovers,
  applyLeftoverDecisions,
  sendMorningItem,
  subscribeToDayItems,
  updateItem,
  patissierAcceptCafeQty,
  patissierRequestRecount,
  todayISO,
} from '../../lib/stockBoutique'
import { toast } from '../../lib/toast'

const FRESHNESS_LABELS = {
  fresh: 'Frais',
  yesterday: 'Hier (J+1)',
  twodays: '2 jours (J+2)',
}

const NEXT_FRESHNESS_LABEL = {
  fresh: 'devient Hier',
  yesterday: 'devient 2 jours',
  twodays: 'devient Casse',
}

export default function StockMorning({ user, activeView, onNavigate, onLogout, mode = null }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [leftovers, setLeftovers] = useState([])
  const [todayItems, setTodayItems] = useState([])
  const [decisions, setDecisions] = useState({}) // { leftoverId: 'keep'|'loss'|'partial' }
  const [lossQtys, setLossQtys] = useState({}) // { leftoverId: nombre }
  const [leftoversApplied, setLeftoversApplied] = useState(false)
  const [cart, setCart] = useState({}) // { [productName]: { qty, code } }
  const [sending, setSending] = useState(false)

  // Clé localStorage scopée à la journée + user → panier "à envoyer" persisté
  const cartKey = stockDay ? `stock_morning_cart_${stockDay.day}_${user.id}` : null

  // Au démarrage : récupérer le panier sauvegardé pour cette journée
  useEffect(() => {
    if (!cartKey) return
    try {
      const saved = localStorage.getItem(cartKey)
      if (saved) setCart(JSON.parse(saved))
    } catch {
      // ignore
    }
  }, [cartKey])

  // À chaque modif : persister
  useEffect(() => {
    if (!cartKey) return
    try {
      if (Object.keys(cart).length > 0) {
        localStorage.setItem(cartKey, JSON.stringify(cart))
      } else {
        localStorage.removeItem(cartKey)
      }
    } catch {
      // ignore
    }
  }, [cart, cartKey])

  // Chargement initial + realtime
  useEffect(() => {
    let mounted = true
    let sub = null
    async function init() {
      try {
        const sd = await getOrCreateStockDay(todayISO())
        if (!mounted) return
        setStockDay(sd)

        const [items, leftov] = await Promise.all([
          loadDayItems(sd.id),
          loadYesterdayLeftovers(),
        ])
        if (!mounted) return

        setTodayItems(items)
        setLeftovers(leftov)
        // Détection : si on a déjà des lignes source='leftover' aujourd'hui, c'est déjà appliqué
        setLeftoversApplied(items.some(it => it.source === 'leftover'))

        // Realtime : reception confirme ou note un écart → on le voit en direct
        sub = subscribeToDayItems(sd.id, {
          onInsert: (item) => setTodayItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]),
          onUpdate: (item) => setTodayItems(prev => prev.map(i => i.id === item.id ? item : i)),
          onDelete: (item) => setTodayItems(prev => prev.filter(i => i.id !== item.id)),
        })
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => {
      mounted = false
      if (sub) sub.unsubscribe()
    }
  }, [])

  // Items en attente d'une décision DU PÂTISSIER (workflow étape 3)
  const pendingPatissier = useMemo(() => {
    return todayItems.filter(it =>
      it.source === 'morning' &&
      it.discrepancy_status === 'pending_patissier'
    )
  }, [todayItems])

  // Items déjà résolus (pour affichage barré "✓ Résolu")
  const recentlyResolved = useMemo(() => {
    return todayItems.filter(it =>
      it.source === 'morning' &&
      (it.discrepancy_status === 'resolved' || it.discrepancy_status === 'pending_cafe' || it.discrepancy_status === 'unresolved') &&
      it.received_at // a bien eu un écart à un moment
    )
  }, [todayItems])

  // Hamza accepte la qty du café
  async function handleAcceptCafe(itemId) {
    try {
      const updated = await patissierAcceptCafeQty(itemId, user.id)
      setTodayItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  // Hamza demande recompte
  async function handleRequestRecount(itemId, message) {
    try {
      const updated = await patissierRequestRecount(itemId, message, user.id)
      setTodayItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  // Articles déjà envoyés (visibles dans la zone "Envoyés ce matin")
  // Filtré selon le mode : salé -> uniquement produits salés ; sucré -> uniquement sucrés.
  const sentItems = useMemo(() => {
    return todayItems
      .filter(it => it.source === 'morning')
      .filter(it => {
        if (mode === 'sale') return isSaleProduct(it.product_name)
        if (mode === 'sucre') return !isSaleProduct(it.product_name)
        return true
      })
      .sort((a, b) => new Date(b.announced_at || b.created_at) - new Date(a.announced_at || a.created_at))
  }, [todayItems, mode])

  // Filtre les leftovers selon le mode (sucré / salé)
  const filteredLeftovers = leftovers.filter(l => {
    const name = (l.product_name || '').trim()
    if (mode === 'sale') {
      // Vitrine salé : aucun reste à propager
      return false
    }
    // Vitrine sucré : E-, V-, MI-, et GS- avec "plateau" dans le nom
    if (name.startsWith('E-') || name.startsWith('V-') || name.startsWith('MI-')) return true
    if (name.startsWith('GS-') && name.toLowerCase().includes('plateau')) return true
    return false
  })
  const undecidedLeftovers = filteredLeftovers.filter(l => !decisions[l.id])
  const allDecisionsMade = filteredLeftovers.length === 0 || undecidedLeftovers.length === 0
  const totalNewToSend = Object.values(cart).reduce((s, v) => s + (v?.qty || 0), 0)

  function setDecision(leftoverId, decision) {
    setDecisions(d => ({ ...d, [leftoverId]: decision }))
  }

  function setLossQty(leftoverId, qty) {
    setLossQtys(p => ({ ...p, [leftoverId]: qty }))
  }

  async function handleApplyLeftovers() {
    if (!stockDay) return
    const list = filteredLeftovers.map(l => ({
      leftoverItem: l,
      decision: decisions[l.id] || 'keep',
      lossQty: decisions[l.id] === 'partial' ? (Number(lossQtys[l.id]) || 0) : undefined,
    }))
    try {
      setSending(true)
      await applyLeftoverDecisions(stockDay.id, list, user.id)
      // Reload
      const items = await loadDayItems(stockDay.id)
      setTodayItems(items)
      setLeftoversApplied(true)
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  async function handleSendAll() {
    if (!stockDay) return
    if (totalNewToSend === 0) return
    try {
      setSending(true)
      const entries = Object.entries(cart).filter(([, v]) => (v?.qty || 0) > 0)
      for (const [productName, v] of entries) {
        await sendMorningItem(stockDay.id, productName, v.code || null, v.qty, user.id)
      }
      // Reload + reset cart
      const items = await loadDayItems(stockDay.id)
      setTodayItems(items)
      setCart({})
    } catch (e) {
      console.error(e)
      toast.error('Erreur envoi : ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-2xl flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              {mode === 'sale' ? 'Livraison du matin — Salé' : 'Livraison du matin'}
            </div>
            <div className="font-semibold text-[14px] italic">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — {user.full_name || user.username}
            </div>
          </div>
          <div className="flex items-center gap-2"><PrintButton mode="vitrine" /><div className="text-[11px] opacity-80">Pâtissier</div></div>
        </div>

        {loading ? (
          <div className="bg-white border border-line rounded-b-2xl p-12 text-center text-ink-mute text-[12px] shadow-[0_8px_24px_rgba(122,42,68,0.07)]">
            Chargement...
          </div>
        ) : (
          <>
            {/* MODAL BLOQUANT ÉCARTS — overlay couvre toute la page Vitrine */}
            {pendingPatissier.length > 0 && (
              <DiscrepancyModalPatissier
                items={pendingPatissier}
                resolvedItems={recentlyResolved}
                onAccept={handleAcceptCafe}
                onRequestRecount={handleRequestRecount}
              />
            )}

            {/* SECTION 1 — RESTES D'HIER */}
            {filteredLeftovers.length > 0 && !leftoversApplied && (
              <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-semibold">Restes d'hier — que faire ?</div>
                    <div className="text-[11px] text-ink-mute mt-0.5">
                      Hier soir il restait ces articles en vitrine. À toi de décider.
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-mute font-mono tracking-wider uppercase">
                    {allDecisionsMade ? '✓ Tout décidé' : `${undecidedLeftovers.length} à décider`}
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {filteredLeftovers.map(l => {
                    const dec = decisions[l.id]
                    const nextLabel = NEXT_FRESHNESS_LABEL[l.freshness]
                    const totalQty = l.qty_counted || 0
                    const currentLossQty = Number(lossQtys[l.id]) || 0
                    return (
                      <div
                        key={l.id}
                        className={`p-2.5 border rounded-md ${
                          dec === 'keep' ? 'bg-green-50 border-green-500' :
                          dec === 'loss' ? 'bg-red-50 border-red-500' :
                          dec === 'partial' ? 'bg-amber-50 border-amber-500' :
                          'bg-white border-line'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex-1 min-w-[200px]">
                            <div className="text-[13px] font-medium">{l.product_name}</div>
                            <div className="text-[11px] text-ink-mute mt-0.5">
                              Restant hier soir : <strong className="text-ink">{totalQty}</strong>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                            l.freshness === 'fresh' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            Hier en {FRESHNESS_LABELS[l.freshness]}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDecision(l.id, 'keep')}
                            className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors flex items-center gap-1 ${
                              dec === 'keep'
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-white border-line hover:bg-green-50 hover:border-green-500'
                            }`}
                          >
                            Garde ({nextLabel})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecision(l.id, 'partial')}
                            className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors flex items-center gap-1 ${
                              dec === 'partial'
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white border-line hover:bg-amber-50 hover:border-amber-500'
                            }`}
                          >
                            Partielle
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecision(l.id, 'loss')}
                            className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors flex items-center gap-1 ${
                              dec === 'loss'
                                ? 'bg-red-700 text-white border-red-700'
                                : 'bg-white border-line hover:bg-red-50 hover:border-red-500'
                            }`}
                          >
                            Casse
                          </button>
                        </div>
                        {dec === 'partial' && (
                          <div className="mt-2 flex items-center gap-2 pl-1">
                            <label className="text-[11px] text-ink-mute">Combien cassés ?</label>
                            <input
                              type="number"
                              min="0"
                              max={totalQty}
                              value={currentLossQty || ''}
                              onChange={(e) => setLossQty(l.id, e.target.value)}
                              placeholder="0"
                              className="w-20 px-2 py-1 text-[12px] border border-amber-300 rounded focus:outline-none focus:border-amber-600"
                            />
                            <span className="text-[11px] text-ink-mute">/ {totalQty} (le reste = gardés)</span>
                            {currentLossQty > 0 && currentLossQty <= totalQty && (
                              <span className="text-[11px] text-amber-800 font-medium">
                                {currentLossQty} cassés · {totalQty - currentLossQty} gardés
                              </span>
                            )}
                            {currentLossQty > totalQty && (
                              <span className="text-[11px] text-red-700 font-medium">⚠ Trop !</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="px-4 py-3 bg-cream-warm border-t border-line flex justify-end">
                  <button
                    type="button"
                    onClick={handleApplyLeftovers}
                    disabled={!allDecisionsMade || sending}
                    className="px-4 py-2 bg-bordeaux text-cream rounded-md text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bordeaux-deep"
                  >
                    {sending ? 'Application...' : `Appliquer décisions (${filteredLeftovers.length})`}
                  </button>
                </div>
              </div>
            )}

            {leftovers.length === 0 && (
              <div className="bg-white border border-line rounded-2xl p-4 text-center text-[12px] text-ink-mute shadow-sm">
                Pas de restes d'hier en vitrine ce matin.
              </div>
            )}

            {leftoversApplied && leftovers.length > 0 && (
              <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-[12px] text-green-900">
                ✓ Décisions sur restes d'hier appliquées.
              </div>
            )}

            {/* SECTION 2 — NOUVELLE PROD */}
            <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-line">
                <div className="text-[14px] font-semibold">Nouvelle production du jour</div>
                <div className="text-[11px] text-ink-mute mt-0.5">
                  Combien d'articles frais tu apportes en vitrine ? Tu peux envoyer plusieurs fois dans la matinée.
                </div>
              </div>

              <div className="p-4">
                <ProductGrid
                  cart={cart}
                  onChange={setCart}
                  basketLabel={mode === 'sale' ? 'Panier livraison salé' : 'Panier livraison (frais)'}
                  basketColor="green"
                  mode={mode}
                  headerSlot={
                    <button
                      type="button"
                      onClick={handleSendAll}
                      disabled={totalNewToSend === 0 || sending}
                      className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bordeaux-deep whitespace-nowrap shadow-sm"
                      title={totalNewToSend === 0 ? "Ajoute des articles dans le panier" : `${totalNewToSend} article${totalNewToSend > 1 ? 's' : ''} à envoyer`}
                    >
                      {sending ? 'Envoi...' : 'Envoyer au café'}
                    </button>
                  }
                />
              </div>

              {/* Bande du bas : visible uniquement sur mobile (sur desktop, le bouton est désormais
                  dans la barre d'onglets catégories de ProductGrid via headerSlot). */}
              <div className="px-4 py-3 bg-cream-warm border-t border-line flex justify-between items-center md:hidden">
                <div className="text-[12px] text-ink-mute">
                  {totalNewToSend === 0 ? 'Ajoute des articles dans le panier' : `${totalNewToSend} article${totalNewToSend > 1 ? 's' : ''} prêt${totalNewToSend > 1 ? 's' : ''} à envoyer`}
                </div>
                <button
                  type="button"
                  onClick={handleSendAll}
                  disabled={totalNewToSend === 0 || sending}
                  className="px-4 py-2 bg-bordeaux text-cream rounded-md text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bordeaux-deep"
                >
                  {sending ? 'Envoi...' : 'Envoyer au café'}
                </button>
              </div>
            </div>

            {/* SECTION 3 — DÉJÀ ENVOYÉS */}
            {sentItems.length > 0 && (
              <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-line bg-cream-warm">
                  <div className="text-[12px] font-semibold">Déjà envoyés au café aujourd'hui</div>
                  <div className="text-[10px] text-ink-mute font-mono tracking-wider uppercase mt-0.5">
                    {sentItems.length} ligne{sentItems.length > 1 ? 's' : ''} · {sentItems.reduce((s, i) => s + (i.qty_announced || 0), 0)} article{sentItems.reduce((s, i) => s + (i.qty_announced || 0), 0) > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="divide-y divide-line">
                  {sentItems.map(it => {
                    const time = it.announced_at ? new Date(it.announced_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
                    const statusBadge = it.reception_status === 'confirmed' ? '✓ Reçu OK' :
                                       it.reception_status === 'discrepancy' ? '⚠ Écart noté' :
                                       '⏳ En attente'
                    const statusColor = it.reception_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                       it.reception_status === 'discrepancy' ? 'bg-orange-100 text-orange-800' :
                                       'bg-bordeaux/10 text-bordeaux'
                    return (
                      <div key={it.id} className="px-4 py-2 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="text-[12px] font-medium">{it.product_name}</div>
                          <div className="text-[10px] text-ink-mute font-mono">
                            {time} · annoncé : {it.qty_announced}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${statusColor}`}>
                          {statusBadge}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// =============================================================
// MODAL BLOQUANT — Pâtissier répond aux écarts notés par le café
// =============================================================

function DiscrepancyModalPatissier({ items, resolvedItems, onAccept, onRequestRecount }) {
  // Map: itemId -> message texte saisi pour "recompte stp"
  const [messages, setMessages] = useState({})
  const setMessage = (id, val) => setMessages(m => ({ ...m, [id]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-red-700 text-white px-4 py-3 flex-shrink-0">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-90">
            Écarts à traiter
          </div>
          <div className="font-semibold text-[13px] mt-0.5">
            {items.length} article{items.length > 1 ? 's' : ''} avec écart — résous chacun avant de continuer
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {items.map(it => (
            <div key={it.id} className="px-4 py-3 border-b border-line">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-[12px] font-medium">{it.product_name}</div>
                {it.reception_note && (
                  <div className="text-[10px] text-ink-mute italic">
                    Note café : "{it.reception_note}"
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-ink-mute mb-2">
                <span>Envoyé : <strong className="text-ink">{it.qty_announced}</strong></span>
                <span>·</span>
                <span>Reçu : <strong className="text-red-700">{it.qty_received ?? '?'}</strong></span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onAccept(it.id)}
                  className="flex-1 px-3 py-2 bg-white border border-line rounded-md text-[11px] font-medium hover:bg-cream-warm"
                >
                  Effectivement {it.qty_received} ✓
                </button>
                <button
                  type="button"
                  onClick={() => onRequestRecount(it.id, messages[it.id] || `J'ai recompté, c'est bien ${it.qty_announced}.`)}
                  className="flex-1 px-3 py-2 bg-white border border-bordeaux text-bordeaux rounded-md text-[11px] font-medium hover:bg-bordeaux/5"
                >
                  Effectivement {it.qty_announced} — recompte stp
                </button>
              </div>
            </div>
          ))}

          {/* Items déjà résolus (visuel feedback) */}
          {resolvedItems.length > 0 && (
            <div className="bg-green-50/50 border-t border-green-200">
              <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-green-800 font-semibold">
                ✓ Résolus aujourd'hui
              </div>
              {resolvedItems.map(it => (
                <div key={it.id} className="px-4 py-2 text-[11px] text-ink-mute line-through">
                  {it.product_name} · {it.discrepancy_status === 'unresolved' ? 'désaccord — audit' :
                                       it.discrepancy_status === 'pending_cafe' ? 'balle au café' :
                                       'résolu'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-cream-warm border-t border-line text-center text-[10px] text-ink-mute flex-shrink-0">
          {items.length === 1
            ? 'Réponds à cet écart pour fermer'
            : `Réponds aux ${items.length} écarts restants pour fermer`}
        </div>
      </div>
    </div>
  )
}


