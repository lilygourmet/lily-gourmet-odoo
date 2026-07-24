import { useState, useEffect, useMemo } from 'react'
import { CheckCircle2, XCircle, Users, AlertTriangle, Clock, Save, Download } from 'lucide-react'
import { loadEmployes } from '../../lib/hr'
import { loadBulletinsForPeriod } from '../../lib/bulletins'
import { supabase } from '../../lib/supabase'
import { genererOrdreVirementPDF } from '../../lib/ordreVirementPdf'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

export default function SalairesTab({ user }) {
  const today = new Date()
  // Par défaut on ouvre le MOIS PRÉCÉDENT : le salaire du mois en cours ne sort
  // qu'à la fin du mois (ex. début juillet → on travaille sur juin).
  const cm = today.getMonth()   // 0-based (juillet = 6)
  const [mois, setMois] = useState(cm === 0 ? 12 : cm)               // 1-based du mois précédent
  const [annee, setAnnee] = useState(cm === 0 ? today.getFullYear() - 1 : today.getFullYear())
  const [employes, setEmployes] = useState([])
  const [societes, setSocietes] = useState([])
  const [montants, setMontants] = useState({})  // { empId: montant }
  const [notes, setNotes] = useState({})        // { empId: note }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [societeFilter, setSocieteFilter] = useState('LN')  // 'LG' | 'LN'
  const [declareFilter, setDeclareFilter] = useState('declare')  // 'declare' | 'non_declare' | 'tous'

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        // Charger TOUS les employés actifs (déclarés + non déclarés)
        const all = await loadEmployes(true)
        setEmployes(all)

        // Charger sociétés
        const { data: socs } = await supabase.from('societes').select('*').order('code')
        setSocietes(socs || [])

        // Charger les salaires déjà saisis pour ce mois
        const { data: salaires } = await supabase
          .from('salaires_mois')
          .select('employe_id, montant, note')
          .eq('mois', mois)
          .eq('annee', annee)
        const mObj = {}, nObj = {}
        if (salaires) {
          for (const s of salaires) {
            mObj[s.employe_id] = String(s.montant)
            if (s.note) nObj[s.employe_id] = s.note
          }
        }
        // Net issu des bulletins du mois (lien par CNSS puis par nom)
        const period = `${annee}-${String(mois).padStart(2, '0')}`
        const normCnss = v => String(v || '').replace(/\D/g, '')
        const nameKey = v => String(v || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Z]+/).filter(w => w.length > 1).sort().join(' ')
        const byCnss = {}, byName = {}
        try {
          const bulletins = await loadBulletinsForPeriod(period)
          for (const b of bulletins) {
            if (b.net_amount == null) continue
            if (b.cnss) byCnss[normCnss(b.cnss)] = b.net_amount
            const k = nameKey(b.label)
            if (k) byName[k] = b.net_amount
          }
        } catch (_) { /* pas bloquant */ }
        // Le bulletin du mois fait foi : s'il existe un net pour l'employé (par
        // CNSS puis par nom), il REMPLACE le montant déjà saisi. Sinon on garde
        // ce qui est en base (employé sans bulletin).
        for (const e of all) {
          const fromBulletin = byCnss[normCnss(e.cnss)] ?? byName[nameKey(e.nom)]
          if (fromBulletin != null) mObj[e.id] = String(fromBulletin)
        }
        setMontants(mObj)
        setNotes(nObj)
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    })()
  }, [mois, annee])

  function prevMonth() {
    if (mois === 1) { setMois(12); setAnnee(annee - 1) }
    else setMois(mois - 1)
  }
  function nextMonth() {
    if (mois === 12) { setMois(1); setAnnee(annee + 1) }
    else setMois(mois + 1)
  }

  // Filtrer employés : société + statut déclaré
  const employesSociete = useMemo(() => {
    return employes.filter(e => {
      // Filtre société
      if (e.societe?.code !== societeFilter) return false
      // Filtre déclaré
      if (declareFilter === 'declare' && e.declare !== true) return false
      if (declareFilter === 'non_declare' && e.declare === true) return false
      return true
    })
  }, [employes, societeFilter, declareFilter])

  // Total à virer
  const totalMontants = useMemo(() => {
    return employesSociete.reduce((sum, e) => sum + (parseFloat(montants[e.id]) || 0), 0)
  }, [employesSociete, montants])

  // Comptes pour les stats / badges
  const nbDeclaresSociete = useMemo(
    () => employes.filter(e => e.societe?.code === societeFilter && e.declare === true).length,
    [employes, societeFilter]
  )
  const nbNonDeclaresSociete = useMemo(
    () => employes.filter(e => e.societe?.code === societeFilter && e.declare !== true).length,
    [employes, societeFilter]
  )

  async function handleSauvegarder({ silent = false } = {}) {
    if (!silent) { setSaving(true); setError(null); setSuccess(null) }
    try {
      // Upsert tous les montants saisis pour le mois (toutes sociétés confondues)
      const rows = []
      for (const e of employes) {
        const m = parseFloat(montants[e.id])
        if (m > 0) {
          rows.push({
            employe_id: e.id,
            mois,
            annee,
            montant: m,
            note: notes[e.id] || null,
            created_by: user.id,
          })
        }
      }
      if (rows.length === 0) {
        if (!silent) setError('Aucun montant à sauvegarder')
        if (!silent) setSaving(false)
        return false
      }
      const { error: err } = await supabase
        .from('salaires_mois')
        .upsert(rows, { onConflict: 'employe_id,mois,annee' })
      if (err) throw err
      if (!silent) {
        setSuccess(`✅ ${rows.length} salaire(s) sauvegardé(s) pour ${MOIS_FR[mois - 1]} ${annee}`)
        setTimeout(() => setSuccess(null), 4000)
      }
      return true
    } catch (e) {
      if (!silent) setError('Erreur sauvegarde : ' + e.message)
      else throw e
      return false
    } finally {
      if (!silent) setSaving(false)
    }
  }

  async function handleGenererPDF() {
    if (employesSociete.length === 0) { setError('Aucun employé déclaré pour cette société'); return }
    const validEmp = employesSociete.filter(e => parseFloat(montants[e.id]) > 0)
    if (validEmp.length === 0) { setError('Aucun montant saisi'); return }

    // Bloc : pas d'ordre de virement si un RIB manque (sinon virement invalide envoyé à la banque)
    const sansRib = validEmp.filter(e => !e.rib || !String(e.rib).trim())
    if (sansRib.length > 0) {
      setError(`RIB manquant pour : ${sansRib.map(e => e.nom).join(', ')}. Complète le RIB (onglet Employés) avant de générer l'ordre de virement.`)
      return
    }

    setGenerating(true); setError(null); setSuccess(null)
    try {
      // 1) Sauvegarde silencieuse
      await handleSauvegarder({ silent: true })

      // 2) Récupération des infos société
      const societe = societes.find(s => s.code === societeFilter)
      if (!societe) throw new Error('Société introuvable')

      const societeData = {
        nom: societe.nom || (societeFilter === 'LG' ? 'LG Traiteur' : 'L&N Gourmet'),
        nom_complet: societe.nom_complet || societe.nom || (societeFilter === 'LG' ? 'LG Traiteur SARL' : 'L&N Gourmet SARL'),
        capital: societe.capital || '',
        adresse: societe.adresse || '',
        rc: societe.rc || '',
        patente: societe.patente || '',
        if_num: societe.if_num || societe.if || '',
        cnss: societe.cnss || '',
        ice: societe.ice || '',
        compte_bancaire: societe.compte_bancaire || '___________________',
        banque_societe: societe.banque_societe || societe.banque_source || '',
      }

      // 3) Liste des employés pour le PDF
      const employesData = validEmp.map(e => ({
        nom: e.nom,
        montant: parseFloat(montants[e.id]),
        banque: e.banque || '—',
        rib: e.rib,
      }))

      // 4) Génération PDF (le fichier est téléchargé directement)
      await genererOrdreVirementPDF({
        societe: societeData,
        employes: employesData,
        date: new Date(annee, mois - 1, today.getDate()),
      })

      setSuccess(`✅ PDF généré : Ordre de virement ${societeData.nom} ${MOIS_FR[mois - 1]} ${annee}`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError('Erreur génération : ' + (e.message || e))
    }
    setGenerating(false)
  }

  return (
    <div>
      {/* Header avec sélecteur mois + filtre société */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap',
        padding: '12px 14px', background: '#F4F0EA', borderRadius: 12,
      }}>
        <button onClick={prevMonth} style={btnNav}>◀</button>
        <span style={{ fontSize: 16, fontWeight: 500, minWidth: 140 }}>{MOIS_FR[mois - 1]} {annee}</span>
        <button onClick={nextMonth} style={btnNav}>▶</button>

        <div style={{ flex: 1 }} />

        {/* Filtre société (= société du document à générer) */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'white', borderRadius: 8 }}>
          {[
            { v: 'LN', label: 'L&N Gourmet' },
            { v: 'LG', label: 'LG Traiteur' },
          ].map(t => (
            <button key={t.v} onClick={() => setSocieteFilter(t.v)} style={{
              padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: societeFilter === t.v ? '#993556' : 'transparent',
              color: societeFilter === t.v ? 'white' : '#4a3a30',
              fontWeight: societeFilter === t.v ? 500 : 400,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Filtre déclarés / non déclarés / tous */}
      <div style={{
        display: 'flex', gap: 4, padding: 3, background: '#F9F6F1', borderRadius: 8,
        marginBottom: 14, width: 'fit-content',
      }}>
        {[
          { v: 'declare',     label: `Déclarés (${nbDeclaresSociete})`,        bg: '#27500A', Icon: CheckCircle2 },
          { v: 'non_declare', label: `Non déclarés (${nbNonDeclaresSociete})`, bg: '#A32D2D', Icon: XCircle },
          { v: 'tous',        label: `Tous (${nbDeclaresSociete + nbNonDeclaresSociete})`, bg: '#1a0f0a', Icon: Users },
        ].map(t => (
          <button key={t.v} onClick={() => setDeclareFilter(t.v)} style={{
            padding: '7px 14px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: declareFilter === t.v ? t.bg : 'transparent',
            color: declareFilter === t.v ? 'white' : '#4a3a30',
            fontWeight: declareFilter === t.v ? 500 : 400,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><t.Icon size={14} /> {t.label}</button>
        ))}
      </div>

      {/* Messages */}
      {success && (
        <div style={{ padding: '10px 14px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {success}
        </div>
      )}
      {error && (
        <div style={{ padding: '10px 14px', background: '#FCEEE8', color: '#A32D2D', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Stats top */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10, marginBottom: 14,
      }}>
        <Carte
          label={`${declareFilter === 'declare' ? 'Déclarés' : declareFilter === 'non_declare' ? 'Non déclarés' : 'Tous'} ${societeFilter}`}
          Icon={declareFilter === 'declare' ? CheckCircle2 : declareFilter === 'non_declare' ? XCircle : Users}
          val={employesSociete.length}
          unit=""
        />
        <Carte label="Total à virer" val={totalMontants} unit="dh" color="#27500A" />
        <Carte label={`Total déclarés ${societeFilter}`} val={nbDeclaresSociete} unit="" />
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>
      ) : employesSociete.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: '#4a3a30',
          background: '#F9F6F1', borderRadius: 12, fontSize: 13,
        }}>
          {declareFilter === 'declare'
            ? `Aucun employé déclaré dans ${societeFilter === 'LG' ? 'LG Traiteur' : 'L&N Gourmet'} 🌸`
            : declareFilter === 'non_declare'
            ? `Aucun employé non déclaré dans ${societeFilter === 'LG' ? 'LG Traiteur' : 'L&N Gourmet'}`
            : `Aucun employé dans ${societeFilter === 'LG' ? 'LG Traiteur' : 'L&N Gourmet'}`}
          <br />
          <span style={{ fontSize: 11, color: '#8a7a70' }}>
            {declareFilter === 'declare' && 'Coche "Déclaré" dans la fiche employé pour qu\'il apparaisse ici.'}
          </span>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5d8c3', overflow: 'hidden', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F4F0EA' }}>
                <th style={thStyle}>Employé</th>
                <th style={thStyle}>Banque</th>
                <th style={thStyle}>RIB</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Montant (dh)</th>
              </tr>
            </thead>
            <tbody>
              {employesSociete.map(e => (
                <tr key={e.id} style={{
                  borderTop: '1px solid #F4F0EA',
                  background: e.declare ? 'transparent' : '#FFFBF5',
                }}>
                  <td style={{ padding: '10px 12px' }}>
                    <strong>{e.nom}</strong>
                    {e.declare ? (
                      <span style={{
                        marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: '#EAF3DE', color: '#27500A',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}><CheckCircle2 size={12} /> Déclaré</span>
                    ) : (
                      <span style={{
                        marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: '#FCEEE8', color: '#A32D2D',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}><XCircle size={12} /> Non déclaré</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#4a3a30', fontSize: 12 }}>{e.banque || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#4a3a30', fontSize: 11, fontFamily: 'monospace' }}>
                    {e.rib || <span style={{ color: '#A32D2D', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Manquant</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={montants[e.id] || ''}
                      onChange={ev => setMontants(m => ({ ...m, [e.id]: ev.target.value }))}
                      placeholder="0"
                      style={{
                        width: 110, padding: '6px 10px', fontSize: 13, textAlign: 'right',
                        border: '1px solid #e5d8c3', borderRadius: 6,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {/* Total */}
              <tr style={{ borderTop: '2px solid #993556', background: '#F9F6F1', fontWeight: 600 }}>
                <td style={{ padding: '12px' }} colSpan={3}>TOTAL {employesSociete.length} employé(s)</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#27500A' }}>
                  {totalMontants.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} dh
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {!loading && employesSociete.length > 0 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={() => handleSauvegarder()} disabled={saving} style={{
            padding: '10px 18px', fontSize: 13, background: '#F4F0EA', color: '#1a0f0a',
            border: '1px solid #e5d8c3', borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {saving ? <><Clock size={14} /> ...</> : <><Save size={14} /> Sauvegarder</>}
          </button>
          <button onClick={handleGenererPDF} disabled={generating} style={{
            padding: '10px 18px', fontSize: 13, background: '#993556', color: 'white',
            border: '1px solid #993556', borderRadius: 8, cursor: generating ? 'wait' : 'pointer',
            fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {generating ? <><Clock size={14} /> Génération...</> : <><Download size={14} /> Générer ordre de virement (.pdf)</>}
          </button>
        </div>
      )}
    </div>
  )
}

function Carte({ label, val, unit, color = '#1a0f0a', Icon = null }) {
  return (
    <div style={{ background: 'white', padding: 12, borderRadius: 12, border: '1px solid #e5d8c3', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
      <p style={{ fontSize: 11, color: '#4a3a30', margin: 0, marginBottom: 3, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={14} />} {label}
      </p>
      <p style={{ fontSize: 18, fontWeight: 600, color, margin: 0 }}>
        {typeof val === 'number' ? val.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : val}
        {unit && <span style={{ fontSize: 11, color: '#8a7a70', marginLeft: 4 }}>{unit}</span>}
      </p>
    </div>
  )
}

const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#4a3a30' }
const btnNav = { padding: '6px 12px', fontSize: 14, background: 'white', border: '1px solid #e5d8c3', borderRadius: 6, cursor: 'pointer' }
