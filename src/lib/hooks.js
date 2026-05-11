// ============================================================
// Hooks reutilisables
// ============================================================
import { useEffect, useRef } from 'react'

// Rafraichit automatiquement quand l'onglet du navigateur redevient visible
// (changement d'app, retour de veille, changement d'onglet navigateur...).
// Inclut aussi un seuil minimum pour eviter de spammer si l'utilisateur clique 10 fois.
export function useRefreshOnVisible(refreshFn, minIntervalMs = 5000) {
  const lastRefreshRef = useRef(0)

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastRefreshRef.current < minIntervalMs) return
      lastRefreshRef.current = now
      try {
        const r = refreshFn()
        // Si c'est une promise, on ne fait rien de special (juste eviter unhandled)
        if (r && typeof r.then === 'function') r.catch(() => {})
      } catch { /* ignore */ }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refreshFn, minIntervalMs])
}
