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
    <div style={{ position: 'fixed', top: 16, left: 0, right: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'none', padding: '0 12px' }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.info
        return (
          <div key={t.id} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            style={{ pointerEvents: 'auto', cursor: 'pointer', width: 'min(94vw, 620px)', background: c.bg, color: c.text, border: `2px solid ${c.border}`, borderRadius: 14, padding: '16px 22px', fontSize: 17, fontWeight: 500, lineHeight: 1.35, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', gap: 12, alignItems: 'flex-start', animation: 'fadeIn 0.15s ease' }}>
            <span style={{ flexShrink: 0, fontSize: 22 }}>{c.icon}</span>
            <span style={{ whiteSpace: 'pre-line', paddingTop: 1 }}>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
