import { useState, useEffect } from 'react'
import {
  TYPE_LABELS, TYPE_EMOJIS, TYPE_SPEC,
  detectTypeFromName, getSableDimensionLabel,
  loadFiche, saveFiche,
} from '../lib/gmFiches'
import { loadPalette } from '../lib/palette'

export default function GmFicheModal({ item, onClose, onSaved }) {
  const detectedType = detectTypeFromName(item.product_name)
  const [typeGm, setTypeGm] = useState(detectedType || 'cupcake')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form fields
  const [taille, setTaille] = useState('mini')
  const [forme, setForme] = useState('rond')
  const [bord, setBord] = useState('simple')
  const [couleurIds, setCouleurIds] = useState([])
  const [voirCouleurGateau, setVoirCouleurGateau] = useState(false)
  const [zigzagMode, setZigzagMode] = useState('pas')
  const [zigzagCouleurIds, setZigzagCouleurIds] = useState([])
  const [decosArr, setDecosArr] = useState([])

  const [palette, setPalette] = useState([])

  const spec = TYPE_SPEC[typeGm] || TYPE_SPEC.cupcake

  useEffect(() => {
    (async () => {
      try {
        const [fiche, paletteData] = await Promise.all([
          loadFiche(item.id),
          loadPalette(),
        ])
        setPalette(paletteData)
        if (fiche) {
          setTypeGm(fiche.type_gm)
          setTaille(fiche.taille || 'mini')
          setForme(fiche.forme || 'rond')
          setBord(fiche.bord || 'simple')
          setCouleurIds((fiche.couleurs || []).map(c => typeof c === 'string' ? c : c.id))
          setVoirCouleurGateau(fiche.voir_couleur_gateau || false)
          setZigzagMode(fiche.zigzag_mode || 'pas')
          setZigzagCouleurIds((fiche.zigzag_couleurs || []).map(c => typeof c === 'string' ? c : c.id))
          setDecosArr(fiche.decos || [])
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [item.id])

  function toggleColor(colorId, target = 'main') {
    if (target === 'main') {
      setCouleurIds(prev => prev.includes(colorId)
        ? prev.filter(c => c !== colorId)
        : [...prev, colorId])
    } else {
      setZigzagCouleurIds(prev => prev.includes(colorId)
        ? prev.filter(c => c !== colorId)
        : [...prev, colorId])
    }
  }

  function toggleDeco(deco) {
    setDecosArr(prev => prev.includes(deco)
      ? prev.filter(d => d !== deco)
      : [...prev, deco])
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await saveFiche(item.id, {
        type_gm: typeGm,
        taille: spec.hasTaille ? taille : null,
        forme: spec.hasFormeBord ? forme : null,
        bord: spec.hasFormeBord ? bord : null,
        couleurs: couleurIds,
        voir_couleur_gateau: voirCouleurGateau,
        zigzag_mode: spec.hasZigzag ? zigzagMode : null,
        zigzag_couleurs: zigzagMode === 'differente' ? zigzagCouleurIds : [],
        decos: spec.hasDecos ? decosArr : (spec.hasPerles && decosArr.includes('Perles') ? ['Perles'] : []),
      })
      if (onSaved) onSaved()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Dispatch parfums (cupcakes/cakepops/magnums)
  const parfums = item.parfums || []
  const qty = item.quantity || 1
  const dispatchPerParfum = parfums.length > 0 ? Math.floor(qty / parfums.length) : 0

  // Couleurs principales (in_principale=true)
  const principalColors = palette.filter(c => c.in_principale)
  const elargi = palette.filter(c => !c.in_principale)
  const [showElargi, setShowElargi] = useState(false)

  return (
    <div className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
         onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
              FICHE PATISSIER
            </div>
            <div className="font-fraunces italic text-[20px] font-medium text-ink leading-tight">
              {TYPE_EMOJIS[typeGm]} {item.product_name}
            </div>
            <div className="text-[10px] text-ink-mute mt-1 font-mono">
              Qte : {qty}{parfums.length > 0 && ` · ${parfums.length} parfum${parfums.length>1?'s':''}`}
            </div>
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {error && (
            <div className="text-[12px] text-bordeaux bg-bordeaux/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-ink-mute text-[12px]">Chargement...</div>
          ) : (
            <>
              {/* Type (modifiable si auto-detection echoue) */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Type</label>
                <select value={typeGm} onChange={e => setTypeGm(e.target.value)}
                        className="w-full px-3 py-2 border border-line rounded-md text-[13px] bg-white">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{TYPE_EMOJIS[k]} {v}</option>
                  ))}
                </select>
                {!detectedType && (
                  <div className="text-[10px] text-bordeaux mt-1 italic">
                    Type non detecte automatiquement, choisir manuellement
                  </div>
                )}
              </div>

              {/* Taille */}
              {spec.hasTaille && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Taille</label>
                  <div className="flex gap-2">
                    {spec.tailleOptions.map(opt => (
                      <button key={opt.value}
                              onClick={() => setTaille(opt.value)}
                              className={`flex-1 px-4 py-2 rounded-full text-[12px] font-medium tracking-wider transition-all ${
                                taille === opt.value
                                  ? 'bg-bordeaux text-cream'
                                  : 'border border-line text-ink-mute hover:bg-line/30'
                              }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Parfums (lecture seule, dispatch auto) */}
              {spec.hasParfums && parfums.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">
                    Parfums (depuis Odoo, dispatch auto)
                  </label>
                  <div className="bg-white border border-line rounded-md p-3 space-y-1">
                    {parfums.map((p, i) => (
                      <div key={i} className="flex justify-between items-center text-[12px] text-ink-soft">
                        <span>• {p}</span>
                        <span className="font-mono text-bordeaux font-medium">{dispatchPerParfum}</span>
                      </div>
                    ))}
                    <div className="border-t border-line pt-1 mt-1 flex justify-between text-[12px] font-medium">
                      <span>Total</span>
                      <span className="font-mono">{qty}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Forme + Bord (sables) */}
              {spec.hasFormeBord && (
                <>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Forme</label>
                    <div className="grid grid-cols-3 gap-2">
                      {spec.formeOptions.map(opt => (
                        <button key={opt.value}
                                onClick={() => setForme(opt.value)}
                                className={`px-3 py-2 rounded-md text-[12px] font-medium transition-all ${
                                  forme === opt.value
                                    ? 'bg-bordeaux text-cream'
                                    : 'border border-line text-ink-mute hover:bg-line/30'
                                }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {forme && taille && spec.hasTaille && (
                      <div className="text-[11px] text-ink-mute mt-2 italic">
                        → {spec.formeOptions.find(f => f.value === forme)?.label} {getSableDimensionLabel(forme, taille)}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Bord</label>
                    <div className="flex gap-2">
                      {spec.bordOptions.map(opt => (
                        <button key={opt.value}
                                onClick={() => setBord(opt.value)}
                                className={`flex-1 px-4 py-2 rounded-full text-[12px] font-medium transition-all ${
                                  bord === opt.value
                                    ? 'bg-bordeaux text-cream'
                                    : 'border border-line text-ink-mute hover:bg-line/30'
                                }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Couleurs */}
              {spec.hasCouleurs && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Couleurs</label>

                  <div className="bg-white border border-line rounded-md p-3 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {principalColors.map(c => (
                        <button key={c.id} onClick={() => toggleColor(c.id, 'main')}
                                title={c.nom}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
                                  couleurIds.includes(c.id)
                                    ? 'border-bordeaux bg-bordeaux/10'
                                    : 'border-line bg-white hover:border-ink-mute'
                                }`}>
                          <span className="w-5 h-5 rounded-full border border-line flex-shrink-0"
                                style={{ background: c.hex }}></span>
                          <span className="text-[11px] text-ink truncate">{c.nom}</span>
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 pt-2 border-t border-line cursor-pointer">
                      <input type="checkbox" checked={voirCouleurGateau}
                             onChange={e => setVoirCouleurGateau(e.target.checked)}
                             className="w-4 h-4 accent-bordeaux" />
                      <span className="text-[12px] text-ink-soft">✦ Voir couleur gateau (idem CD)</span>
                    </label>

                    {elargi.length > 0 && (
                      <button onClick={() => setShowElargi(!showElargi)}
                              className="text-[11px] text-bordeaux underline hover:text-bordeaux-deep">
                        {showElargi ? 'Masquer' : `+ Plus de couleurs (${elargi.length})`}
                      </button>
                    )}

                    {showElargi && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t border-line">
                        {elargi.map(c => (
                          <button key={c.id} onClick={() => toggleColor(c.id, 'main')}
                                  title={c.nom}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
                                    couleurIds.includes(c.id)
                                      ? 'border-bordeaux bg-bordeaux/10'
                                      : 'border-line bg-white hover:border-ink-mute'
                                  }`}>
                            <span className="w-5 h-5 rounded-full border border-line flex-shrink-0"
                                  style={{ background: c.hex }}></span>
                            <span className="text-[11px] text-ink truncate">{c.nom}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Zigzag */}
              {spec.hasZigzag && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Zigzag</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'pas',        label: 'Pas de zigzag' },
                      { value: 'meme',       label: 'Meme couleur' },
                      { value: 'differente', label: 'Couleur diff.' },
                    ].map(opt => (
                      <button key={opt.value}
                              onClick={() => setZigzagMode(opt.value)}
                              className={`px-3 py-2 rounded-md text-[11px] font-medium transition-all ${
                                zigzagMode === opt.value
                                  ? 'bg-bordeaux text-cream'
                                  : 'border border-line text-ink-mute hover:bg-line/30'
                              }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {zigzagMode === 'differente' && (
                    <div className="mt-3 bg-white border border-line rounded-md p-3">
                      <div className="text-[10px] uppercase tracking-wider text-ink-mute font-medium mb-2">
                        Couleur(s) du zigzag
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {principalColors.map(c => (
                          <button key={c.id} onClick={() => toggleColor(c.id, 'zigzag')}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
                                    zigzagCouleurIds.includes(c.id)
                                      ? 'border-bordeaux bg-bordeaux/10'
                                      : 'border-line bg-white hover:border-ink-mute'
                                  }`}>
                            <span className="w-5 h-5 rounded-full border border-line flex-shrink-0"
                                  style={{ background: c.hex }}></span>
                            <span className="text-[11px] text-ink truncate">{c.nom}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Perles seules (cakepops) */}
              {spec.hasPerles && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Perles</label>
                  <div className="flex gap-2">
                    <button onClick={() => setDecosArr(prev => prev.filter(d => d !== 'Perles').concat('Perles'))}
                            className={`flex-1 px-4 py-2 rounded-full text-[12px] font-medium transition-all ${
                              decosArr.includes('Perles')
                                ? 'bg-bordeaux text-cream'
                                : 'border border-line text-ink-mute hover:bg-line/30'
                            }`}>
                      Oui
                    </button>
                    <button onClick={() => setDecosArr(prev => prev.filter(d => d !== 'Perles'))}
                            className={`flex-1 px-4 py-2 rounded-full text-[12px] font-medium transition-all ${
                              !decosArr.includes('Perles')
                                ? 'bg-bordeaux text-cream'
                                : 'border border-line text-ink-mute hover:bg-line/30'
                            }`}>
                      Non
                    </button>
                  </div>
                </div>
              )}

              {/* Decos multi (donut/magnum) */}
              {spec.hasDecos && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-ink-mute font-medium block mb-2">Decoration</label>
                  <div className="grid grid-cols-3 gap-2">
                    {spec.decosOptions.map(d => (
                      <button key={d} onClick={() => toggleDeco(d)}
                              className={`px-3 py-2 rounded-md text-[11px] font-medium transition-all ${
                                decosArr.includes(d)
                                  ? 'bg-bordeaux text-cream'
                                  : 'border border-line text-ink-mute hover:bg-line/30'
                              }`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-cream/95 backdrop-blur-sm border-t border-line px-6 py-3 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
                  className="px-4 py-2 border border-line text-ink-mute rounded-full text-[11px] font-medium tracking-wider hover:bg-line/30 transition-all disabled:opacity-50">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving || loading}
                  className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all disabled:opacity-50">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
