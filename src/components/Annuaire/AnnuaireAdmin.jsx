import { useState, useEffect } from 'react'
import AppHeader from '../AppHeader'
import AnnuaireListe from './AnnuaireListe'
import { lienAnnuaire, changerLienAnnuaire, chargerContacts, urlAnnuaire } from '../../lib/annuaire'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

// Onglet Annuaire (admin) : le lien à partager + l'aperçu de ce qu'il montre.
export default function AnnuaireAdmin(navProps) {
  const [cle, setCle] = useState(null)
  const [contacts, setContacts] = useState(null)
  const [erreur, setErreur] = useState(null)

  async function charger(cleFournie) {
    try {
      const k = cleFournie || await lienAnnuaire()
      setCle(k)
      setContacts(await chargerContacts(k))
    } catch (e) { setErreur(e.message) }
  }
  useEffect(() => { charger() }, [])

  async function copier() {
    try {
      await navigator.clipboard.writeText(urlAnnuaire(cle))
      toast.success('Lien copié.')
    } catch { toast.error('Copie impossible : garde le lien appuyé pour le sélectionner.') }
  }

  async function changer() {
    const ok = await confirmDialog(
      'Changer le lien de l’annuaire ?\n\nL’ancien lien cessera de marcher tout de suite : il faudra refaire le raccourci sur chaque téléphone.',
      { danger: true, confirmLabel: 'Changer le lien' },
    )
    if (!ok) return
    try {
      const k = await changerLienAnnuaire()
      await charger(k)
      toast.success('Nouveau lien créé.')
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...navProps} />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '16px 16px 40px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>📇 Annuaire du personnel</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8a7a70', lineHeight: 1.5 }}>
          Ce lien s’ouvre sans mot de passe : n’importe qui l’ayant voit les noms, photos et numéros.
          Ouvre-le sur ton téléphone, puis « Ajouter à l’écran d’accueil ».
        </p>

        <div style={{ background: '#fff', border: '1px solid #e5d8c3', borderRadius: 16, padding: 14, marginBottom: 18 }}>
          {cle ? (
            <>
              <input
                readOnly value={urlAnnuaire(cle)} onFocus={e => e.target.select()}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 10, border: '1px solid #e5d8c3', background: '#fcfbf8', color: '#4a3a30' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={copier} style={{ padding: '9px 14px', borderRadius: 999, border: 'none', background: '#993556', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Copier le lien</button>
                <a href={urlAnnuaire(cle)} target="_blank" rel="noreferrer" style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid #e5d8c3', background: '#fff', color: '#4a3a30', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Ouvrir</a>
                <button onClick={changer} style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid #e5d8c3', background: '#fff', color: '#a32d2d', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Changer le lien</button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: erreur ? '#a32d2d' : '#8a7a70' }}>{erreur || 'Préparation du lien…'}</div>
          )}
        </div>

        {contacts && <AnnuaireListe contacts={contacts} />}
      </div>
    </div>
  )
}
