import { useState } from 'react'
import { FileSearch, X } from 'lucide-react'
import { parseStatement } from '../../../lib/releveBmci'
import { cleDeLigne, memeOperation, memeEncaissement } from '../../../lib/releveDoublons'
import { loadReleveLinesBetween, saveUnmatchedReleveLines } from '../../../lib/caisse'
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
      // On NE compare PAS par clé : la clé a changé de forme au fil du temps, et les
      // lignes importées autrefois en portent une ancienne. Comparer là-dessus déclarait
      // « manquantes » 114 lignes sur 157 — et les ajouter aurait fait 114 doublons,
      // exactement ce qu'on veut éviter.
      // On utilise la règle de l'app pour « est-ce la même opération bancaire ? »
      // (memeOperation : même n° d'opération, ou même montant + même jour + même nom),
      // celle qui sert déjà partout ailleurs.
      const dates = rows.map(r => r.ligne_date).sort()
      const jour = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString().slice(0, 10)
      const enBase = await loadReleveLinesBetween(jour(dates[0], -4), jour(dates[dates.length - 1], 4))
      // Une même opération s'écrit DIFFÉREMMENT selon le document : le relevé intercale ses
      // références (« VIR INST RECU M 2118940 000011400383 … MAROUANE »), l'extrait tronque
      // à 30 caractères (« VIR INST RECU M MAROUANE MOUTA »). Ni le n° ni le nom ne
      // permettent alors de les rapprocher, et le contrôle criait « manquante » sur une
      // ligne déjà présente.
      // Ici on ne cherche pas à prouver que c'est la même : on cherche à ne JAMAIS faire de
      // doublon. Même montant à 3 jours près = on considère que c'est déjà là. Le prix à
      // payer est connu et assumé : un VRAI second versement du même montant le même jour
      // passera pour déjà présent. Mieux vaut le rater que le dupliquer.
      const dejaLa = (r) => enBase.some(b => memeOperation(b, r) || memeEncaissement(b, r))
      const manquantes = rows.filter(r => !dejaLa(r))
      setRes({ lues: rows.length, retrouvees: rows.length - manquantes.length, manquantes })
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
              Ce relevé contient <b>{res.lues}</b> encaissement(s).<br />
              ✅ <b>{res.retrouvees}</b> sont déjà dans l'app.<br />
              {res.manquantes.length
                ? <>⚠️ <b>{res.manquantes.length}</b> n'y sont pas :</>
                : <>Aucun ne manque — ce relevé est complet.</>}
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
