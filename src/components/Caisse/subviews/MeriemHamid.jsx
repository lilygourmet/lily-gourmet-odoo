import { useState, useEffect, useMemo } from 'react'
import { loadHamidAvancesMonth, loadHamidDepensesMonth, loadHamidBalance, donnerAHamid, ajouterDepenseHamid, hamidRendArgent, loadCategories, deleteMouvement, deleteHamidDepense } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
import { Trash2 } from 'lucide-react'
import AjoutAvanceHamidModal from '../modals/AjoutAvanceHamidModal'
import AjoutDepenseHamidModal from '../modals/AjoutDepenseHamidModal'
import HamidRendModal from '../modals/HamidRendModal'

export default function MeriemHamid({ user }) {
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [avances, setAvances] = useState([])
  const [depenses, setDepenses] = useState([])
  const [balance, setBalance] = useState(0)
  const [categories, setCategories] = useState([])
  const [showAvance, setShowAvance] = useState(false)
  const [showDepense, setShowDepense] = useState(false)
  const [showRend, setShowRend] = useState(false)

  useEffect(() => { (async () => { setCategories(await loadCategories('meriem')) })() }, [])
  useEffect(() => { reload() }, [year, month])

  async function reload() {
    const [av, dep, bal] = await Promise.all([
      loadHamidAvancesMonth(year, month),
      loadHamidDepensesMonth(year, month),
      loadHamidBalance(),
    ])
    setAvances(av); setDepenses(dep); setBalance(bal)
  }

  const totalAvances  = useMemo(() => avances.reduce((s, a) => s + Number(a.amount), 0), [avances])
  const totalDepenses = useMemo(() => depenses.reduce((s, d) => s + Number(d.amount), 0), [depenses])
  const totalFacturesPending = useMemo(
    () => depenses.filter(d => d.is_facture && d.facture_status === 'pending').reduce((s, d) => s + Number(d.amount), 0),
    [depenses]
  )

  const negative = balance < 0

  async function handleAvance({ amount, label, mvtDate }) {
    await donnerAHamid({ amount, label, mvtDate, userId: user.id })
    setShowAvance(false); reload()
  }
  async function handleDepense({ amount, label, category, mvtDate, isFacture }) {
    await ajouterDepenseHamid({ amount, label, category, mvtDate, isFacture, userId: user.id })
    setShowDepense(false); reload()
  }
  async function handleRend({ amount, label, mvtDate }) {
    await hamidRendArgent({ amount, label, mvtDate, userId: user.id })
    setShowRend(false); reload()
  }

  const isAdmin = user?.role === 'admin'
  async function handleDeleteDepense(d) {
    if (!confirm(`Supprimer la dépense « ${d.label} » (${fmtMoney(d.amount)}) ?`)) return
    try { await deleteHamidDepense(d.id, user.id); reload() }
    catch (e) { alert('Erreur : ' + (e.message || e)) }
  }
  async function handleDeleteAvance(a) {
    if (!confirm(`Supprimer l'avance « ${a.label} » (${fmtMoney(a.amount)}) ?\nCela annule aussi la sortie correspondante de la caisse Meriem.`)) return
    try { await deleteMouvement(a.id, user.id); reload() }
    catch (e) { alert('Erreur : ' + (e.message || e)) }
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
        <div style={{ background: '#FCE9E8', border: '0.5px solid #E5BFB6', color: '#99201E', padding: '12px 16px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          ⚠️ <strong>Solde négatif</strong> — Vous devez {fmtMoney(Math.abs(balance))} à Hamid. Pensez à régulariser.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ background: negative ? '#FCE9E8' : '#FAEEDA', border: `0.5px solid ${negative ? '#E5BFB6' : '#EF9F27'}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: negative ? '#99201E' : '#633806' }}>Solde Hamid</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: negative ? '#99201E' : '#633806', marginTop: 6 }}>
            {balance >= 0 ? '+ ' : '− '}{fmtMoney(Math.abs(balance)).replace(' dh', '')} <span style={{ fontSize: 14 }}>dh</span>
          </div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{negative ? 'Vous devez à Hamid' : 'Argent chez Hamid'}</div>
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#4a3a30' }}>↓ Avances reçues · {MOIS_TABS[month - 1].label}</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#1D7A5C', marginTop: 6 }}>{fmtMoney(totalAvances)}</div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{avances.length} versements</div>
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#4a3a30' }}>↑ Dépenses · {MOIS_TABS[month - 1].label}</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#99201E', marginTop: 6 }}>{fmtMoney(totalDepenses)}</div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{depenses.length} dépenses</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowAvance(true)} style={btnPrimary}>+ Donner argent à Hamid</button>
        <button onClick={() => setShowDepense(true)} style={btnNormal}>🧾 Saisir dépense Hamid</button>
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
          {depenses.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: 8 }}>Aucune dépense ce mois</div>}
          {depenses.map(d => (
            <div key={d.id} style={miniRow}>
              <div>
                <div style={{ fontSize: 13 }}>
                  {d.label}
                  {d.is_facture && (
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                      background: d.facture_status === 'recovered' ? '#E1F5EE' : '#FCE9E8',
                      color: d.facture_status === 'recovered' ? '#085041' : '#99201E',
                    }}>{d.facture_status === 'recovered' ? 'Facture récupérée' : 'Facture à récupérer'}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(d.depense_date)} · {d.category || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#99201E', fontWeight: 500 }}>− {fmtMoney(d.amount).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span></span>
                {isAdmin && <button onClick={() => handleDeleteDepense(d)} title="Supprimer" style={trashBtn}><Trash2 size={14} strokeWidth={1.8} /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '14px 16px', background: '#F4F0EA', borderRadius: 8, fontSize: 13, color: '#4a3a30', textAlign: 'center' }}>
        ⚖ <strong style={{ color: '#1a0f0a' }}>{fmtMoney(totalAvances)} donnés − {fmtMoney(totalDepenses)} dépensés ce mois</strong>
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
const miniRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: 5, background: 'white', border: '0.5px solid #e5d8c3' }
const trashBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid #e5d8c3', background: 'white', color: '#A32D2D', cursor: 'pointer' }
