import { useState, useEffect, useMemo } from 'react'
import { Zap } from 'lucide-react'
import { loadAvailableEnveloppesForSalaire, loadSalaireEnveloppes, setSalaireEnveloppes, markSalairePret, updateMouvement } from '../../../lib/caisse'
import { fmtMoney, fmtDateCourte, currentYear, SALAIRE_COLORS } from '../_helpers'
import { supabase } from '../../../lib/supabase'

export default function CompositionSalaireModal({ salaire, onClose, userId }) {
  const [available, setAvailable] = useState([])
  const [attached, setAttached] = useState([])
  const [target, setTarget] = useState(salaire.target_amount)
  // Le reliquat est TOUJOURS reporté sur le salaire du mois suivant du même bénéficiaire.
  const reliquatDest = 'report_mois_suivant'
  const [busy, setBusy] = useState(false)

  useEffect(() => { reload() }, [])

  async function reload() {
    // Pour permettre de piocher dans plusieurs mois, on charge toute l'année courante
    const allMonths = []
    for (let m = 1; m <= 12; m++) {
      const list = await loadAvailableEnveloppesForSalaire(salaire.year, m)
      allMonths.push(...list)
    }
    const attachedList = await loadSalaireEnveloppes(salaire.id)
    // available = non attachées + attachées (pour avoir toutes les options visibles)
    const ids = new Set(attachedList.map(e => e.id))
    const av = allMonths.filter(e => !ids.has(e.id))
    setAvailable([...attachedList, ...av])
    setAttached(attachedList)
  }

  const selected = useMemo(() => available.filter(e => attached.some(a => a.id === e.id)), [available, attached])
  const cumule = useMemo(() => selected.reduce((s, e) => s + Number(e.amount_cash), 0), [selected])
  const reliquat = cumule - Number(target)
  const progress = Math.min(100, (cumule / Number(target)) * 100)

  function toggle(env) {
    if (attached.some(a => a.id === env.id)) {
      setAttached(attached.filter(a => a.id !== env.id))
    } else {
      setAttached([...attached, env])
    }
  }

  function autoFill() {
    // Algo glouton : on prend les plus récentes jusqu'à atteindre la cible
    const sorted = [...available].sort((a, b) => b.session_date.localeCompare(a.session_date))
    const picked = []
    let sum = 0
    for (const env of sorted) {
      if (sum >= Number(target)) break
      picked.push(env); sum += Number(env.amount_cash)
    }
    setAttached(picked)
  }

  async function saveDraft() {
    setBusy(true)
    try {
      await setSalaireEnveloppes(salaire.id, attached.map(a => a.id))
      onClose()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  async function validatePret() {
    if (cumule < Number(target)) {
      alert(`Manque ${fmtMoney(Number(target) - cumule)} — Tu peux sauvegarder en brouillon mais pas valider en Prêt à payer.`)
      return
    }
    setBusy(true)
    try {
      await setSalaireEnveloppes(salaire.id, attached.map(a => a.id))
      await markSalairePret(salaire.id, reliquat, reliquatDest)
      onClose()
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  async function changeTarget(newVal) {
    setTarget(newVal)
    await supabase.from('caisse_salaires').update({ target_amount: Number(newVal) }).eq('id', salaire.id)
  }

  const colorBen = SALAIRE_COLORS[salaire.beneficiaire]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 28, maxWidth: 720, width: '100%', maxHeight: '92vh', overflowY: 'auto', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Composer le salaire de {salaire.beneficiaire === 'nezha' ? 'Nezha' : 'Layla'} · {salaire.month}/{salaire.year}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }}>✕</button>
        </div>

        <div style={{ background: '#F4F0EA', padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#4a3a30' }}>Salaire cible</div>
            <input type="number" value={target} onChange={(e) => changeTarget(e.target.value)} style={{ fontSize: 18, fontWeight: 500, padding: '4px 8px', border: '0.5px solid #C4BFB6', borderRadius: 6, width: 110 }} />
            <div style={{ fontSize: 11, color: '#4a3a30', marginLeft: 'auto' }}>Cumulé</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: cumule >= target ? '#1D7A5C' : '#1a0f0a' }}>{fmtMoney(cumule)}</div>
          </div>
          <div style={{ height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', background: colorBen.border, width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4a3a30' }}>
            <span>{selected.length} enveloppes sélectionnées</span>
            <span style={{ color: reliquat >= 0 ? '#1D7A5C' : '#99201E', fontWeight: 500 }}>
              {reliquat >= 0 ? `+${fmtMoney(reliquat)} de reliquat` : `manque ${fmtMoney(Math.abs(reliquat))}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Enveloppes disponibles</div>
          <button onClick={autoFill} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }}><Zap size={14} /> Auto-remplir</button>
        </div>

        {available.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 8 }}>Aucune enveloppe disponible (toutes affectées).</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {available.map(env => {
            const isSel = attached.some(a => a.id === env.id)
            return (
              <label key={env.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                background: isSel ? colorBen.bg : '#F4F0EA',
                border: `0.5px solid ${isSel ? colorBen.border : '#e5d8c3'}`,
              }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(env)} style={{ accentColor: '#993556' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: isSel ? colorBen.text : '#4a3a30' }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: isSel ? colorBen.text : '#1a0f0a' }}>{fmtMoney(env.amount_cash)}</div>
                </div>
              </label>
            )
          })}
        </div>

        {reliquat > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '0.5px solid #e5d8c3' }}>
            <div style={{ fontSize: 13, padding: 12, borderRadius: 8, background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #378ADD' }}>
              Reliquat de <strong>{fmtMoney(reliquat)}</strong> → reporté sur le salaire du mois suivant de <strong>{salaire.beneficiaire === 'nezha' ? 'Nezha' : 'Layla'}</strong> (déduit automatiquement).
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <button onClick={saveDraft} disabled={busy} style={{ flex: 1, fontSize: 13, padding: 11, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }}>
            Enregistrer en brouillon
          </button>
          <button onClick={validatePret} disabled={busy || cumule < Number(target)} style={{
            flex: 2, fontSize: 13, padding: 11, borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer',
            opacity: (cumule < Number(target) || busy) ? 0.5 : 1,
          }}>✓ Valider · Prêt à payer</button>
        </div>
      </div>
    </div>
  )
}
