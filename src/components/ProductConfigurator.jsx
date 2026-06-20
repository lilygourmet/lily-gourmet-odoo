// Configurateur générique d'article (lit les attributs réels du produit Odoo).
// Partagé entre « Nouvelle commande » (NewOrderView) et « ✏️ Articles » (OrderEditModal).
// Fichier dédié pour éviter qu'un écran chargé à la demande (lazy) en importe un autre
// statiquement — ce qui cassait le découpage du code (chunks introuvables / 404).

import { toast } from '../lib/toast'

// Catégories où le prix est modifiable
export const PRICE_EDITABLE = new Set(['cd', 'divers'])

export function ConfiguratorModal({ cfg, onChange, onClose, onAdd, priceEditable, addLabel = 'Ajouter au panier' }) {
  const { item, loading, attributes, variants, sel, text, warn, photo } = cfg
  const optionAttrs = attributes.filter(a => a.type === 'option')
  const textAttrs = attributes.filter(a => a.type === 'text')

  // Étiquette : si deux attributs ont le même nom (ex. cupcake « parfum 1 » ×2), on numérote.
  function dispLabel(a) {
    const dups = optionAttrs.filter(x => x.name === a.name)
    return dups.length < 2 ? a.name : `${a.name} #${dups.indexOf(a) + 1}`
  }
  // Variante qui correspond aux options choisies (par identifiant unique d'attribut)
  const allChosen = optionAttrs.every(a => sel[a.attrId])
  let resolved = null
  if (optionAttrs.length === 0) {
    resolved = variants[0]
  } else if (allChosen) {
    resolved = variants.find(v => optionAttrs.every(a => v.values[a.attrId] === sel[a.attrId]))
    if (!resolved && variants.length) {
      // Variantes « dynamiques » Odoo : combo pas pré-créé → on prend la variante la
      // plus proche (le prix dépend des attributs tarifaires, pas du parfum).
      let bestScore = -1
      for (const v of variants) {
        const score = optionAttrs.reduce((s, a) => s + (v.values[a.attrId] === sel[a.attrId] ? 1 : 0), 0)
        if (score > bestScore) { bestScore = score; resolved = v }
      }
    }
  }
  const price = resolved?.price ?? null

  function pick(attrId, val) { onChange(c => ({ ...c, sel: { ...c.sel, [attrId]: val } })) }
  function setText(attrId, val) { onChange(c => ({ ...c, text: { ...c.text, [attrId]: val } })) }

  // Blocs « anti-erreur » pour les produits décorés (cake design CD- ET GM-/GMD-).
  const isDecorated = cfg.catKey === 'cd' || cfg.catKey === 'gm'
  // 1) Modèle du client (choix forcé, rien par défaut)
  const modele = cfg.modele || ''   // 'identique' | 'inspire'
  function setModele(v) { onChange(c => ({ ...c, modele: v })) }
  // 2) Décor : modelage main / impression / les deux / rien
  const decor = cfg.decor || { mode: '', main: '', imp: '' }
  function setDecor(patch) { onChange(c => ({ ...c, decor: { ...(c.decor || { mode: '', main: '', imp: '' }), ...patch } })) }
  const showMain = decor.mode === 'main' || decor.mode === 'both'
  const showImp = decor.mode === 'imp' || decor.mode === 'both'
  const decorOk = decor.mode === 'rien'
    || (showMain && !showImp && decor.main.trim())
    || (showImp && !showMain && decor.imp.trim())
    || (showMain && showImp && decor.main.trim() && decor.imp.trim())
  // 3) Fleurs (multi-choix : aucune / pâte à sucre / artificielles / vraies)
  const fleurs = cfg.fleurs || { types: [], detail: '' }
  function toggleFleur(v) {
    onChange(c => {
      const f = c.fleurs || { types: [], detail: '' }
      let types
      if (v === 'aucune') types = ['aucune']
      else { const base = (f.types || []).filter(t => t !== 'aucune'); types = base.includes(v) ? base.filter(t => t !== v) : [...base, v] }
      return { ...c, fleurs: { ...f, types } }
    })
  }
  function setFleurDetail(val) { onChange(c => ({ ...c, fleurs: { ...(c.fleurs || { types: [], detail: '' }), detail: val } })) }
  const fleursReelles = (fleurs.types || []).some(t => t !== 'aucune')
  // Validation : pour les produits décorés, modèle + décor + fleurs sont obligatoires (choix forcé).
  const decoratedOk = !isDecorated || (!!modele && !!decor.mode && decorOk && (fleurs.types || []).length > 0)

  // Prix final : pour CD-, on prend le prix saisi à la main s'il existe.
  const finalPrice = priceEditable && cfg.priceOverride != null && cfg.priceOverride !== ''
    ? Number(cfg.priceOverride) : (price ?? 0)

  // Cake design (CD-) : TOUS les champs sont obligatoires (options + thème/âge/message).
  const requireAll = cfg.catKey === 'cd'
  const allOptionsChosen = optionAttrs.every(a => sel[a.attrId])
  const allTextFilled = textAttrs.every(a => (text[a.attrId] || '').trim())
  const requiredOk = (!requireAll || (allOptionsChosen && allTextFilled)) && decoratedOk

  function add() {
    // Description aérée : chaque attribut (parfum, thème, âge, message) sur sa ligne.
    const descLines = [
      ...optionAttrs.filter(a => sel[a.attrId]).map(a => `${dispLabel(a)} : ${sel[a.attrId]}`),
      ...textAttrs.filter(a => text[a.attrId]).map(a => `${a.name} : ${text[a.attrId]}`),
    ]
    const decorSub = isDecorated
      ? (decor.mode === 'rien' ? 'Décor : rien'
        : [showMain && decor.main.trim() && `🖐️ ${decor.main.trim()}`, showImp && decor.imp.trim() && `🖨️ ${decor.imp.trim()}`].filter(Boolean).join(' · '))
      : ''
    const subDisplay = [
      ...optionAttrs.map(a => sel[a.attrId]).filter(Boolean),
      ...textAttrs.map(a => text[a.attrId]).filter(Boolean),
      decorSub,
      warn && `⚠️ ${warn}`,
      photo && `📎 ${photo}`,
    ].filter(Boolean).join(' · ')

    // CD/GM : nom au format que le CALENDRIER sait lire → « CD- Nom (pers, forme, parfums) ».
    // Le préfixe CD-/GM- est requis par le parser du calendrier (OK si le client le voit).
    let lineName = item.name
    let lineDesc = descLines.join('\n')
    const isCdGm = cfg.catKey === 'cd' || cfg.catKey === 'gm'
    if (isCdGm) {
      const prefix = cfg.catKey === 'cd' ? 'CD- ' : 'GM- '
      const persA = optionAttrs.find(a => /personne/i.test(a.name))
      const tailleA = optionAttrs.find(a => /forme|taille|type/i.test(a.name))
      const parfumA = optionAttrs.filter(a => /parfum/i.test(a.name))
      const usedIds = new Set([persA?.attrId, tailleA?.attrId, ...parfumA.map(a => a.attrId)].filter(Boolean))
      const otherA = optionAttrs.filter(a => !usedIds.has(a.attrId))
      const parts = []
      if (persA && sel[persA.attrId]) parts.push((String(sel[persA.attrId]).match(/\d+/) || [sel[persA.attrId]])[0])
      if (tailleA && sel[tailleA.attrId]) parts.push(sel[tailleA.attrId])
      parfumA.forEach(a => { if (sel[a.attrId]) parts.push(sel[a.attrId]) })
      otherA.forEach(a => { if (sel[a.attrId]) parts.push(sel[a.attrId]) })
      lineName = `${prefix}${item.name}${parts.length ? ` (${parts.join(', ')})` : ''}`
      const cdTextLines = textAttrs.filter(a => text[a.attrId]).map(a => `${a.name} : ${text[a.attrId]}`)
      const decorLines = []
      let modeleLine = '', fleursLine = ''
      if (isDecorated) {
        // Modèle
        if (modele === 'identique') modeleLine = 'Modèle : à l\'identique (voir photo réf.)'
        else if (modele === 'inspire') modeleLine = 'Modèle : inspiration / adapté'
        // Décor
        if (decor.mode === 'rien') decorLines.push('Décor : rien à faire')
        else {
          if (showMain && decor.main.trim()) decorLines.push(`Modelage : ${decor.main.trim()}`)
          if (showImp && decor.imp.trim()) decorLines.push(`Impression : ${decor.imp.trim()}`)
        }
        // Fleurs
        const FLEUR_LBL = { aucune: 'aucune', sucre: 'pâte à sucre', artif: 'artificielles', vraies: 'vraies fleurs' }
        if ((fleurs.types || []).length) {
          const noms = fleurs.types.map(t => FLEUR_LBL[t] || t).join(' + ')
          fleursLine = `Fleurs : ${noms}${fleurs.detail && fleurs.detail.trim() ? ` (${fleurs.detail.trim()})` : ''}`
        }
      }
      lineDesc = [...cdTextLines, modeleLine, ...decorLines, fleursLine].filter(Boolean).join('\n')
    }

    onAdd({
      name: lineName,
      desc: lineDesc,
      warn: warn || '',
      photoFile: cfg.photoFile || null,
      photoName: photo || '',
      sub: subDisplay,
      price: finalPrice,
      editable: priceEditable,
      catKey: cfg.catKey,
      variantId: resolved?.id || null,
    })
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-bordeaux text-cream px-4 py-3 flex items-center justify-between">
          <h3 className="font-fraunces italic text-[18px]">{item.name}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-cream/20">✕</button>
        </div>
        <div className="p-4">
          {loading ? <div className="text-center text-ink-mute py-6 text-[13px]">Chargement…</div> : (
            <>
              {optionAttrs.map(a => (
                <div key={a.attrId} className="mb-3">
                  <div className="text-[12px] font-bold text-ink-soft mb-1.5">{dispLabel(a)}{requireAll && <span className="text-bordeaux"> *</span>}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.values.map(v => (
                      <button key={v} onClick={() => pick(a.attrId, v)}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border ${sel[a.attrId] === v ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {textAttrs.map(a => (
                <div key={a.attrId} className="mb-3">
                  <div className="text-[12px] font-bold text-ink-soft mb-1">{a.name} {requireAll ? <span className="text-bordeaux">*</span> : '(optionnel)'}</div>
                  <input value={text[a.attrId] || ''} onChange={e => setText(a.attrId, e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-lg text-[13px]" />
                </div>
              ))}

              {isDecorated && (
                <>
                  {/* 1 · Le modèle */}
                  <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                    <div className="text-[12px] font-bold text-bordeaux mb-2">1 · Le modèle du client <span className="text-bordeaux">*</span></div>
                    <div className="flex gap-1.5">
                      {[['identique', '📷', 'À l’identique'], ['inspire', '✨', 'Inspiration / adapté']].map(([v, ic, lbl]) => (
                        <button key={v} type="button" onClick={() => setModele(v)}
                          className={`flex-1 rounded-lg py-2 px-1 text-[12px] font-bold border text-center ${modele === v ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>
                          <span className="block text-[18px] leading-none mb-0.5">{ic}</span>{lbl}
                        </button>
                      ))}
                    </div>
                    {modele === 'identique' && <div className="text-[11px] text-bordeaux mt-1.5">📷 Joins une photo de référence ci-dessous (à reproduire fidèlement).</div>}
                  </div>

                  {/* 2 · Décor */}
                  <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                    <div className="text-[12px] font-bold text-bordeaux mb-2">2 · Décor — comment ? <span className="text-bordeaux">*</span></div>
                    <div className="flex gap-1.5 mb-1">
                      {[['main', '🖐️', 'Modelage main'], ['imp', '🖨️', 'Impression'], ['both', '🤝', 'Les deux'], ['rien', '🚫', 'Rien']].map(([m, ic, lbl]) => (
                        <button key={m} type="button" onClick={() => setDecor({ mode: m })}
                          className={`flex-1 rounded-lg py-2 px-1 text-[12px] font-bold border text-center ${decor.mode === m ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>
                          <span className="block text-[18px] leading-none mb-0.5">{ic}</span>{lbl}
                        </button>
                      ))}
                    </div>
                    {showMain && (
                      <div className="mt-2">
                        <div className="text-[12px] font-bold text-ink-soft mb-1">À modeler à la main <span className="text-bordeaux">*</span></div>
                        <textarea value={decor.main} onChange={e => setDecor({ main: e.target.value })}
                          placeholder="ex : licorne 3D, logo en pâte à sucre"
                          className="w-full px-3 py-2 border border-line rounded-lg text-[13px] min-h-[48px]" />
                      </div>
                    )}
                    {showImp && (
                      <div className="mt-2">
                        <div className="text-[12px] font-bold text-ink-soft mb-1">À imprimer <span className="text-bordeaux">*</span></div>
                        <textarea value={decor.imp} onChange={e => setDecor({ imp: e.target.value })}
                          placeholder="ex : photo du visage, logo, fond arc-en-ciel"
                          className="w-full px-3 py-2 border border-line rounded-lg text-[13px] min-h-[48px]" />
                      </div>
                    )}
                  </div>

                  {/* 3 · Fleurs */}
                  <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                    <div className="text-[12px] font-bold text-bordeaux mb-2">3 · Fleurs <span className="text-bordeaux">*</span> <span className="font-normal text-ink-soft normal-case">(plusieurs possibles)</span></div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[['aucune', '🚫', 'Aucune'], ['sucre', '🍬', 'Pâte à sucre'], ['artif', '🌸', 'Artificielles'], ['vraies', '🌹', 'Vraies']].map(([v, ic, lbl]) => (
                        <button key={v} type="button" onClick={() => toggleFleur(v)}
                          className={`flex-1 min-w-[70px] rounded-lg py-2 px-1 text-[12px] font-bold border text-center ${(fleurs.types || []).includes(v) ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>
                          <span className="block text-[18px] leading-none mb-0.5">{ic}</span>{lbl}
                        </button>
                      ))}
                    </div>
                    {fleursReelles && (
                      <textarea value={fleurs.detail} onChange={e => setFleurDetail(e.target.value)}
                        placeholder="Lesquelles ? couleurs ? (ex : 3 roses blanches + eucalyptus)"
                        className="w-full mt-2 px-3 py-2 border border-line rounded-lg text-[13px] min-h-[44px]" />
                    )}
                  </div>
                </>
              )}

              <div className="mb-3">
                <div className="text-[12px] font-bold text-ink-soft mb-1">Photo (optionnel)</div>
                <label className="inline-flex items-center gap-2 border border-dashed border-bordeaux text-bordeaux rounded-lg px-3 py-2 text-[13px] cursor-pointer bg-white">
                  📎 {photo || 'Joindre une photo'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; onChange(c => ({ ...c, photo: f?.name || '', photoFile: f || null, photoPreview: f ? URL.createObjectURL(f) : '' })) }} />
                </label>
                <button type="button" onClick={async () => {
                  try {
                    const items = await navigator.clipboard.read()
                    for (const it of items) {
                      const type = it.types.find(t => t.startsWith('image/'))
                      if (type) {
                        const blob = await it.getType(type)
                        const ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg')
                        const file = new File([blob], `coller.${ext}`, { type })
                        onChange(c => ({ ...c, photo: file.name, photoFile: file, photoPreview: URL.createObjectURL(file) }))
                        toast.success('Photo collée ✓')
                        return
                      }
                    }
                    toast.error("Aucune image dans le presse-papier (copie d'abord une image).")
                  } catch {
                    toast.error("Collage refusé. Autorise le presse-papier, ou utilise « Joindre ».")
                  }
                }}
                  className="ml-2 inline-flex items-center gap-1 border border-dashed border-bordeaux text-bordeaux rounded-lg px-3 py-2 text-[13px] cursor-pointer bg-white">
                  📋 Coller
                </button>
                {photo && (
                  <button type="button" onClick={() => onChange(c => ({ ...c, photo: '', photoFile: null, photoPreview: '' }))}
                    className="ml-2 text-[12px] text-red-600 underline">retirer</button>
                )}
                {cfg.photoPreview && (
                  <img src={cfg.photoPreview} alt="" className="mt-2 max-h-40 rounded-lg border border-line object-contain" />
                )}
              </div>

              <div className="mb-3">
                <div className="text-[12px] font-bold text-[#B36B00] mb-1">⚠️ Attention / instruction spéciale (optionnel)</div>
                <input value={warn} onChange={e => onChange(c => ({ ...c, warn: e.target.value }))}
                  placeholder="ex : le décor doit être en bleu · sans fruits à coque"
                  className="w-full px-3 py-2 border border-[#E08A00] bg-[#FFF8EC] rounded-lg text-[13px]" />
              </div>

              <div className="flex justify-between items-center my-3">
                <span className="text-ink-mute text-[13px]">Prix{priceEditable ? ' (modifiable ici)' : ''}</span>
                {priceEditable ? (
                  <div className="flex items-center gap-1">
                    <input type="number" value={cfg.priceOverride != null ? cfg.priceOverride : (price ?? '')}
                      onChange={e => onChange(c => ({ ...c, priceOverride: e.target.value }))}
                      className="w-24 px-2 py-1 border border-line rounded text-right text-[16px] font-bold text-bordeaux bg-white" />
                    <span className="text-bordeaux font-bold">DH</span>
                  </div>
                ) : (
                  <b className="text-bordeaux text-[18px]">{price != null ? price + ' DH' : '—'}</b>
                )}
              </div>
              <button onClick={add} disabled={(price == null && !(priceEditable && cfg.priceOverride)) || !requiredOk}
                className="w-full py-3 bg-bordeaux text-cream rounded-full text-[14px] font-medium disabled:opacity-50">
                {addLabel}
              </button>
              {!requiredOk && (
                <div className="text-[11px] text-bordeaux text-center mt-2">Avant d'ajouter, remplis les champs obligatoires : {requireAll && <>parfums, personnes, thème/âge/message, </>}le <b>modèle</b>, le <b>décor</b> et les <b>fleurs</b>.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
