import { useState, useEffect } from 'react'
import { logout } from '../lib/auth'
import AppHeader from './AppHeader'
import { loadFreezerDoneIds, markFreezerDone, unmarkFreezerDone } from '../lib/freezerDone'
import { toast } from '../lib/toast'
import GlisserPourSortir from './GlisserPourSortir'
import { fmtDayLabel } from '../lib/jourLisible'


// Cache localStorage : evite le rechargement Odoo lent a chaque visite
const CACHE_KEY = 'lg_freezer_cache_v2'
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

function readFreezerCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.ts || !parsed.items) return null
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null
    return parsed
  } catch (e) {
    return null
  }
}

function writeFreezerCache(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }))
  } catch (e) { /* ignore */ }
}

function fmtLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}


export default function FreezerView({ user, onLogout, onNavigate, activeView }) {
  const [allItems, setAllItems] = useState([])
  const [doneMap, setDoneMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupBy, setGroupBy] = useState('product')   // 'client' ou 'product' (defaut produit)
  const [showHistory, setShowHistory] = useState(false)   // afficher l'historique J-7 (bouton à part)
  const [cacheInfo, setCacheInfo] = useState(null)   // { ts } si on affiche du cache

  const today = new Date()
  const NB_DAYS = 7
  const PAST_DAYS = 7   // historique J-7

  function loadData(forceRefresh = false) {
    setError('')
    const dates = []
    for (let i = -PAST_DAYS; i < NB_DAYS; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      dates.push(fmtLocalDate(d))
    }

    // Etape 1 : si cache valide et pas de force refresh, on l'utilise tout de suite
    if (!forceRefresh) {
      const cached = readFreezerCache()
      if (cached) {
        setAllItems(cached.items || [])
        setCacheInfo({ ts: cached.ts })
        setLoading(false)
        // On charge quand meme les "done" qui sont legers et viennent de Supabase
        loadFreezerDoneIds().then(done => setDoneMap(done)).catch(() => {})
        return
      }
    }

    // Etape 2 : pas de cache (ou refresh force) -> fetch normal
    setLoading(true)
    setCacheInfo(null)
    Promise.all([
      fetch(`/api/freezer-list?dates=${dates.join(',')}&today=${fmtLocalDate(today)}`).then(r => r.ok ? r.json() : Promise.reject(`Erreur ${r.status}`)),
      loadFreezerDoneIds(),
    ])
      .then(([apiData, done]) => {
        const items = apiData.items || []
        setAllItems(items)
        setDoneMap(done)
        writeFreezerCache(items)
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
      toast.error('Erreur : ' + e.message)
    }
  }

  function printDay(date, _ignored, wantDone = false, back = false) {
    // Trouve l'index du jour cliqué dans dateKeys.
    // Vue normale : ce jour + les 2 suivants. Historique : ce jour + les 2 précédents (récent en haut).
    const startIdx = dateKeys.indexOf(date)
    if (startIdx === -1) return
    const datesToPrint = back
      ? dateKeys.slice(Math.max(0, startIdx - 2), startIdx + 1).reverse()
      : dateKeys.slice(startIdx, startIdx + 3)

    function buildSection(d) {
      const dayItems = itemsByDate[d] || []
      // Même règle qu'à l'écran : « sorti » = coché ici par quelqu'un.
      const items = wantDone ? dayItems.filter(it => doneMap[it.mo_id]) : dayItems.filter(it => !doneMap[it.mo_id])
      const dayLabel = fmtDayLabel(d, today)

      if (items.length === 0) {
        return `
          <section>
            <h3>${dayLabel}</h3>
            <p class="empty">${wantDone ? 'Aucun composant fait' : 'Aucun composant à sortir'}</p>
          </section>
        `
      }

      let body = ''
      if (groupBy === 'product') {
        const byProd = {}
        for (const it of items) {
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
                  <td class="prod">${k}<div class="scodes">${byProd[k].map(it => `${it.scode || '?'}${(it.qty || 1) > 1 ? ` ×${it.qty}` : ''}`).join(' · ')}</div></td>
                  <td class="qty">×${byProd[k].reduce((s, it) => s + (it.qty || 1), 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `
      } else {
        const byScode = {}
        for (const it of items) {
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
          <h3>${dayLabel} <span class="count">· ${items.reduce((n, it) => n + (it.qty || 1), 0)} composants</span></h3>
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
        td.prod .scodes { font-family: monospace; font-size: 9px; color: #999; margin-top: 2px; }
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
        <h1>Sortie congélateur${wantDone ? ' · FAITS' : ''}</h1>
        <p class="subtitle">${groupBy === 'product' ? 'Vue par produit' : 'Vue par commande'} · 3 jours ${back ? 'jusqu’au' : 'à partir du'} ${fmtDayLabel(date, today)}</p>
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
  const _todayStr = fmtLocalDate(today)
  // Deux notions à ne pas confondre :
  //  - SORTI : quelqu'un l'a vraiment sorti du congélateur et coché ici.
  //  - traité : sorti, OU déjà fabriqué dans Odoo sans passer par l'app.
  // L'historique ne montre que ce qui a été SORTI (demande de Layla) ; « traité »
  // ne sert plus qu'à repérer les jours passés réellement en retard, pour ne pas
  // ressortir des centaines de vieux ordres qu'Odoo a terminés de son côté.
  // Un ordre peut porter plusieurs gâteaux : partout où on annonce un nombre,
  // on compte les PIÈCES. Sinon « 3 à sortir » pour 4 gâteaux au congélateur.
  const nbPieces = l => l.reduce((n, it) => n + (it.qty || 1), 0)
  const _sorti = it => !!doneMap[it.mo_id]
  const _traite = it => !!it.made || !!doneMap[it.mo_id]
  const futureKeys = dateKeys.filter(d => d >= _todayStr)                                                          // aujourd'hui + futur
  const pastUndoneKeys = dateKeys.filter(d => d < _todayStr && itemsByDate[d].some(it => !_traite(it)))  // passé pas coché = en retard (du + ancien au + récent → reste en haut)
  // Historique = tout ce qui est coché (sorti). On sépare le futur (sorti à l'avance) et le passé.
  const doneFutureKeys = dateKeys.filter(d => d >= _todayStr && itemsByDate[d].some(_sorti))
  const donePastKeys = dateKeys.filter(d => d < _todayStr && itemsByDate[d].some(_sorti)).reverse()

  // Carte d'un jour. mode : 'current' (futur/auj), 'overdue' (passé non fait), 'history' (passé fait)
  const renderCard = (date, mode) => {
    const dayItems = itemsByDate[date]
    // Reste à sortir = ni coché ici, NI déjà terminé dans Odoo. Sans cette
    // deuxième condition, les ordres qu'Odoo a terminés de son côté (et que
    // personne n'a cochés) revenaient dans la liste comme s'il y avait à faire.
    const todoItems = dayItems.filter(it => !_traite(it))
    const doneItems = dayItems.filter(_sorti)
    let visibleItems, headerRight, emptyMsg
    if (mode === 'history') {
      visibleItems = doneItems; emptyMsg = 'Aucun fait'
      headerRight = (<>
        <span className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full bg-ink/10 text-ink-soft">Historique ({nbPieces(doneItems)})</span>
        {doneItems.length > 0 && <button onClick={() => printDay(date, dayItems, true, true)} className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream transition-all" title="Imprimer les faits · ce jour + les 2 précédents">Imprimer 3j</button>}
      </>)
    } else if (mode === 'overdue') {
      visibleItems = dayItems.filter(it => !_traite(it)); emptyMsg = 'Aucun à sortir'
      headerRight = <span className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full bg-red-100 text-red-700">🔴 En retard ({nbPieces(dayItems.filter(it => !_traite(it)))})</span>
    } else {
      // Uniquement ce qui RESTE à sortir — l'écran doit refléter les ordres encore
      // confirmés dans Odoo, comme la liste que Layla y lit. Dès qu'un gâteau est
      // sorti, il quitte la liste et rejoint l'Historique (bouton à part en haut).
      visibleItems = todoItems; emptyMsg = 'Tout est sorti'
      headerRight = (<>
        <span className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full bg-cream text-ink-soft border border-line">
          {todoItems.length ? `${nbPieces(todoItems)} à sortir` : 'tout est sorti'}
        </span>
        {visibleItems.length > 0 && <button onClick={() => printDay(date, dayItems, false)} className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream transition-all" title="Imprimer · ce jour + les 2 suivants">Imprimer 3j</button>}
      </>)
    }
    return (
      <div key={date + mode}>
        {/* La date reste visible pendant qu'on fait défiler : au congélateur on
            perd vite le fil de savoir à quel jour on en est. */}
        <div className="sticky top-0 z-20 -mx-1 px-1 pt-2 pb-1.5 bg-cream">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-fraunces italic text-[17px] text-ink">{fmtDayLabel(date, today)}</h2>
            {headerRight}
            <span className="flex-1 h-px bg-line min-w-[20px]" />
          </div>
        </div>
        <div className={mode === 'overdue' ? 'border-l-2 border-red-200 pl-1.5' : ''}>
          {visibleItems.length === 0
            ? <div className="text-center py-3 text-[11px] text-ink-mute italic">{emptyMsg}</div>
            : groupBy === 'product'
              ? <ProductGroupedList items={visibleItems} doneMap={doneMap} onToggle={toggleDone} />
              : <ClientGroupedList items={visibleItems} doneMap={doneMap} onToggle={toggleDone} />}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-5xl mx-auto p-4 pb-32">
        {/* Bouton Recharger en haut de la page */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-bordeaux text-cream rounded-full text-[13px] font-bold hover:opacity-90 transition-colors disabled:opacity-60"
            title="Recharger depuis Odoo (peut prendre quelques secondes)"
          >
            <i className={`ti ti-refresh text-[15px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true"></i>
            {loading ? 'Chargement…' : '🔄 Recharger'}
          </button>
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${showHistory ? 'bg-ink text-cream' : 'border border-line text-ink-soft hover:border-bordeaux'}`}
            title="Afficher / masquer les 7 derniers jours"
          >Historique J-7</button>
          {cacheInfo && !loading && (
            <span className="font-mono text-[10px] text-ink-mute italic">cache · {Math.round((Date.now() - cacheInfo.ts) / 60000)}min</span>
          )}
        </div>
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">CD Négatif</h1>
        <p className="text-[12px] text-ink-mute mb-4 max-w-2xl">
          Sortie congélateur · composants Cake Design (15/20/25/30 cm) à sortir.
          Coche au fur et à mesure que tu sors les pièces.
        </p>

        {/* Toggle groupBy */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="inline-flex bg-cream-warm rounded-full p-0.5 border border-line">
            <button
              onClick={() => setGroupBy('client')}
              className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
                groupBy === 'client' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
              }`}
            >Par commande</button>
            <button
              onClick={() => setGroupBy('product')}
              className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors ${
                groupBy === 'product' ? 'bg-bordeaux text-cream' : 'text-ink-mute hover:text-bordeaux'
              }`}
            >Par produit</button>
          </div>
        </div>

        {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
        {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded">{error}</div>}

        {!loading && !error && dateKeys.length === 0 && (
          <div className="text-center py-8 text-ink-mute italic">Aucun composant à sortir dans les 14 prochains jours.</div>
        )}

        <div className="space-y-4">
          {showHistory ? (
            /* Vue Historique SEULE : tout ce qui est coché (sorti), futur puis passé */
            (doneFutureKeys.length + donePastKeys.length) === 0
              ? <div className="text-center py-8 text-ink-mute italic">Aucun composant coché (sorti) pour l'instant.</div>
              : <>
                  {doneFutureKeys.length > 0 && <>
                    <div className="text-[12px] font-bold text-emerald-700 uppercase tracking-wider">📅 À venir (déjà sortis)</div>
                    {doneFutureKeys.map(date => renderCard(date, 'history'))}
                  </>}
                  {donePastKeys.length > 0 && <>
                    <div className="text-[12px] font-bold text-ink-mute uppercase tracking-wider border-t border-line pt-3">Passé</div>
                    {donePastKeys.map(date => renderCard(date, 'history'))}
                  </>}
                </>
          ) : (
            /* Les retards EN HAUT (on ne veut pas les oublier), du plus récent au
               plus ancien, puis aujourd'hui et les jours qui viennent. */
            <>
              {[...pastUndoneKeys].reverse().map(date => renderCard(date, 'overdue'))}
              {futureKeys.map(date => renderCard(date, 'current'))}
            </>
          )}
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

  return (
    <div className="space-y-1.5">
      {keys.map(prodKey => {
        const lines = byProd[prodKey]
        return <GroupeProduit key={prodKey} nom={prodKey} lignes={lines} doneMap={doneMap} onToggle={onToggle} />
      })}
    </div>
  )
}

/**
 * Une sorte de gâteau (« 15 cm Citron ») et tout ce qu'il y en a à sortir.
 * Glisser la carte sort toute la sorte d'un coup — c'est le geste rapide au
 * congélateur. Le détail se déplie pour n'en sortir qu'une partie, cas fréquent
 * quand on ne prend pas tout le lot d'un coup.
 */
function GroupeProduit({ nom, lignes, doneMap, onToggle }) {
  const [ouvert, setOuvert] = useState(false)
  // On compte les PIÈCES, pas les lignes : un ordre peut en porter deux.
  const pieces = l => l.reduce((n, it) => n + (it.qty || 1), 0)
  const faits = pieces(lignes.filter(it => doneMap[it.mo_id]))
  const total = pieces(lignes)
  const tout = lignes.every(it => doneMap[it.mo_id])
  const restant = total - faits

  async function sortirTout() {
    for (const it of lignes) if (!doneMap[it.mo_id]) await onToggle(it)
  }

  const corps = (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${tout ? 'bg-[#EAF3DE]' : 'bg-cream-warm'}`}>
      <span className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-mono text-[19px] font-bold ${tout ? 'bg-[#2F6B25] text-cream' : 'bg-[#E9F1F6] text-[#3d6f8e] border border-dashed border-[#3d6f8e]/40'}`}>
        {tout ? '✓' : restant}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] text-ink font-bold leading-tight">{nom}</div>
        <div className="text-[11.5px] text-ink-soft mt-0.5">
          {tout ? `les ${total} sont sortis`
            : faits ? `${faits} sur ${total} sortis · ${restant} à prendre`
              : `${total} à sortir`}
        </div>
      </div>
      {!tout && <span className="flex-shrink-0 text-[#3d6f8e]/50 text-[13px]">›››</span>}
    </div>
  )

  return (
    <div className={`rounded-xl overflow-hidden border ${tout ? 'border-[#cfe0b8]' : 'border-line'}`}>
      {tout ? corps : <GlisserPourSortir onFait={sortirTout} texte="Tout sorti">{corps}</GlisserPourSortir>}
      {total > 1 && (
        <div className="h-1 bg-line">
          <div className="h-full bg-[#2F6B25] transition-all" style={{ width: `${Math.round(faits / total * 100)}%` }} />
        </div>
      )}
      <button onClick={() => setOuvert(v => !v)}
        className="w-full py-1.5 text-[11px] font-semibold text-ink-soft bg-cream border-t border-line">
        {ouvert ? 'replier' : tout ? 'voir le détail' : 'en sortir seulement une partie'} {ouvert ? '▴' : '▾'}
      </button>
      {ouvert && (
        <div className="border-t border-line bg-cream">
          {lignes.map(it => {
            const fait = !!doneMap[it.mo_id]
            return (
              <div key={it.mo_id} className="flex items-center gap-2.5 px-3 py-1.5 border-b border-line last:border-b-0 text-[12.5px]">
                <span className="font-mono text-[10.5px] text-ink-mute w-11">
                  {it.hour ? `${String(it.hour).padStart(2, '0')}h${String(it.minute).padStart(2, '0')}` : ''}
                </span>
                <span className="flex-1 min-w-0 truncate text-ink-soft">
                  {(it.qty || 1) > 1 && <b className="font-mono text-bordeaux">×{it.qty} </b>}
                  {it.client_name || it.scode}
                </span>
                <button onClick={() => onToggle(it)}
                  className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold border ${fait ? 'bg-[#2F6B25] border-[#2F6B25] text-cream' : 'bg-cream-warm border-line text-[#3d6f8e]'}`}>
                  {fait ? '✓ sorti' : 'sortir'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ItemLine({ item, done, doneInfo, onToggle, compact = false }) {
  const hourLabel = item.hour ? `${String(item.hour).padStart(2, '0')}h${String(item.minute).padStart(2, '0')}` : ''
  const corps = (
    <div className={`flex items-center gap-2.5 px-2 py-2 ${done ? 'bg-[#EAF3DE]' : 'bg-cream-warm'}`}>
      <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[15px] font-bold ${done ? 'bg-[#2F6B25] text-cream' : 'bg-[#E9F1F6] text-[#3d6f8e] border border-dashed border-[#3d6f8e]/40'}`}>
        {done ? '✓' : '❄'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* deux gâteaux identiques sur une même ligne : il faut le voir */}
          {(item.qty || 1) > 1 && (
            <span className="font-mono text-[12px] font-extrabold text-bordeaux bg-cream px-1.5 py-0.5 rounded-md border border-bordeaux/30">
              ×{item.qty}
            </span>
          )}
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
      {!done && <span className="flex-shrink-0 text-[#3d6f8e]/50 text-[13px] pr-1">›››</span>}
    </div>
  )
  // sorti : plus de geste, juste la trace et un petit lien pour se corriger
  if (done) {
    return (
      <div className="rounded-xl overflow-hidden border border-[#cfe0b8] mb-1">
        {corps}
        <div className="flex items-center gap-2 px-2.5 py-1 bg-[#EAF3DE] border-t border-[#cfe0b8] text-[10.5px] font-semibold text-[#2F6B25]">
          Sorti{doneInfo?.doneByName ? ` par ${doneInfo.doneByName}` : ''}
          <button onClick={() => onToggle(item)} className="ml-auto text-ink-mute underline underline-offset-2 font-normal">annuler</button>
        </div>
      </div>
    )
  }
  return (
    <GlisserPourSortir onFait={() => onToggle(item)} classe="mb-1 border border-line">
      {corps}
    </GlisserPourSortir>
  )
}
