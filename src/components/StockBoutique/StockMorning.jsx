// src/components/StockBoutique/StockMorning.jsx
// Écran MATIN — Pâtissier (Hamza)
// 1. Décide quoi faire des restes d'hier (Garde / Casse)
// 2. Envoie sa production fraîche au café (validation incrémentale par article)
// =============================================================

import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import ProductGrid from './ProductGrid'
import {
  getOrCreateStockDay,
  loadDayItems,
  loadYesterdayLeftovers,
  applyLeftoverDecisions,
  sendMorningItem,
  todayISO,
} from '../../lib/stockBoutique'

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

  // Chargement initial
  useEffect(() => {
    let mounted = true
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
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [])

  // Articles déjà envoyés (visibles dans la zone "Envoyés ce matin")
  const sentItems = useMemo(() => {
    return todayItems.filter(it => it.source === 'morning').sort((a, b) => {
      return new Date(b.announced_at || b.created_at) - new Date(a.announced_at || a.created_at)
    })
  }, [todayItems])

  const undecidedLeftovers = leftovers.filter(l => !decisions[l.id])
  const allDecisionsMade = leftovers.length === 0 || undecidedLeftovers.length === 0
  const totalNewToSend = Object.values(cart).reduce((s, v) => s + (v?.qty || 0), 0)

  function setDecision(leftoverId, decision) {
    setDecisions(d => ({ ...d, [leftoverId]: decision }))
  }

  async function handleApplyLeftovers() {
    if (!stockDay) return
    const list = leftovers.map(l => ({
      leftoverItem: l,
      decision: decisions[l.id] || 'keep',
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
      alert('Erreur : ' + (e.message || e))
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
          <div className="text-[11px] opacity-80">☀️ Pâtissier</div>
        </div>

        {loading ? (
          <div className="bg-white border border-line rounded-b-lg p-12 text-center text-ink-mute text-[12px]">
            Chargement...
          </div>
        ) : (
          <>
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
                    {allDecisionsMade ? '✓ Tout décidé' : `${undecidedLeftovers.length} à décider`}
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {leftovers.map(l => {
                    const dec = decisions[l.id]
                    const nextLabel = NEXT_FRESHNESS_LABEL[l.freshness]
                    return (
                      <div
                        key={l.id}
                        className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center p-2.5 border rounded-md ${
                          dec === 'keep' ? 'bg-green-50 border-green-500' :
                          dec === 'loss' ? 'bg-red-50 border-red-500' :
                          'bg-white border-line'
                        }`}
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
                          onClick={() => setDecision(l.id, 'keep')}
                          className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors flex items-center gap-1 ${
                            dec === 'keep'
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-white border-line hover:bg-green-50 hover:border-green-500'
                          }`}
                        >
                          ↓ Garde ({nextLabel})
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
                          🗑 Casse
                        </button>
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
                    {sending ? 'Application...' : `Appliquer décisions (${leftovers.length})`}
                  </button>
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
                  Combien d'articles frais tu apportes en vitrine ? Tu peux envoyer plusieurs fois dans la matinée.
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

