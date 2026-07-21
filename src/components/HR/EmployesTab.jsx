import { useState, useEffect, useMemo } from 'react'
import { todayISO } from '../../lib/dates'
import { Search, Building2, Plus, Calendar, Pencil, Trash2, PartyPopper, Palmtree, CheckCircle2, Moon, Eye, EyeOff } from 'lucide-react'
import { loadEmployes, deleteEmploye } from '../../lib/hr'
import { supabase } from '../../lib/supabase'
import { createMissingEmployeUsers, deactivateUserForEmploye } from '../../lib/users'
import EmployeEditModal from './EmployeEditModal'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export default function EmployesTab({ user, isAdmin }) {
  const [employes, setEmployes] = useState([])
  const [creatingUsers, setCreatingUsers] = useState(false)
  const [conges, setConges] = useState([])
  const [joursFeries, setJoursFeries] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('actif')
  const [societeFilter, setSocieteFilter] = useState('toutes')
  const [search, setSearch] = useState('')
  const [editingEmp, setEditingEmp] = useState(null)
  const [revealedSalaries, setRevealedSalaries] = useState(new Set())
  const [isMobile, setIsMobile] = useState(false)

  // Détecte le petit écran (téléphone) pour basculer tableau -> cartes
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Date d'aujourd'hui pour calcul statut
  const todayStr = todayISO() // YYYY-MM-DD
  const todayDate = new Date()
  const jourSemaineFR = JOURS_FR[todayDate.getDay()] // ex: "Mardi"

  async function reload() {
    setLoading(true)
    try {
      const filterActif = !isAdmin ? true : (filter === 'tous' ? null : filter === 'actif')
      const list = await loadEmployes(filterActif)
      setEmployes(list)

      // Charger congés du jour
      const { data: cgs } = await supabase
        .from('conges')
        .select('employe_id, date_debut, date_fin, type, statut')
        .lte('date_debut', todayStr)
        .gte('date_fin', todayStr)
      setConges(cgs || [])

      // Charger fériés
      const { data: fer } = await supabase
        .from('jours_feries')
        .select('date, nom')
        .eq('date', todayStr)
      setJoursFeries(fer || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [filter])

  // ---- Calcul du statut du jour ----
  function getStatutAujourdhui(emp) {
    // 1) Férié ?
    if (joursFeries.length > 0) {
      return { label: 'Férié', Icon: PartyPopper, bg: '#FFF1DA', color: '#8A5A00' }
    }

    // 2) Congé ?
    const cg = conges.find(c => c.employe_id === emp.id)
    if (cg) {
      const typeLabel = cg.type === 'maladie' ? 'Maladie'
                     : cg.type === 'paye' || cg.type === 'payé' ? 'Congé payé'
                     : cg.type === 'sans_solde' ? 'Sans solde'
                     : (cg.type || 'Congé')
      return { label: typeLabel, Icon: Palmtree, bg: '#F3E8FF', color: '#5B21B6' }
    }

    // 3) Planning
    const ptype = emp.planning_type || 'aucun'

    if (ptype === 'aucun') {
      return { label: 'Présent', Icon: CheckCircle2, bg: '#EAF3DE', color: '#27500A' }
    }

    if (ptype === 'fixe') {
      if (emp.planning_jour_off === jourSemaineFR) {
        return { label: 'OFF', Icon: Moon, bg: '#E4E4E7', color: '#52525B' }
      }
      if (emp.planning_demi_off === jourSemaineFR) {
        return { label: '½ Demi-journée', bg: '#FEF3C7', color: '#92400E' }
      }
      return { label: 'Présent', Icon: CheckCircle2, bg: '#EAF3DE', color: '#27500A' }
    }

    if (ptype === 'alt') {
      // Semaine paire/impaire (numéro ISO)
      const weekNum = getISOWeekNumber(todayDate)
      const isPaire = weekNum % 2 === 0
      const off1 = isPaire ? emp.planning_paire_off_1 : emp.planning_impaire_off_1
      const off2 = isPaire ? emp.planning_paire_off_2 : emp.planning_impaire_off_2
      if (jourSemaineFR === off1 || jourSemaineFR === off2) {
        return { label: 'OFF', Icon: Moon, bg: '#E4E4E7', color: '#52525B' }
      }
      return { label: 'Présent', Icon: CheckCircle2, bg: '#EAF3DE', color: '#27500A' }
    }

    return { label: 'Présent', Icon: CheckCircle2, bg: '#EAF3DE', color: '#27500A' }
  }

  const filtered = useMemo(() => {
    let list = employes
    if (societeFilter !== 'toutes') {
      list = list.filter(e => e.societe?.code === societeFilter)
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(e =>
        (e.nom || '').toLowerCase().includes(s) ||
        (e.poste || '').toLowerCase().includes(s) ||
        (e.cnss || '').includes(s) ||
        (e.cin || '').includes(s)
      )
    }
    return list
  }, [employes, search, societeFilter])

  async function handleDelete(e, emp) {
    e.stopPropagation()  // ne pas ouvrir le modal
    if (!await confirmDialog(`Supprimer ${emp.nom} ? Cette action est définitive.`, { danger: true, confirmLabel: 'Supprimer' })) return
    try {
      // On bloque d'abord l'accès du user lié (login désactivé) avant de supprimer.
      await deactivateUserForEmploye(emp.id).catch(() => {})
      await deleteEmploye(emp.id)
      reload()
    } catch (err) {
      toast.error('Erreur : ' + err.message)
    }
  }

  async function handleCreateMissingUsers() {
    if (!await confirmDialog('Créer les users manquants pour tous les employés actifs ?\n(Login + mot de passe générés ; accès envoyés par WhatsApp.)', { confirmLabel: 'Créer' })) return
    setCreatingUsers(true)
    try {
      const all = await loadEmployes(true) // actifs uniquement
      const res = await createMissingEmployeUsers(all)
      const parts = [`✅ ${res.created.length} user(s) créé(s)`]
      if (res.created.length) parts.push(res.created.map(c => `· ${c.nom} → ${c.username} / ${c.password}`).join('\n'))
      if (res.skipped.length) parts.push(`\n⏭️ ${res.skipped.length} ignoré(s) :\n` + res.skipped.map(s => `· ${s.nom} (${s.reason})`).join('\n'))
      if (res.errors.length) parts.push(`\n⚠️ ${res.errors.length} erreur(s) :\n` + res.errors.map(s => `· ${s.nom} (${s.reason})`).join('\n'))
      alert(parts.join('\n'))
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e?.message || ''))
    } finally {
      setCreatingUsers(false)
    }
  }

  function handleRevealSalary(e, empId) {
    e.stopPropagation()  // ne pas ouvrir le modal
    setRevealedSalaries(s => {
      const n = new Set(s)
      if (n.has(empId)) n.delete(empId)
      else n.add(empId)
      return n
    })
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240, display: 'inline-flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: '#8a7a70', pointerEvents: 'none' }} />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, poste, CNSS, CIN…"
            style={{
              width: '100%', padding: '9px 11px 9px 30px', fontSize: 13,
              border: '1px solid #e5d8c3', borderRadius: 8
            }}
          />
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['actif', 'inactif', 'tous'].map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)} style={{
                padding: '7px 12px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: 'none',
                background: filter === f ? '#1a0f0a' : '#F4F0EA',
                color: filter === f ? 'white' : '#4a3a30'
              }}>
                {f === 'actif' ? 'Actifs' : f === 'inactif' ? 'Inactifs' : 'Tous'}
              </button>
            ))}
          </div>
        )}

        {/* Filtre société */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { v: 'toutes', label: 'Toutes', icon: true },
            { v: 'LG', label: 'LG' },
            { v: 'LN', label: 'L&N' },
          ].map(f => (
            <button key={f.v} type="button" onClick={() => setSocieteFilter(f.v)} style={{
              padding: '7px 12px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: 'none',
              background: societeFilter === f.v ? '#993556' : '#F4F0EA',
              color: societeFilter === f.v ? 'white' : '#4a3a30',
              fontWeight: societeFilter === f.v ? 500 : 400,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {f.icon && <Building2 size={14} />}{f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          {isAdmin && (
            <button onClick={handleCreateMissingUsers} disabled={creatingUsers} style={{
              padding: '9px 14px', fontSize: 13, background: 'transparent',
              color: '#993556', border: '1px solid #993556', borderRadius: 8,
              cursor: creatingUsers ? 'default' : 'pointer', fontWeight: 500, opacity: creatingUsers ? 0.6 : 1,
            }} title="Crée un compte (login + mot de passe) pour chaque employé actif qui n'en a pas encore">
              {creatingUsers ? 'Création…' : 'Créer les users manquants'}
            </button>
          )}
          <button onClick={() => setEditingEmp({})} style={{
            padding: '9px 14px', fontSize: 13, background: '#993556',
            color: 'white', border: '1px solid #993556', borderRadius: 8,
            cursor: 'pointer', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Plus size={14} /> Nouvel employé
          </button>
        </div>
      </div>

      {/* Info du jour */}
      <div style={{
        fontSize: 11, color: '#8a7a70', marginBottom: 10, paddingLeft: 4,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <Calendar size={14} /> Aujourd'hui : <strong>{jourSemaineFR}</strong> {todayDate.toLocaleDateString('fr-FR')}
      </div>

      {/* Tableau */}
      {loading && <div style={{ padding: 20, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{
          padding: 30, textAlign: 'center', color: '#4a3a30',
          background: '#F9F6F1', borderRadius: 8, fontSize: 13
        }}>
          {search ? 'Aucun employé trouvé.' : 'Aucun employé dans cette catégorie.'}
        </div>
      )}
      {!loading && filtered.length > 0 && !isMobile && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5d8c3', overflow: 'hidden', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#4a3a30' }}>
                <Th>Nom</Th>
                <Th>Société</Th>
                <Th>Poste</Th>
                <Th>CNSS</Th>
                <Th>CIN</Th>
                <Th>Entrée</Th>
                {isAdmin && <Th>Salaire</Th>}
                <Th>Aujourd'hui</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const statut = getStatutAujourdhui(e)
                return (
                  <tr
                    key={e.id}
                    onClick={() => setEditingEmp(e)}
                    style={{
                      borderTop: '1px solid #F4F0EA',
                      opacity: e.actif ? 1 : 0.6,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={ev => ev.currentTarget.style.background = '#FCFAF7'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                  >
                    <Td><strong>{e.nom}</strong></Td>
                    <Td>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 999,
                        background: e.societe?.code === 'LG' ? '#FCEEE8' : '#EAF3DE',
                        color: e.societe?.code === 'LG' ? '#993556' : '#27500A',
                        fontWeight: 500,
                      }}>{e.societe?.code || '—'}</span>
                    </Td>
                    <Td style={{ color: '#4a3a30' }}>{e.poste || '—'}</Td>
                    <Td>{e.cnss || '—'}</Td>
                    <Td>{e.cin || '—'}</Td>
                    <Td>{fmtDate(e.date_entree)}</Td>
                    {isAdmin && (
                      <Td>
                        {e.salaire_net ? (
                          revealedSalaries.has(e.id) ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {Number(e.salaire_net).toLocaleString('fr-FR')} dh
                              <button onClick={ev => handleRevealSalary(ev, e.id)} style={{
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                                display: 'inline-flex', alignItems: 'center',
                              }} title="Masquer"><EyeOff size={14} /></button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ letterSpacing: 2, color: '#8a7a70' }}>•••••</span>
                              <span style={{ color: '#8a7a70', fontSize: 11 }}>dh</span>
                              <button onClick={ev => handleRevealSalary(ev, e.id)} style={{
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                                display: 'inline-flex', alignItems: 'center',
                              }} title="Révéler"><Eye size={14} /></button>
                            </span>
                          )
                        ) : '—'}
                      </Td>
                    )}
                    <Td>
                      <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 999,
                        background: statut.bg, color: statut.color, fontWeight: 500,
                        whiteSpace: 'nowrap',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>{statut.Icon && <statut.Icon size={12} />}{statut.label}</span>
                    </Td>
                    <Td>
                      <span style={{ color: '#8a7a70', fontSize: 11, fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Pencil size={12} /> Modifier
                      </span>
                      {isAdmin && (
                        <button onClick={ev => handleDelete(ev, e)} style={btnDel} title="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Version mobile : cartes empilées */}
      {!loading && filtered.length > 0 && isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(e => {
            const statut = getStatutAujourdhui(e)
            return (
              <div
                key={e.id}
                onClick={() => setEditingEmp(e)}
                style={{
                  background: 'white', border: '1px solid #e5d8c3', borderRadius: 12,
                  padding: 12, opacity: e.actif ? 1 : 0.6, cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{e.nom}</strong>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 999,
                    background: e.societe?.code === 'LG' ? '#FCEEE8' : '#EAF3DE',
                    color: e.societe?.code === 'LG' ? '#993556' : '#27500A', fontWeight: 500,
                  }}>{e.societe?.code || '—'}</span>
                </div>
                {e.poste && <div style={{ fontSize: 12, color: '#4a3a30', marginTop: 2 }}>{e.poste}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 11, color: '#8a7a70' }}>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 999,
                    background: statut.bg, color: statut.color, fontWeight: 500, whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>{statut.Icon && <statut.Icon size={12} />}{statut.label}</span>
                  {e.cnss && <span>CNSS {e.cnss}</span>}
                  {e.cin && <span>CIN {e.cin}</span>}
                  {e.date_entree && <span>Entrée {fmtDate(e.date_entree)}</span>}
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 12 }}>
                      {e.salaire_net ? (
                        revealedSalaries.has(e.id) ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {Number(e.salaire_net).toLocaleString('fr-FR')} dh
                            <button onClick={ev => handleRevealSalary(ev, e.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }} title="Masquer"><EyeOff size={14} /></button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ letterSpacing: 2, color: '#8a7a70' }}>•••••</span>
                            <span style={{ color: '#8a7a70', fontSize: 11 }}>dh</span>
                            <button onClick={ev => handleRevealSalary(ev, e.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }} title="Révéler"><Eye size={14} /></button>
                          </span>
                        )
                      ) : <span style={{ color: '#8a7a70' }}>—</span>}
                    </span>
                    <button onClick={ev => handleDelete(ev, e)} style={btnDel} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editingEmp !== null && (
        <EmployeEditModal
          employe={editingEmp.id ? editingEmp : null}
          user={user}
          isAdmin={isAdmin}
          onClose={() => setEditingEmp(null)}
          onSaved={() => { setEditingEmp(null); reload() }}
        />
      )}
    </div>
  )
}

// Numéro de semaine ISO (1-53)
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500 }}>{children}</th>
}
function Td({ children, style = {} }) {
  return <td style={{ padding: '8px 12px', ...style }}>{children}</td>
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return d }
}

const btnDel = { padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 4, color: '#A32D2D', display: 'inline-flex', alignItems: 'center' }
