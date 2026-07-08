import { useState, useEffect } from 'react'
import { Tag, Camera, Check, ChevronLeft } from 'lucide-react'
import { todayISO } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'
import { loadLivreurFavoris } from '../../../lib/caisse'
import MontantPad from '../MontantPad'
import { toast } from '../../../lib/toast'

// Déclaration de dépense de Hamid, en 3 étapes :
// 1) C'est quoi ? (favori ou « Autre » = écrire un mot, SANS catégorie — Meriem la mettra)
// 2) Montant (calculatrice)
// 3) Photo du ticket (sauf pourboire / type défini « sans photo »)
export default function DeclareDepenseLivreurModal({ onClose, onSubmit }) {
  const [favoris, setFavoris] = useState([])
  const [step, setStep] = useState(1)
  const [fav, setFav] = useState(null)           // favori sélectionné, ou { key:'autre' }
  const [label, setLabel] = useState('')          // mot écrit pour « Autre »
  const [amount, setAmount] = useState('')
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadLivreurFavoris().then(setFavoris) }, [])

  const isAutre = fav?.key === 'autre'
  const needsProof = fav ? (isAutre ? true : fav.needs_proof) : true
  const quoiLabel = isAutre ? label.trim() : (fav?.label || '')

  function pick(f) { setFav(f); if (f.key !== 'autre') setLabel('') }

  async function submit() {
    const n = Number(amount)
    if (!n || n <= 0) { toast.error('Montant invalide.'); return }
    setBusy(true)
    try {
      await onSubmit({
        sessionDate: todayISO(),
        lignes: [{ amount: n, category: isAutre ? null : (fav.category || null), label: quoiLabel || fav.label, isFacture: false }],
        proofFile: photo,
      })
    } catch (e) {
      toast.error('Erreur : ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const step1Ok = fav && (!isAutre || label.trim())
  const stepTitles = { 1: 'C\'est quoi ?', 2: 'Montant', 3: 'Photo du ticket' }

  return (
    <ModalBox title={`Déclarer une dépense · ${stepTitles[step]}`} titleColor="#99201E" titleIcon="↑" onClose={onClose}>
      {/* petit fil d'étapes */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? '#993556' : '#e5d8c3' }} />
        ))}
      </div>

      {/* ÉTAPE 1 — c'est quoi */}
      {step === 1 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {favoris.map(f => {
              const active = fav?.id === f.id
              return (
                <button key={f.id} onClick={() => pick(f)} style={tile(active)}>
                  <Tag size={18} /> {f.label}
                  {!f.needs_proof && <span style={{ fontSize: 9, marginLeft: 'auto', color: '#7A5510' }}>sans photo</span>}
                </button>
              )
            })}
            <button onClick={() => pick({ key: 'autre' })} style={tile(isAutre)}><Tag size={18} /> Autre</button>
          </div>

          {isAutre && (
            <>
              <div style={{ fontSize: 11, color: '#4a3a30', margin: '14px 0 4px' }}>Écris ce que c'est</div>
              <input type="text" autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: parking, péage, sac…" style={ipt} />
              <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 6 }}>Pas besoin de catégorie — Meriem la mettra.</div>
            </>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
            <button onClick={onClose} style={btnSlim}>Annuler</button>
            <button onClick={() => setStep(2)} disabled={!step1Ok} style={{ ...btnPrimary, opacity: step1Ok ? 1 : 0.5 }}>OK</button>
          </div>
        </>
      )}

      {/* ÉTAPE 2 — montant */}
      {step === 2 && (
        <>
          <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 4 }}>{quoiLabel || 'Dépense'}</div>
          <MontantPad value={amount} onChange={setAmount} accent="#99201E" />
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            <button onClick={() => setStep(1)} style={{ ...btnSlim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ChevronLeft size={15} /> Retour</button>
            {needsProof ? (
              <button onClick={() => setStep(3)} disabled={!(Number(amount) > 0)} style={{ ...btnPrimary, opacity: Number(amount) > 0 ? 1 : 0.5 }}>OK</button>
            ) : (
              <button onClick={submit} disabled={busy || !(Number(amount) > 0)} style={{ ...btnPrimary, opacity: busy || !(Number(amount) > 0) ? 0.5 : 1 }}>{busy ? '…' : 'Envoyer'}</button>
            )}
          </div>
        </>
      )}

      {/* ÉTAPE 3 — photo */}
      {step === 3 && (
        <>
          <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 4 }}>{quoiLabel || 'Dépense'} · {fmtAmount(amount)}</div>
          <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 6, marginTop: 8 }}>Photo du ticket <strong style={{ color: '#99201E' }}>(obligatoire)</strong></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px', borderRadius: 10, cursor: 'pointer',
            border: photo ? '1px solid #1D7A5C' : '0.5px dashed #C4BFB6', background: photo ? '#E6F4E6' : '#F4F0EA', color: photo ? '#085041' : '#4a3a30' }}>
            {photo ? <Check size={20} /> : <Camera size={20} />}
            <span style={{ fontSize: 14 }}>{photo ? photo.name : 'Prendre une photo du ticket'}</span>
            <input type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
            <button onClick={() => setStep(2)} style={{ ...btnSlim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ChevronLeft size={15} /> Retour</button>
            <button onClick={submit} disabled={busy || !photo} style={{ ...btnPrimary, opacity: busy || !photo ? 0.5 : 1 }}>{busy ? '…' : 'Envoyer'}</button>
          </div>
        </>
      )}
    </ModalBox>
  )
}

function fmtAmount(v) { return v ? `${v} dh` : '' }

function tile(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px', borderRadius: 12, cursor: 'pointer',
    border: active ? '1.5px solid #993556' : '1px solid #e5d8c3',
    background: active ? '#FCEEF3' : 'white', color: active ? '#993556' : '#1a0f0a',
    fontSize: 14, fontWeight: 500,
  }
}
const ipt = { width: '100%', padding: '11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 12, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 14, padding: 12, borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
