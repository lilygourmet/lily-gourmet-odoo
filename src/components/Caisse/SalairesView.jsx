import { useState, useEffect } from 'react'
import { loadSalairesYear, loadSalaireMonth, createSalaire, markSalairePaye, loadSalairesDefaut, deleteSalaire, loadSalaireEnveloppes } from '../../lib/caisse'
import { currentYear, currentMonth, fmtMoney, fmtMois, SALAIRE_STATUS_LABELS, SALAIRE_COLORS } from './_helpers'
import CompositionSalaireModal from './modals/CompositionSalaireModal'

export default function SalairesView({ user }) {
  const [year, setYear] = useState(currentYear())
  const [month] = useState(currentMonth())
  const [salaires, setSalaires] = useState([])
  const [defaults, setDefaults] = useState({})
  const [composing, setComposing] = useState(null) // salaire object

  useEffect(() => { (async () => { setDefaults(await loadSalairesDefaut()) })() }, [])
  useEffect(() => { reload() }, [year])

  async function reload() {
    setSalaires(await loadSalairesYear(year))
  }

  async function ensureSalaireMonth(beneficiaire) {
    const monthSals = await loadSalaireMonth(year, month)
    let sal = monthSals.find(s => s.beneficiaire === beneficiaire)
    if (!sal) {
      sal = await createSalaire({ beneficiaire, month, year, target_amount: defaults[beneficiaire] || 8000 })
    }
    setComposing(sal)
  }

  async function handlePay(salaireId) {
    if (!confirm('Marquer ce salaire comme PAYÉ ? Le reliquat sera transféré dans la destination choisie.')) return
    await markSalairePaye(salaireId, user.id)
    reload()
  }

  async function handleDelete(salaireId) {
    if (!confirm('Supprimer ce salaire ? Les enveloppes attachées seront libérées.')) return
    await deleteSalaire(salaireId); reload()
  }

  const currentMonthSalaires = salaires.filter(s => s.month === month)
  const history = salaires.filter(s => !(s.month === month && s.year === year))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, color: '#6F6A60', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Salaires de {fmtMois(month - 1)} {year}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 30 }}>
        {['nezha', 'layla'].map(ben => {
          const sal = currentMonthSalaires.find(s => s.beneficiaire === ben)
          const c = SALAIRE_COLORS[ben]
          const statusObj = sal ? SALAIRE_STATUS_LABELS[sal.status] : null
          return (
            <div key={ben} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ color: c.text, fontWeight: 500, fontSize: 15 }}>👤 {ben === 'nezha' ? 'Nezha' : 'Layla'}</div>
                {statusObj ? (
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: statusObj.bg, color: statusObj.text, fontWeight: 500 }}>{statusObj.label}</span>
                ) : (
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.05)', color: c.text }}>Pas créé</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <div style={{ fontSize: 30, fontWeight: 500, color: c.text }}>{fmtMoney(sal?.target_amount || defaults[ben] || 8000)}</div>
                <div style={{ fontSize: 12, color: c.text, opacity: 0.7 }}>salaire cible</div>
              </div>
              {sal && (
                <div style={{ fontSize: 12, color: c.text, marginTop: 10 }}>
                  {sal.status === 'paye' && '✓ Payé'}
                  {sal.status === 'pret' && `Prêt à payer · reliquat ${fmtMoney(sal.reliquat_amount || 0)}`}
                  {sal.status === 'brouillon' && 'En cours de composition'}
                </div>
              )}
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                {!sal && <button onClick={() => ensureSalaireMonth(ben)} style={btnPrimary}>+ Créer le salaire</button>}
                {sal && sal.status === 'brouillon' && <button onClick={() => setComposing(sal)} style={btnPrimary}>✎ Continuer la composition</button>}
                {sal && sal.status === 'pret' && <button onClick={() => handlePay(sal.id)} style={btnPrimary}>✓ Marquer payé</button>}
                {sal && sal.status !== 'paye' && <button onClick={() => handleDelete(sal.id)} style={{ ...btnSlim, color: '#99201E' }}>🗑</button>}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#6F6A60', textTransform: 'uppercase', letterSpacing: 0.5 }}>Historique</div>
      </div>

      {history.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>Aucun salaire dans l'historique.</div>}
      {history.map(sal => {
        const statusObj = SALAIRE_STATUS_LABELS[sal.status]
        const c = SALAIRE_COLORS[sal.beneficiaire]
        return (
          <div key={sal.id} style={{
            display: 'grid', gridTemplateColumns: '90px 110px 1fr 130px 100px 32px', gap: 14, alignItems: 'center',
            padding: '11px 14px', borderRadius: 8, marginBottom: 4, background: 'white', border: '0.5px solid #E8E2D8',
          }}>
            <div style={{ fontSize: 12, color: '#6F6A60' }}>{fmtMois(sal.month - 1)} {sal.year}</div>
            <div><span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: c.bg, color: c.text }}>👤 {sal.beneficiaire === 'nezha' ? 'Nezha' : 'Layla'}</span></div>
            <div style={{ fontSize: 12, color: '#6F6A60' }}>
              {sal.reliquat_amount > 0 ? `reliquat ${fmtMoney(sal.reliquat_amount)} → ${sal.reliquat_destination || '—'}` : 'sans reliquat'}
            </div>
            <div><span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: statusObj.bg, color: statusObj.text, fontWeight: 500 }}>{statusObj.label}</span></div>
            <div style={{ fontWeight: 500, textAlign: 'right' }}>{fmtMoney(sal.target_amount)}</div>
            <div></div>
          </div>
        )
      })}

      {composing && (
        <CompositionSalaireModal salaire={composing} onClose={() => { setComposing(null); reload() }} userId={user.id} />
      )}
    </div>
  )
}

const btnSlim    = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '9px 14px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
