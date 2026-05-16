// src/components/StockBoutique/StockMorning.jsx
// Écran MATIN — Pâtissier (Hamza)
// 1. Décide quoi faire des restes d'hier (Garde / Casse)
// 2. Envoie sa production fraîche au café (validation incrémentale par article)
// =============================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import AppHeader from '../AppHeader'
import ProductGrid from './ProductGrid'
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

const FRESHNESS_LABELS = {
  fresh: 'Frais',
  yesterday: 'Hier (J+1)',
  twodays: '2 jours (J+2)',
}

// ============================================================
// Filtre "Restes d'hier" : on n'affiche QUE certaines catégories
// - E-       : tous
// - V- Cake  : seulement les viennoiseries dont le nom contient "Cake"
// - MI-      : tous
// - GS-      : seulement "Cookies" ou "Plateau"
// Le reste (RA-, H-, N-, SU-, autres V-, autres GS-) est masqué.
// ============================================================
function shouldShowInLeftovers(productName) {
  if (!productName) return false
  // Retire un code Odoo [123] éventuel en tête
  const n = String(productName).replace(/^\[\d+\]\s*/, '').trim()

  if (/^E-/i.test(n)) return true
  if (/^MI-/i.test(n)) return true
  if (/^V-\s*Cake\b/i.test(n)) return true
  if (/^GS-\s*(Cookies?|Plateau)\b/i.test(n)) return true
  return false
}

// Combine plusieurs leftovers identiques (même nom + même fraîcheur) en une
// seule ligne affichée, en gardant la liste des IDs Supabase pour pouvoir
// appliquer la décision aux items originaux.
function groupLeftovers(leftovers) {
  const groups = new Map()
  for (const l of leftovers) {
    const key = `${(l.product_name || '').trim()}|${l.freshness || ''}`
    if (!groups.has(key)) {
      groups.set(key, {
        id: key, // clé utilisée pour `decisions` (au lieu d'un UUID Supabase)
        product_name: l.product_name,
        freshness: l.freshness,
        qty_counted: 0,
        items: [], // leftovers Supabase originaux
      })
    }
    const g = groups.get(key)
    g.qty_counted += Number(l.qty_counted) || 0
    g.items.push(l)
  }
  return Array.from(groups.values())
}

const NEXT_FRESHNESS_LABEL = {
  fresh: 'devient Hier',
  yesterday: 'devient 2 jours',
  twodays: 'devient Casse',
}

