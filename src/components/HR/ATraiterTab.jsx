import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Clock, Send } from 'lucide-react'
import { loadATraiter, traiterAbsence, traiterOubliPointage, ignorerAbsence, validerRecup, refuserRecup, loadOublisRecup, creerRecupOubliee, ignorerOubliRecup } from '../../lib/aTraiter'
import { uploadJustificatif, dispoTypeConge } from '../../lib/conges'
import { toast } from '../../lib/toast'

// Mêmes types qu'une demande de congé classique (cf. CongesView.jsx), sauf
// 'recup' qui a sa propre section ci-dessous. + 'oubli' = la personne a pointé.
const CLASSIFS = [
  { v: 'annuel',         label: 'Congé annuel' },
  { v: 'maladie_courte', label: 'Congé maladie ≤ 3 j' },
  { v: 'maladie_longue', label: 'Congé maladie > 3 j' },
  { v: 'recup',          label: 'Récupération' },
  { v: 'mariage',        label: 'Mariage' },
  { v: 'naissance',      label: 'Naissance' },
  { v: 'deces',          label: 'Décès' },
  { v: 'circoncision',   label: 'Circoncision' },
  { v: 'maternite',      label: 'Congé maternité' },
  { v: 'sans solde',     label: 'Sans solde' },
  { v: 'oubli',          label: 'Oubli de pointage (présent)' },
  { v: 'ancien_jour_off', label: 'Ancien jour off (planning changé)' },
  { v: 'deja_traite',    label: 'Déjà traité dans un autre congé' },
]

// Types soumis à un solde/allocation : proposés UNIQUEMENT s'ils sont disponibles
// pour l'employé (dispoTypeConge renvoie undefined sinon).
const LIMITED = ['mariage', 'naissance', 'deces', 'circoncision', 'maternite', 'recup']

// Classifications « sans suite » : ne créent AUCUN congé (pas de dates, pas de
// justificatif, pas de solde) — l'absence est juste retirée de la liste.
const SANS_SUITE = ['oubli', 'ancien_jour_off', 'deja_traite']

