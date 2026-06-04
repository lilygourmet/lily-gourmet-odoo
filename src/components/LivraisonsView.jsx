import { useState, useEffect, useMemo, Fragment } from 'react'
import { Truck, CheckCircle2, Phone, MapPin } from 'lucide-react'
import { loadSalesLinesForDate, loadSalesLinesForRange, loadSalesLinesForOrders, groupDeliveriesWithFullOrder, stripOdooPrefix } from '../lib/salesLines'
import { loadLivreurs, loadDeliveryStates, assignDelivery, acceptDelivery, refuseDelivery, setLivraisonFaite } from '../lib/deliveries'
import { isLivreur } from '../lib/auth'

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => ymd(new Date())
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d) }
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const labelDate = iso => { const d = new Date(iso + 'T12:00:00'); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}` }
// Pour les livreurs : fenêtre de livraisons à venir affichée d'un coup (jours).
const DAYS_AHEAD = 14

export default function LivraisonsView({ user }) {
  const livreur = isLivreur(user)
  // Vue multi-jours sans calendrier : seulement pour les livreurs NON-défaut (Hamza).
  // Le livreur défaut (Hamid) garde l'affichage par jour habituel.
  const multiDay = livreur && !user.livreur_defaut
  const [date, setDate] = useState(todayISO())
  const [deliveries, setDeliveries] = useState([])
  const [livreurs, setLivreurs] = useState([])
  const [states, setStates] = useState({})   // order_num -> {livreur_id, livraison_faite, statut, assigned_by}
  const [sel, setSel] = useState({})          // order_num -> livreur_id choisi (avant d'assigner)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const defaultLivreurId = useMemo(() => livreurs.find(l => l.livreur_defaut)?.id || null, [livreurs])

  async function reload() {
    setErr('')
    try {
      const [lines, livs] = await Promise.all([
        multiDay ? loadSalesLinesForRange(todayISO(), DAYS_AHEAD) : loadSalesLinesForDate(date),
        loadLivreurs(),
      ])
      setLivreurs(livs)
      const allLivr = (lines || []).filter(l => l.category === 'LIVR')
      // Lignes COMPLÈTES des commandes livrées (toutes dates) → détail produits toujours présent.
      const fullLines = await loadSalesLinesForOrders(allLivr.map(l => l.order_num))
      const entry = (e, day) => ({ day, hour: undefined, clientName: e.clientName, clientPhone: e.clientPhone, orderNote: e.orderNote, orderTotal: e.orderTotal, orderAcompte: e.orderAcompte, orderNum: e.orderNum, items: e.items })
      const list = []
      if (multiDay) {
        // Livreur : toutes les livraisons à venir (aujourd'hui + jours suivants), groupées par jour.
        const days = [...new Set(allLivr.map(l => ymd(new Date(l.delivery_at))))].sort()
        for (const day of days) {
          const dayLivr = allLivr.filter(l => ymd(new Date(l.delivery_at)) === day)
          const grouped = groupDeliveriesWithFullOrder(dayLivr, fullLines)
          for (const [hour, clientMap] of grouped.entries())
            for (const [, e] of clientMap.entries())
              list.push({ ...entry(e, day), hour })
        }
        list.sort((a, b) => (a.day + a.hour).localeCompare(b.day + b.hour))
      } else {
        const grouped = groupDeliveriesWithFullOrder(allLivr, fullLines)
        for (const [hour, clientMap] of grouped.entries())
          for (const [, e] of clientMap.entries())
            list.push({ ...entry(e, date), hour })
        list.sort((a, b) => a.hour.localeCompare(b.hour))
      }
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
      const dateCourte = date.split('-').reverse().slice(0, 2).join('/')   // "04/06"
      const titre = `🚚 Livraison ${dateCourte} ${d.hour} · ${d.clientName}`
      const reste = typeof d.orderTotal === 'number' ? Math.max(0, d.orderTotal - (d.orderAcompte || 0)) : null
      const desc = [
        `📅 ${labelDate(date)} · ${d.hour}`,
        `👤 ${d.clientName}${d.clientPhone ? ' · ' + d.clientPhone : ''}`,
        d.orderNote ? `📍 ${d.orderNote}` : null,
        reste !== null ? `💵 Reste à encaisser : ${reste.toLocaleString('fr-FR')} dh` : null,
        d.orderNum ? `N° ${d.orderNum}` : null,
      ].filter(Boolean).join('\n')
      const autoAccept = !!livreurId && livreurId === defaultLivreurId
      await assignDelivery({ orderNum: d.orderNum, livreurId: livreurId || null, byUserId: user.id, titre, description: desc, dueDate: date, autoAccept })
      setStates(s => ({ ...s, [d.orderNum]: { ...s[d.orderNum], livreur_id: livreurId || null, statut: livreurId ? (autoAccept ? 'acceptee' : 'assignee') : null } }))
      // Avertit si le livreur choisi n'a pas de WhatsApp (il ne sera prévenu que dans l'app).
      if (livreurId) {
        const l = livreurs.find(x => x.id === livreurId)
        if (l && !l.whatsapp) {
          alert(`⚠️ ${l.full_name || l.username} n'a pas de numéro WhatsApp.\nIl verra la livraison dans l'app, mais ne recevra pas de message WhatsApp.\n(Ajoute son numéro dans Admin → Users.)`)
        }
      }
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  const livreurNom = user.full_name || user.username || ''
  const labelLivraison = d => `${date.split('-').reverse().slice(0, 2).join('/')} ${d.hour} · ${d.clientName}`

  async function handleAccept(d) {
    setBusy(d.orderNum); setErr('')
    try {
      await acceptDelivery({ orderNum: d.orderNum, byUserId: user.id, label: labelLivraison(d), livreurName: livreurNom })
      setStates(s => ({ ...s, [d.orderNum]: { ...s[d.orderNum], livreur_id: user.id, statut: 'acceptee' } }))
    } catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  async function handleRefuse(d) {
    setBusy(d.orderNum); setErr('')
    try {
      await refuseDelivery({ orderNum: d.orderNum, byUserId: user.id, label: labelLivraison(d), livreurName: livreurNom })
      setStates(s => ({ ...s, [d.orderNum]: { ...s[d.orderNum], livreur_id: null, statut: 'refusee' } }))
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
  // Le livreur ne voit que SES livraisons (assignées à lui, + non assignées s'il
  // est le livreur défaut). Les autres (admin) voient tout.
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

      {/* Navigation par jour (masquée pour Hamza qui voit tout d'un coup) */}
      {!multiDay && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap', background: '#F4F0EA', borderRadius: 12, padding: '10px 12px' }}>
          <button onClick={() => setDate(d => addDays(d, -1))} style={btnNav}>◀</button>
          <span style={{ fontSize: 15, fontWeight: 500, minWidth: 180, textTransform: 'capitalize' }}>{labelDate(date)}</span>
          <button onClick={() => setDate(d => addDays(d, 1))} style={btnNav}>▶</button>
          <button onClick={() => setDate(todayISO())} style={{ ...btnNav, fontSize: 12 }}>Aujourd'hui</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8 }} />
        </div>
      )}

      {err && <div style={{ background: '#FCEEE8', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 36, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 14 }}>{multiDay ? 'Aucune livraison à venir.' : 'Aucune livraison ce jour.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((d, idx) => {
            const s = states[d.orderNum] || {}
            const faite = !!s.livraison_faite
            const statut = s.statut
            const bg = faite ? '#EAF3DE' : statut === 'refusee' ? '#FCEEE8' : 'white'
            const lid = s.livreur_id || null
            const mine = lid === user.id || (lid === null && user.livreur_defaut)
            const assignedName = lid ? (livreurs.find(l => l.id === lid)?.full_name || livreurs.find(l => l.id === lid)?.username || '') : ''
            const zoneRaw = (d.items || []).find(it => it.category === 'LIVR')?.product_name
            const zone = zoneRaw ? stripOdooPrefix(zoneRaw).replace(/^livr[-\s]*/i, '').trim() : ''
            const showDay = multiDay && (idx === 0 || visible[idx - 1].day !== d.day)
            return (
              <Fragment key={d.day + '|' + d.orderNum}>
                {showDay && <div style={{ fontWeight: 700, color: '#993556', fontSize: 15, textTransform: 'capitalize', marginTop: idx === 0 ? 2 : 10 }}>{labelDate(d.day)}</div>}
                <div style={{ background: bg, border: '1px solid #e5d8c3', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#993556', marginRight: 8 }}>{d.hour}</span>
                    <strong style={{ fontSize: 14 }}>{d.clientName}</strong>
                    {d.orderNum && <span style={{ fontSize: 11, color: '#8a7a70', marginLeft: 6 }}>{d.orderNum}</span>}
                    {zone && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#1a5fb4', background: '#E8F0FB', padding: '2px 8px', borderRadius: 20 }}>📍 {zone}</span>}
                    {d.clientPhone && <div style={{ fontSize: 12, color: '#4a3a30', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> <a href={`tel:${d.clientPhone}`} style={{ color: '#4a3a30' }}>{d.clientPhone}</a></div>}
                  </div>
                </div>
                {d.orderNote && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.orderNote)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1a5fb4', marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 4, textDecoration: 'underline' }}><MapPin size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {d.orderNote}</a>}

                {Array.isArray(d.items) && d.items.filter(it => it.category !== 'LIVR').length > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#FAF7F2', borderRadius: 8, fontSize: 13, color: '#4a3a30' }}>
                    {d.items.filter(it => it.category !== 'LIVR').map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '1px 0' }}>
                        <span style={{ fontFamily: 'monospace', color: '#993556', fontWeight: 600, flexShrink: 0 }}>×{it.quantity}</span>
                        <span>{it.product_name}</span>
                      </div>
                    ))}
                  </div>
                )}

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
                      <select value={sel[d.orderNum] ?? (effLivreur(d) || '')} disabled={busy === d.orderNum}
                        onChange={e => setSel(m => ({ ...m, [d.orderNum]: e.target.value }))}
                        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e5d8c3', borderRadius: 8 }}>
                        <option value="">— non assigné —</option>
                        {livreurs.map(l => <option key={l.id} value={l.id}>{l.full_name || l.username}{l.livreur_defaut ? ' (défaut)' : ''}</option>)}
                      </select>
                      <button onClick={() => handleAssign(d, sel[d.orderNum] ?? effLivreur(d) ?? '')} disabled={busy === d.orderNum}
                        style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: '#993556', color: 'white', border: 'none' }}>
                        {statut ? 'Réassigner' : 'Assigner'}
                      </button>
                      {statut === 'assignee' && <span style={{ fontSize: 11, color: '#8a6d3b', background: '#FBF1D8', padding: '3px 8px', borderRadius: 20 }}>🕐 À confirmer</span>}
                      {statut === 'acceptee' && <span style={{ fontSize: 11, color: '#27500A', background: '#EAF3DE', padding: '3px 8px', borderRadius: 20 }}>✅ Acceptée</span>}
                      {statut === 'refusee' && <span style={{ fontSize: 11, fontWeight: 600, color: '#A32D2D', background: '#FBD9D0', padding: '3px 8px', borderRadius: 20 }}>⚠️ Refusée — à réassigner</span>}
                    </>
                  )}

                  {/* Livreur : accepter/refuser seulement SES livraisons à confirmer */}
                  {livreur && mine && statut === 'assignee' && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button onClick={() => handleAccept(d)} disabled={busy === d.orderNum}
                        style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: '#27500A', color: 'white', border: 'none' }}>
                        ✅ J'accepte
                      </button>
                      <button onClick={() => handleRefuse(d)} disabled={busy === d.orderNum}
                        style={{ padding: '8px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer', background: 'white', color: '#A32D2D', border: '1px solid #A32D2D' }}>
                        🚫 Pas disponible
                      </button>
                    </div>
                  )}
                  {/* Bouton "Livré" : admin (toujours), ou livreur sur SES livraisons (non à confirmer) */}
                  {(!livreur || (mine && statut !== 'assignee')) && (
                    <button onClick={() => handleFaite(d, !faite)} disabled={busy === d.orderNum}
                      style={{ marginLeft: 'auto', padding: '7px 12px', fontSize: 12, borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: faite ? '#27500A' : 'white', color: faite ? 'white' : '#27500A', border: '1px solid #27500A' }}>
                      <CheckCircle2 size={14} /> {faite ? 'Livré ✓' : 'Marquer livré'}
                    </button>
                  )}
                  {/* Livreur : livraison d'un autre → lecture seule */}
                  {livreur && !mine && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8a7a70', background: '#F4F0EA', padding: '3px 8px', borderRadius: 20 }}>
                      {statut === 'refusee' ? '⚠️ à réassigner' : assignedName ? `Assignée à ${assignedName}` : 'Non assignée'}
                    </span>
                  )}
                </div>
              </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
