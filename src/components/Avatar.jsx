import { useState } from 'react'
import { createPortal } from 'react-dom'

// Photo de l'employé à côté du nom. Si pas de photo → initiales sur pastille.
// Cliquer une photo l'agrandit (sauf zoom={false}).
export default function Avatar({ emp, size = 28, style = {}, zoom = true }) {
  const [open, setOpen] = useState(false)
  const url = emp?.photo_url
  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    objectFit: 'cover', display: 'inline-block', verticalAlign: 'middle', ...style,
  }

  if (url) {
    return (
      <>
        <img
          src={url} alt=""
          onClick={zoom ? (e) => { e.stopPropagation(); e.preventDefault(); setOpen(true) } : undefined}
          style={{ ...base, cursor: zoom ? 'zoom-in' : undefined }}
        />
        {open && createPortal(
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, cursor: 'zoom-out', padding: 20 }}
          >
            <img src={url} alt={emp?.nom || ''} style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
          </div>,
          document.body
        )}
      </>
    )
  }

  const initiales = (emp?.nom || '?')
    .trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase()
  return (
    <span style={{
      ...base, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#F4E4EA', color: '#993556', fontSize: Math.round(size * 0.4), fontWeight: 600,
    }}>{initiales}</span>
  )
}
