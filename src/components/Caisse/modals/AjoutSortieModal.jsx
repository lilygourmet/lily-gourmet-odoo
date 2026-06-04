import { useState } from 'react'
import { todayISO } from '../_helpers'

export default function AjoutSortieModal({ categories, caisseOwner, onClose, onSubmit }) {
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState(categories[0]?.name || '')
  const [mvtDate, setMvtDate] = useState(todayISO())
  const [hasFacture, setHasFacture] = useState(false)

  async function submit() {
    const n = Number(amount)
    if (!label.trim() || !category) { alert('Tous les champs sont requis'); return }
    if (!amount || isNaN(n) || n <= 0) { alert('Montant invalide : entre un nombre positif.'); return }
    await onSubmit({ amount: n, label: label.trim(), category, mvtDate, hasFacture: caisseOwner === 'meriem' ? hasFacture : false })
  }

  return (
    <ModalBox title="Ajouter une sortie" titleColor="#99201E" titleIcon="↑" onClose={onClose}>
      <Field label="Montant (dh)"><input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={ipt} /></Field>
      <Field label="Libellé"><input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: Carrefour · sucre, café" style={ipt} /></Field>
      <Field label="Catégorie">
        <select value={category} onChange={e => setCategory(e.target.value)} style={ipt}>
          {categories.map(c => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" value={mvtDate} onChange={e => setMvtDate(e.target.value)} style={ipt} /></Field>

      {caisseOwner === 'meriem' && (
        <Field label="Y aura-t-il une facture à récupérer ?">
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setHasFacture(true)}  style={toggleBtn(hasFacture === true,  '#FAEEDA', '#EF9F27', '#633806')}>✓ Oui</button>
            <button onClick={() => setHasFacture(false)} style={toggleBtn(hasFacture === false, '#F4F0EA', '#C4BFB6', '#1a0f0a')}>Non</button>
          </div>
        </Field>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={submit} style={btnPrimary}>Enregistrer</button>
      </div>
    </ModalBox>
  )
}

function toggleBtn(active, bg, brd, txt) {
  return {
    flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
    border: `0.5px solid ${active ? brd : '#e5d8c3'}`,
    background: active ? bg : 'white',
    color: active ? txt : '#4a3a30',
    fontWeight: active ? 500 : 'normal',
  }
}

function Field({ label, children }) {
  return (<>
    <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 10 }}>{label}</div>
    {children}
  </>)
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }

export function ModalBox({ title, titleColor, titleIcon, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', border: '0.5px solid #e5d8c3', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14, color: titleColor || '#1a0f0a', fontSize: 15, fontWeight: 500 }}>
          {titleIcon && <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 18 }}>{titleIcon}</span>}
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}