export default function StockMorning({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [leftovers, setLeftovers] = useState([])
  const [todayItems, setTodayItems] = useState([])
  const [decisions, setDecisions] = useState({}) // { leftoverId: 'keep'|'loss' }
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
        // Filtre : ne garder que E-, V- Cake, MI-, GS- Cookies/Plateau
        // Puis regroupe les doublons (même nom + même fraîcheur)
        const filtered = (leftov || []).filter(l => shouldShowInLeftovers(l.product_name))
        setLeftovers(groupLeftovers(filtered))
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
      alert('Erreur : ' + (e.message || e))
    }
  }

  // Hamza demande recompte
  async function handleRequestRecount(itemId, message) {
    try {
      const updated = await patissierRequestRecount(itemId, message, user.id)
      setTodayItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  // Articles déjà envoyés (visibles dans la zone "Envoyés ce matin")
  const sentItems = useMemo(() => {
    return todayItems.filter(it => it.source === 'morning').sort((a, b) => {
      return new Date(b.announced_at || b.created_at) - new Date(a.announced_at || a.created_at)
    })
  }, [todayItems])

  const undecidedLeftovers = leftovers
  const allDecisionsMade = leftovers.length === 0
  const totalNewToSend = Object.values(cart).reduce((s, v) => s + (v?.qty || 0), 0)

  // Décision immédiate : envoie keep/loss à Supabase pour TOUS les items
  // Supabase du groupe (mêmes nom + fraîcheur), puis retire le groupe de la liste.
  async function handleDecideLeftover(group, decision) {
    if (!stockDay || !group) return
    // Marquer "en cours" pour empêcher double-clic (via decisions transient)
    if (decisions[group.id]) return
    setDecisions(d => ({ ...d, [group.id]: decision }))
    try {
      const list = (group.items || []).map(originalItem => ({
        leftoverItem: originalItem,
        decision,
      }))
      await applyLeftoverDecisions(stockDay.id, list, user.id)
      // Retire le groupe de l'affichage
      setLeftovers(prev => prev.filter(g => g.id !== group.id))
      // Reload todayItems pour récupérer les lignes 'leftover' créées
      const items = await loadDayItems(stockDay.id)
      setTodayItems(items)
      setLeftoversApplied(true)
    } catch (e) {
      console.error('[handleDecideLeftover]', e)
      alert('Erreur : ' + (e.message || e))
      // Rollback du flag transient pour réessayer
      setDecisions(d => {
        const next = { ...d }
        delete next[group.id]
        return next
      })
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
      alert('Erreur envoi : ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-lg flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              Livraison du matin
            </div>
            <div className="font-semibold text-[14px] italic">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — {user.full_name || user.username}
            </div>
          </div>
          <div className="flex items-center gap-2"><PrintButton mode="vitrine" /><div className="text-[11px] opacity-80">☀️ Pâtissier</div></div>
        </div>

        {loading ? (
          <div className="bg-white border border-line rounded-b-lg p-12 text-center text-ink-mute text-[12px]">
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
            {leftovers.length > 0 && !leftoversApplied && (
              <div className="bg-white border border-line rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                  <div>
                    <div className="text-[14px] font-semibold">🔄 Restes d'hier — que faire ?</div>
                    <div className="text-[11px] text-ink-mute mt-0.5">
                      Hier soir il restait ces articles en vitrine. À toi de décider.
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-mute font-mono tracking-wider uppercase">
                    {leftovers.length} à décider
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {leftovers.map(l => {
                    const inFlight = !!decisions[l.id]
                    const nextLabel = NEXT_FRESHNESS_LABEL[l.freshness]
                    return (
                      <div
                        key={l.id}
                        className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center p-2.5 border rounded-md bg-white border-line ${inFlight ? 'opacity-60' : ''}`}
                      >
                        <div>
                          <div className="text-[13px] font-medium">{l.product_name}</div>
                          <div className="text-[11px] text-ink-mute mt-0.5">
                            Restant hier soir : <strong className="text-ink">{l.qty_counted}</strong>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                          l.freshness === 'fresh' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          Hier en {FRESHNESS_LABELS[l.freshness]}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDecideLeftover(l, 'keep')}
                          disabled={inFlight}
                          className="px-3 py-1.5 text-[11px] rounded-md border transition-colors flex items-center gap-1 bg-white border-line hover:bg-green-50 hover:border-green-500 disabled:opacity-50 disabled:cursor-wait"
                        >
                          ↓ Garde ({nextLabel})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecideLeftover(l, 'loss')}
                          disabled={inFlight}
                          className="px-3 py-1.5 text-[11px] rounded-md border transition-colors flex items-center gap-1 bg-white border-line hover:bg-red-50 hover:border-red-500 disabled:opacity-50 disabled:cursor-wait"
                        >
                          🗑 Casse
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {leftovers.length === 0 && (
              <div className="bg-white border border-line rounded-lg p-4 text-center text-[12px] text-ink-mute">
                Pas de restes d'hier en vitrine ce matin.
              </div>
            )}

            {leftoversApplied && leftovers.length > 0 && (
              <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-[12px] text-green-900">
                ✓ Décisions sur restes d'hier appliquées.
              </div>
            )}

            {/* SECTION 2 — NOUVELLE PROD */}
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <div className="text-[14px] font-semibold">➕ Nouvelle production du jour</div>
                <div className="text-[11px] text-ink-mute mt-0.5">
                  Sélectionne les articles à envoyer en vitrine.
                </div>
              </div>

              <div className="p-4">
                <ProductGrid
                  cart={cart}
                  onChange={setCart}
                  basketLabel="Panier livraison (frais)"
                  basketColor="green"
                />
              </div>

              <div className="px-4 py-3 bg-cream-warm border-t border-line flex justify-between items-center">
                <div className="text-[12px] text-ink-mute">
                  {totalNewToSend === 0 ? 'Ajoute des articles dans le panier' : `${totalNewToSend} article${totalNewToSend > 1 ? 's' : ''} prêt${totalNewToSend > 1 ? 's' : ''} à envoyer`}
                </div>
                <button
                  type="button"
                  onClick={handleSendAll}
                  disabled={totalNewToSend === 0 || sending}
                  className="px-4 py-2 bg-bordeaux text-cream rounded-md text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bordeaux-deep"
                >
                  {sending ? 'Envoi...' : '📦 Envoyer au café'}
                </button>
              </div>
            </div>

            {/* SECTION 3 — DÉJÀ ENVOYÉS */}
            {sentItems.length > 0 && (
              <div className="bg-white border border-line rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-line bg-cream-warm">
                  <div className="text-[12px] font-semibold">✅ Déjà envoyés au café aujourd'hui</div>
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
            ⚠️ Écarts à traiter
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
                  {it.product_name} · {it.discrepancy_status === 'unresolved' ? '⚠️ désaccord — audit' :
                                       it.discrepancy_status === 'pending_cafe' ? '⏳ balle au café' :
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


