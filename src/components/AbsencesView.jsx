import { useState, useEffect } from 'react'
import { loadAbsences, createAbsence, deleteAbsence } from '../lib/absences'

const TYPES = ['Congé payé', 'Sans solde', 'Maladie', 'Récupération']

function nbJours(start, end) {
  if (!start || !end) return 0
  const d = (new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000 + 1
  return d > 0 ? d : 0
}
function fmt(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// Onglet indépendant pour noter les congés / absences (table dédiée rh_absences).
export default function AbsencesView({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  // Formulaire
  const [person, setPerson] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [type, setType] = useState(TYPES[0])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setLoading(true); setError('')
    try { setItems(await loadAbsences()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  function resetForm() {
    setPerson(''); setStartDate(''); setEndDate(''); setType(TYPES[0]); setReason('')
  }

  async function handleAdd() {
    if (!person.trim()) { setError('Indique la personne.'); return }
    if (!startDate || !endDate) { setError('Indique les dates de début et de fin.'); return }
    if (endDate < startDate) { setError('La date de fin est avant la date de début.'); return }
    setSaving(true); setError('')
    try {
      await createAbsence({ person, startDate, endDate, type, reason }, user.id)
      resetForm(); setShowForm(false)
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(a) {
    if (!confirm(`Supprimer l'absence de ${a.person} ?`)) return
    try {
      await deleteAbsence(a.id)
      setItems(prev => prev.filter(x => x.id !== a.id))
    } catch (e) { alert('Erreur : ' + e.message) }
  }

  const term = q.trim().toLowerCase()
  const filtered = items.filter(a =>
    !term || [a.person, a.type, a.reason].filter(Boolean).join(' ').toLowerCase().includes(term)
  )
  // Regroupement par personne (avec total de jours)
  const groups = {}
  for (const a of filtered) { (groups[a.person] ||= []).push(a) }
  const persons = Object.keys(groups).sort((x, y) => x.localeCompare(y))

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h1 className="font-fraunces italic text-[26px] text-ink">🌴 Congés / Absences</h1>
        <button
          onClick={() => { resetForm(); setError(''); setShowForm(true) }}
          className="px-4 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-full hover:bg-bordeaux-deep flex-shrink-0"
        >+ Ajouter</button>
      </div>
      <p className="text-[12px] text-ink-mute mb-4">Suivi libre des congés et absences (indépendant du pointage et des employés).</p>

      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Chercher une personne, un type…"
        className="w-full px-4 py-2 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux mb-4"
      />

      {error && !showForm && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded mb-4">{error}</div>}
      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}

      {!loading && persons.length === 0 && (
        <div className="text-center py-12 text-ink-mute italic">
          {term ? 'Aucun résultat.' : 'Aucune absence notée. Clique sur « + Ajouter ».'}
        </div>
      )}

      <div className="space-y-4">
        {persons.map(p => {
          const list = groups[p]
          const total = list.reduce((s, a) => s + nbJours(a.start_date, a.end_date), 0)
          return (
            <div key={p}>
              <div className="flex items-baseline justify-between mb-1.5">
                <h2 className="text-[15px] font-medium text-ink">{p}</h2>
                <span className="text-[12px] text-ink-soft">{total} jour{total > 1 ? 's' : ''} au total</span>
              </div>
              <div className="space-y-2">
                {list.map(a => (
                  <div key={a.id} className="rounded-xl border border-line bg-cream-warm p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-ink">
                        {a.type && <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-bordeaux/10 text-bordeaux mr-2">{a.type}</span>}
                        {fmt(a.start_date)} → {fmt(a.end_date)}
                        <span className="text-ink-soft"> · {nbJours(a.start_date, a.end_date)} j</span>
                      </div>
                      {a.reason && <div className="text-[12px] text-ink-mute mt-0.5 whitespace-pre-wrap break-words">{a.reason}</div>}
                    </div>
                    <button onClick={() => handleDelete(a)} className="text-[12px] text-bordeaux hover:underline flex-shrink-0" title="Supprimer">🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Fenêtre d'ajout */}
      {showForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-3">🌴 Ajouter une absence</h3>

            <label className="block text-[11px] font-medium text-ink-soft mb-1">Personne</label>
            <input type="text" value={person} onChange={e => setPerson(e.target.value)} autoFocus placeholder="Nom de la personne"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3" />

            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-ink-soft mb-1">Du</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux" />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-ink-soft mb-1">Au</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux" />
              </div>
            </div>

            <label className="block text-[11px] font-medium text-ink-soft mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3">
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <label className="block text-[11px] font-medium text-ink-soft mb-1">Motif (optionnel)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="ex. récup heures sup, angine…"
              className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-4" />

            {(startDate && endDate && endDate >= startDate) && (
              <div className="text-[12px] text-ink-soft mb-3">Durée : <span className="font-medium">{nbJours(startDate, endDate)} jour{nbJours(startDate, endDate) > 1 ? 's' : ''}</span></div>
            )}
            {error && <div className="text-[12px] text-bordeaux mb-3">{error}</div>}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} disabled={saving} className="px-3 py-1.5 text-[12px] border border-line rounded-lg text-ink-soft hover:bg-cream-warm disabled:opacity-50">Annuler</button>
              <button onClick={handleAdd} disabled={saving} className="px-4 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50">{saving ? '…' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
