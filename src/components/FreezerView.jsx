import { useState, useEffect } from 'react'
import { logout } from '../lib/auth'
import AppHeader from './AppHeader'
import { loadFreezerDoneIds, markFreezerDone, unmarkFreezerDone } from '../lib/freezerDone'

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function fmtLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fmtDayLabel(dateStr, today) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((date - todayDate) / 86400000)
  const dayName = DAY_NAMES[date.getDay() === 0 ? 6 : date.getDay() - 1]
  const monthName = MONTH_NAMES[date.getMonth()]
  let label = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${date.getDate()} ${monthName}`
  if (diff === 0) label += ' · Aujourd\'hui'
  else if (diff === 1) label += ' · Demain'
  return label
}

export default function FreezerView({ user, onLogout, onNavigate, activeView }) {
  const [allItems, setAllItems] = useState([])
  const [doneMap, setDoneMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupBy, setGroupBy] = useState('product')   // 'client' ou 'product' (defaut produit)
  const [showDone, setShowDone] = useState({})       // par date : true/false

  const today = new Date()
  const NB_DAYS = 14

  function loadData() {
    setLoading(true)
    setError('')
    const dates = []
    for (let i = 0; i < NB_DAYS; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      dates.push(fmtLocalDate(d))
    }
    Promise.all([
      fetch(`/api/freezer-list?dates=${dates.join(',')}`).then(r => r.ok ? r.json() : Promise.reject(`Erreur ${r.status}`)),
      loadFreezerDoneIds(),
    ])
      .then(([apiData, done]) => {
        setAllItems(apiData.items || [])
        setDoneMap(done)
      })
      .catch(e => setError(typeof e === 'string' ? e : e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function toggleDone(item) {
    try {
      if (doneMap[item.mo_id]) {
        await unmarkFreezerDone(item.mo_id)
        setDoneMap(prev => { const next = { ...prev }; delete next[item.mo_id]; return next })
      } else {
        await markFreezerDone(item.mo_id, user.id)
        setDoneMap(prev => ({ ...prev, [item.mo_id]: { done_by: user.id, done_at: new Date().toISOString(), doneByName: user.full_name || user.username } }))
      }
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  function printDay(date, _ignored) {
    // Trouve l'index du jour cliqué dans dateKeys, puis prends ce jour + les 2 suivants
    const startIdx = dateKeys.indexOf(date)
    if (startIdx === -1) return
    const datesToPrint = dateKeys.slice(startIdx, startIdx + 3)

    function buildSection(d) {
      const dayItems = itemsByDate[d] || []
      const todoItems = dayItems.filter(it => !doneMap[it.mo_id])
      const dayLabel = fmtDayLabel(d, today)

      if (todoItems.length === 0) {
        return `
          <section>
            <h3>${dayLabel}</h3>
            <p class="empty">Aucun composant à sortir</p>
          </section>
        `
      }

      let body = ''
      if (groupBy === 'product') {
        const byProd = {}
        for (const it of todoItems) {
          const key = `${it.taille} ${it.parfum}`
          if (!byProd[key]) byProd[key] = []
          byProd[key].push(it)
        }
        const keys = Object.keys(byProd).sort()
        body = `
          <table>
            <thead><tr><th></th><th>Produit</th><th>Quantité</th></tr></thead>
            <tbody>
              ${keys.map(k => `
                <tr>
                  <td class="check"></td>
                  <td class="prod">${k}</td>
                  <td class="qty">×${byProd[k].length}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `
      } else {
        const byScode = {}
        for (const it of todoItems) {
          const key = it.scode || '?'
          if (!byScode[key]) byScode[key] = []
          byScode[key].push(it)
        }
        const keys = Object.keys(byScode).sort((a, b) => {
          const ha = byScode[a][0]?.hour || 99
          const hb = byScode[b][0]?.hour || 99
          if (ha !== hb) return ha - hb
          return a.localeCompare(b)
        })
        body = keys.map(scode => {
          const lines = byScode[scode]
          const t = lines[0]
          const hourLabel = t.hour ? `${String(t.hour).padStart(2, '0')}h${String(t.minute).padStart(2, '0')}` : ''
          return `
            <div class="cmd">
              <div class="cmd-head"><strong>${scode}</strong> ${hourLabel ? `<span class="hour">${hourLabel}</span>` : ''} ${t.client_name ? `<span class="client">${t.client_name}</span>` : ''}</div>
              <table>
                <tbody>
                  ${lines.map(it => `<tr><td class="check"></td><td class="prod">${it.taille} ${it.parfum}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          `
        }).join('')
      }

      return `
        <section>
          <h3>${dayLabel} <span class="count">· ${todoItems.length} composants</span></h3>
          ${body}
        </section>
      `
    }

    const sections = datesToPrint.map(buildSection).join('')
    const win = window.open('', '_blank')
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Sortie congélo - 3 jours</title>
      <style>
        @page { size: A4; margin: 1.2cm; }
        body { font-family: -apple-system, sans-serif; color: #1a1a1a; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .subtitle { font-size: 12px; color: #666; margin: 0 0 16px; }
        section { margin-bottom: 18px; padding-bottom: 12px; border-bottom: 2px solid #5c1f23; page-break-inside: avoid; }
        section:last-child { border-bottom: none; }
        h3 { font-size: 16px; margin: 0 0 10px; color: #5c1f23; }
        h3 .count { font-size: 11px; color: #999; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #999; border-bottom: 1px solid #ddd; padding: 3px 6px; }
        td { padding: 5px 6px; border-bottom: 1px solid #eee; font-size: 13px; }
        td.check { width: 22px; }
        td.check::before { content: '☐'; font-size: 17px; color: #999; }
        td.qty { text-align: right; font-weight: 600; color: #5c1f23; width: 70px; }
        .cmd { margin-bottom: 10px; }
        .cmd-head { font-size: 12px; color: #5c1f23; margin-bottom: 1px; }
        .cmd-head .hour { color: #666; font-weight: normal; margin-left: 6px; font-family: monospace; font-size: 11px; }
        .cmd-head .client { color: #999; font-weight: normal; margin-left: 6px; font-size: 11px; }
        .cmd table { margin-bottom: 0; }
        .cmd td { border-bottom: 1px dotted #eee; padding: 3px 6px; }
        .empty { font-size: 11px; color: #999; font-style: italic; margin: 0; }
        .total { font-size: 10px; color: #999; margin-top: 14px; }
      </style></head>
      <body>
        <h1>Sortie congélateur</h1>
        <p class="subtitle">${groupBy === 'product' ? 'Vue par produit' : 'Vue par commande'} · 3 jours à partir du ${fmtDayLabel(date, today)}</p>
        ${sections}
        <div class="total">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
        <script>window.onload = () => { window.print() }</script>
      </body></html>
    `)
    win.document.close()
  }

  // Groupement par jour
  const itemsByDate = {}
  for (const it of allItems) {
    if (!itemsByDate[it.date]) itemsByDate[it.date] = []
    itemsByDate[it.date].push(it)
  }
  const dateKeys = Object.keys(itemsByDate).sort()

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-5xl mx-auto p-4 pb-32">
        <h1 className="font-fraunces italic text-[28px] text-ink mb-1">Sortie Congélateur</h1>
        <p className="text-[12px] text-ink-mute mb-4">
          Liste des composants cake design (15/20/25/30 cm) à sortir du congélateur.
          Coche au fur et à mesure que tu sors les pièces.
        </p>

        {/* Toggle groupBy */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setGroupBy('client')}
            className={`px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase rounded-full transition-all ${groupBy === 'client' ? 'bg-bordeaux text-cream' : 'bg-cream-warm text-ink-soft border border-line hover:border-bordeaux'}`}
          >Par commande</button>
          <button
            onClick={() => setGroupBy('product')}
            className={`px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase rounded-full transition-all ${groupBy === 'product' ? 'bg-bordeaux text-cream' : 'bg-cream-warm text-ink-soft border border-line hover:border-bordeaux'}`}
          >Par produit</button>
        </div>

        {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
        {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}

        {!loading && !error && dateKeys.length === 0 && (
          <div className="text-center py-8 text-ink-mute italic">Aucun composant à sortir dans les 14 prochains jours.</div>
        )}

        <div className="space-y-4">
          {dateKeys.map(date => {
            const dayItems = itemsByDate[date]
            const todoItems = dayItems.filter(it => !doneMap[it.mo_id])
            const doneItems = dayItems.filter(it => doneMap[it.mo_id])
            const showingDone = showDone[date]
            const visibleItems = showingDone ? doneItems : todoItems

            return (
              <div key={date} className="bg-cream-warm rounded-lg border border-line overflow-hidden">
                <div className="px-4 py-3 border-b border-line bg-cream flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-fraunces italic text-[18px] text-ink">{fmtDayLabel(date, today)}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowDone(prev => ({ ...prev, [date]: false }))}
                      className={`px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full ${!showingDone ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft'}`}
                    >À sortir ({todoItems.length})</button>
                    <button
                      onClick={() => setShowDone(prev => ({ ...prev, [date]: true }))}
                      className={`px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full ${showingDone ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft'}`}
                    >Faits ({doneItems.length})</button>
                    {todoItems.length > 0 && (
                      <button
                        onClick={() => printDay(date, dayItems)}
                        className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream transition-all"
                        title="Imprimer ce jour + les 2 suivants"
                      >🖨 Imprimer 3j</button>
                    )}
                  </div>
                </div>

                <div className="p-2">
                  {visibleItems.length === 0 ? (
                    <div className="text-center py-3 text-[11px] text-ink-mute italic">
                      {showingDone ? 'Aucun fait' : 'Aucun à sortir'}
                    </div>
                  ) : groupBy === 'product' ? (
                    <ProductGroupedList items={visibleItems} doneMap={doneMap} onToggle={toggleDone} />
                  ) : (
                    <ClientGroupedList items={visibleItems} doneMap={doneMap} onToggle={toggleDone} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Vue par commande : groupé par scode (S####)
function ClientGroupedList({ items, doneMap, onToggle }) {
  const byScode = {}
  for (const it of items) {
    const key = it.scode || '__nocode__'
    if (!byScode[key]) byScode[key] = []
    byScode[key].push(it)
  }
  // Trier par heure puis scode
  const keys = Object.keys(byScode).sort((a, b) => {
    const ha = byScode[a][0]?.hour || 99
    const hb = byScode[b][0]?.hour || 99
    if (ha !== hb) return ha - hb
    return a.localeCompare(b)
  })
  return (
    <div className="space-y-2">
      {keys.map(scode => {
        const lines = byScode[scode]
        const time = lines[0]
        const hourLabel = time.hour ? `${String(time.hour).padStart(2, '0')}h${String(time.minute).padStart(2, '0')}` : ''
        return (
          <div key={scode} className="bg-cream rounded border border-line p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-bold text-bordeaux">{scode === '__nocode__' ? '?' : scode}</span>
                {hourLabel && <span className="font-mono text-[11px] text-ink-mute">{hourLabel}</span>}
                {time.client_name && <span className="text-[11px] text-ink-soft truncate max-w-[200px]">{time.client_name}</span>}
              </div>
            </div>
            <div className="space-y-1">
              {lines.map(it => (
                <ItemLine key={it.mo_id} item={it} done={!!doneMap[it.mo_id]} doneInfo={doneMap[it.mo_id]} onToggle={onToggle} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Vue par produit : groupé par taille + parfum, ligne unique avec qty
function ProductGroupedList({ items, doneMap, onToggle }) {
  const byProd = {}
  for (const it of items) {
    const key = `${it.taille} ${it.parfum}`
    if (!byProd[key]) byProd[key] = []
    byProd[key].push(it)
  }
  const keys = Object.keys(byProd).sort()

  async function toggleAll(lines) {
    // Si tous cochés → tous décocher, sinon tous cocher
    const allDone = lines.every(it => doneMap[it.mo_id])
    for (const it of lines) {
      const isDone = !!doneMap[it.mo_id]
      if (allDone && isDone) await onToggle(it)
      else if (!allDone && !isDone) await onToggle(it)
    }
  }

  return (
    <div className="space-y-1">
      {keys.map(prodKey => {
        const lines = byProd[prodKey]
        const allDone = lines.every(it => doneMap[it.mo_id])
        return (
          <div
            key={prodKey}
            className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${allDone ? 'bg-cream-warm/40 opacity-60' : 'bg-cream hover:bg-cream-warm'}`}
          >
            <button
              onClick={() => toggleAll(lines)}
              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] transition-colors ${allDone ? 'bg-bordeaux border-bordeaux text-cream' : 'border-line bg-cream hover:border-bordeaux'}`}
              title={allDone ? 'Décocher tous' : 'Marquer tous comme sortis'}
            >
              {allDone ? '✓' : ''}
            </button>
            <span className="flex-1 text-[13px] text-ink font-medium">{prodKey}</span>
            <span className="font-mono text-[12px] text-bordeaux font-bold">×{lines.length}</span>
          </div>
        )
      })}
    </div>
  )
}

function ItemLine({ item, done, doneInfo, onToggle, compact = false }) {
  const hourLabel = item.hour ? `${String(item.hour).padStart(2, '0')}h${String(item.minute).padStart(2, '0')}` : ''
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${done ? 'bg-cream-warm/40 opacity-60' : 'bg-cream-warm hover:bg-cream-warm/80'}`}>
      <button
        onClick={() => onToggle(item)}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] transition-colors ${done ? 'bg-bordeaux border-bordeaux text-cream' : 'border-line bg-cream hover:border-bordeaux'}`}
        title={done ? `Fait par ${doneInfo?.doneByName || ''}` : 'Marquer comme sorti'}
      >
        {done ? '✓' : ''}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {!compact && <span className="text-[12px] text-ink font-medium">{item.taille} {item.parfum}</span>}
          {compact && (
            <>
              <span className="font-mono text-[11px] font-bold text-bordeaux">{item.scode || '?'}</span>
              {hourLabel && <span className="font-mono text-[10px] text-ink-mute">{hourLabel}</span>}
              {item.client_name && <span className="text-[10px] text-ink-soft truncate max-w-[150px]">{item.client_name}</span>}
            </>
          )}
        </div>
        <div className="font-mono text-[9px] text-ink-mute mt-0.5">{item.mo_name}</div>
      </div>
    </div>
  )
}
