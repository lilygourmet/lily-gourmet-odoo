import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import { loadCategoriesForUser, loadCategoryContent, createDemande, loadMyDemandes } from '../../lib/economat'
import EconomatManageModal from './EconomatManageModal'
import { toast } from '../../lib/toast'

// Écran employé : demande d'articles à l'économat.
// L'employé entre directement sur les articles de sa catégorie (switch si plusieurs).
// Étape 1 : sélection des quantités + récapitulatif. (Envoi = étape 2.)
export default function EconomatView({ user, onLogout, onNavigate, activeView }) {
  const [categories, setCategories] = useState([])
  const [activeCat, setActiveCat] = useState(null)
  const [content, setContent] = useState({ groups: [], ungrouped: [] })
  const [qty, setQty] = useState({})              // { [articleId]: number }
  // Précision libre par article : la couleur d'un colorant gel, une taille…
  // Elle est accolée au nom envoyé à l'économe, donc aucune colonne en plus.
  const [precision, setPrecision] = useState({})  // { [articleId]: string }
  const [recherche, setRecherche] = useState('')  // filtre par nom, dans la catégorie ouverte
  const [articleInfo, setArticleInfo] = useState({}) // { [id]: { name, unit, catName } }
  const [customLines, setCustomLines] = useState([]) // articles ajoutés à la main : { name, unit, qty, catName }
  const [customName, setCustomName] = useState('')
  const [customUnit, setCustomUnit] = useState('')
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
        toast.error('Impossible de charger les catégories : ' + (e?.message || e))
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
        if (!cancelled) toast.error('Impossible de charger les articles : ' + (e?.message || e))
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

  function addCustomLine() {
    const name = customName.trim()
    if (!name) return
    const catName = categories.find(x => x.id === activeCat)?.name || ''
    setCustomLines(prev => [...prev, { name, unit: customUnit.trim(), qty: 1, catName }])
    setCustomName('')
    setCustomUnit('')
  }

  function setCustomQty(idx, n) {
    setCustomLines(prev => {
      if (n <= 0) return prev.filter((_, i) => i !== idx)
      return prev.map((c, i) => (i === idx ? { ...c, qty: n } : c))
    })
  }

  const selectedCount = Object.keys(qty).length + customLines.length
  const totalUnits = useMemo(
    () => Object.values(qty).reduce((s, n) => s + n, 0) + customLines.reduce((s, c) => s + c.qty, 0),
    [qty, customLines]
  )

  async function handleSend() {
    const catalogLines = Object.entries(qty).map(([id, n]) => ({
      articleId: Number(id),
      qty: n,
      name: [articleInfo[id]?.name || 'Article', (precision[id] || '').trim()].filter(Boolean).join(' · '),
      unit: articleInfo[id]?.unit || '',
      catName: articleInfo[id]?.catName || '',
    }))
    const freeLines = customLines.map(c => ({
      articleId: null,
      qty: c.qty,
      name: c.name,
      unit: c.unit,
      catName: c.catName,
    }))
    const lines = [...catalogLines, ...freeLines]
    if (lines.length === 0) return
    setSending(true)
    try {
      await createDemande({ user, categoryId: activeCat, lines })
      setQty({})
      setCustomLines([])
      setShowRecap(false)
      setFlash('Demande envoyée à l\'économe')
      setTimeout(() => setFlash(''), 4000)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
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
    <div className="min-h-screen lg-vibrant pb-40 sm:pb-28">
      <AppHeader
        user={user}
        activeView={activeView || 'economat'}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {flash && (
        <div className="fixed top-16 inset-x-0 z-[90] flex justify-center px-4 pointer-events-none">
          <div className="bg-success text-white text-[13px] font-semibold px-4 py-2 rounded-full shadow-lg">{flash}</div>
        </div>
      )}

      {/* Sous-header : titre + switch catégorie si plusieurs */}
      <div className="bg-cream-warm/30 border-b border-line py-3 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="lg-title">Demande d'articles</span>
            <div className="flex items-center gap-1.5">
              {canManage && (
                <button onClick={() => setShowManage(true)} className="lg-tab">Gérer</button>
              )}
              <button onClick={openHistory} className="lg-tab">Mes demandes</button>
            </div>
          </div>
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={`lg-tab ${activeCat === cat.id ? 'is-active' : ''}`}
                >{cat.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Recherche par nom — utile surtout sur téléphone, où faire défiler
            une catégorie de 80 articles est pénible. */}
        {!loading && categories.length > 0 && (
          <div className="relative mb-4">
            <input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="🔎 Chercher un article…"
              className="w-full px-3 py-2.5 pr-9 text-[14px] border border-line rounded-xl bg-white"
            />
            {recherche && (
              <button onClick={() => setRecherche('')} aria-label="Effacer"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute hover:text-bordeaux px-1 text-[16px]">×</button>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center text-ink-mute italic py-12">Chargement...</div>
        ) : categories.length === 0 ? (
          <div className="text-center text-ink-mute italic py-12">
            Aucune catégorie ne t'est attribuée pour l'instant.
          </div>
        ) : loadingContent ? (
          <div className="text-center text-ink-mute italic py-12">Chargement des articles...</div>
        ) : (() => {
          // Filtre par mot tapé, insensible aux accents et à la casse.
          const q = recherche.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const garde = a => !q || String(a.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
          const groups = content.groups.map(g => ({ ...g, articles: g.articles.filter(garde) })).filter(g => g.articles.length)
          const ungrouped = content.ungrouped.filter(garde)
          const rien = groups.length === 0 && ungrouped.length === 0
          return rien ? (
            <div className="text-center text-ink-mute italic py-10">
              {q ? `Aucun article ne contient « ${recherche.trim()} » dans cette catégorie.` : 'Aucun article.'}
            </div>
          ) : (
          <div className="space-y-5">
            {groups.map(group => (
              <div key={group.id}>
                <div className="lg-mono mb-2">{group.name}</div>
                <div className="space-y-1.5">
                  {group.articles.map(a => (
                    <ArticleRow key={a.id} article={a} qty={qty[a.id] || 0} onChange={n => setArticleQty(a.id, n)}
                      precision={precision[a.id] || ''}
                      onPrecision={v => setPrecision(p => ({ ...p, [a.id]: v }))} />
                  ))}
                </div>
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div>
                <div className="lg-mono mb-2" style={{ color: '#8a7a70' }}>Autres</div>
                <div className="space-y-1.5">
                  {ungrouped.map(a => (
                    <ArticleRow key={a.id} article={a} qty={qty[a.id] || 0} onChange={n => setArticleQty(a.id, n)}
                      precision={precision[a.id] || ''}
                      onPrecision={v => setPrecision(p => ({ ...p, [a.id]: v }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Ajouter un article qui n'est pas dans la liste (usage unique) */}
            <div>
              <div className="lg-mono mb-2" style={{ color: '#8a7a70' }}>Pas dans la liste ?</div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomLine() }}
                  placeholder="Nom de l'article"
                  className="flex-1 min-w-0 bg-white rounded-xl border border-line/70 px-3 py-2 text-[13px] text-ink"
                />
                <input
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomLine() }}
                  placeholder="Unité"
                  className="w-20 bg-white rounded-xl border border-line/70 px-2 py-2 text-[13px] text-ink"
                />
                <button
                  onClick={addCustomLine}
                  disabled={!customName.trim()}
                  className="w-9 h-9 rounded-full bg-bordeaux text-cream flex items-center justify-center text-[18px] disabled:opacity-30 hover:bg-bordeaux-deep active:scale-95 transition-transform flex-shrink-0"
                  aria-label="Ajouter"
                >+</button>
              </div>
              {customLines.length > 0 && (
                <div className="space-y-1.5">
                  {customLines.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-line/70 border-l-4 border-l-bordeaux p-2.5 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-ink leading-tight">{c.name}</div>
                        {c.unit && <div className="text-[11px] text-ink-mute mt-0.5">{c.unit}</div>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setCustomQty(i, c.qty - 1)}
                          className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-[18px] text-ink-soft hover:border-bordeaux active:bg-cream-warm"
                          aria-label="Retirer"
                        >−</button>
                        <span className="min-w-[24px] text-center text-[15px] font-semibold text-bordeaux">{c.qty}</span>
                        <button
                          onClick={() => setCustomQty(i, c.qty + 1)}
                          className="w-9 h-9 rounded-full bg-bordeaux text-cream flex items-center justify-center text-[18px] hover:bg-bordeaux-deep active:scale-95 transition-transform"
                          aria-label="Ajouter"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )
        })()}
      </div>

      {/* Barre récap fixe en bas */}
      {selectedCount > 0 && (
        <div className="lg-bottom-bar z-40 bg-cream/95 backdrop-blur-sm border-t border-line px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="text-[13px] text-ink">
              <span className="font-semibold text-bordeaux">{selectedCount}</span> article{selectedCount > 1 ? 's' : ''}
              <span className="text-ink-mute"> · {totalUnits} u</span>
            </div>
            <button
              onClick={() => setShowRecap(true)}
              className="lg-btn"
            >Voir le récap</button>
          </div>
        </div>
      )}

      {/* Modal récapitulatif */}
      {showRecap && (
        <RecapModal
          qty={qty}
          precision={precision}
          articleInfo={articleInfo}
          customLines={customLines}
          onChange={setArticleQty}
          onRemoveCustom={i => setCustomQty(i, 0)}
          onClose={() => setShowRecap(false)}
          onSend={handleSend}
          sending={sending}
        />
      )}

      {showHistory && (
        <HistoryModal demandes={myDemandes} onClose={() => setShowHistory(false)} />
      )}

      {showManage && (
        <EconomatManageModal isAdmin={user?.role === 'admin'} onClose={() => setShowManage(false)} onChanged={reloadStructure} />
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
function ArticleRow({ article, qty, onChange, precision = '', onPrecision }) {
  const active = qty > 0
  return (
    <div className={`bg-white rounded-xl border border-line/70 p-2.5 shadow-sm transition-all ${active ? 'border-l-4 border-l-bordeaux' : ''}`}>
    <div className="flex items-center gap-3">
      {/* Photo : vignette plus grande et zoomée — les visuels produit ont
          souvent beaucoup de blanc autour, l'article paraissait lointain. */}
      <div className="w-14 h-14 rounded-lg bg-cream-deep border border-line/40 flex-shrink-0 overflow-hidden">
        {article.photo_url && <img src={article.photo_url} alt="" className="w-full h-full object-cover scale-[1.35]" />}
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

    {/* Précision libre — n'apparaît qu'une fois l'article choisi */}
    {active && onPrecision && (
      <input
        value={precision}
        onChange={e => onPrecision(e.target.value)}
        placeholder={/colorant/i.test(article.name) ? 'Quelle couleur ?' : 'Précision (facultatif)'}
        className="mt-2 w-full px-2.5 py-1.5 text-[12px] border border-line rounded-lg bg-cream-warm/40"
      />
    )}
    </div>
  )
}

function RecapModal({ qty, precision = {}, articleInfo, customLines = [], onChange, onRemoveCustom, onClose, onSend, sending }) {
  const lines = Object.entries(qty).map(([id, n]) => ({
    id,
    n,
    // même libellé que celui envoyé à l'économe, précision comprise
    name: [articleInfo[id]?.name || 'Article', (precision[id] || '').trim()].filter(Boolean).join(' · '),
    unit: articleInfo[id]?.unit || '',
    catName: articleInfo[id]?.catName || '',
  }))
  // Groupé par catégorie
  const byCat = {}
  for (const l of lines) {
    if (!byCat[l.catName]) byCat[l.catName] = []
    byCat[l.catName].push(l)
  }
  const isEmpty = lines.length === 0 && customLines.length === 0

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
          {isEmpty ? (
            <div className="text-center text-ink-mute italic py-6">Aucun article sélectionné</div>
          ) : (
            <>
              {Object.entries(byCat).map(([catName, items]) => (
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
              ))}
              {customLines.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-bordeaux font-bold mb-1.5">Ajoutés à la main</div>
                  <div className="space-y-1.5">
                    {customLines.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[13px]">
                        <span className="font-semibold text-bordeaux w-8 text-right">×{c.qty}</span>
                        <span className="flex-1 text-ink">{c.name}</span>
                        {c.unit && <span className="text-[11px] text-ink-mute">{c.unit}</span>}
                        <button onClick={() => onRemoveCustom(i)}
                                className="text-ink-mute hover:text-bordeaux text-[12px] px-1" title="Retirer">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-cream/95 backdrop-blur-sm border-t border-line px-5 py-3">
          <button
            onClick={onSend}
            disabled={sending || isEmpty}
            className="lg-btn w-full"
          >
            {sending ? 'Envoi...' : 'Envoyer la demande à l\'économe'}
          </button>
        </div>
      </div>
    </div>
  )
}
