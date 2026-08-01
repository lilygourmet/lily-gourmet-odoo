import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import Avatar from '../Avatar'

// Locaux (colonnes). L'ordre ici = l'ordre d'affichage.
const LOCAUX = [
  { key: 'annex',             label: 'Annex' },
  { key: 'boutique',          label: 'Boutique' },
  { key: 'stock_chocolat',    label: 'Stock Chocolat' },
  { key: 'economat_annex',    label: 'Economat Annex' },
  { key: 'economat_boutique', label: 'Economat Boutique' },
  { key: 'bureau_annex',      label: 'Bureau Annex' },
]

const EMPTY = { has: false, code: '' }

export default function AccesLocauxTab() {
  const [emps, setEmps] = useState([])
  const [codes, setCodes] = useState({})     // employe_id -> { local_key: { has, code } }
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: e }, { data: a }] = await Promise.all([
        supabase.from('employes').select('id, nom, groupe, photo_url').eq('actif', true).eq('fantome', false).order('nom'),
        supabase.from('acces_locaux').select('employe_id, codes'),
      ])
      setEmps(e || [])
      const map = {}
      for (const row of (a || [])) map[row.employe_id] = row.codes || {}
      setCodes(map)
    } catch (err) {
      toast.error('Chargement impossible : ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  const cell = (empId, local) => codes[empId]?.[local] || EMPTY

  function setCell(empId, local, patch, saveNow) {
    const emp = { ...(codes[empId] || {}) }
    emp[local] = { ...(emp[local] || EMPTY), ...patch }
    setCodes({ ...codes, [empId]: emp })
    if (saveNow) saveRow(empId, emp)
  }

  async function saveRow(empId, emp) {
    const payload = emp || codes[empId] || {}
    setSavingId(empId)
    try {
      const { error } = await supabase.from('acces_locaux')
        .upsert({ employe_id: empId, codes: payload, updated_at: new Date().toISOString() }, { onConflict: 'employe_id' })
      if (error) throw error
    } catch (err) {
      toast.error('Enregistrement échoué : ' + (err.message || err))
    } finally {
      setSavingId(null)
    }
  }

  const empName = e => e.nom || `#${e.id}`
  const visible = emps.filter(e => empName(e).toLowerCase().includes(search.trim().toLowerCase()))

  if (loading) return <div className="text-ink-mute italic p-4">Chargement…</div>

  return (
    <div>
      <p className="text-[13px] text-ink-soft mb-3">
        Qui a accès à quel local, et le code. Coche « accès » puis note le code. Les employés partis disparaissent, les nouveaux apparaissent automatiquement.
      </p>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un employé…"
        className="w-full max-w-xs mb-3 px-3 py-2 text-[13px] border border-line rounded-lg focus:outline-none focus:border-bordeaux"
      />

      <div className="overflow-x-auto border border-line rounded-xl">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-cream-warm">
              <th className="text-left px-3 py-2 font-semibold text-ink sticky left-0 bg-cream-warm z-10 min-w-[150px]">Employé</th>
              {LOCAUX.map(l => (
                <th key={l.key} className="px-2 py-2 font-semibold text-bordeaux text-center min-w-[130px] border-l border-line">{l.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(e => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-3 py-2 sticky left-0 bg-cream z-10 min-w-[150px]">
                  <div className="font-medium text-ink" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar emp={e} size={22} />{empName(e)}</div>
                  {e.groupe && <div className="text-[11px] text-ink-mute">{e.groupe}</div>}
                  {savingId === e.id && <div className="text-[10px] text-bordeaux">enregistrement…</div>}
                </td>
                {LOCAUX.map(l => {
                  const c = cell(e.id, l.key)
                  return (
                    <td key={l.key} className={`px-2 py-2 text-center border-l border-line ${c.has ? 'bg-emerald-100' : ''}`}>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!c.has}
                          onChange={ev => setCell(e.id, l.key, { has: ev.target.checked }, true)}
                          className="w-4 h-4 accent-[#0f7a3d]"
                        />
                        <span className={`text-[11px] font-semibold ${c.has ? 'text-emerald-700' : 'text-ink-soft'}`}>accès</span>
                      </label>
                      <input
                        value={c.code || ''}
                        onChange={ev => setCell(e.id, l.key, { code: ev.target.value }, false)}
                        onBlur={() => saveRow(e.id)}
                        disabled={!c.has}
                        placeholder="code"
                        className={`mt-1 w-[90px] text-center px-2 py-1 text-[13px] border rounded ${c.has ? 'border-line bg-white' : 'border-line/50 bg-cream-warm/40 text-ink-mute'}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={LOCAUX.length + 1} className="px-3 py-6 text-center text-ink-mute italic">Aucun employé.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
