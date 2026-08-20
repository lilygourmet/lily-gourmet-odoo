import AuditLogPanel from './AuditLogPanel'
import { useState, useEffect } from 'react'
import { User, Pencil, Check, Trash2 } from 'lucide-react'
import { loadSalairesYear, loadSalaireMonth, createSalaire, markSalairePaye, loadSalairesDefaut, deleteSalaire, loadSalaireEnveloppes, loadReliquatHistory, loadCaissePrisesBySalaire } from '../../lib/caisse'
import { confirmDialog } from '../../lib/confirmDialog'
import { currentYear, currentMonth, fmtMoney, fmtMois, SALAIRE_STATUS_LABELS, SALAIRE_COLORS, reliquatDestLabel } from './_helpers'
import CompositionSalaireModal from './modals/CompositionSalaireModal'

export default function SalairesView({ user }) {
  const [year, setYear] = useState(currentYear())
  const [month] = useState(currentMonth())
  const [salaires, setSalaires] = useState([])
  const [defaults, setDefaults] = useState({})
  const [composing, setComposing] = useState(null) // salaire object
  const [reliquatHist, setReliquatHist] = useState([])
  const [prisesBySal, setPrisesBySal] = useState({})   // argent pris dans la caisse Layla LG, par salaire

  useEffect(() => { (async () => { setDefaults(await loadSalairesDefaut()) })() }, [])
  useEffect(() => { reload() }, [year])

  async function reload() {
    setSalaires(await loadSalairesYear(year))
    loadReliquatHistory().then(setReliquatHist).catch(() => setReliquatHist([]))
    loadCaissePrisesBySalaire().then(setPrisesBySal).catch(() => setPrisesBySal({}))
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
    if (!await confirmDialog('Marquer ce salaire comme PAYÉ ? Le reliquat sera transféré dans la destination choisie.', { confirmLabel: 'Valider' })) return
    await markSalairePaye(salaireId, user.id)
    reload()
  }

  async function handleDelete(salaireId) {
    if (!await confirmDialog('Supprimer ce salaire ? Les enveloppes attachées seront libérées.', { danger: true, confirmLabel: 'Supprimer' })) return
    await deleteSalaire(salaireId); reload()
  }

  const currentMonthSalaires = salaires.filter(s => s.month === month)
  // Le mois en cours est dans les cartes du haut, sauf s'il est PAYÉ : on le garde
  // aussi dans l'historique pour ne pas le perdre de vue jusqu'au mois suivant.
  const history = salaires.filter(s => !(s.month === month && s.year === year) || s.status === 'paye')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, color: '#4a3a30', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Salaires de {fmtMois(month - 1)} {year}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 30 }}>
        {['nezha', 'layla'].map(ben => {
          const sal = currentMonthSalaires.find(s => s.beneficiaire === ben)
          const c = SALAIRE_COLORS[ben]
          const statusObj = sal ? SALAIRE_STATUS_LABELS[sal.status] : null
          return (
            <div key={ben} style={{ background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(122,42,68,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ color: c.text, fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={15} /> {ben === 'nezha' ? 'Nezha' : 'Layla'}</div>
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
                {sal && sal.status === 'brouillon' && <button onClick={() => setComposing(sal)} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Pencil size={14} /> Continuer la composition</button>}
                {sal && sal.status === 'pret' && <button onClick={() => setComposing(sal)} style={{ ...btnSlim, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Pencil size={14} /> Modifier</button>}
                {sal && sal.status === 'pret' && <button onClick={() => handlePay(sal.id)} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={15} /> Marquer payé</button>}
                {sal && sal.status !== 'paye' && <button onClick={() => handleDelete(sal.id)} style={{ ...btnSlim, color: '#99201E', display: 'inline-flex', alignItems: 'center' }} title="Supprimer"><Trash2 size={14} /></button>}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5 }}>Historique</div>
      </div>

      {history.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>Aucun salaire dans l'historique.</div>}
      {history.map(sal => {
        const statusObj = SALAIRE_STATUS_LABELS[sal.status]
        const c = SALAIRE_COLORS[sal.beneficiaire]
        return (
          <div key={sal.id} style={{
            display: 'grid', gridTemplateColumns: '90px 100px 1fr 110px 150px auto', gap: 12, alignItems: 'center',
            padding: '13px 16px', borderRadius: 14, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3',
            boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
          }}>
            <div style={{ fontSize: 12, color: '#4a3a30' }}>{fmtMois(sal.month - 1)} {sal.year}</div>
            <div><span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: c.bg, color: c.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={12} /> {sal.beneficiaire === 'nezha' ? 'Nezha' : 'Layla'}</span></div>
            <div style={{ fontSize: 12, color: '#4a3a30' }}>
              {(() => {
                const cree = reliquatHist.find(h => h.type === 'cree' && h.source_salaire_id === sal.id)
                const applied = reliquatHist.filter(h => h.type === 'applique' && h.target_salaire_id === sal.id)
                if (!cree && applied.length === 0) {
                  return sal.reliquat_amount > 0 ? `reliquat ${fmtMoney(sal.reliquat_amount)} → ${reliquatDestLabel(sal.reliquat_destination)}` : 'sans reliquat'
                }
                return <>
                  {applied.map(a => <div key={a.id} style={{ color: '#99201E' }}>− {fmtMoney(a.amount)} (report {fmtMois(a.source_month - 1)} {a.source_year})</div>)}
                  {cree && <div style={{ color: '#1D7A5C' }}>+ {fmtMoney(cree.amount)} reliquat reporté</div>}
                </>
              })()}
            </div>
            <div><span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: statusObj.bg, color: statusObj.text, fontWeight: 500 }}>{statusObj.label}</span></div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 500 }}>{fmtMoney(sal.target_amount)}</div>
              {prisesBySal[sal.id] > 0 && (
                <div style={{ fontSize: 10.5, color: '#085041' }}>dont {fmtMoney(prisesBySal[sal.id])} de la caisse Layla LG</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {sal.status === 'brouillon' && <button onClick={() => setComposing(sal)} style={{ ...btnSlim, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Composer / modifier"><Pencil size={13} /></button>}
              {sal.status === 'pret' && <button onClick={() => setComposing(sal)} style={{ ...btnSlim, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Modifier la composition"><Pencil size={13} /></button>}
              {sal.status === 'pret' && <button onClick={() => handlePay(sal.id)} style={{ ...btnPrimary, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Marquer payé"><Check size={14} /></button>}
              {sal.status !== 'paye' && <button onClick={() => handleDelete(sal.id)} style={{ ...btnSlim, color: '#99201E' }} title="Supprimer"><Trash2 size={13} /></button>}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize: 13, fontWeight: 500, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5, margin: '28px 0 12px' }}>📜 Journal du reliquat</div>
      <p style={{ fontSize: 12, color: '#6b5f57', margin: '0 0 12px' }}>Trace permanente : chaque reliquat <b>créé</b> (surplus d'un mois) et chaque report <b>appliqué</b> (déduit sur un mois).</p>
      {reliquatHist.length === 0
        ? <div style={{ padding: 24, textAlign: 'center', color: '#6b5f57', background: '#F9F6F1', borderRadius: 16 }}>Aucun mouvement de reliquat. Clique « Reconstituer le passé » pour partir des salaires existants.</div>
        : reliquatHist.map(r => {
          const c = SALAIRE_COLORS[r.beneficiaire] || { bg: '#eee', text: '#333' }
          const cree = r.type === 'cree'
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3' }}>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: c.bg, color: c.text }}>{r.beneficiaire === 'nezha' ? 'Nezha' : 'Layla'}</span>
              <div style={{ flex: 1, fontSize: 12.5, color: '#4a3a30' }}>
                {cree
                  ? <>Reliquat <b>créé</b> sur {fmtMois(r.source_month - 1)} {r.source_year}</>
                  : <>Report de {fmtMois(r.source_month - 1)} {r.source_year} <b>appliqué</b> sur {fmtMois(r.target_month - 1)} {r.target_year}</>}
              </div>
              <div style={{ fontWeight: 600, color: cree ? '#1D7A5C' : '#99201E' }}>{cree ? '+' : '−'}{fmtMoney(r.amount)}</div>
            </div>
          )
        })}

      {composing && (
        <CompositionSalaireModal salaire={composing} onClose={() => { setComposing(null); reload() }} userId={user.id} />
      )}
    </div>
  )
}

const btnSlim    = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '9px 14px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
