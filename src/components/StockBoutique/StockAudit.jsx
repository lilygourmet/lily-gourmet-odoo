// src/components/StockBoutique/StockAudit.jsx
// Écran AUDIT — Équipe dédiée (perm_stock_audit)
// v3 : section "Conflits à arbitrer" + modal Trancher
// =============================================================

import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import PrintButton from './PrintButton'
import AuditResolveModal from './AuditResolveModal'
import {
  getOrCreateStockDay,
  loadStockDay,
  buildAuditReport,
  auditStockDay,
  triggerOdooSnapshot,
  subscribeToDayItems,
  subscribeToStockDay,
  loadDaySummary,
  loadDiscrepancyItems,
  auditOverrideQty,
  auditResolveInFavorOf,
  todayISO,
} from '../../lib/stockBoutique'

const STATUS_LABELS = {
  open: { label: '… En cours', color: 'bg-amber-100 text-amber-900' },
  submitted: { label: '📩 Envoyé audit', color: 'bg-blue-100 text-blue-900' },
  audited: { label: '✓ Audité', color: 'bg-green-100 text-green-900' },
}

const DISCREPANCY_BADGE = {
  pending_patissier: { label: '⏳ Hamza n\'a pas répondu', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  pending_cafe: { label: '⏳ Hamza dit "recompte"', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  unresolved: { label: '⚠ Désaccord total', color: 'bg-red-100 text-red-900 border-red-300' },
}

export default function StockAudit({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [report, setReport] = useState([])
  const [discrepancyItems, setDiscrepancyItems] = useState([])
  const [auditNotes, setAuditNotes] = useState('')
  const [auditing, setAuditing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [refreshSuccess, setRefreshSuccess] = useState('')
  const [day, setDay] = useState(todayISO())
  const [historyDays, setHistoryDays] = useState([])
  const [historyDaysBack, setHistoryDaysBack] = useState(30)
  const [resolveModalItem, setResolveModalItem] = useState(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let mounted = true
    loadDaySummary(historyDaysBack).then(d => {
      if (mounted) setHistoryDays(d)
    })
    return () => { mounted = false }
  }, [historyDaysBack, day])

  useEffect(() => {
    let mounted = true
    let itemsSub = null
    let daySub = null

    async function reloadAll(sd) {
      const [r, disc] = await Promise.all([
        buildAuditReport(sd.id),
        loadDiscrepancyItems(sd.id),
      ])
      if (mounted) {
        setReport(r)
        setDiscrepancyItems(disc)
      }
    }

    async function init() {
      try {
        setLoading(true)
        const sd = day === todayISO() ? await getOrCreateStockDay(day) : await loadStockDay(day)
        if (!mounted) return
        setStockDay(sd)
        if (sd) {
          setAuditNotes(sd.audit_notes || '')
          await reloadAll(sd)

          itemsSub = subscribeToDayItems(sd.id, {
            onInsert: () => reloadAll(sd),
            onUpdate: () => reloadAll(sd),
            onDelete: () => reloadAll(sd),
          })
          daySub = subscribeToStockDay(sd.id, async (newDay) => {
            if (mounted) setStockDay(newDay)
          })
        } else {
          setReport([])
          setDiscrepancyItems([])
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()

    return () => {
      mounted = false
      if (itemsSub) itemsSub.unsubscribe()
      if (daySub) daySub.unsubscribe()
    }
  }, [day])

  const isOpen = stockDay?.status === 'open'
  const isSubmitted = stockDay?.status === 'submitted'
  const isAudited = stockDay?.status === 'audited'

  // Items associés à chaque produit du rapport (pour permettre de cliquer "Trancher" depuis la ligne)
  const discByProduct = useMemo(() => {
    const map = new Map()
    for (const it of discrepancyItems) {
      if (!map.has(it.product_name)) map.set(it.product_name, [])
      map.get(it.product_name).push(it)
    }
    return map
  }, [discrepancyItems])

  const stats = useMemo(() => {
    let totalCounted = 0
    let totalOdooInitial = 0
    let totalOdooCurrent = 0
    let articlesWithGapCurrent = 0
    let articlesGapChanged = 0
    for (const r of report) {
      totalCounted += r.qty_counted || 0
      totalOdooInitial += r.qty_odoo_initial || 0
      totalOdooCurrent += r.qty_odoo_current || 0
      const effQty = r.is_counted ? (r.qty_counted || 0) : 0
      const effGapCurrent = (r.qty_odoo_current !== null && r.qty_odoo_current !== undefined)
        ? r.qty_odoo_current - effQty
        : null
      if (effGapCurrent !== null && effGapCurrent !== 0) articlesWithGapCurrent++
      if (r.is_counted && r.gap_initial !== null && r.gap_current !== null && r.gap_initial !== r.gap_current) {
        articlesGapChanged++
      }
    }
    return {
      totalCounted,
      totalOdooInitial,
      totalOdooCurrent,
      articlesWithGapCurrent,
      articlesGapChanged,
    }
  }, [report])

  async function handleAudit() {
    if (!stockDay) return
    if (!confirm("Valider définitivement la journée ?\n\nAprès validation, plus aucune modification du comptage ne sera possible.\nTu pourras toujours rafraîchir le stock Odoo pour comparer.")) return
    try {
      setAuditing(true)
      await auditStockDay(stockDay.id, user.id, auditNotes.trim() || null)
      const sd = await loadStockDay(day)
      setStockDay(sd)
    } catch (e) {
      alert('Erreur validation : ' + (e.message || e))
    } finally {
      setAuditing(false)
    }
  }

  async function handleRefresh() {
    if (!stockDay) return
    setRefreshing(true)
    setRefreshError('')
    setRefreshSuccess('')
    try {
      const res = await triggerOdooSnapshot(stockDay.id, user.id, false)
      const r = await buildAuditReport(stockDay.id)
      const sd = await loadStockDay(day)
      setReport(r)
      setStockDay(sd)
      setRefreshSuccess(`✓ ${res.items_updated} ligne${res.items_updated > 1 ? 's' : ''} rafraîchie${res.items_updated > 1 ? 's' : ''}`)
      setTimeout(() => setRefreshSuccess(''), 4000)
    } catch (e) {
      console.error('[StockAudit] refresh error:', e)
      setRefreshError(e.message || 'Erreur lors du rafraîchissement Odoo')
      setTimeout(() => setRefreshError(''), 6000)
    } finally {
      setRefreshing(false)
    }
  }

  // Callbacks de la modal AuditResolveModal
  async function handleResolveInFavorOf(itemId, inFavorOf, note) {
    await auditResolveInFavorOf(itemId, inFavorOf, note, user.id)
  }

  async function handleOverrideQty(itemId, qtyPatch, note) {
    await auditOverrideQty(itemId, qtyPatch, note, user.id)
  }

  function changeDay(delta) {
    const d = new Date(day)
    d.setDate(d.getDate() + delta)
    const nd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setDay(nd)
  }

  function fmtRelative(iso) {
    if (!iso) return ''
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return "à l'instant"
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  }

  const canRefresh = stockDay && (isSubmitted || isAudited)
  const hasConflicts = discrepancyItems.length > 0

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* HEADER + sélecteur date */}
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-lg flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              Rapport audit stock
            </div>
            <div className="font-semibold text-[14px] italic">
              {new Date(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeDay(-1)}
              className="px-2 py-1 bg-bordeaux-deep hover:bg-bordeaux/80 rounded-md text-[12px]"
              title="Jour précédent"
            >
              ◀
            </button>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="px-2 py-1 bg-bordeaux-deep text-cream rounded-md text-[11px] border border-cream/30"
            />
            <button
              type="button"
              onClick={() => changeDay(1)}
              className="px-2 py-1 bg-bordeaux-deep hover:bg-bordeaux/80 rounded-md text-[12px]"
              title="Jour suivant"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setDay(todayISO())}
              className="px-2 py-1 bg-cream text-bordeaux rounded-md text-[10px] font-semibold"
            >
              Aujourd'hui
            </button>
            <PrintButton mode="audit" />
          </div>
        </div>

        {/* STATUT + REFRESH BAR */}
        {stockDay && (
          <div className={`border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap ${
            isAudited ? 'bg-green-50 border-green-300' :
            isSubmitted ? 'bg-blue-50 border-blue-300' :
            'bg-amber-50 border-amber-300'
          }`}>
            <div className="text-[12px] flex-1 min-w-[200px]">
              {isAudited && (
                <>
                  <span className="font-semibold text-green-900">✓ Journée auditée</span>
                  {stockDay.audited_at && (
                    <span className="ml-2 text-green-800 opacity-70">
                      le {new Date(stockDay.audited_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  )}
                </>
              )}
              {isSubmitted && (
                <>
                  <span className="font-semibold text-blue-900">📩 Comptage reçu — en attente d'audit</span>
                  {stockDay.submitted_at && (
                    <span className="ml-2 text-blue-800 opacity-70">
                      envoyé {fmtRelative(stockDay.submitted_at)}
                    </span>
                  )}
                </>
              )}
              {isOpen && (
                <span className="font-semibold text-amber-900">⏳ Café est encore en train de compter — rapport non disponible</span>
              )}
            </div>

            {canRefresh && (
              <div className="flex items-center gap-2">
                {stockDay.last_odoo_refresh_at && (
                  <span className="text-[10px] text-ink-mute font-mono" title={new Date(stockDay.last_odoo_refresh_at).toLocaleString('fr-FR')}>
                    Stock Odoo : {fmtRelative(stockDay.last_odoo_refresh_at)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
                  title="Rafraîchir le stock Odoo"
                >
                  {refreshing ? (
                    <>⏳ <span>Rafraîchissement...</span></>
                  ) : (
                    <>🔄 <span>Rafraîchir Odoo</span></>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {refreshSuccess && (
          <div className="bg-green-100 border border-green-400 rounded-md px-3 py-2 text-[12px] text-green-900">
            {refreshSuccess}
          </div>
        )}
        {refreshError && (
          <div className="bg-red-100 border border-red-400 rounded-md px-3 py-2 text-[12px] text-red-900">
            ⚠ {refreshError}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-line rounded-lg p-12 text-center text-ink-mute text-[12px]">
            Chargement...
          </div>
        ) : !stockDay ? (
          <div className="bg-white border border-line rounded-lg p-12 text-center text-ink-mute text-[12px]">
            Aucun comptage enregistré pour ce jour.
          </div>
        ) : (
          <>
            {/* ============================================ */}
            {/* NOUVEAU : SECTION CONFLITS À ARBITRER */}
            {/* ============================================ */}
            {hasConflicts && (
              <div className="bg-white border-2 border-bordeaux rounded-lg overflow-hidden">
                <div className="bg-bordeaux text-cream px-4 py-2.5">
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-90">
                    ⚖ Conflits à arbitrer
                  </div>
                  <div className="font-semibold text-[13px] mt-0.5">
                    {discrepancyItems.length} écart{discrepancyItems.length > 1 ? 's' : ''} en attente de ton arbitrage
                  </div>
                </div>
                <div className="divide-y divide-line">
                  {discrepancyItems.map(it => {
                    const badge = DISCREPANCY_BADGE[it.discrepancy_status] || DISCREPANCY_BADGE.unresolved
                    return (
                      <div key={it.id} className="px-4 py-3 hover:bg-cream-warm/30">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium mb-1">{it.product_name}</div>
                            <div className="flex items-center gap-3 text-[11px] text-ink-mute mb-1">
                              <span>Envoyé : <strong className="text-ink">{it.qty_announced ?? '—'}</strong></span>
                              <span>·</span>
                              <span>Compté : <strong className="text-red-700">{it.qty_received ?? '—'}</strong></span>
                              {it.qty_announced != null && it.qty_received != null && (
                                <>
                                  <span>·</span>
                                  <span>
                                    Diff : <strong className={(it.qty_announced - it.qty_received) > 0 ? 'text-red-700' : 'text-blue-700'}>
                                      {(it.qty_announced - it.qty_received) > 0 ? '+' : ''}
                                      {it.qty_announced - it.qty_received}
                                    </strong>
                                  </span>
                                </>
                              )}
                            </div>
                            {it.reception_note && (
                              <div className="text-[10px] text-amber-800 italic mb-1">
                                💬 Café : "{it.reception_note}"
                              </div>
                            )}
                            {it.discrepancy_patissier_message && (
                              <div className="text-[10px] text-red-800 italic mb-1">
                                💬 Hamza : "{it.discrepancy_patissier_message}"
                              </div>
                            )}
                            <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full border ${badge.color} font-medium mt-1`}>
                              {badge.label}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setResolveModalItem(it)}
                            className="px-3 py-1.5 bg-bordeaux text-cream rounded-md text-[11px] font-medium hover:bg-bordeaux-deep flex-shrink-0"
                          >
                            ⚖ Trancher
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* STATS */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Compté (café)" value={stats.totalCounted} color="green" />
              <StatCard label="Stock Odoo actuel" value={stats.totalOdooCurrent || '—'} color="blue" />
              <StatCard label="Articles avec écart" value={stats.articlesWithGapCurrent} color="red" />
            </div>

            {(isSubmitted || isAudited) && report.length > 0 && stats.totalOdooCurrent === 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-[12px] text-amber-900">
                ⚠️ <strong>Snapshot Odoo non disponible.</strong> Clique "Rafraîchir Odoo" pour récupérer le stock actuel.
              </div>
            )}

            {/* TABLEAU RAPPORT */}
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line bg-cream-warm">
                <div className="text-[12px] font-semibold">Rapport d'écarts par article</div>
                <div className="text-[10px] text-ink-mute mt-0.5">
                  {report.length} article{report.length > 1 ? 's' : ''} · tri par catégorie
                </div>
              </div>

              {report.length === 0 ? (
                <div className="p-8 text-center text-ink-mute text-[12px]">
                  Aucun article comptabilisé.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-cream-warm border-b border-line">
                        <th className="text-left px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Article</th>
                        <th className="text-right px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute" title="Hamza a apporté">Apporté</th>
                        <th className="text-right px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute" title="Restes d'hier propagés">Reste hier</th>
                        <th className="text-right px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute bg-bordeaux/10" title="Café a compté en aveugle">Compté</th>
                        <th className="text-right px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-blue-800 bg-blue-50" title="Stock Odoo après dernier rafraîchissement">Odoo actuel</th>
                        <th className="text-right px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute" title="Écart actuel : Odoo actuel - Compté">Écart actuel</th>
                        <th className="text-center px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rendered = []
                        let lastCategory = null
                        for (const r of report) {
                          const cat = r.category_label || 'Autres'
                          if (cat !== lastCategory) {
                            rendered.push(
                              <tr key={`cat-${cat}`} className="bg-cream-warm/60">
                                <td colSpan={7} className="px-3 py-1.5 font-mono uppercase tracking-[0.15em] text-[10px] text-bordeaux-deep font-semibold">
                                  {cat}
                                </td>
                              </tr>
                            )
                            lastCategory = cat
                          }
                          const hasCurrent = r.qty_odoo_current !== null && r.qty_odoo_current !== undefined
                          const notCounted = !r.is_counted
                          const effQty = notCounted ? 0 : r.qty_counted
                          const effGapCurr = hasCurrent ? (r.qty_odoo_current - effQty) : null
                          const productDiscItems = discByProduct.get(r.product_name) || []
                          const hasConflict = productDiscItems.length > 0
                          return rendered.push(
                            <tr key={r.product_name} className={`border-b border-line ${
                              hasConflict ? 'bg-red-50/50' :
                              notCounted ? 'bg-amber-50/20' :
                              (effGapCurr !== null && effGapCurr !== 0 ? 'bg-orange-50/30' : '')
                            }`}>
                              <td className="px-3 py-2 font-medium">
                                {r.product_name}
                                {notCounted && (
                                  <span className="ml-2 inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[9px] font-medium align-middle">
                                    non compté
                                  </span>
                                )}
                                {hasConflict && (
                                  <span className="ml-2 inline-block bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[9px] font-medium align-middle">
                                    {productDiscItems.length} conflit{productDiscItems.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-ink-mute">{r.qty_morning || '—'}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-ink-mute">{r.qty_leftover || '—'}</td>
                              <td className={`px-2 py-2 text-right tabular-nums font-semibold bg-bordeaux/5 ${notCounted ? 'text-amber-700' : ''}`}>
                                {effQty}
                              </td>
                              <td className={`px-2 py-2 text-right tabular-nums bg-blue-50/50`}>
                                {hasCurrent ? r.qty_odoo_current : <span className="text-ink-mute italic">—</span>}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <GapBadge value={effGapCurr} bold />
                              </td>
                              <td className="px-2 py-2 text-center">
                                {hasConflict && productDiscItems.length === 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => setResolveModalItem(productDiscItems[0])}
                                    className="px-2 py-1 bg-bordeaux text-cream rounded text-[10px] font-medium hover:bg-bordeaux-deep"
                                  >
                                    ⚖
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          )
                        }
                        return rendered
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-white border border-line rounded-md p-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-900 font-semibold">+ rouge</span>
                <span className="text-ink-mute ml-2">Stock Odoo &gt; compté — vol, casse non saisie, erreur de comptage</span>
              </div>
              <div className="bg-white border border-line rounded-md p-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-semibold">− bleu</span>
                <span className="text-ink-mute ml-2">Stock Odoo &lt; compté — ventes non syncées, ou erreur</span>
              </div>
            </div>

            {isSubmitted && (
              <div className="bg-white border border-line rounded-lg p-4">
                <div className="text-[12px] font-semibold mb-2">Notes d'audit (optionnel)</div>
                <textarea
                  value={auditNotes}
                  onChange={e => setAuditNotes(e.target.value)}
                  placeholder="Observations, anomalies, actions à mener..."
                  rows={3}
                  className="w-full px-3 py-2 text-[12px] border border-line rounded-md mb-3"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAudit}
                    disabled={auditing}
                    className="px-4 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-md text-[12px] font-medium tracking-wider disabled:opacity-50"
                  >
                    {auditing ? 'Validation...' : '✓ Valider définitivement'}
                  </button>
                </div>
              </div>
            )}

            {isAudited && stockDay.audit_notes && (
              <div className="bg-white border border-line rounded-lg p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-ink-mute mb-1">Notes d'audit</div>
                <div className="text-[12px] whitespace-pre-wrap">{stockDay.audit_notes}</div>
              </div>
            )}
          </>
        )}

        {/* HISTORIQUE */}
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-lg flex items-center justify-between mt-8">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              Historique stock boutique
            </div>
            <div className="font-semibold text-[14px] italic">{historyDaysBack} derniers jours</div>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setHistoryDaysBack(n)}
                className={`px-3 py-1 text-[11px] rounded-md transition-colors ${
                  historyDaysBack === n ? 'bg-cream text-bordeaux font-semibold' : 'bg-bordeaux-deep text-cream/80 hover:bg-bordeaux/60'
                }`}
              >
                {n}j
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-line rounded-lg overflow-hidden">
          {historyDays.length === 0 ? (
            <div className="p-8 text-center text-ink-mute text-[12px]">
              Aucune journée enregistrée sur la période.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-cream-warm border-b border-line">
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Date</th>
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Statut</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Apporté</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Reçu</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Compté</th>
                  <th className="text-right px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute">Audit</th>
                </tr>
              </thead>
              <tbody>
                {historyDays.map(d => {
                  const isCurrentDay = d.day === day
                  const statusInfo = STATUS_LABELS[d.status] || STATUS_LABELS.open
                  return (
                    <tr
                      key={d.stock_day_id}
                      onClick={() => setDay(d.day)}
                      className={`border-b border-line cursor-pointer hover:bg-cream-warm ${isCurrentDay ? 'bg-bordeaux/10' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        {isCurrentDay && <div className="text-[9px] text-bordeaux font-mono uppercase tracking-wider">Affiché ci-dessus</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.qty_announced_total || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.qty_received_total || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-900">{d.qty_counted_total || '—'}</td>
                      <td className="px-3 py-2 text-right text-[10px] text-ink-mute">
                        {d.audited_at ? new Date(d.audited_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="text-[10px] text-ink-mute italic">
          Clique une ligne pour afficher le rapport détaillé de cette journée ci-dessus.
        </div>
      </div>

      {/* MODAL TRANCHER */}
      {resolveModalItem && (
        <AuditResolveModal
          item={resolveModalItem}
          onClose={() => setResolveModalItem(null)}
          onResolve={handleResolveInFavorOf}
          onOverrideQty={handleOverrideQty}
        />
      )}
    </div>
  )
}

// =============================================================
// SOUS-COMPOSANTS
// =============================================================

function GapBadge({ value, bold = false }) {
  if (value === null || value === undefined) return <span className="text-ink-mute">—</span>
  if (value === 0) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-900 font-medium">
        ✓ OK
      </span>
    )
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${
      value > 0 ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900'
    }`}>
      {value > 0 ? '+' : ''}{value}
    </span>
  )
}

function StatCard({ label, value, color }) {
  const styles = {
    green: 'bg-green-100 text-green-900',
    blue: 'bg-blue-100 text-blue-900',
    orange: 'bg-orange-100 text-orange-900',
    red: 'bg-red-100 text-red-900',
    amber: 'bg-amber-100 text-amber-900',
  }
  return (
    <div className={`p-3 rounded-md text-center ${styles[color] || styles.green}`}>
      <div className="text-[10px] tracking-[0.15em] uppercase opacity-70 mb-1">{label}</div>
      <div className="text-[22px] font-semibold">{value}</div>
    </div>
  )
}

