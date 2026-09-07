import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AnnuairePublic from './components/Annuaire/AnnuairePublic.jsx'

// Point d'entrée de la page publique /annuaire : elle ne charge PAS l'app
// interne (ni connexion, ni onglets), seulement l'annuaire.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AnnuairePublic />
  </StrictMode>,
)
