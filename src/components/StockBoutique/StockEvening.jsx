// src/components/StockBoutique/StockEvening.jsx
// Écran SOIR — Café (COMPTAGE AVEUGLE)
// UX identique à Vitrine : panier à gauche avec calculette, tuiles à droite
// Clic tuile = nouvelle ligne (Frais 1). Sélectionne ligne → calculette modifie qty.
// =============================================================

import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import { fetchEntremetsCatalog } from '../../lib/stockCatalog'
import {
  getOrCreateStockDay,
  loadEveningCounts,
  addEveningCount,
  updateEveningCount,
  updateItem,
  deleteItem,
  submitStockDay,
  reopenStockDay,
  todayISO,
} from '../../lib/stockBoutique'

const FRESHNESS_OPTIONS = [
  { id: 'fresh', label: 'Frais' },
  { id: 'yesterday', label: 'J+1' },
  { id: 'twodays', label: 'J+2' },
]

const SIZE_TABS = [
  { id: '1', label: '1' },
  { id: '5', label: '5' },
  { id: '10', label: '10' },
  { id: '15', label: '15' },
]

export default function StockEvening({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [counts, setCounts] = useState([])
  const [catalog, setCatalog] = useState({ sizes: { '1': [], '5': [], '10': [], '15': [] } })
  const [currentSize, setCurrentSize] = useState('1')
  const [selectedId, setSelectedId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const sd = await getOrCreateStockDay(todayISO())
        if (!mounted) return
        setStockDay(sd)
        const [its, cat] = await Promise.all([
          loadEveningCounts(sd.id),
          fetchEntremetsCatalog(),
        ])
        if (!mounted) return
        setCounts(its)
        setCatalog(cat)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [])

  const products = catalog.sizes?.[currentSize] || []
  const totalCount = counts.reduce((s, c) => s + (c.qty_counted || 0), 0)

  const isOpen = stockDay?.status === 'open'
  const isSubmitted = stockDay?.status === 'submitted'
  const isAudited = stockDay?.status === 'audited'

  const selectedItem = useMemo(
    () => counts.find(c => c.id === selectedId) || null,
    [counts, selectedId]
  )

  // ================================================================
  // Actions
  // ================================================================

  // Clic tuile : crée TOUJOURS une nouvelle ligne (Frais, qty=1)
  async function handleTileClick(p) {
    if (!isOpen || !stockDay) return
    try {
      const created = await addEveningCount(stockDay.id, p.name, p.code, 1, 'fresh', user.id)
      setCounts(prev => [...prev, created])
      setSelectedId(created.id) // sélectionne automatiquement la nouvelle ligne
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  // Numpad : modifie la qty de l'item sélectionné
  async function handleNumpad(digit) {
    if (!isOpen || !selectedItem) return
    const current = String(selectedItem.qty_counted || 0)
    let newQty
    if (digit === 'C') {
      newQty = 0
    } else if (digit === 'BACK') {
      newQty = parseInt(current.slice(0, -1) || '0', 10)
    } else {
      // Ajouter le chiffre. Si qty actuelle = 1 (valeur par défaut au clic tuile),
      // on remplace au lieu de concaténer pour éviter "11", "12" non voulus.
      if (current === '1' || current === '0') {
        newQty = parseInt(digit, 10)
      } else {
        newQty = parseInt(current + digit, 10)
      }
    }
    if (isNaN(newQty) || newQty < 0) newQty = 0
    try {
      const updated = await updateEveningCount(selectedItem.id, newQty, user.id)
      setCounts(prev => prev.map(c => c.id === selectedItem.id ? { ...c, ...updated } : c))
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleFreshnessChange(item, newFreshness) {
    if (!isOpen) return
    try {
      const updated = await updateItem(item.id, { freshness: newFreshness })
      setCounts(prev => prev.map(c => c.id === item.id ? { ...c, ...updated } : c))
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleRemove(item) {
    if (!isOpen) return
    try {
      await deleteItem(item.id)
      setCounts(prev => prev.filter(c => c.id !== item.id))
      if (selectedId === item.id) setSelectedId(null)
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  // ================================================================
  // Submission / réouverture
  // ================================================================

  async function handleSubmit() {
    if (!stockDay || counts.length === 0) return
    if (!confirm(`Envoyer le comptage à l'équipe audit ?\n\n${counts.length} ligne${counts.length > 1 ? 's' : ''} · ${totalCount} article${totalCount > 1 ? 's' : ''} compté${totalCount > 1 ? 's' : ''}.\n\nTu pourras toujours corriger tant que l'audit n'a pas validé.`)) return
    try {
      setSubmitting(true)
      await submitStockDay(stockDay.id, user.id)
      const sd = await getOrCreateStockDay(todayISO())
      setStockDay(sd)
    } catch (e) {
      alert('Erreur envoi : ' + (e.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReopen() {
    if (!stockDay) return
    if (!confirm("Corriger le comptage ? L'équipe audit sera notifiée du changement.")) return
    try {
      await reopenStockDay(stockDay.id)
      const sd = await getOrCreateStockDay(todayISO())
      setStockDay(sd)
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  // Liste : on garde l'ordre d'insertion (plus récent en bas)
  // Pour les tuiles : total qty par article (toutes lignes/fraîcheurs cumulées)
  function tileQty(productName) {
    return counts
      .filter(c => c.product_name === productName)
      .reduce((s, c) => s + (c.qty_counted || 0), 0)
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* HEADER */}
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-lg flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              Comptage du soir
            </div>
            <div className="font-semibold text-[14px] italic">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          <div className="text-right text-[11px] opacity-80">
            <div>🌙 Équipe café</div>
            <div className="text-[9px] opacity-70 font-mono uppercase tracking-wider mt-0.5">
              Comptage à l'aveugle
            </div>
          </div>
        </div>

        {/* BANDEAU STATUT */}
        {isSubmitted && (
          <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 flex items-center justify-between">
            <div className="text-[12px] text-blue-900">
              <span className="font-semibold">✓ Comptage envoyé à l'équipe audit</span>
              {stockDay.submitted_at && (
                <span className="ml-2 opacity-70">
                  à {new Date(stockDay.submitted_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleReopen}
              className="px-3 py-1.5 bg-white border border-blue-400 text-blue-900 rounded-md text-[11px] font-medium hover:bg-blue-100"
            >
              ✏️ Corriger
            </button>
          </div>
        )}

        {isAudited && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-[12px] text-green-900">
            <span className="font-semibold">✓ Validé par l'équipe audit</span>
            {stockDay.audited_at && (
              <span className="ml-2 opacity-70">
                à {new Date(stockDay.audited_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span className="ml-2 opacity-70">— plus de modification possible</span>
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-line rounded-lg p-12 text-center text-ink-mute text-[12px]">
            Chargement...
          </div>
        ) : (
          <>
            {/* INSTRUCTIONS */}
            {isOpen && counts.length === 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-[12px] text-amber-900">
                💡 <strong>Mode aveugle activé.</strong> Compte ce que tu vois en vitrine.
                Clique l'article → ajoute une ligne (Frais, 1). Clique la ligne pour la sélectionner, puis tape la qty sur la calculette.
              </div>
            )}

            {/* GRILLE PRINCIPALE */}
            <div className="grid grid-cols-[280px_1fr] gap-3">

              {/* ============= PANNEAU GAUCHE : PANIER + CALCULETTE ============= */}
              <div className="border border-line rounded-lg overflow-hidden flex flex-col bg-white">
                <div className="px-3 py-2 bg-bordeaux/10 text-bordeaux-deep font-mono text-[10px] tracking-[0.2em] uppercase font-semibold">
                  Restes comptés
                </div>

                {/* Liste */}
                <div className="min-h-[180px] max-h-[280px] overflow-y-auto">
                  {counts.length === 0 ? (
                    <div className="p-6 text-center text-ink-mute text-[11px] italic">
                      Aucun article compté.<br />Clique une tuile à droite.
                    </div>
                  ) : (
                    counts.map(c => (
                      <CountRow
                        key={c.id}
                        item={c}
                        selected={c.id === selectedId}
                        disabled={!isOpen}
                        onSelect={() => setSelectedId(c.id)}
                        onFreshnessChange={(fr) => handleFreshnessChange(c, fr)}
                        onRemove={() => handleRemove(c)}
                      />
                    ))
                  )}
                </div>

                {/* Total */}
                <div className="px-3 py-2 border-t border-line bg-bordeaux/5 flex items-center justify-between">
                  <span className="text-[11px] text-bordeaux-deep font-medium">Total</span>
                  <span className="text-[14px] font-semibold">{totalCount} article{totalCount > 1 ? 's' : ''}</span>
                </div>

                {/* Calculette */}
                {isOpen && (
                  <div className="p-2 border-t border-line">
                    <div className="grid grid-cols-3 gap-1">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <NumpadBtn key={d} label={d} onClick={() => handleNumpad(d)} disabled={!selectedItem} />
                      ))}
                      <NumpadBtn label="C" onClick={() => handleNumpad('C')} disabled={!selectedItem} />
                      <NumpadBtn label="0" onClick={() => handleNumpad('0')} disabled={!selectedItem} />
                      <NumpadBtn label="⌫" onClick={() => handleNumpad('BACK')} disabled={!selectedItem} />
                    </div>
                    {!selectedItem && counts.length > 0 && (
                      <div className="text-[9px] text-ink-mute mt-1 text-center italic">
                        Sélectionne une ligne pour modifier sa quantité
                      </div>
                    )}
                  </div>
                )}

                {/* Bouton clôturer */}
                {isOpen && (
                  <div className="p-2 border-t border-line">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={counts.length === 0 || submitting}
                      className="w-full px-3 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-md text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Envoi...' : 'Clôturer la journée'}
                    </button>
                  </div>
                )}
              </div>

              {/* ============= PANNEAU DROITE : TUILES ============= */}
              <div className="bg-white border border-line rounded-lg overflow-hidden">
                {/* Onglets taille */}
                <div className="flex border-b border-line bg-cream-warm">
                  {SIZE_TABS.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCurrentSize(s.id)}
                      className={`flex-1 px-3 py-2 text-[11px] transition-colors ${
                        currentSize === s.id
                          ? 'bg-bordeaux text-cream font-semibold'
                          : 'text-ink-mute hover:bg-cream'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Grille produits */}
                <div className="p-2.5">
                  {products.length === 0 ? (
                    <div className="p-8 text-center text-ink-mute text-[11px]">
                      Aucun article {currentSize} pers dans le catalogue.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {products.map(p => {
                        const qty = tileQty(p.name)
                        return (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => handleTileClick(p)}
                            disabled={!isOpen}
                            className={`relative border rounded-md p-1.5 transition-all ${
                              !isOpen ? 'opacity-50 cursor-not-allowed border-line bg-cream-warm' :
                              qty > 0 ? 'border-bordeaux bg-bordeaux/10' :
                              'border-line bg-white hover:bg-cream-warm'
                            }`}
                          >
                            <div className={`aspect-square rounded-md flex items-center justify-center text-2xl overflow-hidden ${
                              qty > 0 ? 'bg-bordeaux/20 text-bordeaux-deep' : 'bg-cream-warm text-ink-mute'
                            }`}>
                              {p.image_url ? (
                                <img
                                  src={p.image_url}
                                  alt={p.name}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              ) : (
                                <span>🍰</span>
                              )}
                            </div>
                            {qty > 0 && (
                              <div className="absolute top-1 right-1 bg-bordeaux text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] font-semibold px-1.5">
                                {qty}
                              </div>
                            )}
                            <div className="text-[10px] mt-1 text-center leading-tight line-clamp-2">
                              {p.name}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// =============================================================
// LIGNE DU PANIER
// =============================================================

function CountRow({ item, selected, disabled, onSelect, onFreshnessChange, onRemove }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      className={`px-3 py-2 border-b border-line flex items-center gap-2 cursor-pointer transition-all ${
        selected ? 'bg-bordeaux/10 border-l-[3px] border-l-bordeaux' : 'hover:bg-cream-warm'
      } last:border-b-0`}
    >
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-medium truncate ${selected ? 'text-bordeaux-deep' : ''}`}>
          {item.product_name}
        </div>
        <select
          value={item.freshness || 'fresh'}
          onChange={(e) => onFreshnessChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          className="text-[10px] mt-1 px-1 py-0.5 border border-line rounded text-ink-mute bg-white disabled:opacity-50"
        >
          {FRESHNESS_OPTIONS.map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className={`text-[16px] font-semibold min-w-[30px] text-right tabular-nums ${
        selected ? 'text-bordeaux' : ''
      }`}>
        {item.qty_counted}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        disabled={disabled}
        title="Supprimer"
        className="text-ink-mute hover:text-red-600 text-[14px] disabled:opacity-50 px-1"
      >
        🗑
      </button>
    </div>
  )
}

// =============================================================
// BOUTON CALCULETTE
// =============================================================

function NumpadBtn({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="py-3 bg-white border border-line rounded-md text-[14px] font-medium hover:bg-cream-warm active:bg-bordeaux/10 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

