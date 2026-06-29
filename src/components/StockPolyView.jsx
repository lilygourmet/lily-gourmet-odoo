import { useState, useEffect } from 'react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import { loadPolyStock, loadPolyConsumption, consumptionFor, setStockBase, setMinMax } from '../lib/polyStock'

// Onglet « Stock poly » : morceaux découpés par taille (diamètre) × hauteur (5 ou 2 cm).
// Stock réel = stock_base − consommation auto (poly réglés sur gâteaux livrés après base_date).
export default function StockPolyView({ user, activeView, onNavigate, onLogout }) {
  const [rows, setRows] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function reload() {
    setLoading(true); setErr('')
    try {
      const data = await loadPolyStock()
      const since = data.length
        ? data.reduce((m, r) => (r.base_date < m ? r.base_date : m), data[0].base_date)
        : new Date().toISOString()
      const ev = await loadPolyConsumption(since)
      setRows(data); setEvents(ev)
    } catch (e) {
      setErr(e?.message || String(e))
    } finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const items = rows.map(r => {
    const conso = consumptionFor(events, r.taille_cm, r.hauteur_cm, r.base_date)
    const current = Number(r.stock_base) - conso
    const aProduire = Math.max(0, Number(r.max) - current)
    const low = Number(r.max) > 0 && current <= Number(r.min)
    return { ...r, conso, current, aProduire, low }
  })
  const lowItems = items.filter(i => i.low && i.aProduire > 0)

  async function doInventory(it) {
    const v = window.prompt(`Stock réel de ${it.taille_cm} cm × ${it.hauteur_cm} cm (nombre de morceaux) ?`, String(Math.max(0, it.current)))
    if (v == null) return
    try { await setStockBase(it.id, Math.max(0, Math.floor(Number(v) || 0)), user.id); await reload(); toast.success('Stock mis à jour ✓') }
    catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
  }
  async function doAdd(it) {
    const v = window.prompt(`Combien de morceaux de ${it.taille_cm} cm × ${it.hauteur_cm} cm viens-tu de découper ?`, '0')
    if (v == null) return
    const add = Math.max(0, Math.floor(Number(v) || 0))
    if (!add) return
    try { await setStockBase(it.id, it.current + add, user.id); await reload(); toast.success(`+${add} ajoutés ✓`) }
    catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
  }
  async function saveMM(it, field, value) {
    const n = Math.max(0, Number(value) || 0)
    if (n === Number(it[field])) return
    try { await setMinMax(it.id, field === 'min' ? n : it.min, field === 'max' ? n : it.max, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
  }
  function prevenir() {
    if (!lowItems.length) { toast.error('Rien sous le minimum pour l\'instant ✓'); return }
    const lines = lowItems.map(i => `• ${i.taille_cm} cm × ${i.hauteur_cm} cm : découper ${i.aProduire} (stock ${i.current}, min ${i.min})`)
    const msg = `🧊 Poly à découper :\n${lines.join('\n')}\nMerci !`
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer')
  }

  const num = { width: 56, padding: '4px 6px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, textAlign: 'center' }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.25rem' }}>
        <h1 className="font-fraunces italic" style={{ fontSize: 26, margin: '0 0 4px', color: '#1a0f0a' }}>🧊 Stock poly</h1>
        <p style={{ color: '#7a6f66', fontSize: 13, margin: '0 0 14px' }}>
          Morceaux découpés par taille × hauteur. Le stock baisse tout seul selon les poly réglés sur les gâteaux.
          Quand un article passe sous le minimum (rouge), préviens la personne qui découpe.
        </p>
        <button onClick={() => onNavigate('decoupe-poly')} title="Écran simple pour la personne qui découpe (téléphone)"
          style={{ marginBottom: 14, background: '#993556', color: '#fff', border: 'none', borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
📱 Ouvrir l'écran découpe (Hamid)
        </button>

        {lowItems.length > 0 && (
          <div style={{ background: '#fdecec', border: '1px solid #e0b4b4', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: '#993556', fontWeight: 600 }}>⚠️ {lowItems.length} article(s) sous le minimum.</span>
            <button onClick={prevenir} style={{ marginLeft: 'auto', background: '#25D366', color: '#fff', border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📱 Prévenir (WhatsApp) — liste à découper
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: '#7a6f66', padding: '40px 0' }}>Chargement…</div>
        ) : err ? (
          <div style={{ background: '#fff', border: '1px solid #e0b4b4', borderRadius: 12, padding: 16, color: '#993556' }}>
            Erreur : {err}<br /><span style={{ fontSize: 12, color: '#7a6f66' }}>Si la table n'existe pas encore, lance d'abord le script SQL <code>supabase/poly_stock.sql</code>.</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5d8c3', borderRadius: 12, overflow: 'hidden', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f6efe2', color: '#993556' }}>
                <th style={{ padding: '9px 11px', textAlign: 'left' }}>Taille</th>
                <th style={{ padding: '9px 11px', textAlign: 'center' }}>Hauteur</th>
                <th style={{ padding: '9px 11px', textAlign: 'center' }}>Stock</th>
                <th style={{ padding: '9px 11px', textAlign: 'center' }}>Min</th>
                <th style={{ padding: '9px 11px', textAlign: 'center' }}>Max</th>
                <th style={{ padding: '9px 11px', textAlign: 'center' }}>À produire</th>
                <th style={{ padding: '9px 11px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} style={{ borderTop: '1px solid #f0e9da', background: it.low ? '#fdecec' : '#fff' }}>
                  <td style={{ padding: '8px 11px', fontWeight: 600 }}>{it.taille_cm} cm</td>
                  <td style={{ padding: '8px 11px', textAlign: 'center' }}>{it.hauteur_cm} cm</td>
                  <td style={{ padding: '8px 11px', textAlign: 'center', fontWeight: 700, color: it.low ? '#c0392b' : '#27500A' }}>{it.current}</td>
                  <td style={{ padding: '8px 11px', textAlign: 'center' }}>
                    <input type="number" min="0" defaultValue={it.min} key={'min' + it.id + it.min} onBlur={e => saveMM(it, 'min', e.target.value)} style={num} />
                  </td>
                  <td style={{ padding: '8px 11px', textAlign: 'center' }}>
                    <input type="number" min="0" defaultValue={it.max} key={'max' + it.id + it.max} onBlur={e => saveMM(it, 'max', e.target.value)} style={num} />
                  </td>
                  <td style={{ padding: '8px 11px', textAlign: 'center', fontWeight: 600, color: it.aProduire > 0 ? '#993556' : '#aaa' }}>{it.aProduire || '—'}</td>
                  <td style={{ padding: '8px 11px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => doAdd(it)} title="J'ai découpé des morceaux" style={{ background: '#993556', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 9px', fontSize: 12, cursor: 'pointer', marginRight: 5 }}>+ découpé</button>
                    <button onClick={() => doInventory(it)} title="Corriger le stock réel" style={{ background: '#fff', color: '#993556', border: '1px solid #e5d8c3', borderRadius: 7, padding: '5px 9px', fontSize: 12, cursor: 'pointer' }}>inventaire</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
