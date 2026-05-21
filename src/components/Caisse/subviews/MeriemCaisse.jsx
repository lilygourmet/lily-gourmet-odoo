import { useState, useEffect, useMemo } from 'react'
import { loadMouvementsMonth, loadCaisseBalance, loadMonthStats, loadCategories, addMouvement, updateMouvement, deleteMouvement, isMonthClosed, cloturerMois } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
import AjoutSortieModal from '../modals/AjoutSortieModal'
import AjoutEntreeModal from '../modals/AjoutEntreeModal'
import ClotureMoisModal from '../modals/ClotureMoisModal'
import AuditLogPanel from '../AuditLogPanel'

export default function MeriemCaisse({ user }) {
  return <CaisseGenericView caisseOwner="meriem" user={user} accent={{ bg: '#EAF3DE', text: '#27500A', border: '#97C459' }} />
}

export function CaisseGenericView({ caisseOwner, user, accent }) {
  const isAdmin = !!(user?.perm_caisse_admin || user?.role === 'admin')
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [mouvements, setMouvements] = useState([])
  const [balance, setBalance] = useState(0)
  const [stats, setStats] = useState({ entrees: 0, sorties: 0, byCat: {} })
  const [filter, setFilter] = useState('all')
  const [categories, setCategories] = useState([])
  const [showSortie, setShowSortie] = useState(false)
  const [showEntree, setShowEntree] = useState(false)
  const [showCloture, setShowCloture] = useState(false)
  const [closed, setClosed] = useState(false)

  useEffect(() => { (async () => {
    setCategories(await loadCategories(caisseOwner))
  })() }, [caisseOwner])

  useEffect(() => { reload() }, [caisseOwner, year, month])

  async function reload() {
    const [mvts, bal, st, cls] = await Promise.all([
      loadMouvementsMonth(caisseOwner, year, month),
      loadCaisseBalance(caisseOwner),
      loadMonthStats(caisseOwner, year, month),
      isMonthClosed(caisseOwner, year, month),
    ])
    setMouvements(mvts); setBalance(bal); setStats(st); setClosed(cls)
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return mouvements
    if (filter === 'entree') return mouvements.filter(m => m.type === 'entree')
    if (filter === 'sortie') return mouvements.filter(m => m.type === 'sortie')
    return mouvements.filter(m => m.category === filter)
  }, [mouvements, filter])

  const rankedCats = useMemo(() => {
    return Object.entries(stats.byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [stats])

  async function handleAddSortie({ amount, label, category, mvtDate, hasFacture }) {
    await addMouvement({ caisseOwner, type: 'sortie', sourceType: 'manuelle', amount, label, category, mvtDate, hasFacture, userId: user.id })
    setShowSortie(false); reload()
  }
  async function handleAddEntree({ amount, label, mvtDate }) {
    await addMouvement({ caisseOwner, type: 'entree', sourceType: 'manuelle', amount, label, mvtDate, userId: user.id })
    setShowEntree(false); reload()
  }
  async function handleCloture() {
    await cloturerMois({ caisseOwner, year, month, balance, userId: user.id })
    setShowCloture(false); reload()
  }
  async function handleDeleteMvt(id) {
    if (!confirm('Supprimer ce mouvement ? (l\'action sera enregistrée dans l\'historique)')) return
    await deleteMouvement(id, user.id); reload()
  }
  async function handleEditAmount(mvt) {
    const nv = prompt('Nouveau montant :', mvt.amount)
    if (!nv || isNaN(Number(nv))) return
    await updateMouvement(mvt.id, { amount: Number(nv) }, user.id)
    reload()
  }

  const palette = ['#993556', '#C77B9F', '#EF9F27', '#378ADD', '#7F77DD', '#1D9E75', '#D85A30', '#9B968D']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, overflowX: 'auto' }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: month === m.idx ? accent.bg : '#F4F0EA',
            color:      month === m.idx ? accent.text : '#6F6A60',
            fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{m.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: accent.bg, border: `0.5px solid ${accent.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: accent.text, opacity: 0.85 }}>Solde actuel · caisse {caisseOwner === 'meriem' ? 'Meriem' : 'Layla LG'}</div>
          <div style={{ fontSize: 36, fontWeight: 500, color: accent.text, margin: '8px 0 4px' }}>{fmtMoney(balance)}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12, color: accent.text }}>
            <div>↓ Entrées : <strong>{fmtMoney(stats.entrees)}</strong></div>
            <div>↑ Sorties : <strong>{fmtMoney(stats.sorties)}</strong></div>
          </div>
          {closed && <div style={{ marginTop: 12, fontSize: 12, padding: '6px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, display: 'inline-block', color: accent.text }}>🔒 Mois clôturé</div>}
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: '#6F6A60', marginBottom: 8 }}>Sorties par catégorie</div>
          {rankedCats.length === 0 && <div style={{ fontSize: 11, color: '#9B968D' }}>Aucune sortie ce mois</div>}
          {rankedCats.map(([cat, amt], i) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 0' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: palette[i % palette.length] }} />
              <span style={{ flex: 1, color: '#6F6A60' }}>{cat}</span>
              <span style={{ fontWeight: 500 }}>{fmtMoney(amt)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button disabled={closed} onClick={() => setShowSortie(true)} style={{ ...btnPrimary, opacity: closed ? 0.4 : 1 }}>↑ Ajouter sortie</button>
        <button disabled={closed} onClick={() => setShowEntree(true)} style={{ ...btnNormal, opacity: closed ? 0.4 : 1 }}>↓ Ajouter entrée manuelle</button>
        <button disabled={closed} onClick={() => setShowCloture(true)} style={{ ...btnNormal, marginLeft: 'auto', opacity: closed ? 0.4 : 1 }}>📁 Clôturer le mois</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={filter === 'all'}    onClick={() => setFilter('all')}>Tout</Chip>
        <Chip active={filter === 'entree'} onClick={() => setFilter('entree')}>Entrées</Chip>
        <Chip active={filter === 'sortie'} onClick={() => setFilter('sortie')}>Sorties</Chip>
        {categories.map(c => (
          <Chip key={c.id} active={filter === c.name} onClick={() => setFilter(c.name)}>{c.emoji} {c.name}</Chip>
        ))}
      </div>

      {filtered.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>Aucun mouvement.</div>}
      {filtered.map(mvt => (
        <div key={mvt.id} style={{
          display: 'grid', gridTemplateColumns: '90px 1fr 150px 110px 32px', gap: 12, alignItems: 'center',
          padding: '10px 14px', borderRadius: 8, marginBottom: 4, background: 'white',
          border: '0.5px solid #E8E2D8', borderLeft: `3px solid ${mvt.type === 'entree' ? '#97C459' : '#E5C0B6'}`,
        }}>
          <div style={{ fontSize: 11, color: '#6F6A60' }}>{fmtDateCourte(mvt.mvt_date)}</div>
          <div style={{ fontSize: 13 }}>{mvt.label}</div>
          <div>{mvt.category && <span style={catTag}>{mvt.category}</span>}</div>
          <div style={{ textAlign: 'right', fontWeight: 500, color: mvt.type === 'entree' ? '#1D7A5C' : '#99201E' }}>
            {mvt.type === 'entree' ? '+ ' : '− '}{fmtMoney(Math.abs(mvt.amount)).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span>
          </div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {!mvt.month_locked && isAdmin && (
              <>
                <button onClick={() => handleEditAmount(mvt)}
                  title="Modifier le montant"
                  style={{ background: 'transparent', border: '1px solid #E8E2D8', cursor: 'pointer', color: '#6F6A60', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}>✎</button>
                <button onClick={() => handleDeleteMvt(mvt.id)}
                  title="Supprimer ce mouvement"
                  style={{ background: 'transparent', border: '1px solid #F2D1D0', cursor: 'pointer', color: '#99201E', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}>🗑</button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Log déroulable en bas */}
      <AuditLogPanel entityType="mouvement" title="📜 Historique des mouvements caisse" />

      {showSortie && (
        <AjoutSortieModal categories={categories} onClose={() => setShowSortie(false)} onSubmit={handleAddSortie} caisseOwner={caisseOwner} />
      )}
      {showEntree && (
        <AjoutEntreeModal onClose={() => setShowEntree(false)} onSubmit={handleAddEntree} />
      )}
      {showCloture && (
        <ClotureMoisModal balance={balance} year={year} month={month} caisseOwner={caisseOwner}
          onClose={() => setShowCloture(false)} onConfirm={handleCloture} />
      )}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
const catTag = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#F4F0EA', color: '#6F6A60' }

function Chip({ active, onClick, children }) {
  return <button onClick={onClick} style={{
    fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: 'none',
    background: active ? '#3A3733' : '#F4F0EA',
    color:      active ? 'white'   : '#6F6A60',
  }}>{children}</button>
}
