import { useState, useEffect, useMemo } from 'react'
import {
  loadDestinataires,
  loadAvances,
  loadAvancesSummary,
  createAvance,
  deleteAvance,
  addAvanceRemboursement,
  deleteAvanceRemboursement,
  addLgPaiementPerso,
  deleteLgPaiementPerso,
  loadLgPaiementsPerso,
} from '../../../lib/caisse'
import AuditLogPanel from '../AuditLogPanel'
import { User, Info, Check, Clock, Trash2, HandCoins } from 'lucide-react'
import { fmtMoney, fmtDateCourte, fmtDateLongue, COLOR_PALETTE, todayISO } from '../_helpers'
import { toast } from '../../../lib/toast'
import { confirmDialog } from '../../../lib/confirmDialog'

export default function MeriemAvances({ user }) {
  const isAdmin = !!(user?.perm_caisse_admin || user?.role === 'admin')
  const [list, setList]                 = useState([])
  const [summary, setSummary]           = useState([])
  const [persoDests, setPersoDests]     = useState([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [benefFilter, setBenefFilter]   = useState('all')
  const [showNew, setShowNew]           = useState(false)
  const [rbAvance, setRbAvance]         = useState(null) // avance en cours de remboursement
  const [showPayeLG, setShowPayeLG]     = useState(false)
  const [lgPaiements, setLgPaiements]   = useState([])
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
      setLgPaiements(await loadLgPaiementsPerso())
    } catch (e) {
      console.error(e); toast.error('Erreur chargement avances : ' + e.message)
    }
    setLoading(false)
  }

  async function handleCreate(payload) {
    try {
      await createAvance({ ...payload, payerId: user.id, userId: user.id })
      setShowNew(false); reload()
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleAddRb(payload) {
    try {
      await addAvanceRemboursement({ ...payload, avanceId: rbAvance.id, userId: user.id })
      setRbAvance(null); reload()
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleDeleteRb(rbId) {
    if (!await confirmDialog('Annuler ce remboursement ?', { danger: true, confirmLabel: 'Annuler' })) return
    try { await deleteAvanceRemboursement(rbId, user.id); reload() } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleAddPayeLG(payload) {
    try { await addLgPaiementPerso({ ...payload, userId: user.id }); setShowPayeLG(false); reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleDeletePayeLG(id) {
    if (!await confirmDialog('Supprimer ce paiement pour LG ?', { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteLgPaiementPerso(id); reload() } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleDelete(id) {
    if (!await confirmDialog('Supprimer cette avance ?', { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteAvance(id); reload() } catch (e) { toast.error('Erreur : ' + e.message) }
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
            <div key={d.id} style={{ background: c.bg, color: c.text, padding: '14px 16px', borderRadius: 16, border: `0.5px solid ${c.border}`, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
              <div style={{ fontSize: 12, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 5 }}><User size={13} /> {total >= -0.005 ? `${d.name} doit` : `LG doit ${d.name}`}</div>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>{fmtMoney(Math.abs(total))}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{count} avance{count > 1 ? 's' : ''} en cours</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#4a3a30' }}>
          Net dû à Meriem : <strong style={{ color: '#1a0f0a' }}>{fmtMoney(totalPending)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowPayeLG(true)} style={{ ...btnPrimary, background: 'white', color: '#993556', border: '1px solid #993556' }}>🛒 Payé pour LG</button>
          <button onClick={() => setShowNew(true)} style={btnPrimary}>+ Nouvelle avance</button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#4a3a30', padding: '8px 12px', background: '#FAF6F0', borderRadius: 10, marginBottom: 12, border: '0.5px solid #e5d8c3', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Chaque avance = une <strong>sortie</strong> dans la caisse Meriem. Remboursement possible en <strong>plusieurs fois</strong> : espèces/virement (→ <strong>entrée</strong> caisse) ou <strong>achat pour LG</strong> (baisse la dette, sans cash).</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setBenefFilter('all')} style={filterChip(benefFilter === 'all')}>Tout le monde</button>
        {persoDests.map(d => (
          <button key={d.id} onClick={() => setBenefFilter(d.id)} style={{ ...filterChip(String(benefFilter) === String(d.id)), display: 'inline-flex', alignItems: 'center', gap: 5 }}><User size={12} /> {d.name}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {[{v:'pending',l:'En cours'},{v:'refunded',l:'Remboursées'},{v:'all',l:'Toutes'}].map(s => (
          <button key={s.v} onClick={() => setStatusFilter(s.v)} style={statusChip(statusFilter === s.v)}>{s.l}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#4a3a30', padding: 20 }}>Chargement…</div>}

      {!loading && list.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>
          Aucune avance dans ce filtre.
        </div>
      )}

      {!loading && list.map(a => {
        const benefName = a.beneficiaire?.name || '?'
        const benefColor = COLOR_PALETTE[a.beneficiaire?.color_key] || COLOR_PALETTE.gris
        const rbs = a.remboursements || []
        const paid = rbs.reduce((s, r) => s + Number(r.amount), 0)
        const remaining = Math.max(0, Number(a.amount) - paid)
        const isRefunded = !!a.refunded_at || remaining < 0.005
        return (
          <div key={a.id} style={{ marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 12, boxShadow: '0 2px 8px rgba(122,42,68,0.05)', overflow: 'hidden' }}>
            <div style={{ ...rowCard, margin: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
              <div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>Date</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDateCourte(a.avance_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>Pour</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: benefColor.bg, color: benefColor.text, padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 500, marginTop: 2 }}><User size={12} /> {benefName}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>Reste dû</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: isRefunded ? '#085041' : '#99201E' }}>{fmtMoney(remaining)}</div>
                {paid > 0 && <div style={{ fontSize: 10, color: '#8a7a70' }}>sur {fmtMoney(a.amount)}</div>}
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>Motif</div>
                <div style={{ fontSize: 12, color: '#1a0f0a' }}>{a.motif || '—'}</div>
              </div>
              <div>
                {isRefunded
                  ? <span style={statusDone}><Check size={12} /> Soldée</span>
                  : <span style={statusPending}><Clock size={12} /> {paid > 0 ? 'Partiel' : 'En attente'}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {!isRefunded && <button onClick={() => setRbAvance({ ...a, _remaining: remaining })} style={{ ...btnPrimarySmall, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Check size={13} /> Rembourser</button>}
                {isAdmin && <button onClick={() => handleDelete(a.id)} style={{ ...btnDanger, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} title="Supprimer l'avance"><Trash2 size={13} /></button>}
              </div>
            </div>
            {rbs.length > 0 && (
              <div style={{ background: '#FAF6F0', borderTop: '0.5px solid #eee', padding: '8px 15px' }}>
                {rbs.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#4a3a30', padding: '2px 0' }}>
                    <span>{fmtDateCourte(r.rb_date)} · {MODE_LABEL[r.mode] || r.mode}{r.note ? ' — ' + r.note : ''}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <strong>{fmtMoney(r.amount)}</strong>
                      {isAdmin && <button onClick={() => handleDeleteRb(r.id)} style={{ ...btnDanger, padding: '2px 6px' }} title="Annuler ce remboursement"><Trash2 size={11} /></button>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

<AuditLogPanel entityType="avance" title="Historique des avances" />

      {lgPaiements.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>🛒 Payé pour LG (crédits)</div>
          {lgPaiements.map(p => {
            const bc = COLOR_PALETTE[p.beneficiaire?.color_key] || COLOR_PALETTE.gris
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3' }}>
                <span style={{ fontSize: 12, color: '#4a3a30' }}>
                  {fmtDateCourte(p.paid_date)} · <span style={{ background: bc.bg, color: bc.text, padding: '2px 8px', borderRadius: 999 }}>{p.beneficiaire?.name}</span>{p.note ? ' — ' + p.note : ''}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ color: '#085041' }}>{fmtMoney(p.amount)}</strong>
                  {isAdmin && <button onClick={() => handleDeletePayeLG(p.id)} style={{ ...btnDanger, padding: '2px 6px' }} title="Supprimer"><Trash2 size={11} /></button>}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {showNew && <NewAvanceModal persoDests={persoDests} onClose={() => setShowNew(false)} onCreate={handleCreate} />}
      {rbAvance && <RemboursementModal avance={rbAvance} onClose={() => setRbAvance(null)} onSubmit={handleAddRb} />}
      {showPayeLG && <PayeLGModal persoDests={persoDests} onClose={() => setShowPayeLG(false)} onSubmit={handleAddPayeLG} />}
    </div>
  )
}

function PayeLGModal({ persoDests, onClose, onSubmit }) {
  const [beneficiaryId, setBeneficiaryId] = useState(persoDests[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!beneficiaryId) { toast.error('Choisis qui'); return }
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Montant invalide'); return }
    setSubmitting(true)
    await onSubmit({ beneficiaryId, amount: amt, note: note.trim() || null, date })
    setSubmitting(false)
  }

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={modalBox}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>🛒 Payé pour LG</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 16 }}>
          Nezha ou Layla a payé des choses pour Lily Gourmet avec son propre argent. Ça baisse ce qu'elle doit (ou crée un crédit en sa faveur).
        </div>

        <label style={fieldLabel}>Qui a payé ?</label>
        <select value={beneficiaryId} onChange={e => setBeneficiaryId(e.target.value)} style={fieldInput}>
          {persoDests.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>

        <label style={fieldLabel}>Montant (DH)</label>
        <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50" style={fieldInput} autoFocus />

        <label style={fieldLabel}>Pour quoi ?</label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Farine, emballages, courses LG…" maxLength={80} style={fieldInput} />

        <label style={fieldLabel}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldInput} />

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={submitting} style={btnPrimary}>{submitting ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

const MODE_LABEL = { especes: '💵 Espèces', virement: '↔️ Virement', achat_lg: '🛒 Achat pour LG' }

function RemboursementModal({ avance, onClose, onSubmit }) {
  const remaining = avance._remaining ?? Number(avance.amount)
  const [amount, setAmount] = useState(String(remaining))
  const [mode, setMode] = useState('especes')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Montant invalide'); return }
    setSubmitting(true)
    await onSubmit({ amount: amt, mode, note: note.trim() || null, date })
    setSubmitting(false)
  }

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={modalBox}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Check size={18} /> Remboursement</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 16 }}>
          {avance.beneficiaire?.name} · reste dû <strong>{fmtMoney(remaining)}</strong>
        </div>

        <label style={fieldLabel}>Comment ?</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          {['especes', 'virement'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              fontSize: 12, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
              border: mode === m ? '1px solid #993556' : '1px solid #e5d8c3',
              background: mode === m ? '#993556' : 'white', color: mode === m ? 'white' : '#1a0f0a',
            }}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#8a7a70', marginBottom: 4 }}>Pour un achat fait pour LG, utilise plutôt le bouton « Payé pour LG ».</div>

        <label style={fieldLabel}>Montant (DH)</label>
        <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={fieldInput} autoFocus />

        <label style={fieldLabel}>Note (ex. ce qui a été acheté)</label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Farine, emballages…" maxLength={80} style={fieldInput} />

        <label style={fieldLabel}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldInput} />

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={submitting} style={btnPrimary}>{submitting ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function NewAvanceModal({ persoDests, onClose, onCreate }) {
  const [beneficiaryId, setBeneficiaryId] = useState(persoDests[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [motif, setMotif] = useState('')
  const [avanceDate, setAvanceDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!beneficiaryId) { toast.error('Choisis pour qui'); return }
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { toast.error('Montant invalide'); return }
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
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><HandCoins size={18} /> Nouvelle avance</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 16 }}>
          Meriem prend de l'argent de sa caisse pro pour avancer pour Layla ou Nezha
        </div>

        <label style={fieldLabel}>Pour qui ?</label>
        <select value={beneficiaryId} onChange={e => setBeneficiaryId(e.target.value)} style={fieldInput}>
          {persoDests.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
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

const btnSlim = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
const btnPrimarySmall = { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#085041', color: 'white', cursor: 'pointer', fontWeight: 500 }
const btnDanger = { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #F2D1D0', background: 'white', color: '#99201E', cursor: 'pointer' }

const rowCard = {
  display: 'grid', gridTemplateColumns: '90px 130px 100px 1fr 130px 110px', gap: 12, alignItems: 'center',
  padding: '13px 15px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3',
  boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
}

const statusPending = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#FAEEDA', color: '#633806' }
const statusDone    = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#E1F5EE', color: '#085041' }

function filterChip(active) {
  return {
    fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 500,
    background: active ? '#1a0f0a' : '#F4F0EA',
    color:      active ? 'white'   : '#4a3a30',
  }
}

function statusChip(active) {
  return {
    fontSize: 11, padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: active ? '#993556' : '#F4F0EA',
    color:      active ? 'white'   : '#4a3a30',
  }
}

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}

const modalBox = {
  background: 'white', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
}

const fieldLabel = { display: 'block', fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 12, fontWeight: 500 }
const fieldInput = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 6, boxSizing: 'border-box' }
