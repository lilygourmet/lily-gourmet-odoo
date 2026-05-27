import { useState } from 'react'
import { todayISO } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'

export default function AjoutEntreeModal({ onClose, onSubmit }) {
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [mvtDate, setMvtDate] = useState(todayISO())

  async function submit() {
    if (!amount || !label) { alert('Montant et libellé requis'); return }
    await onSubmit({ amount: Number(amount), label, mvtDate })
  }

  return (
    <ModalBox title="Ajouter une entrée manuelle" titleColor="#1D7A5C" titleIcon="↓" onClose={onClose}>
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Montant (dh)</div>
      <input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={ipt} />
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 10 }}>Libellé</div>
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Reçu client en direct" style={ipt} />
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 10 }}>Date</div>
      <input type="date" value={mvtDate} onChange={e => setMvtDate(e.target.value)} style={ipt} />
      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={submit} style={btnPrimary}>Enregistrer</button>
      </div>
    </ModalBox>
  )
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #1D7A5C', background: '#E1F5EE', color: '#085041', cursor: 'pointer', fontWeight: 500 }
