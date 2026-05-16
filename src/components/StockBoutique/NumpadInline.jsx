// src/components/StockBoutique/NumpadInline.jsx
// Pavé numérique inline réutilisable
// V2 : reset typing quand value change de l'extérieur (sélection nouvelle ligne)
// =============================================================

import { useState, useEffect, useRef } from 'react'

/**
 * Props:
 *   value: number (valeur actuelle)
 *   onChange: (newValue: number) => void
 *   onClose: () => void  (optionnel, pour fermer au click outside)
 *   compact: boolean  (taille réduite si true)
 *   resetKey: any  (optionnel, change pour reset l'état "typing" - utile quand on change de ligne)
 */
export default function NumpadInline({ value = 0, onChange, onClose, compact = false, resetKey = null }) {
  const [typing, setTyping] = useState(false)
  const containerRef = useRef(null)

  // Reset typing quand resetKey change (ex: nouvelle ligne sélectionnée)
  useEffect(() => {
    setTyping(false)
  }, [resetKey])

  useEffect(() => {
    if (!onClose) return
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  function pressKey(d) {
    if (typing) {
      const next = parseInt(String(value) + d, 10)
      onChange(Math.min(next, 9999))
    } else {
      onChange(parseInt(d, 10))
      setTyping(true)
    }
  }

  function pressClear() {
    onChange(0)
    setTyping(true)
  }

  function pressBack() {
    const s = String(value)
    if (s.length <= 1) {
      onChange(0)
    } else {
      onChange(parseInt(s.slice(0, -1), 10))
    }
    setTyping(true)
  }

  const btnClass = compact
    ? 'py-2 text-[12px] font-medium border border-line rounded-md bg-white hover:bg-cream-warm transition-colors'
    : 'py-2.5 text-[13px] font-medium border border-line rounded-md bg-white hover:bg-cream-warm transition-colors'

  return (
    <div
      ref={containerRef}
      className={`grid grid-cols-3 gap-1 p-2 bg-cream border border-line rounded-md shadow-sm ${compact ? 'w-full' : 'w-full'}`}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
        <button key={n} type="button" onClick={() => pressKey(String(n))} className={btnClass}>
          {n}
        </button>
      ))}
      <button type="button" onClick={pressClear} className={`${btnClass} text-[10px] bg-cream-warm`}>C</button>
      <button type="button" onClick={() => pressKey('0')} className={btnClass}>0</button>
      <button type="button" onClick={pressBack} className={`${btnClass} text-[11px]`}>⌫</button>
    </div>
  )
}

