import { useState } from 'react'
import { createEmploye, updateEmploye } from '../../lib/hr'

const TYPES_CONTRAT = ['CDI', 'CDD', 'Stage', 'Interim', 'Autre']

export default function EmployeEditModal({ employe, user, onClose, onSaved }) {
  const isNew = !employe
  const [form, setForm] = useState({
    nom: employe?.nom || '',
    cnss: employe?.cnss || '',
    cin: employe?.cin || '',
    poste: employe?.poste || '',
    type_contrat: employe?.type_contrat || 'CDI',
    date_entree: employe?.date_entree || '',
    date_sortie: employe?.date_sortie || '',
    salaire_net: employe?.salaire_net != null ? String(employe.salaire_net) : '',
    actif: employe?.actif != null ? employe.actif : true,
    notes: employe?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function setF(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!form.nom.trim()) { setError('Le nom est obligatoire'); return }

    setSaving(true); setError(null)
    try {
      const data = {
        nom: form.nom.trim(),
        cnss: form.cnss.trim() || null,
        cin: form.cin.trim() || null,
        poste: form.poste.trim() || null,
        type_contrat: form.type_contrat,
        date_entree: form.date_entree || null,
        date_sortie: form.date_sortie || null,
        salaire_net: form.salaire_net ? parseFloat(form.salaire_net) : null,
        actif: form.actif,
        notes: form.notes.trim() || null,
      }
      if (isNew) {
        await createEmploye(data, user.id)
      } else {
        await updateEmploye(employe.id, data, user.id)
      }
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#3A3733' }}>
            {isNew ? '➕ Nouvel employé' : `✏️ ${employe.nom}`}
          </h3>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <Row>
            <Field label="Nom complet *" value={form.nom} onChange={v => setF('nom', v)} required autoFocus />
            <Field label="Poste" value={form.poste} onChange={v => setF('poste', v)} placeholder="Pâtissière" />
          </Row>
          <Row>
            <Field label="N° CNSS" value={form.cnss} onChange={v => setF('cnss', v)} placeholder="182572887" />
            <Field label="N° CIN" value={form.cin} onChange={v => setF('cin', v)} placeholder="A394604" />
          </Row>
          <Row>
            <div>
              <label style={lblStyle}>Type de contrat</label>
              <select value={form.type_contrat} onChange={e => setF('type_contrat', e.target.value)} style={inputStyle}>
                {TYPES_CONTRAT.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Salaire net (DH)" type="number" value={form.salaire_net} onChange={v => setF('salaire_net', v)} placeholder="8500" />
          </Row>
          <Row>
            <Field label="Date d'entrée" type="date" value={form.date_entree} onChange={v => setF('date_entree', v)} />
            <Field label="Date de sortie (si parti)" type="date" value={form.date_sortie} onChange={v => setF('date_sortie', v)} />
          </Row>

          <div style={{ marginBottom: 12 }}>
            <label style={lblStyle}>Notes (interne)</label>
            <textarea
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
              rows={2}
              placeholder="Remarques…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            background: '#F9F6F1', borderRadius: 8, cursor: 'pointer', marginBottom: 14
          }}>
            <input type="checkbox" checked={form.actif} onChange={e => setF('actif', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#993556', cursor: 'pointer' }} />
            <span style={{ fontSize: 13, color: '#3A3733' }}>
              Employé actif (décocher si parti)
            </span>
          </label>

          {error && (
            <div style={{
              padding: '8px 12px', background: '#FCE9E8', color: '#99201E',
              borderRadius: 6, fontSize: 12, marginBottom: 12
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving} style={btnSecondary}>Annuler</button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Enregistrement…' : (isNew ? 'Créer' : 'Enregistrer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>{children}</div>
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, autoFocus = false }) {
  return (
    <div>
      <label style={lblStyle}>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        style={inputStyle}
      />
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 22, maxWidth: 560, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B968D' }
const lblStyle = { display: 'block', fontSize: 11, fontWeight: 500, color: '#6F6A60', marginBottom: 4 }
const inputStyle = { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6, background: 'white', fontFamily: 'inherit', boxSizing: 'border-box' }
const btnSecondary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer', color: '#6F6A60' }
const btnPrimary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
