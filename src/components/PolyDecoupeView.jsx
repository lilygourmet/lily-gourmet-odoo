import { useState, useEffect } from 'react'
import { loadPolyStock, loadPolyConsumption, consumptionFor, setStockBase } from '../lib/polyStock'
import { toast } from '../lib/toast'

// Écran TÉLÉPHONE pour la personne qui découpe le poly (Hamid).
// Montre, par taille × hauteur, combien il faut découper (max − stock),
// puis elle note combien elle a découpé → met à jour le stock poly.
export default function PolyDecoupeView({ user }) {
  const [rows, setRows] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [cut, setCut] = useState({})        // { id: nombre découpé }
  const [saving, setSaving] = useState(false)

  async function reload() {
    setLoading(true); setErr('')
    try {
      const data = await loadPolyStock()
      const since = data.length
        ? data.reduce((m, r) => (r.base_date < m ? r.base_date : m), data[0].base_date)
        : new Date().toISOString()
      const ev = await loadPolyConsumption(since)
      setRows(data); setEvents(ev); setCut({})
    } catch (e) { setErr(e?.message || String(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const items = rows.map(r => {
    const conso = consumptionFor(events, r.taille_cm, r.hauteur_cm, r.base_date)
    const current = Number(r.stock_base) - conso
    const aProduire = Math.max(0, Number(r.max) - current)
    return { ...r, current, aProduire, low: Number(r.max) > 0 && current <= Number(r.min) }
  })
  // À découper en priorité (manque), du plus gros besoin au plus petit.
  const todo = items.filter(i => i.aProduire > 0).sort((a, b) => b.aProduire - a.aProduire)

  const bump = (id, d) => setCut(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) + d) }))
  const setVal = (id, v) => setCut(c => ({ ...c, [id]: Math.max(0, parseInt(v, 10) || 0) }))

  async function save() {
    const toApply = todo.filter(i => (cut[i.id] || 0) > 0)
    if (!toApply.length) { toast.error('Note d\'abord ce que tu as découpé.'); return }
    setSaving(true)
    try {
      for (const i of toApply) await setStockBase(i.id, i.current + (cut[i.id] || 0), user?.id)
      toast.success('Découpe enregistrée ✓')
      await reload()
    } catch (e) { toast.error('Erreur : ' + (e?.message || e)) }
    finally { setSaving(false) }
  }

  const totalCut = todo.reduce((s, i) => s + (cut[i.id] || 0), 0)
  const totalTodo = todo.reduce((s, i) => s + i.aProduire, 0)

  const stepBtn = { width: 56, height: 56, borderRadius: 14, border: '2px solid #993556', background: '#fff', color: '#993556', fontSize: 28, fontWeight: 800, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }
  const numInput = { width: '100%', border: 'none', background: 'transparent', textAlign: 'center', fontSize: 36, fontWeight: 800, color: '#1a0f0a', MozAppearance: 'textfield' }

  return (
    <div style={{ minHeight: '100dvh', background: '#ece3d6' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', minHeight: '100dvh', background: '#fcfbf8', display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 5, background: '#993556', color: '#fff', padding: '16px 18px 14px' }}>
          <div className="font-fraunces italic" style={{ fontSize: 24 }}>🧊 Découpe poly</div>
          <div style={{ fontSize: 13, opacity: .85, marginTop: 2 }}>Ce qu'il faut découper aujourd'hui</div>
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,.2)', borderRadius: 999, height: 9, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#fff', borderRadius: 999, width: (totalTodo ? Math.min(100, Math.round(totalCut / totalTodo * 100)) : 0) + '%', transition: 'width .25s' }} />
          </div>
          <div style={{ fontSize: 12, opacity: .9, marginTop: 6 }}>{totalCut} découpés sur {totalTodo} à faire</div>
        </header>

        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#8a7a70', padding: '40px 0' }}>Chargement…</div>
          ) : err ? (
            <div style={{ background: '#fff', border: '1px solid #e0b4b4', borderRadius: 14, padding: 16, color: '#993556' }}>Erreur : {err}</div>
          ) : todo.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#2f7d4f', fontWeight: 600, padding: '50px 16px', fontSize: 16 }}>✓ Rien à découper pour l'instant.</div>
          ) : todo.map(it => {
            const done = (cut[it.id] || 0) >= it.aProduire
            return (
              <div key={it.id} style={{ background: done ? '#f4fbf6' : '#fff', border: '1px solid ' + (done ? '#bfe0c8' : '#e7dcc9'), borderRadius: 16, padding: 14, boxShadow: '0 4px 14px rgba(90,40,30,.05)' }}>
                {done && <span style={{ float: 'right', color: '#2f7d4f', fontSize: 20 }}>✓</span>}
                <div style={{ fontSize: 18, fontWeight: 700 }}>{it.taille_cm} cm <span style={{ color: '#8a7a70', fontWeight: 500, fontSize: 14 }}>· {it.hauteur_cm} cm de haut</span></div>
                <div style={{ fontSize: 12.5, color: '#8a7a70', marginTop: 2 }}>En stock : {it.current}</div>
                <span style={{ display: 'inline-block', marginTop: 9, fontSize: 13, fontWeight: 700, color: done ? '#2f7d4f' : '#993556', background: done ? '#e3f3e9' : '#fbeaf0', borderRadius: 999, padding: '4px 12px' }}>À découper : {it.aProduire}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
                  <button onClick={() => bump(it.id, -1)} style={stepBtn}>−</button>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <input type="number" inputMode="numeric" min="0" value={cut[it.id] || 0} onFocus={e => e.target.select()} onChange={e => setVal(it.id, e.target.value)} style={numInput} />
                    <div style={{ fontSize: 11, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3 }}>découpé</div>
                  </div>
                  <button onClick={() => bump(it.id, 1)} style={stepBtn}>+</button>
                </div>
              </div>
            )
          })}
        </div>

        {todo.length > 0 && (
          <footer style={{ position: 'sticky', bottom: 0, background: '#fcfbf8', borderTop: '1px solid #e7dcc9', padding: '12px 14px calc(12px + env(safe-area-inset-bottom))' }}>
            <button onClick={save} disabled={saving || totalCut === 0} style={{ width: '100%', padding: 16, border: 'none', borderRadius: 14, background: (saving || totalCut === 0) ? '#c9a7b4' : '#993556', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Enregistrement…' : `✓ Enregistrer la découpe${totalCut ? ' (' + totalCut + ')' : ''}`}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
