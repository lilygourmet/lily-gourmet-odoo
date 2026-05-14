// src/components/StockBoutique/ProductGrid.jsx
// Grille de tuiles produits + panier + onglets taille
// Composant partagé entre Matin (pâtissier) et Réception (article surprise)
// =============================================================

import { useState, useEffect } from 'react'
import { fetchEntremetsCatalog } from '../../lib/stockCatalog'
import NumpadInline from './NumpadInline'

/**
 * Props:
 *   cart: { [productName]: { qty, code } }  (mapping)
 *   onChange: (newCart) => void
 *   basketLabel: string  ("Panier livraison", "Panier ajout", ...)
 *   basketColor: 'green' | 'bordeaux' | 'teal'
 *   compact: boolean
 */
export default function ProductGrid({
  cart = {},
  onChange,
  basketLabel = 'Panier',
  basketColor = 'green',
  compact = false,
}) {
  const [catalog, setCatalog] = useState({ sizes: { '1': [], '5': [], '10': [] } })
  const [currentSize, setCurrentSize] = useState('1')
  const [activeProductName, setActiveProductName] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetchEntremetsCatalog().then(c => {
      if (mounted) {
        setCatalog(c)
        setLoading(false)
      }
    })
    return () => { mounted = false }
  }, [])

  const products = catalog.sizes?.[currentSize] || []

  function clickTile(p) {
    const current = cart[p.name]?.qty || 0
    onChange({
      ...cart,
      [p.name]: { qty: current + 1, code: p.code },
    })
    setActiveProductName(p.name)
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

  // Couleurs panier selon basketColor
  const basketStyles = {
    green: { bg: 'bg-green-50', text: 'text-green-900', tile: 'bg-green-100', badge: 'bg-bordeaux' },
    bordeaux: { bg: 'bg-bordeaux/10', text: 'text-bordeaux-deep', tile: 'bg-bordeaux/20', badge: 'bg-bordeaux' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-900', tile: 'bg-teal-100', badge: 'bg-teal-700' },
  }
  const st = basketStyles[basketColor] || basketStyles.green

  const total = Object.values(cart).reduce((s, v) => s + (v?.qty || 0), 0)
  const cartEntries = Object.entries(cart).filter(([, v]) => (v?.qty || 0) > 0)

  return (
    <div className={`grid ${compact ? 'grid-cols-[240px_1fr]' : 'grid-cols-[280px_1fr]'} gap-3`}>
      {/* PANIER (GAUCHE) */}
      <div className="border border-line rounded-lg overflow-hidden flex flex-col bg-white">
        <div className={`px-3 py-2 ${st.bg} ${st.text} font-mono text-[10px] tracking-[0.2em] uppercase font-semibold`}>
          {basketLabel}
        </div>

        <div className="flex-1 min-h-[180px] max-h-[280px] overflow-y-auto">
          {cartEntries.length === 0 ? (
            <div className="p-8 text-center text-ink-mute text-[11px] italic">
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
                    className="text-ink-mute hover:text-bordeaux p-1"
                    title="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Total */}
        <div className="px-3 py-2 bg-cream-warm border-t border-line text-[11px] flex justify-between">
          <span className="text-ink-mute">Total</span>
          <span className="font-semibold">{total} article{total > 1 ? 's' : ''}</span>
        </div>

        {/* Pavé numérique (uniquement si une ligne est active) */}
        {activeProductName && cart[activeProductName] && (
          <div className="p-2 border-t border-line bg-cream">
            <NumpadInline
              value={cart[activeProductName].qty}
              onChange={(v) => onQtyChange(activeProductName, v)}
              compact
            />
          </div>
        )}
      </div>

      {/* GRILLE PRODUITS (DROITE) */}
      <div>
        {/* Onglets taille */}
        <div className="flex gap-0.5 mb-2 border-b border-line">
          {[
            { id: '1', label: '1 pers' },
            { id: '5', label: '5 pers' },
            { id: '10', label: '10 pers' },
            { id: '15', label: '15 pers' },
          ].map(tab => {
            const active = currentSize === tab.id
            const count = catalog.sizes?.[tab.id]?.length || 0
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCurrentSize(tab.id)}
                className={`px-3 py-1.5 text-[11px] font-medium tracking-wider transition-colors ${
                  active
                    ? 'border-b-2 border-bordeaux text-bordeaux'
                    : 'border-b-2 border-transparent text-ink-mute hover:text-ink'
                }`}
              >
                {tab.label} {count > 0 && <span className="opacity-60">({count})</span>}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="p-8 text-center text-ink-mute text-[11px]">Chargement du catalogue...</div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-ink-mute text-[11px]">
            Aucun article {currentSize} pers trouvé.
          </div>
        ) : (
          <div className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-4'} gap-2`}>
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
                  <div className={`aspect-square rounded-md flex items-center justify-center text-2xl ${
                    qty > 0 ? `${st.tile} text-bordeaux-deep` : 'bg-cream-warm text-ink-mute'
                  }`}>
                    🍰
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
    </div>
  )
}

