// src/components/StockBoutique/StockGS.jsx
// Vue stock dediee aux GS- SALES (cocktails datinatoires, mini-pizza, etc.)
// Exclut les GS- qui sont en realite des produits Prod (cookies, plateaux gateau sec, plateaux mini cakes sucres)
// Permission : perm_stock_gs (case dediee dans Admin Users)
//
// La vue reprend la logique de StockAudit (via buildAuditReport) mais
// ne filtre que les produits GS- salues et affiche seulement les colonnes utiles
// pour le refill (nom + stock vitrine actuel + indication de bas stock).
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import AppHeader from '../AppHeader'
import {
  getOrCreateStockDay,
  loadStockDay,
  buildAuditReport,
  subscribeToDayItems,
  triggerOdooSnapshot,
  todayISO,
} from '../../lib/stockBoutique'

// Patterns qui doivent etre exclus de la vue Stock GS- car ce sont
// soit des produits "Prod" deguises avec un prefixe GS-, soit des plateaux
// (qui sont des composes/regroupements, pas des articles vendus a l'unite).
const GS_PROD_PATTERNS = [
  /^GS-\s*plateau/i,                              // tous les plateaux (gateau sec, mini cakes, etc.)
  /^GS-\s*cookies?\b/i,                           // cookies (sont en Prod sucree)
]

// Nettoie le nom : retire le code Odoo [123] en tete
function cleanName(name) {
  if (!name) return ''
  return String(name).replace(/^\[\d+\]\s*/, '').trim()
}

// True si le produit est un GS- "vraiment sale" (pas un pattern prod)
function isGSSale(productName) {
  const clean = cleanName(productName)
  if (!/^GS-/i.test(clean)) return false
  return !GS_PROD_PATTERNS.some(rx => rx.test(clean))
}

// Determine le "stock actuel" d'une ligne du rapport.
// Priorite :
//   1. qty_odoo_current : snapshot Odoo actuel (le plus fiable car saisi cote Odoo)
//   2. qty_received : compte de fin de journee
//   3. qty_morning + qty_leftover : envoye matin + restes hier
function currentStock(line) {
  if (line.qty_odoo_current != null) return line.qty_odoo_current
  if (line.qty_received != null) return line.qty_received
  const morning = parseFloat(line.qty_morning) || 0
  const leftover = parseFloat(line.qty_leftover) || 0
  const computed = morning + leftover
  return computed > 0 ? computed : 0
}

