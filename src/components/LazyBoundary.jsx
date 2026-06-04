import { Component, Suspense } from 'react'

// Entoure les écrans chargés à la demande (lazy).
// - Affiche "Chargement…" pendant le téléchargement du morceau.
// - Si le morceau échoue (souvent une version périmée après un déploiement),
//   recharge la page UNE fois (anti-boucle via un horodatage), sinon propose
//   un bouton "Recharger" plutôt qu'un écran blanc.
export default class LazyBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    const msg = String(error?.message || '')
    const isChunkError = /dynamically imported module|Loading chunk|Failed to fetch|error loading/i.test(msg)
    if (isChunkError) {
      try {
        const last = Number(sessionStorage.getItem('lazyReloadTs') || 0)
        if (Date.now() - last > 10000) {
          sessionStorage.setItem('lazyReloadTs', String(Date.now()))
          window.location.reload()
        }
      } catch { /* sessionStorage indispo : on laisse le bouton manuel */ }
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>
          Chargement impossible.{' '}
          <button onClick={() => window.location.reload()} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }}>
            Recharger
          </button>
        </div>
      )
    }
    return (
      <Suspense fallback={<div style={{ padding: 30, textAlign: 'center', color: '#8a7a70' }}>Chargement…</div>}>
        {this.props.children}
      </Suspense>
    )
  }
}
