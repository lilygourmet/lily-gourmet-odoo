import { useState, useEffect, useMemo } from 'react'
import { loadHamidAvancesMonth, loadHamidDepensesMonth, loadHamidBalance, donnerAHamid, ajouterDepenseHamid, hamidRendArgent, loadCategories } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
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

  const negative = balance < 0

  async function handleAvance({ amount, label, mvtDate }) {
    await donnerAHamid({ amount, label, mvtDate, userId: user.id })
    setShowAvance(false); reload()
  }
  async function handleDepense({ amount, label, category, mvtDate }) {
    await ajouterDepenseHamid({ amount, label, category, mvtDate, userId: user.id })
    setShowDepense(false); reload()
  }
  async function handleRend({ amount, label, mvtDate }) {
    await hamidRendArgent({ amount, label, mvtDate, userId: user.id })
    setShowRend(false); reload()
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
            color:      month === m.idx ? '#633806'  : '#6F6A60',
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
          <div style={{ fontSize: 11, color: '#9B968D', marginTop: 4 }}>{negative ? 'Vous devez à Hamid' : 'Argent chez Hamid'}</div>
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#6F6A60' }}>↓ Avances reçues · {MOIS_TABS[month - 1].label}</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#1D7A5C', marginTop: 6 }}>{fmtMoney(totalAvances)}</div>
          <div style={{ fontSize: 11, color: '#9B968D', marginTop: 4 }}>{avances.length} versements</div>
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#6F6A60' }}>↑ Dépenses · {MOIS_TABS[month - 1].label}</div>
          <div style={{ fontSize: 26, fontWeight: 500, color: '#99201E', marginTop: 6 }}>{fmtMoney(totalDepenses)}</div>
          <div style={{ fontSize: 11, color: '#9B968D', marginTop: 4 }}>{depenses.length} dépenses</div>
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
          {avances.length === 0 && <div style={{ fontSize: 12, color: '#9B968D', padding: 8 }}>Aucune avance ce mois</div>}
          {avances.map(a => (
            <div key={a.id} style={miniRow}>
              <div>
                <div style={{ fontSize: 13 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#6F6A60' }}>{fmtDateCourte(a.mvt_date)}</div>
              </div>
              <div style={{ color: '#1D7A5C', fontWeight: 500 }}>+ {fmtMoney(a.amount).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span></div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ background: '#FCE9E8', color: '#99201E', padding: '10px 14px', borderRadius: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500 }}>
            <span>↑ Dépenses de Hamid</span>
            <span>{fmtMoney(totalDepenses)}</span>
          </div>
          {depenses.length === 0 && <div style={{ fontSize: 12, color: '#9B968D', padding: 8 }}>Aucune dépense ce mois</div>}
          {depenses.map(d => (
            <div key={d.id} style={miniRow}>
              <div>
                <div style={{ fontSize: 13 }}>{d.label}</div>
                <div style={{ fontSize: 11, color: '#6F6A60' }}>{fmtDateCourte(d.depense_date)} · {d.category || '—'}</div>
              </div>
              <div style={{ color: '#99201E', fontWeight: 500 }}>− {fmtMoney(d.amount).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '14px 16px', background: '#F4F0EA', borderRadius: 8, fontSize: 13, color: '#6F6A60', textAlign: 'center' }}>
        ⚖ <strong style={{ color: '#3A3733' }}>{fmtMoney(totalAvances)} donnés − {fmtMoney(totalDepenses)} dépensés ce mois</strong>
      </div>

      {showAvance  && <AjoutAvanceHamidModal  onClose={() => setShowAvance(false)}  onSubmit={handleAvance} />}
      {showDepense && <AjoutDepenseHamidModal categories={categories} onClose={() => setShowDepense(false)} onSubmit={handleDepense} />}
      {showRend    && <HamidRendModal         onClose={() => setShowRend(false)}    onSubmit={handleRend} balance={balance} />}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
const miniRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: 5, background: 'white', border: '0.5px solid #E8E2D8' }
