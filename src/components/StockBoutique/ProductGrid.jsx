// src/components/StockBoutique/ProductGrid.jsx
// Grille de tuiles produits + panier + 2 niveaux d'onglets (catégorie + taille)
// V3 : 8 catégories E-/GS-/V-/MI-/SU-/RA-/H-/N-, tailles dynamiques par catégorie
// =============================================================

import { useState, useEffect, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { fetchEntremetsCatalog } from '../../lib/stockCatalog'
import NumpadInline from './NumpadInline'

// Catégories sucrées (Vitrine sucrée)
const SUCRE_CATEGORIES = new Set(['E-', 'MI-', 'V-', 'RA-', 'H-', 'N-'])
// Catégories salées (Vitrine Salé)
const SALE_CATEGORIES = new Set(['SU-'])
// Patterns produits GS- qui sont SUCRES (plateaux, cookies) — exclus de Vitrine Salé
const GS_SUCRE_PATTERNS = [
  /^GS-\s*plateau/i,
  /^GS-\s*cookies?\b/i,
]

export function isGsSucre(productName) {
  if (!productName) return false
  const cleaned = String(productName).replace(/^\[\d+\]\s*/, '').trim()
  return GS_SUCRE_PATTERNS.some(rx => rx.test(cleaned))
}

// Un produit est "salé" (Vitrine Salé) : catégorie SU-, ou GS- non-sucré.
export function isSaleProduct(productName) {
  const cleaned = String(productName || '').replace(/^\[\d+\]\s*/, '').trim()
  if (cleaned.startsWith('SU-')) return true
  if (cleaned.startsWith('GS-') && !isGsSucre(cleaned)) return true
  return false
}

export default function ProductGrid({
  cart = {},
  onChange,
  basketLabel = 'Panier',
  basketColor = 'green',
  compact = false,
  mode = null,  // null = pas de filtre | 'sucre' | 'sale'
  // Slot optionnel : contenu inseré à droite de la rangée des onglets catégories,
  // visible uniquement en desktop (md:+). Typiquement un bouton d'action principal
  // (ex: « Envoyer au café » dans StockMorning).
  headerSlot = null,
}) {
  const [catalog, setCatalog] = useState({ categories: [] })
  const [currentCategory, setCurrentCategory] = useState('E-')
  const [currentSize, setCurrentSize] = useState(null)
  const [activeProductName, setActiveProductName] = useState(null)
  const [loading, setLoading] = useState(true)
  // Mobile : onglet actif entre Articles (tuiles) et Panier
  const [mobileTab, setMobileTab] = useState('articles')

  useEffect(() => {
    let mounted = true
    fetchEntremetsCatalog().then(c => {
      if (mounted) {
        setCatalog(c)
        setLoading(false)
        // Initialiser la catégorie par défaut selon le mode
        const allCats = c.categories || []
        let defaultCatId
        if (mode === 'sale') {
          defaultCatId = 'SU-'  // démarrer sur SU- en mode salé
        } else if (mode === 'sucre') {
          defaultCatId = 'E-'   // démarrer sur E- en mode sucré
        } else {
          defaultCatId = 'E-'   // pas de mode = comportement actuel
        }
        const firstCat = allCats.find(cat => cat.id === defaultCatId) || allCats[0]
        if (firstCat) {
          setCurrentCategory(firstCat.id)
          if (firstCat.has_size_tabs && firstCat.sizes.length > 0) {
            setCurrentSize(firstCat.sizes[0])
          }
        }
      }
    })
    return () => { mounted = false }
  }, [mode])

  // Catalogue filtré selon le mode (sucre/sale)
  const filteredCatalog = useMemo(() => {
    if (!mode) return catalog  // pas de filtre

    // Helper : reconstruit articlesBySize à partir d'une liste d'articles filtrés
    function rebuildBySize(articles) {
      const bySize = { _none: [] }
      for (const a of articles) {
        const size = a.size || '_none'
        if (!bySize[size]) bySize[size] = []
        bySize[size].push(a)
      }
      return bySize
    }

    const filteredCategories = []
    for (const cat of (catalog.categories || [])) {
      if (mode === 'sucre') {
        if (SUCRE_CATEGORIES.has(cat.id)) {
          // Catégorie 100% sucrée → garde telle quelle
          filteredCategories.push(cat)
        } else if (cat.id === 'GS-') {
          // GS- : garder uniquement les produits sucrés (plateaux, cookies)
          const filteredArticles = (cat.articles || []).filter(a => isGsSucre(a.name))
          if (filteredArticles.length > 0) {
            filteredCategories.push({
              ...cat,
              articles: filteredArticles,
              articlesBySize: rebuildBySize(filteredArticles),
              nb_articles: filteredArticles.length,
            })
          }
        }
        // sinon (SU-, autres) : exclus
      } else if (mode === 'sale') {
        if (SALE_CATEGORIES.has(cat.id)) {
          // SU- → garde telle quelle
          filteredCategories.push(cat)
        } else if (cat.id === 'GS-') {
          // GS- : garder uniquement les produits NON-sucrés (donc salés)
          const filteredArticles = (cat.articles || []).filter(a => !isGsSucre(a.name))
          if (filteredArticles.length > 0) {
            filteredCategories.push({
              ...cat,
              articles: filteredArticles,
              articlesBySize: rebuildBySize(filteredArticles),
              nb_articles: filteredArticles.length,
            })
          }
        }
        // sinon (E-, MI-, V-, RA-, H-, N-) : exclus
      }
    }
    return { ...catalog, categories: filteredCategories }
  }, [catalog, mode])

  // Catégorie active (sur le catalogue filtré)
  const activeCat = useMemo(() => {
    return (filteredCatalog.categories || []).find(c => c.id === currentCategory) || null
  }, [filteredCatalog, currentCategory])

  // Articles à afficher : selon la catégorie + taille active
  const products = useMemo(() => {
    if (!activeCat) return []
    if (!activeCat.has_size_tabs) {
      // Catégorie sans tailles : tous les articles + les articles "_none"
      return [
        ...(activeCat.articlesBySize?._none || []),
        ...(activeCat.articles || []).filter(a => a.size !== null),
      ]
    }
    if (!currentSize) return []
    // Avec tailles : articles de la taille active + articles "_none" (sans suffixe taille, ex: Miss Pistache)
    const sizeArticles = activeCat.articlesBySize?.[currentSize] || []
    // Si on est sur la plus petite taille, on inclut aussi les articles sans taille (compat Miss Pistache)
    const isFirstSize = activeCat.sizes[0] === currentSize
    if (isFirstSize) {
      return [...sizeArticles, ...(activeCat.articlesBySize?._none || [])]
    }
    return sizeArticles
  }, [activeCat, currentSize])

  // Si on change de catégorie, ajuster currentSize automatiquement
  useEffect(() => {
    if (!activeCat) return
    if (activeCat.has_size_tabs && activeCat.sizes.length > 0) {
      // Si la taille courante n'existe pas dans cette catégorie, prendre la première dispo
      if (!activeCat.sizes.includes(currentSize)) {
        setCurrentSize(activeCat.sizes[0])
      }
    } else {
      setCurrentSize(null)
    }
  }, [activeCat])

  function clickTile(p) {
    const current = cart[p.name]?.qty || 0
    onChange({
      ...cart,
      [p.name]: { qty: current + 1, code: p.code },
    })
    setActiveProductName(p.name)
    // Met à jour orderAdded : retire si présent (pour rebumper en fin)
    setOrderAdded(prev => [...prev.filter(n => n !== p.name), p.name])
  }

  function selectRow(name) {
    setActiveProductName(activeProductName === name ? null : name)
  }

  function deleteRow(name, ev) {
    ev.stopPropagation()
    const next = { ...cart }
    delete next[name]
    onChange(next)
    if (activeProductName === name) setActiveProductName(null)
  }

  function onQtyChange(name, newQty) {
    onChange({
      ...cart,
      [name]: { ...cart[name], qty: newQty },
    })
  }

  const basketStyles = {
    green: { bg: 'bg-green-50', text: 'text-green-900', tile: 'bg-green-100', badge: 'bg-bordeaux' },
    bordeaux: { bg: 'bg-bordeaux/10', text: 'text-bordeaux-deep', tile: 'bg-bordeaux/20', badge: 'bg-bordeaux' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-900', tile: 'bg-teal-100', badge: 'bg-teal-700' },
  }
  const st = basketStyles[basketColor] || basketStyles.green

  // Track l'ordre d'ajout pour pouvoir trier DESC (dernier en premier)
  const [orderAdded, setOrderAdded] = useState([])  // tableau de noms dans l'ordre où ils ont été ajoutés

  const total = Object.values(cart).reduce((s, v) => s + (v?.qty || 0), 0)
  // Trier les entries : par dernier ajout DESC, puis par nom alpha
  const cartEntries = Object.entries(cart)
    .filter(([, v]) => (v?.qty || 0) > 0)
    .sort(([nameA], [nameB]) => {
      const idxA = orderAdded.indexOf(nameA)
      const idxB = orderAdded.indexOf(nameB)
      // Si pas dans orderAdded (ex: cart initial), va en bas
      if (idxA === -1 && idxB === -1) return nameA.localeCompare(nameB, 'fr')
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxB - idxA  // DESC : indice plus grand en premier
    })

  return (
    <div className={`grid grid-cols-1 ${compact ? 'md:grid-cols-[240px_1fr]' : 'md:grid-cols-[280px_1fr]'} gap-3 pb-16 md:pb-0`}>
      {/* ============= PANIER (mobile: visible si tab=panier, desktop: toujours visible à gauche) ============= */}
      <div className={`${mobileTab === 'panier' ? 'block' : 'hidden'} md:block border border-line rounded-lg overflow-hidden flex flex-col bg-white`}>

        {/* HEADER */}
        <div className={`px-3 py-2 ${st.bg} ${st.text} font-mono text-[10px] tracking-[0.2em] uppercase font-semibold`}>
          {basketLabel}
        </div>

        {/* CALCULETTE EN HAUT — toujours visible (grisée si pas de ligne sélectionnée) */}
        <div className="p-2 border-b border-line bg-cream">
          <div className={activeProductName && cart[activeProductName] ? '' : 'opacity-40 pointer-events-none'}>
            <NumpadInline
              value={(activeProductName && cart[activeProductName]?.qty) || 0}
              onChange={(v) => activeProductName && onQtyChange(activeProductName, v)}
              resetKey={activeProductName}
              compact
            />
          </div>
          {activeProductName && cart[activeProductName] ? (
            <div className="text-[10px] text-bordeaux-deep mt-1.5 text-center font-medium truncate">
              {activeProductName}
            </div>
          ) : (
            <div className="text-[10px] text-ink-mute mt-1.5 text-center italic">
              {cartEntries.length === 0
                ? '↓ Clique une tuile à droite'
                : '↓ Clique une ligne ci-dessous'}
            </div>
          )}
        </div>

        {/* LISTE PANIER EN BAS (tri : dernier ajouté en premier) */}
        <div className="px-3 py-1.5 bg-cream-warm border-b border-line">
          <div className="text-[9px] uppercase tracking-[0.15em] text-ink-mute font-mono">
            Articles
          </div>
        </div>
        <div className="flex-1 min-h-[120px] max-h-[280px] overflow-y-auto">
          {cartEntries.length === 0 ? (
            <div className="p-6 text-center text-ink-mute text-[11px] italic">
              Aucun article.<br />Clique une tuile à droite.
            </div>
          ) : (
            cartEntries.map(([name, v]) => {
              const isActive = activeProductName === name
              return (
                <div
                  key={name}
                  onClick={() => selectRow(name)}
                  className={`px-3 py-2 border-b border-line cursor-pointer flex items-center gap-2 ${
                    isActive ? 'bg-bordeaux/5 border-l-[3px] border-l-bordeaux pl-[10px]' : 'hover:bg-cream-warm'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] ${isActive ? 'font-semibold' : 'font-medium'} truncate`}>
                      {name}
                    </div>
                  </div>
                  <div className={`text-[14px] font-semibold min-w-[24px] text-right ${isActive ? 'text-bordeaux' : 'text-ink'}`}>
                    {v.qty}
                  </div>
                  <button
                    onClick={(ev) => deleteRow(name, ev)}
                    className="text-ink-mute hover:text-bordeaux p-1 inline-flex items-center"
                    title="Supprimer"
                  >
                    <Trash2 size={13} strokeWidth={1.8} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="px-3 py-2 bg-cream-warm border-t border-line text-[11px] flex justify-between">
          <span className="text-ink-mute">Total</span>
          <span className="font-semibold">{total} article{total > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ============= GRILLE PRODUITS (mobile: visible si tab=articles, desktop: toujours visible à droite) ============= */}
      <div className={`${mobileTab === 'articles' ? 'block' : 'hidden'} md:block`}>
        {/* NIVEAU 1 : Onglets catégorie (scroll horizontal sur mobile)
            + slot optionnel à droite (desktop only) pour bouton d'action principal */}
        <div className="flex items-end gap-2 mb-2 border-b border-line">
          <div className="flex gap-1 overflow-x-auto pb-0.5 flex-1 min-w-0">
            {(filteredCatalog.categories || []).map(cat => {
              const active = currentCategory === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCurrentCategory(cat.id)}
                  className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-[52px] rounded-t-md transition-colors ${
                    active
                      ? 'bg-bordeaux text-cream font-medium'
                      : 'text-ink-mute hover:bg-cream-warm'
                  }`}
                  title={`${cat.label} (${cat.nb_articles} articles)`}
                >
                  <span className="text-[14px] leading-none">{cat.emoji}</span>
                  <span className="text-[9px] leading-tight">{cat.label}</span>
                </button>
              )
            })}
          </div>
          {/* Slot d'action (ex: bouton « Envoyer au café »).
              Cache sur mobile : sur petit ecran on garde la barre du bas existante,
              plus accessible que d'avoir le bouton noye dans le scroll horizontal des onglets. */}
          {headerSlot && (
            <div className="hidden md:flex flex-shrink-0 pb-1">
              {headerSlot}
            </div>
          )}
        </div>

        {/* NIVEAU 2 : Onglets taille (uniquement si la catégorie a des tailles) */}
        {activeCat && activeCat.has_size_tabs && activeCat.sizes.length > 0 && (
          <div className="flex gap-0.5 mb-2 border-b border-line">
            {activeCat.sizes.map(s => {
              const active = currentSize === s
              const count = (activeCat.articlesBySize?.[s] || []).length
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCurrentSize(s)}
                  className={`px-3 py-1.5 text-[11px] font-medium tracking-wider transition-colors ${
                    active
                      ? 'border-b-2 border-bordeaux text-bordeaux'
                      : 'border-b-2 border-transparent text-ink-mute hover:text-ink'
                  }`}
                >
                  {s} pers {count > 0 && <span className="opacity-60">({count})</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* GRILLE */}
        {loading ? (
          <div className="p-8 text-center text-ink-mute text-[11px]">Chargement du catalogue Odoo...</div>
        ) : !activeCat ? (
          <div className="p-8 text-center text-ink-mute text-[11px]">
            Aucune catégorie disponible. Vérifie la connexion Odoo.
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-ink-mute text-[11px]">
            Aucun article dans cette {activeCat.has_size_tabs ? 'taille' : 'catégorie'}.
          </div>
        ) : (
          <div className={`grid grid-cols-2 ${compact ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-2`}>
            {products.map(p => {
              const qty = cart[p.name]?.qty || 0
              const isActive = activeProductName === p.name
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => clickTile(p)}
                  className={`relative border rounded-md p-1.5 transition-all ${
                    qty > 0 ? `border-bordeaux ${st.bg}` : 'border-line bg-white hover:bg-cream-warm'
                  } ${isActive ? 'ring-2 ring-bordeaux' : ''}`}
                >
                  <div className={`aspect-square rounded-md flex items-center justify-center text-2xl overflow-hidden ${
                    qty > 0 ? `${st.tile} text-bordeaux-deep` : 'bg-cream-warm text-ink-mute'
                  }`}>
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <span>{activeCat?.emoji || '🍰'}</span>
                    )}
                  </div>
                  {qty > 0 && (
                    <div className={`absolute top-1 right-1 ${st.badge} text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] font-semibold px-1.5`}>
                      {qty}
                    </div>
                  )}
                  <div className="text-[10px] mt-1 text-center leading-tight line-clamp-2">
                    {p.name}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ============= BOTTOM BAR MOBILE : onglets Articles / Panier ============= */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-line flex md:hidden shadow-lg">
        <button
          type="button"
          onClick={() => setMobileTab('articles')}
          className={`flex-1 py-3 text-[12px] font-medium text-center transition-colors ${
            mobileTab === 'articles'
              ? 'bg-bordeaux text-cream'
              : 'text-ink-mute hover:bg-cream-warm'
          }`}
        >
          Articles
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('panier')}
          className={`flex-1 py-3 text-[12px] font-medium text-center transition-colors flex items-center justify-center gap-2 ${
            mobileTab === 'panier'
              ? 'bg-bordeaux text-cream'
              : 'text-ink-mute hover:bg-cream-warm'
          }`}
        >
          Panier
          {total > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              mobileTab === 'panier' ? 'bg-cream text-bordeaux' : 'bg-bordeaux text-cream'
            }`}>
              {total}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

