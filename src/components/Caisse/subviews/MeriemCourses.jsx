import { useState, useEffect } from 'react'
import { Info, Trash2, ShoppingCart, Paperclip } from 'lucide-react'
import { loadCoursesMonth, donnerCourse, reglerCourse, deleteCourse, loadCategories } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
import { toast } from '../../../lib/toast'
import { confirmDialog } from '../../../lib/confirmDialog'

export default function MeriemCourses({ user }) {
  const isAdmin = !!(user?.perm_caisse_admin || user?.role === 'admin')
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [courses, setCourses] = useState([])
  const [categories, setCategories] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Donner
  const [showGive, setShowGive] = useState(false)
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [giveDate, setGiveDate] = useState(todayISO())

  // Régler
  const [settle, setSettle] = useState(null) // la course en cours de règlement
  const [lignes, setLignes] = useState([])
  const [settleDate, setSettleDate] = useState(todayISO())

  async function reload() {
    setError('')
    try {
      const [list, cats] = await Promise.all([loadCoursesMonth(year, month), loadCategories('meriem')])
      setCourses(list); setCategories(cats)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { reload() }, [year, month])

  const enCours = courses.filter(c => c.status === 'en_cours')
  const regles = courses.filter(c => c.status === 'regle')
  const spentOf = c => (c.depenses || []).reduce((s, d) => s + Number(d.amount || 0), 0)

  async function handleGive() {
    if (!person.trim() || !amount) { setError('Nom et montant requis.'); return }
    setBusy(true); setError('')
    try {
      await donnerCourse({ person, amount: Number(amount), date: giveDate, userId: user.id })
      setPerson(''); setAmount(''); setGiveDate(todayISO()); setShowGive(false)
      await reload()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  function openSettle(c) {
    setSettle(c)
    setLignes([{ amount: '', category: categories[0]?.name || '', label: '', is_facture: false }])
    setSettleDate(todayISO())
  }
  const spentLignes = lignes.reduce((s, l) => s + Number(l.amount || 0), 0)
  const renduLignes = settle ? Number(settle.amount_given) - spentLignes : 0

  async function confirmSettle() {
    setBusy(true); setError('')
    try {
      const clean = lignes.filter(l => Number(l.amount) > 0)
      await reglerCourse({ course: settle, lignes: clean, date: settleDate, userId: user.id })
      setSettle(null)
      await reload()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function handleDelete(c) {
    if (!await confirmDialog(`Supprimer la course de ${c.person} ? (annule le don et le rendu en caisse)`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteCourse(c.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <div>
      <div style={{ background: '#FAEEDA', border: '0.5px solid #d9b14e', color: '#633806', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Donne de l'argent à quelqu'un (nom libre) pour des courses, puis règle avec le détail. Le don sort de la caisse Meriem, le rendu y rentre.</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
          <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
        </div>
        <button onClick={() => { setError(''); setShowGive(true) }} style={btnPri}>+ Donner pour courses</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={{
            padding: '8px 16px', borderRadius: 999,
            border: month === m.idx ? '1px solid #993556' : '1px solid #e5d8c3',
            background: month === m.idx ? '#993556' : 'white', color: month === m.idx ? '#faf7f2' : '#1a0f0a',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{m.label}</button>
        ))}
      </div>

      {error && <div style={{ color: '#99201E', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {/* En cours */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a0f0a', marginBottom: 8 }}>En cours ({enCours.length})</div>
      {enCours.length === 0 && <div style={emptyBox}>Aucune course en cours.</div>}
      {enCours.map(c => (
        <div key={c.id} style={rowCard}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{c.person}</div>
            <div style={{ fontSize: 11, color: '#4a3a30' }}>Donné le {fmtDateCourte(c.given_date)}</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtMoney(c.amount_given)}</div>
          <button onClick={() => openSettle(c)} style={btnPri}>Régler</button>
          {isAdmin && <button onClick={() => handleDelete(c)} style={{ ...btnIcon, display: 'inline-flex', alignItems: 'center', color: '#A32D2D' }} title="Supprimer"><Trash2 size={14} /></button>}
        </div>
      ))}

      {/* Réglés */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a0f0a', margin: '22px 0 8px' }}>Réglés ({regles.length})</div>
      {regles.length === 0 && <div style={emptyBox}>Aucune course réglée ce mois.</div>}
      {regles.map(c => {
        const spent = spentOf(c)
        const rendu = Number(c.amount_given) - spent
        return (
          <div key={c.id} style={{ ...rowCardCol, opacity: 0.95 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.person}</div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(c.given_date)}</div>
              </div>
              <div style={{ fontSize: 12, color: '#4a3a30', textAlign: 'right' }}>
                donné <b>{fmtMoney(c.amount_given)}</b> · dépensé <b>{fmtMoney(spent)}</b> · rendu <b>{fmtMoney(rendu)}</b>
              </div>
              {isAdmin && <button onClick={() => handleDelete(c)} style={{ ...btnIcon, display: 'inline-flex', alignItems: 'center', color: '#A32D2D' }} title="Supprimer"><Trash2 size={14} /></button>}
            </div>
            {(c.depenses || []).length > 0 && (
              <div style={{ marginTop: 8, borderTop: '0.5px solid #e5d8c3', paddingTop: 6 }}>
                {c.depenses.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4a3a30', padding: '2px 0' }}>
                    <span>{d.category || 'Autre'}{d.label ? ` · ${d.label}` : ''}</span>
                    <span style={{ fontWeight: 500 }}>{fmtMoney(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Modale Donner */}
      {showGive && (
        <div style={overlay} onClick={() => !busy && setShowGive(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={18} /> Donner pour courses</h3>
            <label style={lbl}>Personne
              <input type="text" value={person} onChange={e => setPerson(e.target.value)} autoFocus placeholder="ex. Rachid" style={inp} />
            </label>
            <label style={lbl}>Montant donné (DH)
              <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="ex. 500" style={inp} />
            </label>
            <label style={lbl}>Date
              <input type="date" value={giveDate} onChange={e => setGiveDate(e.target.value)} style={inp} />
            </label>
            {error && <div style={{ color: '#99201E', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowGive(false)} disabled={busy} style={btnSec}>Annuler</button>
              <button onClick={handleGive} disabled={busy} style={btnPri}>{busy ? '…' : 'Donner'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Régler */}
      {settle && (
        <div style={overlay} onClick={() => !busy && setSettle(null)}>
          <div style={{ ...modal, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Régler — {settle.person}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#4a3a30' }}>Donné : <b>{fmtMoney(settle.amount_given)}</b>. Ajoute le détail des dépenses (par catégorie).</p>

            {lignes.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input type="number" inputMode="decimal" value={l.amount} placeholder="Montant"
                  onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  style={{ ...inp, marginTop: 0, width: 90 }} />
                <select value={l.category}
                  onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                  style={{ ...inp, marginTop: 0, flex: 1 }}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.emoji || ''} {c.name}</option>)}
                </select>
                <input type="text" value={l.label} placeholder="détail (option)"
                  onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  style={{ ...inp, marginTop: 0, flex: 1 }} />
                <label title="Facture à récupérer (chèque)" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!l.is_facture}
                    onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, is_facture: e.target.checked } : x))} />
                  <Paperclip size={13} />
                </label>
                {lignes.length > 1 && (
                  <button onClick={() => setLignes(prev => prev.filter((_, j) => j !== i))} style={btnIcon} title="Retirer">✕</button>
                )}
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Paperclip size={11} /> = facture à récupérer (ira dans Factures, récupérable par chèque)</div>
            <button onClick={() => setLignes(prev => [...prev, { amount: '', category: categories[0]?.name || '', label: '', is_facture: false }])}
              style={{ ...btnSec, marginTop: 2 }}>+ Ligne</button>

            <div style={{ marginTop: 14, padding: '10px 12px', background: '#F9F6F1', borderRadius: 8, fontSize: 13 }}>
              Dépensé : <b>{fmtMoney(spentLignes)}</b> · Rendu en caisse : <b style={{ color: renduLignes < 0 ? '#99201E' : '#085041' }}>{fmtMoney(renduLignes)}</b>
            </div>
            <label style={{ ...lbl, marginTop: 12 }}>Date du règlement
              <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} style={inp} />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setSettle(null)} disabled={busy} style={btnSec}>Annuler</button>
              <button onClick={confirmSettle} disabled={busy || spentLignes <= 0} style={btnPri}>{busy ? '…' : 'Valider le règlement'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPri = { padding: '8px 16px', fontSize: 13, fontWeight: 500, background: '#993556', color: '#faf7f2', border: '1px solid #993556', borderRadius: 999, cursor: 'pointer' }
const btnSec = { padding: '8px 16px', fontSize: 13, fontWeight: 500, background: 'white', color: '#1a0f0a', border: '1px solid #e5d8c3', borderRadius: 999, cursor: 'pointer' }
const btnIcon = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }
const emptyBox = { padding: 20, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16, fontSize: 13, marginBottom: 6 }
const rowCard = { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }
const rowCardCol = { padding: '13px 16px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 16, padding: 22, maxWidth: 360, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: '90dvh', overflowY: 'auto' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 12 }
const inp = { display: 'block', width: '100%', padding: '9px 11px', marginTop: 5, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, boxSizing: 'border-box' }