// Nombre de jours calendaires entre 2 dates (incluses).
function nbJours(d1, d2) {
  return Math.floor((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000) + 1
}

const fmtJour = ymd => (ymd ? ymd.split('-').reverse().join('/') : '')

// Barre « tout sélectionner » + bouton d'action groupée, au-dessus d'une section.
function BarreSelection({ rows, prefix, sel, onToggleAll, nb, busy, onRun, libelle, couleur }) {
  const tousCoches = rows.length > 0 && rows.every(x => sel.has(`${prefix}${x.employe_id}|${x.date}`))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: '#4a3a30', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
        <input type="checkbox" checked={tousCoches} onChange={onToggleAll} style={{ cursor: 'pointer' }} />
        Tout sélectionner
      </label>
      {nb > 0 && (
        <>
          <span style={{ fontSize: 12, color: '#4a3a30' }}>{nb} sélectionnée{nb > 1 ? 's' : ''}</span>
          <button onClick={onRun} disabled={busy}
            style={{ padding: '7px 14px', fontSize: 13, background: couleur, color: 'white', border: 'none', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {busy ? '…' : `${libelle} (${nb})`}
          </button>
        </>
      )}
    </div>
  )
}

export default function ATraiterTab({ user, onChange }) {
  const [data, setData] = useState({ absences: [], recups: [] })
  // Récups « traitées » avant le 18/08/2026 dont le jour n'a jamais été crédité
  const [oublis, setOublis] = useState([])
  const [oubliJours, setOubliJours] = useState({})   // { 'empId|date': '1' | '0.5' }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyKey, setBusyKey] = useState('')
  // état par ligne : { 'empId|date': { classification, raison } }
  const [form, setForm] = useState({})
  // fichier justificatif par ligne : { 'empId|date': File }
  const [files, setFiles] = useState({})
  // lignes cochées pour un traitement groupé : clés 'a:empId|date' / 'r:empId|date'
  const [sel, setSel] = useState(() => new Set())

  async function reload() {
    setLoading(true); setErr('')
    try {
      const [d, o] = await Promise.all([loadATraiter(), loadOublisRecup()])
      setData(d)
      setOublis(o)
      setSel(new Set())
      onChange?.(d.absences.length + d.recups.length)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  // Chargement initial (sans setState synchrone dans le corps de l'effet)
  useEffect(() => {
    let cancelled = false
    Promise.all([loadATraiter(), loadOublisRecup()])
      .then(([d, o]) => { if (!cancelled) { setData(d); setOublis(o); onChange?.(d.absences.length + d.recups.length) } })
      .catch(e => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setField = (key, field, value) =>
    setForm(f => ({ ...f, [key]: { ...f[key], [field]: value } }))

  const toggleSel = key => setSel(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  // Coche / décoche toute une section d'un coup
  const toggleAll = (prefix, rows) => setSel(prev => {
    const next = new Set(prev)
    const keys = rows.map(x => `${prefix}${x.employe_id}|${x.date}`)
    const tousCoches = keys.every(k => next.has(k))
    keys.forEach(k => (tousCoches ? next.delete(k) : next.add(k)))
    return next
  })
  const selectionOf = (prefix, rows) => rows.filter(x => sel.has(`${prefix}${x.employe_id}|${x.date}`))

  // Traite UNE absence avec les réglages de sa ligne. Lève une erreur si le
  // solde ne suffit pas ou si les dates sont incohérentes (pas de setErr ici :
  // l'appelant décide quoi en faire, seul ou en traitement groupé).
  async function processAbsence(a) {
    const key = `${a.employe_id}|${a.date}`
    const f = form[key] || {}
    const classification = f.classification || 'annuel'
    if (classification === 'oubli') {
      await traiterOubliPointage({ employe_id: a.employe_id, date: a.date, heures_prevues: a.heures_prevues, userId: user.id })
      return 'oubli'
    }
    if (classification === 'ancien_jour_off' || classification === 'deja_traite') {
      // Classer sans suite : aucune demande de congé, aucun ajustement de pointage.
      await ignorerAbsence({ employe_id: a.employe_id, date: a.date, raison: classification, userId: user.id })
      return 'sans_suite'
    }
    const date_debut = f.date_debut || a.date
    const date_fin = f.date_fin || a.date
    if (date_fin < date_debut) throw new Error(`${a.nom} : la date de fin est avant la date de début.`)
    const dispo = dispoTypeConge(a.solde, classification)
    if (typeof dispo === 'number' && nbJours(date_debut, date_fin) > dispo) {
      const lbl = CLASSIFS.find(c => c.v === classification)?.label || classification
      throw new Error(`Solde « ${lbl} » épuisé (${dispo} j dispo) pour ${a.nom}. Choisis un autre type.`)
    }
    let justificatif_path = null
    if (files[key]) justificatif_path = await uploadJustificatif(files[key], user.id)
    await traiterAbsence({ employe_id: a.employe_id, date_debut, date_fin, classification, raison: f.raison || null, userId: user.id, justificatif_path })
    return 'conge'
  }

  async function handleAbsence(a) {
    const key = `${a.employe_id}|${a.date}`
    setBusyKey(key); setErr('')
    try {
      const kind = await processAbsence(a)
      await reload()
      toast.success(
        kind === 'oubli' ? `${a.nom} marqué présent ✓`
          : kind === 'sans_suite' ? `Absence classée sans suite ✓`
          : `${a.nom} envoyé en validation ✓`
      )
    } catch (e) { setErr(e.message); toast.error(e.message || 'Échec') }
    finally { setBusyKey('') }
  }

  // La raison est facultative : on peut valider une récup sans l'écrire (elle est juste enregistrée si remplie).
  async function processRecup(r, action) {
    const key = `${r.employe_id}|${r.date}`
    const f = form[key] || {}
    const args = { employe_id: r.employe_id, date: r.date, jours: r.jours, label: r.label, raison: (f.raison || '').trim() || null, userId: user.id }
    if (action === 'valider') await validerRecup(args)
    else await refuserRecup(args)
  }

  async function handleRecup(r, action) {
    const key = `${r.employe_id}|${r.date}`
    setBusyKey(key); setErr('')
    try {
      await processRecup(r, action)
      toast.success(action === 'valider' ? `Récup de ${r.nom} validée ✓` : `Récup de ${r.nom} refusée`)
      await reload()
    } catch (e) { setErr(e.message); toast.error(e.message || 'Échec') }
    finally { setBusyKey('') }
  }

  async function handleOubli(o, action) {
    const key = `oubli:${o.employe_id}|${o.date}`
    setBusyKey(key); setErr('')
    try {
      if (action === 'creer') {
        const jours = Number(oubliJours[`${o.employe_id}|${o.date}`] || 1)
        await creerRecupOubliee({ employe_id: o.employe_id, date: o.date, jours, raison: o.raison, userId: user.id })
        toast.success(`${jours} j crédité${jours > 1 ? 's' : ''} à ${o.nom} ✓`)
      } else {
        await ignorerOubliRecup({ employe_id: o.employe_id, date: o.date, userId: user.id })
        toast.success('Journée laissée telle quelle')
      }
      await reload()
    } catch (e) { setErr(e.message); toast.error(e.message || 'Échec') }
    finally { setBusyKey('') }
  }

  // Traitement groupé : on enchaîne les lignes cochées une par une et on
  // rapporte ce qui n'est pas passé, sans bloquer le reste.
  async function handleBulk(kind) {
    const rows = kind === 'abs' ? selectionOf('a:', data.absences) : selectionOf('r:', data.recups)
    if (rows.length === 0) return
    setBusyKey(`bulk-${kind}`); setErr('')
    let ok = 0
    const echecs = []
    for (const row of rows) {
      try {
        if (kind === 'abs') await processAbsence(row)
        else await processRecup(row, 'valider')
        ok++
      } catch (e) { echecs.push(`${row.nom} ${fmtJour(row.date)} — ${e.message}`) }
    }
    await reload()
    setBusyKey('')
    if (ok > 0) toast.success(kind === 'abs' ? `${ok} absence${ok > 1 ? 's' : ''} traitée${ok > 1 ? 's' : ''} ✓` : `${ok} récup${ok > 1 ? 's' : ''} validée${ok > 1 ? 's' : ''} ✓`)
    if (echecs.length > 0) {
      setErr(`${echecs.length} non traitée${echecs.length > 1 ? 's' : ''} : ${echecs.join(' · ')}`)
      toast.error(`${echecs.length} non traitée${echecs.length > 1 ? 's' : ''}`)
    }
  }

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>

  const rien = data.absences.length === 0 && data.recups.length === 0 && oublis.length === 0

  return (
    <div>
      {err && <div style={{ padding: '10px 14px', background: '#FCEEE8', color: '#A32D2D', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {rien && (
        <div style={{ padding: 40, textAlign: 'center', color: '#27500A', background: '#EAF3DE', borderRadius: 12, fontSize: 14, display: 'inline-flex', gap: 8, width: '100%', justifyContent: 'center' }}>
          <CheckCircle2 size={18} /> Rien à traiter 🎉
        </div>
      )}

      {/* OUBLIS : récup traitée mais jamais créditée */}
      {oublis.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#854F0B', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> Traité mais rien enregistré ({oublis.length})
          </div>
          <div style={{ fontSize: 11.5, color: '#8a7a70', marginBottom: 10 }}>
            Ces journées de récup ont été validées mais le jour n'a jamais été crédité (anomalie corrigée le 18/08). Choisis le nombre de jours puis crédite, ou laisse la journée telle quelle.
          </div>
          {oublis.map(o => {
            const key = `${o.employe_id}|${o.date}`
            const busy = busyKey === `oubli:${key}`
            return (
              <div key={key} style={{ background: '#FFFDF6', border: '1px solid #F0D89A', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 170 }}>
                  <strong style={{ fontSize: 14 }}>{o.nom}</strong>
                  <div style={{ fontSize: 12, color: '#854F0B' }}>Le {fmtJour(o.date)}</div>
                </div>
                <span style={{ flex: 1, minWidth: 140, fontSize: 12, color: '#4a3a30', fontStyle: o.raison ? 'normal' : 'italic' }}>
                  {o.raison || 'aucune raison notée'}
                </span>
                <select value={oubliJours[key] || '1'} onChange={e => setOubliJours(j => ({ ...j, [key]: e.target.value }))}
                  style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }}>
                  <option value="1">1 jour</option>
                  <option value="0.5">½ journée</option>
                </select>
                <button onClick={() => handleOubli(o, 'creer')} disabled={busy}
                  style={{ padding: '8px 12px', fontSize: 13, background: '#27500A', color: 'white', border: 'none', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> {busy ? '…' : 'Créditer le jour'}
                </button>
                <button onClick={() => handleOubli(o, 'ignorer')} disabled={busy}
                  style={{ padding: '8px 12px', fontSize: 13, background: 'white', color: '#4a3a30', border: '1px solid #e5d8c3', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer' }}>
                  Laisser ainsi
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ABSENCES */}
      {data.absences.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#A32D2D', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> Absences à justifier ({data.absences.length})
          </div>
          <BarreSelection rows={data.absences} prefix="a:" sel={sel}
            onToggleAll={() => toggleAll('a:', data.absences)}
            nb={selectionOf('a:', data.absences).length} busy={busyKey === 'bulk-abs'}
            onRun={() => handleBulk('abs')} libelle="Envoyer en validation" couleur="#993556" />
          {data.absences.map(a => {
            const key = `${a.employe_id}|${a.date}`
            const f = form[key] || {}
            const classifs = CLASSIFS.filter(c => !LIMITED.includes(c.v) || dispoTypeConge(a.solde, c.v) !== undefined)
            const cls = f.classification || 'annuel'
            const dispoSel = SANS_SUITE.includes(cls) ? null : dispoTypeConge(a.solde, cls)
            const depasse = typeof dispoSel === 'number' && nbJours(f.date_debut || a.date, f.date_fin || a.date) > dispoSel
            return (
              <div key={key} style={{ background: 'white', border: '1px solid #f0d9d2', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={sel.has(`a:${key}`)} onChange={() => toggleSel(`a:${key}`)}
                  style={{ cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ minWidth: 170 }}>
                  <strong style={{ fontSize: 14 }}>{a.nom}</strong>
                  <div style={{ fontSize: 12, color: '#A32D2D' }}>Absent le {a.jour} {fmtJour(a.date)}</div>
                </div>
                <select value={f.classification || 'annuel'} onChange={e => setField(key, 'classification', e.target.value)}
                  style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }}>
                  {classifs.map(c => {
                    const d = dispoTypeConge(a.solde, c.v)
                    return <option key={c.v} value={c.v}>{c.label}{typeof d === 'number' ? ` (${d} j dispo)` : ''}</option>
                  })}
                </select>
                {!SANS_SUITE.includes(cls) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4a3a30' }}>
                    du <input type="date" value={f.date_debut || a.date} onChange={e => setField(key, 'date_debut', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e5d8c3', borderRadius: 8 }} />
                    au <input type="date" value={f.date_fin || a.date} min={f.date_debut || a.date} onChange={e => setField(key, 'date_fin', e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e5d8c3', borderRadius: 8 }} />
                  </span>
                )}
                <input value={f.raison || ''} onChange={e => setField(key, 'raison', e.target.value)}
                  placeholder="Raison (optionnel)"
                  style={{ flex: 1, minWidth: 120, padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
                {!SANS_SUITE.includes(cls) && (
                  <label style={{ fontSize: 11, color: '#4a3a30', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', border: '1px solid #e5d8c3', borderRadius: 8, padding: '6px 8px', background: files[key] ? '#EAF3DE' : 'white' }}
                    title="Joindre un certificat médical / justificatif (PDF ou photo)">
                    📎 {files[key] ? files[key].name.slice(0, 14) : 'Justificatif'}
                    <input type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                      onChange={e => setFiles(fl => ({ ...fl, [key]: e.target.files?.[0] || null }))} />
                  </label>
                )}
                {depasse && <span style={{ fontSize: 11, color: '#A32D2D', fontWeight: 600 }}>Solde épuisé</span>}
                <button onClick={() => handleAbsence(a)} disabled={busyKey === key || depasse}
                  style={{ padding: '8px 14px', fontSize: 13, background: '#993556', color: 'white', border: 'none', borderRadius: 8, cursor: (busyKey === key || depasse) ? 'not-allowed' : 'pointer', opacity: (busyKey === key || depasse) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={13} /> {busyKey === key ? '…' : (cls === 'oubli' ? 'Marquer présent' : (cls === 'ancien_jour_off' || cls === 'deja_traite') ? 'Classer sans suite' : 'Envoyer en validation')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* RÉCUP */}
      {data.recups.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3C3489', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Jours de repos travaillés — récup à documenter ({data.recups.length})
          </div>
          <BarreSelection rows={data.recups} prefix="r:" sel={sel}
            onToggleAll={() => toggleAll('r:', data.recups)}
            nb={selectionOf('r:', data.recups).length} busy={busyKey === 'bulk-rec'}
            onRun={() => handleBulk('rec')} libelle="Valider" couleur="#27500A" />
          {data.recups.map(r => {
            const key = `${r.employe_id}|${r.date}`
            const f = form[key] || {}
            return (
              <div key={key} style={{ background: 'white', border: '1px solid #ddd9f5', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={sel.has(`r:${key}`)} onChange={() => toggleSel(`r:${key}`)}
                  style={{ cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ minWidth: 170 }}>
                  <strong style={{ fontSize: 14 }}>{r.nom}</strong>
                  <div style={{ fontSize: 12, color: '#3C3489' }}>{r.label} travaillé le {r.jour} {fmtJour(r.date)} → +{String(r.jours ?? 1).replace('.', ',')} récup</div>
                </div>
                <input value={f.raison || ''} onChange={e => setField(key, 'raison', e.target.value)}
                  placeholder="Pourquoi a-t-il travaillé ? (facultatif)"
                  style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
                <button onClick={() => handleRecup(r, 'valider')} disabled={busyKey === key}
                  style={{ padding: '8px 12px', fontSize: 13, background: '#27500A', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> {busyKey === key ? '…' : 'Valider'}
                </button>
                <button onClick={() => handleRecup(r, 'refuser')} disabled={busyKey === key}
                  style={{ padding: '8px 12px', fontSize: 13, background: 'white', color: '#A32D2D', border: '1px solid #e5b0a4', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <XCircle size={13} /> Refuser
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
