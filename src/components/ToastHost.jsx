import { useState, useEffect } from 'react'
import { subscribeToasts } from '../lib/toast'

// Affiche les toasts en haut au centre. Monté une fois dans App.
const COLORS = {
  success: { bg: '#E1F5EE', border: '#1D7A5C', text: '#085041', icon: '✅' },
  error: { bg: '#FCEEE8', border: '#A32D2D', text: '#8a1f1f', icon: '⚠️' },
  info: { bg: '#F4F0EA', border: '#993556', text: '#1a0f0a', icon: 'ℹ️' },
}

export default function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(() => subscribeToasts(t => {
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), t.duration)
  }), [])

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', top: 12, left: 0, right: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info
        return (
          <div key={t.id} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            style={{ pointerEvents: 'auto', cursor: 'pointer', maxWidth: 'min(92vw, 460px)', background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', display: 'flex', gap: 8, alignItems: 'flex-start', animation: 'fadeIn 0.15s ease' }}>
            <span style={{ flexShrink: 0 }}>{c.icon}</span>
            <span style={{ whiteSpace: 'pre-line' }}>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