export default function StockGS({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDay, setStockDay] = useState(null)
  const [report, setReport] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingOdoo, setRefreshingOdoo] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [day] = useState(todayISO())

  useEffect(() => {
    let mounted = true
    let itemsSub = null

    async function reload(sd) {
      const r = await buildAuditReport(sd.id)
      if (mounted) setReport(r)
    }

    async function init() {
      try {
        setLoading(true)
        const sd = day === todayISO() ? await getOrCreateStockDay(day) : await loadStockDay(day)
        if (!mounted) return
        setStockDay(sd)
        if (sd) {
          // OPTIMISATION CPU : pas de sync auto Odoo a l'ouverture (le sync auto
          // toutes les minutes par user consommait beaucoup de CPU Vercel).
          // Le bouton "🔄 Sync Odoo" reste disponible pour forcer une synchro
          // manuelle quand l'utilisateur en a besoin.
          await reload(sd)
          itemsSub = subscribeToDayItems(sd.id, {
            onInsert: () => reload(sd),
            onUpdate: () => reload(sd),
            onDelete: () => reload(sd),
          })
        }
      } catch (e) {
        console.error('[StockGS] init', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()
    return () => {
      mounted = false
      if (itemsSub) itemsSub.unsubscribe?.()
    }
  }, [day, user?.id])

  // Refresh manuel
  async function handleRefresh() {
    if (!stockDay) return
    setRefreshing(true)
    try {
      const r = await buildAuditReport(stockDay.id)
      setReport(r)
    } catch (e) {
      console.error('[StockGS] refresh', e)
    } finally {
      setRefreshing(false)
    }
  }

  // Rafraichit le snapshot Odoo : declenche un snapshot puis recharge le rapport
  async function handleRefreshOdoo() {
    if (!stockDay || !user?.id) return
    setRefreshingOdoo(true)
    try {
      await triggerOdooSnapshot(stockDay.id, user.id, false)
      const r = await buildAuditReport(stockDay.id)
      setReport(r)
    } catch (e) {
      console.error('[StockGS] refreshOdoo', e)
      alert('Erreur lors du refresh Odoo : ' + (e?.message || e))
    } finally {
      setRefreshingOdoo(false)
    }
  }

  // Filtre les lignes : uniquement GS- salues
  const gsLines = useMemo(() => {
    return report
      .filter(r => isGSSale(r.product_name))
      .map(r => ({
        ...r,
        clean_name: cleanName(r.product_name),
        stock: currentStock(r),
      }))
      .sort((a, b) => {
        // 1) Stock croissant : les bas stocks et ruptures en haut (urgent a produire)
        if (a.stock !== b.stock) return a.stock - b.stock
        // 2) En cas d'egalite, ordre alphabetique
        return a.clean_name.localeCompare(b.clean_name, 'fr')
      })
  }, [report])

  // Filtre de recherche
  const q = searchQuery.trim().toLowerCase()
  const filteredLines = q
    ? gsLines.filter(l => l.clean_name.toLowerCase().includes(q))
    : gsLines

  // Compteurs
  const countLow = gsLines.filter(l => l.stock > 0 && l.stock <= 5).length
  const countZero = gsLines.filter(l => l.stock === 0).length

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[24px] font-semibold text-ink tracking-tight">Stock GS-</h1>
            <p className="text-[13px] text-ink-mute mt-1">
              Stock vitrine des produits salés à préfixe GS-
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="px-3 py-2 pr-8 text-[13px] bg-white border border-line rounded-full focus:outline-none focus:border-bordeaux/60 placeholder:text-ink-mute"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-line hover:bg-bordeaux hover:text-cream text-ink-mute flex items-center justify-center text-[11px] transition-all"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={handleRefreshOdoo}
              disabled={refreshingOdoo || !stockDay}
              className="px-3 py-2 rounded-full bg-bordeaux text-cream text-[13px] transition-all disabled:opacity-50 flex items-center gap-1.5 hover:bg-bordeaux-deep"
              title="Synchroniser le stock depuis Odoo"
            >
              <RefreshCw size={14} strokeWidth={1.8} className={refreshingOdoo ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{refreshingOdoo ? 'Sync Odoo…' : 'Sync Odoo'}</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 rounded-full bg-white border border-line text-ink hover:border-bordeaux hover:bg-bordeaux hover:text-cream text-[13px] transition-all disabled:opacity-50 flex items-center gap-1.5"
              title="Rafraîchir l'affichage"
            >
              <span className={refreshing ? 'inline-block animate-spin' : ''}>↻</span>
            </button>
          </div>
        </div>

        {/* Compteurs */}
        {!loading && gsLines.length > 0 && (
          <div className="bg-white rounded-xl border border-line p-4 mb-5 flex flex-wrap gap-4">
            <div>
              <span className="text-[11px] text-ink-mute uppercase tracking-wider">Total</span>
              <div className="text-[20px] font-semibold text-ink">{gsLines.length}</div>
            </div>
            {countLow > 0 && (
              <div>
                <span className="text-[11px] text-amber-700 uppercase tracking-wider">⚠ Bas stock (≤ 5)</span>
                <div className="text-[20px] font-semibold text-amber-700">{countLow}</div>
              </div>
            )}
            {countZero > 0 && (
              <div>
                <span className="text-[11px] text-ink-mute uppercase tracking-wider">Rupture (0)</span>
                <div className="text-[20px] font-semibold text-ink-mute">{countZero}</div>
              </div>
            )}
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div className="bg-white rounded-xl border border-line p-6 text-center text-[13px] text-ink-mute">
            Chargement...
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="bg-white rounded-xl border border-line p-8 text-center">
            <p className="text-[15px] font-semibold text-ink">
              {q ? 'Aucun résultat' : 'Aucun produit GS- dans le stock'}
            </p>
            <p className="text-[12px] text-ink-mute mt-1">
              {q
                ? `Essaie un autre mot-clé que "${q}"`
                : 'Aucun produit avec préfixe GS- n\'a été enregistré dans le stock vitrine du jour.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLines.map(line => (
              <StockGSCard key={line.product_name} line={line} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Carte d'un produit GS-
// ============================================================
function StockGSCard({ line }) {
  const stock = line.stock
  // Etats : rupture (0), bas stock (1-5), normal (>5)
  const isZero = stock === 0
  const isLow = stock > 0 && stock <= 5

  let containerCls = 'bg-white border-line/60'
  let qtyCls = 'bg-emerald-600 text-white'
  let qtyLabel = `${stock}`
  let badge = null

  if (isZero) {
    containerCls = 'bg-ink-mute/5 border-ink-mute/20'
    qtyCls = 'bg-ink-mute/20 text-ink-mute'
    qtyLabel = '0'
    badge = <span className="text-[9px] font-bold tracking-wider uppercase bg-ink-mute/10 text-ink-mute px-2 py-0.5 rounded-full ml-2">Rupture</span>
  } else if (isLow) {
    containerCls = 'bg-amber-50 border-amber-300'
    qtyCls = 'bg-amber-500 text-white'
    badge = <span className="text-[9px] font-bold tracking-wider uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full ml-2">À refill</span>
  }

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 transition-all ${containerCls}`}>
      <div className="flex-1 min-w-0">
        <div className={`text-[14px] font-medium ${isZero ? 'text-ink-mute' : 'text-ink'} flex items-center`}>
          <span className="truncate">{line.clean_name}</span>
          {badge}
        </div>
        <div className="text-[11px] text-ink-mute mt-0.5">
          {line.qty_odoo_current != null ? (
            <>Stock Odoo : {line.qty_odoo_current}</>
          ) : line.qty_morning != null ? (
            <>Envoyé ce matin : {line.qty_morning}{line.qty_leftover > 0 && <span> · Restes : {line.qty_leftover}</span>}</>
          ) : (
            <span className="italic">Pas encore synchronisé avec Odoo</span>
          )}
        </div>
      </div>
      <div className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[15px] font-bold tabular-nums ${qtyCls}`}>
        {qtyLabel}
      </div>
    </div>
  )
}
