import { useState, useEffect, useMemo } from 'react'
import { loadEmployes, deleteEmploye } from '../../lib/hr'
import EmployeEditModal from './EmployeEditModal'

export default function EmployesTab({ user }) {
  const [employes, setEmployes] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('actif')  // 'actif' | 'inactif' | 'tous'
  const [search, setSearch] = useState('')
  const [editingEmp, setEditingEmp] = useState(null)  // null = pas d'édition, {} = nouveau, {...} = édit

  async function reload() {
    setLoading(true)
    try {
      const list = await loadEmployes(filter === 'tous' ? null : filter === 'actif')
      setEmployes(list)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [filter])

  const filtered = useMemo(() => {
    if (!search.trim()) return employes
    const s = search.trim().toLowerCase()
    return employes.filter(e =>
      (e.nom || '').toLowerCase().includes(s) ||
      (e.poste || '').toLowerCase().includes(s) ||
      (e.cnss || '').includes(s) ||
      (e.cin || '').includes(s)
    )
  }, [employes, search])

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
                <Th>Poste</Th>
                <Th>CNSS</Th>
                <Th>CIN</Th>
                <Th>Entrée</Th>
                <Th>Salaire</Th>
                <Th>Type</Th>
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
                  <Td style={{ color: '#6F6A60' }}>{e.poste || '—'}</Td>
                  <Td>{e.cnss || '—'}</Td>
                  <Td>{e.cin || '—'}</Td>
                  <Td>{fmtDate(e.date_entree)}</Td>
                  <Td>{e.salaire_net ? `${Number(e.salaire_net).toLocaleString('fr-FR')} dh` : '—'}</Td>
                  <Td>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999,
                      background: e.type_contrat === 'CDI' ? '#EAF3DE' : e.type_contrat === 'Stage' ? '#E6F1FB' : '#F4F0EA',
                      color: e.type_contrat === 'CDI' ? '#27500A' : e.type_contrat === 'Stage' ? '#0C447C' : '#6F6A60',
                    }}>{e.type_contrat || '—'}</span>
                  </Td>
                  <Td>
                    <button onClick={() => setEditingEmp(e)} style={btnEdit}>✏️</button>
                    <button onClick={() => handleDelete(e)} style={btnDel}>🗑️</button>
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
