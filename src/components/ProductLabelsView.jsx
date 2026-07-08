import { useState, useEffect } from 'react'
import { Printer, Search, X } from 'lucide-react'
import AppHeader from './AppHeader'
import { searchProductLabels, genProductLabelsGroup } from '../lib/salesLines'
import { toast } from '../lib/toast'

// Étiquettes prix produits : on cherche un produit (Odoo), on coche la/les
// taille(s), puis on imprime sur A4 des étiquettes 8 × 5,7 cm.
const LABEL_W_MM = 80
const LABEL_H_MM = 57

function fmtPrice(p) {
  const n = Math.round(Number(p) * 100) / 100
  return Number.isInteger(n) ? String(n) : String(n)
}
// La taille « 1 » = individuel → on n'affiche rien (juste le prix).
// Un nombre seul (ex. « 5 ») = nombre de personnes → on ajoute « pers ».
function sizeLabel(size) {
  const s = (size || '').trim()
  if (!s || s === '1') return ''
  if (/^\d+$/.test(s)) return `${s} pers`
  return s
}
const keyOf = (it) => `${it.id}|${it.size}|${it.price}`

export default function ProductLabelsView({ user, activeView, onNavigate, onLogout }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState([])   // [{id,name,descriptif,size,price,qty}]
  const [genBusy, setGenBusy] = useState('')

  // Génère en lot toutes les étiquettes d'une famille et les ajoute à la liste.
  async function generate(group, label) {
    setGenBusy(group)
    try {
      const prods = await genProductLabelsGroup(group)
      const additions = prods.flatMap(p => p.variants.map(v => ({ id: p.id, name: p.name, descriptif: p.descriptif, size: v.size, price: v.price, qty: 1 })))
      setSelected(prev => {
        const have = new Set(prev.map(keyOf))
        return [...prev, ...additions.filter(a => !have.has(keyOf(a)))]
      })
      toast.success(`${label} : ${additions.length} étiquette(s) ajoutée(s)`)
    } catch (e) { toast.error(e?.message || 'Erreur de génération') }
    finally { setGenBusy('') }
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let on = true
    const t = setTimeout(async () => {
      setLoading(true)
      try { const r = await searchProductLabels(q); if (on) setResults(r) }
      catch (e) { if (on) { toast.error(e?.message || 'Erreur de recherche'); setResults([]) } }
      finally { if (on) setLoading(false) }
    }, 400)
    return () => { on = false; clearTimeout(t) }
  }, [query])

  const selectedKeys = new Set(selected.map(keyOf))

  function toggle(prod, v) {
    const item = { id: prod.id, name: prod.name, descriptif: prod.descriptif, size: v.size, price: v.price, qty: 1 }
    const k = keyOf(item)
    setSelected(prev => prev.some(x => keyOf(x) === k) ? prev.filter(x => keyOf(x) !== k) : [...prev, item])
  }
  function setQty(k, delta) {
    setSelected(prev => prev.map(x => keyOf(x) === k ? { ...x, qty: Math.max(1, x.qty + delta) } : x))
  }
  function remove(k) { setSelected(prev => prev.filter(x => keyOf(x) !== k)) }

  // Liste des étiquettes à imprimer (une carte par exemplaire).
  const toPrint = selected.flatMap(it => Array.from({ length: it.qty }, () => it))

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      {/* CSS d'impression : on masque tout sauf la zone d'étiquettes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
        @media print {
          body * { visibility: hidden !important; }
          #pl-print, #pl-print * { visibility: visible !important; }
          #pl-print { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4; margin: 8mm; }
        }
        .pl-label {
          width: ${LABEL_W_MM}mm; height: ${LABEL_H_MM}mm;
          box-sizing: border-box; padding: 6mm 7mm 5mm; position: relative;
          font-family: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; color: #231a16;
          page-break-inside: avoid; break-inside: avoid; overflow: hidden;
          display: flex; flex-direction: column; align-items: center; text-align: center;
        }
        @media screen { .pl-label { border: 1px dashed #d8c9b0; background: #fff; } }
        /* Trait de découpe fin entre les étiquettes (à l'impression) */
        @media print { .pl-label { border: 0.2mm solid #999; } }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 py-5 no-print">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h1 className="font-fraunces italic text-[26px] text-ink leading-none">🏷 Étiquettes produits</h1>
          <span className="font-mono text-[11px] tracking-wider uppercase text-ink-mute">{selected.length} sélectionnée(s)</span>
        </div>

        {/* Génération en lot par famille */}
        <div className="bg-white border border-line rounded-xl p-3 mb-4">
          <div className="text-[12px] font-semibold text-ink mb-2">Générer en lot</div>
          <div className="flex flex-wrap gap-2">
            {[['entremets', 'Entremets (indiv / 5 / 10 pers)'], ['cakes', 'Cakes'], ['cookies', 'Cookies'], ['viennoiserie', 'Viennoiserie']].map(([g, lab]) => (
              <button key={g} onClick={() => generate(g, lab)} disabled={!!genBusy}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream transition-all disabled:opacity-50">
                {genBusy === g ? '⏳ …' : `+ ${lab}`}
              </button>
            ))}
          </div>
        </div>

        {/* Recherche */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un produit (ex : tiramisu, tarte, bûche…)"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux"
          />
        </div>

        {/* Résultats */}
        {loading && <div className="text-center text-ink-mute py-6 text-[13px]">Recherche…</div>}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <div className="text-center text-ink-mute py-6 text-[13px]">Aucun produit trouvé.</div>
        )}
        <div className="space-y-2 mb-6">
          {results.map(prod => (
            <div key={prod.id} className="bg-white border border-line rounded-xl p-3">
              <div className="text-[14px] font-semibold text-ink">{prod.name}</div>
              {!prod.descriptif && <div className="text-[11px] text-amber-700 mt-0.5">⚠️ Pas de descriptif dans Odoo</div>}
              <div className="flex flex-wrap gap-2 mt-2">
                {prod.variants.map((v, i) => {
                  const k = `${prod.id}|${v.size}|${v.price}`
                  const on = selectedKeys.has(k)
                  return (
                    <button key={i} onClick={() => toggle(prod, v)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${on ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-cream-warm border-line text-ink-soft hover:border-bordeaux'}`}>
                      {on ? '✓ ' : ''}{fmtPrice(v.price)} dh{sizeLabel(v.size) ? ` · ${sizeLabel(v.size)}` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sélection */}
        {selected.length > 0 && (
          <div className="bg-white border border-line rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-semibold text-ink">À imprimer</div>
              <button onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-bordeaux text-cream rounded-full text-[12px] font-medium hover:bg-bordeaux-deep transition-all">
                <Printer size={15} /> Imprimer
              </button>
            </div>
            <div className="space-y-1.5">
              {selected.map(it => {
                const k = keyOf(it)
                return (
                  <div key={k} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 min-w-0 truncate text-ink">{it.name} — {fmtPrice(it.price)} dh{sizeLabel(it.size) ? ` · ${sizeLabel(it.size)}` : ''}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setQty(k, -1)} className="w-6 h-6 rounded-full border border-line hover:bg-cream-warm">−</button>
                      <span className="w-6 text-center tabular-nums">{it.qty}</span>
                      <button onClick={() => setQty(k, +1)} className="w-6 h-6 rounded-full border border-line hover:bg-cream-warm">+</button>
                      <button onClick={() => remove(k)} title="Retirer" className="w-6 h-6 rounded-full text-red-600 hover:bg-red-50 flex items-center justify-center"><X size={14} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {selected.length > 0 && <div className="text-[11px] text-ink-mute mb-2">Aperçu (ce qui sera imprimé) :</div>}
      </div>

      {/* Zone imprimée (= aperçu à l'écran) */}
      <div id="pl-print" className="flex flex-wrap gap-0 justify-start max-w-5xl mx-auto px-4 pb-10">
        {toPrint.map((it, i) => {
          const sl = sizeLabel(it.size)
          return (
            <div key={i} className="pl-label">
              <div style={{ fontWeight: 700, fontSize: '7.6mm', lineHeight: 1.02, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{it.name}</div>
              <div style={{ width: '30mm', borderBottom: '1px solid #231a16', marginTop: '2.5mm' }} />
              {it.descriptif && (
                <div style={{ fontSize: '4.1mm', fontWeight: 600, lineHeight: 1.2, marginTop: '2.8mm', maxWidth: '66mm' }}>{it.descriptif}</div>
              )}
              <div style={{ marginTop: 'auto', paddingTop: '2mm', width: '100%', textAlign: 'right', fontSize: '8mm', fontWeight: 600, lineHeight: 1 }}>
                {fmtPrice(it.price)} dh{sl ? <span style={{ fontSize: '4.5mm' }}> {sl}</span> : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
