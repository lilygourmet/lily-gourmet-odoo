/* global __BUILD_ID__ */
import { useState, useEffect } from 'react'

// Numero de build avec lequel CETTE page a demarre (injecte par Vite).
const LOADED_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null

// Lit /version.json sur le serveur (sans cache) et renvoie le numero du build
// actuellement deploye, ou null si indisponible (ex: en local).
async function fetchDeployedId() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data.id || null
  } catch {
    return null
  }
}

// Bandeau qui apparait quand un nouveau deploiement est detecte.
// Verifie au montage et a chaque retour sur l'onglet.
export default function UpdateBanner() {
  const [hasUpdate, setHasUpdate] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (hasUpdate || !LOADED_ID) return
      const deployedId = await fetchDeployedId()
      if (!cancelled && deployedId && deployedId !== LOADED_ID) {
        setHasUpdate(true)
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') check()
    }

    check()
    const interval = setInterval(check, 5 * 60 * 1000)   // filet espacé ; la vraie vérif se fait au retour sur l'onglet (ci-dessous)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [hasUpdate])

  if (!hasUpdate) return null

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 px-4 font-mono text-[11px] tracking-[0.15em] uppercase shadow-lg animate-pulse hover:animate-none hover:bg-emerald-700"
    >
      ✨ Nouvelle version — cliquer pour mettre à jour
    </button>
  )
}
