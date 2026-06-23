import { useState, useEffect, useMemo } from 'react'
import { loadCdDay } from '../lib/commande'
import { CD_MAX_PER_SLOT } from './CakeDayPlanning'
import Skeleton from './Skeleton'

// Planning « charge Cake Design » d'un jour : par créneau horaire, les gâteaux (photo + nb pers).
// Cadre ROUGE = confirmé · cadre JAUNE = devis. Créneau complet (≥ CD_MAX_PER_SLOT) → fond rouge.
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Regroupe les gâteaux IDENTIQUES d'une même commande (même n°, pers, photo, état) → 1 vignette « ×N ».
function groupCakes(cakes) {
  const map = new Map()
  for (const c of cakes) {
    const key = `${c.orderRef}|${c.pers}|${c.photo}|${c.isDevis}`
    if (map.has(key)) map.get(key).count++
    else map.set(key, { ...c, count: 1 })
  }
  return [...map.values()]
}

function CakeThumb({ cake, onClick }) {
  const border = cake.isDevis ? 'border-amber-400' : 'border-red-500'
  return (
    <button type="button" onClick={onClick} title="Voir la commande" className="w-[62px] text-center flex-shrink-0 hover:opacity-80 transition-opacity cursor-zoom-in">
      <div className="relative">
        {cake.photo
          ? <img src={cake.photo} alt="" className={`w-[62px] h-[62px] rounded-[10px] object-cover border-[3px] ${border}`} />
          : <div className={`w-[62px] h-[62px] rounded-[10px] border-[3px] ${border} bg-cream-warm flex items-center justify-center text-[26px]`}>🎂</div>}
        {cake.count > 1 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-bordeaux text-cream text-[11px] font-bold flex items-center justify-center border-2 border-cream shadow">×{cake.count}</span>
        )}
      </div>
      <div className="text-[11px] font-semibold text-ink mt-0.5">{cake.pers ? `${cake.pers} pers` : '—'}</div>
      <div className={`text-[8.5px] uppercase tracking-wide ${cake.isDevis ? 'text-amber-600' : 'text-red-600'}`}>
        {cake.isDevis ? 'devis' : 'confirmé'}
      </div>
    </button>
  )
}

export default function CakeChargeModal({ initialDate, onClose, onOpenOrder }) {
  const [date, setDate] = useState(() => initialDate ? new Date(initialDate + 'T12:00:00') : new Date())
  const iso = toISO(date)
  const [confirmed, setConfirmed] = useState(null)   // rapide (Supabase)
  const [devis, setDevis] = useState(null)           // lent (Odoo) — ajouté après

  useEffect(() => {
    let off = false
    setConfirmed(null); setDevis(null)
    loadCdDay(iso, 'confirmed').then(d => { if (!off) setConfirmed(d || {}) }).catch(() => { if (!off) setConfirmed({}) })
    loadCdDay(iso, 'devis').then(d => { if (!off) setDevis(d || {}) }).catch(() => { if (!off) setDevis({}) })
    return () => { off = true }
  }, [iso])

  // Affiché dès que les confirmés sont là ; les devis se fondent ensuite.
  const byHour = useMemo(() => {
    if (confirmed === null) return null
    const m = {}
    for (const h in confirmed) m[h] = [...confirmed[h]]
    for (const h in (devis || {})) m[h] = [...(m[h] || []), ...devis[h]]
    return m
  }, [confirmed, devis])
  const devisLoading = devis === null

  function shiftDay(n) { const d = new Date(date); d.setDate(d.getDate() + n); setDate(d) }

  const allCakes = byHour ? Object.values(byHour).flat() : []
  const totalConf = allCakes.filter(c => !c.isDevis).length
  const totalDevis = allCakes.filter(c => c.isDevis).length

  return (
    <div className="fixed inset-0 z-[40] flex items-center justify-center p-4 bg-ink/40" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-2xl h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-bordeaux text-cream px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <h3 className="font-fraunces italic text-[17px]">🎂 Charge Cake Design</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-cream/20">✕</button>
        </div>
        <div className="p-4">
          {/* Navigation jour */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftDay(-1)} className="px-3 py-1.5 rounded-lg border border-line text-[15px] hover:bg-cream-warm">‹</button>
            <div className="text-center">
              <div className="font-semibold text-[14px] capitalize">{date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <input type="date" value={iso} onChange={e => e.target.value && setDate(new Date(e.target.value + 'T12:00:00'))}
                className="text-[11px] text-ink-mute border border-line rounded px-1.5 py-0.5 mt-1" />
            </div>
            <button onClick={() => shiftDay(1)} className="px-3 py-1.5 rounded-lg border border-line text-[15px] hover:bg-cream-warm">›</button>
          </div>

          {/* Légende */}
          <div className="flex items-center gap-4 justify-center text-[11px] text-ink-soft mb-3">
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded border-2 border-red-500"></span> confirmé</span>
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded border-2 border-amber-400"></span> devis</span>
            <span className="text-ink-mute">max {CD_MAX_PER_SLOT}/créneau</span>
            {byHour !== null && devisLoading && <span className="text-amber-600 animate-pulse">⏳ devis…</span>}
          </div>

          {byHour === null ? (
            <Skeleton rows={7} className="!p-0" />
          ) : (
            <div className="space-y-2">
              {HOURS.map(h => {
                const cakes = byHour[h] || []
                const full = cakes.length >= CD_MAX_PER_SLOT
                const tone = full ? 'bg-red-50 border-red-200'
                  : cakes.length > 0 ? 'bg-amber-50/40 border-line'
                  : 'bg-emerald-50/40 border-line'
                return (
                  <div key={h} className={`flex gap-2.5 items-start rounded-xl border p-2 ${tone}`}>
                    <div className="font-bold text-[13px] w-8 flex-shrink-0 pt-4 text-ink">{h}h</div>
                    {cakes.length === 0 ? (
                      <div className="text-[12px] text-ink-mute pt-4">libre</div>
                    ) : (
                      <div className="flex gap-2 flex-wrap flex-1 min-w-0">
                        {groupCakes(cakes).map((c, i) => <CakeThumb key={i} cake={c} onClick={() => onOpenOrder?.(c.orderRef)} />)}
                      </div>
                    )}
                    <div className="text-[10.5px] text-right flex-shrink-0 pt-4">
                      {full ? <span className="font-bold text-red-700">COMPLET 🔴</span>
                        : cakes.length > 0 ? <span className="text-ink-soft">{cakes.length} / {CD_MAX_PER_SLOT}</span>
                        : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {byHour && (totalConf > 0 || totalDevis > 0) && (
            <div className="mt-3 text-center text-[12px] text-ink-soft">
              Total du jour : <b className="text-bordeaux">{totalConf} confirmé{totalConf > 1 ? 's' : ''}</b>
              {totalDevis > 0 && <> + <b className="text-amber-600">{totalDevis} devis</b></>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
