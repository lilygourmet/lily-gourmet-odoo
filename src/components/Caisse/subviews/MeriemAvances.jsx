import { useState, useEffect, useMemo } from 'react'
import {
  loadDestinataires,
  loadAvances,
  loadAvancesSummary,
  createAvance,
  markAvanceRefunded,
  unmarkAvanceRefunded,
  deleteAvance,
} from '../../../lib/caisse'
import { fmtMoney, fmtDateCourte, fmtDateLongue, COLOR_PALETTE } from '../_helpers'

export default function MeriemAvances({ user }) {
  const [list, setList]                 = useState([])
  const [summary, setSummary]           = useState([])
  const [persoDests, setPersoDests]     = useState([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [benefFilter, setBenefFilter]   = useState('all')
  const [showNew, setShowNew]           = useState(false)
  const [loading, setLoading]           = useState(false)

  useEffect(() => { (async () => {
    const all = await loadDestinataires()
    setPersoDests(all.filter(d => d.type === 'perso' && /layla|nezha/i.test(d.name)))
  })() }, [])

  useEffect(() => { reload() }, [statusFilter, benefFilter])

  async function reload() {
    setLoading(true)
    try {
      const beneficiaryId = benefFilter === 'all' ? undefined : benefFilter
      const data = await loadAvances({ beneficiaryId, status: statusFilter })
      setList(data)
      const sum = await loadAvancesSummary()
      setSummary(sum)
    } catch (e) {
      console.error(e); alert('Erreur chargement avances : ' + e.message)
    }
    setLoading(false)
  }

  async function handleCreate(payload) {
    try {
      await createAvance({ ...payload, payerId: user.id, userId: user.id })
      setShowNew(false); reload()
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleMarkRefunded(id) {
    const note = window.prompt('Note (optionnel) — cash, virement, etc.', '')
    try {
      await markAvanceRefunded(id, note || null, user.id)
      reload()
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleUnmark(id) {
    if (!window.confirm('Annuler ce remboursement ?')) return
    try { await unmarkAvanceRefunded(id); reload() } catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette avance ?')) return
    try { await deleteAvance(id); reload() } catch (e) { alert('Erreur : ' + e.message) }
  }

  const totalPending = useMemo(() => summary.reduce((s, x) => s + Number(x.total_due || 0), 0), [summary])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(persoDests.length, 1)}, 1fr)`, gap: 12, marginBottom: 18 }}>
        {persoDests.map(d => {
          const s = summary.find(x => Number(x.beneficiary_id) === Number(d.id))
          const total = Number(s?.total_due || 0)
          const count = Number(s?.count || 0)
          const c = COLOR_PALETTE[d.color_key] || COLOR_PALETTE.gris
          return (
            <div key={d.id} style={{ background: c.bg, color: c.text, padding: '14px 16px', borderRadius: 10, border: `0.5px solid ${c.border}` }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>👤 {d.name} doit</div>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>{fmtMoney(total)}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{count} avance{count > 1 ? 's' : ''} en cours</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#6F6A60' }}>
          Total dû à Meriem : <strong style={{ color: '#3A3733' }}>{fmtMoney(totalPending)}</strong>
        </div>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>+ Nouvelle avance</button>
      </div>

      <div style={{ fontSize: 11, color: '#6F6A60', padding: '8px 12px', background: '#FAF6F0', borderRadius: 6, marginBottom: 12, border: '0.5px solid #E8E2D8' }}>
        ℹ️ Chaque avance crée automatiquement une <strong>sortie</strong> dans la caisse Meriem. Au remboursement, une <strong>entrée</strong> est créée.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setBenefFilter('all')} style={filterChip(benefFilter === 'all')}>Tout le monde</button>
        {persoDests.map(d => (
          <button key={d.id} onClick={() => setBenefFilter(d.id)} style={filterChip(String(benefFilter) === String(d.id))}>👤 {d.name}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {[{v:'pending',l:'En cours'},{v:'refunded',l:'Remboursées'},{v:'all',l:'Toutes'}].map(s => (
          <button key={s.v} onClick={() => setStatusFilter(s.v)} style={statusChip(statusFilter === s.v)}>{s.l}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#6F6A60', padding: 20 }}>Chargement…</div>}

      {!loading && list.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>
          Aucune avance dans ce filtre.
        </div>
      )}

      {!loading && list.map(a => {
        const isRefunded = !!a.refunded_at
        const benefName = a.beneficiaire?.name || '?'
        const benefColor = COLOR_PALETTE[a.beneficiaire?.color_key] || COLOR_PALETTE.gris
        return (
          <div key={a.id} style={rowCard}>
            <div>
              <div style={{ fontSize: 11, color: '#6F6A60' }}>Date</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDateCourte(a.avance_date)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6F6A60' }}>Pour</div>
              <div style={{ display: 'inline-block', background: benefColor.bg, color: benefColor.text, padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 500, marginTop: 2 }}>👤 {benefName}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6F6A60' }}>Montant</div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(a.amount)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6F6A60' }}>Motif</div>
              <div style={{ fontSize: 12, color: '#3A3733' }}>{a.motif || '—'}</div>
            </div>
            <div>
              {isRefunded ? (
                <div>
                  <span style={statusDone}>✓ Remboursée</span>
                  <div style={{ fontSize: 10, color: '#6F6A60', marginTop: 4 }}>
                    {fmtDateLongue(a.refunded_at.slice(0, 10))}
                    {a.refunded_note && <div style={{ fontStyle: 'italic' }}>{a.refunded_note}</div>}
                  </div>
                </div>
              ) : (<span style={statusPending}>⏳ En attente</span>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {isRefunded
                ? <button onClick={() => handleUnmark(a.id)} style={btnSlim}>↶ Annuler</button>
                : <button onClick={() => handleMarkRefunded(a.id)} style={btnPrimarySmall}>✓ Remboursée</button>}
              <button onClick={() => handleDelete(a.id)} style={btnDanger}>🗑</button>
            </div>
          </div>
        )
      })}

      {showNew && <NewAvanceModal persoDests={persoDests} onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </div>
  )
}

function NewAvanceModal({ persoDests, onClose, onCreate }) {
  const [beneficiaryId, setBeneficiaryId] = useState(persoDests[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [motif, setMotif] = useState('')
  const [avanceDate, setAvanceDate] = useState(new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!beneficiaryId) { alert('Choisis pour qui'); return }
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { alert('Montant invalide'); return }
    setSubmitting(true)
    const benefDest = persoDests.find(d => String(d.id) === String(beneficiaryId))
    const benefName = benefDest?.name || '?'
    await onCreate({
      beneficiaryId,
      beneficiaryName: benefName,
      amount: amt,
      motif: motif.trim() || null,
      avanceDate,
    })
    setSubmitting(false)
  }

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={modalBox}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>💸 Nouvelle avance</div>
        <div style={{ fontSize: 12, color: '#6F6A60', marginBottom: 16 }}>
          Meriem prend de l'argent de sa caisse pro pour avancer pour Layla ou Nezha
        </div>

        <label style={fieldLabel}>Pour qui ?</label>
        <select value={beneficiaryId} onChange={e => setBeneficiaryId(e.target.value)} style={fieldInput}>
          {persoDests.map(d => (<option key={d.id} value={d.id}>👤 {d.name}</option>))}
        </select>

        <label style={fieldLabel}>Montant (DH)</label>
        <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50" style={fieldInput} autoFocus />

        <label style={fieldLabel}>Motif (court)</label>
        <input type="text" value={motif} onChange={e => setMotif(e.target.value)} placeholder="Pain, courses, café..." maxLength={80} style={fieldInput} />

        <label style={fieldLabel}>Date</label>
        <input type="date" value={avanceDate} onChange={e => setAvanceDate(e.target.value)} style={fieldInput} />

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSlim}>Annuler</button>
          <button onClick={handleSubmit} disabled={submitting} style={btnPrimary}>
            {submitting ? 'Création…' : 'Créer l\'avance'}
          </button>
        </div>
      </div>
    </div>
  )
}

const btnSlim = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
const btnPrimarySmall = { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#085041', color: 'white', cursor: 'pointer', fontWeight: 500 }
const btnDanger = { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #F2D1D0', background: 'white', color: '#99201E', cursor: 'pointer' }

const rowCard = {
  display: 'grid', gridTemplateColumns: '90px 130px 100px 1fr 130px 110px', gap: 12, alignItems: 'center',
  padding: '12px 14px', borderRadius: 8, marginBottom: 6, background: 'white', border: '0.5px solid #E8E2D8',
}

const statusPending = { display: 'inline-block', fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#FAEEDA', color: '#633806' }
const statusDone    = { display: 'inline-block', fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#E1F5EE', color: '#085041' }

function filterChip(active) {
  return {
    fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 500,
    background: active ? '#3A3733' : '#F4F0EA',
    color:      active ? 'white'   : '#6F6A60',
  }
}

function statusChip(active) {
  return {
    fontSize: 11, padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: active ? '#993556' : '#F4F0EA',
    color:      active ? 'white'   : '#6F6A60',
  }
}

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}

const modalBox = {
  background: 'white', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
}

const fieldLabel = { display: 'block', fontSize: 11, color: '#6F6A60', marginBottom: 4, marginTop: 12, fontWeight: 500 }
const fieldInput = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 6, boxSizing: 'border-box' }
