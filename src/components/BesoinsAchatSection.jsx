import { useState, useEffect } from 'react'
import { loadBesoinsAchat, submitBesoinsAchat } from '../lib/besoinsAchat'
import { toast } from '../lib/toast'

// Liste à cocher des besoins d'achat (cake design). « autre » = champ libre.
const ITEMS = [
  { key: 'achat',  emoji: '🛒', label: 'Acheter des choses' },
  { key: 'plaque', emoji: '🧊', label: 'Plaque spéciale' },
  { key: 'poly',   emoji: '📐', label: 'Poly spécial' },
  { key: 'fleurs', emoji: '🌸', label: 'Fleurs' },
  { key: 'jouet',  emoji: '🧸', label: 'Jouet' },
  { key: 'autre',  emoji: '✏️', label: 'Autre' },
]

export default function BesoinsAchatSection({ order, user }) {
  const [existing, setExisting] = useState(undefined)  // undefined = chargement ; null = pas répondu ; objet = déjà répondu
  const [checked, setChecked] = useState({})
  const [details, setDetails] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let m = true
    loadBesoinsAchat(order.order_num)
      .then(r => { if (m) setExisting(r || null) })
      .catch(() => { if (m) setExisting(null) })
    return () => { m = false }
  }, [order.order_num])

  const photoUrl = (order.order_items || []).flatMap(i => i.image_urls || [])[0] || null
  const anyChecked = ITEMS.some(i => checked[i.key])

  async function submit(items) {
    setBusy(true)
    try {
      const r = await submitBesoinsAchat({ user, order, items, photoUrl })
      toast.success(items.length ? `Envoyé à ${r.count} responsable(s) d'achat ✓` : 'Enregistré — rien de spécial')
      setExisting({ items })
    } catch (e) { toast.error('Erreur : ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  function validate() {
    const items = ITEMS.filter(i => checked[i.key]).map(i => ({ key: i.key, label: i.label, detail: (details[i.key] || '').trim() }))
    submit(items)
  }

  if (existing === undefined) return null

  const wrap = 'mb-4 rounded-lg border border-line border-l-4 border-l-bordeaux bg-cream-warm/40 p-3'

  // Déjà répondu → lecture seule (ne redemande plus).
  if (existing) {
    const items = existing.items || []
    return (
      <div className={wrap}>
        <div className="text-[13px] font-bold text-bordeaux mb-1">🛒 Besoins d'achat — répondu ✓</div>
        {items.length === 0
          ? <div className="text-[12px] text-ink-soft">Rien de spécial.</div>
          : <ul className="text-[12px] text-ink space-y-0.5">{items.map((it, i) => <li key={i}>• {it.label}{it.detail ? ' : ' + it.detail : ''}</li>)}</ul>}
      </div>
    )
  }

  return (
    <div className={wrap}>
      <div className="text-[13px] font-bold text-bordeaux mb-2">🛒 Besoins d'achat pour cette commande ?</div>
      <div className="space-y-1.5 mb-2">
        {ITEMS.map(i => (
          <div key={i.key} className={`rounded-lg border p-2 ${checked[i.key] ? 'border-bordeaux bg-bordeaux/5' : 'border-line bg-white'}`}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!checked[i.key]} onChange={e => setChecked(c => ({ ...c, [i.key]: e.target.checked }))} className="w-4 h-4 accent-[#7a1f3d]" />
              <span className="text-[13px] font-medium">{i.emoji} {i.label}</span>
            </label>
            {checked[i.key] && (
              <input value={details[i.key] || ''} onChange={e => setDetails(d => ({ ...d, [i.key]: e.target.value }))}
                placeholder="Précise (optionnel)…" className="mt-1.5 w-full px-2 py-1 text-[12px] border border-line rounded" />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={validate} disabled={busy || !anyChecked}
          className="flex-1 bg-bordeaux text-cream rounded-lg py-2 text-[13px] font-bold disabled:opacity-40">
          {busy ? '…' : '🚨 Envoyer aux achats (urgent)'}
        </button>
        <button onClick={() => submit([])} disabled={busy}
          className="px-3 rounded-lg border border-line text-ink-soft text-[13px] font-bold disabled:opacity-40">
          Rien de spécial
        </button>
      </div>
    </div>
  )
}
