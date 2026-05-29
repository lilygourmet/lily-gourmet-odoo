// src/components/StockBoutique/StockReception.jsx
// Écran RÉCEPTION — Café (toute la journée)
// Reçoit en temps réel les envois du pâtissier, confirme article par article,
// gère les écarts avec note, et permet d'ajouter des articles surprise via catalogue.
// =============================================================

import { useState, useEffect, useRef } from 'react'
import AppHeader from '../AppHeader'
import ProductGrid from './ProductGrid'
import NumpadInline from './NumpadInline'
import PrintButton from './PrintButton'
import {
  getOrCreateStockDay,
  loadDayItems,
  confirmReception,
  noteDiscrepancy,
  addSurpriseReceptionItem,
  subscribeToDayItems,
  cafeAcceptPatissierQty,
  cafeMaintainCount,
  todayISO,
} from '../../lib/stockBoutique'

const DISCREPANCY_REASONS = [
  "La vitrine s'est trompée",
  'Casse en transport',
  'Manque en cuisine',
  'Reste à venir',
]

export default function StockReception({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [items, setItems] = useState([])
  const [editingQtyId, setEditingQtyId] = useState(null)
  const [discrepancyModal, setDiscrepancyModal] = useState(null) // {item, note, customNote}
  const [surpriseModalOpen, setSurpriseModalOpen] = useState(false)
  const [surpriseCart, setSurpriseCart] = useState({})
  const [dotFlash, setDotFlash] = useState(false)
  const subscriptionRef = useRef(null)
  const audioCtxRef = useRef(null)

  // Init + realtime
  useEffect(() => {
    let mounted = true
    let pollingInterval = null

    async function init() {
      try {
        const sd = await getOrCreateStockDay(todayISO())
        if (!mounted) return
        setStockDay(sd)

        const its = await loadDayItems(sd.id)
        if (!mounted) return
        setItems(its)

        // Branche realtime (instantané)
        subscriptionRef.current = subscribeToDayItems(sd.id, {
          onInsert: (newItem) => {
            setItems(prev => {
              if (prev.some(i => i.id === newItem.id)) return prev
              return [newItem, ...prev]
            })
            if (newItem.source === 'morning' && newItem.reception_status === 'pending') {
              playDing()
              flashDot()
            }
          },
          onUpdate: (newItem) => {
            setItems(prev => prev.map(i => i.id === newItem.id ? newItem : i))
          },
          onDelete: (oldItem) => {
            setItems(prev => prev.filter(i => i.id !== oldItem.id))
          },
        })

        // Polling 1 min en sécurité (au cas où realtime décroche)
        pollingInterval = setInterval(async () => {
          if (!mounted) return
          try {
            const fresh = await loadDayItems(sd.id)
            if (!mounted) return
            // Détecter les nouveaux items (notif + son)
            setItems(prev => {
              const prevIds = new Set(prev.map(i => i.id))
              const newOnes = fresh.filter(i =>
                !prevIds.has(i.id) &&
                i.source === 'morning' &&
                i.reception_status === 'pending'
              )
              if (newOnes.length > 0) {
                playDing()
                flashDot()
              }
              return fresh
            })
          } catch (e) {
            console.warn('[polling reception] échec:', e?.message || e)
          }
        }, 60_000) // 1 minute
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()

    return () => {
      mounted = false
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function playDing() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.value = 0.04
      o.connect(g)
      g.connect(ctx.destination)
      o.start()
      setTimeout(() => { o.frequency.value = 1320 }, 80)
      setTimeout(() => { o.stop() }, 180)
    } catch (e) {
      // Silent fail (autoplay restrictions etc.)
    }
  }

  function flashDot() {
    setDotFlash(true)
    setTimeout(() => setDotFlash(false), 600)
  }

  // Filtre : on n'affiche pas les lignes 'leftover' / 'evening' ni 'loss' dans la réception
  const visibleItems = items
    .filter(it => it.source === 'morning' && it.freshness !== 'loss')
    .slice()
    .sort((a, b) => {
      // 1. Pending en haut (réception en attente)
      const aPending = a.reception_status === 'pending' ? 0 : 1
      const bPending = b.reception_status === 'pending' ? 0 : 1
      if (aPending !== bPending) return aPending - bPending
      // 2. Plus récent envoi en haut
      const aTime = new Date(a.announced_at || 0).getTime()
      const bTime = new Date(b.announced_at || 0).getTime()
      return bTime - aTime
    })

  // Stats
  const stats = {
    pending: visibleItems.filter(i => i.reception_status === 'pending').length,
    confirmed: visibleItems.filter(i => i.reception_status === 'confirmed' && i.qty_announced > 0).length,
    discrepancy: visibleItems.filter(i => i.reception_status === 'discrepancy' && i.qty_announced > 0).length,
    surprise: visibleItems.filter(i => i.qty_announced === 0).length, // ajouts manuels par café
  }

  async function handleConfirm(item, qtyOverride = null) {
    try {
      const qty = qtyOverride !== null ? qtyOverride : (item._localQty !== undefined ? item._localQty : item.qty_announced)
      if (qty === item.qty_announced) {
        const updated = await confirmReception(item.id, qty, user.id)
        // Optimistic update : forcer le rafraîchissement même si realtime tarde
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updated, _localQty: undefined } : i))
      } else {
        // Écart : ouvrir la modale
        setDiscrepancyModal({ item: { ...item, qty_received: qty }, note: '', customNote: '' })
      }
      setEditingQtyId(null)
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  function setLocalQty(itemId, newQty) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, _localQty: newQty } : i))
  }

  async function handleSaveDiscrepancy() {
    const m = discrepancyModal
    if (!m) return
    const finalNote = m.customNote.trim() || m.note || 'Écart non précisé'
    try {
      const updated = await noteDiscrepancy(m.item.id, m.item.qty_received, finalNote, user.id)
      // Optimistic update
      setItems(prev => prev.map(i => i.id === m.item.id ? { ...i, ...updated, _localQty: undefined } : i))
      setDiscrepancyModal(null)
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleAddSurprise() {
    const entries = Object.entries(surpriseCart).filter(([, v]) => (v?.qty || 0) > 0)
    if (entries.length === 0 || !stockDay) return
    try {
      for (const [productName, v] of entries) {
        await addSurpriseReceptionItem(stockDay.id, productName, v.code || null, v.qty, user.id)
      }
      setSurpriseModalOpen(false)
      setSurpriseCart({})
    } catch (e) {
      console.error(e)
      alert('Erreur ajout : ' + (e.message || e))
    }
  }

  // Items en attente du café (la vitrine a demandé un recompte)
  const pendingCafe = items.filter(it =>
    it.source === 'morning' && it.discrepancy_status === 'pending_cafe'
  )

  async function handleCafeAccept(itemId) {
    try {
      const updated = await cafeAcceptPatissierQty(itemId, user.id)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleCafeMaintain(itemId) {
    try {
      const updated = await cafeMaintainCount(itemId, user.id)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updated } : i))
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      {/* MODAL BLOQUANT — Café répond après recompte vitrine */}
      {pendingCafe.length > 0 && (
        <DiscrepancyModalCafe
          items={pendingCafe}
          onAccept={handleCafeAccept}
          onMaintain={handleCafeMaintain}
        />
      )}

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* HEADER */}
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-lg flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              Réception du jour
            </div>
            <div className="font-semibold text-[14px] italic">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full transition-colors ${dotFlash ? 'bg-red-500' : 'bg-green-400'}`}
              />
              <span className="opacity-80">En ligne</span>
            </span>
            <span className="opacity-50">|</span>
            <PrintButton mode="reception" />
            <span className="opacity-50">|</span>
            <span className="opacity-80">Équipe café</span>
          </div>
        </div>

        <div className="bg-white border border-line rounded-b-lg p-4">
          {/* Actions bar */}
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => setSurpriseModalOpen(true)}
              className="px-4 py-2 bg-green-700 text-white rounded-md text-[12px] font-medium tracking-wider hover:bg-green-800 flex items-center gap-1"
            >
              + Ajouter article (non annoncé)
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <StatCard label="À recevoir" value={stats.pending} color="bordeaux" />
            <StatCard label="Reçu OK" value={stats.confirmed} color="green" />
            <StatCard label="Écart noté" value={stats.discrepancy} color="orange" />
            <StatCard label="Ajouté manuel" value={stats.surprise} color="teal" />
          </div>

          {/* Liste */}
          {loading ? (
            <div className="p-8 text-center text-ink-mute text-[12px]">Chargement...</div>
          ) : visibleItems.length === 0 ? (
            <div className="p-12 text-center text-ink-mute border border-dashed border-line rounded-lg">
              <div className="text-[13px]">En attente d'envois de la pâtisserie</div>
              <div className="text-[11px] mt-1 opacity-70">
                Les articles arriveront automatiquement quand la vitrine les envoie
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map(item => (
                <ReceptionRow
                  key={item.id}
                  item={item}
                  isEditing={editingQtyId === item.id}
                  onEdit={() => setEditingQtyId(editingQtyId === item.id ? null : item.id)}
                  onLocalQtyChange={(q) => setLocalQty(item.id, q)}
                  onConfirm={() => handleConfirm(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODALE ÉCART */}
      {discrepancyModal && (
        <DiscrepancyModal
          state={discrepancyModal}
          onChange={setDiscrepancyModal}
          onSave={handleSaveDiscrepancy}
          onCancel={() => setDiscrepancyModal(null)}
        />
      )}

      {/* MODALE SURPRISE */}
      {surpriseModalOpen && (
        <SurpriseModal
          cart={surpriseCart}
          onChange={setSurpriseCart}
          onConfirm={handleAddSurprise}
          onCancel={() => { setSurpriseModalOpen(false); setSurpriseCart({}) }}
        />
      )}
    </div>
  )
}

// =============================================================
// SOUS-COMPOSANTS
// =============================================================

function StatCard({ label, value, color }) {
  const styles = {
    bordeaux: 'bg-bordeaux/10 text-bordeaux',
    green: 'bg-green-100 text-green-900',
    orange: 'bg-orange-100 text-orange-900',
    teal: 'bg-teal-100 text-teal-900',
  }
  return (
    <div className={`p-3 rounded-md text-center ${styles[color] || styles.bordeaux}`}>
      <div className="text-[10px] tracking-[0.15em] uppercase opacity-70 mb-1">{label}</div>
      <div className="text-[22px] font-semibold">{value}</div>
    </div>
  )
}

function ReceptionRow({ item, isEditing, onEdit, onLocalQtyChange, onConfirm }) {
  const currentQty = item._localQty !== undefined ? item._localQty : (item.qty_received !== null && item.qty_received !== undefined ? item.qty_received : item.qty_announced)
  const isPending = item.reception_status === 'pending'
  const isConfirmed = item.reception_status === 'confirmed'
  const isDiscrepancy = item.reception_status === 'discrepancy'
  const isSurprise = (item.qty_announced || 0) === 0  // ajout manuel par café (non annoncé)
  const isDiff = currentQty !== item.qty_announced

  let bg, border, icon, iconBg
  if (isSurprise) {
    bg = 'bg-teal-50'; border = 'border-teal-500'; icon = '+'; iconBg = 'bg-teal-200 text-teal-900'
  } else if (isConfirmed) {
    bg = 'bg-green-50'; border = 'border-green-500'; icon = '✓'; iconBg = 'bg-green-200 text-green-900'
  } else if (isDiscrepancy) {
    bg = 'bg-orange-50'; border = 'border-orange-500'; icon = '⚠'; iconBg = 'bg-orange-200 text-orange-900'
  } else {
    bg = 'bg-white'; border = 'border-line'; icon = '·'; iconBg = 'bg-bordeaux/10 text-bordeaux'
  }

  return (
    <div className={`grid grid-cols-[40px_1fr_auto_auto] gap-3 items-center p-3 rounded-md border ${border} ${bg} animate-slidein`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[14px] ${iconBg}`}>
        {icon}
      </div>

      <div>
        <div className="text-[13px] font-medium">{item.product_name}</div>
        <div className="text-[11px] text-ink-mute mt-0.5">
          {isSurprise
            ? <span className="text-ink-mute italic">Non annoncé</span>
            : <>Annoncé : <strong className="text-ink">{item.qty_announced}</strong></>
          }
        </div>
      </div>

      {/* Quantité */}
      {isPending ? (
        <div className="flex flex-col items-end">
          <button
            type="button"
            onClick={onEdit}
            className={`px-3 py-1.5 bg-white border rounded-md text-[15px] font-semibold min-w-[56px] transition-colors ${
              isEditing ? 'bg-bordeaux/5 border-bordeaux text-bordeaux' :
              isDiff ? 'border-bordeaux text-bordeaux' : 'border-line text-ink hover:bg-cream-warm'
            }`}
          >
            {currentQty}
          </button>
          {isEditing && (
            <div className="mt-2">
              <NumpadInline
                value={currentQty}
                onChange={onLocalQtyChange}
                compact
              />
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-1.5 text-[15px] font-semibold min-w-[56px] text-center">
          {currentQty}
        </div>
      )}

      {/* Action droite */}
      {isPending ? (
        <button
          type="button"
          onClick={onConfirm}
          className={`px-3 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1 ${
            isDiff ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-green-700 text-white hover:bg-green-800'
          }`}
        >
          {isDiff ? '⚠ Valider avec note' : '✓ Reçu OK'}
        </button>
      ) : isSurprise ? (
        <span className="text-[10px] px-2 py-1 rounded-full bg-teal-100 text-teal-900 font-medium">
          Ajouté manuel
        </span>
      ) : isDiscrepancy ? (
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] px-2 py-1 rounded-full bg-orange-100 text-orange-900 font-medium">
            Écart noté
          </span>
          <span className="text-[10px] text-orange-700 italic max-w-[180px] text-right">
            "{item.reception_note || 'sans note'}"
          </span>
        </div>
      ) : isConfirmed ? (
        <span className="text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-900 font-medium">
          Reçu OK
        </span>
      ) : (
        <span className="text-[10px] px-2 py-1 rounded-full bg-cream-warm text-ink-mute font-medium">
          —
        </span>
      )}
    </div>
  )
}

