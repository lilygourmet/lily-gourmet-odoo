import { useState, useRef, useEffect, useMemo } from 'react'

// ============================================================
// SearchSelect : liste déroulante CHERCHABLE.
// On peut taper pour filtrer (au lieu de seulement défiler).
// Props :
//  - options : [{ value, label }]
//  - value : valeur sélectionnée
//  - onChange(value)
//  - placeholder, autoFocus, inputStyle (style optionnel de l'input)
// ============================================================
export default function SearchSelect({ options = [], value, onChange, placeholder = 'Chercher…', autoFocus = false, inputStyle }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const selected = options.find(o => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => String(o.label || '').toLowerCase().includes(q))
  }, [options, query])

  // Fermer si on clique en dehors
  useEffect(() => {
    if (!open) return
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const baseInput = inputStyle || {
    display: 'block', width: '100%', padding: '9px 11px', fontSize: 13,
    border: '1px solid #e5d8c3', borderRadius: 6, boxSizing: 'border-box', background: 'white',
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <input
        type="text"
        value={open ? query : (selected ? selected.label : '')}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={baseInput}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, zIndex: 50,
          background: 'white', border: '1px solid #e5d8c3', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#8a7a70' }}>Aucun résultat</div>
          ) : filtered.map(o => (
            <div
              key={o.value}
              onMouseDown={() => { onChange(o.value); setOpen(false); setQuery('') }}
              style={{
                padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                background: o.value === value ? '#F4F0EA' : 'white',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAF6F0' }}
              onMouseLeave={e => { e.currentTarget.style.background = o.value === value ? '#F4F0EA' : 'white' }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
