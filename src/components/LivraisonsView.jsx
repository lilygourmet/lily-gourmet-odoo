import { useState, useEffect, useMemo } from 'react'
import { Truck, CheckCircle2, Phone, MapPin } from 'lucide-react'
import { loadSalesLinesForDate, groupDeliveriesWithFullOrder } from '../lib/salesLines'
import { loadLivreurs, loadDeliveryStates, assignDelivery, setLivraisonFaite } from '../lib/deliveries'
import { isLivreur } from '../lib/auth'

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => ymd(new Date())
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d) }
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const labelDate = iso => { const d = new Date(iso + 'T12:00:00'); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}` }

export default function LivraisonsView({ user }) {
  const livreur = isLivreur(user)
  const [date, setDate] = useState(todayISO())
  const [deliveries, setDeliveries] = useState([])
  const [livreurs, setLivreurs] = useState([])
  const [states, setStates] = useState({})   // order_num -> {livreur_id, livraison_faite}
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const defaultLivreurId = useMemo(() => livreurs.find(l => l.livreur_defaut)?.id || null, [livreurs])

  async function reload() {
    setErr('')
    try {
      const [lines, livs] = await Promise.all([loadSalesLinesForDate(date), loadLivreurs()])
      setLivreurs(livs)
      const livr = (lines || []).filter(l => l.category === 'LIVR')
      const grouped = groupDeliveriesWithFullOrder(livr, lines)
      const list = []
      for (const [hour, clientMap] of grouped.entries())
        for (const [, e] of clientMap.entries())
          list.push({ hour, clientName: e.clientName, clientPhone: e.clientPhone, orderNote: e.orderNote, orderTotal: e.orderTotal, orderAcompte: e.orderAcompte, orderNum: e.orderNum })
      list.sort((a, b) => a.hour.localeCompare(b.hour))
      setStates(await loadDeliveryStates(list.map(d => d.orderNum)))
      setDeliveries(list)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => reload()).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const effLivreur = d => states[d.orderNum]?.livreur_id || defaultLivreurId

  async function handleAssign(d, livreurId) {
    setBusy(d.orderNum); setErr('')
    try {
      await assignDelivery({ orderNum: d.orderNum, livreurId: livreurId || null, byUserId: user.id, titre: `🚚 Livraison ${d.orderNum || ''} · ${d.clientName} · ${d.hour}` })
      setStates(s => ({ ...s, [d.orderNum]: { ...s[d.orderNum], livreur_id: livreurId || null } }))
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  async function handleFaite(d, faite) {
    setBusy(d.orderNum); setErr('')
    try {
      await setLivraisonFaite(d.orderNum, faite)
      setStates(s => ({ ...s, [d.orderNum]: { ...s[d.orderNum], livraison_faite: faite } }))
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  // Vue livreur : seulement SES livraisons (assignées à lui, ou non assignées s'il est le défaut)
  const visible = useMemo(() => {
    if (!livreur) return deliveries
    return deliveries.filter(d => {
      const lid = states[d.orderNum]?.livreur_id || null
      return lid === user.id || (lid === null && user.livreur_defaut)
    })
  }, [deliveries, states, livreur, user])

  const btnNav = { padding: '6px 12px', fontSize: 14, background: 'white', border: '1px solid #e5d8c3', borderRadius: 8, cursor: 'pointer' }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '1.25rem' }}>
      <h1 className="font-fraunces italic" style={{ fontSize: 26, margin: '0 0 12px', color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Truck size={22} /> Livraisons
      </h1>

      {/* Navigation par jour (calendrier rapide) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap', background: '#F4F0EA', borderRadius: 12, padding: '10px 12px' }}>
        <button onClick={() => setDate(d => addDays(d, -1))} style={btnNav}>◀</button>
        <span style={{ fontSize: 15, fontWeight: 500, minWidth: 180, textTransform: 'capitalize' }}>{labelDate(date)}</span>
        <button onClick={() => setDate(d => addDays(d, 1))} style={btnNav}>▶</button>
        <button onClick={() => setDate(todayISO())} style={{ ...btnNav, fontSize: 12 }}>Aujourd'hui</button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
      </div>

      {err && <div style={{ background: '#FCEEE8', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 36, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 14 }}>Aucune livraison ce jour.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(d => {
            const s = states[d.orderNum] || {}
            const faite = !!s.livraison_faite
            return (
              <div key={d.orderNum} style={{ background: faite ? '#EAF3DE' : 'white', border: '1px solid #e5d8c3', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#993556', marginRight: 8 }}>{d.hour}</span>
                    <strong style={{ fontSize: 14 }}>{d.clientName}</strong>
                    {d.orderNum && <span style={{ fontSize: 11, color: '#8a7a70', marginLeft: 6 }}>{d.orderNum}</span>}
                    {d.clientPhone && <div style={{ fontSize: 12, color: '#4a3a30', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> <a href={`tel:${d.clientPhone}`} style={{ color: '#4a3a30' }}>{d.clientPhone}</a></div>}
                  </div>
                </div>
                {d.orderNote && <div style={{ fontSize: 12, color: '#4a3a30', marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 4 }}><MapPin size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {d.orderNote}</div>}

                {typeof d.orderTotal === 'number' && (() => {
                  const avance = typeof d.orderAcompte === 'number' ? d.orderAcompte : 0
                  const reste = Math.max(0, d.orderTotal - avance)
                  return (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, padding: '8px 10px', background: '#FAF7F2', borderRadius: 8, fontSize: 13 }}>
                      <span style={{ color: '#4a3a30' }}>Total : <strong>{d.orderTotal.toLocaleString('fr-FR')} dh</strong></span>
                      <span style={{ color: '#4a3a30' }}>Avance : <strong>{avance.toLocaleString('fr-FR')} dh</strong></span>
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color: reste > 0 ? '#A32D2D' : '#27500A' }}>
                        Reste à encaisser : {reste.toLocaleString('fr-FR')} dh
                      </span>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  {!livreur && (
                    <>
                      <span style={{ fontSize: 11, color: '#8a7a70' }}>Livreur :</span>
                      <select value={effLivreur(d) || ''} disabled={busy === d.orderNum}
                        onChange={e => handleAssign(d, e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e5d8c3', borderRadius: 8 }}>
                        <option value="">— non assigné —</option>
                        {livreurs.map(l => <option key={l.id} value={l.id}>{l.full_name || l.username}{l.livreur_defaut ? ' (défaut)' : ''}</option>)}
                      </select>
                    </>
                  )}
                  <button onClick={() => handleFaite(d, !faite)} disabled={busy === d.orderNum}
                    style={{ marginLeft: 'auto', padding: '7px 12px', fontSize: 12, borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: faite ? '#27500A' : 'white', color: faite ? 'white' : '#27500A', border: '1px solid #27500A' }}>
                    <CheckCircle2 size={14} /> {faite ? 'Livré ✓' : 'Marquer livré'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
