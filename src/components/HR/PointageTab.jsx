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

export default function PointageTab({ user, isAdmin }) {
  const today = new Date()
  const [mois, setMois] = useState(today.getMonth() + 1)
  const [annee, setAnnee] = useState(today.getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selectedEmpId, setSelectedEmpId] = useState(null)
  const [vue, setVue] = useState(isAdmin ? 'single' : 'recup')  // 'single' | 'all' | 'recup' | 'absences'
  const [editingTranches, setEditingTranches] = useState(null)  // { date, sessions } | null

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
      console.log('[DEBUG ODOO]', JSON.stringify(data, null, 2))
      // Construire un résumé lisible
      const lines = [`UID Odoo : ${data.uid_odoo}`, '']
      for (const t of (data.tests || [])) {
        lines.push(`▶ ${t.test}`)
        if (t.periode) lines.push(`  Période : ${t.periode.debut} → ${t.periode.fin}`)
        if (t.error) lines.push(`  ❌ ERREUR : ${t.error}`)
        else if (typeof t.result === 'number') lines.push(`  ✅ ${t.result}`)
        else if (Array.isArray(t.result)) {
          lines.push(`  ✅ ${t.result.length} résultats`)
          for (const r of t.result.slice(0, 3)) {
            lines.push(`    • ${JSON.stringify(r).slice(0, 150)}`)
          }
        }
        lines.push('')
      }
      alert(lines.join('\n'))
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
      console.log('[SYNC ATTENDANCE]', r1)
      console.log('[SYNC LEAVES]', r2)
      let msg = `✅ ${r1.inserted} pointages + ${r2.inserted} congés importés.`
      if (r1.matched_fuzzy && r1.matched_fuzzy.length > 0) {
        msg += `\n🔗 ${r1.matched_fuzzy.length} employé(s) matché(s) par similarité (mémorisés pour les prochaines syncs).`
      }
      if (r1.unmatched > 0) {
        msg += `\n⚠️ ${r1.unmatched_names?.length || 0} employé(s) Odoo non rattaché(s) : ${(r1.unmatched_names || []).slice(0, 5).join(', ')}`
      }
      setSuccess(msg)
      await reload()
    } catch (e) {
      setError('Erreur sync : ' + e.message)
    }
    setSyncing(false)
  }

  // Édition d'une cellule (heures_travaillees, sup, manquantes, recup, statut)
  async function handleEditCell(dateJour, champ, valeur) {
    if (!isAdmin) return
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

  // Sauvegarder les sessions modifiées d'un jour
  async function handleSaveTranches(date, sessions) {
    if (!isAdmin) return
    try {
      const { upsertPointagesDuJour } = await import('../../lib/pointage')
      await upsertPointagesDuJour(selectedEmpId, date, sessions, user.id)
      setEditingTranches(null)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  // ============================================
  // EXPORTS (admin)
  // ============================================

  function downloadCSV(filename, rows) {
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '')
      return s.includes(';') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportSup() {
    if (!data) return
    const rows = [['Employé', 'Heures sup du mois']]
    for (const emp of data.employes) {
      const r = resultats[emp.id]
      if (!r) continue
      // Si heures_sup_mensuelles = false, on met 0 dans l'export
      const sup = emp.heures_sup_mensuelles === false ? 0 : r.synthese.heures_sup
      rows.push([emp.nom, sup.toFixed(2)])
    }
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    downloadCSV('heures_sup_' + monthName + '.csv', rows)
  }

  function handleExportConges() {
    if (!data) return
    const rows = [['Employé', 'Jours congé', 'Jours maladie (4+)']]
    // Pour chaque employé, compter ses jours de congé et maladie ce mois
    for (const emp of data.employes) {
      const congesEmp = data.conges.filter(c => c.employe_id === emp.id)
      let joursConge = 0
      let joursMaladie = 0
      for (const c of congesEmp) {
        // Calcul du nombre de jours dans le mois sélectionné
        const debut = new Date(Math.max(new Date(c.date_debut), new Date(annee, mois - 1, 1)))
        const fin = new Date(Math.min(new Date(c.date_fin), new Date(annee, mois, 0)))
        if (fin < debut) continue
        const nbJours = Math.floor((fin - debut) / 86400000) + 1
        const typeLower = (c.type_conge || '').toLowerCase()
        // Type "maladie" : seulement si > 3 jours (donc 4+)
        if (typeLower.includes('maladie') || typeLower.includes('malade') || typeLower.includes('sick')) {
          if (nbJours >= 4) joursMaladie += nbJours
        } else if (typeLower.includes('récup') || typeLower.includes('recup')) {
          // Exclure les jours de récup
          continue
        } else {
          // Tout le reste = congé
          joursConge += nbJours
        }
      }
      if (joursConge > 0 || joursMaladie > 0) {
        rows.push([emp.nom, joursConge, joursMaladie])
      }
    }
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    downloadCSV('conges_' + monthName + '.csv', rows)
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

        <div style={{ display: 'flex', gap: 4, padding: 3, background: '#F4F0EA', borderRadius: 8, flexWrap: 'wrap' }}>
          {(isAdmin
            ? [
                { v: 'single', label: '👤 Un employé' },
                { v: 'all', label: '👥 Tous' },
                { v: 'recup', label: '🟣 Récup & Absences' },
              ]
            : [
                { v: 'recup', label: '🟣 Récup & Absences' },
              ]
          ).map(t => (
            <button key={t.v} onClick={() => setVue(t.v)} style={{
              padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: vue === t.v ? 'white' : 'transparent',
              color: vue === t.v ? '#3A3733' : '#6F6A60',
              fontWeight: vue === t.v ? 500 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        {vue === 'single' && (
          <select value={selectedEmpId || ''} onChange={e => setSelectedEmpId(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 200, padding: '8px 11px', fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6 }}>
            {(data?.employes || []).map(e => (
              <option key={e.id} value={e.id}>{e.nom}{e.poste ? ' · ' + e.poste : ''}</option>
            ))}
          </select>
        )}

        {isAdmin && (
          <>
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
          </>
        )}
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

      {!loading && vue === 'all' && data && isAdmin && (
        <>
          <VueGlobale data={data} resultats={resultats} mois={mois} annee={annee} isAdmin={isAdmin} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={handleExportSup} style={btnExport}>📥 Export heures sup</button>
            <button onClick={handleExportConges} style={btnExport}>📥 Export congés</button>
            <button onClick={handleValider} style={btnPrimaryGreen}>✅ Valider le mois</button>
          </div>
        </>
      )}

      {!loading && vue === 'recup' && data && (
        <>
          <VueRecup data={data} resultats={resultats} mois={mois} annee={annee} />
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={handleExportSup} style={btnExport}>📥 Export heures sup</button>
              <button onClick={handleExportConges} style={btnExport}>📥 Export congés</button>
            </div>
          )}
        </>
      )}



      {!loading && vue === 'single' && result && isAdmin && (
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
            onEditTranches={setEditingTranches}
          />

          {/* Légende */}
          <Legende />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            {isAdmin && (
              <>
                <button onClick={handleExportSup} style={{
                  padding: '10px 16px', fontSize: 13, background: '#F4F0EA', color: '#3A3733',
                  border: '1px solid #E8E2D8', borderRadius: 8, cursor: 'pointer',
                }}>
                  📥 Export heures sup
                </button>
                <button onClick={handleExportConges} style={{
                  padding: '10px 16px', fontSize: 13, background: '#F4F0EA', color: '#3A3733',
                  border: '1px solid #E8E2D8', borderRadius: 8, cursor: 'pointer',
                }}>
                  📥 Export congés
                </button>
                <button onClick={handleValider} style={{
                  padding: '10px 18px', fontSize: 13, background: '#27500A', color: 'white',
                  border: '1px solid #27500A', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
                }}>
                  ✅ Valider le mois
                </button>
              </>
            )}
          </div>
        </>
      )}

      {editingTranches && (
        <TranchesEditModal
          data={editingTranches}
          onClose={() => setEditingTranches(null)}
          onSave={handleSaveTranches}
        />
      )}
    </div>
  )
}

// Modal pour éditer les tranches horaires d'un jour
function TranchesEditModal({ data, onClose, onSave }) {
  const { date, sessions: initSessions } = data
  // Convertir sessions en format éditable : [{ arrivee_hm, depart_hm }, ...]
  const [sessions, setSessions] = useState(() => {
    if (!initSessions || initSessions.length === 0) return [{ arrivee_hm: '', depart_hm: '' }]
    return initSessions.map(s => ({
      id: s.id,
      arrivee_hm: s.arrivee ? new Date(s.arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      depart_hm:  s.depart  ? new Date(s.depart).toLocaleTimeString('fr-FR',  { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    }))
  })

  function update(i, field, value) {
    setSessions(s => s.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }
  function add() {
    setSessions(s => [...s, { arrivee_hm: '', depart_hm: '' }])
  }
  function remove(i) {
    setSessions(s => s.filter((_, idx) => idx !== i))
  }

  function save() {
    // Convertir hm en datetime (date du jour + heure)
    const final = sessions
      .filter(s => s.arrivee_hm || s.depart_hm)
      .map(s => {
        const arrivee = s.arrivee_hm ? `${date}T${s.arrivee_hm}:00` : null
        const depart  = s.depart_hm  ? `${date}T${s.depart_hm}:00`  : null
        return { id: s.id, arrivee, depart }
      })
    onSave(date, final)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 10, padding: 20, maxWidth: 500, width: '100%' }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 15, color: '#3A3733' }}>
          ✏️ Modifier les pointages du {date}
        </h3>
        <p style={{ fontSize: 12, color: '#6F6A60', marginTop: 0, marginBottom: 14 }}>
          Chaque ligne = 1 session (arrivée → départ). Format HH:MM.
        </p>

        {sessions.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input type="time" value={s.arrivee_hm} onChange={e => update(i, 'arrivee_hm', e.target.value)}
                   placeholder="Arrivée" style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6 }} />
            <input type="time" value={s.depart_hm} onChange={e => update(i, 'depart_hm', e.target.value)}
                   placeholder="Départ" style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #E8E2D8', borderRadius: 6 }} />
            <button onClick={() => remove(i)} style={{ padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#A32D2D' }}>🗑</button>
          </div>
        ))}

        <button onClick={add} style={{ marginTop: 4, padding: '7px 14px', fontSize: 12, background: '#F4F0EA', border: '1px solid #E8E2D8', borderRadius: 6, cursor: 'pointer' }}>
          ➕ Ajouter une session
        </button>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', fontSize: 13, background: 'white', border: '1px solid #E8E2D8', borderRadius: 8, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} style={{ padding: '9px 16px', fontSize: 13, background: '#993556', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
            💾 Enregistrer
          </button>
        </div>
      </div>
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

function JournalTable({ journal, onEditCell, onEditPointage, onEditTranches }) {
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
            <Row key={j.date} j={j} onEditCell={onEditCell} onEditPointage={onEditPointage} onEditTranches={onEditTranches} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ j, onEditCell, onEditPointage, onEditTranches }) {
  const c = COULEUR_STATUT[j.statut] || COULEUR_STATUT.normal
  return (
    <tr style={{ borderTop: '1px solid #F4F0EA', background: c.bg }}>
      <Td>{j.jour_semaine} {String(j.jour_num).padStart(2, '0')}</Td>
      <Td onClick={() => onEditTranches({ date: j.date, sessions: j.sessions || [], statut: j.statut })} style={{ fontFamily: 'monospace', fontSize: 11, color: c.text, cursor: 'pointer' }} title="Cliquer pour modifier les pointages">{j.tranches}</Td>
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







function VueRecup({ data, resultats, mois, annee }) {
  // Collecter TOUS les événements (récup + absences) de tous les employés
  // puis trier chronologiquement et grouper par date
  const evenements = []
  for (const emp of data.employes) {
    const r = resultats[emp.id]
    if (!r) continue
    for (const j of r.journal) {
      if (j.jours_recup > 0) {
        evenements.push({ type: 'recup', emp, jour: j, date: j.date })
      } else if (j.statut === 'absent') {
        evenements.push({ type: 'absent', emp, jour: j, date: j.date })
      }
    }
  }

  // Tri chronologique
  evenements.sort((a, b) => a.date.localeCompare(b.date))

  if (evenements.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#6F6A60',
        background: '#F9F6F1', borderRadius: 10, fontSize: 13,
      }}>
        Aucune récup ni absence ce mois-ci 🌸
      </div>
    )
  }

  // Stats résumé
  const nbRecup = evenements.filter(e => e.type === 'recup').length
  const totalJoursRecup = evenements
    .filter(e => e.type === 'recup')
    .reduce((sum, e) => sum + e.jour.jours_recup, 0)
  const nbAbsences = evenements.filter(e => e.type === 'absent').length

  // Grouper par date
  const parDate = new Map()
  for (const ev of evenements) {
    if (!parDate.has(ev.date)) parDate.set(ev.date, [])
    parDate.get(ev.date).push(ev)
  }

  return (
    <div>
      {/* Bandeaux de résumé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{
          background: '#EEEDFE', padding: 12, borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#3C3489' }}>🟣 Récup ({nbRecup})</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#3C3489' }}>{totalJoursRecup.toFixed(2)} j</span>
        </div>
        <div style={{
          background: '#FCEBEB', padding: 12, borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#A32D2D' }}>🔴 Absences</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#A32D2D' }}>{nbAbsences} jour{nbAbsences > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Liste chronologique groupée par date */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E8E2D8', overflow: 'hidden' }}>
        {Array.from(parDate.entries()).map(([date, evs]) => {
          const d = new Date(date)
          const joursFR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
          const moisFR = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
          const dateLabel = `${joursFR[d.getDay()]} ${d.getDate()} ${moisFR[d.getMonth()]}`
          return (
            <div key={date} style={{ borderBottom: '1px solid #F4F0EA' }}>
              <div style={{
                padding: '8px 14px', background: '#FAFAF7',
                fontSize: 12, fontWeight: 500, color: '#3A3733',
              }}>
                {dateLabel}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {evs.map((ev, i) => {
                    const isRecup = ev.type === 'recup'
                    const bgRow = isRecup ? '#FBFAFE' : '#FFF8F7'
                    return (
                      <tr key={i} style={{ background: bgRow, borderTop: i > 0 ? '1px solid #F4F0EA' : 'none' }}>
                        <td style={{ padding: '7px 14px', width: 30 }}>
                          {isRecup ? '🟣' : '🔴'}
                        </td>
                        <td style={{ padding: '7px 8px', minWidth: 140 }}>
                          <strong style={{ fontSize: 12 }}>{ev.emp.nom}</strong>
                          {ev.emp.poste && <span style={{ fontSize: 10, color: '#9B968D', marginLeft: 6 }}>· {ev.emp.poste}</span>}
                        </td>
                        <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#6F6A60' }}>
                          {isRecup ? ev.jour.tranches : '—'}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 11, color: '#6F6A60' }}>
                          {isRecup
                            ? `${ev.jour.heures_travaillees.toFixed(2)}h travaillées`
                            : `${ev.jour.heures_prevues.toFixed(2)}h prévues`}
                        </td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', width: 130 }}>
                          {isRecup ? (
                            <span style={{ fontSize: 11, fontWeight: 500, color: '#3C3489', background: '#EEEDFE', padding: '3px 8px', borderRadius: 999 }}>
                              +{ev.jour.jours_recup.toFixed(2)} j récup
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 500, color: '#A32D2D', background: '#FCEBEB', padding: '3px 8px', borderRadius: 999 }}>
                              -{ev.jour.heures_manquantes.toFixed(2)}h
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
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

const btnExport = {
  padding: '10px 16px', fontSize: 13, background: '#F4F0EA', color: '#3A3733',
  border: '1px solid #E8E2D8', borderRadius: 8, cursor: 'pointer',
}

const btnPrimaryGreen = {
  padding: '10px 18px', fontSize: 13, background: '#27500A', color: 'white',
  border: '1px solid #27500A', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
}
