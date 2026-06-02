import { useState } from 'react'
import { Upload, CheckCircle2, AlertTriangle, Circle, X, RotateCcw } from 'lucide-react'
import { parseStatement, reconcileEnvelopes } from '../../../lib/releveBmci'
import { loadBanqueEnvelopesBetween, uploadReleve, setEnveloppeReleve } from '../../../lib/caisse'
import { fmtMoney, fmtDateCourte } from '../_helpers'

// Import d'un relevé/extrait bancaire (PDF) → rapprochement auto des enveloppes Banque.
// Reconnaît BMCI (relevé + extrait) et Attijariwafa. Étapes : choisir → aperçu → enregistrer.
export default function ReleveImportModal({ onClose, onDone }) {
  const [step, setStep] = useState('pick') // pick | working | preview | saving | done
  const [error, setError] = useState('')
  const [files, setFiles] = useState([])
  const [banks, setBanks] = useState([])
  const [recon, setRecon] = useState(null)
  const [savedCount, setSavedCount] = useState(0)
  const [unmatchedQuery, setUnmatchedQuery] = useState('')

  async function handleFiles(list) {
    const arr = Array.from(list || [])
    if (!arr.length) return
    setFiles(arr); setError(''); setStep('working')
    try {
      const allTx = []
      const banksFound = []
      for (let i = 0; i < arr.length; i++) {
        const { bankLabel, transactions } = await parseStatement(arr[i])
        if (!transactions.length) throw new Error(`Aucune transaction lue dans « ${arr[i].name} ».`)
        banksFound.push(bankLabel)
        for (const t of transactions) { t._fileIdx = i; allTx.push(t) }
      }
      setBanks(banksFound)
      const isos = allTx.filter(t => t.dateIso).map(t => t.dateIso).sort()
      // Les espèces/chèques sont déposés APRÈS la vente (parfois > 1 mois) → on remonte 120 j avant.
      const start = new Date(isos[0]); start.setDate(start.getDate() - 120)
      const envs = await loadBanqueEnvelopesBetween(start.toISOString().slice(0, 10), isos[isos.length - 1])
      setRecon(reconcileEnvelopes(envs, allTx))
      setStep('preview')
    } catch (e) { setError(e.message || String(e)); setStep('pick') }
  }

  async function handleSave() {
    setStep('saving'); setError('')
    try {
      // Upload chaque relevé une fois → un chemin par fichier
      const paths = []
      for (const f of files) paths.push(await uploadReleve(f))
      const toWrite = recon.results.filter(r => r.status === 'trouve' || r.status === 'a_confirmer')
      let done = 0
      // Par lots de 15 pour ne pas saturer
      for (let i = 0; i < toWrite.length; i += 15) {
        await Promise.all(toWrite.slice(i, i + 15).map(r => {
          const fileIdx = r.line ? r.line._fileIdx : (r.candidates?.[0]?._fileIdx ?? 0)
          return setEnveloppeReleve(r.env.id, {
          proofUrl: paths[fileIdx] || paths[0],
          proofDate: r.line ? r.line.dateIso : r.env.session_date,
          status: r.status,
          libelle: r.line
            ? `${r.line.dateIso} · ${r.line.label}`.slice(0, 220)
            : (r.candidates || []).map(c => `${c.dateIso} · ${c.label}`.slice(0, 70)).join('  |  ').slice(0, 300) || null,
          candidates: r.status === 'a_confirmer'
            ? JSON.stringify((r.candidates || []).map(c => ({ d: c.dateIso, l: (c.label || '').slice(0, 90) })))
            : null,
          }) }))
        done += Math.min(15, toWrite.length - i)
        setSavedCount(done)
      }
      setStep('done')
      onDone && onDone()
    } catch (e) { setError(e.message || String(e)); setStep('preview') }
  }

  const s = recon?.stats
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Importer un relevé bancaire</span>
          <button onClick={onClose} style={closeBtn}><X size={16} /></button>
        </div>

        {error && <div style={errBox}>{error}</div>}

        {step === 'pick' && (
          <div style={{ padding: 8 }}>
            <p style={{ fontSize: 13, color: '#4a3a30', marginBottom: 14 }}>
              Choisis un ou <b>plusieurs</b> relevés/extraits en PDF (BMCI et/ou Attijariwafa, reconnus
              automatiquement). L'app cherche quels virements / espèces / chèques sont arrivés sur les
              comptes, puis te montre le résultat <b>avant</b> d'enregistrer.
            </p>
            <label style={pickBtn}>
              <Upload size={16} /> Choisir les PDF
              <input type="file" accept="application/pdf" multiple style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)} />
            </label>
          </div>
        )}

        {step === 'working' && <div style={{ padding: 24, textAlign: 'center', color: '#4a3a30' }}>Lecture du relevé…</div>}

        {step === 'preview' && recon && (
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 12, color: '#8a7a70', marginBottom: 12 }}>
              {files.length} fichier{files.length > 1 ? 's' : ''} · <b style={{ color: '#5b2a86' }}>{[...new Set(banks)].join(', ')}</b> · période {recon.period.min} → {recon.period.max}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <Stat icon={<CheckCircle2 size={16} />} color="#0a7d3d" bg="#e6f6ec" n={s.trouve} label="trouvés" />
              <Stat icon={<AlertTriangle size={16} />} color="#a9620a" bg="#fdf0df" n={s.a_confirmer} label="à confirmer" />
              <Stat icon={<Circle size={16} />} color="#8a7a70" bg="#f1ece6" n={s.absent} label="pas trouvés" />
            </div>

            {recon.refunds.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#a9620a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={13} /> Remboursements détectés (virements sortants) : {recon.refunds.length}
                </div>
                <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12, color: '#4a3a30' }}>
                  {recon.refunds.slice(0, 30).map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{r.dateIso} · {r.label.slice(0, 40)}</span>
                      <span style={{ fontWeight: 500 }}>-{fmtMoney(r.debit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recon.unmatched && recon.unmatched.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#5b2a86', marginBottom: 6 }}>
                  Lignes du relevé non attribuées : {recon.unmatched.length}
                </div>
                <input
                  type="search"
                  value={unmatchedQuery}
                  onChange={e => setUnmatchedQuery(e.target.value)}
                  placeholder="🔍 montant ou nom (ex. 600)…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', marginBottom: 6, fontSize: 12, border: '1px solid #e5d8c3', borderRadius: 8 }}
                />
                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 12, color: '#4a3a30' }}>
                  {recon.unmatched
                    .filter(u => {
                      const q = unmatchedQuery.trim().toLowerCase()
                      return !q || String(u.credit).includes(q) || (u.label || '').toLowerCase().includes(q)
                    })
                    .slice(0, 60)
                    .map((u, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
                        <span>{u.dateIso} · {(u.label || '—').slice(0, 38)}</span>
                        <span style={{ fontWeight: 600 }}>{fmtMoney(u.credit)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: '#8a7a70', marginBottom: 12 }}>
              Les « trouvés » (vert) et « à confirmer » (orange) recevront le relevé comme preuve.
              Les remboursements sont affichés à titre indicatif.
            </div>
            <button onClick={handleSave} disabled={s.trouve + s.a_confirmer === 0} style={{ ...pickBtn, opacity: (s.trouve + s.a_confirmer === 0) ? 0.5 : 1 }}>
              Enregistrer le rapprochement ({s.trouve + s.a_confirmer})
            </button>
          </div>
        )}

        {step === 'saving' && <div style={{ padding: 24, textAlign: 'center', color: '#4a3a30' }}>Enregistrement… {savedCount}</div>}

        {step === 'done' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <CheckCircle2 size={32} color="#0a7d3d" />
            <div style={{ fontSize: 15, fontWeight: 600, margin: '10px 0 4px' }}>Rapprochement enregistré</div>
            <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 16 }}>{savedCount} enveloppe(s) mise(s) à jour.</div>
            <button onClick={onClose} style={pickBtn}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ icon, color, bg, n, label }) {
  return (
    <div style={{ flex: 1, background: bg, color, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div>
      <div style={{ fontSize: 11 }}>{label}</div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }
const header = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#8a7a70' }
const errBox = { background: '#fde7e7', color: '#a11', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }
const pickBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#993556', color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer' }
