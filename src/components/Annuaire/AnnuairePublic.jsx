import { useState, useEffect, useMemo } from 'react'
import AnnuaireListe from './AnnuaireListe'
import { cleAnnuaire, chargerContacts } from '../../lib/annuaire'

// Page publique /annuaire : ouverte sans connexion, avec la clé du lien.
// Pensée pour un raccourci sur l'écran d'accueil du téléphone.
export default function AnnuairePublic() {
  const [contacts, setContacts] = useState(null)
  const [echec, setEchec] = useState(null)
  const cle = useMemo(() => cleAnnuaire(), [])
  const erreur = echec || (cle ? null : 'Lien incomplet. Rouvre le lien complet de l’annuaire (celui qui finit par ?k=…).')

  // La clé reste DANS l'adresse : sur iPhone, le raccourci de l'écran d'accueil
  // garde l'adresse ouverte, mais pas forcément la mémoire du navigateur.
  // (Le manifeste et les icônes sont dans annuaire.html, pas posés ici.)
  useEffect(() => {
    if (cle) chargerContacts(cle).then(setContacts).catch(e => setEchec(e.message))
  }, [cle])

  return (
    <div style={{ minHeight: '100dvh', background: '#fcfbf8', color: '#1a0f0a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 13, background: '#993556', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flex: '0 0 auto',
          }}>📇</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.01em' }}>Annuaire</h1>
            <div style={{ fontSize: 12, color: '#8a7a70', marginTop: 1 }}>
              Lily Gourmet{contacts ? ` · ${contacts.length} personnes` : ''}
            </div>
          </div>
        </div>

        {erreur && (
          <div style={{ background: '#fcebeb', color: '#a32d2d', borderRadius: 14, padding: '14px 16px', fontSize: 14, lineHeight: 1.5 }}>
            {erreur}
          </div>
        )}
        {!erreur && !contacts && (
          <div style={{ color: '#8a7a70', fontSize: 14, padding: '30px 0', textAlign: 'center' }}>Chargement…</div>
        )}
        {contacts && <AnnuaireListe contacts={contacts} colleEnHaut />}
      </div>
    </div>
  )
}
