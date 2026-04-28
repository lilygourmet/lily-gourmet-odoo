import { useState } from 'react'

// ============================================================
// LotEditor : edite un seul lot d'un produit GM
// Props :
//   lot : { qty, couleur_id, has_zigzag, zigzag_couleur_id, has_perles, perles_couleur_id, forme, bord }
//   palette : array des couleurs Pantone
//   spec : TYPE_SPEC[type_gm] qui pilote ce qui s'affiche
//   onChange(newLot)
//   onDelete()
//   maxQty : quantite restante a allouer
//   parfumLabel : si != null, affiche le parfum a cote (ex: 'Sellou')
// ============================================================
export default function LotEditor({ lot, palette, spec, onChange, onDelete, maxQty, parfumLabel }) {
  const [showColorPicker, setShowColorPicker] = useState(null) // 'main' | 'zigzag' | 'perles' | null

  function update(patch) {
    onChange({ ...lot, ...patch })
  }

  const couleur = palette.find(c => c.id === lot.couleur_id)
  const zigzagCouleur = palette.find(c => c.id === lot.zigzag_couleur_id)
  const perlesCouleur = palette.find(c => c.id === lot.perles_couleur_id)

  function ColorPicker({ onPick, onClose }) {
    return (
      <div className="absolute z-20 left-0 right-0 mt-1 p-3 bg-cream rounded-lg shadow-xl border border-line max-h-64 overflow-y-auto"
           style={{ minWidth: '300px' }}>
        <div className="grid grid-cols-8 gap-2">
          {palette.map(c => (
            <button
              key={c.id}
              onClick={() => { onPick(c.id); onClose() }}
              title={c.nom}
              className="w-8 h-8 rounded-full border border-line hover:scale-110 transition-transform"
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <button onClick={onClose} className="mt-2 w-full text-[11px] text-ink-mute hover:text-bordeaux py-1">Fermer</button>
      </div>
    )
  }

  return (
    <div className="bg-cream rounded-lg border border-line/60 p-3 mb-2 relative">
      {/* Ligne 1 : parfum (si applicable) + couleur principale + qty +/- + delete */}
      <div className="flex items-center gap-2 mb-2">
        {parfumLabel && (
          <span className="font-mono text-[10px] tracking-wider uppercase font-semibold text-bordeaux px-2 py-1 bg-bordeaux/10 rounded">
            {parfumLabel}
          </span>
        )}

        {/* Couleur principale */}
        {!spec.lotHasForme && (
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(showColorPicker === 'main' ? null : 'main')}
              className="flex items-center gap-1.5 px-2 py-1 bg-cream-warm rounded-full border border-line hover:border-bordeaux transition-colors"
            >
              <span
                className="w-4 h-4 rounded-full border border-line/40"
                style={{ backgroundColor: couleur?.hex || '#ddd' }}
              />
              <span className="text-[12px] text-ink">{couleur?.nom || 'Choisir'}</span>
            </button>
            {showColorPicker === 'main' && (
              <ColorPicker
                onPick={id => update({ couleur_id: id })}
                onClose={() => setShowColorPicker(null)}
              />
            )}
          </div>
        )}

        {/* Forme (sablés) */}
        {spec.lotHasForme && (
          <select
            value={lot.forme || ''}
            onChange={e => update({ forme: e.target.value || null })}
            className="px-2 py-1 text-[12px] border border-line rounded bg-cream-warm focus:outline-none focus:border-bordeaux"
          >
            <option value="">Forme</option>
            {spec.formeOptions.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        )}

        {/* Bord (sablés rond/carré uniquement) */}
        {spec.lotHasForme && (lot.forme === 'rond' || lot.forme === 'carre') && (
          <select
            value={lot.bord || ''}
            onChange={e => update({ bord: e.target.value || null })}
            className="px-2 py-1 text-[12px] border border-line rounded bg-cream-warm focus:outline-none focus:border-bordeaux"
          >
            <option value="">Bord</option>
            {spec.bordOptions.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        )}

        {/* Qty +/- avec input texte */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => update({ qty: Math.max(0, (lot.qty || 0) - 1) })}
            className="w-7 h-7 rounded-full border border-line text-ink hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors"
          >−</button>
          <input
            type="number"
            min="0"
            value={lot.qty || 0}
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              update({ qty: isNaN(v) || v < 0 ? 0 : v })
            }}
            className="w-12 text-center font-medium text-[14px] border border-line rounded bg-cream-warm focus:outline-none focus:border-bordeaux py-0.5"
          />
          <button
            onClick={() => update({ qty: (lot.qty || 0) + 1 })}
            className="w-7 h-7 rounded-full border border-line text-ink hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors"
          >+</button>
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded-full text-ink-mute hover:bg-bordeaux/10 hover:text-bordeaux transition-colors"
          title="Supprimer le lot"
        >×</button>
      </div>

      {/* Ligne 2 : zigzag + perles (si applicable) */}
      {(spec.lotHasZigzag || spec.lotHasPerles) && (
        <div className="flex items-center gap-3 ml-1 text-[12px]">
          {spec.lotHasZigzag && (
            <div className="flex items-center gap-2 relative">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lot.has_zigzag || false}
                  onChange={e => update({ has_zigzag: e.target.checked, zigzag_couleur_id: e.target.checked ? lot.zigzag_couleur_id : null })}
                  className="w-3.5 h-3.5"
                />
                <span className="text-ink-soft">Zigzag</span>
              </label>
              {lot.has_zigzag && (
                <button
                  onClick={() => setShowColorPicker(showColorPicker === 'zigzag' ? null : 'zigzag')}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-cream-warm rounded border border-line/60 hover:border-bordeaux"
                >
                  <span className="w-3 h-3 rounded-full border border-line/40" style={{ backgroundColor: zigzagCouleur?.hex || '#ddd' }} />
                  <span className="text-[11px]">{zigzagCouleur?.nom || '?'}</span>
                </button>
              )}
              {showColorPicker === 'zigzag' && (
                <ColorPicker
                  onPick={id => update({ zigzag_couleur_id: id })}
                  onClose={() => setShowColorPicker(null)}
                />
              )}
            </div>
          )}

          {spec.lotHasPerles && (
            <div className="flex items-center gap-2 relative">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lot.has_perles || false}
                  onChange={e => update({ has_perles: e.target.checked, perles_couleur_id: e.target.checked ? lot.perles_couleur_id : null })}
                  className="w-3.5 h-3.5"
                />
                <span className="text-ink-soft">Perles</span>
              </label>
              {lot.has_perles && (
                <button
                  onClick={() => setShowColorPicker(showColorPicker === 'perles' ? null : 'perles')}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-cream-warm rounded border border-line/60 hover:border-bordeaux"
                >
                  <span className="w-3 h-3 rounded-full border border-line/40" style={{ backgroundColor: perlesCouleur?.hex || '#ddd' }} />
                  <span className="text-[11px]">{perlesCouleur?.nom || '?'}</span>
                </button>
              )}
              {showColorPicker === 'perles' && (
                <ColorPicker
                  onPick={id => update({ perles_couleur_id: id })}
                  onClose={() => setShowColorPicker(null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
