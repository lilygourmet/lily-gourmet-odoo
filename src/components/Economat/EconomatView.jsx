import { useState, useEffect, useMemo } from 'react'
import AppHeader from '../AppHeader'
import { loadCategoriesForUser, loadCategoryContent, createDemande, loadMyDemandes, loadMesHabitudes } from '../../lib/economat'
import EconomatManageModal from './EconomatManageModal'
import { toast } from '../../lib/toast'
import { ICONES, picto } from '../../lib/economatPictos'

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
  // Une seule famille à l'écran, choisie dans la bande du haut : une catégorie
  // de 147 articles tenait sur un écran de téléphone interminable.
  const [familleOuverte, setFamilleOuverte] = useState(null)
  const [habitudes, setHabitudes] = useState({})   // { [articleId]: nb de demandes }
  const [pave, setPave] = useState(null)           // article dont on saisit la quantité au clavier
  const canManage = user?.role === 'admin' || !!user?.perm_econome

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [cats, habs] = await Promise.all([
          loadCategoriesForUser(user),
          loadMesHabitudes(user?.id).catch(() => ({})),
        ])
        setCategories(cats)
        setHabitudes(habs || {})
        if (cats.length > 0) setActiveCat(cats[0].id)
      } catch (e) {
        console.error('[Économat] catégories', e)
        toast.error('Impossible de charger les catégories : ' + (e?.message || e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => { setFamilleOuverte(null) }, [activeCat])

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

          const familles = [
            ...content.groups.map(g => ({ id: String(g.id), name: g.name, articles: g.articles })),
            ...(content.ungrouped.length ? [{ id: '__autres__', name: 'Autres', articles: content.ungrouped }] : []),
          ]
          const tous = familles.flatMap(f => f.articles)

          // Ce que CET employé reprend le plus. Rien tant qu'il n'a pas
          // d'historique : mieux vaut pas de raccourci qu'un faux.
          const habituels = tous
            .filter(a => (habitudes[a.id] || 0) > 0)
            .sort((a, b) => (habitudes[b.id] || 0) - (habitudes[a.id] || 0))
            .slice(0, 12)

          const bandes = [
            ...(habituels.length ? [{ id: '__habitudes__', name: 'Souvent demandé', articles: habituels }] : []),
            ...familles,
          ]
          if (!bandes.length) {
            return <div className="text-center text-ink-mute italic py-10">Aucun article.</div>
          }
          const ouverte = bandes.find(b => b.id === familleOuverte) || bandes[0]
          const aMontrer = q ? tous.filter(garde) : ouverte.articles

          return (
          <div className="space-y-3">
            {/* Bande des familles : la navigation principale, en photos.
                Elle reste visible et défile latéralement. */}
            <div className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
              {bandes.map((b, i) => {
                const c = couleurFamille(b.name, i)
                const actif = !q && b.id === ouverte.id
                const n = b.articles.filter(a => (qty[a.id] || 0) > 0).length
                const vign = b.articles.find(a => a.photo_url)
                return (
                  <button key={b.id} onClick={() => { setFamilleOuverte(b.id); setRecherche(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className="flex-shrink-0 w-[86px] flex flex-col items-center gap-1"
                    style={{ color: c.trait }}>
                    <span className="relative w-[70px] h-[70px] rounded-2xl overflow-hidden flex items-center justify-center"
                      style={{ background: c.fond, border: `2.5px solid ${actif ? c.trait : 'transparent'}` }}>
                      {vign ? (
                        <img src={vign.photo_url} alt="" className="w-full h-full object-cover scale-[1.15]" />
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          dangerouslySetInnerHTML={{ __html: (ICONES[picto(b.articles[0]?.name || '')] || ICONES.defaut).svg }} />
                      )}
                      {n > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-bordeaux text-cream text-[11px] font-bold flex items-center justify-center border-2 border-cream">{n}</span>
                      )}
                    </span>
                    <span className={`text-[11px] leading-tight text-center font-semibold ${actif ? '' : 'text-ink-mute'}`}
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {b.name.split(',')[0].split(' & ')[0]}
                    </span>
                  </button>
                )
              })}
            </div>

            {q && <div className="lg-mono">{aMontrer.length} résultat{aMontrer.length > 1 ? 's' : ''}</div>}

            {aMontrer.length === 0 ? (
              <div className="text-center text-ink-mute italic py-10">
                Aucun article ne contient « {recherche.trim()} » dans cette catégorie.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {aMontrer.map(a => (
                  <ArticleTuile key={a.id} article={a} qty={qty[a.id] || 0}
                    couleur={couleurFamille(ouverte.name, 0).trait}
                    onPlus={() => setArticleQty(a.id, (qty[a.id] || 0) + 1)}
                    onMoins={() => setArticleQty(a.id, (qty[a.id] || 0) - 1)}
                    onPave={() => setPave(a)} />
                ))}
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
      {pave && (
        <PaveQuantite
          article={pave}
          qty={qty[pave.id] || 0}
          precision={precision[pave.id] || ''}
          onPrecision={v => setPrecision(p => ({ ...p, [pave.id]: v }))}
          onValider={n => { setArticleQty(pave.id, n); setPave(null) }}
          onClose={() => setPave(null)}
        />
      )}

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
    <div className="fixed inset-0 h-[100dvh] z-[80] bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88dvh] overflow-y-auto overscroll-contain shadow-2xl border border-line"
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
// Une couleur par famille : elle sert à se repérer d'un coup d'œil, pas à
// décorer. Attribuée de façon stable d'après le nom, donc identique d'une
// ouverture à l'autre et valable pour toutes les catégories.
const PALETTE = [
  { trait: '#4a7c2f', fond: '#eaf3e2' }, { trait: '#a8324b', fond: '#fae9ec' },
  { trait: '#2f6d8c', fond: '#e4f0f5' }, { trait: '#b8862a', fond: '#faf1dd' },
  { trait: '#b45a1e', fond: '#fbebe0' }, { trait: '#8a6a2f', fond: '#f6efe2' },
  { trait: '#7a5a3f', fond: '#f3ece6' }, { trait: '#5c3a24', fond: '#efe6e0' },
  { trait: '#6b6f3a', fond: '#f0f1e4' }, { trait: '#5a5a6e', fond: '#eceded' },
  { trait: '#3f6b6b', fond: '#e6f0ef' }, { trait: '#993556', fond: '#f6e7ec' },
]
function couleurFamille(nom, secours = 0) {
  const t = String(nom || '')
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 9973
  return PALETTE[(t ? h : secours) % PALETTE.length]
}

// Tuile d'article : la photo EST le bouton « ajouter ». Toucher le chiffre
// ouvre le pavé — sans lui, commander 100 kg demandait 100 appuis.
function ArticleTuile({ article, qty, couleur, onPlus, onMoins, onPave }) {
  const actif = qty > 0
  return (
    <div
      onClick={onPlus}
      className={`relative bg-white rounded-xl overflow-hidden cursor-pointer flex flex-col transition-all ${
        actif ? 'border-[1.5px] border-bordeaux shadow-[inset_0_0_0_1.5px_#993556]' : 'border-[1.5px] border-line/70'
      }`}
    >
      {actif && (
        <button
          onClick={e => { e.stopPropagation(); onMoins() }}
          aria-label="Retirer"
          className="absolute top-1 left-1 z-10 w-7 h-7 rounded-full bg-white border-[1.5px] border-line text-ink-soft text-[17px] leading-none flex items-center justify-center"
        >−</button>
      )}
      <button
        onClick={e => { e.stopPropagation(); onPave() }}
        aria-label="Saisir la quantité"
        className={`absolute top-1 right-1 z-10 min-w-[28px] h-7 px-1.5 rounded-full text-[13px] font-bold flex items-center justify-center tabular-nums ${
          actif ? 'bg-bordeaux text-cream shadow-md' : 'bg-white/85 border border-line text-ink-mute'
        }`}
      >{qty}</button>

      <div className="aspect-square bg-white flex items-center justify-center overflow-hidden">
        {article.photo_url ? (
          <img src={article.photo_url} alt="" loading="lazy" className="w-full h-full object-cover scale-[1.18]" />
        ) : (
          <svg viewBox="0 0 24 24" className="w-[44%] h-[44%] opacity-85" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: couleur }}
            dangerouslySetInnerHTML={{ __html: (ICONES[picto(article.name)] || ICONES.defaut).svg }} />
        )}
      </div>
      <div className="px-1.5 pt-1.5 pb-2 text-[11.5px] font-semibold leading-tight text-ink">
        {article.name}
        {article.unit && <span className="block text-[10px] font-normal text-ink-mute mt-0.5">{article.unit}</span>}
      </div>
    </div>
  )
}

// Pavé numérique : raccourcis pour les cas courants, clavier pour le reste.
// La précision (« quelle couleur ? ») est ici, faute de place sur la tuile.
function PaveQuantite({ article, qty, precision, onPrecision, onValider, onClose }) {
  const [val, setVal] = useState(qty ? String(qty) : '')
  const RACCOURCIS = [1, 2, 5, 10, 20, 50, 100]
  const touche = (t) => {
    if (t === '⌫') return setVal(v => v.slice(0, -1))
    setVal(v => (v.length >= 5 ? v : (v === '0' ? '' : v) + t))
  }
  return (
    <div className="fixed inset-0 h-[100dvh] z-[90] bg-ink/45 flex items-end" onClick={onClose}>
      <div className="w-full max-w-md mx-auto bg-cream rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[94dvh] overflow-y-auto overscroll-contain"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2.5">
          <span className="flex-1 text-[16px] font-semibold text-ink truncate">
            {article.name}{article.unit ? ` — ${article.unit}` : ''}
          </span>
          <button onClick={onClose} aria-label="Fermer" className="text-[26px] leading-none text-ink-mute px-1">×</button>
        </div>

        <div className="bg-cream-warm rounded-xl py-3.5 text-center text-[34px] font-bold tabular-nums text-ink mb-2.5">
          {val === '' ? '0' : val}
        </div>

        <div className="flex gap-1.5 overflow-x-auto mb-2.5" style={{ scrollbarWidth: 'none' }}>
          {RACCOURCIS.map(n => (
            <button key={n} onClick={() => setVal(String(n))}
              className="flex-shrink-0 px-4 py-2 rounded-full border-[1.5px] border-bordeaux text-bordeaux text-[15px] font-bold">{n}</button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {['1','2','3','4','5','6','7','8','9','0','00','⌫'].map(t => (
            <button key={t} onClick={() => touche(t)}
              className="py-3.5 rounded-xl border border-line bg-cream-warm text-[21px] font-semibold text-ink">{t}</button>
          ))}
        </div>

        {onPrecision && (
          <input
            value={precision}
            onChange={e => onPrecision(e.target.value)}
            placeholder={/colorant/i.test(article.name) ? 'Quelle couleur ?' : 'Précision (facultatif)'}
            className="mt-2.5 w-full px-3 py-2.5 text-[13px] border border-line rounded-xl bg-white"
          />
        )}

        <div className="flex gap-2 mt-3">
          <button onClick={() => onValider(0)}
            className="w-2/5 py-3.5 rounded-xl border-[1.5px] border-line text-ink-soft text-[16px] font-bold">Retirer</button>
          <button onClick={() => onValider(parseInt(val || '0', 10))}
            className="flex-1 py-3.5 rounded-xl bg-bordeaux text-cream text-[16px] font-bold">Valider</button>
        </div>
      </div>
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
    <div className="fixed inset-0 h-[100dvh] z-[80] bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={onClose}>
      <div className="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[88dvh] flex flex-col overflow-hidden shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>
        <div className="bg-cream border-b border-line px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="font-fraunces italic text-[18px] text-ink">Récapitulatif</h3>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center">×</button>
        </div>

        <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto overscroll-contain">
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

        <div className="bg-cream border-t border-line px-5 py-3 flex-shrink-0"
             style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
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
