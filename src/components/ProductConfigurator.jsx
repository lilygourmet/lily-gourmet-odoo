// Configurateur générique d'article (lit les attributs réels du produit Odoo).
// Partagé entre « Nouvelle commande » (NewOrderView) et « ✏️ Articles » (OrderEditModal).
// Fichier dédié pour éviter qu'un écran chargé à la demande (lazy) en importe un autre
// statiquement — ce qui cassait le découpage du code (chunks introuvables / 404).

import { toast } from '../lib/toast'

// Catégories où le prix est modifiable + où on ajoute photo / Attention
export const PRICE_EDITABLE = new Set(['cd', 'divers'])
export const PHOTO_WARN = new Set(['cd', 'gm'])

export function ConfiguratorModal({ cfg, onChange, onClose, onAdd, withPhotoWarn, priceEditable, addLabel = 'Ajouter au panier' }) {
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

  // Prix final : pour CD-, on prend le prix saisi à la main s'il existe.
  const finalPrice = priceEditable && cfg.priceOverride != null && cfg.priceOverride !== ''
    ? Number(cfg.priceOverride) : (price ?? 0)

  // Cake design (CD-) : TOUS les champs sont obligatoires (options + thème/âge/message).
  const requireAll = cfg.catKey === 'cd'
  const allOptionsChosen = optionAttrs.every(a => sel[a.attrId])
  const allTextFilled = textAttrs.every(a => (text[a.attrId] || '').trim())
  const requiredOk = !requireAll || (allOptionsChosen && allTextFilled)

  function add() {
    // Description aérée : chaque attribut (parfum, thème, âge, message) sur sa ligne.
    const descLines = [
      ...optionAttrs.filter(a => sel[a.attrId]).map(a => `${dispLabel(a)} : ${sel[a.attrId]}`),
      ...textAttrs.filter(a => text[a.attrId]).map(a => `${a.name} : ${text[a.attrId]}`),
    ]
    const subDisplay = [
      ...optionAttrs.map(a => sel[a.attrId]).filter(Boolean),
      ...textAttrs.map(a => text[a.attrId]).filter(Boolean),
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
      lineDesc = textAttrs.filter(a => text[a.attrId]).map(a => `${a.name} : ${text[a.attrId]}`).join('\n')
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

              {withPhotoWarn && (
                <div className="mb-3">
                  <div className="text-[12px] font-bold text-[#B36B00] mb-1">⚠️ Attention / instruction spéciale (optionnel)</div>
                  <input value={warn} onChange={e => onChange(c => ({ ...c, warn: e.target.value }))}
                    placeholder="ex : le décor doit être en bleu · sans fruits à coque"
                    className="w-full px-3 py-2 border border-[#E08A00] bg-[#FFF8EC] rounded-lg text-[13px]" />
                </div>
              )}

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
                <div className="text-[11px] text-bordeaux text-center mt-2">Cake design : remplis tous les champs (parfums, nombre de personnes, thème, âge, message) avant d'ajouter.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
