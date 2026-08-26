// Configurateur générique d'article (lit les attributs réels du produit Odoo).
// Partagé entre « Nouvelle commande » (NewOrderView) et « ✏️ Articles » (OrderEditModal).
// Fichier dédié pour éviter qu'un écran chargé à la demande (lazy) en importe un autre
// statiquement — ce qui cassait le découpage du code (chunks introuvables / 404).

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../lib/toast'
import { buildBurnAwayWarn } from '../lib/burnAway'
import { loadPalette, TYPE_SPEC, detectTypeFromName, makeEmptyLot, TYPE_LABELS } from '../lib/gmFiches'
import LotEditor from './LotEditor'

// Catégories où le prix est modifiable
export const PRICE_EDITABLE = new Set(['cd', 'divers'])

export function ConfiguratorModal({ cfg, onChange, onClose, onAdd, priceEditable, addLabel = 'Ajouter au panier', embedded = false }) {
  const { item, loading, attributes, variants, sel, text, warn } = cfg
  const optionAttrs = attributes.filter(a => a.type === 'option')
  const textAttrs = attributes.filter(a => a.type === 'text')
  const photoFiles = cfg.photoFiles || []
  const photoPreviews = cfg.photoPreviews || []
  function addPhotos(files) {
    const arr = Array.from(files || []).filter(f => f && f.type?.startsWith('image/'))
    if (!arr.length) return
    onChange(c => ({
      ...c,
      photoFiles: [...(c.photoFiles || []), ...arr],
      photoPreviews: [...(c.photoPreviews || []), ...arr.map(f => URL.createObjectURL(f))],
    }))
  }
  function removePhotoAt(idx) {
    onChange(c => ({
      ...c,
      photoFiles: (c.photoFiles || []).filter((_, i) => i !== idx),
      photoPreviews: (c.photoPreviews || []).filter((_, i) => i !== idx),
    }))
  }

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
      // Combo exact pas pré-créé (variantes « dynamiques » Odoo) → on prend la variante la plus proche,
      // mais en PRIORISANT la forme + le nombre de personnes (ils déterminent le fond surgelé / la production).
      // Sinon on risquait d'envoyer une variante d'une autre forme (ex. rond) → mauvaise pièce en prod.
      const structIds = new Set(optionAttrs.filter(a => /forme|taille|type|personne|portion|\bpart/i.test(a.name)).map(a => a.attrId))
      let bestScore = -Infinity
      for (const v of variants) {
        let score = 0
        for (const a of optionAttrs) {
          if (v.values[a.attrId] === sel[a.attrId]) score += structIds.has(a.attrId) ? 1000 : 1
        }
        if (score > bestScore) { bestScore = score; resolved = v }
      }
    }
  }
  const price = resolved?.price ?? null

  function pick(attrId, val) { onChange(c => ({ ...c, sel: { ...c.sel, [attrId]: val } })) }
  function setText(attrId, val) { onChange(c => ({ ...c, text: { ...c.text, [attrId]: val } })) }

  // Blocs « anti-erreur » pour les produits décorés (cake design CD- ET GM-/GMD-).
  // 1) Modèle du client (choix forcé, rien par défaut)
  const modele = cfg.modele || ''   // 'identique' | 'inspire'
  function setModele(v) { onChange(c => ({ ...c, modele: v })) }
  // 2) Décor : modelage main / impression / les deux / rien
  // Décor : multi-sélection (Modelage / Impression / Moule cumulables) OU « Rien » (exclusif).
  const decor = cfg.decor || { modes: [], main: '', imp: '', moule: '' }
  const decorModes = Array.isArray(decor.modes) ? decor.modes : []
  function setDecor(patch) { onChange(c => ({ ...c, decor: { ...(c.decor || { modes: [], main: '', imp: '', moule: '' }), ...patch } })) }
  function toggleDecorMode(m) {
    if (m === 'rien') { setDecor({ modes: decorModes.includes('rien') ? [] : ['rien'] }); return }
    const cur = decorModes.filter(x => x !== 'rien')
    setDecor({ modes: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m] })
  }
  const showMain = decorModes.includes('main')
  const showImp = decorModes.includes('imp')
  const showMoule = decorModes.includes('moule')
  const decorOk = decorModes.includes('rien')
    || (decorModes.length > 0
      && (!showMain || decor.main.trim())
      && (!showImp || decor.imp.trim())
      && (!showMoule || (decor.moule || '').trim()))
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
  // Validation : SEUL le cake design (CD-) force modèle + décor + fleurs.
  // Les gourmandises (GM-) sont libres : rien n'est obligatoire (choix par défaut : optionnel).
  const isCd = cfg.catKey === 'cd'
  const decoratedOk = !isCd || (modele === 'identique') || (!!modele && decorOk && (fleurs.types || []).length > 0)

  // Détails accessoire (gourmandises GM-) : MÊME formulaire par type que le modal Accessoires — TOUT optionnel.
  const isGm = cfg.catKey === 'gm'
  const gmType = isGm ? detectTypeFromName(item.name) : null
  const gmSpec = gmType ? TYPE_SPEC[gmType] : null
  const [accPalette, setAccPalette] = useState([])
  useEffect(() => { if (isGm) loadPalette().then(setAccPalette).catch(() => {}) }, [isGm])
  const accLots = cfg.accLots || []
  const accParfumNormal = !!cfg.accParfumNormal
  const accTete = cfg.accTete || 'bas'
  function setAccLots(updater) { onChange(c => ({ ...c, accLots: typeof updater === 'function' ? updater(c.accLots || []) : updater })) }
  // Résumé texte des lots (pour l'affichage sur la commande / calendrier). Vide = rien saisi.
  function lotSummary(lot) {
    const parts = []
    if (lot.qty) parts.push(`${lot.qty}`)
    const col = accPalette.find(c => c.id === lot.couleur_id); if (col) parts.push(col.nom)
    if (lot.forme) { const fo = gmSpec?.formeOptions?.find(f => f.value === lot.forme); parts.push(fo ? fo.label : lot.forme) }
    if (lot.has_zigzag) { const z = accPalette.find(c => c.id === lot.zigzag_couleur_id); parts.push('zigzag' + (z ? ` ${z.nom}` : '')) }
    if (lot.has_perles) { const p = accPalette.find(c => c.id === lot.perles_couleur_id); parts.push('perles' + (p ? ` ${p.nom}` : '')) }
    return parts.join(' ')
  }
  const accSummary = accParfumNormal
    ? 'parfum normal'
    : accLots.map(lotSummary).filter(Boolean).join(' ; ')

  // Supplément « Burn away » : +50 DH, avec remise éventuelle en %.
  const burnRemisePct = cfg.burnAway ? Math.min(100, Math.max(0, Number(cfg.burnRemise) || 0)) : 0
  const burnSupp = cfg.burnAway ? Math.round(50 * (1 - burnRemisePct / 100)) : 0
  // Prix final : pour CD-, on prend le prix saisi à la main s'il existe ; + le supplément burn away.
  const basePrice = priceEditable && cfg.priceOverride != null && cfg.priceOverride !== ''
    ? Number(cfg.priceOverride) : (price ?? 0)
  const finalPrice = Number(basePrice || 0) + burnSupp

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
    const decorSub = isCd
      ? (decorModes.includes('rien') ? 'Décor : rien'
        : [showMain && decor.main.trim() && `🖐️ ${decor.main.trim()}`, showImp && decor.imp.trim() && `🖨️ ${decor.imp.trim()}`, showMoule && (decor.moule || '').trim() && `🧊 ${(decor.moule || '').trim()}`].filter(Boolean).join(' · '))
      : ''
    // « Burn away » : on l'écrit dans l'avertissement de l'article (⚠️) → il remonte
    // tout seul en Production (product_note) et dans la fiche commande (warnings).
    const burnTag = cfg.burnAway ? buildBurnAwayWarn(cfg.burnMsg) : ''
    const finalWarn = [burnTag, warn].filter(Boolean).join(' · ')
    const subDisplay = [
      ...optionAttrs.map(a => sel[a.attrId]).filter(Boolean),
      ...textAttrs.map(a => text[a.attrId]).filter(Boolean),
      decorSub,
      finalWarn && `⚠️ ${finalWarn}`,
      photoFiles.length && `📎 ${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''}`,
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
      if (isCd) {
        // Modèle
        if (modele === 'identique') modeleLine = 'Modèle : à l\'identique (voir photo réf.)'
        else if (modele === 'inspire') modeleLine = 'Modèle : inspiration / adapté'
        // À l'identique → on reproduit la photo : pas de décor/fleurs à détailler.
        if (modele !== 'identique') {
          // Décor
          if (decorModes.includes('rien')) decorLines.push('Décor : rien à faire')
          else {
            if (showMain && decor.main.trim()) decorLines.push(`Modelage : ${decor.main.trim()}`)
            if (showImp && decor.imp.trim()) decorLines.push(`Impression : ${decor.imp.trim()}`)
            if (showMoule && (decor.moule || '').trim()) decorLines.push(`Moule : ${(decor.moule || '').trim()}`)
          }
          // Fleurs
          const FLEUR_LBL = { aucune: 'aucune', sucre: 'pâte à sucre', artif: 'artificielles', vraies: 'vraies fleurs' }
          if ((fleurs.types || []).length) {
            const noms = fleurs.types.map(t => FLEUR_LBL[t] || t).join(' + ')
            fleursLine = `Fleurs : ${noms}${fleurs.detail && fleurs.detail.trim() ? ` (${fleurs.detail.trim()})` : ''}`
          }
        }
      }
      // Détails accessoire (GM-) : résumé texte des lots pour affichage (tout optionnel).
      const accLine = (isGm && accSummary) ? `Accessoire : ${accSummary}` : ''
      lineDesc = [...cdTextLines, modeleLine, ...decorLines, fleursLine, accLine].filter(Boolean).join('\n')
    }

    // Combinaison d'attributs choisie → le serveur peut créer/retrouver la VRAIE variante Odoo
    // même si elle n'existe pas encore (ex. « coeur 10 pers » pas pré-créée).
    const combo = optionAttrs.filter(a => sel[a.attrId]).map(a => ({ attrId: a.attrId, value: sel[a.attrId] }))

    onAdd({
      name: lineName,
      desc: lineDesc,
      warn: finalWarn || '',
      photoFiles: cfg.photoFiles || [],
      sub: subDisplay,
      price: finalPrice,
      editable: priceEditable,
      catKey: cfg.catKey,
      variantId: resolved?.id || null,
      tmplId: item.tmplId || null,
      combo: combo.length ? combo : null,
      // Pré-fiche accessoire (GM-) : lots structurés + type, pour pré-remplir la fiche de production.
      // On enregistre dès qu'il y a du contenu : lot (qty/couleur/forme/zigzag/perles) OU tête en haut (cake pop).
      accPrefiche: (isGm && gmType && (
        accParfumNormal
        || accLots.some(l => l.qty || l.couleur_id || l.forme || l.has_zigzag || l.has_perles || l.zigzag_couleur_id || l.perles_couleur_id)
        || (gmSpec?.hasTetePosition && accTete === 'haut')
      ))
        ? { type_gm: gmType, lots: accParfumNormal ? [] : accLots, parfum_normal: accParfumNormal, tete_position: gmSpec?.hasTetePosition ? accTete : null }
        : null,
    })
  }

  return createPortal(
    <>
    {/* En mode panneau : la fenêtre couvre seulement la partie droite (au-dessus de la commande),
        le chat reste visible/cliquable à gauche, et un clic dehors ne ferme PAS (seul le ✕ ferme). */}
    <div
      className={embedded
        ? 'fixed inset-y-0 right-0 z-[140] w-full md:w-[50%] md:max-w-[640px] flex items-center justify-center p-4 bg-ink/40'
        : 'fixed inset-0 z-[140] flex items-center justify-center p-4 bg-ink/50'}
      onClick={embedded ? undefined : onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md max-h-[92dvh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
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

              {isCd && (
                <>
                  {/* 1 · Le modèle */}
                  <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                    <div className="text-[12px] font-bold text-bordeaux mb-2">1 · Le modèle du client {isCd && <span className="text-bordeaux">*</span>}</div>
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

                  {/* « À l'identique » → on reproduit la photo : pas besoin de détailler décor/fleurs. */}
                  {modele !== 'identique' && (<>
                  {/* 2 · Décor */}
                  <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                    <div className="text-[12px] font-bold text-bordeaux mb-2">2 · Décor — comment ? {isCd && <span className="text-bordeaux">*</span>} <span className="font-normal text-ink-soft normal-case">(plusieurs possibles)</span></div>
                    <div className="flex gap-1.5 mb-1">
                      {[['main', '🖐️', 'Modelage'], ['imp', '🖨️', 'Impression'], ['moule', '🧊', 'Moule'], ['rien', '🚫', 'Rien']].map(([m, ic, lbl]) => (
                        <button key={m} type="button" onClick={() => toggleDecorMode(m)}
                          className={`flex-1 rounded-lg py-2 px-1 text-[12px] font-bold border text-center ${decorModes.includes(m) ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>
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
                    {showMoule && (
                      <div className="mt-2">
                        <div className="text-[12px] font-bold text-ink-soft mb-1">À faire au moule <span className="text-bordeaux">*</span></div>
                        <textarea value={decor.moule || ''} onChange={e => setDecor({ moule: e.target.value })}
                          placeholder="ex : ourson au moule, étoile au moule"
                          className="w-full px-3 py-2 border border-line rounded-lg text-[13px] min-h-[48px]" />
                      </div>
                    )}
                  </div>

                  {/* 3 · Fleurs */}
                  <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                    <div className="text-[12px] font-bold text-bordeaux mb-2">3 · Fleurs {isCd && <span className="text-bordeaux">*</span>} <span className="font-normal text-ink-soft normal-case">(plusieurs possibles)</span></div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[['aucune', '🚫', 'Aucune'], ['sucre', '🍬', 'Pâte à sucre'], ['artif', '🌸', 'Artificielles'], ...(cfg.catKey === 'gm' ? [] : [['vraies', '🌹', 'Vraies']])].map(([v, ic, lbl]) => (
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
                  </>)}
                </>
              )}

              {isGm && gmSpec && (
                <div className="mb-3 border border-dashed border-bordeaux rounded-xl p-3 bg-[#fffdf7]">
                  <div className="text-[12px] font-bold text-bordeaux mb-2">Détails {(TYPE_LABELS[gmType] || 'accessoire').toLowerCase()} <span className="font-normal text-ink-soft normal-case">(optionnel — si tu as l'info)</span></div>

                  {gmSpec.hasParfumNormal && (
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => onChange(c => ({ ...c, accParfumNormal: false }))}
                        className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-bold border ${!accParfumNormal ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>Couleur</button>
                      <button type="button" onClick={() => onChange(c => ({ ...c, accParfumNormal: true }))}
                        className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-bold border ${accParfumNormal ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>Parfum normal</button>
                    </div>
                  )}

                  {gmSpec.hasTetePosition && !accParfumNormal && (
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => onChange(c => ({ ...c, accTete: 'bas' }))}
                        className={`flex-1 px-3 py-1.5 rounded-full text-[12px] border ${accTete === 'bas' ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>Tête en bas</button>
                      <button type="button" onClick={() => onChange(c => ({ ...c, accTete: 'haut' }))}
                        className={`flex-1 px-3 py-1.5 rounded-full text-[12px] border ${accTete === 'haut' ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line'}`}>Tête en haut</button>
                    </div>
                  )}

                  {!accParfumNormal && (<>
                    {accLots.map((lot, idx) => (
                      <LotEditor key={idx} lot={lot} palette={accPalette} spec={gmSpec}
                        onChange={nl => setAccLots(prev => prev.map((x, i) => i === idx ? nl : x))}
                        onDelete={() => setAccLots(prev => prev.filter((_, i) => i !== idx))} />
                    ))}
                    <button type="button" onClick={() => setAccLots(prev => [...prev, makeEmptyLot(null)])}
                      className="w-full mt-1 py-2 rounded-lg border border-dashed border-bordeaux text-bordeaux text-[12px] font-bold hover:bg-bordeaux/5">+ Ajouter un lot</button>
                  </>)}
                </div>
              )}

              <div className="mb-3">
                <div className="text-[12px] font-bold text-ink-soft mb-1">Photos (optionnel)</div>
                <label className="inline-flex items-center gap-2 border border-dashed border-bordeaux text-bordeaux rounded-lg px-3 py-2 text-[13px] cursor-pointer bg-white">
                  📎 {photoFiles.length ? 'Ajouter une photo' : 'Joindre une photo'}
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
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
                        addPhotos([file])
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
                {photoPreviews.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {photoPreviews.map((src, i) => (
                      <div key={i} className="relative">
                        <img src={src} alt="" className="max-h-28 rounded-lg border border-line object-contain" />
                        <button type="button" onClick={() => removePhotoAt(i)} title="Retirer"
                          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] leading-none flex items-center justify-center">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cfg.catKey === 'e' && (
                <div className="mb-3 border border-bordeaux rounded-xl p-3 bg-[#fdf3f6]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!cfg.burnAway}
                      onChange={e => onChange(c => ({ ...c, burnAway: e.target.checked }))} />
                    <span className="text-[13px] font-bold text-bordeaux">🔥 Burn away <span className="font-normal text-ink-soft">(photo comestible qui se consume)</span></span>
                  </label>
                  {cfg.burnAway && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[12px] text-ink-soft">Supplément <b className="text-bordeaux">+{burnSupp} DH</b>{burnRemisePct > 0 ? ` (remise ${burnRemisePct}% sur 50)` : ''}</span>
                        <label className="flex items-center gap-1 text-[12px] text-ink-soft whitespace-nowrap">
                          Remise
                          <input type="number" min="0" max="100" value={cfg.burnRemise || ''}
                            onChange={e => onChange(c => ({ ...c, burnRemise: e.target.value }))}
                            placeholder="0"
                            className="w-14 px-2 py-1 border border-line rounded text-right text-[13px]" /> %
                        </label>
                      </div>
                      <div className="text-[12px] font-bold text-ink-soft mb-1">Message à brûler <span className="font-normal">(si pas de photo)</span></div>
                      <textarea value={cfg.burnMsg || ''} onChange={e => onChange(c => ({ ...c, burnMsg: e.target.value }))}
                        placeholder="ex : Joyeux anniversaire Sarah"
                        className="w-full px-3 py-2 border border-line rounded-lg text-[13px] min-h-[44px]" />
                      <div className="text-[11px] text-bordeaux mt-1">📎 Joins la photo du client ci-dessous — sinon le message ci-dessus sera imprimé (« à brûler »).</div>
                    </div>
                  )}
                </div>
              )}

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
                  <b className="text-bordeaux text-[18px]">{price != null ? finalPrice + ' DH' : '—'}{burnSupp > 0 && price != null && <span className="text-[11px] font-normal text-ink-mute"> (dont 🔥 +{burnSupp})</span>}</b>
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

    </>,
    document.body
  )
}
