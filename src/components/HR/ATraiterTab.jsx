import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Clock, Send } from 'lucide-react'
import { loadATraiter, traiterAbsence, traiterOubliPointage, validerRecup, refuserRecup } from '../../lib/aTraiter'

const CLASSIFS = [
  { v: 'annuel',     label: 'Congé annuel' },
  { v: 'maladie',    label: 'Maladie' },
  { v: 'sans_solde', label: 'Sans solde' },
  { v: 'oubli',      label: 'Oubli de pointage (présent)' },
]

const fmtJour = ymd => (ymd ? ymd.split('-').reverse().join('/') : '')

export default function ATraiterTab({ user, onChange }) {
  const [data, setData] = useState({ absences: [], recups: [] })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyKey, setBusyKey] = useState('')
  // état par ligne : { 'empId|date': { classification, raison } }
  const [form, setForm] = useState({})

  async function reload() {
    setLoading(true); setErr('')
    try {
      const d = await loadATraiter()
      setData(d)
      onChange?.(d.absences.length + d.recups.length)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  // Chargement initial (sans setState synchrone dans le corps de l'effet)
  useEffect(() => {
    let cancelled = false
    loadATraiter()
      .then(d => { if (!cancelled) { setData(d); onChange?.(d.absences.length + d.recups.length) } })
      .catch(e => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setField = (key, field, value) =>
    setForm(f => ({ ...f, [key]: { ...f[key], [field]: value } }))

  async function handleAbsence(a) {
    const key = `${a.employe_id}|${a.date}`
    const f = form[key] || {}
    const classification = f.classification || 'annuel'
    setBusyKey(key); setErr('')
    try {
      if (classification === 'oubli') {
        await traiterOubliPointage({ employe_id: a.employe_id, date: a.date, heures_prevues: a.heures_prevues, userId: user.id })
      } else {
        await traiterAbsence({ employe_id: a.employe_id, date: a.date, classification, raison: f.raison || null, userId: user.id })
      }
      await reload()
    } catch (e) { setErr(e.message) }
    finally { setBusyKey('') }
  }

  async function handleRecup(r, action) {
    const key = `${r.employe_id}|${r.date}`
    const f = form[key] || {}
    if (action === 'valider' && (!f.raison || !f.raison.trim())) {
      setErr('Indique la raison pour valider la récup de ' + r.nom + '.'); return
    }
    setBusyKey(key); setErr('')
    try {
      const args = { employe_id: r.employe_id, date: r.date, raison: (f.raison || '').trim() || null, userId: user.id }
      if (action === 'valider') await validerRecup(args)
      else await refuserRecup(args)
      await reload()
    } catch (e) { setErr(e.message) }
    finally { setBusyKey('') }
  }

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>

  const rien = data.absences.length === 0 && data.recups.length === 0

  return (
    <div>
      {err && <div style={{ padding: '10px 14px', background: '#FCEEE8', color: '#A32D2D', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {rien && (
        <div style={{ padding: 40, textAlign: 'center', color: '#27500A', background: '#EAF3DE', borderRadius: 12, fontSize: 14, display: 'inline-flex', gap: 8, width: '100%', justifyContent: 'center' }}>
          <CheckCircle2 size={18} /> Rien à traiter 🎉
        </div>
      )}

      {/* ABSENCES */}
      {data.absences.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#A32D2D', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> Absences à justifier ({data.absences.length})
          </div>
          {data.absences.map(a => {
            const key = `${a.employe_id}|${a.date}`
            const f = form[key] || {}
            return (
              <div key={key} style={{ background: 'white', border: '1px solid #f0d9d2', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 170 }}>
                  <strong style={{ fontSize: 14 }}>{a.nom}</strong>
                  <div style={{ fontSize: 12, color: '#A32D2D' }}>Absent le {a.jour} {fmtJour(a.date)}</div>
                </div>
                <select value={f.classification || 'annuel'} onChange={e => setField(key, 'classification', e.target.value)}
                  style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }}>
                  {CLASSIFS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
                <input value={f.raison || ''} onChange={e => setField(key, 'raison', e.target.value)}
                  placeholder="Raison (optionnel)"
                  style={{ flex: 1, minWidth: 140, padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
                <button onClick={() => handleAbsence(a)} disabled={busyKey === key}
                  style={{ padding: '8px 14px', fontSize: 13, background: '#993556', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={13} /> {busyKey === key ? '…' : (f.classification === 'oubli' ? 'Marquer présent' : 'Envoyer en validation')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* RÉCUP */}
      {data.recups.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3C3489', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Jours de repos travaillés — récup à documenter ({data.recups.length})
          </div>
          {data.recups.map(r => {
            const key = `${r.employe_id}|${r.date}`
            const f = form[key] || {}
            return (
              <div key={key} style={{ background: 'white', border: '1px solid #ddd9f5', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 170 }}>
                  <strong style={{ fontSize: 14 }}>{r.nom}</strong>
                  <div style={{ fontSize: 12, color: '#3C3489' }}>{r.label} travaillé le {r.jour} {fmtJour(r.date)} → +1 récup</div>
                </div>
                <input value={f.raison || ''} onChange={e => setField(key, 'raison', e.target.value)}
                  placeholder="Pourquoi a-t-il travaillé ?"
                  style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
                <button onClick={() => handleRecup(r, 'valider')} disabled={busyKey === key}
                  style={{ padding: '8px 12px', fontSize: 13, background: '#27500A', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> {busyKey === key ? '…' : 'Valider'}
                </button>
                <button onClick={() => handleRecup(r, 'refuser')} disabled={busyKey === key}
                  style={{ padding: '8px 12px', fontSize: 13, background: 'white', color: '#A32D2D', border: '1px solid #e5b0a4', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <XCircle size={13} /> Refuser
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
