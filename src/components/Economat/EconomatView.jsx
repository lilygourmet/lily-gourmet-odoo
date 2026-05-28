import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import { loadCategoriesForUser, loadCategoryContent, createDemande, loadMyDemandes } from '../../lib/economat'
import EconomatManageModal from './EconomatManageModal'

// Écran employé : demande d'articles à l'économat.
// L'employé entre directement sur les articles de sa catégorie (switch si plusieurs).
// Étape 1 : sélection des quantités + récapitulatif. (Envoi = étape 2.)
export default function EconomatView({ user, onLogout, onNavigate, activeView }) {
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [content, setContent] = useState({ groups: [], ungrouped: [] })
  const [qty, setQty] = useState({})              // { [articleId]: number }
  const [articleInfo, setArticleInfo] = useState({}) // { [id]: { name, unit, catName } }
  const [loading, setLoading] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)
  const [showRecap, setShowRecap] = useState(false)
  const [sending, setSending] = useState(false)
  const [flash, setFlash] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [myDemandes, setMyDemandes] = useState(null)  // null = pas encore chargé
  const [showManage, setShowManage] = useState(false)
  const canManage = user?.role === 'admin' || !!user?.perm_econome

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const cats = await loadCategoriesForUser(user)
        setCategories(cats)
        if (cats.length > 0) setActiveCat(cats[0].id)
      } catch (e) {
        console.error('[Économat] catégories', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!activeCat) return
    let cancelled = false
    ;(async () => {
      setLoadingContent(true)
      try {
        const c = await loadCategoryContent(activeCat)
        if (cancelled) return
        setContent(c)
        // Mémorise nom/unité des articles (pour le récap, même en changeant de catégorie)
        const catName = categories.find(x => x.id === activeCat)?.name || ''
        setArticleInfo(prev => {
          const next = { ...prev }
          for (const g of c.groups) for (const a of g.articles) next[a.id] = { name: a.name, unit: a.unit, catName }
          for (const a of c.ungrouped) next[a.id] = { name: a.name, unit: a.unit, catName }
          return next
        })
      } catch (e) {
        console.error('[Économat] contenu', e)
      } finally {
        if (!cancelled) setLoadingContent(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeCat])

  function setArticleQty(id, n) {
    setQty(prev => {
      const next = { ...prev }
      if (n <= 0) delete next[id]
      else next[id] = n
      return next
    })
  }

  const selectedCount = Object.keys(qty).length
  const totalUnits = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty])

  async function handleSend() {
    const lines = Object.entries(qty).map(([id, n]) => ({
      articleId: Number(id),
      qty: n,
      name: articleInfo[id]?.name || 'Article',
      unit: articleInfo[id]?.unit || '',
      catName: articleInfo[id]?.catName || '',
    }))
    if (lines.length === 0) return
    setSending(true)
    try {
      await createDemande({ user, categoryId: activeCat, lines })
      setQty({})
      setShowRecap(false)
      setFlash('Demande envoyée à l\'économe ✅')
      setTimeout(() => setFlash(''), 4000)
    } catch (e) {
      alert('Erreur : ' + e.message)
    } finally {
      setSending(false)
    }
  }

  async function openHistory() {
    setShowHistory(true)
    setMyDemandes(null)
    try {
      setMyDemandes(await loadMyDemandes(user?.id))
    } catch (e) {
      console.error('[Économat] historique', e)
      setMyDemandes([])
    }
  }

  // Recharge la structure après une modif dans l'écran de gestion.
  async function reloadStructure() {
    try {
      const cats = await loadCategoriesForUser(user)
      setCategories(cats)
      if (activeCat && cats.find(c => c.id === activeCat)) {
        setContent(await loadCategoryContent(activeCat))
      } else if (cats.length > 0) {
        setActiveCat(cats[0].id)
      } else {
        setActiveCat(null)
        setContent({ groups: [], ungrouped: [] })
      }
    } catch (e) {
      console.error('[Économat] reload', e)
    }
  }

  return (
    <div className="min-h-screen bg-cream pb-28">
      <AppHeader
        user={user}
        activeView={activeView || 'economat'}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {flash && (
        <div className="fixed top-16 inset-x-0 z-[90] flex justify-center px-4 pointer-events-none">
          <div className="bg-success text-white text-[13px] font-medium px-4 py-2 rounded-full shadow-lg">{flash}</div>
        </div>
      )}

      {/* Sous-header : titre + switch catégorie si plusieurs */}
      <div className="bg-cream-warm/30 border-b border-line py-3 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[20px]">🧾</span>
              <span className="font-fraunces italic text-[18px] text-ink">Demande d'articles</span>
            </div>
            <div className="flex items-center gap-1.5">
              {canManage && (
                <button
                  onClick={() => setShowManage(true)}
                  className="px-3 py-1 rounded-full border border-line text-ink text-[12px] font-medium hover:border-bordeaux hover:bg-cream-warm transition-colors"
                >⚙️ Gérer</button>
              )}
              <button
                onClick={openHistory}
                className="px-3 py-1 rounded-full border border-line text-ink text-[12px] font-medium hover:border-bordeaux hover:bg-cream-warm transition-colors"
              >🕐 Mes demandes</button>
            </div>
          </div>
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors border ${
                    activeCat === cat.id
                      ? 'bg-bordeaux text-cream border-bordeaux'
                      : 'bg-white text-ink-soft border-line hover:border-bordeaux/40'
                  }`}
                >{cat.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="text-center text-ink-mute italic py-12">Chargement...</div>
        ) : categories.length === 0 ? (
          <div className="text-center text-ink-mute italic py-12">
            Aucune catégorie ne t'est attribuée pour l'instant.
          </div>
        ) : loadingContent ? (
          <div className="text-center text-ink-mute italic py-12">Chargement des articles...</div>
        ) : (
          <div className="space-y-5">
            {content.groups.map(group => (
              <div key={group.id}>
                <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-bordeaux font-bold mb-2">
                  {group.name}
                </div>
                <div className="space-y-1.5">
                  {group.articles.map(a => (
                    <ArticleRow key={a.id} article={a} qty={qty[a.id] || 0} onChange={n => setArticleQty(a.id, n)} />
                  ))}
                </div>
              </div>
            ))}
            {content.ungrouped.length > 0 && (
              <div>
                <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute font-bold mb-2">Autres</div>
                <div className="space-y-1.5">
                  {content.ungrouped.map(a => (
                    <ArticleRow key={a.id} article={a} qty={qty[a.id] || 0} onChange={n => setArticleQty(a.id, n)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barre récap fixe en bas */}
      {selectedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-cream/95 backdrop-blur-sm border-t border-line px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="text-[13px] text-ink">
              <span className="font-semibold text-bordeaux">{selectedCount}</span> article{selectedCount > 1 ? 's' : ''}
              <span className="text-ink-mute"> · {totalUnits} u</span>
            </div>
            <button
              onClick={() => setShowRecap(true)}
              className="px-4 py-2 rounded-full bg-bordeaux text-cream text-[13px] font-medium hover:bg-bordeaux-deep transition-colors"
            >Voir le récap</button>
          </div>
        </div>
      )}

      {/* Modal récapitulatif */}
      {showRecap && (
        <RecapModal
          qty={qty}
          articleInfo={articleInfo}
          onChange={setArticleQty}
          onClose={() => setShowRecap(false)}
          onSend={handleSend}
          sending={sending}
        />
      )}

      {showHistory && (
        <HistoryModal demandes={myDemandes} onClose={() => setShowHistory(false)} />
      )}

      {showManage && (
        <EconomatManageModal onClose={() => setShowManage(false)} onChanged={reloadStructure} />
      )}
    </div>
  )
}

// Historique des demandes envoyées par l'employé (lecture seule, texte en noir).
function HistoryModal({ demandes, onClose }) {
  function fmtDate(iso) {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' à ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-5 py-3 flex items-center justify-between">
          <h3 className="font-fraunces italic text-[18px] text-ink">Mes demandes</h3>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {demandes === null ? (
            <div className="text-center text-ink-mute italic py-6">Chargement...</div>
          ) : demandes.length === 0 ? (
            <div className="text-center text-ink-mute italic py-6">Tu n'as pas encore envoyé de demande.</div>
          ) : (
            demandes.map(dem => (
              <div key={dem.id} className="border border-line rounded-lg p-3">
                <div className="text-[11px] text-ink-mute mb-1.5">{fmtDate(dem.created_at)}</div>
                <div className="space-y-1">
                  {(dem.economat_demande_lignes || []).map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px] text-ink">
                      <span className="font-semibold text-bordeaux w-8 text-right">×{l.qty}</span>
                      <span className="flex-1">{l.article_name}</span>
                      {l.unit && <span className="text-[11px] text-ink-mute">{l.unit}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// Une ligne article : [photo réservée] [nom + unité] [− qté +]
function ArticleRow({ article, qty, onChange }) {
  const active = qty > 0
  return (
    <div className={`flex items-center gap-3 bg-white rounded-lg border p-2 transition-colors ${active ? 'border-bordeaux/50' : 'border-line/60'}`}>
      {/* Emplacement photo (rempli depuis Odoo plus tard) */}
      <div className="w-11 h-11 rounded-md bg-cream-warm border border-line/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {article.photo_url
          ? <img src={article.photo_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-[16px] opacity-30">📦</span>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink leading-tight">{article.name}</div>
        {article.unit && <div className="text-[11px] text-ink-mute mt-0.5">{article.unit}</div>}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onChange(qty - 1)}
          disabled={qty <= 0}
          className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-[18px] text-ink-soft disabled:opacity-30 hover:border-bordeaux active:bg-cream-warm"
          aria-label="Retirer"
        >−</button>
        <span className={`min-w-[24px] text-center text-[15px] font-semibold ${active ? 'text-bordeaux' : 'text-ink-mute'}`}>{qty}</span>
        <button
          onClick={() => onChange(qty + 1)}
          className="w-9 h-9 rounded-full bg-bordeaux text-cream flex items-center justify-center text-[18px] hover:bg-bordeaux-deep active:scale-95 transition-transform"
          aria-label="Ajouter"
        >+</button>
      </div>
    </div>
  )
}

function RecapModal({ qty, articleInfo, onChange, onClose, onSend, sending }) {
  const lines = Object.entries(qty).map(([id, n]) => ({
    id,
    n,
    name: articleInfo[id]?.name || 'Article',
    unit: articleInfo[id]?.unit || '',
    catName: articleInfo[id]?.catName || '',
  }))
  // Groupé par catégorie
  const byCat = {}
  for (const l of lines) {
    if (!byCat[l.catName]) byCat[l.catName] = []
    byCat[l.catName].push(l)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-5 py-3 flex items-center justify-between">
          <h3 className="font-fraunces italic text-[18px] text-ink">Récapitulatif</h3>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {lines.length === 0 ? (
            <div className="text-center text-ink-mute italic py-6">Aucun article sélectionné</div>
          ) : (
            Object.entries(byCat).map(([catName, items]) => (
              <div key={catName}>
                {catName && <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-bordeaux font-bold mb-1.5">{catName}</div>}
                <div className="space-y-1.5">
                  {items.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold text-bordeaux w-8 text-right">×{l.n}</span>
                      <span className="flex-1 text-ink">{l.name}</span>
                      {l.unit && <span className="text-[11px] text-ink-mute">{l.unit}</span>}
                      <button onClick={() => onChange(l.id, 0)}
                              className="text-ink-mute hover:text-bordeaux text-[12px] px-1" title="Retirer">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sticky bottom-0 bg-cream/95 backdrop-blur-sm border-t border-line px-5 py-3">
          <button
            onClick={onSend}
            disabled={sending || lines.length === 0}
            className="w-full py-2.5 rounded-full bg-bordeaux text-cream text-[13px] font-medium hover:bg-bordeaux-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Envoi...' : 'Envoyer la demande à l\'économe'}
          </button>
        </div>
      </div>
    </div>
  )
}
