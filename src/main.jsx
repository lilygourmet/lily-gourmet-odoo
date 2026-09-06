import { StrictMode, Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/autoUpdate'   // recharge l'app toute seule quand une nouvelle version est déployée
// Chargés à la demande : l'app interne et les pages clients publiques sont des
// bundles séparés → chaque visiteur ne télécharge QUE ce dont il a besoin.
const App = lazy(() => import('./App.jsx'))
const ClientOrderView = lazy(() => import('./components/ClientOrder/ClientOrderView.jsx'))
const OcpOrderView = lazy(() => import('./components/ClientOrder/OcpOrderView.jsx'))
const AnnuairePublic = lazy(() => import('./components/Annuaire/AnnuairePublic.jsx'))

// Page CLIENT publique (sans login).
// - Sur l'adresse « commande… » (commande-lily-gourmet.vercel.app, commande.lily-gourmet.com),
//   on n'affiche QUE la page commande → l'app interne n'est jamais visible là-bas.
// - Sur l'adresse interne, ?commande=… ou /commander permet quand même de tester la page.
const params = new URLSearchParams(window.location.search)
const isClientSite = window.location.hostname.includes('commande')
const isPublicOrder = isClientSite || params.has('commande') || window.location.pathname.startsWith('/commander')
const isOcp = params.get('client') === 'ocp'   // lien dédié OCP
// Annuaire du personnel : page publique (photo + appel), raccourci de l'écran d'accueil.
const isAnnuaire = window.location.pathname.startsWith('/annuaire')

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

const Loading = () => <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF6EE', color: '#993556', fontFamily: 'system-ui', fontSize: 14 }}>Chargement…</div>

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<Loading />}>
      {isAnnuaire ? <AnnuairePublic /> : isOcp ? <ErrBoundary><OcpOrderView /></ErrBoundary> : isPublicOrder ? <ClientOrderView /> : <App />}
    </Suspense>
  </StrictMode>,
)
