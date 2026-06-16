import { useState, useEffect, useMemo } from 'react'
import { loadSalesLinesForRange, PROD_VIEW_CATEGORIES, filterLinesForProdCategory } from '../lib/salesLines'
import { loadProdDoneForLines, markProdLineDone, unmarkProdLineDone, loadProdLogs } from '../lib/prodDone'
import { isAdmin } from '../lib/auth'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import ActivityLog, { relativeTime } from './ActivityLog'

export default function ProdView({ user, onLogout, onNavigate, activeView, forcedCategory }) {
  const [lines, setLines] = useState([])
  const [doneMap, setDoneMap] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [tabsByDate, setTabsByDate] = useState({})
  // viewMode : 'client' = ligne par client, 'product' = agrege par produit.
  // Par defaut on met 'product' (= vue agregee). Pour Sales on le bascule
  // sur 'client' plus bas via un useEffect quand on sait qu'on est en mode Sales.
  const [viewMode, setViewMode] = useState('product')  // 'client' | 'product'
  const [printDate, setPrintDate] = useState(null)
  const [printMode, setPrintMode] = useState('todo')    // 'todo' (à faire) | 'done' (faites)
  const [printData, setPrintData] = useState(null)      // { byDate, statusOf } — inclut J-3
  const [expandedKey, setExpandedKey] = useState(null)  // pour vue par produit

  // category peut etre 'prod', 'sales', ou un array ['prod', 'sales']
  // Determination :
  // 1) Si forcedCategory passe en prop (admin via App.jsx) -> utiliser
  // 2) Sinon, basé sur perm_prod + perm_sales du user
  // 3) Fallback : prod_category (legacy) ou 'prod' pour admin
  const category = useMemo(() => {
    if (forcedCategory) return forcedCategory
    if (user?.perm_prod && user?.perm_sales) return ['prod', 'sales']
    if (user?.perm_prod) return 'prod'
    if (user?.perm_sales) return 'sales'
    if (user?.prod_category) return user.prod_category
    return isAdmin(user) ? 'prod' : null
  }, [forcedCategory, user?.perm_prod, user?.perm_sales, user?.prod_category, user?.role])

  // Quand category devient connue : par defaut Prod -> "Par produit", Sales -> "Par client".
  // (L'utilisateur peut basculer manuellement ensuite, et son choix reste pour la session.)
  // On ne change qu'au premier rendu (apres category resolu) pour ne pas casser
  // le choix manuel de l'utilisateur.
  const [viewModeInitialized, setViewModeInitialized] = useState(false)
  useEffect(() => {
    if (!category || viewModeInitialized) return
    if (category === 'sales') setViewMode('client')
    else setViewMode('product')
    setViewModeInitialized(true)
  }, [category, viewModeInitialized])

  // Date locale (pas UTC) pour eviter les decalages timezone
  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const DAYS = 14

  async function refresh() {
    if (!category) return
    setLoading(true)
    try {
      const allLines = await loadSalesLinesForRange(todayStr, DAYS)
      const filtered = filterLinesForProdCategory(allLines, category)
        .filter(l => !/vitrine/i.test(l.client_name || ''))   // Exclure clients contenant 'vitrine'
      setLines(filtered)
      const lineIds = filtered.map(l => l.odoo_line_id).filter(Boolean)
      const dones = await loadProdDoneForLines(lineIds)
      const map = new Map()
      for (const d of dones) map.set(d.odoo_line_id, d)
      setDoneMap(map)
    } catch (e) {
      console.error('[ProdView]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [category])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) refresh() }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [category])

  // Group par date
  const byDate = useMemo(() => {
    const map = new Map()
    for (const l of lines) {
      const dt = new Date(l.delivery_at)
      const d = dt.toISOString().slice(0, 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d).push(l)
    }
    return map
  }, [lines])

  // Helpers status : permet de lire l'etat actuel d'une ligne dans doneMap
  // Une entree dans doneMap signifie soit 'done', soit 'cancelled'.
  // Absence d'entree = "a faire".
  function getStatus(odooLineId) {
    const entry = doneMap.get(odooLineId)
    if (!entry) return null
    return entry.status === 'cancelled' ? 'cancelled' : 'done'
  }
  function isDoneStatus(odooLineId) { return getStatus(odooLineId) === 'done' }
  function isCancelledStatus(odooLineId) { return getStatus(odooLineId) === 'cancelled' }

  // Limite Salés au flux d'origine : 'cancelled' utile uniquement pour Prod
  const supportsCancellation = category === 'prod'

  // Click sur le bouton "Fait" : ajoute 'done', ou retire si deja 'done'
  async function toggle(line) {
    const status = getStatus(line.odoo_line_id)
    try {
      if (status === 'done') await unmarkProdLineDone(line.odoo_line_id)
      else await markProdLineDone(line.odoo_line_id, user?.id, 'done')
      await refresh()
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + e.message)
    }
  }

  // Click sur le bouton "Annuler" : ajoute 'cancelled', ou retire si deja 'cancelled'
  async function cancel(line) {
    const status = getStatus(line.odoo_line_id)
    try {
      if (status === 'cancelled') await unmarkProdLineDone(line.odoo_line_id)
      else await markProdLineDone(line.odoo_line_id, user?.id, 'cancelled')
      await refresh()
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + e.message)
    }
  }

  // Marque/demarque toutes les lignes d'un produit agrege (boutons en haut de groupe)
  async function toggleProductGroup(productLines, allDone) {
    try {
      for (const l of productLines) {
        const isDone = isDoneStatus(l.odoo_line_id)
        if (allDone && isDone) {
          await unmarkProdLineDone(l.odoo_line_id)
        } else if (!allDone && !isDone) {
          await markProdLineDone(l.odoo_line_id, user?.id, 'done')
        }
      }
      await refresh()
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + e.message)
    }
  }

  function setDayTab(date, tab) {
    setTabsByDate(prev => ({ ...prev, [date]: tab }))
  }

  // Ouvre la fenêtre d'impression : charge une plage incluant les 3 DERNIERS jours
  // (J-3) en plus des jours à venir, pour pouvoir réimprimer les commandes faites.
  async function openPrintDialog() {
    setPrintDate('__loading__')
    try {
      const d0 = new Date(); d0.setDate(d0.getDate() - 3)
      const start = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`
      const all = await loadSalesLinesForRange(start, DAYS + 3)
      const filtered = filterLinesForProdCategory(all, category).filter(l => !/vitrine/i.test(l.client_name || ''))
      const dones = await loadProdDoneForLines(filtered.map(l => l.odoo_line_id).filter(Boolean))
      const dmap = new Map(); for (const d of dones) dmap.set(d.odoo_line_id, d)
      const map = new Map()
      for (const l of filtered) {
        const k = new Date(l.delivery_at).toISOString().slice(0, 10)
        if (!map.has(k)) map.set(k, [])
        map.get(k).push(l)
      }
      const statusOf = id => { const e = dmap.get(id); return !e ? null : (e.status === 'cancelled' ? 'cancelled' : 'done') }
      setPrintData({ byDate: map, statusOf })
      setPrintDate('__open__')
    } catch (e) {
      toast.error('Erreur de chargement : ' + e.message)
      setPrintDate(null)
    }
  }

  function handlePrint(date) {
    const wantDone = printMode === 'done'
    const statusOf = printData?.statusOf || getStatus
    const all = printData?.byDate.get(date) || byDate.get(date) || []
    const dayLines = all.filter(l => wantDone ? statusOf(l.odoo_line_id) === 'done' : statusOf(l.odoo_line_id) === null)
    if (dayLines.length === 0) {
      toast.error(wantDone ? 'Aucune commande faite ce jour' : 'Rien à imprimer pour ce jour')
      return
    }
    const html = buildPrintHtml(date, dayLines, def, viewMode, wantDone ? 'FAITES' : 'À FAIRE')
    const w = window.open('', '_blank')
    if (!w) return toast.error('Bloquez les popups ?')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
    setPrintDate(null)
  }

  // def : utilise pour afficher emoji/label. Si array -> emoji combine + label combine.
  const def = useMemo(() => {
    if (!category) return null
    if (Array.isArray(category)) {
      const cats = category.map(c => PROD_VIEW_CATEGORIES[c]).filter(Boolean)
      return {
        emoji: cats.map(c => c.emoji).join(' '),
        label: cats.map(c => c.label).join(' + '),
      }
    }
    return PROD_VIEW_CATEGORIES[category]
  }, [category])

  if (!category) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-ink-mute italic">Aucune catégorie de production assignée. Demande à l'admin.</p>
      </div>
    )
  }


  return (
    <div className="min-h-screen bg-cream pb-40">
      <AppHeader
        user={user}
        activeView={activeView || (Array.isArray(category) ? 'prod' : (category === 'sales' ? 'sales' : 'prod'))}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* Sous-header : titre + toggle vue + impression */}
      <div className="bg-cream/60 border-b border-line py-3 px-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-fraunces italic text-[26px] font-normal text-ink leading-none">{def.label}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-cream-warm rounded-full p-0.5 border border-line">
              <button
                onClick={() => setViewMode('client')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  viewMode === 'client' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
                }`}
              >
                <i className="ti ti-user text-[12px]" aria-hidden="true"></i>
                Par client
              </button>
              <button
                onClick={() => setViewMode('product')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  viewMode === 'product' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
                }`}
              >
                <i className="ti ti-box text-[12px]" aria-hidden="true"></i>
                Par produit
              </button>
            </div>
            <button
              onClick={openPrintDialog}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-bordeaux text-bordeaux rounded-full text-[11px] hover:bg-bordeaux hover:text-cream transition-colors"
            >
              <i className="ti ti-printer text-[13px]" aria-hidden="true"></i>
              Imprimer
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {loading ? (
          <div className="text-center text-ink-mute italic py-12">Chargement...</div>
        ) : byDate.size === 0 ? (
          <div className="text-center text-ink-mute italic py-12">Aucune ligne sur les 14 prochains jours</div>
        ) : (
          <div className="space-y-5">
            {[...byDate.entries()].map(([date, dayLines]) => {
              const d = new Date(date)
              const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
              const tab = tabsByDate[date] || 'todo'
              const todo = dayLines.filter(l => getStatus(l.odoo_line_id) === null)
              const done = dayLines.filter(l => isDoneStatus(l.odoo_line_id))
              const cancelled = dayLines.filter(l => isCancelledStatus(l.odoo_line_id))
              const visibleLines = tab === 'todo' ? todo : tab === 'done' ? done : cancelled

              return (
                <div key={date} className="bg-white rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-bordeaux/30 flex-wrap">
                    <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-bordeaux font-bold capitalize">
                      {label}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex bg-cream-warm rounded-full p-0.5 border border-line">
                        <button
                          onClick={() => setDayTab(date, 'todo')}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                            tab === 'todo' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
                          }`}
                        >À faire ({todo.length})</button>
                        <button
                          onClick={() => setDayTab(date, 'done')}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                            tab === 'done'
                              ? 'bg-bordeaux text-cream'
                              : done.length === 0 ? 'text-ink-mute/60' : 'text-ink-mute hover:text-bordeaux'
                          }`}
                        >Faites ({done.length})</button>
                        {supportsCancellation && (
                          <button
                            onClick={() => setDayTab(date, 'cancelled')}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                              tab === 'cancelled'
                                ? 'bg-[#A03333] text-cream'
                                : cancelled.length === 0 ? 'text-ink-mute/60' : 'text-ink-mute hover:text-[#A03333]'
                            }`}
                          >Annulées ({cancelled.length})</button>
                        )}
                      </div>
                      {todo.length > 0 && (
                        <button
                          onClick={() => handlePrint(date)}
                          className="w-7 h-7 flex items-center justify-center text-bordeaux border border-bordeaux/40 rounded-full hover:bg-bordeaux hover:text-cream transition-colors text-[14px]"
                          title="Imprimer ce jour"
                        >🖨</button>
                      )}
                    </div>
                  </div>

                  {visibleLines.length === 0 ? (
                    <div className="text-center text-ink-mute italic py-3 text-[11px]">
                      {tab === 'todo' ? 'Tout est traité ✓' : tab === 'done' ? 'Rien fait pour le moment' : 'Aucune annulée'}
                    </div>
                  ) : viewMode === 'client' ? (
                    <ClientView
                      lines={visibleLines}
                      doneMap={doneMap}
                      onToggle={toggle}
                      onCancel={cancel}
                      supportsCancellation={supportsCancellation}
                      hideClient={supportsCancellation}
                    />
                  ) : (
                    <ProductView
                      lines={visibleLines}
                      doneMap={doneMap}
                      onToggleGroup={toggleProductGroup}
                      onToggleSingle={toggle}
                      onCancelSingle={cancel}
                      supportsCancellation={supportsCancellation}
                      hideClient={supportsCancellation}
                      expandedKey={expandedKey}
                      setExpandedKey={setExpandedKey}
                      dateKey={date}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Chargement de la fenêtre d'impression */}
      {printDate === '__loading__' && (
        <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-cream rounded-2xl px-6 py-5 shadow-2xl border border-line text-[13px] text-ink-mute">Chargement…</div>
        </div>
      )}

      {/* Dialog impression */}
      {printDate === '__open__' && (
        <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setPrintDate(null)}>
          <div className="bg-cream rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-line"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-3">Imprimer</h3>

            {/* Choix : à faire ou déjà faites */}
            <div className="flex bg-cream-warm rounded-full p-0.5 border border-line mb-3">
              <button onClick={() => setPrintMode('todo')}
                className={`flex-1 py-1.5 rounded-full text-[11px] font-medium transition-colors ${printMode === 'todo' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'}`}>À faire</button>
              <button onClick={() => setPrintMode('done')}
                className={`flex-1 py-1.5 rounded-full text-[11px] font-medium transition-colors ${printMode === 'done' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'}`}>Faites ✓</button>
            </div>
            <p className="text-[12px] text-ink-mute mb-3">Choisis le jour à imprimer ({printMode === 'done' ? 'commandes faites' : 'à faire uniquement'})</p>

            <div className="space-y-1 max-h-[55vh] overflow-y-auto">
              {[...(printData?.byDate.keys() || [])].sort().map(d => {
                const dt = new Date(d)
                const lab = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                const wantDone = printMode === 'done'
                const count = (printData?.byDate.get(d) || []).filter(l =>
                  wantDone ? printData.statusOf(l.odoo_line_id) === 'done' : printData.statusOf(l.odoo_line_id) === null
                ).length
                const isPast = d < todayStr
                return (
                  <button
                    key={d}
                    onClick={() => handlePrint(d)}
                    disabled={count === 0}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded border text-[12px] transition-colors ${
                      count === 0
                        ? 'bg-cream-warm/30 border-line/40 text-ink-mute cursor-not-allowed'
                        : 'bg-cream-warm border-line hover:border-bordeaux hover:bg-bordeaux/5'
                    }`}
                  >
                    <span className="capitalize">{lab}{isPast ? ' (passé)' : ''}</span>
                    <span className="font-mono text-[10px] text-bordeaux">{count} {wantDone ? 'faite(s)' : 'à faire'}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPrintDate(null)}
              className="mt-4 w-full py-2 border border-line rounded-full text-[12px] text-ink-soft hover:bg-cream-warm"
            >Annuler</button>
          </div>
        </div>
      )}

      {/* Footer logs : 3 derniers jours, filtre par categorie, distingue fait/annule
          La storageKey distingue Prod et Sales pour que chaque onglet ait son
          propre etat ouvert/ferme persiste. */}
      <ActivityLog
        storageKey={`activity_log_open_${Array.isArray(category) ? 'mixed' : (category || 'default')}`}
        loadFn={async () => {
          const allLogs = await loadProdLogs(3)
          if (!category) return allLogs
          // On filtre les logs en utilisant la meme regle que les lignes affichees,
          // pour qu'un user en mode Sales ne voie pas les logs de Prod (et vice-versa).
          const fakeLines = allLogs
            .filter(log => log.sales_lines)
            .map(log => ({ ...log.sales_lines, _log: log }))
          const filteredFakes = filterLinesForProdCategory(fakeLines, category)
          const keptLogIds = new Set(filteredFakes.map(f => f._log.id))
          return allLogs.filter(log => {
            if (!log.sales_lines) return false
            return keptLogIds.has(log.id)
          })
        }}
        refreshKey={lines.length + doneMap.size}
        formatEntry={(log) => {
          const who = log.profiles?.full_name || log.profiles?.username || '?'
          const sl = log.sales_lines
          const what = sl ? `${sl.product_name || ''} ×${sl.quantity || ''}` : `(ligne supprimée)`
          const where = sl?.order_num ? ` pour ${sl.order_num}${sl.client_name ? ' · ' + sl.client_name : ''}` : ''
          const verb = log.status === 'cancelled' ? 'a annulé' : 'a fait'
          return `${relativeTime(log.done_at)} — ${who} ${verb} ${what}${where}`
        }}
      />
    </div>
  )
}

// Helper : detecte si une ligne vient de l'entrepot Reservation Vitrine
function isReservationVitrine(line) {
  if (!line || !line.warehouse) return false
  return /r[eé]servation.*vitrine/i.test(line.warehouse)
}

// Mini pill "Vitrine" pour signaler une commande de l'entrepot Reservation Vitrine
function VitrinePill() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#FDF4DE] text-[#7A5A18] text-[9px] font-medium tracking-wider uppercase flex-shrink-0"
      title="Réservation depuis la vitrine (à sortir du stock, pas à fabriquer)"
    >
      <i className="ti ti-building-store text-[10px]" aria-hidden="true"></i>
      Vitrine
    </span>
  )
}

// Helper : nettoie un nom de produit pour l'affichage Prod.
// - Retire le code interne Odoo "[NNN] " en debut de nom (ex: "[192] E- ..." -> "E- ...")
// - Retire TOUT a partir de "Message:" (que ce soit vide ou suivi de texte).
//   La prod n'a pas besoin du message client (joyeux anniv, theme, etc.) -
//   ces infos sont visibles dans le detail commande ailleurs.
function cleanProdProductName(name) {
  if (!name) return ''
  let n = String(name)
  // 1) Retire le code Odoo en debut "[NNN]" suivi d'espace(s)
  n = n.replace(/^\s*\[\d+\]\s*/, '')
  // 2) Coupe a la premiere occurrence de "Message:" + tout ce qui suit
  n = n.replace(/\s*Message\s*:.*$/is, '')
  return n.trim()
}

// Vue par client : ligne par ligne
function ClientView({ lines, doneMap, onToggle, onCancel, supportsCancellation, hideClient }) {
  const sorted = [...lines].sort((a, b) => new Date(a.delivery_at) - new Date(b.delivery_at))
  return (
    <div className="space-y-1">
      {sorted.map(line => {
        const entry = doneMap.get(line.odoo_line_id)
        const status = entry ? (entry.status === 'cancelled' ? 'cancelled' : 'done') : null
        const isDone = status === 'done'
        const isCancelled = status === 'cancelled'
        const t = new Date(line.delivery_at)
        const hour = `${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`

        const wrapperClass = isDone
          ? 'bg-success/5 border-success/20 line-through text-ink-mute'
          : isCancelled
            ? 'bg-[#A03333]/5 border-[#A03333]/30 line-through text-[#A03333]/70'
            : 'bg-cream-warm/50 border-line/60 hover:border-bordeaux'

        return (
          <div
            key={line.id}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${wrapperClass}`}
          >
            {/* Click sur la zone principale = toggle "Fait" */}
            <button
              onClick={() => onToggle(line)}
              className="flex-1 min-w-0 flex items-start sm:items-center gap-2 text-left"
              title={isDone ? 'Cliquer pour annuler la coche' : 'Marquer comme fait'}
            >
              <span className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[9px] mt-0.5 sm:mt-0 ${
                isDone
                  ? 'bg-success border-success text-cream'
                  : isCancelled
                    ? 'border-[#A03333]/30 bg-[#A03333]/5 text-[#A03333]/60'
                    : 'border-line'
              }`}>
                {isDone ? '✓' : isCancelled ? '−' : ''}
              </span>
              {/* Bloc texte : 2 lignes sur mobile (flex-col), 1 ligne sur >= sm (flex-row) */}
              <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2 sm:flex-wrap">
                {/* Ligne 1 (mobile) / debut ligne unique (PC) : heure + code + client */}
                <span className="flex items-center gap-2 min-w-0 sm:flex-shrink-0">
                  <span className="font-mono text-[10px] text-ink-mute w-12 flex-shrink-0">{hour}</span>
                  <span className="font-mono text-[10px] text-bordeaux flex-shrink-0">{line.order_num}</span>
                  <span className="text-[12px] text-ink-soft min-w-0 truncate sm:max-w-[100px]">— {line.client_name}</span>
                  {isReservationVitrine(line) && <VitrinePill />}
                </span>
                {/* Ligne 2 (mobile) / suite (PC) : quantite + nom produit */}
                <span className="flex items-baseline gap-2 min-w-0 pl-[3.75rem] mt-0.5 sm:pl-0 sm:mt-0 sm:flex-1">
                  <span className="font-bold text-bordeaux flex-shrink-0">×{line.quantity}</span>
                  <span className="text-[12px] text-ink min-w-0 break-words sm:truncate">{cleanProdProductName(line.product_name)}</span>
                </span>
                {line.product_note && (
                  <span className="text-[11px] text-[#B36B00] font-semibold break-words w-full pl-[3.75rem] sm:pl-[3.75rem] mt-0.5">{line.product_note}</span>
                )}
              </span>
            </button>
            {/* Bouton Annuler (croix rouge) - uniquement pour Prod */}
            {supportsCancellation && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(line) }}
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors text-[14px] font-bold leading-none ${
                  isCancelled
                    ? 'bg-[#A03333] text-cream hover:bg-[#7a2525]'
                    : 'border border-[#A03333]/40 text-[#A03333] hover:bg-[#A03333] hover:text-cream'
                }`}
                title={isCancelled ? 'Retirer l\'annulation' : 'Marquer comme annulé'}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Vue par produit : agrégé, click pour expand
function ProductView({ lines, doneMap, onToggleGroup, onToggleSingle, onCancelSingle, supportsCancellation, hideClient, expandedKey, setExpandedKey, dateKey }) {
  // Helper local : extrait le status d'une ligne
  function statusOf(odooLineId) {
    const e = doneMap.get(odooLineId)
    if (!e) return null
    return e.status === 'cancelled' ? 'cancelled' : 'done'
  }

  // Agréger par product_name
  const grouped = useMemo(() => {
    const map = new Map()
    for (const l of lines) {
      const key = l.product_name || ''
      if (!map.has(key)) map.set(key, { name: key, totalQty: 0, lines: [] })
      const e = map.get(key)
      e.totalQty += parseFloat(l.quantity) || 0
      e.lines.push(l)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [lines])

  return (
    <div className="space-y-1">
      {grouped.map((g, i) => {
        const doneLines = g.lines.filter(l => statusOf(l.odoo_line_id) === 'done')
        const cancelledLines = g.lines.filter(l => statusOf(l.odoo_line_id) === 'cancelled')
        const todoLines = g.lines.filter(l => statusOf(l.odoo_line_id) === null)
        const allDone = todoLines.length === 0 && doneLines.length > 0
        const someDone = doneLines.length > 0
        const allCancelled = todoLines.length === 0 && doneLines.length === 0 && cancelledLines.length > 0

        // Quantites
        const sumQty = (arr) => arr.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0)
        const todoQty = sumQty(todoLines)
        const totalQty = g.totalQty

        const fusionKey = `${dateKey}|${g.name}`
        const isExpanded = expandedKey === fusionKey

        // Compte les lignes "Reservation Vitrine" du groupe
        const vitrineLines = g.lines.filter(isReservationVitrine)
        const allVitrine = vitrineLines.length === g.lines.length && vitrineLines.length > 0
        const someVitrine = vitrineLines.length > 0 && !allVitrine

        return (
          <div key={i} className={`rounded border ${
            allCancelled ? 'bg-[#A03333]/5 border-[#A03333]/20'
              : allDone ? 'bg-success/5 border-success/20'
              : 'bg-cream-warm/50 border-line/60'
          }`}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                onClick={() => onToggleGroup(g.lines, allDone)}
                className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] transition-colors ${
                  allDone ? 'bg-success border-success text-cream'
                  : someDone ? 'bg-bordeaux/20 border-bordeaux text-bordeaux'
                  : 'border-line hover:border-bordeaux'
                }`}
                title={allDone ? 'Tout déjà fait — clic pour annuler' : 'Marquer fait'}
              >
                {allDone ? '✓' : someDone ? '½' : ''}
              </button>
              {/* Quantite restante / total. Si tout fait/annule -> juste le total barre */}
              {todoQty < totalQty && todoQty > 0 ? (
                <span className="font-bold flex-shrink-0">
                  <span className="text-bordeaux">×{todoQty}</span>
                  <span className="text-ink-mute font-normal text-[11px]"> / ×{totalQty}</span>
                </span>
              ) : (
                <span className="font-bold text-bordeaux flex-shrink-0">×{totalQty}</span>
              )}
              <span className={`text-[12px] flex-1 min-w-0 ${
                allCancelled ? 'line-through text-[#A03333]/70'
                  : allDone ? 'line-through text-ink-mute'
                  : 'text-ink'
              }`}>
                {cleanProdProductName(g.name)}
              </span>
              {g.lines.some(l => l.product_note) && (
                <span className="text-[14px] flex-shrink-0" title="Une commande a une ⚠️ attention — ouvre le détail clients">⚠️</span>
              )}
              {allVitrine && <VitrinePill />}
              {someVitrine && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#FDF4DE] text-[#7A5A18] text-[9px] font-medium tracking-wider uppercase flex-shrink-0"
                  title={`${vitrineLines.length} ligne(s) en Réservation Vitrine sur ${g.lines.length}`}
                >
                  <i className="ti ti-building-store text-[10px]" aria-hidden="true"></i>
                  Vitrine ×{vitrineLines.length}
                </span>
              )}
              <span className="text-[10px] text-ink-mute font-mono flex-shrink-0">
                {g.lines.length} cmd
              </span>
              <button
                onClick={() => setExpandedKey(isExpanded ? null : fusionKey)}
                className="text-[10px] text-ink-mute hover:text-bordeaux px-1.5"
                title="Voir détail clients"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            </div>

            {isExpanded && (
              <div className="px-2 pb-2 ml-7 space-y-0.5 border-t border-line/30 pt-1">
                {g.lines.map(line => {
                  const lineStatus = statusOf(line.odoo_line_id)
                  const isDone = lineStatus === 'done'
                  const isCancelled = lineStatus === 'cancelled'
                  const t = new Date(line.delivery_at)
                  const hour = `${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`
                  const txtClass = isCancelled
                    ? 'line-through text-[#A03333]/70'
                    : isDone
                      ? 'line-through text-ink-mute'
                      : 'text-ink-soft hover:bg-cream-warm'

                  return (
                    <div key={line.id} className={`w-full flex items-center gap-2 px-2 py-0.5 rounded transition-all text-[11px] ${txtClass}`}>
                      <button
                        onClick={() => onToggleSingle(line)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left"
                        title={isDone ? 'Cliquer pour annuler la coche' : 'Marquer comme fait'}
                      >
                        <span className={`flex-shrink-0 w-3 h-3 rounded-full border flex items-center justify-center text-[8px] ${
                          isDone
                            ? 'bg-success border-success text-cream'
                            : isCancelled
                              ? 'border-[#A03333]/30 bg-[#A03333]/5 text-[#A03333]/60'
                              : 'border-line'
                        }`}>
                          {isDone ? '✓' : isCancelled ? '−' : ''}
                        </span>
                        <span className="font-mono text-[9px] text-ink-mute w-10">{hour}</span>
                        <span className="font-mono text-[9px] text-bordeaux">{line.order_num}</span>
                        {/* Nom client toujours affiche en vue "Par produit" : utile
                            pour savoir a qui appartient chaque sous-ligne. */}
                        <span className="truncate max-w-[120px]">— {line.client_name}</span>
                        <span className="font-bold text-bordeaux">×{line.quantity}</span>
                        {isReservationVitrine(line) && <VitrinePill />}
                        {line.product_note && <span className="text-[10px] text-[#B36B00] font-semibold truncate">⚠️ {line.product_note}</span>}
                      </button>
                      {supportsCancellation && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCancelSingle(line) }}
                          className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors text-[12px] font-bold leading-none ${
                            isCancelled
                              ? 'bg-[#A03333] text-cream hover:bg-[#7a2525]'
                              : 'border border-[#A03333]/40 text-[#A03333] hover:bg-[#A03333] hover:text-cream'
                          }`}
                          title={isCancelled ? 'Retirer l\'annulation' : 'Marquer comme annulé'}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Build HTML pour imprimer
function buildPrintHtml(dateStr, lines, def, viewMode, modeLabel = 'À FAIRE') {
  const d = new Date(dateStr)
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const sorted = [...lines].sort((a, b) => new Date(a.delivery_at) - new Date(b.delivery_at))

  let body = ''
  if (viewMode === 'product') {
    // Agréger par produit
    const map = new Map()
    for (const l of sorted) {
      const key = l.product_name || ''
      if (!map.has(key)) map.set(key, { name: key, totalQty: 0, lines: [] })
      const e = map.get(key)
      e.totalQty += parseFloat(l.quantity) || 0
      e.lines.push(l)
    }
    const grouped = [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
    for (const g of grouped) {
      const detail = g.lines.map(l => `${l.order_num} ${l.client_name} ×${l.quantity}`).join(', ')
      body += `<tr><td class="num">×${g.totalQty}</td><td>${g.name}</td><td class="detail">${detail}</td></tr>`
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>${def.label} - ${label}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#222;margin:12px;line-height:1.4}
  h1{font-size:14px;margin:0 0 8px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{text-align:left;padding:5px 4px;border-bottom:1px solid #a8324b;color:#a8324b;text-transform:uppercase;font-size:9px}
  td{padding:4px;border-bottom:0.5px solid #eee;vertical-align:top}
  td.num{text-align:right;font-weight:bold;color:#a8324b;width:50px}
  td.detail{font-size:9px;color:#666}
  @media print{body{margin:6mm}}
</style></head><body>
<h1>${def.emoji} ${def.label} · ${label} · ${modeLabel} (par produit)</h1>
<table>
<thead><tr><th>Qty</th><th>Article</th><th>Détail</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`
  }

  // Vue par client (par défaut)
  for (const l of sorted) {
    const t = new Date(l.delivery_at)
    const hour = `${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`
    body += `<tr>
      <td>${hour}</td>
      <td>${l.order_num || ''}</td>
      <td>${l.client_name || ''}</td>
      <td class="num">×${l.quantity}</td>
      <td>${l.product_name || ''}</td>
    </tr>`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${def.label} - ${label}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#222;margin:12px;line-height:1.4}
  h1{font-size:14px;margin:0 0 8px}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{text-align:left;padding:5px 4px;border-bottom:1px solid #a8324b;color:#a8324b;text-transform:uppercase;font-size:9px}
  td{padding:4px;border-bottom:0.5px solid #eee}
  td.num{text-align:right;font-weight:bold;color:#a8324b}
  @media print{body{margin:6mm}}
</style></head><body>
<h1>${def.emoji} ${def.label} · ${label} · ${modeLabel}</h1>
<table>
<thead><tr><th>Heure</th><th>N°</th><th>Client</th><th class="num">Qty</th><th>Article</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`
}
