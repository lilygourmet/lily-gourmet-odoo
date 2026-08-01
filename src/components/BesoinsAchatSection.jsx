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
  const [open, setOpen] = useState(false)              // la liste s'ouvre seulement au clic
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
      setOpen(false)
    } catch (e) { toast.error('Erreur : ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  function validate() {
    const items = ITEMS.filter(i => checked[i.key]).map(i => ({ key: i.key, label: i.label, detail: (details[i.key] || '').trim() }))
    submit(items)
  }

  if (existing === undefined) return null   // en chargement : rien

  const items = existing?.items || []
  const answered = !!existing
  const withNeeds = answered && items.length > 0

  // Petit bouton unique : ouvre la liste au clic. Rien d'autre à l'écran.
  const btnClass = withNeeds
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bordeaux text-cream text-[12px] font-bold'
    : answered
      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-ink-soft text-[12px] font-medium'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-bordeaux/40 text-bordeaux text-[12px] font-medium hover:bg-bordeaux/5'

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnClass}>
        🛒 Besoins d'achat{withNeeds ? ` ✓ (${items.length})` : answered ? ' ✓' : ''}
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 16, maxWidth: 420, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 16 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[14px] font-bold text-bordeaux">🛒 Besoins d'achat</div>
              <button onClick={() => setOpen(false)} className="text-ink-mute text-[18px] leading-none">×</button>
            </div>

            {answered ? (
              <>
                {items.length === 0
                  ? <div className="text-[13px] text-ink-soft">Rien de spécial.</div>
                  : <ul className="text-[13px] text-ink space-y-0.5">{items.map((it, i) => <li key={i}>• {it.label}{it.detail ? ' : ' + it.detail : ''}</li>)}</ul>}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
