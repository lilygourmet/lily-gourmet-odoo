import { useState, useEffect, useMemo } from 'react'
import { loadEmployes, deleteEmploye } from '../../lib/hr'
import EmployeEditModal from './EmployeEditModal'

export default function EmployesTab({ user, isAdmin }) {
  const [employes, setEmployes] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('actif')  // 'actif' | 'inactif' | 'tous' — forcé à 'actif' pour perm_hr
  const [societeFilter, setSocieteFilter] = useState('toutes')  // 'toutes' | 'LG' | 'LN'
  const [search, setSearch] = useState('')
  const [editingEmp, setEditingEmp] = useState(null)  // null = pas d'édition, {} = nouveau, {...} = édit
  const [revealedSalaries, setRevealedSalaries] = useState(new Set())  // ids des salaires révélés

  async function reload() {
    setLoading(true)
    try {
      // Si pas admin, force à actif uniquement
      const filterActif = !isAdmin ? true : (filter === 'tous' ? null : filter === 'actif')
      const list = await loadEmployes(filterActif)
      setEmployes(list)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [filter])

  const filtered = useMemo(() => {
    let list = employes
    // Filtre société
    if (societeFilter !== 'toutes') {
      list = list.filter(e => e.societe?.code === societeFilter)
    }
    // Filtre recherche
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

  async function handleDelete(emp) {
    if (!confirm(`Supprimer ${emp.nom} ? Cette action est définitive.`)) return
    try {
      await deleteEmploye(emp.id)
      reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap'
      }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Rechercher par nom, poste, CNSS, CIN…"
          style={{
            flex: 1, minWidth: 240, padding: '9px 11px', fontSize: 13,
            border: '1px solid #E8E2D8', borderRadius: 6
          }}
        />
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['actif', 'inactif', 'tous'].map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)} style={{
                padding: '7px 12px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: 'none',
                background: filter === f ? '#3A3733' : '#F4F0EA',
                color: filter === f ? 'white' : '#6F6A60'
              }}>
                {f === 'actif' ? 'Actifs' : f === 'inactif' ? 'Inactifs' : 'Tous'}
              </button>
            ))}
          </div>
        )}

        {/* Filtre société */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { v: 'toutes', label: '🏢 Toutes' },
            { v: 'LG', label: 'LG' },
            { v: 'LN', label: 'L&N' },
          ].map(f => (
            <button key={f.v} type="button" onClick={() => setSocieteFilter(f.v)} style={{
              padding: '7px 12px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: 'none',
              background: societeFilter === f.v ? '#993556' : '#F4F0EA',
              color: societeFilter === f.v ? 'white' : '#6F6A60',
              fontWeight: societeFilter === f.v ? 500 : 400,
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setEditingEmp({})} style={{
          padding: '9px 14px', fontSize: 13, background: '#993556',
          color: 'white', border: '1px solid #993556', borderRadius: 8,
          cursor: 'pointer', fontWeight: 500
        }}>
          ➕ Nouvel employé
        </button>
      </div>

      {/* Tableau */}
      {loading && <div style={{ padding: 20, textAlign: 'center', color: '#6F6A60' }}>Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{
          padding: 30, textAlign: 'center', color: '#6F6A60',
          background: '#F9F6F1', borderRadius: 8, fontSize: 13
        }}>
          {search ? 'Aucun employé trouvé.' : 'Aucun employé dans cette catégorie.'}
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E8E2D8', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#6F6A60' }}>
                <Th>Nom</Th>
                <Th>Société</Th>
                <Th>Poste</Th>
                <Th>CNSS</Th>
                <Th>CIN</Th>
                <Th>Entrée</Th>
                {isAdmin && <Th>Salaire</Th>}
                {isAdmin && <Th>Type</Th>}
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} style={{
                  borderTop: '1px solid #F4F0EA',
                  opacity: e.actif ? 1 : 0.6
                }}>
                  <Td><strong>{e.nom}</strong></Td>
                  <Td>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: e.societe?.code === 'LG' ? '#FCEEE8' : '#EAF3DE',
                      color: e.societe?.code === 'LG' ? '#993556' : '#27500A',
                      fontWeight: 500,
                    }}>{e.societe?.code || '—'}</span>
                  </Td>
                  <Td style={{ color: '#6F6A60' }}>{e.poste || '—'}</Td>
                  <Td>{e.cnss || '—'}</Td>
                  <Td>{e.cin || '—'}</Td>
                  <Td>{fmtDate(e.date_entree)}</Td>
                  {isAdmin && (
                    <Td>
                      {e.salaire_net ? (
                        revealedSalaries.has(e.id) ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {Number(e.salaire_net).toLocaleString('fr-FR')} dh
                            <button onClick={() => setRevealedSalaries(s => { const n = new Set(s); n.delete(e.id); return n })} style={{
                              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0,
                            }} title="Masquer">🙈</button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ letterSpacing: 2, color: '#9B968D' }}>•••••</span>
                            <span style={{ color: '#9B968D', fontSize: 11 }}>dh</span>
                            <button onClick={() => setRevealedSalaries(s => { const n = new Set(s); n.add(e.id); return n })} style={{
                              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0,
                            }} title="Révéler">👁</button>
                          </span>
                        )
                      ) : '—'}
                    </Td>
                  )}
{isAdmin && (
                  <Td>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: e.type_contrat === 'CDI' ? '#EAF3DE' : e.type_contrat === 'Stage' ? '#E6F1FB' : '#F4F0EA',
                      color: e.type_contrat === 'CDI' ? '#27500A' : e.type_contrat === 'Stage' ? '#0C447C' : '#6F6A60',
                    }}>{e.type_contrat || '—'}</span>
                  </Td>
)}
                  <Td>
                    <button onClick={() => setEditingEmp(e)} style={btnEdit}>✏️</button>
                    {isAdmin && <button onClick={() => handleDelete(e)} style={btnDel}>🗑️</button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
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

const btnEdit = { padding: '4px 8px', fontSize: 14, background: 'transparent', border: 'none', cursor: 'pointer', marginRight: 6 }
const btnDel = { padding: '4px 8px', fontSize: 14, background: 'transparent', border: 'none', cursor: 'pointer' }
