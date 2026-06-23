import { useState, useEffect } from 'react'
import { loadConvLabels, createConvLabel, updateConvLabel, deleteConvLabel, LABEL_PALETTE } from '../../lib/conversations'
import { confirmDialog } from '../../lib/confirmDialog'

/**
 * Gestion des étiquettes de conversation (admin) : ajouter, renommer, recolorer, supprimer.
 * Props : onClose(), onSaved() — appelé après chaque changement pour recharger la liste parente.
 */
export default function LabelsManager({ onClose, onSaved }) {
  const [labels, setLabels] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newPalette, setNewPalette] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reload() {
    setLabels(await loadConvLabels())
  }
  useEffect(() => { reload() }, [])

  function notify() { onSaved?.() }

  async function handleAdd() {
    if (!newLabel.trim()) return
    setBusy(true); setErr('')
    try {
      const p = LABEL_PALETTE[newPalette]
      await createConvLabel({ label: newLabel, color: p.color, bg: p.bg, sort: labels.length })
      setNewLabel(''); setNewPalette(0)
      await reload(); notify()
    } catch (e) { setErr(e?.message || 'Erreur') }
    finally { setBusy(false) }
  }

  async function handleRename(key, label) {
    if (!label.trim()) return
    try { await updateConvLabel(key, { label: label.trim() }); await reload(); notify() }
    catch (e) { setErr(e?.message || 'Erreur') }
  }

  async function handleRecolor(key, p) {
    try { await updateConvLabel(key, { color: p.color, bg: p.bg }); await reload(); notify() }
    catch (e) { setErr(e?.message || 'Erreur') }
  }

  async function handleDelete(key) {
    if (!await confirmDialog('Supprimer cette étiquette ? Elle disparaîtra des conversations.', { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteConvLabel(key); await reload(); notify() }
    catch (e) { setErr(e?.message || 'Erreur') }
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[1000] p-4" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-fraunces italic text-[18px] text-ink">⚙️ Gérer les étiquettes</h3>
          <button onClick={onClose} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
        </div>

        {err && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-2 rounded text-[12px] mb-3">{err}</div>}

        {/* Liste existante */}
        <div className="space-y-2 mb-5">
          {labels.map(l => (
            <LabelRow key={l.key} l={l} onRename={handleRename} onRecolor={handleRecolor} onDelete={handleDelete} />
          ))}
          {labels.length === 0 && <p className="text-[12px] text-ink-mute">Aucune étiquette.</p>}
        </div>

        {/* Ajout */}
        <div className="border-t border-line pt-4">
          <p className="text-[12px] font-semibold text-ink mb-2">Nouvelle étiquette</p>
          <input
            type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Ex : Important" maxLength={30}
            className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux mb-2"
          />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {LABEL_PALETTE.map((p, i) => (
              <button key={i} type="button" onClick={() => setNewPalette(i)}
                className="w-7 h-7 rounded-full transition-all"
                style={{ background: p.bg, border: '2px solid ' + (newPalette === i ? p.color : 'transparent'), boxShadow: newPalette === i ? `0 0 0 1px ${p.color}` : 'none' }}>
                <span className="block w-full h-full rounded-full" style={{ background: p.color, transform: 'scale(0.45)' }} />
              </button>
            ))}
          </div>
          <button onClick={handleAdd} disabled={busy || !newLabel.trim()}
            className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[13px] font-medium disabled:opacity-50">
            {busy ? '…' : '+ Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LabelRow({ l, onRename, onRecolor, onDelete }) {
  const [name, setName] = useState(l.label)
  const [pickColor, setPickColor] = useState(false)
  useEffect(() => { setName(l.label) }, [l.label])
  return (
    <div className="bg-white border border-line rounded-xl p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: l.bg, color: l.color }}>{l.label}</span>
        <input
          value={name} onChange={e => setName(e.target.value)}
          onBlur={() => name.trim() && name !== l.label && onRename(l.key, name)}
          className="flex-1 min-w-0 px-2 py-1 text-[12px] border border-line rounded bg-cream-warm focus:outline-none focus:border-bordeaux"
        />
        <button onClick={() => setPickColor(v => !v)} title="Couleur" className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: l.color }} />
        <button onClick={() => onDelete(l.key)} title="Supprimer" className="text-ink-mute hover:text-bordeaux text-[15px] flex-shrink-0">🗑️</button>
      </div>
      {pickColor && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {LABEL_PALETTE.map((p, i) => (
            <button key={i} type="button" onClick={() => { onRecolor(l.key, p); setPickColor(false) }}
              className="w-6 h-6 rounded-full" style={{ background: p.color }} />
          ))}
        </div>
      )}
    </div>
  )
}
