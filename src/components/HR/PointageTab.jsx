import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  loadMonthData, calculerMois, syncAttendance, syncLeaves,
  setAjustement, removeAjustement, updatePointage, validerMois,
} from '../../lib/pointage'

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const COULEUR_STATUT = {
  normal:           { bg: 'white',   text: '#3A3733' },
  demi:             { bg: '#FFF7E0', text: '#854F0B' },
  off:              { bg: '#F5EFE7', text: '#6F6A60' },
  off_travaille:    { bg: '#EEEDFE', text: '#3C3489' },
  ferie:            { bg: '#EAF3DE', text: '#27500A' },
  ferie_travaille:  { bg: '#C0DD97', text: '#173404' },
  conge:            { bg: '#E6F1FB', text: '#0C447C' },
  conge_travaille:  { bg: '#85B7EB', text: '#042C53' },
  absent:           { bg: '#FCEBEB', text: '#A32D2D' },
}

export default function PointageTab({ user }) {
  const today = new Date()
  const [mois, setMois] = useState(today.getMonth() + 1)
  const [annee, setAnnee] = useState(today.getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selectedEmpId, setSelectedEmpId] = useState(null)
  const [vueGlobale, setVueGlobale] = useState(false)  // false = 1 employé, true = tous

  // Charger les données du mois
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await loadMonthData(mois, annee)
      setData(d)
      if (d.employes.length > 0 && !selectedEmpId) {
        setSelectedEmpId(d.employes[0].id)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [mois, annee, selectedEmpId])

  useEffect(() => { reload() }, [mois, annee])

  // Calculs (mémorisés pour éviter recalcul à chaque render)
  const resultats = useMemo(() => {
    if (!data) return {}
    const out = {}
    for (const emp of data.employes) {
      out[emp.id] = calculerMois(emp, mois, annee, data)
    }
    return out
  }, [data, mois, annee])

  const empSelected = data?.employes.find(e => e.id === selectedEmpId)
  const result = empSelected ? resultats[selectedEmpId] : null

  // Debug : voir ce qu'Odoo renvoie
  async function handleDebug() {
    setError(null); setSuccess(null)
    try {
      const resp = await fetch('/api/pointage-api?action=debug-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mois, annee }),
      })
      const data = await resp.json()
      console.log('[DEBUG ODOO]', data)
      const msg = `Total Odoo : ${data.total_odoo} pointages\n\nNoms Odoo trouvés (${data.noms_uniques_odoo?.length}) :\n${(data.noms_uniques_odoo || []).slice(0, 30).join('\n')}\n\n(Voir console pour le détail complet)`
      alert(msg)
    } catch (e) {
      setError('Erreur debug : ' + e.message)
    }
  }

  // Sync Odoo
  async function handleSync() {
    if (!confirm(`Synchroniser les pointages + congés depuis Odoo pour ${MOIS_FR[mois - 1]} ${annee} ?`)) return
    setSyncing(true); setError(null); setSuccess(null)
    try {
      const r1 = await syncAttendance(mois, annee)
      const r2 = await syncLeaves(mois, annee)
      let msg = `✅ ${r1.inserted} pointages + ${r2.inserted} congés importés.`
      if (r1.unmatched > 0) msg += ` ⚠️ ${r1.unmatched} pointages non rattachés à un employé.`
      setSuccess(msg)
      await reload()
    } catch (e) {
      setError('Erreur sync : ' + e.message)
    }
    setSyncing(false)
  }

  // Édition d'une cellule (heures_travaillees, sup, manquantes, recup, statut)
  async function handleEditCell(dateJour, champ, valeur) {
    try {
      if (valeur === '' || valeur === null) {
        await removeAjustement(selectedEmpId, dateJour, champ)
      } else {
        await setAjustement(selectedEmpId, dateJour, champ, valeur, user.id)
      }
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  // Édition d'un pointage (arrivee/depart)
  async function handleEditPointage(pointageId, champ, valeur) {
    try {
      await updatePointage(pointageId, { [champ]: valeur }, user.id)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  // Validation du mois
  async function handleValider() {
    if (!confirm(`Valider le mois de ${MOIS_FR[mois - 1]} ${annee} pour TOUS les employés ?\n\nLes données seront figées et le solde reporté sur le mois suivant.`)) return
    try {
      for (const emp of data.employes) {
        const r = resultats[emp.id]
        if (r) await validerMois(emp.id, mois, annee, r.synthese, r.journal, user.id)
      }
      setSuccess('✅ Mois validé pour tous les employés.')
    } catch (e) {
      setError('Erreur validation : ' + e.message)
    }
  }

  // Anciens / nouveaux mois
  function prevMonth() {
    if (mois === 1) { setMois(12); setAnnee(annee - 1) }
    else setMois(mois - 1)
  }
  function nextMonth() {
    if (mois === 12) { setMois(1); setAnnee(annee + 1) }
    else setMois(mois + 1)
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap'
      }}>
        <button onClick={prevMonth} style={btnNav}>◀</button>
        <div style={{ minWidth: 160, textAlign: 'center', fontSize: 15, fontWeight: 500, color: '#3A3733' }}>
          {MOIS_FR[mois - 1]} {annee}
        </div>
        <button onClick={nextMonth} style={btnNav}>▶</button>

        <div style={{ display: 'flex', gap: 4, padding: 3, background: '#F4F0EA', borderRadius: 8 }}>
          <button onClick={() => setVueGlobale(false)} style={{
            padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: !vueGlobale ? 'white' : 'transparent',
            color: !vueGlobale ? '#3A3733' : '#6F6A60',
            fontWeight: !vueGlobale ? 500 : 400,
          }}>👤 Un employé</button>
          <button onClick={() => setVueGlobale(true)} style={{
            padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: vueGlobale ? 'white' : 'transparent',
            color: vueGlobale ? '#3A3733' : '#6F6A60',
            fontWeight: vueGlobale ? 500 : 400,
          }}>👥 Tous</button>
        </div>

        {!vueGlobale && (
          <select value={selectedEmpId || ''} onChange={e => setSelectedEmpId(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 200, padding: '8px 11px', fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6 }}>
            {(data?.employes || []).map(e => (
              <option key={e.id} value={e.id}>{e.nom}{e.poste ? ' · ' + e.poste : ''}</option>
            ))}
          </select>
        )}

        <button onClick={handleSync} disabled={syncing} style={{
          padding: '9px 14px', fontSize: 13, background: '#0C447C', color: 'white',
          border: '1px solid #0C447C', borderRadius: 8, cursor: syncing ? 'wait' : 'pointer', fontWeight: 500,
        }}>
          {syncing ? '⏳ Sync...' : '🔄 Sync Odoo'}
        </button>
        <button onClick={handleDebug} style={{
          padding: '9px 12px', fontSize: 12, background: '#F4F0EA', color: '#6F6A60',
          border: '1px solid #E8E2D8', borderRadius: 8, cursor: 'pointer',
        }} title="Voir ce qu'Odoo renvoie">
          🐛 Debug
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', background: '#E8F8F0', color: '#1E7E4F', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {success}
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: '#6F6A60' }}>Chargement…</div>}

      {!loading && vueGlobale && data && (
        <VueGlobale data={data} resultats={resultats} mois={mois} annee={annee} />
      )}

      {!loading && !vueGlobale && result && (
        <>
          {/* Cartes synthèse */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10, marginBottom: 18
          }}>
            <Carte label="Heures prévues"      val={result.synthese.heures_prevues} />
            <Carte label="Heures travaillées"  val={result.synthese.heures_travaillees} />
            <Carte label="Heures sup"          val={result.synthese.heures_sup}      color="#27500A" sign="+" />
            <Carte label="Heures manquantes"   val={result.synthese.heures_manquantes} color="#A32D2D" sign="-" />
            <Carte label="Jours récup"         val={result.synthese.jours_recup}      color="#3C3489" unit="j" />
            <Carte label="Solde reporté"       val={result.synthese.solde_reporte_precedent} color={result.synthese.solde_reporte_precedent < 0 ? '#A32D2D' : '#27500A'} signed />
            <Carte label="Solde du mois"       val={result.synthese.solde_mois}        color={result.synthese.solde_mois < 0 ? '#A32D2D' : '#27500A'} signed bold />
          </div>

          {/* Tableau journal */}
          <JournalTable
            journal={result.journal}
            onEditCell={handleEditCell}
            onEditPointage={handleEditPointage}
          />

          {/* Légende */}
          <Legende />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={handleValider} style={{
              padding: '10px 18px', fontSize: 13, background: '#27500A', color: 'white',
              border: '1px solid #27500A', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
            }}>
              ✅ Valider le mois
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Carte({ label, val, color = '#3A3733', sign = '', unit = 'h', signed = false, bold = false }) {
  let displayVal = ''
  if (signed) displayVal = (val > 0 ? '+' : '') + val.toFixed(2) + unit
  else if (sign && val > 0) displayVal = sign + val.toFixed(2) + unit
  else displayVal = val.toFixed(unit === 'j' ? 2 : 2) + unit

  return (
    <div style={{ background: '#F4F0EA', padding: 10, borderRadius: 8 }}>
      <p style={{ fontSize: 11, color: '#6F6A60', margin: 0, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: bold ? 600 : 500, color, margin: 0 }}>{displayVal}</p>
    </div>
  )
}

function JournalTable({ journal, onEditCell, onEditPointage }) {
  return (
    <div style={{
      background: 'white', borderRadius: 10, border: '1px solid #E8E2D8',
      overflowX: 'auto', marginBottom: 16,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#6F6A60' }}>
            <Th w={70}>Jour</Th>
            <Th>Tranches horaires</Th>
            <Th w={70} align="right">Prévu</Th>
            <Th w={70} align="right">Travail.</Th>
            <Th w={70} align="right">Sup</Th>
            <Th w={70} align="right">Manq.</Th>
            <Th w={70} align="right">Récup</Th>
            <Th w={100}>Statut</Th>
          </tr>
        </thead>
        <tbody>
          {journal.map(j => (
            <Row key={j.date} j={j} onEditCell={onEditCell} onEditPointage={onEditPointage} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ j, onEditCell, onEditPointage }) {
  const c = COULEUR_STATUT[j.statut] || COULEUR_STATUT.normal
  return (
    <tr style={{ borderTop: '1px solid #F4F0EA', background: c.bg }}>
      <Td>{j.jour_semaine} {String(j.jour_num).padStart(2, '0')}</Td>
      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: c.text }}>{j.tranches}</Td>
      <EditableCell value={j.heures_prevues} onChange={v => onEditCell(j.date, 'heures_prevues', v)} align="right" />
      <EditableCell value={j.heures_travaillees} onChange={v => onEditCell(j.date, 'heures_travaillees', v)} align="right" />
      <EditableCell value={j.heures_sup} onChange={v => onEditCell(j.date, 'heures_sup', v)} align="right" color="#27500A" />
      <EditableCell value={j.heures_manquantes} onChange={v => onEditCell(j.date, 'heures_manquantes', v)} align="right" color="#A32D2D" />
      <EditableCell value={j.jours_recup} onChange={v => onEditCell(j.date, 'jours_recup', v)} align="right" color="#3C3489" />
      <Td><span style={{
        fontSize: 10, padding: '2px 6px', borderRadius: 6,
        background: c.text, color: 'white'
      }}>{j.label}</span></Td>
    </tr>
  )
}

function EditableCell({ value, onChange, align = 'left', color = '#3A3733' }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])

  function commit() {
    setEditing(false)
    if (Number(v) !== Number(value)) onChange(v)
  }

  if (editing) {
    return (
      <td style={{ padding: '5px 8px', textAlign: align }}>
        <input
          type="number" step="0.25" value={v}
          onChange={e => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value); setEditing(false) } }}
          autoFocus
          style={{
            width: 60, padding: 2, textAlign: align,
            fontSize: 12, border: '1px solid #993556', borderRadius: 4,
          }}
        />
      </td>
    )
  }

  const display = (value === 0 || value == null) ? '—' : Number(value).toFixed(2)
  return (
    <td onClick={() => setEditing(true)} style={{
      padding: '7px 10px', textAlign: align, color: value > 0 ? color : '#9B968D',
      cursor: 'pointer',
    }}>
      {display}
    </td>
  )
}

