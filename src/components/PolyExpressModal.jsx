import { useState, useEffect } from 'react'
import { loadOrdersForRange, updateItemPolys, getPolyValue } from '../lib/orders'
import { computeSizesForCake } from '../lib/cakeSizes'
import { estimatePolyFromPhoto } from '../lib/commande'
import { canEditPolys } from '../lib/auth'
import { toast } from '../lib/toast'

// Réglage rapide des polys : tous les gâteaux Cake Design des 14 prochains jours
// à qui il manque au moins un poly, rassemblés en une liste déroulante. Pour chaque
// gâteau : photo + pers/étage, et les boutons de hauteur de poly (enregistrement direct).
const POLYS_VALUES = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5']

function needsPolys(item, polys) {
  const n = Math.max(1, item.etages_count || 1)
  for (let i = 1; i <= n; i++) if (!polys[`etage${i}`]) return true
  return false
}

// Hauteur estimée (cm) → valeur de poly. Génoise réelle = 5 cm, poly = hauteur − 5,
// arrondi au cran de 2,5 cm supérieur, puis ÷ 5. Plafonné à 3,5.
function polyValueFromHeight(h) {
  const cm = Math.max(0, Number(h || 0) - 5)
  const v = Math.min(3.5, Math.ceil(cm / 2.5) * 0.5)
  return String(v)
}

