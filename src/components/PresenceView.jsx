// src/components/PresenceView.jsx
// Onglet Présence : qui est là maintenant (par groupe) + calendrier des jours off.
// Accès : tout le monde. « Présent » = a pointé l'arrivée sans encore pointer le départ.
// =============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import { loadPresence, loadHabitualOff, refreshTodayAttendance, GROUP_COLORS, groupLabel } from '../lib/presence'

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const TEAMS = Object.keys(GROUP_COLORS).filter(g => g !== 'Aucun')

const initials = nom => String(nom || '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

export default function PresenceView({ user, activeView, onNavigate, onLogout }) {
  const [tab, setTab] = useState('presence')
  // Filtres INDÉPENDANTS par onglet (présence vs jours off)
  const [filterGroupP, setFilterGroupP] = useState(null)
  const [searchP, setSearchP] = useState('')
  const [filterGroupC, setFilterGroupC] = useState(null)
  const [searchC, setSearchC] = useState('')
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const now = new Date()
  const [calM, setCalM] = useState(now.getMonth())   // 0-11
  const [calY, setCalY] = useState(now.getFullYear())
  const [offByDay, setOffByDay] = useState({})

  const reloadPresence = useCallback(async () => {
    const g = await loadPresence()
    setGroups(g)
  }, [])

  // Présence : affichage immédiat depuis la table, puis synchro Odoo en fond.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try { await reloadPresence() } finally { if (alive) setLoading(false) }
      setSyncing(true)
      await refreshTodayAttendance()
      if (alive) { await reloadPresence(); setSyncing(false) }
    })()
    return () => { alive = false }
  }, [reloadPresence])

  // Calendrier : recharge les jours off quand le mois change ou quand on ouvre l'onglet.
  useEffect(() => {
    if (tab !== 'cal') return
    let alive = true
    loadHabitualOff(calM + 1, calY).then(d => { if (alive) setOffByDay(d) })
    return () => { alive = false }
  }, [tab, calM, calY])

  // Le bandeau de filtre pilote l'onglet ACTIF (chaque onglet garde sa sélection)
  const isP = tab === 'presence'
  const filterGroup = isP ? filterGroupP : filterGroupC
  const setFilterGroup = isP ? setFilterGroupP : setFilterGroupC
  const search = isP ? searchP : searchC
  const setSearch = isP ? setSearchP : setSearchC

  // Présence → toujours filtrée par les filtres de l'onglet présence
  const qP = searchP.trim().toLowerCase()
  const shownGroups = groups
    .filter(g => !filterGroupP || g.groupe === filterGroupP)
    .map(g => ({ ...g, employes: g.employes.filter(e => !qP || e.nom.toLowerCase().includes(qP)) }))
    .filter(g => g.employes.length)
  const shownPresents = shownGroups.reduce((s, g) => s + g.employes.length, 0)
  const qC = searchC.trim().toLowerCase()

  function prevMonth() { setCalM(m => { if (m === 0) { setCalY(y => y - 1); return 11 } return m - 1 }) }
  function nextMonth() { setCalM(m => { if (m === 11) { setCalY(y => y + 1); return 0 } return m + 1 }) }

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-bordeaux text-cream flex items-center justify-center text-lg">👥</div>
          <h1 className="font-fraunces italic text-[24px] text-ink leading-none">Présence</h1>
          {syncing && <span className="text-[11px] text-ink-mute">🔄 mise à jour…</span>}
        </div>
        <div className="text-[13px] text-ink-mute mb-4 ml-12">
          <b className="text-[#2f9e5e]">{shownPresents} présent{shownPresents > 1 ? 's' : ''}</b>
        </div>

        {/* sous-onglets */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('presence')}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold border ${tab === 'presence' ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink border-line'}`}
          >Qui est là</button>
          <button
            onClick={() => setTab('cal')}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold border ${tab === 'cal' ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink border-line'}`}
          >Jours off 🌴</button>
        </div>

        {/* Filtres : par nom + par équipe */}
        <div className="mb-4 space-y-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔎 Rechercher un nom…"
            className="w-full px-3 py-2 border border-line rounded-xl text-[14px] bg-white"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterGroup(null)}
              className={`px-3 py-1 rounded-full text-[12px] font-semibold border ${!filterGroup ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink border-line'}`}
            >Toutes</button>
            {TEAMS.map(g => {
              const on = filterGroup === g
              return (
                <button
                  key={g}
                  onClick={() => setFilterGroup(on ? null : g)}
                  className="px-3 py-1 rounded-full text-[12px] font-semibold border flex items-center gap-1.5"
                  style={on
                    ? { background: GROUP_COLORS[g], color: '#fff', borderColor: GROUP_COLORS[g] }
                    : { background: '#fff', borderColor: '#e4dad0' }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: GROUP_COLORS[g] }} />
                  {groupLabel(g)}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== QUI EST LÀ ===== */}
        {tab === 'presence' && (
          loading ? (
            <div className="text-center text-ink-mute py-10">Chargement…</div>
          ) : groups.length === 0 ? (
            <div className="bg-white border border-line rounded-2xl p-8 text-center text-ink-mute">Personne n'a encore pointé aujourd'hui.</div>
          ) : shownGroups.length === 0 ? (
            <div className="bg-white border border-line rounded-2xl p-8 text-center text-ink-mute">Aucun présent pour ce filtre.</div>
          ) : (
            <div className="space-y-3">
              {shownGroups.map(g => {
                const color = GROUP_COLORS[g.groupe] || '#95a5a6'
                return (
                  <div key={g.groupe} className="bg-white border border-line rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      <h2 className="text-[12px] uppercase tracking-wider font-semibold text-ink">{groupLabel(g.groupe)}</h2>
                      <span className="ml-auto text-[12px] text-ink-mute font-semibold">
                        <b className="text-[#2f9e5e]">{g.employes.length}</b> présent{g.employes.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3.5">
                      {g.employes.map(e => (
                        <div key={e.id} className="w-[68px] flex flex-col items-center text-center">
                          <div className="relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-[15px]" style={{ background: color }}>
                            {initials(e.nom)}
                            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white bg-[#2f9e5e]" />
                          </div>
                          <div className="text-[11px] mt-1.5 leading-tight">{e.nom}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ===== JOURS OFF ===== */}
        {tab === 'cal' && (
          <div className="bg-white border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="w-8 h-8 border border-line rounded-lg text-[15px]">‹</button>
              <h2 className="text-[16px] font-semibold capitalize">{MOIS[calM]} {calY}</h2>
              <button onClick={nextMonth} className="w-8 h-8 border border-line rounded-lg text-[15px]">›</button>
            </div>
            <Calendar mois={calM} annee={calY} offByDay={offByDay} filterGroup={filterGroupC} q={qC} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-[10px] text-ink-mute">
              {Object.keys(GROUP_COLORS).filter(g => g !== 'Aucun').map(g => (
                <span key={g} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLORS[g] }} />{groupLabel(g)}
                </span>
              ))}
              <span>· « ½ » = demi-journée · repos habituel (pas les congés)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Calendar({ mois, annee, offByDay, filterGroup, q }) {
  const first = new Date(annee, mois, 1)
  const startDow = (first.getDay() + 6) % 7 // lundi = 0
  const nbDays = new Date(annee, mois + 1, 0).getDate()
  const today = new Date()
  const isThisMonth = today.getFullYear() === annee && today.getMonth() === mois

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= nbDays; d++) {
    const ymd = `${annee}-${String(mois + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const offs = (offByDay[ymd] || []).filter(o =>
      (!filterGroup || o.groupe === filterGroup) && (!q || o.nom.toLowerCase().includes(q)))
    const isToday = isThisMonth && today.getDate() === d
    cells.push(
      <div key={d} className={`min-h-[70px] rounded-lg p-1 border ${isToday ? 'border-bordeaux border-2' : 'border-line'}`}>
        <span className={`text-[11px] font-semibold ${isToday ? 'text-bordeaux' : 'text-ink-mute'}`}>{d}</span>
        {offs.map((o, i) => (
          <span key={i}
            className="block mt-0.5 px-1 py-0.5 rounded text-white text-[9px] font-semibold truncate"
            style={{ background: GROUP_COLORS[o.groupe] || '#95a5a6' }}
            title={`${o.nom} · ${groupLabel(o.groupe)}${o.demi ? ' · demi-journée' : ''}`}
          >{o.demi ? '½ ' : ''}{o.nom}</span>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WD.map(w => <div key={w} className="text-center text-[10px] text-ink-mute uppercase tracking-wider pb-1">{w}</div>)}
      {cells}
    </div>
  )
}
