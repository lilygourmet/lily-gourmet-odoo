import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ClientOrderView from './components/ClientOrder/ClientOrderView.jsx'
import OcpOrderView from './components/ClientOrder/OcpOrderView.jsx'

// Page CLIENT publique (sans login).
// - Sur l'adresse « commande… » (commande-lily-gourmet.vercel.app, commande.lily-gourmet.com),
//   on n'affiche QUE la page commande → l'app interne n'est jamais visible là-bas.
// - Sur l'adresse interne, ?commande=… ou /commander permet quand même de tester la page.
const params = new URLSearchParams(window.location.search)
const isClientSite = window.location.hostname.includes('commande')
const isPublicOrder = isClientSite || params.has('commande') || window.location.pathname.startsWith('/commander')
const isOcp = params.get('client') === 'ocp'   // lien dédié OCP

// Filet : affiche l'erreur au lieu d'une page blanche (pour diagnostiquer le lien OCP).
class ErrBoundary extends Component {
  constructor(p) { super(p); this.state = { e: null } }
  static getDerivedStateFromError(e) { return { e } }
  render() {
    if (this.state.e) return (
      <div style={{ padding: 20, fontFamily: 'system-ui', color: '#b42424', background: '#FBF6EE', minHeight: '100vh' }}>
        <h3>⚠️ Erreur (capturée)</h3>
        <p style={{ fontWeight: 800, fontSize: 14 }}>{String(this.state.e?.message || this.state.e)}</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#666' }}>{String(this.state.e?.stack || '')}</pre>
      </div>
    )
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isOcp ? <ErrBoundary><OcpOrderView /></ErrBoundary> : isPublicOrder ? <ClientOrderView /> : <App />}
  </StrictMode>,
)
