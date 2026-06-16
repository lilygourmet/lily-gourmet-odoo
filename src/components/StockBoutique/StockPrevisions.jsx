import { useState, useEffect } from 'react'
import AppHeader from '../AppHeader'
import { loadOrderCatalog, loadOrderProduct } from '../../lib/commande'
import { loadPrevisions, savePrevision, updatePrevisionQty, deletePrevision, loadVitrineReserved } from '../../lib/previsionsVitrine'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Sous-onglet Vitrine « Prévisions » : la pâtissière saisit ce qu'il y aura en vitrine
// aujourd'hui (ex : Fraisier 10 pers → 5), et voit le RESTANT (prévu − réservé).
export default function StockPrevisions({ user, activeView, onNavigate, onLogout }) {
  const [day, setDay] = useState(todayISO())
  const [rows, setRows] = useState([])
  const [reserved, setReserved] = useState({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const [r, rsv] = await Promise.all([loadPrevisions(day), loadVitrineReserved(day).catch(() => ({}))])
      setRows(r); setReserved(rsv)
    } catch (e) { toast.error(e?.message || 'Chargement impossible') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [day])

  async function handleQty(id, qty) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, qty_prevue: qty } : r))
  }
  async function saveQty(row) {
    try { await updatePrevisionQty(row.id, row.qty_prevue); reload() }
    catch (e) { toast.error(e?.message || 'Erreur') }
  }
  async function handleDelete(row) {
    if (!await confirmDialog(`Retirer « ${row.label}${row.size_label ? ' ' + row.size_label : ''} » des prévisions ?`, { danger: true, confirmLabel: 'Retirer' })) return
    try { await deletePrevision(row.id); reload() }
    catch (e) { toast.error(e?.message || 'Erreur') }
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-4 py-5">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h1 className="font-fraunces italic text-[26px] text-ink leading-none">📊 Prévisions vitrine</h1>
          <input type="date" value={day} onChange={e => setDay(e.target.value)}
            className="px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white" />
        </div>
        <p className="text-[12px] text-ink-soft mb-4">
          Indique ce qu'il y aura en vitrine. Le <b>restant</b> = prévu − déjà réservé (commandes « Réservation Vitrine » du jour).
        </p>

        {loading ? (
          <div className="text-center text-ink-mute py-6 text-[13px]">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-ink-mute py-6 text-[13px] bg-white border border-line rounded-xl">Aucune prévision pour ce jour. Ajoute-en ci-dessous.</div>
        ) : (
          <div className="space-y-2">
            {rows.map(row => {
              const resv = Number(reserved[row.variant_id] || 0)
              const restant = Number(row.qty_prevue || 0) - resv
              return (
                <div key={row.id} className="bg-white border border-line rounded-xl p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-ink font-medium truncate">{row.label}</div>
                    {row.size_label && <div className="text-[11px] text-ink-mute">{row.size_label}</div>}
                  </div>
                  <label className="text-[12px] text-ink-soft flex items-center gap-1.5">
                    Prévu
                    <input type="number" min="0" value={row.qty_prevue}
                      onChange={e => handleQty(row.id, e.target.value)} onBlur={() => saveQty(row)}
                      className="w-16 px-2 py-1 text-[13px] text-center border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
                  </label>
                  <div className="text-[12px] text-ink-soft">Réservé <span className="font-semibold text-ink">{resv}</span></div>
                  <div className={`text-[13px] font-semibold px-2.5 py-1 rounded-full ${restant <= 0 ? 'bg-red-100 text-red-700' : restant <= 2 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    Reste {restant}
                  </div>
                  <button onClick={() => handleDelete(row)} className="w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50" title="Retirer">🗑</button>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4">
          {adding ? (
            <AddPrevision day={day} userId={user?.id} existing={rows}
              onCancel={() => setAdding(false)}
              onAdded={() => { setAdding(false); reload() }} />
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full py-2.5 rounded-xl border border-dashed border-bordeaux/50 text-bordeaux text-[13px] font-medium hover:bg-bordeaux/5 transition-all">
              ➕ Ajouter une prévision
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Choix d'un produit du catalogue (+ taille) puis enregistrement de la prévision ----
function AddPrevision({ day, userId, existing, onCancel, onAdded }) {
  const [cats, setCats] = useState(null)
  const [activeCat, setActiveCat] = useState(null)
  const [item, setItem] = useState(null)
  const [cfg, setCfg] = useState(null)        // { loading, attributes, variants, sel }
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadOrderCatalog().then(cs => { setCats(cs); setActiveCat(cs[0]?.key || null) })
      .catch(e => { toast.error(e?.message || 'Catalogue indisponible'); setCats([]) })
  }, [])
  const cat = (cats || []).find(c => c.key === activeCat) || null

  async function chooseItem(it) {
    setItem(it); setCfg(null)
    if (it.configurable) {
      setCfg({ loading: true, attributes: [], variants: [], sel: {} })
      try {
        const d = await loadOrderProduct(it.tmplId)
        setCfg({ loading: false, attributes: d.attributes || [], variants: d.variants || [], sel: {} })
      } catch (e) { toast.error(e?.message || 'Produit indisponible'); setCfg(null); setItem(null) }
    }
  }

  // Résout la variante (même logique que Nouvelle commande)
  const optionAttrs = cfg ? cfg.attributes.filter(a => a.type === 'option') : []
  let resolved = null
  if (cfg && !cfg.loading) {
    if (optionAttrs.length === 0) resolved = cfg.variants[0]
    else if (optionAttrs.every(a => cfg.sel[a.attrId])) {
      resolved = cfg.variants.find(v => optionAttrs.every(a => v.values[a.attrId] === cfg.sel[a.attrId]))
      if (!resolved && cfg.variants.length) {
        let best = -1
        for (const v of cfg.variants) {
          const s = optionAttrs.reduce((acc, a) => acc + (v.values[a.attrId] === cfg.sel[a.attrId] ? 1 : 0), 0)
          if (s > best) { best = s; resolved = v }
        }
      }
    }
  }
  const variantId = item ? (item.configurable ? (resolved?.id || null) : item.variantId) : null
  const sizeLabel = optionAttrs.filter(a => cfg?.sel[a.attrId]).map(a => cfg.sel[a.attrId]).join(' · ')

  async function add() {
    if (!variantId) { toast.error('Choisis le produit (et sa taille).'); return }
    if (existing.some(e => e.variant_id === variantId)) { toast.error('Ce produit est déjà dans les prévisions du jour.'); return }
    setBusy(true)
    try {
      await savePrevision({ day, variantId, label: item.name, sizeLabel, qty, userId })
      toast.success('Prévision ajoutée ✅')
      onAdded()
    } catch (e) { toast.error(e?.message || 'Échec') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-white border border-line rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-fraunces italic text-[16px] text-ink">Ajouter une prévision</div>
        <button onClick={onCancel} className="text-ink-mute hover:text-bordeaux text-[16px]">✕</button>
      </div>
      {cats === null ? (
        <div className="text-[13px] text-ink-mute py-2">Chargement du catalogue…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {cats.map(c => (
              <button key={c.key} onClick={() => { setActiveCat(c.key); setItem(null); setCfg(null) }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border ${activeCat === c.key ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:border-bordeaux'}`}>
                {c.label}
              </button>
            ))}
          </div>
          <select value={item?.tmplId || ''} onChange={e => {
            const it = (cat?.items || []).find(x => String(x.tmplId) === e.target.value)
            if (it) chooseItem(it)
          }} className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux mb-2">
            <option value="">— Choisir un produit —</option>
            {(cat?.items || []).map(it => <option key={it.tmplId} value={it.tmplId}>{it.name}</option>)}
          </select>

          {cfg && (cfg.loading ? (
            <div className="text-[12px] text-ink-mute py-1">Chargement des tailles…</div>
          ) : (
            <div className="bg-cream/60 border border-line rounded-lg p-2.5 mb-2 space-y-2">
              {optionAttrs.map(a => (
                <div key={a.attrId} className="flex items-center gap-2">
                  <span className="text-[12px] text-ink-soft w-20 shrink-0">{a.name}</span>
                  <select value={cfg.sel[a.attrId] || ''}
                    onChange={e => setCfg(c => ({ ...c, sel: { ...c.sel, [a.attrId]: e.target.value } }))}
                    className="flex-1 px-2 py-1.5 text-[13px] border border-line rounded-lg bg-white">
                    <option value="">—</option>
                    {a.values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}

          {item && (
            <label className="text-[12px] text-ink-soft flex items-center gap-1.5 mb-2">
              Quantité prévue
              <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                className="w-16 px-2 py-1 text-[13px] text-center border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux" />
            </label>
          )}

          <button onClick={add} disabled={!variantId || busy}
            className="w-full py-2.5 bg-bordeaux text-cream rounded-full text-[13px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all disabled:opacity-50">
            {busy ? '⏳ …' : 'Ajouter à la prévision'}
          </button>
        </>
      )}
    </div>
  )
}
