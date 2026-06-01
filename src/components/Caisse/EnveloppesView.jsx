import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Banknote, ScrollText, Wallet, Coffee, ShoppingBag, MapPin, ArrowLeftRight } from 'lucide-react'
import { loadEnveloppesByMonth, loadDestinataires, assignEnveloppe, reassignEnveloppe, unassignEnveloppe, updateEnveloppeAssignedDate, loadSalairesYear } from '../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, envStyle, COLOR_PALETTE } from './_helpers'
import AttributionModal from './modals/AttributionModal'
import DetailReaffecterModal from './modals/DetailReaffecterModal'
import AuditLogPanel from './AuditLogPanel'

export default function EnveloppesView({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [enveloppes, setEnveloppes] = useState([])
  const [destinataires, setDestinataires] = useState([])
  const [salaires, setSalaires] = useState([])
  const [filter, setFilter] = useState('all') // 'all' | 'unassigned' | dest.id | 'sal-<id>'
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('cash') // 'cash' | 'cheque'
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [attributionEnv, setAttributionEnv] = useState(null)
  const [detailEnv, setDetailEnv]       = useState(null)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => { (async () => {
    setDestinataires(await loadDestinataires())
  })() }, [])

  useEffect(() => { reload() }, [year, month])

  async function reload() {
    setLoading(true)
    try {
      const [data, sals] = await Promise.all([loadEnveloppesByMonth(year, month), loadSalairesYear(year)])
      setEnveloppes(data)
      setSalaires(sals)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/caisse-api?action=sync-pos', { method: 'POST' })
      const json = await res.json()
      setLastSync(new Date())
      if (json.error) console.error(json.error)
      await reload()
    } catch (e) { console.error(e); alert('Erreur sync : ' + e.message) }
    setSyncing(false)
  }

  // Enveloppes du mois filtrées par méthode de paiement (espèces ou chèques)
  const envByMethod = useMemo(() => {
    return enveloppes.filter(e => (e.payment_method || 'cash') === paymentMethodFilter)
  }, [enveloppes, paymentMethodFilter])

  // Sources distinctes du mois (Café, Boutique, etc.) sur les enveloppes filtrées par méthode
  const sources = useMemo(() => {
    const set = new Set(envByMethod.map(e => e.source))
    return Array.from(set).sort()
  }, [envByMethod])

  // Map salaire_id -> bénéficiaire (Nezha/Layla)
  const salaireMap = useMemo(() => {
    const m = {}
    salaires.forEach(s => { m[s.id] = s.beneficiaire })
    return m
  }, [salaires])

  // Salaires référencés par les enveloppes du mois (pour les filtres)
  const salairesPresents = useMemo(() => {
    const ids = [...new Set(envByMethod.filter(e => e.salaire_id).map(e => e.salaire_id))]
    return ids.map(id => ({ id, beneficiaire: salaireMap[id] || 'salaire' }))
  }, [envByMethod, salaireMap])

  // Enveloppes filtrées (méthode + destinataire/salaire)
  const filteredEnveloppes = useMemo(() => {
    if (filter === 'all') return envByMethod
    if (filter === 'unassigned') return envByMethod.filter(e => !e.destinataire_id && !e.salaire_id)
    if (String(filter).startsWith('sal-')) return envByMethod.filter(e => String(e.salaire_id) === String(filter).slice(4))
    return envByMethod.filter(e => String(e.destinataire_id) === String(filter))
  }, [envByMethod, filter])

  // Groupé par source
  const bySource = useMemo(() => {
    const map = {}
    sources.forEach(s => { map[s] = [] })
    filteredEnveloppes.forEach(e => {
      if (!map[e.source]) map[e.source] = []
      map[e.source].push(e)
    })
    Object.keys(map).forEach(s => {
      // Tri ascendant (plus ancien → plus récent)
      map[s].sort((a, b) => a.session_date.localeCompare(b.session_date))
    })
    return map
  }, [filteredEnveloppes, sources])

  async function handleAssign(envId, destId, assignedDate) {
    try {
      await assignEnveloppe(envId, destId, user.id, assignedDate)
      setAttributionEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  async function handleReassign(envId, destId, assignedDate) {
    try {
      await reassignEnveloppe(envId, destId, user.id, assignedDate)
      setDetailEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  async function handleUpdateDate(envId, newDate) {
    try {
      await updateEnveloppeAssignedDate(envId, newDate, user.id)
      setDetailEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  async function handleUnassign(envId) {
    try {
      await unassignEnveloppe(envId)
      setDetailEnv(null)
      await reload()
    } catch (e) { alert(e.message) }
  }

  const monthDisplay = MOIS_TABS.find(m => m.idx === month)?.label || ''

  return (
    <div>
      {/* Header année + sync */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setYear(y => Math.max(2026, y - 1))} disabled={year <= 2026} style={{ ...btnSlim, opacity: year <= 2026 ? 0.4 : 1 }}>←</button>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
          <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
        </div>
        <button onClick={handleSync} disabled={syncing} style={{ ...btnNormal, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sync…' : 'Synchroniser'}
        </button>
      </div>

      {/* Toggle Espèces / Chèques */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setPaymentMethodFilter('cash')}
          style={{ ...(paymentMethodFilter === 'cash' ? toggleActiveStyle : toggleInactiveStyle), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Banknote size={15} /> Espèces
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethodFilter('cheque')}
          style={{ ...(paymentMethodFilter === 'cheque' ? toggleActiveStyle : toggleInactiveStyle), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <ScrollText size={15} /> Chèques
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethodFilter('virement')}
          style={{ ...(paymentMethodFilter === 'virement' ? toggleActiveStyle : toggleInactiveStyle), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <ArrowLeftRight size={15} /> Virements
        </button>
      </div>

      {/* Onglets mois */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)}
            style={{
              padding: '8px 16px', borderRadius: 999,
              border: month === m.idx ? '1px solid #993556' : '1px solid #e5d8c3',
              background: month === m.idx ? '#993556' : 'white',
              color:      month === m.idx ? '#faf7f2'  : '#1a0f0a',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>{m.label}</button>
        ))}
      </div>

      {/* Filtres rapides */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tout</Chip>
        <Chip active={filter === 'unassigned'} onClick={() => setFilter('unassigned')}>À affecter</Chip>
        {destinataires.map(d => (
          <Chip key={d.id} active={String(filter) === String(d.id)} onClick={() => setFilter(d.id)}>
            {d.name}
          </Chip>
        ))}
        {salairesPresents.map(s => (
          <Chip key={`sal-${s.id}`} active={filter === `sal-${s.id}`} onClick={() => setFilter(`sal-${s.id}`)}>
            <Wallet size={13} /> Salaire {s.beneficiaire}
          </Chip>
        ))}
      </div>

      {loading && <div style={{ color: '#4a3a30', padding: 20 }}>Chargement…</div>}

      {!loading && sources.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>
          Aucune enveloppe {paymentMethodFilter === 'cheque' ? 'chèque' : paymentMethodFilter === 'virement' ? 'virement' : 'espèces'} pour {monthDisplay} {year}.<br />
          Cliquez sur <strong>Synchroniser</strong> pour récupérer les sessions POS fermées d'Odoo.
        </div>
      )}

      {/* Grille N colonnes */}
      {!loading && sources.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 14,
        }}>
          {sources.map(src => (
            <div key={src}>
              <div style={{
                fontSize: 13, fontWeight: 500, padding: '10px 12px', background: '#F4F0EA',
                borderRadius: 8, marginBottom: 8, color: '#4a3a30',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {src === 'Café' ? <Coffee size={14} /> : src === 'Boutique' ? <ShoppingBag size={14} /> : <MapPin size={14} />} {src}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(bySource[src] || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: '#8a7a70', padding: 8 }}>Aucune enveloppe</div>
                ) : (bySource[src] || []).map(env => (
                  <EnveloppeCard key={env.id} env={env} salaireMap={salaireMap}
                    onClick={() => env.destinataire_id ? setDetailEnv(env) : setAttributionEnv(env)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Légende */}
      <div style={{ marginTop: 28, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#4a3a30' }}>
        {destinataires.map(d => {
          const c = COLOR_PALETTE[d.color_key]
          if (!c) return null
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: c.bg, border: `0.5px solid ${c.border}`, borderRadius: 3, display: 'inline-block' }} />
              {d.name}
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: '#F4F0EA', border: '1.5px dashed #C4BFB6', borderRadius: 3, display: 'inline-block' }} />
          À affecter
        </div>
      </div>

      <AuditLogPanel entityType="enveloppe" title="Historique des affectations" />

      {attributionEnv && (
        <AttributionModal env={attributionEnv} destinataires={destinataires}
          onClose={() => setAttributionEnv(null)}
          onAssign={(destId, date) => handleAssign(attributionEnv.id, destId, date)} />
      )}
      {detailEnv && (
        <DetailReaffecterModal env={detailEnv} destinataires={destinataires}
          onClose={() => setDetailEnv(null)}
          onReassign={(destId) => handleReassign(detailEnv.id, destId)}
          onUnassign={() => handleUnassign(detailEnv.id)}
          onUpdateDate={(newDate) => handleUpdateDate(detailEnv.id, newDate)} />
      )}
    </div>
  )
}

function EnveloppeCard({ env, onClick, salaireMap = {} }) {
  // Affectée à un salaire (et pas à un destinataire) → style + libellé "Salaire X"
  const salBenef = !env.destinataire_id && env.salaire_id ? salaireMap[env.salaire_id] : null
  const style = salBenef
    ? { bg: '#fdf1d3', border: '#dcb24f', text: '#5c4418', borderStyle: 'solid', borderWidth: '0.5px' }
    : envStyle(env.destinataire)
  return (
    <div onClick={onClick} style={{
      background: style.bg, borderColor: style.border, borderStyle: style.borderStyle, borderWidth: style.borderWidth,
      borderRadius: 12, padding: '10px 12px', cursor: 'pointer', color: style.text,
      boxShadow: '0 2px 6px rgba(122,42,68,0.06)',
    }}>
      <div style={{ fontSize: 11, opacity: 0.85 }}>{fmtDateCourte(env.session_date)}</div>
      <div style={{ fontSize: 15, fontWeight: 500, margin: '2px 0 3px' }}>{fmtMoney(env.amount_cash)}</div>
      {env.virement_client && (
        <div style={{ fontSize: 11, opacity: 0.95, marginBottom: 3 }}>{env.virement_client}</div>
      )}
      <div style={{ fontSize: 11, opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {env.destinataire ? env.destinataire.name : salBenef ? <><Wallet size={11} /> Salaire {salBenef}</> : 'À affecter'}
      </div>
      {env.assigner && (
        <div style={{ fontSize: 9, opacity: 0.65, marginTop: 2, fontStyle: 'italic' }}>
          par {env.assigner.username || env.assigner.full_name || '?'}
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  )
}

const btnSlim   = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }

const toggleActiveStyle = {
  flex: 1,
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid #993556',
  background: '#993556',
  color: '#faf7f2',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const toggleInactiveStyle = {
  flex: 1,
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid #e5d8c3',
  background: 'white',
  color: '#1a0f0a',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
