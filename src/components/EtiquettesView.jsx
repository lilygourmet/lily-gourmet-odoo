import { useState, useEffect, useMemo } from 'react'
import { usePersistedState } from '../lib/usePersistedState'
import { Cake, Cookie, Snowflake } from 'lucide-react'
import AppHeader from './AppHeader'
import { loadEtiquettesArticles, makeQtyKey, buildZplLabels, syncEtiquettesFromOdoo } from '../lib/etiquettes.js'

const TABS = [
  { id: 'cd', label: 'Entremets', Icon: Cake },
  { id: 'gs', label: 'Gâteaux secs', Icon: Cookie },
  { id: 'su', label: 'Surgelés', Icon: Snowflake },
]

const ENTREMETS_SIZES = [5, 10, 15, 20]

export default function EtiquettesView({ user, activeView, onNavigate, onLogout }) {
  const [tab, setTab] = usePersistedState('lily.etiquettes.tab', 'cd')
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [qtys, setQtys] = useState({})   // { "tplId:size": qty } ou { "tplId": qty }
  const [downloading, setDownloading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let mounted = true
    loadEtiquettesArticles()
      .then(d => { if (mounted) { setArticles(d); setLoading(false) } })
      .catch(e => { console.error('[etiquettes] load:', e); if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  // Articles filtres : exclusions + tri alpha cote client (au cas ou DB pas a jour)
  const cleanedArticles = useMemo(() => {
    const excludePatterns = [/miss\s*pistache/i, /paris\s*brest/i, /maatouk/i, /plateau/i, /\btatin\b/i]
    const cleaned = articles.filter(a => {
      for (const pat of excludePatterns) {
        if (pat.test(a.name)) return false
      }
      return true
    })
    // Tri par categorie puis alphabetique
    cleaned.sort((a, b) => {
      if (a.category !== b.category) {
        const order = { cd: 0, gs: 1, su: 2 }
        return order[a.category] - order[b.category]
      }
      const cleanA = a.name.replace(/^\[\d+\]\s*/, '').trim()
      const cleanB = b.name.replace(/^\[\d+\]\s*/, '').trim()
      return cleanA.localeCompare(cleanB, 'fr')
    })
    return cleaned
  }, [articles])

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cleanedArticles.filter(a => {
      if (a.category !== tab) return false
      if (q && !a.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [cleanedArticles, tab, search])

  const counts = useMemo(() => {
    const c = { cd: 0, gs: 0, su: 0 }
    for (const a of cleanedArticles) c[a.category] = (c[a.category] || 0) + 1
    return c
  }, [cleanedArticles])

  function setQty(key, newVal) {
    const v = Math.max(0, Math.min(99, newVal))
    setQtys(prev => {
      const next = { ...prev }
      if (v === 0) delete next[key]
      else next[key] = v
      return next
    })
  }

  function getQty(key) {
    return qtys[key] || 0
  }

  // Liste des items selectionnes (pour le compteur et le ZPL)
  const selectedItems = useMemo(() => {
    const items = []
    for (const [key, qty] of Object.entries(qtys)) {
      if (qty <= 0) continue
      const [tplId, sizeStr] = key.split(':')
      const article = articles.find(a => String(a.odoo_template_id) === tplId)
      if (!article) continue
      const size = sizeStr ? Number(sizeStr) : null
      items.push({ article, size, qty })
    }
    return items
  }, [qtys, articles])

  const totalLabels = selectedItems.reduce((s, it) => s + it.qty, 0)

  async function handleDownload() {
    if (totalLabels === 0) return
    setDownloading(true)
    try {
      const zpl = buildZplLabels(selectedItems)
      const blob = new Blob([zpl], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiquettes-articles-${new Date().toISOString().slice(0, 10)}.zpl`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Erreur generation ZPL : ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  async function handleSync() {
    const token = window.prompt('Token de synchronisation Odoo :')
    if (!token) return
    setSyncing(true)
    try {
      const result = await syncEtiquettesFromOdoo(token)
      alert(`Sync OK\n${result.upserted} articles\n${result.images_count} images\nDuree: ${(result.duration_ms / 1000).toFixed(1)}s`)
      // Reload
      const fresh = await loadEtiquettesArticles()
      setArticles(fresh)
    } catch (e) {
      alert('Erreur sync : ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  function clearAll() {
    if (totalLabels === 0) return
    if (!confirm('Tout decocher ?')) return
    setQtys({})
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-6xl mx-auto px-4 pb-4">
      {/* Header sticky : reste visible quand on scrolle */}
      <div className="sticky top-[60px] z-20 bg-cream pt-4 pb-2 -mx-4 px-4 border-b border-line/40">
        <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="font-fraunces italic text-[26px] font-normal text-ink leading-none">Étiquettes Café</h1>
            <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute">
              Entremets · Gâteaux secs · Surgelés
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-full font-medium tracking-wider transition-colors disabled:opacity-60"
              title="Recharger les articles depuis Odoo"
            >
              <i className={`ti ti-refresh text-[13px] ${syncing ? 'animate-spin' : ''}`} aria-hidden="true"></i>
              {syncing ? 'Sync...' : 'Sync articles'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white border border-line rounded-full mb-2">
          {TABS.map(t => {
            const Icon = t.Icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-3 py-1.5 text-[12px] rounded-full font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                  tab === t.id
                    ? 'bg-bordeaux text-cream'
                    : 'text-ink-soft hover:bg-cream-warm'
                }`}
              >
                <Icon size={14} strokeWidth={1.8} />
                <span>{t.label}</span>
                <span className="opacity-70">({counts[t.id] || 0})</span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Rechercher dans ${TABS.find(t => t.id === tab)?.label.toLowerCase()}...`}
          className="w-full text-[12px] px-3 py-2 border border-line rounded-xl bg-white"
        />
      </div>

      {/* Grid articles */}
      <div className="pt-4">
      {loading ? (
        <div className="text-center text-ink-mute py-12 text-[13px]">Chargement...</div>
      ) : filteredArticles.length === 0 ? (
        <div className="text-center text-ink-mute py-12 text-[13px]">
          {search ? 'Aucun article trouve' : 'Aucun article. Lance le sync pour les recuperer depuis Odoo.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mb-4">
          {filteredArticles.map(article => (
            <ArticleCard
              key={article.odoo_template_id}
              article={article}
              qtys={qtys}
              setQty={setQty}
              getQty={getQty}
            />
          ))}
        </div>
      )}
      </div>

      {/* Bottom bar */}
      {totalLabels > 0 && (
        <div className="sticky bottom-0 bg-cream/95 backdrop-blur border border-line rounded-2xl p-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="text-[12px] text-ink flex-1">
              <span className="font-bold text-bordeaux">{totalLabels}</span> étiquette{totalLabels > 1 ? 's' : ''} à imprimer
            </div>
            <button
              onClick={clearAll}
              className="text-[11px] px-3 py-1.5 border border-line text-ink-soft hover:bg-cream-warm rounded-full"
            >
              Tout décocher
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="text-[12px] px-4 py-1.5 bg-bordeaux text-cream hover:bg-bordeaux-deep rounded-full font-medium disabled:opacity-50"
            >
              {downloading ? 'Génération...' : 'Télécharger ZPL'}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

// ============================================================
// CARTE ARTICLE
// ============================================================

function ArticleCard({ article, qtys, setQty, getQty }) {
  const isEntremets = article.category === 'cd'
  const sizes = isEntremets ? (Array.isArray(article.sizes) && article.sizes.length > 0 ? article.sizes : []) : null

  // Total selectionne pour cet article (toutes tailles confondues)
  const totalForArticle = sizes
    ? sizes.reduce((s, sz) => s + getQty(makeQtyKey(article.odoo_template_id, sz)), 0)
    : getQty(makeQtyKey(article.odoo_template_id))

  const hasSelection = totalForArticle > 0
  const cleanName = article.name.replace(/^\[\d+\]\s*/, '')

  return (
    <div className={`bg-white rounded-2xl p-2 transition-colors shadow-sm ${
      hasSelection ? 'border-2 border-bordeaux' : 'border border-line'
    }`}>
      {/* Photo */}
      <div className="aspect-square rounded-xl overflow-hidden bg-cream-warm mb-2">
        {article.image_url ? (
          <img
            src={article.image_url}
            alt={cleanName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-mute text-[10px] italic">
            Pas de photo
          </div>
        )}
      </div>

      {/* Nom */}
      <div className="text-[12px] font-medium text-ink text-center mb-2 leading-tight min-h-[28px]">
        {cleanName}
      </div>

      {/* Selecteurs */}
      {isEntremets ? (
        <div className="space-y-1">
          {sizes.map(size => {
            const key = makeQtyKey(article.odoo_template_id, size)
            const q = getQty(key)
            return (
              <div key={size} className="grid grid-cols-[44px_1fr] items-center gap-1.5">
                <div className={`text-[10px] ${q > 0 ? 'text-ink' : 'text-ink-mute'}`}>{size} pers</div>
                <QtyControl qty={q} onChange={v => setQty(key, v)} />
              </div>
            )
          })}
        </div>
      ) : (
        <QtyControl
          qty={getQty(makeQtyKey(article.odoo_template_id))}
          onChange={v => setQty(makeQtyKey(article.odoo_template_id), v)}
        />
      )}
    </div>
  )
}

// ============================================================
// CONTROLE -/QTE/+
// ============================================================

function QtyControl({ qty, onChange }) {
  const isZero = qty === 0
  return (
    <div className={`flex items-center justify-between border rounded ${
      isZero ? 'border-line' : 'border-bordeaux/40'
    }`}>
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={isZero}
        className={`px-2 py-0.5 text-[14px] leading-none ${
          isZero ? 'text-ink-mute' : 'text-bordeaux hover:bg-bordeaux/5'
        }`}
      >
        −
      </button>
      <span className={`text-[11px] min-w-[16px] text-center ${
        isZero ? 'text-ink-mute' : 'text-ink font-bold'
      }`}>
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        className="px-2 py-0.5 text-[14px] leading-none text-bordeaux hover:bg-bordeaux/5"
      >
        +
      </button>
    </div>
  )
}
