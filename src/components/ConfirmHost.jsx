import { useState, useEffect, useRef } from 'react'
import { registerConfirm } from '../lib/confirmDialog'

// Fenêtre de confirmation (remplace confirm()). Montée une fois dans App.
export default function ConfirmHost() {
  const [state, setState] = useState(null)
  const resolveRef = useRef(null)

  useEffect(() => {
    registerConfirm((opts, resolve) => { resolveRef.current = resolve; setState(opts) })
  }, [])

  function close(val) {
    const r = resolveRef.current
    resolveRef.current = null
    setState(null)
    if (r) r(val)
  }

  if (!state) return null
  const danger = !!state.danger

  return (
    <div onClick={() => close(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 16, padding: 26, width: 'min(94vw, 460px)', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 16, lineHeight: 1.4, color: '#1a0f0a', marginBottom: 22, whiteSpace: 'pre-line' }}>{state.message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => close(false)}
            style={{ padding: '10px 16px', fontSize: 14, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }}>
            {state.cancelLabel || 'Annuler'}
          </button>
          <button onClick={() => close(true)} autoFocus
            style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: 'white', background: danger ? '#A32D2D' : '#993556' }}>
            {state.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
