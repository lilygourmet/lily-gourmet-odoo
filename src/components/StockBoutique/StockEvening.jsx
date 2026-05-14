// src/components/StockBoutique/StockEvening.jsx
// Écran SOIR — Café (COMPTAGE AVEUGLE)
// Pas d'info sur l'attendu. Le café ouvre un catalogue vierge,
// ajoute chaque article qu'elle voit en vitrine + qty + fraîcheur,
// puis "Envoie à l'équipe audit".
// =============================================================

import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import NumpadInline from './NumpadInline'
import { fetchEntremetsCatalog } from '../../lib/stockCatalog'
import {
  getOrCreateStockDay,
  loadEveningCounts,
  addEveningCount,
  updateEveningCount,
  deleteItem,
  submitStockDay,
  reopenStockDay,
  todayISO,
} from '../../lib/stockBoutique'

const FRESHNESS_OPTIONS = [
  { id: 'fresh', label: 'Frais (aujourd\'hui)', color: 'green', short: 'D' },
  { id: 'yesterday', label: 'Hier (J+1)', color: 'orange', short: 'J+1' },
  { id: 'twodays', label: '2 jours (J+2)', color: 'red', short: 'J+2' },
]

export default function StockEvening({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [counts, setCounts] = useState([])
  const [catalog, setCatalog] = useState({ sizes: { '1': [], '5': [], '10': [] } })
  const [currentSize, setCurrentSize] = useState('1')
  const [editingId, setEditingId] = useState(null)
  const [draftQty, setDraftQty] = useState(1)
  const [draftFreshness, setDraftFreshness] = useState('fresh')
  const [draftProduct, setDraftProduct] = useState(null)
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
  const totalCounted = counts.reduce((s, c) => s + (c.qty_counted || 0), 0)

  const isOpen = stockDay?.status === 'open'
  const isSubmitted = stockDay?.status === 'submitted'
  const isAudited = stockDay?.status === 'audited'

  function openProduct(p) {
    if (!isOpen) return
    // Si déjà compté, on ouvre en édition
    const existing = counts.find(c => c.product_name === p.name && c.freshness === draftFreshness)
    if (existing) {
      setEditingId(existing.id)
      setDraftQty(existing.qty_counted)
      setDraftProduct(p)
    } else {
      setEditingId(null)
      setDraftProduct(p)
      setDraftQty(1)
    }
  }

  async function handleSaveDraft() {
    if (!draftProduct || !stockDay) return
    try {
      if (editingId) {
        await updateEveningCount(editingId, draftQty, user.id)
      } else {
        await addEveningCount(stockDay.id, draftProduct.name, draftProduct.code, draftQty, draftFreshness, user.id)
      }
      const its = await loadEveningCounts(stockDay.id)
      setCounts(its)
      setDraftProduct(null)
      setEditingId(null)
      setDraftQty(1)
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer cette ligne de comptage ?')) return
    try {
      await deleteItem(id)
      const its = await loadEveningCounts(stockDay.id)
      setCounts(its)
      if (editingId === id) {
        setDraftProduct(null)
        setEditingId(null)
      }
    } catch (e) {
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleSubmit() {
    if (!stockDay || counts.length === 0) return
    if (!confirm(`Envoyer le comptage à l'équipe audit ?\n\n${counts.length} ligne${counts.length > 1 ? 's' : ''} · ${totalCounted} article${totalCounted > 1 ? 's' : ''} compté${totalCounted > 1 ? 's' : ''}.\n\nTu pourras toujours corriger tant que l'audit n'a pas validé.`)) return
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

  // Compteur par fraîcheur (pour les chips)
  const countsByFreshness = useMemo(() => {
    const map = { fresh: 0, yesterday: 0, twodays: 0 }
    counts.forEach(c => {
      if (map[c.freshness] !== undefined) map[c.freshness] += (c.qty_counted || 0)
    })
    return map
  }, [counts])

  // Lignes triées (fraîcheur puis nom)
  const sortedCounts = useMemo(() => {
    const order = { fresh: 1, yesterday: 2, twodays: 3, loss: 4 }
    return [...counts].sort((a, b) => {
      const oa = order[a.freshness] || 9
      const ob = order[b.freshness] || 9
      if (oa !== ob) return oa - ob
      return a.product_name.localeCompare(b.product_name)
    })
  }, [counts])

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
                💡 <strong>Mode aveugle activé.</strong> Compte ce que tu vois en vitrine, article par article.
                On ne te montre rien de ce qui a été apporté pour ne pas t'influencer.
                Tu choisis la fraîcheur (Frais / Hier / 2 jours) puis tu cliques l'article.
              </div>
            )}

            <div className="grid grid-cols-[1fr_280px] gap-3">
              {/* PANNEAU GAUCHE : CATALOGUE */}
              <div className="bg-white border border-line rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line bg-cream-warm">
                  <div className="text-[12px] font-semibold">Catalogue des entremets</div>
                  <div className="text-[10px] text-ink-mute mt-0.5">
                    Clique un article pour le compter
                  </div>
                </div>

                {/* Sélecteur fraîcheur */}
                {isOpen && (
                  <div className="px-3 py-2 border-b border-line bg-cream/50">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-mute mb-1.5">
                      Fraîcheur de l'article à compter
                    </div>
                    <div className="flex gap-1">
                      {FRESHNESS_OPTIONS.map(f => {
                        const active = draftFreshness === f.id
                        const styles = active ? {
                          green: 'bg-green-600 border-green-600 text-white',
                          orange: 'bg-orange-600 border-orange-600 text-white',
                          red: 'bg-red-700 border-red-700 text-white',
                        }[f.color] : {
                          green: 'border-green-500 text-green-800 hover:bg-green-50',
                          orange: 'border-orange-500 text-orange-800 hover:bg-orange-50',
                          red: 'border-red-500 text-red-800 hover:bg-red-50',
                        }[f.color]
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setDraftFreshness(f.id)}
                            className={`flex-1 px-2 py-1.5 text-[11px] rounded-md border-2 transition-colors ${styles}`}
                          >
                            {f.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Onglets taille */}
                <div className="flex gap-0.5 px-3 pt-2 border-b border-line">
                  {[
                    { id: '1', label: '1 pers' },
                    { id: '5', label: '5 pers' },
                    { id: '10', label: '10 pers' },
                    { id: '15', label: '15 pers' },
                  ].map(tab => {
                    const active = currentSize === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCurrentSize(tab.id)}
                        className={`px-3 py-1.5 text-[11px] font-medium tracking-wider transition-colors ${
                          active
                            ? 'border-b-2 border-bordeaux text-bordeaux'
                            : 'border-b-2 border-transparent text-ink-mute hover:text-ink'
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {/* Grille */}
                <div className="p-3 max-h-[480px] overflow-y-auto">
                  {products.length === 0 ? (
                    <div className="p-8 text-center text-ink-mute text-[11px]">
                      Aucun article {currentSize} pers dans le catalogue.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {products.map(p => {
                        // Combien d'unités déjà comptées (toutes fraîcheurs confondues) pour cet article
                        const totalForProduct = counts
                          .filter(c => c.product_name === p.name)
                          .reduce((s, c) => s + (c.qty_counted || 0), 0)
                        const hasInCurrentFreshness = counts.find(c => c.product_name === p.name && c.freshness === draftFreshness)
                        return (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => openProduct(p)}
                            disabled={!isOpen}
                            className={`relative border rounded-md p-1.5 transition-all ${
                              !isOpen ? 'opacity-50 cursor-not-allowed border-line bg-cream-warm' :
                              hasInCurrentFreshness ? 'border-bordeaux bg-bordeaux/10' :
                              totalForProduct > 0 ? 'border-line bg-cream-warm hover:bg-bordeaux/5' :
                              'border-line bg-white hover:bg-cream-warm'
                            }`}
                          >
                            <div className={`aspect-square rounded-md flex items-center justify-center text-xl ${
                              hasInCurrentFreshness ? 'bg-bordeaux/20 text-bordeaux-deep' : 'bg-cream-warm text-ink-mute'
                            }`}>
                              🍰
                            </div>
                            {totalForProduct > 0 && (
                              <div className="absolute top-1 right-1 bg-bordeaux text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] font-semibold px-1.5">
                                {totalForProduct}
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

              {/* PANNEAU DROIT : LISTE COMPTÉE */}
              <div className="bg-white border border-line rounded-lg overflow-hidden flex flex-col h-fit max-h-[640px]">
                <div className="px-3 py-2.5 border-b border-line bg-cream-warm">
                  <div className="text-[12px] font-semibold">Comptage</div>
                  <div className="text-[10px] text-ink-mute mt-0.5">
                    {counts.length} ligne{counts.length > 1 ? 's' : ''} · {totalCounted} article{totalCounted > 1 ? 's' : ''}
                  </div>
                </div>

                {/* Compteurs par fraîcheur */}
                <div className="grid grid-cols-3 gap-1 p-2 border-b border-line">
                  {FRESHNESS_OPTIONS.map(f => (
                    <div
                      key={f.id}
                      className={`text-center p-1.5 rounded-md ${
                        f.color === 'green' ? 'bg-green-50 text-green-900' :
                        f.color === 'orange' ? 'bg-orange-50 text-orange-900' :
                        'bg-red-50 text-red-900'
                      }`}
                    >
                      <div className="text-[8px] font-mono uppercase tracking-wider opacity-70">
                        {f.short}
                      </div>
                      <div className="text-[14px] font-semibold">{countsByFreshness[f.id]}</div>
                    </div>
                  ))}
                </div>

                {/* DRAFT : article en cours de saisie */}
                {draftProduct && isOpen && (
                  <div className="p-3 border-b border-line bg-bordeaux/5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-bordeaux mb-1">
                      {editingId ? 'Modification' : 'Nouvelle saisie'}
                    </div>
                    <div className="text-[12px] font-semibold mb-1">{draftProduct.name}</div>
                    <div className="text-[10px] text-ink-mute mb-2">
                      Fraîcheur : <strong className={
                        draftFreshness === 'fresh' ? 'text-green-700' :
                        draftFreshness === 'yesterday' ? 'text-orange-700' :
                        'text-red-700'
                      }>{FRESHNESS_OPTIONS.find(f => f.id === draftFreshness)?.label}</strong>
                    </div>
                    <div className="flex justify-center mb-2">
                      <NumpadInline value={draftQty} onChange={setDraftQty} compact />
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={draftQty === 0}
                        className="flex-1 px-2 py-1.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-md text-[11px] font-medium disabled:opacity-50"
                      >
                        ✓ Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDraftProduct(null); setEditingId(null) }}
                        className="px-2 py-1.5 border border-line rounded-md text-[11px] text-ink-mute hover:text-ink"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* LISTE */}
                <div className="flex-1 overflow-y-auto">
                  {sortedCounts.length === 0 ? (
                    <div className="p-6 text-center text-ink-mute text-[11px] italic">
                      Aucun article compté.<br />Clique une tuile à gauche.
                    </div>
                  ) : (
                    sortedCounts.map(c => {
                      const f = FRESHNESS_OPTIONS.find(x => x.id === c.freshness)
                      return (
                        <div
                          key={c.id}
                          className={`px-3 py-2 border-b border-line flex items-center gap-2 group ${
                            editingId === c.id ? 'bg-bordeaux/5' : ''
                          }`}
                        >
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono uppercase ${
                            c.freshness === 'fresh' ? 'bg-green-100 text-green-800' :
                            c.freshness === 'yesterday' ? 'bg-orange-100 text-orange-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {f?.short || c.freshness}
                          </span>
                          <div className="flex-1 min-w-0 text-[11px] truncate">{c.product_name}</div>
                          <div className="text-[13px] font-semibold tabular-nums">{c.qty_counted}</div>
                          {isOpen && (
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              className="text-ink-mute hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Supprimer"
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* FOOTER : envoyer */}
                {isOpen && (
                  <div className="p-3 border-t border-line bg-cream-warm">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={counts.length === 0 || submitting}
                      className="w-full px-3 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-md text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Envoi...' : '📤 Envoyer à l\'équipe audit'}
                    </button>
                    <div className="text-[9px] text-ink-mute mt-1 text-center">
                      Tu pourras toujours corriger après envoi
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

