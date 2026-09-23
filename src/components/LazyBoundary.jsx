import { Component, Suspense, useState, useEffect } from 'react'

// N'affiche "Chargement…" qu'après 250ms : un chargement rapide ne clignote pas.
function DelayedFallback() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 250)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return <div style={{ padding: 30, textAlign: 'center', color: '#8a7a70' }}>Chargement…</div>
}

/**
 * « Le morceau de code n'a pas pu être téléchargé » — presque toujours une page
 * restée ouverte pendant un déploiement : le fichier qu'elle réclame a été
 * renommé et n'existe plus.
 *
 * ⚠️ CHAQUE NAVIGATEUR LE DIT AUTREMENT, et n'en reconnaître qu'un revient à
 * ne pas avoir de filet sur les autres. Safari (donc tout l'iPhone et l'iPad)
 * dit « Importing a module script failed. » — cette phrase-là n'était pas dans
 * la liste, alors le rechargement automatique ne partait jamais sur téléphone
 * et Layla tombait sur « Chargement impossible » (2026-09-23).
 *   Chrome / Edge : Failed to fetch dynamically imported module: …
 *   Safari        : Importing a module script failed.
 *   Firefox       : error loading dynamically imported module: …
 *   Vite          : Unable to preload CSS for …
 *   webpack       : Loading chunk 42 failed
 */
export function estPanneDeMorceau(message) {
  return /dynamically imported module|module script failed|Loading chunk|Failed to fetch|error loading|Unable to preload/i
    .test(String(message || ''))
}

// Entoure les écrans chargés à la demande (lazy).
// - Affiche "Chargement…" pendant le téléchargement du morceau.
// - Si le morceau échoue (souvent une version périmée après un déploiement),
//   recharge la page UNE fois (anti-boucle via un horodatage), sinon propose
//   un bouton "Recharger" plutôt qu'un écran blanc.
export default class LazyBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    // On garde le message : sans lui, l'écran ne dit pas POURQUOI ça a échoué
    // et il faut ouvrir la console du navigateur pour le savoir.
    return { failed: true, message: String(error?.message || error || '') }
  }

  componentDidCatch(error) {
    const msg = String(error?.message || '')
    if (estPanneDeMorceau(msg)) {
      // Même garde et même minute que autoUpdate.js : deux filets qui se
      // déclenchent sur la même panne ne doivent pas recharger deux fois, et
      // 10 secondes suffisaient à peine à ouvrir un écran — d'où la tablette
      // qui « sautait, se remettait et sautait » (Layla, 2026-09-09).
      try {
        const last = Number(sessionStorage.getItem('lg:recharge') || 0)
        if (Date.now() - last > 60000) {
          sessionStorage.setItem('lg:recharge', String(Date.now()))
          window.location.reload()
        }
      } catch { /* sessionStorage indispo : on laisse le bouton manuel */ }
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>
          <div style={{ marginBottom: 12 }}>
            Chargement impossible.{' '}
            <button onClick={() => window.location.reload()} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }}>
              Recharger
            </button>
          </div>
          {this.state.message && (
            <div style={{
              maxWidth: 560, margin: '0 auto', padding: '10px 12px', borderRadius: 8, textAlign: 'left',
              background: '#FBF3E8', border: '0.5px solid #e5d8c3', color: '#8a5a2a',
              fontSize: 11.5, fontFamily: 'monospace', wordBreak: 'break-word',
            }}>
              {this.state.message}
            </div>
          )}
        </div>
      )
    }
    return (
      <Suspense fallback={<DelayedFallback />}>
        {this.props.children}
      </Suspense>
    )
  }
}