function Th({ children, w, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 10px', textAlign: align, fontWeight: 500,
      width: w ? w + 'px' : 'auto',
    }}>
      {children}
    </th>
  )
}

function Td({ children, style = {} }) {
  return <td style={{ padding: '7px 10px', ...style }}>{children}</td>
}

function Legende() {
  const items = [
    { c: 'white',   border: '#E8E2D8', label: 'Journée normale' },
    { c: '#FFF7E0', label: 'Demi-journée' },
    { c: '#F5EFE7', label: 'OFF' },
    { c: '#EEEDFE', label: 'OFF travaillé (récup)' },
    { c: '#EAF3DE', label: 'Férié' },
    { c: '#C0DD97', label: 'Férié travaillé (récup)' },
    { c: '#E6F1FB', label: 'Congé' },
    { c: '#FCEBEB', label: 'Absent / anomalie' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#6F6A60', marginBottom: 16 }}>
      <span style={{ fontWeight: 500 }}>Légende :</span>
      {items.map(i => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 12, height: 12, background: i.c, borderRadius: 3,
            border: '1px solid ' + (i.border || '#E8E2D8'),
          }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}



function VueGlobale({ data, resultats, mois, annee }) {
  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E8E2D8', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#6F6A60' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>Employé</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Prévues</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Travail.</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#27500A' }}>Sup</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#A32D2D' }}>Manq.</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#3C3489' }}>Récup</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Reporté</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Solde mois</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500 }}>Abs.</th>
          </tr>
        </thead>
        <tbody>
          {data.employes.map(emp => {
            const r = resultats[emp.id]
            if (!r) return null
            const s = r.synthese
            return (
              <tr key={emp.id} style={{ borderTop: '1px solid #F4F0EA' }}>
                <td style={{ padding: '8px 12px' }}>
                  <strong style={{ fontSize: 12 }}>{emp.nom}</strong>
                  {emp.poste && <div style={{ fontSize: 10, color: '#9B968D' }}>{emp.poste}</div>}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.heures_prevues.toFixed(2)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.heures_travaillees.toFixed(2)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: s.heures_sup > 0 ? '#27500A' : '#9B968D', fontWeight: s.heures_sup > 0 ? 500 : 400 }}>
                  {s.heures_sup > 0 ? '+' + s.heures_sup.toFixed(2) : '—'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: s.heures_manquantes > 0 ? '#A32D2D' : '#9B968D', fontWeight: s.heures_manquantes > 0 ? 500 : 400 }}>
                  {s.heures_manquantes > 0 ? '-' + s.heures_manquantes.toFixed(2) : '—'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: s.jours_recup > 0 ? '#3C3489' : '#9B968D' }}>
                  {s.jours_recup > 0 ? s.jours_recup.toFixed(2) + ' j' : '—'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: s.solde_reporte_precedent === 0 ? '#9B968D' : (s.solde_reporte_precedent > 0 ? '#27500A' : '#A32D2D') }}>
                  {s.solde_reporte_precedent === 0 ? '—' : (s.solde_reporte_precedent > 0 ? '+' : '') + s.solde_reporte_precedent.toFixed(2)}
                </td>
                <td style={{
                  padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                  color: s.solde_mois === 0 ? '#9B968D' : (s.solde_mois > 0 ? '#27500A' : '#A32D2D'),
                }}>
                  {(s.solde_mois > 0 ? '+' : '') + s.solde_mois.toFixed(2)}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: s.jours_absents > 0 ? '#A32D2D' : '#9B968D' }}>
                  {s.jours_absents > 0 ? s.jours_absents : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const btnNav = {
  padding: '7px 12px', fontSize: 14, background: 'white',
  border: '1px solid #E8E2D8', borderRadius: 6, cursor: 'pointer', color: '#3A3733',
}