export default function PolyExpressModal({ user, onClose, onPolysChanged }) {
  const canEdit = canEditPolys(user)
  const [cakes, setCakes] = useState([])       // instantané [{ order, item }]
  const [polysMap, setPolysMap] = useState({}) // itemId -> polys
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(null)       // photo agrandie (plein écran dans le modal)
  const [estimating, setEstimating] = useState('')   // item.id en cours d'analyse IA (bouton seul)
  const [aiInfo, setAiInfo] = useState({})           // item.id -> résultat IA (hauteurs/note)
  const [selected, setSelected] = useState(() => new Set())  // item.id cochés (estimation en lot)
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchProgress, setBatchProgress] = useState(null)   // { done, total }

  useEffect(() => {
    let off = false
    loadOrdersForRange(new Date(), 14).then(orders => {
      if (off) return
      const list = []
      const pm = {}
      for (const order of orders || []) {
        if (order.odoo_state === 'cancel') continue
        const cds = (order.order_items || []).filter(i => i.type === 'CD').sort((a, b) => a.item_idx - b.item_idx)
        for (const item of cds) {
          const polys = item.polys && typeof item.polys === 'object' ? item.polys : {}
          if (needsPolys(item, polys)) { list.push({ order, item }); pm[item.id] = { ...polys } }
        }
      }
      setCakes(list)
      setPolysMap(pm)
      setLoading(false)
    }).catch(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [])

  async function handlePoly(item, etageKey, val) {
    if (!canEdit) return
    const cur = polysMap[item.id] || {}
    const already = getPolyValue(cur, etageKey) === val
    const next = { ...cur }
    if (already) delete next[etageKey]
    else next[etageKey] = { value: val, done_by: user.id, done_at: new Date().toISOString() }
    setPolysMap(prev => ({ ...prev, [item.id]: next }))
    const ok = await updateItemPolys(item.id, next)
    if (!ok) {
      setPolysMap(prev => ({ ...prev, [item.id]: cur }))
      toast.error('Erreur lors de l\'enregistrement du poly')
      return
    }
    onPolysChanged?.(item.id, next)
  }

  // Cœur de l'estimation IA (sans gestion de bouton). Renvoie true si appliqué.
  async function estimateOne(item) {
    const photo = Array.isArray(item.image_urls) && item.image_urls[0]
    if (!photo) return false
    const etages = Math.max(1, item.etages_count || 1)
    const bases = computeSizesForCake(item.pers, etages)
    if (!bases || !bases.length) return false
    const r = await estimatePolyFromPhoto(photo, bases)
    const arr = Array.isArray(r.etages) ? r.etages : []
    const updates = {}
    for (let i = 0; i < etages; i++) {
      const h = arr[i]?.hauteur_gateau_seul_cm
      if (h != null) updates[`etage${i + 1}`] = { value: polyValueFromHeight(h), done_by: user.id, done_at: new Date().toISOString() }
    }
    if (!Object.keys(updates).length) return false
    let saved
    setPolysMap(prev => { saved = { ...(prev[item.id] || {}), ...updates }; return { ...prev, [item.id]: saved } })
    await updateItemPolys(item.id, saved)
    onPolysChanged?.(item.id, saved)
    setAiInfo(prev => ({ ...prev, [item.id]: r }))
    return true
  }

  // 🤖 Estimation IA d'un seul gâteau (bouton sur la carte).
  async function handleEstimate(item) {
    if (!canEdit || estimating || batchRunning) return
    setEstimating(item.id)
    try {
      const ok = await estimateOne(item)
      if (!ok) toast.error('Taille (base) inconnue ou photo manquante.')
    } catch (e) { toast.error('IA : ' + (e?.message || e)) }
    finally { setEstimating('') }
  }

  // 🤖 Estimation IA en lot (gâteaux cochés, l'un après l'autre).
  async function handleEstimateBatch() {
    if (!canEdit || batchRunning) return
    const items = cakes.map(c => c.item).filter(it => selected.has(it.id) && Array.isArray(it.image_urls) && it.image_urls[0])
    if (!items.length) { toast.error('Coche au moins un gâteau avec photo.'); return }
    setBatchRunning(true)
    let ok = 0, fail = 0
    for (let i = 0; i < items.length; i++) {
      setBatchProgress({ done: i, total: items.length })
      try { (await estimateOne(items[i])) ? ok++ : fail++ } catch { fail++ }
    }
    setBatchProgress(null)
    setBatchRunning(false)
    toast.success(`IA terminée : ${ok} estimé(s)${fail ? `, ${fail} ignoré(s)` : ''}`)
  }

  const remaining = cakes.filter(c => needsPolys(c.item, polysMap[c.item.id] || {})).length
  const photoCakes = cakes.filter(c => Array.isArray(c.item.image_urls) && c.item.image_urls[0])
  const allSelected = photoCakes.length > 0 && photoCakes.every(c => selected.has(c.item.id))
  const selCount = photoCakes.filter(c => selected.has(c.item.id)).length
  function toggleSelect(id) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(photoCakes.map(c => c.item.id))) }

  return (
    <>
    <div className="fixed inset-0 z-[150] flex flex-col bg-ink/50 px-2 sm:px-0" onClick={onClose}>
      <div className="bg-cream w-full max-w-lg mx-auto mt-[3dvh] mb-[3dvh] rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-bordeaux text-cream px-4 py-3 flex items-center justify-between flex-shrink-0">
          <h3 className="font-fraunces italic text-[18px]">🧊 Régler les polys{!loading && ` — ${remaining} à faire`}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-cream/20">✕</button>
        </div>
        {!loading && photoCakes.length > 0 && canEdit && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-cream-warm/40 flex-shrink-0 text-[12px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={batchRunning} />
              <span>Tout ({photoCakes.length})</span>
            </label>
            <button onClick={handleEstimateBatch} disabled={batchRunning || selCount === 0}
              className="ml-auto px-3 py-1.5 rounded-full bg-bordeaux text-cream font-medium disabled:opacity-50">
              {batchRunning ? `🤖 Analyse ${batchProgress ? `${batchProgress.done + 1}/${batchProgress.total}` : ''}…` : `🤖 Estimer la sélection${selCount ? ` (${selCount})` : ''}`}
            </button>
          </div>
        )}
        <div className="overflow-auto p-3 space-y-3">
          {loading ? (
            <div className="text-center text-ink-mute py-10 text-[13px]">Chargement…</div>
          ) : cakes.length === 0 ? (
            <div className="text-center text-ink-mute py-10 text-[13px]">Aucun gâteau à régler sur les 14 prochains jours ✓</div>
          ) : cakes.map(({ order, item }) => {
            const polys = polysMap[item.id] || {}
            const etages = Math.max(1, item.etages_count || 1)
            const sizes = computeSizesForCake(item.pers, etages) || []
            const done = !needsPolys(item, polys)
            const photo = Array.isArray(item.image_urls) && item.image_urls[0] ? item.image_urls[0] : null
            return (
              <div key={item.id} className={`rounded-xl border p-3 ${done ? 'border-line opacity-50 bg-cream-warm/40' : 'border-bordeaux/40 bg-white'}`}>
                <div className="flex gap-3">
                  {photo ? (
                    <button type="button" onClick={() => setZoom(photo)} title="Agrandir"
                      className="block w-28 h-28 sm:w-36 sm:h-36 rounded-lg overflow-hidden border border-line flex-shrink-0 cursor-zoom-in">
                      <img src={photo} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-lg bg-cream-warm border border-line flex items-center justify-center text-[10px] text-ink-mute flex-shrink-0 text-center">pas de photo</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink truncate flex items-center gap-1.5">
                      {photo && canEdit && <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} disabled={batchRunning} className="flex-shrink-0" />}
                      <span className="truncate">{order.client_name}</span>
                    </div>
                    <div className="text-[11px] font-mono text-bordeaux">{order.order_num}</div>
                    <div className="text-[12px] text-ink-soft truncate">{item.title}</div>
                    <div className="text-[12px] text-ink mt-0.5">{item.pers ? `${item.pers} pers` : ''}{etages > 1 ? ` · ${etages} étages` : ''}</div>
                  </div>
                </div>
                {photo && canEdit && (
                  <div className="mt-2">
                    <button disabled={estimating === item.id} onClick={() => handleEstimate(item)}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-full border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream transition-all disabled:opacity-50">
                      {estimating === item.id ? '🤖 Analyse en cours…' : '🤖 Estimer avec l\'IA'}
                    </button>
                    {aiInfo[item.id] && (
                      <div className="mt-1.5 text-[11px] text-ink-soft bg-cream-warm/60 rounded-lg p-2">
                        {(aiInfo[item.id].etages || []).map((e, i) => (
                          <div key={i}>🤖 Étage {i + 1} : gâteau ~{e.hauteur_gateau_seul_cm} cm{e.hauteur_totale_cm ? ` (total ~${e.hauteur_totale_cm})` : ''} → poly <b className="text-bordeaux">{polyValueFromHeight(e.hauteur_gateau_seul_cm)}</b></div>
                        ))}
                        {aiInfo[item.id].note && <div className="italic mt-0.5 text-ink-mute">{aiInfo[item.id].note}{aiInfo[item.id].confiance ? ` · confiance ${aiInfo[item.id].confiance}` : ''}</div>}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  {Array.from({ length: etages }).map((_, idx) => {
                    const etageKey = `etage${idx + 1}`
                    const sel = getPolyValue(polys, etageKey)
                    return (
                      <div key={etageKey} className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-bordeaux font-semibold min-w-[92px]">Étage {idx + 1}{sizes[idx] ? ` · ${sizes[idx]} cm` : ''}</span>
                        <div className="flex gap-1 flex-wrap">
                          {POLYS_VALUES.map(val => (
                            <button key={val} disabled={!canEdit} onClick={() => handlePoly(item, etageKey, val)}
                              className={`w-8 h-8 rounded-full text-[11px] font-mono font-semibold flex items-center justify-center transition-all ${sel === val ? 'bg-bordeaux text-cream' : 'bg-cream border border-line text-ink-soft hover:border-bordeaux'} ${!canEdit ? 'cursor-default' : 'active:scale-[0.95]'}`}>
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
    {zoom && (
      <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/80 p-3" onClick={() => setZoom(null)}>
        <img src={zoom} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
      </div>
    )}
    </>
  )
}
