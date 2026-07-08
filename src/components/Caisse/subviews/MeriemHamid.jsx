import { useState, useEffect, useMemo } from 'react'
import { loadHamidAvancesMonth, loadHamidDepensesMonth, loadHamidBalance, donnerAHamid, addHamidSession, hamidRendArgent, loadCategories, deleteMouvement, deleteHamidDepense, uploadHamidDepenseProof, loadHamidSessionsMonth, uploadHamidSessionProof, deleteHamidSession, confirmHamidDepense, setHamidDepenseCategory, setHamidDepenseFacture } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
import { Trash2, Paperclip, AlertTriangle, Receipt, Scale, Clock, Check } from 'lucide-react'
import AjoutAvanceHamidModal from '../modals/AjoutAvanceHamidModal'
import AjoutDepenseHamidModal from '../modals/AjoutDepenseHamidModal'
import HamidRendModal from '../modals/HamidRendModal'
import { toast } from '../../../lib/toast'
import { confirmDialog } from '../../../lib/confirmDialog'

export default function MeriemHamid({ user }) {
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [avances, setAvances] = useState([])
  const [depenses, setDepenses] = useState([])
  const [sessions, setSessions] = useState([])
  const [balance, setBalance] = useState(0)
  const [categories, setCategories] = useState([])
  const [showAvance, setShowAvance] = useState(false)
  const [showDepense, setShowDepense] = useState(false)
  const [showRend, setShowRend] = useState(false)

  useEffect(() => { (async () => { setCategories(await loadCategories('meriem')) })() }, [])
  useEffect(() => { reload() }, [year, month])

  async function reload() {
    const [av, dep, ses, bal] = await Promise.all([
      loadHamidAvancesMonth(year, month),
      loadHamidDepensesMonth(year, month),
      loadHamidSessionsMonth(year, month),
      loadHamidBalance(),
    ])
    setAvances(av); setDepenses(dep); setSessions(ses); setBalance(bal)
  }

  const totalAvances  = useMemo(() => avances.reduce((s, a) => s + Number(a.amount), 0), [avances])
  // Les dépenses « en attente » (déclarées par Hamid, pas encore confirmées) ne comptent pas dans le total.
  const totalDepenses = useMemo(() => depenses.filter(d => d.confirm_status !== 'pending').reduce((s, d) => s + Number(d.amount), 0), [depenses])
  const pendingDeps   = useMemo(() => depenses.filter(d => d.confirm_status === 'pending'), [depenses])
  const pendingTotal  = useMemo(() => pendingDeps.reduce((s, d) => s + Number(d.amount), 0), [pendingDeps])
  const totalFacturesPending = useMemo(
    () => depenses.filter(d => d.is_facture && d.facture_status === 'pending').reduce((s, d) => s + Number(d.amount), 0),
    [depenses]
  )

  const negative = balance < 0

  async function handleAvance({ amount, label, mvtDate }) {
    await donnerAHamid({ amount, label, mvtDate, userId: user.id })
    setShowAvance(false); reload()
  }
  async function handleDepense({ sessionDate, lignes, proofFile }) {
    await addHamidSession({ sessionDate, lignes, userId: user.id, proofFile })
    setShowDepense(false); reload()
  }
  async function handleRend({ amount, label, mvtDate }) {
    await hamidRendArgent({ amount, label, mvtDate, userId: user.id })
    setShowRend(false); reload()
  }
  async function handleConfirmDepense(d) {
    if (!d.category) { toast.error('Choisis d\'abord une catégorie pour cette dépense.'); return }
    if (!await confirmDialog(`Confirmer la dépense « ${d.label || d.category || ''} » (${fmtMoney(d.amount)}) déclarée par Hamid ?`, { confirmLabel: 'Confirmer' })) return
    try { await confirmHamidDepense(d.id, user.id); reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
  }
  async function handleSetCategory(d, category) {
    try { await setHamidDepenseCategory(d.id, category, user.id); reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
  }
  async function handleSetFacture(d, isFacture) {
    try { await setHamidDepenseFacture(d.id, isFacture, user.id); reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
  }

  const isAdmin = user?.role === 'admin'
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadingSessionId, setUploadingSessionId] = useState(null)
  async function handleProof(d, file) {
    if (!file) return
    setUploadingId(d.id)
    try { await uploadHamidDepenseProof(d.id, file, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
    finally { setUploadingId(null) }
  }
  async function handleSessionProof(sessionId, file) {
    if (!file) return
    setUploadingSessionId(sessionId)
    try { await uploadHamidSessionProof(sessionId, file, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
    finally { setUploadingSessionId(null) }
  }
  async function handleDeleteDepense(d) {
    if (!await confirmDialog(`Supprimer la dépense « ${d.label} » (${fmtMoney(d.amount)}) ?`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteHamidDepense(d.id, user.id); reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
  }
  async function handleDeleteSession(s, total) {
    if (!await confirmDialog(`Supprimer la session du ${fmtDateCourte(s.session_date)} (${fmtMoney(total)}) et toutes ses dépenses ?`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteHamidSession(s.id, user.id); reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
  }

  // Regroupe les dépenses par session ; les dépenses sans session (legacy)
  // restent affichées individuellement comme avant.
  const items = useMemo(() => {
    const sessionMap = new Map(sessions.map(s => [s.id, s]))
    const grouped = new Map() // sessionId -> [depenses]
    const legacy = []
    for (const d of depenses) {
      if (d.hamid_session_id && sessionMap.has(d.hamid_session_id)) {
        if (!grouped.has(d.hamid_session_id)) grouped.set(d.hamid_session_id, [])
        grouped.get(d.hamid_session_id).push(d)
      } else {
        legacy.push(d)
      }
    }
    const out = []
    for (const s of sessions) {
      const lines = grouped.get(s.id) || []
      out.push({ kind: 'session', date: s.session_date, session: s, lines })
    }
    for (const d of legacy) out.push({ kind: 'one', date: d.depense_date, dep: d })
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    return out
  }, [sessions, depenses])
  async function handleDeleteAvance(a) {
    if (!await confirmDialog(`Supprimer l'avance « ${a.label} » (${fmtMoney(a.amount)}) ?\nCela annule aussi la sortie correspondante de la caisse Meriem.`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteMouvement(a.id, user.id); reload() }
    catch (e) { toast.error('Erreur : ' + (e.message || e)) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, overflowX: 'auto' }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={{
            padding: '7px 14px', borderRadius: 8, border: month === m.idx ? '0.5px solid #EF9F27' : 'none', cursor: 'pointer',
            background: month === m.idx ? '#FAEEDA' : '#F4F0EA',
            color:      month === m.idx ? '#633806'  : '#4a3a30',
            fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{m.label}</button>
        ))}
      </div>

      {negative && (
        <div style={{ background: '#FCE9E8', border: '0.5px solid #E5BFB6', color: '#99201E', padding: '12px 16px', borderRadius: 12, marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} /> <span><strong>Solde négatif</strong> — Vous devez {fmtMoney(Math.abs(balance))} à Hamid. Pensez à régulariser.</span>
        </div>
      )}

      {pendingDeps.length > 0 && (
        <div style={{ background: '#FFF6E5', border: '1px solid #F5C46B', color: '#7A5510', padding: '12px 16px', borderRadius: 12, marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} style={{ flexShrink: 0 }} />
          <span><strong>{pendingDeps.length}</strong> dépense{pendingDeps.length > 1 ? 's' : ''} déclarée{pendingDeps.length > 1 ? 's' : ''} par Hamid à confirmer ({fmtMoney(pendingTotal)}) — non comptée{pendingDeps.length > 1 ? 's' : ''} tant que tu n'as pas confirmé.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ background: negative ? '#FCE9E8' : '#FAEEDA', border: `0.5px solid ${negative ? '#E5BFB6' : '#EF9F27'}`, borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <div style={{ fontSize: 11, color: negative ? '#99201E' : '#633806' }}>Solde Hamid</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: negative ? '#99201E' : '#633806', marginTop: 6 }}>
            {balance >= 0 ? '+ ' : '− '}{fmtMoney(Math.abs(balance)).replace(' dh', '')} <span style={{ fontSize: 14 }}>dh</span>
          </div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{negative ? 'Vous devez à Hamid' : 'Argent chez Hamid'}</div>
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <div style={{ fontSize: 11, color: '#4a3a30' }}>↓ Avances reçues · {MOIS_TABS[month - 1].label}</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#1D7A5C', marginTop: 6 }}>{fmtMoney(totalAvances)}</div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{avances.length} versements</div>
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <div style={{ fontSize: 11, color: '#4a3a30' }}>↑ Dépenses · {MOIS_TABS[month - 1].label}</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#99201E', marginTop: 6 }}>{fmtMoney(totalDepenses)}</div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{depenses.length} dépenses</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowAvance(true)} style={btnPrimary}>+ Donner argent à Hamid</button>
        <button onClick={() => setShowDepense(true)} style={{ ...btnNormal, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Receipt size={15} /> Saisir dépense Hamid</button>
        <button onClick={() => setShowRend(true)} style={btnNormal}>↩ Hamid rend l'argent</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ background: '#E1F5EE', color: '#085041', padding: '10px 14px', borderRadius: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500 }}>
            <span>↓ Avances reçues de Meriem</span>
            <span>{fmtMoney(totalAvances)}</span>
          </div>
          {avances.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: 8 }}>Aucune avance ce mois</div>}
          {avances.map(a => (
            <div key={a.id} style={miniRow}>
              <div>
                <div style={{ fontSize: 13 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(a.mvt_date)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#1D7A5C', fontWeight: 500 }}>+ {fmtMoney(a.amount).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span></span>
                {isAdmin && <button onClick={() => handleDeleteAvance(a)} title="Supprimer" style={trashBtn}><Trash2 size={14} strokeWidth={1.8} /></button>}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ background: '#FCE9E8', color: '#99201E', padding: '10px 14px', borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>↑ Dépenses de Hamid</span>
              <span>{fmtMoney(totalDepenses)}</span>
            </div>
            {totalFacturesPending > 0 && (
              <div style={{ fontWeight: 400, fontSize: 11, marginTop: 3 }}>dont {fmtMoney(totalFacturesPending)} à récupérer (factures)</div>
            )}
          </div>
          {items.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: 8 }}>Aucune dépense ce mois</div>}
          {items.map(item => item.kind === 'session' ? (
            <SessionCard
              key={`s${item.session.id}`}
              session={item.session}
              lines={item.lines}
              isAdmin={isAdmin}
              uploading={uploadingSessionId === item.session.id}
              onUploadProof={file => handleSessionProof(item.session.id, file)}
              onDeleteSession={total => handleDeleteSession(item.session, total)}
              onConfirmDepense={handleConfirmDepense}
              categories={categories}
              onSetCategory={handleSetCategory}
              onSetFacture={handleSetFacture}
            />
          ) : (
            <div key={`d${item.dep.id}`} style={miniRow}>
              <div>
                <div style={{ fontSize: 13 }}>
                  {item.dep.label}
                  {item.dep.is_facture && (
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                      background: item.dep.facture_status === 'recovered' ? '#E1F5EE' : '#FCE9E8',
                      color: item.dep.facture_status === 'recovered' ? '#085041' : '#99201E',
                    }}>{item.dep.facture_status === 'recovered' ? 'Facture récupérée' : 'Facture à récupérer'}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(item.dep.depense_date)} · {item.dep.category || '—'}</div>
                <div style={{ marginTop: 4, fontSize: 11 }}>
                  {uploadingId === item.dep.id ? (
                    <span style={{ color: '#8a7a70' }}>Envoi de la preuve…</span>
                  ) : item.dep.proof_url ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <a href={item.dep.proof_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0C447C', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}><Paperclip size={12} strokeWidth={1.8} /> Voir la preuve</a>
                      <label style={{ color: '#8a7a70', cursor: 'pointer' }}>remplacer
                        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleProof(item.dep, e.target.files?.[0])} />
                      </label>
                    </span>
                  ) : (
                    <label style={{ color: '#993556', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><Paperclip size={12} strokeWidth={1.8} /> Ajouter une preuve
                      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleProof(item.dep, e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#99201E', fontWeight: 500 }}>− {fmtMoney(item.dep.amount).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span></span>
                {isAdmin && <button onClick={() => handleDeleteDepense(item.dep)} title="Supprimer" style={trashBtn}><Trash2 size={14} strokeWidth={1.8} /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '14px 16px', background: '#F4F0EA', borderRadius: 12, fontSize: 13, color: '#4a3a30', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Scale size={16} /> <strong style={{ color: '#1a0f0a' }}>{fmtMoney(totalAvances)} donnés − {fmtMoney(totalDepenses)} dépensés ce mois</strong>
      </div>

      {showAvance  && <AjoutAvanceHamidModal  onClose={() => setShowAvance(false)}  onSubmit={handleAvance} />}
      {showDepense && <AjoutDepenseHamidModal categories={categories} onClose={() => setShowDepense(false)} onSubmit={handleDepense} />}
      {showRend    && <HamidRendModal         onClose={() => setShowRend(false)}    onSubmit={handleRend} balance={balance} />}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
const miniRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }

// Carte « session » : N lignes de dépense + UNE preuve commune.
function SessionCard({ session, lines, isAdmin, uploading, onUploadProof, onDeleteSession, onConfirmDepense, categories, onSetCategory, onSetFacture }) {
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const facturesCount = lines.filter(l => l.is_facture).length
  return (
    <div style={{ borderRadius: 14, marginBottom: 8, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)', overflow: 'hidden' }}>
      {/* En-tête session */}
      <div style={{ background: '#FAF0E5', padding: '10px 14px', borderBottom: '0.5px solid #e5d8c3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#633806', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'monospace' }}>Session</span>
          <span style={{ fontSize: 12, color: '#4a3a30' }}>{(session.session_date || '').slice(8, 10)}/{(session.session_date || '').slice(5, 7)}</span>
          <span style={{ fontSize: 11, color: '#8a7a70' }}>· {lines.length} ligne{lines.length > 1 ? 's' : ''}{facturesCount > 0 ? ` · ${facturesCount} facture${facturesCount > 1 ? 's' : ''}` : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#99201E', fontWeight: 500, fontSize: 14 }}>− {fmtMoney(total)}</span>
          {isAdmin && <button onClick={() => onDeleteSession(total)} title="Supprimer la session" style={trashBtn}><Trash2 size={14} strokeWidth={1.8} /></button>}
        </div>
      </div>

      {/* Preuve commune */}
      <div style={{ padding: '8px 14px', background: '#F9F6F1', fontSize: 11, borderBottom: '0.5px solid #e5d8c3' }}>
        {uploading ? (
          <span style={{ color: '#8a7a70' }}>Envoi de la preuve…</span>
        ) : session.proof_url ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <a href={session.proof_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0C447C', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
              <Paperclip size={12} strokeWidth={1.8} /> Preuve commune
            </a>
            <label style={{ color: '#8a7a70', cursor: 'pointer' }}>remplacer
              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => onUploadProof(e.target.files?.[0])} />
            </label>
          </span>
        ) : (
          <label style={{ color: '#993556', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <Paperclip size={12} strokeWidth={1.8} /> Ajouter une preuve commune
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => onUploadProof(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {/* Lignes de la session */}
      <div>
        {lines.map(d => {
          const isPending = d.confirm_status === 'pending'
          return (
          <div key={d.id} style={{ padding: '8px 14px', borderTop: '0.5px solid #f0e8d5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: isPending ? '#FFFBF0' : 'transparent' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>
                {d.label || <span style={{ color: '#8a7a70', fontStyle: 'italic' }}>(sans libellé)</span>}
                {isPending && (
                  <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: '#FFF6E5', color: '#7A5510', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={9} /> À confirmer</span>
                )}
                {d.is_facture && (
                  <span style={{
                    marginLeft: 6, fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                    background: d.facture_status === 'recovered' ? '#E1F5EE' : '#FCE9E8',
                    color: d.facture_status === 'recovered' ? '#085041' : '#99201E',
                  }}>{d.facture_status === 'recovered' ? 'Facture récupérée' : 'Facture à récupérer'}</span>
                )}
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={d.category || ''}
                  onChange={e => onSetCategory && onSetCategory(d, e.target.value)}
                  style={{
                    fontSize: 11, padding: '3px 6px', borderRadius: 6,
                    border: d.category ? '0.5px solid #e5d8c3' : '1px solid #EF9F27',
                    background: d.category ? '#F4F0EA' : '#FFF6E5', color: d.category ? '#4a3a30' : '#7A5510',
                  }}>
                  <option value="">À catégoriser…</option>
                  {(categories || []).map(c => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
                </select>
                <button onClick={() => onSetFacture && onSetFacture(d, !d.is_facture)} title="Facture à récupérer ?"
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    border: d.is_facture ? '1px solid #99201E' : '0.5px solid #e5d8c3',
                    background: d.is_facture ? '#FCE9E8' : 'white', color: d.is_facture ? '#99201E' : '#8a7a70',
                  }}>
                  <Paperclip size={11} /> {d.is_facture ? 'Facture à récupérer' : 'Pas de facture'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isPending && onConfirmDepense && (
                <button onClick={() => onConfirmDepense(d)} title="Confirmer cette dépense" style={{ fontSize: 11, padding: '4px 9px', background: '#1D7A5C', border: '1px solid #1D7A5C', color: 'white', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}><Check size={12} /> Confirmer</button>
              )}
              <span style={{ color: '#99201E', fontWeight: 500, fontSize: 13 }}>− {fmtMoney(d.amount).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span></span>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
const trashBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid #e5d8c3', background: 'white', color: '#A32D2D', cursor: 'pointer' }
