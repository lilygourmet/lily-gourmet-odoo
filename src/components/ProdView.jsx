import { useState, useEffect, useMemo } from 'react'
import { loadSalesLinesForRange, PROD_VIEW_CATEGORIES, filterLinesForProdCategory } from '../lib/salesLines'
import { loadProdDoneForLines, markProdLineDone, unmarkProdLineDone, loadProdLogs } from '../lib/prodDone'
import { isAdmin } from '../lib/auth'
import AppHeader from './AppHeader'
import ActivityLog, { relativeTime } from './ActivityLog'

export default function ProdView({ user, onLogout, onNavigate, activeView, forcedCategory }) {
  const [lines, setLines] = useState([])
  const [doneMap, setDoneMap] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [tabsByDate, setTabsByDate] = useState({})
  const [viewMode, setViewMode] = useState('client')  // 'client' | 'product'
  const [printDate, setPrintDate] = useState(null)
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

  async function toggle(line) {
    const isDone = doneMap.has(line.odoo_line_id)
    try {
      if (isDone) await unmarkProdLineDone(line.odoo_line_id)
      else await markProdLineDone(line.odoo_line_id, user?.id)
      await refresh()
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + e.message)
    }
  }

  // Marque/demarque toutes les lignes d'un produit agrege
  async function toggleProductGroup(productLines, allDone) {
    try {
      for (const l of productLines) {
        const isDone = doneMap.has(l.odoo_line_id)
        if (allDone && isDone) {
          await unmarkProdLineDone(l.odoo_line_id)
        } else if (!allDone && !isDone) {
          await markProdLineDone(l.odoo_line_id, user?.id)
        }
      }
      await refresh()
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + e.message)
    }
  }

  function setDayTab(date, tab) {
    setTabsByDate(prev => ({ ...prev, [date]: tab }))
  }

  function handlePrint(date) {
    const dayLines = (byDate.get(date) || []).filter(l => !doneMap.has(l.odoo_line_id))
    if (dayLines.length === 0) {
      alert('Rien à imprimer pour ce jour')
      return
    }
    const html = buildPrintHtml(date, dayLines, def, viewMode)
    const w = window.open('', '_blank')
    if (!w) return alert('Bloquez les popups ?')
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

  const datesWithLines = [...byDate.keys()].sort()

  return (
    <div className="min-h-screen bg-cream pb-40">
      <AppHeader
        user={user}
        activeView={activeView || (Array.isArray(category) ? 'prod' : (category === 'sales' ? 'sales' : 'prod'))}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* Sous-header : titre + toggle vue + impression */}
      <div className="bg-cream-warm/30 border-b border-line py-3 px-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[20px]">{def.emoji}</span>
            <span className="font-fraunces italic text-[18px] text-ink">{def.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-cream-warm rounded-full p-0.5 border border-line">
              <button
                onClick={() => setViewMode('client')}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  viewMode === 'client' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                }`}
              >👤 Par client</button>
              <button
                onClick={() => setViewMode('product')}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  viewMode === 'product' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                }`}
              >📦 Par produit</button>
            </div>
            <button
              onClick={() => setPrintDate('__open__')}
              className="px-3 py-1.5 border border-bordeaux text-bordeaux rounded-full text-[11px] hover:bg-bordeaux hover:text-cream transition-colors"
            >🖨 Imprimer</button>
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
              const todo = dayLines.filter(l => !doneMap.has(l.odoo_line_id))
              const done = dayLines.filter(l => doneMap.has(l.odoo_line_id))
              const visibleLines = tab === 'todo' ? todo : done

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
                            tab === 'todo' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                          }`}
                        >À faire ({todo.length})</button>
                        <button
                          onClick={() => setDayTab(date, 'done')}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                            tab === 'done' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                          }`}
                        >Faites ({done.length})</button>
                      </div>
                      {todo.length > 0 && (
                        <button
                          onClick={() => handlePrint(date)}
                          className="px-2 py-0.5 text-[10px] text-bordeaux border border-bordeaux/40 rounded-full hover:bg-bordeaux hover:text-cream"
                          title="Imprimer ce jour"
                        >🖨</button>
                      )}
                    </div>
                  </div>

                  {visibleLines.length === 0 ? (
                    <div className="text-center text-ink-mute italic py-3 text-[11px]">
                      {tab === 'todo' ? 'Tout est fait ✓' : 'Rien fait pour le moment'}
                    </div>
                  ) : viewMode === 'client' ? (
                    <ClientView lines={visibleLines} doneMap={doneMap} onToggle={toggle} />
                  ) : (
                    <ProductView
                      lines={visibleLines}
                      doneMap={doneMap}
                      onToggleGroup={toggleProductGroup}
                      onToggleSingle={toggle}
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

      {/* Dialog impression */}
      {printDate === '__open__' && (
        <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setPrintDate(null)}>
          <div className="bg-cream rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-line"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-3">Imprimer</h3>
            <p className="text-[12px] text-ink-mute mb-3">Choisis le jour à imprimer (non-faites uniquement)</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {datesWithLines.map(d => {
                const dt = new Date(d)
                const lab = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                const todoCount = (byDate.get(d) || []).filter(l => !doneMap.has(l.odoo_line_id)).length
                return (
                  <button
                    key={d}
                    onClick={() => handlePrint(d)}
                    disabled={todoCount === 0}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded border text-[12px] transition-colors ${
                      todoCount === 0
                        ? 'bg-cream-warm/30 border-line/40 text-ink-mute cursor-not-allowed'
                        : 'bg-cream-warm border-line hover:border-bordeaux hover:bg-bordeaux/5'
                    }`}
                  >
                    <span className="capitalize">{lab}</span>
                    <span className="font-mono text-[10px] text-bordeaux">{todoCount} à faire</span>
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

      {/* Footer logs */}
      <ActivityLog
        loadFn={() => loadProdLogs(14)}
        refreshKey={lines.length + doneMap.size}
        formatEntry={(log) => {
          const who = log.profiles?.full_name || log.profiles?.username || '?'
          const sl = log.sales_lines
          const what = sl ? `${sl.product_name || ''} ×${sl.quantity || ''}` : `(ligne supprimée)`
          const where = sl?.order_num ? ` pour ${sl.order_num}${sl.client_name ? ' · ' + sl.client_name : ''}` : ''
          return `${relativeTime(log.done_at)} — ${who} a fait ${what}${where}`
        }}
      />
    </div>
  )
}

// Vue par client : ligne par ligne
function ClientView({ lines, doneMap, onToggle }) {
  const sorted = [...lines].sort((a, b) => new Date(a.delivery_at) - new Date(b.delivery_at))
  return (
    <div className="space-y-1">
      {sorted.map(line => {
        const isDone = doneMap.has(line.odoo_line_id)
        const t = new Date(line.delivery_at)
        const hour = `${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`
        return (
          <button
            key={line.id}
            onClick={() => onToggle(line)}
            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
              isDone
                ? 'bg-success/5 border-success/20 line-through text-ink-mute'
                : 'bg-cream-warm/50 border-line/60 hover:border-bordeaux'
            }`}
          >
            <span className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[9px] ${
              isDone ? 'bg-success border-success text-cream' : 'border-line'
            }`}>
              {isDone ? '✓' : ''}
            </span>
            <span className="font-mono text-[10px] text-ink-mute w-12 flex-shrink-0">{hour}</span>
            <span className="font-mono text-[10px] text-bordeaux flex-shrink-0">{line.order_num}</span>
            <span className="text-[12px] text-ink-soft flex-shrink-0 truncate max-w-[100px]">— {line.client_name}</span>
            <span className="font-bold text-bordeaux flex-shrink-0">×{line.quantity}</span>
            <span className="text-[12px] text-ink min-w-0 flex-1 truncate">{line.product_name}</span>
          </button>
        )
      })}
    </div>
  )
}

// Vue par produit : agrégé, click pour expand
function ProductView({ lines, doneMap, onToggleGroup, onToggleSingle, expandedKey, setExpandedKey, dateKey }) {
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
        const allDone = g.lines.every(l => doneMap.has(l.odoo_line_id))
        const someDone = g.lines.some(l => doneMap.has(l.odoo_line_id))
        const fusionKey = `${dateKey}|${g.name}`
        const isExpanded = expandedKey === fusionKey

        return (
          <div key={i} className={`rounded border ${
            allDone ? 'bg-success/5 border-success/20' : 'bg-cream-warm/50 border-line/60'
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
              <span className="font-bold text-bordeaux flex-shrink-0">×{g.totalQty}</span>
              <span className={`text-[12px] flex-1 min-w-0 ${allDone ? 'line-through text-ink-mute' : 'text-ink'}`}>
                {g.name}
              </span>
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
                  const isDone = doneMap.has(line.odoo_line_id)
                  const t = new Date(line.delivery_at)
                  const hour = `${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`
                  return (
                    <button
                      key={line.id}
                      onClick={() => onToggleSingle(line)}
                      className={`w-full text-left flex items-center gap-2 px-2 py-0.5 rounded transition-all text-[11px] ${
                        isDone
                          ? 'line-through text-ink-mute'
                          : 'text-ink-soft hover:bg-cream-warm'
                      }`}
                    >
                      <span className={`flex-shrink-0 w-3 h-3 rounded-full border flex items-center justify-center text-[8px] ${
                        isDone ? 'bg-success border-success text-cream' : 'border-line'
                      }`}>
                        {isDone ? '✓' : ''}
                      </span>
                      <span className="font-mono text-[9px] text-ink-mute w-10">{hour}</span>
                      <span className="font-mono text-[9px] text-bordeaux">{line.order_num}</span>
                      <span className="truncate max-w-[120px]">— {line.client_name}</span>
                      <span className="font-bold text-bordeaux">×{line.quantity}</span>
                    </button>
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
function buildPrintHtml(dateStr, lines, def, viewMode) {
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
<h1>${def.emoji} ${def.label} · ${label} · À FAIRE (par produit)</h1>
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
<h1>${def.emoji} ${def.label} · ${label} · À FAIRE</h1>
<table>
<thead><tr><th>Heure</th><th>N°</th><th>Client</th><th class="num">Qty</th><th>Article</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`
}
