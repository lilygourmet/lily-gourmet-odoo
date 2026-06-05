import { useState } from 'react'
import { Receipt, Plus, Trash2, Paperclip } from 'lucide-react'
import { todayISO, fmtMoney } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'
import { toast } from '../../../lib/toast'

// Saisie groupée des dépenses Hamid : une « session » = plusieurs lignes
// (chacune avec son montant, sa catégorie, son libellé et son toggle facture)
// + UNE photo de preuve commune.
export default function AjoutDepenseHamidModal({ categories, onClose, onSubmit }) {
  const cats = (categories || []).filter(c => c.name !== 'Avance Hamid')
  const defaultCat = cats[0]?.name || ''

  const [sessionDate, setSessionDate] = useState(todayISO())
  const [lignes, setLignes] = useState([newLigne(defaultCat)])
  const [proofFile, setProofFile] = useState(null)
  const [busy, setBusy] = useState(false)

  function newLigne(cat) {
    return { amount: '', category: cat, label: '', isFacture: false }
  }

  function patchLigne(i, patch) {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function removeLigne(i) {
    setLignes(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  }
  function addLigne() {
    setLignes(prev => [...prev, newLigne(defaultCat)])
  }

  const validLignes = lignes.filter(l => Number(l.amount) > 0)
  const total = validLignes.reduce((s, l) => s + Number(l.amount), 0)

  async function submit() {
    if (validLignes.length === 0) { toast.error('Ajoute au moins une ligne avec un montant.'); return }
    setBusy(true)
    try {
      await onSubmit({ sessionDate, lignes: validLignes, proofFile })
    } catch (e) {
      toast.error('Erreur : ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalBox title="Saisir dépenses de Hamid" titleColor="#633806" titleIcon={<Receipt size={18} />} onClose={onClose}>
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Date de la session</div>
      <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} style={ipt} />

      <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginTop: 14, marginBottom: 6 }}>
        Lignes de dépense
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lignes.map((l, i) => (
          <div key={i} style={{ background: '#FAF6F0', borderRadius: 10, padding: 10, border: '0.5px solid #e5d8c3' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input type="number" inputMode="decimal" placeholder="Montant"
                value={l.amount} onChange={e => patchLigne(i, { amount: e.target.value })}
                style={{ ...ipt, padding: '7px 9px', fontSize: 13 }} />
              <input type="text" placeholder="Libellé (ex: pain, lait)"
                value={l.label} onChange={e => patchLigne(i, { label: e.target.value })}
                style={{ ...ipt, padding: '7px 9px', fontSize: 13 }} />
              {lignes.length > 1 && (
                <button onClick={() => removeLigne(i)} title="Retirer cette ligne"
                  style={{ background: 'transparent', border: 'none', color: '#A32D2D', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <Trash2 size={14} />
                </button>
              )}
              {lignes.length === 1 && <div />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
              <select value={l.category} onChange={e => patchLigne(i, { category: e.target.value })}
                style={{ ...ipt, padding: '7px 9px', fontSize: 12 }}>
                {cats.map(c => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
              </select>
              <label title="Facture à récupérer (chèque)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: l.isFacture ? '#99201E' : '#4a3a30', whiteSpace: 'nowrap', padding: '0 6px' }}>
                <input type="checkbox" checked={l.isFacture}
                  onChange={e => patchLigne(i, { isFacture: e.target.checked })} />
                <Paperclip size={13} /> facture
              </label>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addLigne} style={{ ...btnSlim, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Plus size={14} /> Ajouter une ligne
      </button>

      <div style={{ marginTop: 14, padding: '10px 12px', background: '#F9F6F1', borderRadius: 8, fontSize: 13 }}>
        Total session : <strong>{fmtMoney(total)}</strong> · {validLignes.length} ligne{validLignes.length > 1 ? 's' : ''}
      </div>

      <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 14, marginBottom: 4 }}>
        Preuve commune (photo / PDF du / des tickets) — optionnel
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#F4F0EA', border: '0.5px dashed #C4BFB6', borderRadius: 8, cursor: 'pointer' }}>
        <Paperclip size={14} />
        <span style={{ fontSize: 12, color: '#4a3a30' }}>
          {proofFile ? proofFile.name : 'Cliquer pour choisir un fichier'}
        </span>
        <input type="file" accept="image/*,application/pdf"
          onChange={e => setProofFile(e.target.files?.[0] || null)}
          style={{ display: 'none' }} />
      </label>
      <div style={{ background: '#FCEEE8', padding: '10px 12px', borderRadius: 8, fontSize: 11, color: '#633806', marginTop: 10 }}>
        ℹ Cette session débite le solde Hamid du total. Les lignes cochées « facture » apparaîtront dans l'onglet Factures.
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} disabled={busy} style={btnSlim}>Annuler</button>
        <button onClick={submit} disabled={busy || validLignes.length === 0} style={{ ...btnPrimary, opacity: busy || validLignes.length === 0 ? 0.5 : 1 }}>
          {busy ? '…' : 'Enregistrer la session'}
        </button>
      </div>
    </ModalBox>
  )
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #EF9F27', background: '#FAEEDA', color: '#633806', cursor: 'pointer', fontWeight: 500 }