function DiscrepancyModal({ state, onChange, onSave, onCancel }) {
  const { item, note, customNote } = state
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 max-w-md w-full">
        <div className="text-[14px] font-semibold mb-1">{item.product_name}</div>
        <div className="text-[12px] text-ink-mute mb-3">
          Vitrine annonçait <strong>{item.qty_announced}</strong>, tu reçois <strong>{item.qty_received}</strong>. Pourquoi ?
        </div>

        <div className="flex gap-1 flex-wrap mb-2">
          {DISCREPANCY_REASONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ ...state, customNote: r })}
              className={`px-3 py-1 text-[11px] rounded-full border transition-colors ${
                customNote === r
                  ? 'bg-orange-600 text-white border-orange-600'
                  : 'bg-cream-warm border-line hover:bg-orange-50 hover:border-orange-500'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={customNote}
          onChange={e => onChange({ ...state, customNote: e.target.value })}
          placeholder="Ou écris une note libre..."
          className="w-full px-3 py-2 text-[12px] border border-line rounded-md mb-3"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-[11px] text-ink-mute hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-[11px] font-medium"
          >
            Valider avec note
          </button>
        </div>
      </div>
    </div>
  )
}

function SurpriseModal({ cart, onChange, onConfirm, onCancel }) {
  const total = Object.values(cart).reduce((s, v) => s + (v?.qty || 0), 0)
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <div className="text-[14px] font-semibold">+ Ajouter articles (non annoncés)</div>
          <button
            type="button"
            onClick={onCancel}
            className="text-ink-mute hover:text-ink"
          >
            ✕
          </button>
        </div>

        <ProductGrid
          cart={cart}
          onChange={onChange}
          basketLabel="Panier ajout"
          basketColor="teal"
        />

        <div className="flex justify-between items-center mt-4 pt-4 border-t border-line">
          <span className="text-[11px] text-ink-mute">
            {total} article{total > 1 ? 's' : ''} à ajouter
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-[11px] text-ink-mute hover:text-ink"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={total === 0}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-md text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ajouter à la réception
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================
// MODAL BLOQUANT — Café répond après recompte du pâtissier
// =============================================================

function DiscrepancyModalCafe({ items, onAccept, onMaintain }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-red-700 text-white px-4 py-3 flex-shrink-0">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase opacity-90">
            Vitrine a recompté
          </div>
          <div className="font-semibold text-[13px] mt-0.5">
            {items.length} article{items.length > 1 ? 's' : ''} à recompter physiquement
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.map(it => (
            <div key={it.id} className="px-4 py-4 border-b border-line last:border-b-0">
              <div className="text-[13px] font-medium mb-1">{it.product_name}</div>
              <div className="text-[11px] text-ink-mute mb-3">
                La vitrine dit avoir envoyé <strong className="text-ink">{it.qty_announced}</strong>,
                tu avais compté <strong className="text-red-700">{it.qty_received}</strong>.
                <br />Va recompter en cuisine maintenant.
              </div>

              {it.discrepancy_patissier_message && (
                <div className="bg-bordeaux/5 border-l-[3px] border-bordeaux px-3 py-2 mb-3 text-[11px] italic">
                  Vitrine : "{it.discrepancy_patissier_message}"
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onAccept(it.id)}
                  className="flex-1 px-3 py-2.5 bg-white border border-line rounded-md text-[12px] font-medium hover:bg-cream-warm"
                >
                  Effectivement {it.qty_announced} ✓
                </button>
                <button
                  type="button"
                  onClick={() => onMaintain(it.id)}
                  className="flex-1 px-3 py-2.5 bg-red-600 text-white border border-red-600 rounded-md text-[12px] font-medium hover:bg-red-700"
                >
                  Toujours {it.qty_received} — audit
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-cream-warm border-t border-line text-center text-[10px] text-ink-mute flex-shrink-0">
          Réponds aux {items.length} écart{items.length > 1 ? 's' : ''} pour fermer
        </div>
      </div>
    </div>
  )
}


