import { useState, useEffect } from 'react'
import AppHeader from '../AppHeader'
import AnnuaireListe from './AnnuaireListe'
import Avatar from '../Avatar'
import { lienAnnuaire, changerLienAnnuaire, masquerEmploye, urlAnnuaire, estMasqueEnDur } from '../../lib/annuaire'
import { loadEmployes } from '../../lib/hr'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

// Onglet Annuaire (admin) : le lien à partager, qui apparaît dedans, et l'aperçu.
export default function AnnuaireAdmin(navProps) {
  const [cle, setCle] = useState(null)
  const [masques, setMasques] = useState(new Set())
  const [employes, setEmployes] = useState([])
  const [reglages, setReglages] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function charger() {
    try {
      const [{ key, masques: liste }, emps] = await Promise.all([lienAnnuaire(), loadEmployes(true)])
      setCle(key)
      setMasques(new Set((liste || []).map(String)))
      setEmployes(emps)
    } catch (e) { setErreur(e.message) }
  }
  useEffect(() => { charger() }, [])

  async function basculer(emp) {
    const masque = !masques.has(String(emp.id))
    // On coche tout de suite, on corrige si le serveur refuse.
    setMasques(avant => {
      const suite = new Set(avant)
      masque ? suite.add(String(emp.id)) : suite.delete(String(emp.id))
      return suite
    })
    try {
      const { masques: liste } = await masquerEmploye(emp.id, masque)
      setMasques(new Set((liste || []).map(String)))
    } catch (e) {
      toast.error('Erreur : ' + e.message)
      charger()
    }
  }

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
      const { key } = await changerLienAnnuaire()
      setCle(key)
      toast.success('Nouveau lien créé.')
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  const visibles = employes.filter(e => !masques.has(String(e.id)) && !estMasqueEnDur(e.nom))

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...navProps} />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '16px 16px 40px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>📇 Annuaire du personnel</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8a7a70', lineHeight: 1.5 }}>
          Ce lien s’ouvre sans mot de passe : n’importe qui l’ayant voit les noms, photos et numéros.
          Ouvre-le sur ton téléphone, puis « Ajouter à l’écran d’accueil ».
        </p>

        <div style={{ background: '#fff', border: '1px solid #e5d8c3', borderRadius: 16, padding: 14, marginBottom: 14 }}>
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

        {/* Qui apparaît dans l'annuaire : décoche quelqu'un, il disparaît du lien. */}
        <div style={{ background: '#fff', border: '1px solid #e5d8c3', borderRadius: 16, padding: 14, marginBottom: 18 }}>
          <button
            onClick={() => setReglages(r => !r)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1a0f0a', textAlign: 'left' }}
          >
            <span>👁 Qui apparaît dans l’annuaire</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#8a7a70' }}>
              {visibles.length}/{employes.length} {reglages ? '▲' : '▼'}
            </span>
          </button>

          {reglages && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a7a70', lineHeight: 1.5 }}>
                Décoche quelqu’un : il disparaît du lien tout de suite. Sa fiche RH n’est pas touchée.
              </p>
              {employes.map(e => {
                // Retiré dans le code (MASQUES_EN_DUR) : la case ne peut rien y changer.
                const enDur = estMasqueEnDur(e.nom)
                const affiche = !enDur && !masques.has(String(e.id))
                return (
                  <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', cursor: enDur ? 'default' : 'pointer', borderBottom: '1px solid #f1eadd' }}>
                    <input type="checkbox" checked={affiche} disabled={enDur} onChange={() => basculer(e)} style={{ width: 20, height: 20, accentColor: '#993556', flex: '0 0 auto' }} />
                    <Avatar emp={e} size={32} zoom={false} />
                    <span style={{ fontSize: 14, fontWeight: affiche ? 600 : 400, color: affiche ? '#1a0f0a' : '#8a7a70', textDecoration: affiche ? 'none' : 'line-through' }}>
                      {e.nom}
                    </span>
                    {enDur && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8a7a70', fontStyle: 'italic' }}>retiré dans le code</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {employes.length > 0 && <AnnuaireListe contacts={visibles} />}
      </div>
    </div>
  )
}
