// src/components/StockProd.jsx
// Vue Stock Prod (Vitrine ou Annexe) : articles SM- depuis Odoo à un lieu donné.
// - Perms : voient seulement les articles ACTIVÉS, avec stock + badge « à refill ».
// - Admin : bouton « ⚙️ Catalogue » pour activer/désactiver et régler le stock mini.
import { useEffect, useMemo, useState, useCallback } from 'react'
import { RefreshCw, Settings, Check } from 'lucide-react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import { STOCK_PROD_LIEUX, fetchStockProdOdoo, loadStockProdCatalog, upsertStockProdCatalog } from '../lib/stockProd'
import { canEditStockMinMax } from '../lib/auth'

export default function StockProd({ user, lieu, activeView, onNavigate, onLogout }) {
  const canEdit = canEditStockMinMax(user)
  const conf = STOCK_PROD_LIEUX[lieu] || { label: 'Stock Prod', emoji: '📦' }

  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [articles, setArticles] = useState([])          // [{name, qty}] live Odoo
  const [catalog, setCatalog]   = useState({})          // name -> { actif, stock_min }
  const [search, setSearch]     = useState('')
  const [adminMode, setAdminMode] = useState(false)

  const load = useCallback(async (sync = false) => {
    sync ? setSyncing(true) : setLoading(true)
    try {
      const [arts, cat] = await Promise.all([fetchStockProdOdoo(lieu), loadStockProdCatalog(lieu)])
      setArticles(arts)
      const map = {}
      for (const c of cat) map[c.product_name] = { actif: c.actif, stock_min: Number(c.stock_min) || 0, stock_max: c.stock_max != null ? Number(c.stock_max) : null }
      setCatalog(map)
    } catch (e) {
      toast.error('Erreur de chargement : ' + (e?.message || e))
    } finally {
      setLoading(false); setSyncing(false)
    }
  }, [lieu])

  useEffect(() => { load() }, [load])

  // Rafraîchit le stock au retour sur l'onglet / l'app (sans minuteur).
  useEffect(() => {
    function onVis() { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  // Fusion article Odoo + catalogue.
  // stock_min effectif = valeur du catalogue si elle existe, sinon le min Odoo (pré-rempli).
  const merged = useMemo(() => {
    return articles.map(a => {
      const c = catalog[a.name]
      const stock_min = c ? (Number(c.stock_min) || 0) : (a.odoo_min != null ? a.odoo_min : 0)
      // max effectif = valeur du catalogue si réglée, sinon le max Odoo (pré-rempli)
      const stock_max = (c && c.stock_max != null) ? Number(c.stock_max) : (a.odoo_max != null ? a.odoo_max : null)
      return { name: a.name, qty: a.qty, odoo_min: a.odoo_min ?? null, odoo_max: a.odoo_max ?? null, actif: !!(c && c.actif), stock_min, stock_max }
    })
  }, [articles, catalog])

  const q = search.trim().toLowerCase()
  const visibles = useMemo(() => {
    let list = adminMode ? merged : merged.filter(m => m.actif)
    if (q) list = list.filter(m => m.name.toLowerCase().includes(q))
    // Catalogue (admin) : juste alphabétique.
    if (adminMode) return [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    // Liste stock : du plus pressé au moins pressé. Ce qui est tombé à zéro
    // passe devant ce qui frôle seulement son mini ; à manque égal, le plus
    // gros volume à produire d'abord.
    const manque = m => (m.stock_min > 0 ? (m.stock_min - m.qty) / m.stock_min : (m.qty <= 0 ? 1 : 0))
    const aProduire = m => Math.max(0, (m.stock_max != null ? m.stock_max : m.stock_min) - m.qty)
    // 1) les ruptures (plus rien en stock), 2) les articles à refill,
    // 3) le reste. Dans chaque groupe, le plus gros manque devant.
    const rang = m => (m.qty <= 0 ? 0 : (m.qty <= m.stock_min ? 1 : 2))
    return [...list].sort((a, b) => (rang(a) - rang(b))
      || (rang(a) < 2 ? (manque(b) - manque(a) || aProduire(b) - aProduire(a)) : 0)
      || a.name.localeCompare(b.name, 'fr'))
  }, [merged, adminMode, q])

  // Admin : (dé)activer un article. À la 1ère activation, on pré-remplit le
  // stock mini avec celui d'Odoo (s'il existe) ; ensuite l'admin peut le corriger.
  async function toggleActif(name, actif, odooMin) {
    const existed = !!catalog[name]
    setCatalog(prev => ({ ...prev, [name]: { ...(prev[name] || {}), actif, stock_min: prev[name]?.stock_min ?? (odooMin != null ? odooMin : 0) } }))
    try {
      const patch = { actif }
      if (actif && !existed) patch.stock_min = odooMin != null ? odooMin : 0
      await upsertStockProdCatalog(lieu, name, patch)
    } catch (e) { toast.error('Erreur : ' + e.message); load() }
  }
  // Régler le stock mini
  async function setMin(name, val) {
    const stock_min = Math.max(0, Number(val) || 0)
    setCatalog(prev => ({ ...prev, [name]: { ...(prev[name] || { actif: false }), stock_min } }))
    try { await upsertStockProdCatalog(lieu, name, { stock_min }) }
    catch (e) { toast.error('Erreur : ' + e.message); load() }
  }
  // Régler le stock maxi (cible de réappro). Vide = pas de cible.
  async function setMax(name, val) {
    const stock_max = val === '' || val == null ? null : Math.max(0, Number(val) || 0)
    setCatalog(prev => ({ ...prev, [name]: { ...(prev[name] || { actif: false, stock_min: 0 }), stock_max } }))
    try { await upsertStockProdCatalog(lieu, name, { stock_max }) }
    catch (e) { toast.error('Erreur : ' + e.message); load() }
  }

  const actifsCount = merged.filter(m => m.actif).length
  const lowCount = merged.filter(m => m.actif && m.qty <= m.stock_min).length

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[24px] font-semibold text-ink tracking-tight">{conf.emoji} {conf.label}</h1>
            <p className="text-[13px] text-ink-mute mt-1">Articles SM- — stock Odoo en direct</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
                className="px-3 py-2 pr-8 text-[13px] bg-white border border-line rounded-full focus:outline-none focus:border-bordeaux/60 placeholder:text-ink-mute" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-line text-ink-mute flex items-center justify-center text-[11px]">✕</button>}
            </div>
            {canEdit && (
              <button onClick={() => setAdminMode(m => !m)}
                className={`px-3 py-2 rounded-full text-[13px] flex items-center gap-1.5 border transition-all ${adminMode ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink hover:border-bordeaux'}`}
                title="Gérer le catalogue (activer + seuils min/max)">
                <Settings size={14} strokeWidth={1.8} /> <span className="hidden sm:inline">Catalogue</span>
              </button>
            )}
            <button onClick={() => load(true)} disabled={syncing}
              className="px-3 py-2 rounded-full bg-bordeaux text-cream text-[13px] disabled:opacity-50 flex items-center gap-1.5 hover:bg-bordeaux-deep" title="Resynchroniser depuis Odoo">
              <RefreshCw size={14} strokeWidth={1.8} className={syncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{syncing ? 'Sync…' : 'Sync Odoo'}</span>
            </button>
          </div>
        </div>

        {!loading && (
          <div className="bg-white rounded-2xl border border-line shadow-sm p-4 mb-5 flex flex-wrap gap-5">
            <div><span className="text-[11px] text-ink-mute uppercase tracking-wider">{adminMode ? 'Articles SM-' : 'Affichés'}</span>
              <div className="text-[20px] font-semibold text-ink">{adminMode ? merged.length : actifsCount}</div></div>
            {!adminMode && lowCount > 0 && (
              <div><span className="text-[11px] text-amber-700 uppercase tracking-wider">⚠ À refill</span>
                <div className="text-[20px] font-semibold text-amber-700">{lowCount}</div></div>
            )}
            {adminMode && <div><span className="text-[11px] text-ink-mute uppercase tracking-wider">Activés</span>
              <div className="text-[20px] font-semibold text-emerald-700">{actifsCount}</div></div>}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-line shadow-sm p-6 text-center text-[13px] text-ink-mute">Chargement…</div>
        ) : visibles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-line shadow-sm p-8 text-center">
            <p className="text-[15px] font-semibold text-ink">{q ? 'Aucun résultat' : (adminMode ? 'Aucun article SM- à ce lieu' : 'Aucun article activé')}</p>
            {!q && !adminMode && canEdit && <p className="text-[12px] text-ink-mute mt-1">Clique « Catalogue » pour activer des articles.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {visibles.map(m => adminMode
              ? <AdminRow key={m.name} m={m} onToggle={toggleActif} onMin={setMin} onMax={setMax} />
              : <ViewRow key={m.name} m={m} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// Carte vue (perm) : stock + badge à refill + objectif max à atteindre
function ViewRow({ m }) {
  const besoin = m.qty <= m.stock_min            // à refill
  const zero = m.qty <= 0
  const aProduire = m.stock_max != null ? Math.max(0, Math.round((m.stock_max - m.qty) * 100) / 100) : null
  let box = 'bg-white border-line/60', pill = 'bg-emerald-600 text-white', badge = null
  if (zero) { box = 'bg-red-50 border-red-300'; pill = 'bg-red-600 text-white'; badge = <span className="text-[9px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full ml-2">Rupture</span> }
  else if (besoin) { box = 'bg-amber-50 border-amber-300'; pill = 'bg-amber-500 text-white'; badge = <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full ml-2">À refill</span> }
  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 shadow-sm ${box}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink flex items-center"><span className="truncate">{m.name}</span>{badge}</div>
        <div className="text-[11px] text-ink-mute mt-0.5">Stock mini : {m.stock_min}{m.stock_max != null ? ` · max ${m.stock_max}` : ''}</div>
        {besoin && m.stock_max != null && (
          <div className="text-[11px] font-semibold text-amber-800 mt-0.5">🎯 Remplir jusqu'à {m.stock_max} — à produire : {aProduire}</div>
        )}
      </div>
      <div className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[15px] font-bold tabular-nums ${pill}`}>{m.qty}</div>
    </div>
  )
}

// Ligne admin : activer + stock mini + stock maxi (cible réappro)
function AdminRow({ m, onToggle, onMin, onMax }) {
  const [min, setMinLocal] = useState(String(m.stock_min))
  const [max, setMaxLocal] = useState(m.stock_max != null ? String(m.stock_max) : '')
  useEffect(() => { setMinLocal(String(m.stock_min)) }, [m.stock_min])
  useEffect(() => { setMaxLocal(m.stock_max != null ? String(m.stock_max) : '') }, [m.stock_max])
  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 shadow-sm ${m.actif ? 'bg-white border-emerald-200' : 'bg-ink-mute/5 border-line/60'}`}>
      <button onClick={() => onToggle(m.name, !m.actif, m.odoo_min)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <span className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border ${m.actif ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-line'}`}>
          {m.actif && <Check size={13} strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className={`block text-[14px] font-medium truncate ${m.actif ? 'text-ink' : 'text-ink-mute'}`}>{m.name}</span>
          {m.odoo_min != null && <span className="block text-[10px] text-ink-mute">Odoo : min {m.odoo_min} · max {m.odoo_max}</span>}
        </span>
      </button>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] text-ink-mute">Stock : <b className="tabular-nums">{m.qty}</b></span>
        <label className="text-[11px] text-ink-mute flex items-center gap-1">mini
          <input type="number" min="0" step="1" value={min}
            onChange={e => setMinLocal(e.target.value)} onBlur={() => onMin(m.name, min)}
            className="w-16 px-2 py-1 text-[13px] text-center border border-line rounded-lg focus:outline-none focus:border-bordeaux/60" />
        </label>
        <label className="text-[11px] text-ink-mute flex items-center gap-1">maxi
          <input type="number" min="0" step="1" value={max} placeholder="—"
            onChange={e => setMaxLocal(e.target.value)} onBlur={() => onMax(m.name, max)}
            className="w-16 px-2 py-1 text-[13px] text-center border border-line rounded-lg focus:outline-none focus:border-bordeaux/60" />
        </label>
      </div>
    </div>
  )
}
