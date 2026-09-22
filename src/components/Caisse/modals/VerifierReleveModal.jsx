import { useState } from 'react'
import { FileSearch, X } from 'lucide-react'
import { parseStatement } from '../../../lib/releveBmci'
import { cleDeLigne } from '../../../lib/releveDoublons'
import { clesDejaEnBase, saveUnmatchedReleveLines } from '../../../lib/caisse'
import { fmtMoney } from '../_helpers'

// Contrôle d'un relevé SANS rien réimporter.
//
// Layla ne veut plus réimporter : un réimport recalcule tous les rapprochements du mois et
// lui a déjà coûté des heures de doublons. Mais quand une ligne manque en base (voir le
// correctif « lignes réservées »), le PDF est la SEULE source qui puisse la rendre.
//
// Alors on sépare les deux : ici on LIT le PDF et on compare, sans écrire une seule ligne
// ni toucher à une seule caisse. Ce n'est qu'après, et sur un clic explicite, qu'on ajoute
// les lignes manquantes — rien d'autre. Aucun rapprochement n'est refait.
const ARGENT_RECU = new Set(['virement_recu', 'autre', 'versement', 'cheque_depot'])

export default function VerifierReleveModal({ onClose, onDone }) {
  const [etape, setEtape] = useState('pick')   // pick | lecture | resultat | fini
  const [erreur, setErreur] = useState('')
  const [res, setRes] = useState(null)         // { lues, manquantes: [row] }

  async function lire(fileList) {
    const files = [...(fileList || [])]
    if (!files.length) return
    setErreur(''); setEtape('lecture')
    try {
      const vues = new Set()
      const rows = []
      for (const f of files) {
        const { transactions, bankLabel } = await parseStatement(f)
        for (const u of transactions) {
          if (u.credit == null || !u.dateIso || !ARGENT_RECU.has(u.type)) continue
          rows.push({
            key: cleDeLigne(u, vues),
            ligne_date: u.dateIso, amount: u.credit, label: (u.label || '').slice(0, 120),
            type: u.type, releve_url: null, banque: bankLabel || null,
          })
        }
      }
      const connues = await clesDejaEnBase(rows.map(r => r.key))
      setRes({ lues: rows.length, manquantes: rows.filter(r => !connues.has(r.key)) })
      setEtape('resultat')
    } catch (e) { setErreur(e?.message || String(e)); setEtape('pick') }
  }

  async function recuperer() {
    setEtape('lecture')
    try {
      await saveUnmatchedReleveLines(res.manquantes)
      setEtape('fini'); onDone && onDone()
    } catch (e) { setErreur(e?.message || String(e)); setEtape('resultat') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 520, maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>🔎 Vérifier un relevé</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {erreur && <div style={{ fontSize: 13, color: '#99201E', marginBottom: 10 }}>{erreur}</div>}

        {etape === 'pick' && (
          <>
            <p style={{ fontSize: 13, color: '#4a3a30', marginBottom: 14 }}>
              Choisis un relevé déjà importé. L'app le relit et te dit si des lignes manquent en base.
              <br /><b>Rien n'est modifié</b> : aucun rapprochement n'est refait, aucune caisse n'est touchée.
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid #C4BFB6', cursor: 'pointer', fontSize: 13 }}>
              <FileSearch size={16} /> Choisir les PDF
              <input type="file" accept="application/pdf" multiple style={{ display: 'none' }}
                onChange={e => lire(e.target.files)} />
            </label>
          </>
        )}

        {etape === 'lecture' && <div style={{ padding: 24, textAlign: 'center', color: '#4a3a30' }}>Lecture du relevé…</div>}

        {etape === 'resultat' && res && (
          <>
            <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: res.manquantes.length ? '#FDF0DF' : '#e6f6ec' }}>
              <b>{res.lues}</b> ligne(s) d'argent reçu lues dans ce relevé.<br />
              {res.manquantes.length
                ? <>⚠️ <b>{res.manquantes.length}</b> ne sont pas en base.</>
                : <>✅ Toutes sont déjà en base — ce relevé est complet.</>}
            </div>
            {res.manquantes.length > 0 && (
              <>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                  {res.manquantes.map(l => (
                    <div key={l.key} style={{ fontSize: 12, color: '#4a3a30', padding: '5px 0', borderBottom: '1px solid #F4F0EA' }}>
                      <b>{fmtMoney(l.amount)}</b> · {l.ligne_date}
                      <div style={{ fontSize: 11, color: '#8a7a70' }}>{l.label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={recuperer} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #D6C3EA', background: '#F9F6F1', color: '#5b2a86', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>
                  Ajouter ces {res.manquantes.length} ligne(s) aux « Reçus banque non liés »
                </button>
                <div style={{ fontSize: 11, color: '#8a7a70', marginBottom: 10 }}>
                  Elles sont ajoutées comme <b>libres</b>, rien d'autre. Aucune caisse ne change — tu lanceras
                  « 🔄 Relancer » toi-même après, si tu veux.
                </div>
              </>
            )}
            <button onClick={onClose} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #C4BFB6', background: 'white', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
          </>
        )}

        {etape === 'fini' && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#4a3a30', marginBottom: 14 }}>
              Lignes ajoutées. Elles sont dans « Reçus banque non liés ».
            </div>
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #C4BFB6', background: 'white', cursor: 'pointer', fontSize: 13 }}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  )
}
