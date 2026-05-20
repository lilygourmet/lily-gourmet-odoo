// src/components/StockBoutique/StockEvening.jsx
// Écran SOIR — Café (COMPTAGE AVEUGLE)
// V3 : 8 catégories E-/GS-/V-/MI-/SU-/RA-/H-/N- + tailles dynamiques
// =============================================================

import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import PrintButton from './PrintButton'
import NumpadInline from './NumpadInline'
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

export default function StockEvening({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [counts, setCounts] = useState([])
  const [catalog, setCatalog] = useState({ categories: [] })
  const [currentCategory, setCurrentCategory] = useState('E-')
  const [currentSize, setCurrentSize] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  // Mobile : onglet actif (articles ou panier+calculette)
  const [mobileTab, setMobileTab] = useState('articles')
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
        // Initialiser la sélection sur la 1ère catégorie disponible
        const firstCat = (cat.categories || []).find(c => c.id === 'E-') || (cat.categories || [])[0]
        if (firstCat) {
          setCurrentCategory(firstCat.id)
          if (firstCat.has_size_tabs && firstCat.sizes.length > 0) {
            setCurrentSize(firstCat.sizes[0])
          }
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => { mounted = false }
  }, [])

  // Catégorie active
  const activeCat = useMemo(() => {
    return (catalog.categories || []).find(c => c.id === currentCategory) || null
  }, [catalog, currentCategory])

  // Ajuster currentSize quand on change de catégorie
  useEffect(() => {
    if (!activeCat) return
    if (activeCat.has_size_tabs && activeCat.sizes.length > 0) {
      if (!activeCat.sizes.includes(currentSize)) {
        setCurrentSize(activeCat.sizes[0])
      }
    } else {
      setCurrentSize(null)
    }
  }, [activeCat])

  // Articles à afficher selon catégorie + taille
  const products = useMemo(() => {
    if (!activeCat) return []
    if (!activeCat.has_size_tabs) {
      return [
        ...(activeCat.articlesBySize?._none || []),
        ...(activeCat.articles || []).filter(a => a.size !== null),
      ]
    }
    if (!currentSize) return []
    const sizeArticles = activeCat.articlesBySize?.[currentSize] || []
    const isFirstSize = activeCat.sizes[0] === currentSize
    if (isFirstSize) {
      return [...sizeArticles, ...(activeCat.articlesBySize?._none || [])]
    }
    return sizeArticles
  }, [activeCat, currentSize])

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

  async function handleTileClick(p) {
    if (!isOpen || !stockDay) return
    try {
      const created = await addEveningCount(stockDay.id, p.name, p.code, 1, 'fresh', user.id)
      setCounts(prev => [...prev, created])
      setSelectedId(created.id)
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  // Callback du NumpadInline : reçoit déjà la nouvelle valeur calculée
  async function handleQtyChange(newQty) {
    if (!isOpen || !selectedItem) return
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
          <div className="flex items-center gap-2">
            <PrintButton mode="evening" />
            <div className="text-right text-[11px] opacity-80">
              <div>🌙 Équipe café</div>
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
            {isOpen && counts.length === 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-[12px] text-amber-900">
                💡 Clique l'article que tu vois en vitrine → ajoute une ligne (Frais, 1).
                Clique la ligne pour la sélectionner, puis tape la qty sur la calculette.
              </div>
            )}

            {/* GRILLE PRINCIPALE */}
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 pb-16 md:pb-0">

              {/* ============= PANNEAU GAUCHE : CALCULETTE + LISTE (mobile: visible si tab=panier) ============= */}
              <div className={`${mobileTab === 'panier' ? 'block' : 'hidden'} md:block border border-line rounded-lg overflow-hidden flex flex-col bg-white`}>

                {/* HEADER CALCULETTE */}
                <div className="px-3 py-2 bg-bordeaux/10 text-bordeaux-deep font-mono text-[10px] tracking-[0.2em] uppercase font-semibold">
                  Calculette
                </div>

                {/* CALCULETTE — toujours visible (grisée si fermé ou pas de ligne sélectionnée) */}
                <div className="p-2 border-b border-line">
                  <div className={isOpen && selectedItem ? '' : 'opacity-40 pointer-events-none'}>
                    <NumpadInline
                      value={selectedItem?.qty_counted || 0}
                      onChange={handleQtyChange}
                      resetKey={selectedId}
                      compact
                    />
                  </div>
                  {isOpen && selectedItem ? (
                    <div className="text-[10px] text-bordeaux-deep mt-1.5 text-center font-medium truncate">
                      ✏️ {selectedItem.product_name}
                    </div>
                  ) : (
                    <div className="text-[10px] text-ink-mute mt-1.5 text-center italic">
                      {!isOpen
                        ? 'Journée clôturée'
                        : counts.length === 0
                          ? '↓ Clique une tuile à droite'
                          : '↓ Clique une ligne ci-dessous'}
                    </div>
                  )}
                </div>

                {/* HEADER LISTE */}
                <div className="px-3 py-2 bg-bordeaux/10 text-bordeaux-deep font-mono text-[10px] tracking-[0.2em] uppercase font-semibold border-t border-line">
                  Restes comptés
                </div>

                {/* LISTE TRIÉE DESC */}
                <div className="flex-1 min-h-[120px] max-h-[300px] overflow-y-auto">
                  {counts.length === 0 ? (
                    <div className="p-6 text-center text-ink-mute text-[11px] italic">
                      Aucun article compté.<br />Clique une tuile à droite.
                    </div>
                  ) : (
                    [...counts]
                      .sort((a, b) => new Date(b.counted_at || b.created_at || 0) - new Date(a.counted_at || a.created_at || 0))
                      .map(c => (
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

                <div className="px-3 py-2 border-t border-line bg-bordeaux/5 flex items-center justify-between">
                  <span className="text-[11px] text-bordeaux-deep font-medium">Total</span>
                  <span className="text-[14px] font-semibold">{totalCount} article{totalCount > 1 ? 's' : ''}</span>
                </div>

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

              {/* ============= PANNEAU DROITE : ONGLETS + TUILES (mobile: visible si tab=articles) ============= */}
              <div className={`${mobileTab === 'articles' ? 'block' : 'hidden'} md:block bg-white border border-line rounded-lg overflow-hidden`}>

                {/* NIVEAU 1 : Onglets catégories */}
                <div className="flex border-b border-line bg-cream-warm overflow-x-auto">
                  {(catalog.categories || []).map(cat => {
                    const active = currentCategory === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCurrentCategory(cat.id)}
                        className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-2 min-w-[56px] transition-colors ${
                          active ? 'bg-bordeaux text-cream font-medium' : 'text-ink-mute hover:bg-cream'
                        }`}
                        title={`${cat.label} (${cat.nb_articles} articles)`}
                      >
                        <span className="text-[16px] leading-none">{cat.emoji}</span>
                        <span className="text-[9px] leading-tight">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* NIVEAU 2 : Onglets taille (si applicable) */}
                {activeCat && activeCat.has_size_tabs && activeCat.sizes.length > 0 && (
                  <div className="flex border-b border-line">
                    {activeCat.sizes.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCurrentSize(s)}
                        className={`flex-1 px-3 py-2 text-[11px] transition-colors ${
                          currentSize === s
                            ? 'bg-bordeaux/10 text-bordeaux font-semibold'
                            : 'text-ink-mute hover:bg-cream-warm'
                        }`}
                      >
                        {s} pers
                      </button>
                    ))}
                  </div>
                )}

                {/* GRILLE PRODUITS */}
                <div className="p-2.5">
                  {!activeCat ? (
                    <div className="p-8 text-center text-ink-mute text-[11px]">
                      Aucune catégorie disponible.
                    </div>
                  ) : products.length === 0 ? (
                    <div className="p-8 text-center text-ink-mute text-[11px]">
                      Aucun article dans cette {activeCat.has_size_tabs ? 'taille' : 'catégorie'}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                                <span>{activeCat.emoji}</span>
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
      {/* ============= BOTTOM BAR MOBILE : onglets Articles / Comptés ============= */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-line flex md:hidden shadow-lg">
        <button
          type="button"
          onClick={() => setMobileTab('articles')}
          className={`flex-1 py-3 text-[12px] font-medium text-center transition-colors ${
            mobileTab === 'articles'
              ? 'bg-bordeaux text-cream'
              : 'text-ink-mute hover:bg-cream-warm'
          }`}
        >
          🍰 Articles
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('panier')}
          className={`flex-1 py-3 text-[12px] font-medium text-center transition-colors flex items-center justify-center gap-2 ${
            mobileTab === 'panier'
              ? 'bg-bordeaux text-cream'
              : 'text-ink-mute hover:bg-cream-warm'
          }`}
        >
          🌙 Comptés
          {totalCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              mobileTab === 'panier' ? 'bg-cream text-bordeaux' : 'bg-bordeaux text-cream'
            }`}>
              {totalCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

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

