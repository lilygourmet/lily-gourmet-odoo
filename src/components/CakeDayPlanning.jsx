import { useState, useEffect } from 'react'
import { loadCdLoad, loadCdSlot } from '../lib/commande'

// Planning CAKE DESIGN du jour : combien de CD- déjà prévus par créneau horaire.
// - Équipe (défaut) : nb par créneau + photos/pers du créneau choisi (pour juger si on peut ajouter).
// - Client (clientMode) : seulement Disponible / Complet, créneaux complets NON choisissables,
//   sans chiffres ni photos.
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
export const CD_MAX_PER_SLOT = 3   // max 3 cake design par créneau → à 3, c'est complet 🔴

export default function CakeDayPlanning({ date, selectedHour, onPick, clientMode = false }) {
  const [counts, setCounts] = useState(null)   // null = chargement
  useEffect(() => {
    if (!date) { setCounts(null); return }
    let off = false
    setCounts(null)
    loadCdLoad(date).then(c => { if (!off) setCounts(c || {}) }).catch(() => { if (!off) setCounts({}) })
    return () => { off = true }
  }, [date])

  // Détail (photos + nb pers) du créneau choisi — ÉQUIPE seulement (jamais pour le client).
  const [slotItems, setSlotItems] = useState(null)
  useEffect(() => {
    if (clientMode || !date || selectedHour == null || isNaN(selectedHour)) { setSlotItems(null); return }
    let off = false
    setSlotItems(null)
    loadCdSlot(date, selectedHour).then(it => { if (!off) setSlotItems(it || []) }).catch(() => { if (!off) setSlotItems([]) })
    return () => { off = true }
  }, [date, selectedHour, clientMode])

  if (!date) return null
  const isFull = n => n >= CD_MAX_PER_SLOT

  return (
    <div className="mt-2 rounded-lg border border-line bg-cream/40 p-2.5">
      <div className="text-[11px] font-semibold text-ink-soft mb-1.5">
        {clientMode
          ? <>🎂 Choisissez un créneau <span className="text-ink-mute">disponible</span></>
          : <>🎂 Cake design déjà prévus ce jour <span className="text-ink-mute">(max {CD_MAX_PER_SLOT}/créneau — clique pour choisir l'heure)</span></>}
      </div>
      {counts === null ? (
        <div className="text-[12px] text-ink-mute py-2 text-center">Chargement…</div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {HOURS.map(h => {
            const n = counts[h] || 0
            const full = isFull(n)
            const sel = Number(selectedHour) === h
            // Client : vert (Disponible) / rouge (Complet, non choisissable). Équipe : vert/orange/rouge avec nb.
            const tone = full ? 'bg-red-100 text-red-800 border-red-300'
              : (!clientMode && n > 0) ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            const disabled = clientMode && full
            return (
              <button key={h} type="button" disabled={disabled}
                onClick={() => { if (!disabled) onPick?.(h) }}
                className={`text-[12px] rounded-lg border px-2 py-1.5 text-left transition-all ${tone} ${sel ? 'ring-2 ring-bordeaux' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80'}`}
                title={full ? 'Complet' : 'Disponible'}>
                <div className="font-semibold">{h}h {full ? '🔴' : (!clientMode && n > 0) ? '🟠' : '🟢'}</div>
                <div className="text-[10.5px]">
                  {clientMode ? (full ? 'complet' : 'disponible') : (n === 0 ? 'libre' : `${n} CD-`)}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ÉQUIPE : avertissement si créneau choisi déjà plein */}
      {!clientMode && counts && selectedHour != null && isFull(counts[Number(selectedHour)] || 0) && (
        <div className="mt-1.5 text-[11px] font-semibold text-red-700">
          ⚠️ {counts[Number(selectedHour)]} cake design déjà à {selectedHour}h — privilégie un créneau 🟢.
        </div>
      )}

      {/* ÉQUIPE : photos + nb pers du créneau choisi (juger si on peut en ajouter) */}
      {!clientMode && slotItems && slotItems.length > 0 && (
        <div className="mt-2 pt-2 border-t border-line">
          <div className="text-[10.5px] text-ink-soft mb-1">À {selectedHour}h — gâteaux déjà réservés (juge si tu peux en ajouter) :</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {slotItems.map((it, i) => (
              <div key={i} className="flex-shrink-0 w-16 text-center">
                {it.photo
                  ? <img src={it.photo} alt="" className="w-16 h-16 object-cover rounded-lg border border-line" />
                  : <div className="w-16 h-16 rounded-lg bg-cream border border-line flex items-center justify-center text-[9px] text-ink-mute">pas de photo</div>}
                <div className="text-[10px] mt-0.5 text-ink">{it.pers ? `${it.pers} pers` : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
