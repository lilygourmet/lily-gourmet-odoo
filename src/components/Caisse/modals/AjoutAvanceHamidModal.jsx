import { useState } from 'react'
import { Car } from 'lucide-react'
import { todayISO, fmtMoney } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'

export default function AjoutAvanceHamidModal({ onClose, onSubmit }) {
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [mvtDate, setMvtDate] = useState(todayISO())

  async function submit() {
    const n = Number(amount)
    if (!amount || isNaN(n) || n <= 0) { alert('Montant invalide : entre un nombre positif.'); return }
    await onSubmit({ amount: n, label: label || 'avance', mvtDate })
  }

  return (
    <ModalBox title="Donner argent à Hamid" titleColor="#633806" titleIcon={<Car size={18} />} onClose={onClose}>
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Montant (dh)</div>
      <input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={ipt} />
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 10 }}>Libellé</div>
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: matin courses" style={ipt} />
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 10 }}>Date</div>
      <input type="date" value={mvtDate} onChange={e => setMvtDate(e.target.value)} style={ipt} />

      <div style={{ background: '#F4F0EA', padding: '10px 12px', borderRadius: 8, fontSize: 11, color: '#4a3a30', marginTop: 14 }}>
        ℹ Cette action créera une sortie « Avance Hamid » de <strong>{fmtMoney(Number(amount) || 0)}</strong> dans la caisse Meriem et ajoutera ce montant au solde Hamid.
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={submit} style={btnPrimary}>Donner</button>
      </div>
    </ModalBox>
  )
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #EF9F27', background: '#FAEEDA', color: '#633806', cursor: 'pointer', fontWeight: 500 }
