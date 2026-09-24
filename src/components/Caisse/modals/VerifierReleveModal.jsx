import { useState } from 'react'
import { FileSearch, X } from 'lucide-react'
import { parseStatement } from '../../../lib/releveBmci'
import { cleDeLigne, memeOperation, memeVirement } from '../../../lib/releveDoublons'
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
  // Lignes décochées : celles que Layla ne veut PAS ajouter. Celles dont une voisine du
  // même montant existe déjà partent décochées — c'est le cas douteux, et le doute se
  // tranche toujours du même côté : ne rien ajouter. Vécu : « CHLIH WUDANE », lu par
  // l'extrait là où le relevé écrit « CHLIH WIJDANE », le même jour et pour 3 000 dh.
  const [exclues, setExclues] = useState(new Set())

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
          const ligne = {
            key: cleDeLigne(u, vues),
            ligne_date: u.dateIso, amount: u.credit, label: (u.label || '').slice(0, 120),
            type: u.type, releve_url: null, banque: bankLabel || null,
            _fichier: f.name,
          }
          // Deux DOCUMENTS chargés ensemble décrivent les mêmes opérations, écrites
          // autrement. Dans un MÊME fichier, deux lignes identiques sont deux vrais
          // encaissements : on ne rapproche qu'entre fichiers différents.
          if (rows.some(r => r._fichier !== ligne._fichier && memeVirement(r, ligne))) continue
          rows.push(ligne)
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
      const dejaLa = (r) => enBase.some(b => memeVirement(b, r) || memeOperation(b, r))
      const manquantes = rows.filter(r => !dejaLa(r))
      // Plus rien à comparer : memeVirement a tranché. Ce qui reste manque vraiment.
      setExclues(new Set())
      setRes({ lues: rows.length, retrouvees: rows.length - manquantes.length, manquantes })
      setEtape('resultat')
    } catch (e) { setErreur(e?.message || String(e)); setEtape('pick') }
  }

  async function recuperer() {
    setErreur('')      // sans ça, le message rouge d'un essai raté reste après un essai réussi
    setEtape('lecture')
    try {
      // `ailleurs` n'existe que pour l'affichage (la contre-preuve). L'envoyer en base la
      // faisait refuser TOUTE l'insertion : « Could not find the 'ailleurs' column ».
      // On n'écrit que les colonnes de la table.
      // `_fichier` ne sert qu'ici : la table n'a pas cette colonne.
      await saveUnmatchedReleveLines(choisies.map(
        ({ key, ligne_date, amount, label, type, releve_url, banque }) =>
          ({ key, ligne_date, amount, label, type, releve_url, banque })))
      setEtape('fini'); onDone && onDone()
    } catch (e) { setErreur(e?.message || String(e)); setEtape('resultat') }
  }

  const choisies = (res?.manquantes || []).filter(m => !exclues.has(m.key))
  const basculer = k => setExclues(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

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
                    <label key={l.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#4a3a30', padding: '5px 0', borderBottom: '1px solid #F4F0EA', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!exclues.has(l.key)} onChange={() => basculer(l.key)} style={{ marginTop: 3 }} />
                      <span>
                      <b>{fmtMoney(l.amount)}</b> · {l.ligne_date}
                      <div style={{ fontSize: 11, color: '#8a7a70' }}>{l.label}</div>
                      </span>
                    </label>
                  ))}
                </div>
                <button onClick={recuperer} disabled={!choisies.length}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #D6C3EA', background: '#F9F6F1', color: '#5b2a86', cursor: choisies.length ? 'pointer' : 'default', opacity: choisies.length ? 1 : 0.5, fontSize: 13, marginBottom: 8 }}>
                  Ajouter les {choisies.length} ligne(s) cochée(s) aux « Reçus banque non liés »
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
