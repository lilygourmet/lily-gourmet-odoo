import { useState } from 'react'
import { todayISO } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'

export default function AjoutDepenseHamidModal({ categories, onClose, onSubmit }) {
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const cats = (categories || []).filter(c => c.name !== 'Avance Hamid')
  const [category, setCategory] = useState(cats[0]?.name || '')
  const [mvtDate, setMvtDate] = useState(todayISO())

  async function submit() {
    if (!amount || !label) { alert('Montant et libellé requis'); return }
    await onSubmit({ amount: Number(amount), label, category, mvtDate })
  }

  return (
    <ModalBox title="Saisir dépense de Hamid" titleColor="#633806" titleIcon="🧾" onClose={onClose}>
      <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 4 }}>Montant (dh)</div>
      <input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={ipt} />
      <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 4, marginTop: 10 }}>Libellé</div>
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Carrefour · pain, lait" style={ipt} />
      <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 4, marginTop: 10 }}>Catégorie</div>
      <select value={category} onChange={e => setCategory(e.target.value)} style={ipt}>
        {cats.map(c => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
      </select>
      <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 4, marginTop: 10 }}>Date</div>
      <input type="date" value={mvtDate} onChange={e => setMvtDate(e.target.value)} style={ipt} />

      <div style={{ background: '#F4F0EA', padding: '10px 12px', borderRadius: 8, fontSize: 11, color: '#6F6A60', marginTop: 14 }}>
        ℹ Cette dépense débite le solde Hamid uniquement (elle ne sort PAS une 2ème fois de la caisse Meriem).
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={submit} style={btnPrimary}>Enregistrer</button>
      </div>
    </ModalBox>
  )
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #EF9F27', background: '#FAEEDA', color: '#633806', cursor: 'pointer', fontWeight: 500 }
