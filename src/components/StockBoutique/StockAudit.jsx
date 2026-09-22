// src/components/StockBoutique/StockAudit.jsx
// Écran AUDIT — Équipe dédiée (perm_stock_audit)
// v3 : section "Conflits à arbitrer" + modal Trancher
// =============================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import { RefreshCw, Scale } from 'lucide-react'
import AppHeader from '../AppHeader'
import PrintButton from './PrintButton'
import AuditResolveModal from './AuditResolveModal'
import {
  getOrCreateStockDay,
  loadStockDay,
  buildAuditReport,
  auditStockDay,
  submitStockDay,
  triggerOdooSnapshot,
  subscribeToDayItems,
  subscribeToStockDay,
  loadDaySummary,
  loadDiscrepancyItems,
  auditOverrideQty,
  auditResolveInFavorOf,
  todayISO,
  loadVentesDuJour,
  cleVente,
} from '../../lib/stockBoutique'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

const STATUS_LABELS = {
  open: { label: '… En cours', color: 'bg-amber-100 text-amber-900' },
  submitted: { label: 'Envoyé audit', color: 'bg-blue-100 text-blue-900' },
  audited: { label: '✓ Audité', color: 'bg-green-100 text-green-900' },
}

const DISCREPANCY_BADGE = {
  pending_patissier: { label: '⏳ Hamza n\'a pas répondu', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  pending_cafe: { label: '⏳ Hamza dit "recompte"', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  unresolved: { label: '⚠ Désaccord total', color: 'bg-red-100 text-red-900 border-red-300' },
  audit_resolved: { label: '✓ Tranché par audit', color: 'bg-green-100 text-green-900 border-green-300' },
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
  /**
   * ⚠️ ON OUVRE SUR LA DERNIÈRE JOURNÉE CLÔTURÉE, PAS SUR AUJOURD'HUI.
   *
   * « Le premier rapport qu'on voit quand on ouvre, c'est de quel jour ? Ça
   * doit être toujours le rapport de la veille, vu que la journée n'est pas
   * clôturée » (Layla, 2026-09-22).
   *
   * Elle a raison, et c'est une question d'horaire : le café compte à 19 h, la
   * journée se clôt à 23 h, et la personne qui traite les écarts travaille LE
   * MATIN. À 9 h, la journée du jour est vide — on lui ouvrait donc un écran
   * sans rien, et c'est à elle de comprendre qu'il fallait reculer d'un jour.
   *
   * ⚠️ Mais pas « hier » en dur : la dernière journée CLÔTURÉE. Si celle du
   * jour est déjà fermée (elle regarde le soir), c'est elle qu'il faut montrer ;
   * et si le café n'a pas compté hier, on remonte à avant-hier plutôt que
   * d'ouvrir sur du vide.
   */
  const veille = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toLocaleDateString('sv-SE')
  }
  const [day, setDay] = useState(veille())
  // Ne se fait qu'UNE fois : après, c'est elle qui choisit sa date.
  const jourChoisi = useRef(false)
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
      if (!mounted) return
      setHistoryDays(d)
      // La plus récente journée qui a vraiment quelque chose à montrer.
      if (!jourChoisi.current) {
        jourChoisi.current = true
        const clos = (d || []).find(x => x.status === 'submitted' || x.status === 'audited')
        if (clos && clos.day !== day) setDay(clos.day)
      }
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

  const canForceClose = user?.role === 'admin' || user?.perm_stock_audit === true
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

  // ⚠️ « Le tableau est long » (Layla, 2026-09-22) : sur ~214 articles, une
  // poignée demande une décision. On ne montre que ceux-là, et l'interrupteur
  // rend le tableau entier quand elle veut vérifier autre chose.
  const [ecartsSeuls, setEcartsSeuls] = useState(true)
  // ⚠️ CE QUI A ÉTÉ VENDU VIENT DE LA CAISSE, pas d'un calcul (Layla,
  // 2026-09-22 : « est-ce qu'on fait rentrer vendu ? » — non, et il ne faut
  // pas : deux sources finissent toujours par diverger). Il explique l'écart :
  // reçu + reste − vendu = ce qui devrait rester.
  const [ventes, setVentes] = useState({})
  // La ligne dépliée : ses horaires de vente (« un détail si on clique »).
  const [detailOuvert, setDetailOuvert] = useState(null)

  useEffect(() => {
    let vivant = true
    // Silencieux : la caisse est un bonus, pas une dépendance. Si elle ne
    // répond pas, le tableau reste entier, juste sans la colonne remplie.
    loadVentesDuJour(day).then(v => { if (vivant) setVentes(v) }).catch(() => { })
    return () => { vivant = false }
  }, [day])

  /**
   * Ce qui mérite vraiment un regard : un écart, ou un conflit de réception.
   *
   * ⚠️ Un article NON COMPTÉ n'en fait pas partie — ce n'est pas un écart, c'est
   * du comptage qui reste à faire. Il est annoncé à part, sous le tableau.
   */
  const aUnEcart = r => {
    if (r.is_conflict_row) return true
    if (!r.is_counted) return false
    if (r.qty_odoo_current === null || r.qty_odoo_current === undefined) return false
    return (r.qty_odoo_current - (r.qty_counted || 0)) !== 0
  }
  const nbPasComptes = useMemo(
    () => report.filter(r => !r.is_counted && !r.is_conflict_row).length, [report])

  async function handleForceClose() {
    if (!stockDay) return
    if (!await confirmDialog("Forcer la clôture sans que le café ait fini de compter ?\n\nLe rapport sera généré avec les données disponibles. Cette action est réservée aux admins.", { danger: true, confirmLabel: 'Forcer' })) return
    try {
      setAuditing(true)
      await submitStockDay(stockDay.id, user.id)
      const sd = await loadStockDay(day)
      setStockDay(sd)
      const r = await buildAuditReport(sd.id)
      setReport(r)
    } catch (e) {
      toast.error('Erreur forçage clôture : ' + (e.message || e))
    } finally {
      setAuditing(false)
    }
  }

  async function handleAudit() {
    if (!stockDay) return
    if (!await confirmDialog("Valider définitivement la journée ?\n\nAprès validation, plus aucune modification du comptage ne sera possible.\nTu pourras toujours rafraîchir le stock Odoo pour comparer.", { confirmLabel: 'Valider' })) return
    try {
      setAuditing(true)
      await auditStockDay(stockDay.id, user.id, auditNotes.trim() || null)
      const sd = await loadStockDay(day)
      setStockDay(sd)
    } catch (e) {
      toast.error('Erreur validation : ' + (e.message || e))
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

  // Séparation : en attente d'arbitrage vs déjà tranchés
  const pendingItems = useMemo(
    () => discrepancyItems.filter(it => it.discrepancy_status !== 'audit_resolved'),
    [discrepancyItems]
  )
  const resolvedItems = useMemo(
    () => discrepancyItems.filter(it => it.discrepancy_status === 'audit_resolved'),
    [discrepancyItems]
  )
  const hasPending = pendingItems.length > 0
  const hasResolved = resolvedItems.length > 0

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* HEADER + sélecteur date */}
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-2xl flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
              Rapport audit stock
            </div>
            {/* ⚠️ LA DATE, EN TOUTES LETTRES ET SANS AMBIGUÏTÉ (Layla,
                2026-09-22 : « le premier rapport qu'on voit quand on ouvre,
                c'est de quel jour ? mentionner la date »). On ouvre sur la
                veille : sans le dire, on lit les chiffres d'hier en croyant
                lire ceux d'aujourd'hui. */}
            <div className="font-semibold text-[14px] italic">
              {new Date(day).toLocaleDateString('fr-FR',
                { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {(() => {
                const q = day === todayISO() ? 'aujourd’hui' : day === veille() ? 'hier' : null
                return q ? <span className="not-italic font-normal opacity-80"> · {q}</span> : null
              })()}
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
              className="px-2 py-1 bg-white text-ink rounded-md text-[11px] border border-cream/30"
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
              {/* ⚠️ « Comptage reçu — en attente d'audit · envoyé il y a 19 min »
                  RETIRÉ (Layla, 2026-09-22). Le bandeau porte déjà l'état de la
                  journée ; répéter « en attente d'audit » à quelqu'un qui est
                  justement en train de l'auditer ne lui apprend rien. Et
                  l'heure de clôture se lit dans l'historique, là où elle sert
                  vraiment à juger si le rapport est fiable. */}
              {isOpen && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-amber-900">⏳ Café est encore en train de compter — rapport non disponible</span>
                  {canForceClose && (
                    <button
                      type="button"
                      onClick={handleForceClose}
                      disabled={auditing}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-medium transition-colors disabled:opacity-50"
                      title="Réservé admins / audit"
                    >
                      Forcer la clôture
                    </button>
                  )}
                </div>
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
                    <><RefreshCw size={14} strokeWidth={1.8} className="animate-spin" /> <span>Rafraîchissement...</span></>
                  ) : (
                    <><RefreshCw size={14} strokeWidth={1.8} /> <span>Rafraîchir Odoo</span></>
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
          <div className="bg-white border border-line rounded-2xl p-12 text-center text-ink-mute text-[12px] shadow-[0_8px_24px_rgba(122,42,68,0.07)]">
            Chargement...
          </div>
        ) : !stockDay ? (
          <div className="bg-white border border-line rounded-2xl p-12 text-center text-ink-mute text-[12px] shadow-[0_8px_24px_rgba(122,42,68,0.07)]">
            Aucun comptage enregistré pour ce jour.
          </div>
        ) : (
          <>
            {/* ⚠️ LES TROIS CASES DE TOTAUX SONT PARTIES (Layla, 2026-09-22 :
                « COMPTÉ 225 / STOCK ODOO 230 / ARTICLES AVEC ÉCART 39, c'est
                inutile »). Un total de pommes et de cafés ne veut rien dire, et
                le compte d'écarts était faux : il comptait les articles NON
                COMPTÉS comme des écarts. Ce qui sert est dans le tableau. */}

            {(isSubmitted || isAudited) && report.length > 0 && stats.totalOdooCurrent === 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-[12px] text-amber-900">
                <strong>Snapshot Odoo non disponible.</strong> Clique "Rafraîchir Odoo" pour récupérer le stock actuel.
              </div>
            )}

            {/* Les écarts à trancher sont sous le tableau, qui fait souvent
                plusieurs dizaines de lignes : on les annonce ici. */}
            {hasPending && (
              <button
                onClick={() => document.getElementById('conflits-arbitrage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="w-full flex items-center gap-2 bg-bordeaux text-cream rounded-2xl px-4 py-3 text-left hover:bg-bordeaux-deep transition-colors"
              >
                <span className="font-semibold text-[13px]">
                  {pendingItems.length} écart{pendingItems.length > 1 ? 's' : ''} en attente de ton arbitrage
                </span>
                <span className="ml-auto text-[12px] opacity-90">Voir ↓</span>
              </button>
            )}

            {/* TABLEAU RAPPORT */}
            <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-line bg-cream-warm flex items-center gap-3 flex-wrap">
                <div>
                  <div className="text-[12px] font-semibold">Rapport d'écarts par article</div>
                  {/* ⚠️ « 19 écarts sur 124 articles » RETIRÉ (Layla,
                      2026-09-22) : le tableau juste en dessous les montre, et
                      les compter au-dessus n'ajoute rien — c'était le même
                      reproche que les trois cases de totaux. */}
                </div>
                {/* L'interrupteur : même objet que dans Mini/maxi, même geste. */}
                <button
                  type="button" role="switch" aria-checked={ecartsSeuls}
                  onClick={() => setEcartsSeuls(v => !v)}
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-full border-[1.5px]
                    px-3 py-1.5 text-[12px] font-bold transition
                    ${ecartsSeuls ? 'bg-green-50 text-green-800 border-green-300'
    : 'bg-cream text-ink-mute border-cream-deep'}`}>
                  <span className={`relative w-[30px] h-[17px] rounded-full flex-none transition-colors
                    ${ecartsSeuls ? 'bg-green-600' : 'bg-ink-mute/40'}`}>
                    <span className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white transition-all
                      ${ecartsSeuls ? 'left-[15px]' : 'left-[2px]'}`} />
                  </span>
                  {ecartsSeuls ? 'Écarts seulement' : 'Tout voir'}
                </button>
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
                        {/* ⚠️ DES EN-TÊTES QUI RACONTENT (Layla, 2026-09-22 :
                            « j'aime bien ces titres, c'est plus clair que REÇU
                            RESTE HIER COMPTÉ VENDU ODOO ACTUEL ÉCART ACTUEL »).
                            Les anciens nommaient des CASES ; ceux-ci suivent le
                            chemin du gâteau, de gauche à droite : ce qui est
                            arrivé, ce qui est parti, ce qui devrait rester, ce
                            qui reste vraiment. */}
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-ink-mute">article</th>
                        {/* ⚠️ « Apporté » A DISPARU (Layla, 2026-09-22 : « est-ce
                            qu'en général reçu et apporté sont pareils ? si c'est
                            le cas garder que reçu »). Mesuré sur 252 lignes :
                            UNE SEULE différait — 0,4 %. La colonne était donc
                            vide de sens 99,6 % du temps, et ce sont ces
                            colonnes-là qui rendent un tableau illisible. Quand
                            les deux diffèrent, c'est écrit sous le chiffre. */}
                        {/* « reçu » et « reste d'hier » n'en font qu'un : ce
                            qui était là au départ. Le second reste lisible, en
                            petit, à côté du premier. */}
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-ink-mute" title="Ce qui était là au départ : reçu ce matin + reste d'hier">reçu + reste</th>
                        {/* ⚠️ Informative, et prise à la CAISSE : personne ne la
                            saisit. Clique la ligne pour voir les heures. */}
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-ink-mute" title="Vendu d'après la caisse — clique la ligne pour les heures">vendu</th>
                        {/* ⚠️ NOUVEAU, et c'est le calcul qu'elle faisait de
                            tête à chaque ligne : reçu + reste − vendu. */}
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-ink-mute" title="reçu + reste − vendu">devrait rester</th>
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-ink-mute bg-bordeaux/10" title="Café a compté en aveugle">compté</th>
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-blue-800 bg-blue-50" title="Stock Odoo après dernier rafraîchissement">Odoo</th>
                        {/* ⚠️ L'ÉCART SE DIT EN TOUTES LETTRES (Layla : « boutique
                            lui manque 1 odoo », puis « 1 de plus qu'Odoo = 1 de
                            plus EN BOUTIQUE »). « +8 » obligeait à se rappeler
                            dans quel sens compte le signe ; « il manque 8 en
                            boutique » se lit sans réfléchir. Et les deux sens
                            parlent de la BOUTIQUE, pas d'Odoo. */}
                        <th className="text-left px-2 py-2 text-[10px] font-bold text-ink-mute"> </th>
                        <th className="text-center px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rendered = []
                        let lastCategory = null
                        for (const r of report) {
                          // Skip les lignes complètement vides (tout à 0 ou null)
                          const allZero = (
                            (!r.qty_morning_announced || r.qty_morning_announced === 0) &&
                            (!r.qty_morning_received || r.qty_morning_received === 0) &&
                            (!r.qty_leftover || r.qty_leftover === 0) &&
                            (!r.qty_counted || r.qty_counted === 0) &&
                            (!r.qty_odoo_current || r.qty_odoo_current === 0)
                          )
                          if (allZero) continue
                          // ⚠️ Le filtre vient APRÈS le saut des lignes vides :
                          // une catégorie ne doit pas s'afficher pour rien.
                          if (ecartsSeuls && !aUnEcart(r)) continue
                          const cat = r.category_label || 'Autres'
                          if (cat !== lastCategory) {
                            rendered.push(
                              <tr key={`cat-${cat}`} className="bg-cream-warm/60">
                                <td colSpan={8} className="px-3 py-1.5 font-mono uppercase tracking-[0.15em] text-[10px] text-bordeaux-deep font-semibold">
                                  {cat}
                                </td>
                              </tr>
                            )
                            lastCategory = cat
                          }
                          const hasCurrent = r.qty_odoo_current !== null && r.qty_odoo_current !== undefined
                          const notCounted = !r.is_counted
                          const effQty = notCounted ? 0 : r.qty_counted
                          // ⚠️ « PAS COMPTÉ » N'EST PAS « COMPTÉ ZÉRO » (Layla,
                          // 2026-09-22). Un article qu'on n'a pas eu le temps de
                          // compter affichait un écart égal à TOUT son stock
                          // Odoo — d'où les 39 « écarts » annoncés en haut de
                          // l'écran, pour une poignée de vrais. Ce n'est pas un
                          // écart, c'est du comptage qui reste à faire.
                          const effGapCurr = (hasCurrent && !notCounted)
                            ? (r.qty_odoo_current - effQty) : null
                          const isConflictRow = r.is_conflict_row
                          const conflictItems = r.conflict_items || []
                          const rowKey = `${r.product_name}-${isConflictRow ? 'conflict' : 'ok'}`
                          const vente = ventes[cleVente(r.product_name)] || null
                          const ouvert = detailOuvert === rowKey
                          rendered.push(
                            <tr key={rowKey}
                              onClick={() => setDetailOuvert(ouvert ? null : rowKey)}
                              className={`border-b border-line cursor-pointer ${
                                isConflictRow ? 'bg-red-50/60' :
                                notCounted ? 'bg-amber-50/20' :
                                (effGapCurr !== null && effGapCurr !== 0 ? 'bg-orange-50/30' : '')
                              }`}>
                              <td className="px-3 py-2 font-medium">
                                {r.product_name}
                                {isConflictRow && (
                                  <span className="ml-2 inline-block bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[9px] font-medium align-middle">
                                    {conflictItems.length} conflit{conflictItems.length > 1 ? 's' : ''}
                                  </span>
                                )}
                                {!isConflictRow && notCounted && (
                                  <span className="ml-2 inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[9px] font-medium align-middle">
                                    non compté
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                {(() => {
                                  const recu = r.qty_morning_received || 0
                                  const annonce = r.qty_morning_announced || 0
                                  const reste = r.qty_leftover || 0
                                  if (!recu && !annonce && !reste) return <span className="text-ink-mute">—</span>
                                  return (
                                    <span>
                                      <span className={recu !== annonce && annonce ? 'font-medium text-amber-800' : ''}>{recu}</span>
                                      {!!reste && <span className="text-ink-mute text-[11px]"> + {reste}</span>}
                                      {/* Le cas rare (0,4 %) : le pâtissier disait autre chose. */}
                                      {!!annonce && recu !== annonce && (
                                        <span className="block text-[9px] text-amber-700">{annonce} apportés</span>
                                      )}
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-ink-soft">
                                {vente ? Math.round(vente.total) : <span className="text-ink-mute">—</span>}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums font-semibold text-ink-soft">
                                {vente
                                  ? (r.qty_morning_received || 0) + (r.qty_leftover || 0) - Math.round(vente.total)
                                  : <span className="text-ink-mute">—</span>}
                              </td>
                              <td className={`px-2 py-2 text-right tabular-nums font-bold bg-bordeaux/5 ${notCounted ? 'text-amber-700' : ''}`}>
                                {isConflictRow ? <span className="text-red-700 italic">—</span> : effQty}
                              </td>
                              <td className={`px-2 py-2 text-right tabular-nums bg-blue-50/50`}>
                                {hasCurrent ? r.qty_odoo_current : <span className="text-ink-mute italic">—</span>}
                              </td>
                              <td className="px-2 py-2 text-left text-[11.5px] whitespace-nowrap">
                                {isConflictRow ? <span className="text-ink-mute italic text-[10px]">à arbitrer</span>
                                  : notCounted ? <span className="text-amber-700 text-[10px]">pas compté</span>
                                    : effGapCurr === null ? <span className="text-ink-mute">—</span>
                                      : effGapCurr === 0 ? <span className="text-green-700 font-bold">✓</span>
                                        : effGapCurr > 0
                                          ? <span className="text-red-700 font-bold">il manque {effGapCurr} en boutique</span>
                                          : <span className="text-blue-800 font-bold">{-effGapCurr} de plus en boutique</span>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {isConflictRow && conflictItems.length === 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => setResolveModalItem(conflictItems[0])}
                                    className="px-2 py-1 bg-bordeaux text-cream rounded text-[10px] font-medium hover:bg-bordeaux-deep"
                                    title="Trancher"
                                  >
                                    <Scale size={13} strokeWidth={1.8} />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          )
                          /* ⚠️ LE DÉTAIL AU CLIC (Layla, 2026-09-22 : « avec un
                             détail si on clique, des horaires vendus de cet
                             article »). Les heures viennent de la caisse, et la
                             ligne de calcul dit d'où sort l'écart — sans elle,
                             « −8 » ne s'explique pas tout seul. */
                          if (ouvert) {
                            rendered.push(
                              <tr key={`${rowKey}-detail`} className="border-b border-line bg-amber-50/20">
                                <td colSpan={8} className="px-3 py-2.5">
                                  {vente && (vente.moments || []).length > 0 ? (
                                    /* ⚠️ L'HEURE EXACTE (Layla, 2026-09-22 : « mets-moi
                                       l'heure exacte d'achat »). « 10h : 7 » disait
                                       combien, jamais quand — or c'est le QUAND qui
                                       permet de rapprocher une vente d'une découpe ou
                                       d'un passage. La quantité ne s'écrit que si le
                                       ticket en portait plusieurs. */
                                    /* ⚠️ EN LISTE VERTICALE (Layla, 2026-09-22). En
                                       pastilles qui s'enroulent, l'œil saute d'une
                                       ligne à l'autre et on perd le fil de la
                                       journée. L'une sous l'autre, on lit une
                                       chronologie — et les paquets vendus à la même
                                       minute sautent aux yeux. */
                                    <div className="inline-block min-w-[124px] bg-white border border-line rounded-lg overflow-hidden">
                                      {vente.moments.map((m, i) => (
                                        <div key={`${m.h}-${i}`}
                                          className="flex items-baseline gap-3 px-2.5 py-1 text-[12px] tabular-nums
                                                     border-b border-line/60 last:border-0">
                                          <span className="text-ink-soft">{m.h}</span>
                                          {Math.round(m.qty) !== 1 && (
                                            <b className="ml-auto text-bordeaux">×{Math.round(m.qty)}</b>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-[11.5px] text-ink-mute">Aucune vente enregistrée ce jour-là.</div>
                                  )}
                                  {/* ⚠️ LA LIGNE DE CALCUL EST PARTIE (Layla,
                                      2026-09-22). Je l'avais écrite quand le
                                      tableau ne disait ni « vendu » ni « devrait
                                      rester » : elle servait alors à expliquer
                                      l'écart. Depuis que les colonnes le font,
                                      elle répétait mot pour mot la ligne du
                                      dessus. Le dépli ne sert plus qu'à UNE
                                      chose : les heures. */}
                                </td>
                              </tr>
                            )
                          }
                        }
                        return rendered
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
              {/* ⚠️ LES NON-COMPTÉS SE DISENT, MAIS PAS COMME DES ÉCARTS : c'est
                  une tâche du lendemain, pas une perte à expliquer. */}
              {nbPasComptes > 0 && (
                <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-[11.5px] text-amber-900">
                  ⏳ {nbPasComptes} article{nbPasComptes > 1 ? 's' : ''} pas compté{nbPasComptes > 1 ? 's' : ''}
                  {' — '}ils ne comptent pas comme des écarts.
                </div>
              )}
            </div>

            {/* ⚠️ LA LÉGENDE « + rouge / − bleu » EST PARTIE (Layla,
                2026-09-22). Elle expliquait tous les jours la même chose à
                quelqu'un qui la connaît par cœur — et depuis que la ligne
                s'ouvre sur ses horaires de vente et son calcul, l'écart
                s'explique tout seul, article par article. */}

            {/* ============================================ */}
            {/* SECTION CONFLITS À ARBITRER */}
            {/* ============================================ */}
            {hasConflicts && (
              <div id="conflits-arbitrage" className="bg-white border-2 border-bordeaux rounded-2xl overflow-hidden shadow-sm scroll-mt-4">
                <div className="bg-bordeaux text-cream px-4 py-2.5">
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-90">
                    Conflits
                  </div>
                  <div className="font-semibold text-[13px] mt-0.5">
                    {hasPending
                      ? `${pendingItems.length} écart${pendingItems.length > 1 ? 's' : ''} en attente de ton arbitrage`
                      : `${resolvedItems.length} écart${resolvedItems.length > 1 ? 's' : ''} tranché${resolvedItems.length > 1 ? 's' : ''}`}
                    {hasPending && hasResolved && (
                      <span className="opacity-80 font-normal ml-2">
                        · {resolvedItems.length} déjà tranché{resolvedItems.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* SOUS-SECTION : EN ATTENTE */}
                {hasPending && (
                  <div className="divide-y divide-line">
                    {pendingItems.map(it => {
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
                                  Café : "{it.reception_note}"
                                </div>
                              )}
                              {it.discrepancy_patissier_message && (
                                <div className="text-[10px] text-red-800 italic mb-1">
                                  Vitrine : "{it.discrepancy_patissier_message}"
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
                              Trancher
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* SOUS-SECTION : DÉJÀ TRANCHÉS (lecture seule, repliable) */}
                {hasResolved && (
                  <details className="border-t border-line bg-green-50/30" open={!hasPending}>
                    <summary className="px-4 py-2 cursor-pointer text-[11px] font-mono uppercase tracking-wider text-green-900 hover:bg-green-50">
                      ✓ {resolvedItems.length} écart{resolvedItems.length > 1 ? 's' : ''} déjà tranché{resolvedItems.length > 1 ? 's' : ''}
                    </summary>
                    <div className="divide-y divide-line">
                      {resolvedItems.map(it => {
                        const inFavor = it.discrepancy_resolved_in_favor_of
                        const finalQty = it.qty_announced ?? '—'
                        return (
                          <div key={it.id} className="px-4 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{it.product_name}</span>
                                <span className="text-ink-mute ml-2">→ apporté final : <strong className="text-ink">{finalQty}</strong></span>
                                {inFavor === 'patissier' && (
                                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">Vitrine a raison</span>
                                )}
                                {inFavor === 'cafe' && (
                                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-900">Café a raison</span>
                                )}
                                {!inFavor && (
                                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-900">Corrigé par audit</span>
                                )}
                              </div>
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-900 border border-green-300 font-medium">
                                ✓ Tranché
                              </span>
                            </div>
                            {it.audit_note && (
                              <div className="text-[10px] text-ink-mute italic mt-1 ml-2">
                                Note : "{it.audit_note}"
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ⚠️ LE CHAMP « Notes d'audit (optionnel) » EST RETIRÉ (Layla,
                2026-09-22) — optionnel et jamais rempli, il occupait le bas de
                l'écran devant le seul bouton qui compte. Le bouton reste, lui,
                exactement là où il était. La colonne existe toujours en base :
                les notes déjà écrites s'affichent encore plus bas. */}
            {isSubmitted && (
              <div className="bg-white border border-line rounded-lg p-4">
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
        <div className="bg-bordeaux text-cream px-4 py-3 rounded-t-2xl flex items-center justify-between mt-8">
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

        <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
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
                  {/* ⚠️ « Apporté » part d'ici aussi : mêmes 0,4 % de
                      différence que dans le tableau du haut. Et « Réception »
                      (l'écart entre les deux) était donc vide presque toujours.
                      À leur place, LA CHOSE QUI MANQUAIT : à quelle heure la
                      journée a été clôturée. C'est elle qui décide si le
                      rapport est fiable — une clôture le lendemain matin prend
                      la photo Odoo APRÈS les ventes du jour. */}
                  <th className="text-left px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-ink-mute" title="Quand la photo du stock Odoo a été prise">Clôturé</th>
                  {/* ⚠️ « REÇU · COMPTÉ · AUDIT » RETIRÉS (Layla, 2026-09-22).
                      Des totaux de pommes et de cafés additionnés — la même
                      chose que les trois cases supprimées en haut. L'historique
                      sert à CHOISIR une journée, pas à la juger : sa date, son
                      état, et l'heure de clôture qui dit si on peut la croire. */}
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
                      <td className="px-3 py-2">{
                        (() => {
                          if (!d.submitted_at) return <span className="text-ink-mute">—</span>
                          const q = new Date(d.submitted_at)
                          const opt = { timeZone: 'Africa/Casablanca' }
                          const h = q.toLocaleTimeString('fr-FR', { ...opt, hour: '2-digit', minute: '2-digit' })
                          // ⚠️ CLÔTURÉE LE LENDEMAIN = RAPPORT DOUTEUX. La photo
                          // du stock Odoo est prise à la clôture : le lendemain
                          // matin, elle inclut déjà les ventes du jour. Une
                          // journée sur deux était dans ce cas avant la clôture
                          // automatique de 23 h.
                          const jourClot = q.toLocaleDateString('sv-SE', opt)
                          const tard = jourClot !== d.day
                          return (
                            <span className={tard ? 'text-amber-800' : 'text-ink-soft'}>
                              {h}
                              {tard && (
                                <span className="block text-[9px] font-semibold" title="La photo Odoo a été prise après le début des ventes du lendemain">
                                  ⚠ le lendemain
                                </span>
                              )}
                            </span>
                          )
                        })()
                      }</td>

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


function StatCard({ label, value, color }) {
  const styles = {
    green: 'bg-green-100 text-green-900',
    blue: 'bg-blue-100 text-blue-900',
    orange: 'bg-orange-100 text-orange-900',
    red: 'bg-red-100 text-red-900',
    amber: 'bg-amber-100 text-amber-900',
  }
  return (
    <div className={`p-4 rounded-2xl text-center shadow-sm ${styles[color] || styles.green}`}>
      <div className="text-[10px] tracking-[0.15em] uppercase opacity-70 mb-1">{label}</div>
      <div className="text-[22px] font-semibold">{value}</div>
    </div>
  )
}

