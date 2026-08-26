import { useState, useEffect, useMemo } from 'react'
import { loadOrderCatalog, loadOrderProduct, createClient, createDevis, loadCdLoad } from '../../lib/commande'
import CakeDayPlanning, { CD_MAX_PER_SLOT } from '../CakeDayPlanning'
import { filePhoto } from '../../lib/photoCompress'

// ============================================================
// Page CLIENT (publique, sans login) — « lien commande » WhatsApp.
// Charge le vrai catalogue Cake Design d'Odoo + configurateur + finalisation
// + envoi → crée un DEVIS BROUILLON dans Odoo lié au client.
// (Accessoires bougies/topper = ajout suivant.)
// ============================================================

const B = '#7a1f3d', CREAM = '#FBF6EE', LINE = '#e7dccb', GOLD = '#C9A24B'
const LIVRAISON_TMPL = 2558  // produit Odoo « Livraison » : variantes = quartiers (attribut zone) + tarif réel
const CRENEAUX = ['10h – 12h', '12h – 14h', '14h – 16h', '16h – 18h', '18h – 20h']
const EXCLUDE_PRODUCTS = /macaron|sucette|guimauve|sabl/i   // exclus : macarons, sucettes/guimauve, sablés (gâteaux secs)
// Articles à NE PAS montrer dans le lien catalogue (demande Layla).
const EXCLUDE_CATALOGUE = /supr[êe]me|choux unitaire|tartelette nouvelle version|tartelette unit|plateau de mignardises|autre sal|macaron|sucette|guimauve/i
// 2ᵉ lien « nouvelle commande » (?commande=2) : catégories dans CET ordre (sans cake design).
const CATALOGUE_ORDER = [
  { key: 'e',  label: 'Entremets' },
  { key: 'mi', label: 'Mignardises' },
  { key: 'sa', label: 'Salé' },
  { key: 'su', label: 'Surgelés' },
  { key: 'b',  label: 'Boissons' },        // déjà limité aux jus côté serveur
  { key: 'gm', label: 'Gourmandises' },
  { key: 'gs', label: 'Gâteaux secs' },
]

export default function ClientOrderView() {
  const params = new URLSearchParams(window.location.search)
  const catalogue = params.get('commande') === '2'   // 2ᵉ lien : catalogue (sans cake design)
  const [name, setName] = useState(params.get('nom') || '')
  const [phone, setPhone] = useState(params.get('tel') || '')

  const [cats, setCats] = useState(null)
  const [err, setErr] = useState('')
  const [screen, setScreen] = useState('list')   // list | cfg | finalize | done
  const [catKey, setCatKey] = useState(null)     // catalogue : catégorie ouverte (null = vignettes)
  const [cfg, setCfg] = useState(null)
  const [cart, setCart] = useState([])
  // finalisation
  const [mode, setMode] = useState('retrait')     // retrait | livraison
  const [date, setDate] = useState('')
  const [heure, setHeure] = useState('16:00')      // retrait
  const [creneau, setCreneau] = useState('')       // livraison
  const [quartier, setQuartier] = useState(null)   // { zone, variantId, price }
  const [quartiers, setQuartiers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [heightOk, setHeightOk] = useState(false)   // a lu/accepté la hauteur des cake design
  // accessoires (cross-sell)
  const [crossOpen, setCrossOpen] = useState(false)
  const [acc, setAcc] = useState({ bougieVariants: [], etincelle: null, topper: null })
  const [bougieQty, setBougieQty] = useState({})
  const [accAdded, setAccAdded] = useState({})   // feedback « ✓ ajouté » sur étincelle/topper
  const [bougieOpen, setBougieOpen] = useState(false)   // tuile bougies ouverte ?

  useEffect(() => { loadOrderCatalog().then(setCats).catch(e => setErr(e?.message || 'Catalogue indisponible')) }, [])

  // Quartiers de livraison réels = variantes du produit « Livraison » (zone + tarif).
  useEffect(() => {
    loadOrderProduct(LIVRAISON_TMPL).then(d => {
      const za = (d.attributes || []).find(a => /zone/i.test(a.name))
      if (!za) return
      setQuartiers((d.variants || []).map(v => ({ zone: v.values[za.attrId], variantId: v.id, price: v.price })).filter(x => x.zone).sort((a, b) => a.price - b.price))
    }).catch(() => { /* ignore */ })
  }, [])

  // Charge les accessoires (bougies + variantes type, étincelles, topper) depuis le catalogue.
  useEffect(() => {
    if (!cats) return
    const items = (cats.find(c => c.key === 'cd')?.items) || []
    const bougie = items.find(i => /^bougies$/i.test((i.name || '').trim()))
    const etincelle = items.find(i => /étincel/i.test(i.name))
    const topper = items.find(i => /topper/i.test(i.name))
    ;(async () => {
      let bv = []
      if (bougie) {
        try {
          const d = await loadOrderProduct(bougie.tmplId)
          const ta = (d.attributes || []).find(a => /type/i.test(a.name))
          if (ta) bv = (d.variants || []).map(v => ({ type: v.values[ta.attrId], variantId: v.id, price: v.price })).filter(x => x.type)
        } catch { /* ignore */ }
      }
      setAcc({
        bougieVariants: bv,
        etincelle: etincelle ? { variantId: etincelle.variantId, price: etincelle.price ?? 25, name: etincelle.name } : null,
        topper: topper ? { variantId: topper.variantId, price: topper.price ?? 30, name: topper.name } : null,
      })
    })()
  }, [cats])

  function addAccessory(name, variantId, unitPrice, qty = 1) {
    if (!variantId) return
    setCart(prev => [...prev, { variantId, name, price: unitPrice, qty, accessory: true }])
  }
  // Change la quantité d'un article du panier (sans rouvrir l'article).
  function bumpQty(i, d) { setCart(p => p.map((c, j) => j === i ? { ...c, qty: Math.max(1, (c.qty || 1) + d) } : c)) }
  function bqChange(type, d) { setBougieQty(q => ({ ...q, [type]: Math.max(0, (q[type] || 0) + d) })) }
  function addBougies() { acc.bougieVariants.forEach(bv => { const n = bougieQty[bv.type] || 0; if (n > 0) addAccessory('Bougies ' + bv.type, bv.variantId, bv.price, n) }); setBougieQty({}) }
  function addAccTile(key, name, variantId, price) { addAccessory(name, variantId, price); setAccAdded(a => ({ ...a, [key]: (a[key] || 0) + 1 })) }
  function closeCross() { setCrossOpen(false); setBougieQty({}); setAccAdded({}); setBougieOpen(false); setScreen('gmlist') }

  const cdItems = useMemo(() => {
    const cd = (cats || []).find(c => c.key === 'cd')
    return (cd?.items || []).filter(it => /étage/i.test(it.name)).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
  }, [cats])
  // Sections du 2ᵉ lien (catalogue) : catégories demandées, dans l'ordre, non vides.
  const catSections = useMemo(() => {
    if (!cats) return []
    return CATALOGUE_ORDER
      .map(o => {
        let items = ((cats.find(c => c.key === o.key)?.items) || []).filter(it => !EXCLUDE_CATALOGUE.test(it.name || ''))
        if (o.key === 'b') items = items.filter(it => /litre/i.test(it.name || ''))   // boissons : seulement « Jus (litre) »
        return { ...o, items }
      })
      .filter(s => s.items.length > 0)
  }, [cats])
  // Photo « mère » de la vignette Gourmandises = celle des sablés.
  const sableImg = useMemo(() => {
    for (const c of (cats || [])) {
      const s = (c.items || []).find(it => /sabl/i.test(it.name || '') && it.image)
      if (s) return s.image
    }
    return null
  }, [cats])
  // Gourmandises : UNIQUEMENT la catégorie « Gourmandises » (gm), macarons/sucette/guimauve exclus.
  const extraCats = useMemo(() => (cats || [])
    .filter(c => c.key === 'gm')
    .map(c => ({ ...c, items: (c.items || []).filter(it => !EXCLUDE_PRODUCTS.test(it.name || '')) }))
    .filter(c => c.items.length > 0), [cats])

  // Photos d'appel pour la confirmation : 1 plateau salé (SA-) + 1 sucré (MI-), depuis le catalogue déjà chargé.
  const plateaux = useMemo(() => {
    const sa = (cats?.find(c => c.key === 'sa')?.items) || []
    const mi = (cats?.find(c => c.key === 'mi')?.items) || []
    return {
      sale: (sa.find(it => /sandwich/i.test(it.name)) || sa.find(it => it.image))?.image || null,
      sucre: (mi.find(it => /choux/i.test(it.name) && it.image) || mi.find(it => it.image))?.image || null,
    }
  }, [cats])

  async function openItem(it, kind = 'cake') {
    setScreen('cfg')
    setCfg({ item: it, kind, loading: true, attributes: [], variants: [], sel: {}, text: {}, comment: '', photoFiles: [], photoPreviews: [] })
    try {
      const d = await loadOrderProduct(it.tmplId)
      setCfg(c => c && c.item.tmplId === it.tmplId ? { ...c, loading: false, attributes: d.attributes || [], variants: d.variants || [] } : c)
    } catch { setCfg(c => c ? { ...c, loading: false } : c) }
  }

  const optionAttrs = cfg ? cfg.attributes.filter(a => a.type === 'option') : []
  const textAttrs = cfg ? cfg.attributes.filter(a => a.type === 'text') : []

  const resolved = useMemo(() => {
    if (!cfg || cfg.loading) return null
    if (optionAttrs.length === 0) return cfg.variants[0] || null
    if (!optionAttrs.every(a => cfg.sel[a.attrId])) return null
    const exact = cfg.variants.find(v => optionAttrs.every(a => v.values[a.attrId] === cfg.sel[a.attrId]))
    if (exact) return exact
    let best = -1, r = null
    for (const v of cfg.variants) { const s = optionAttrs.reduce((acc, a) => acc + (v.values[a.attrId] === cfg.sel[a.attrId] ? 1 : 0), 0); if (s > best) { best = s; r = v } }
    return r
  }, [cfg, optionAttrs])
  // Prix par PART (cake design) passé dans le lien (?part=60) : la pâtissière l'a fixé
  // d'avance (après avoir vu le design) → on calcule personnes × part au lieu du prix
  // fixe de la variante Odoo. Si on ne sait pas lire le nb de personnes, on garde le prix Odoo.
  const partPrice = useMemo(() => { const v = Number(params.get('part')); return v > 0 ? v : null }, [])
  const persons = useMemo(() => {
    if (!cfg) return null
    // 1) Attribut « Nombre de personnes / portions / parts » → on lit son nombre (le plus fiable).
    for (const a of optionAttrs) {
      if (/pers|personne|portion|\bpart/i.test(a.name)) {
        const m = String(cfg.sel[a.attrId] || '').match(/(\d+)/)
        if (m) return Number(m[1])
      }
    }
    // 2) Une valeur d'option qui contient un nombre + mot-clé.
    for (const a of optionAttrs) {
      const val = String(cfg.sel[a.attrId] || '')
      const m = val.match(/(\d+)/)
      if (m && /pers|personne|portion|\bpart/i.test(`${a.name} ${val}`)) return Number(m[1])
    }
    // 3) Une option dont la valeur est un nombre seul.
    for (const a of optionAttrs) { const val = String(cfg.sel[a.attrId] || '').trim(); if (/^\d+$/.test(val)) return Number(val) }
    // 4) Repli : « N pers/personnes » dans le nom du produit.
    const m = String(cfg.item?.name || '').match(/(\d+)\s*(pers|personne)/i)
    return m ? Number(m[1]) : null
  }, [cfg, optionAttrs])
  const usePartPrice = !!(partPrice && cfg?.kind === 'cake' && persons)
  const price = usePartPrice ? persons * partPrice : (resolved?.price ?? null)
  // Devis ferme = catalogue (prix Odoo réels) OU cake design chiffré (prix par part).
  const firmOrder = catalogue || !!partPrice
  const fraisierSelected = useMemo(() => optionAttrs.some(a => /fraisier/i.test(String(cfg?.sel[a.attrId] || ''))) || /fraisier/i.test(cfg?.item?.name || ''), [cfg, optionAttrs])

  function pick(attrId, val) { setCfg(c => ({ ...c, sel: { ...c.sel, [attrId]: val } })) }
  function setText(attrId, val) { setCfg(c => ({ ...c, text: { ...c.text, [attrId]: val } })) }

  function addToCart() {
    if (price == null || !resolved) return
    const opts = optionAttrs.filter(a => cfg.sel[a.attrId]).map(a => `${a.name} : ${cfg.sel[a.attrId]}`)
    // Thème OBLIGATOIRE · âge vide → « 0 » · message vide → « pas de message ».
    const missing = []
    const txt = []
    for (const a of textAttrs) {
      let v = (cfg.text[a.attrId] || '').trim()
      if (/th[èe]me/i.test(a.name)) { if (!v) missing.push('le thème') }
      else if (/\bage\b|âge/i.test(a.name)) { if (!v) v = '0' }
      else if (/message/i.test(a.name)) { if (!v) v = 'pas de message' }
      if (v) txt.push(`${a.name} : ${v}`)
    }
    // Cake design : la photo du modèle est obligatoire.
    if (cfg.kind === 'cake' && !cfg.photoFiles?.length) missing.push('la photo du modèle')
    if (missing.length) { alert('Pour ajouter ce gâteau, il manque :\n• ' + missing.join('\n• ')); return }

    // MÊME FORMAT que « Nouvelle commande » : « CD- Nom (pers, parfums) » + thème/âge/message en desc.
    // (Sinon le calendrier reçoit un format verbeux et perd le parfum / nb de personnes.)
    let lineName = cfg.item.name
    let lineDesc = [...opts, ...txt].join('\n')
    if (cfg.kind === 'cake') {
      const base = cfg.item.name.replace(/^(CD-|GM-|GMD-)\s*/i, '')
      const persA = optionAttrs.find(a => /personne|portion|\bpart/i.test(a.name))
      const tailleA = optionAttrs.find(a => /forme|taille|type/i.test(a.name))
      const parfumA = optionAttrs.filter(a => /parfum/i.test(a.name))
      const usedIds = new Set([persA?.attrId, tailleA?.attrId, ...parfumA.map(a => a.attrId)].filter(Boolean))
      const otherA = optionAttrs.filter(a => !usedIds.has(a.attrId))
      const parts = []
      if (persA && cfg.sel[persA.attrId]) parts.push((String(cfg.sel[persA.attrId]).match(/\d+/) || [cfg.sel[persA.attrId]])[0])
      if (tailleA && cfg.sel[tailleA.attrId]) parts.push(cfg.sel[tailleA.attrId])
      parfumA.forEach(a => { if (cfg.sel[a.attrId]) parts.push(cfg.sel[a.attrId]) })
      otherA.forEach(a => { if (cfg.sel[a.attrId]) parts.push(cfg.sel[a.attrId]) })
      lineName = `CD- ${base}${parts.length ? ` (${parts.join(', ')})` : ''}`
      lineDesc = txt.join('\n')
    }

    setCart(prev => [...prev, {
      variantId: resolved.id, name: lineName, price,
      desc: lineDesc,
      detail: [...opts, ...txt].join(' · '),
      comment: cfg.comment.trim(),
      photoFiles: cfg.photoFiles, qty: 1,
      fraisier: /fraisier/i.test(cfg.item.name + ' ' + [...opts].join(' ')),
      isCake: cfg.kind === 'cake',
    }])
    setCfg(null)
    // Mode catalogue : retour à la liste des catégories. Sinon : cross-sell pour un cake, gmlist pour une gourmandise.
    if (catalogue) setScreen('list')
    else if (cfg.kind === 'cake') { setBougieQty({}); setAccAdded({}); setBougieOpen(false); setCrossOpen(true) }
    else setScreen('gmlist')
  }

  const cartSum = cart.reduce((s, c) => s + (Number(c.price) || 0) * (c.qty || 1), 0)
  const bougieInCart = cart.filter(c => /^Bougies (simple|fine|en chiffre)/i.test(c.name || '')).reduce((s, c) => s + (c.qty || 1), 0)
  const total = cartSum + (mode === 'livraison' && quartier ? quartier.price : 0)
  const hasFraisierCake = cart.some(c => c.fraisier && c.isCake)        // cake design → 16h
  const hasFraisierEntremet = cart.some(c => c.fraisier && !c.isCake)   // entremets → 12h
  const hasCake = cart.some(c => c.isCake)

  function goFinalize() {
    if (!cart.length) return
    setScreen('finalize')
  }

  async function submit() {
    // Liste claire de TOUT ce qui manque pour pouvoir commander.
    const missing = []
    if (name.trim().split(/\s+/).filter(Boolean).length < 2) missing.push('votre nom ET prénom')
    if (!phone.trim()) missing.push('votre numéro')
    if (!date) missing.push('la date')
    else if (date < new Date().toLocaleDateString('en-CA')) { alert('La date choisie est déjà passée. Choisissez une date à venir 🙂'); return }
    if (mode === 'livraison' && !creneau) missing.push('le créneau de livraison')
    if (mode === 'livraison' && !quartier) missing.push('votre quartier')
    if (hasCake && !heightOk) missing.push('cocher que vous avez lu la hauteur des gâteaux')
    if (missing.length) { alert('Pour passer commande, il manque :\n• ' + missing.join('\n• ')); return }
    // Fraisier cake design : retrait après 16h.
    if (hasFraisierCake) {
      const early = mode === 'livraison' ? /^(10h|12h|14h)/.test(creneau) : (heure && heure < '16:00')
      if (early) { alert("🍓 Pour l'option fraisier, prévoyez le retrait après 16 h. Choisissez une heure à partir de 16 h."); return }
    }
    // Fraisier entremets : disponible à partir de 12h.
    if (hasFraisierEntremet) {
      const early = mode === 'livraison' ? /^10h/.test(creneau) : (heure && heure < '12:00')
      if (early) { alert("🍓 Le fraisier (entremets) est disponible à partir de 12 h. Choisissez une heure à partir de 12 h."); return }
    }
    // Cake design en retrait : un créneau complet (3 gâteaux déjà) n'est pas réservable en ligne.
    if (hasCake && mode === 'retrait' && date && heure) {
      const h = parseInt(heure, 10)
      const load = await loadCdLoad(date)
      if ((load[h] || 0) >= CD_MAX_PER_SLOT) {
        alert(`Le créneau de ${h}h est complet pour les gâteaux ce jour-là 🙏\nChoisissez un créneau « disponible » (en vert), ou contactez-nous sur WhatsApp pour ce créneau précis.`)
        return
      }
    }
    setSubmitting(true)
    try {
      const c = await createClient(name.trim(), phone.trim())
      const lines = await Promise.all(cart.map(async l => {
        const base = { variantId: l.variantId, qty: l.qty || 1, price: l.price, name: l.name, desc: l.desc || '', comment: l.comment || '' }
        if (l.photoFiles?.length) base.photos = await Promise.all(l.photoFiles.map(filePhoto))
        return base
      }))
      // Livraison = vraie ligne dans le devis (variante zone + tarif réel).
      if (mode === 'livraison' && quartier?.variantId) {
        lines.push({ variantId: quartier.variantId, qty: 1, price: quartier.price, name: 'Livraison', desc: quartier.zone, comment: '' })
      }
      const jour = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      const note = mode === 'livraison' ? `Livraison · ${quartier?.zone || ''} · ${jour} · ${creneau}` : `Retrait boutique · ${jour} · ${heure}`
      const deliveryTime = mode === 'livraison' ? (creneau.match(/(\d+)h/) ? creneau.match(/(\d+)h/)[1].padStart(2, '0') + ':00' : '16:00') : heure
      await createDevis({
        partnerId: c.id, deliveryDate: date, deliveryTime, note, lines, clientPhone: phone.trim(),
        source: 'client', firm: firmOrder, clientName: name.trim(), hasCake,
      })
      setScreen('done')
    } catch (e) {
      const msg = e?.message || (typeof e === 'string' ? e : "L'envoi a échoué. Vérifiez votre connexion et réessayez.")
      alert('Erreur : ' + msg)
    }
    finally { setSubmitting(false) }
  }

  // styles
  const wrap = { maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: CREAM, paddingBottom: (cart.length && (screen === 'list' || screen === 'gmlist')) ? 90 : 20, fontFamily: '-apple-system,Segoe UI,Roboto,sans-serif' }
  const tile = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 3px 10px rgba(122,31,61,.05)' }
  const opt = (sel) => ({ border: `1.5px solid ${sel ? B : LINE}`, background: sel ? B : '#fff', color: sel ? '#fff' : '#241a16', borderRadius: 999, padding: '9px 14px', fontSize: 13, cursor: 'pointer' })
  const inp = { width: '100%', padding: '11px 13px', border: `1.5px solid ${LINE}`, borderRadius: 12, fontSize: 14, background: CREAM, boxSizing: 'border-box' }
  const qtyBtn = { width: 24, height: 24, borderRadius: 7, border: `1px solid ${LINE}`, background: '#fff', color: B, fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }
  const h2 = { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 19, color: B, margin: '6px 2px 12px' }
  const addbtn = (dis) => ({ width: '100%', background: B, color: '#fff', border: 'none', borderRadius: 999, padding: 15, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: dis ? .5 : 1 })
  const stepBtn = { width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${B}`, background: '#fff', color: B, fontSize: 17, cursor: 'pointer', lineHeight: 1 }
  const accTile = { width: 100, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 8, cursor: 'pointer', textAlign: 'center' }

  // Détail complet du panier — affiché EN BAS du contenu (ne cache plus les produits).
  const cartSectionJsx = cart.length > 0 ? (
    <div style={{ marginTop: 20, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: B, marginBottom: 8 }}>🛒 Ma commande</div>
      {cart.map((c, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
          <span>{c.accessory ? '➕' : '🎂'} {c.name}{c.detail ? <span style={{ color: '#9a8e80' }}> · {c.detail}</span> : ''}</span>
          <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <button type="button" onClick={() => bumpQty(i, -1)} style={qtyBtn}>−</button>
            <b style={{ minWidth: 14, textAlign: 'center' }}>{c.qty || 1}</b>
            <button type="button" onClick={() => bumpQty(i, 1)} style={qtyBtn}>+</button>
            <span style={{ marginLeft: 4 }}>{firmOrder ? '' : '~'}{c.price * (c.qty || 1)} DH</span>
            <span style={{ color: '#b33', cursor: 'pointer', paddingLeft: 4 }} onClick={() => setCart(p => p.filter((_, j) => j !== i))}>✕</span>
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 15 }}>
        <span>Total {!firmOrder && <span style={{ fontSize: 11, color: '#9a8e80' }}>approximatif</span>}</span><b style={{ color: B, fontSize: 18 }}>{firmOrder ? '' : '~'}{cartSum} DH</b>
      </div>
    </div>
  ) : null

  if (err) return <div style={{ ...wrap, padding: 24, textAlign: 'center', color: B }}>⚠️ {err}</div>
  if (!cats) return <div style={{ ...wrap, padding: 40, textAlign: 'center', color: '#9a8e80' }}>Chargement…</div>

  return (
    <div style={wrap}>
      {/* Page pleine : comprendre la hauteur des gâteaux. Couvre tout tant que pas accepté. (cake design uniquement) */}
      {!catalogue && !heightOk && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: CREAM, overflowY: 'auto' }}>
          <div style={{ maxWidth: 460, margin: '0 auto', padding: '18px 14px 28px' }}>
            {/* On garde le haut (titre + explication + 3 étapes) ; le bandeau du bas est masqué. */}
            <div style={{ width: '100%', aspectRatio: '1024 / 1080', overflow: 'hidden', borderRadius: 12 }}>
              <img src="/hauteur-gateaux.jpg" alt="Comprendre la hauteur de nos gâteaux" style={{ width: '100%', display: 'block', objectFit: 'cover', objectPosition: 'top' }} />
            </div>
            <button onClick={() => setHeightOk(true)} style={{ width: '100%', marginTop: 16, background: GOLD, color: '#3a2a10', border: 'none', borderRadius: 999, padding: 15, fontSize: 15.5, fontWeight: 800, cursor: 'pointer' }}>J'ai lu et je suis d'accord</button>
          </div>
        </div>
      )}

      <header style={{ background: B, color: CREAM, padding: '16px 18px 14px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 21 }}>Lily Gourmet</div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 3 }}>Bonjour {name || ''} 🌸 composez votre {catalogue ? 'commande' : 'Cake Design'} tranquillement 💛</div>
      </header>

      {/* 2ᵉ lien — catalogue : 1) vignettes de catégories */}
      {screen === 'list' && catalogue && !catKey && (
        <div style={{ padding: 16 }}>
          <h2 style={h2}>Composez votre commande</h2>
          <div style={{ fontSize: 13, color: '#9a8e80', marginBottom: 12 }}>Choisissez une catégorie 👇</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            {catSections.map(sec => {
              const img = sec.key === 'gm' ? sableImg : sec.items.find(it => it.image)?.image
              return (
                <div key={sec.key} style={tile} onClick={() => setCatKey(sec.key)}>
                  <div style={{ height: 100, background: '#F4EADb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38 }}>
                    {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍽️'}
                  </div>
                  <div style={{ padding: '11px 10px', fontSize: 14.5, fontWeight: 700, color: B }}>{sec.label}</div>
                </div>
              )
            })}
          </div>
          {cartSectionJsx}
        </div>
      )}

      {/* 2ᵉ lien — catalogue : 2) produits de la catégorie choisie + retour */}
      {screen === 'list' && catalogue && catKey && (
        <div style={{ padding: 16 }}>
          <button onClick={() => setCatKey(null)} style={{ background: 'none', border: 'none', color: B, fontSize: 14, fontWeight: 600, padding: '8px 2px', cursor: 'pointer' }}>‹ Retour aux catégories</button>
          <h2 style={h2}>{catSections.find(s => s.key === catKey)?.label || ''}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            {(catSections.find(s => s.key === catKey)?.items || []).map(it => (
              <div key={it.tmplId} style={tile} onClick={() => openItem(it, catKey === 'gm' ? 'gm' : 'cat')}>
                <div style={{ height: 110, background: '#F4EADb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                  {it.image ? <img src={it.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍰'}
                </div>
                <div style={{ padding: '9px 10px', fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                <div style={{ padding: '0 10px 9px', fontSize: 13, color: B, fontWeight: 700 }}>{it.configurable ? 'configurer' : `${firmOrder ? '' : '~'}${it.price ?? '—'} DH`}</div>
              </div>
            ))}
          </div>
          {cartSectionJsx}
        </div>
      )}

      {screen === 'list' && !catalogue && (
        <div style={{ padding: 16 }}>
          <h2 style={h2}>Nos Cake Design</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            {cdItems.map(it => (
              <div key={it.tmplId} style={tile} onClick={() => openItem(it)}>
                <div style={{ height: 110, background: '#F4EADb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                  {it.image ? <img src={it.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🎂'}
                </div>
                <div style={{ padding: '9px 10px', fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                <div style={{ padding: '0 10px 9px', fontSize: 13, color: B, fontWeight: 700 }}>{it.configurable ? 'configurer' : `${firmOrder ? '' : '~'}${it.price ?? '—'} DH`}</div>
              </div>
            ))}
          </div>
          {cartSectionJsx}
        </div>
      )}

      {screen === 'cfg' && cfg && (
        <div style={{ padding: 16 }}>
          <button onClick={() => { setScreen(catalogue ? 'list' : (cfg.kind === 'gm' ? 'gmlist' : 'list')); setCfg(null) }} style={{ background: 'none', border: 'none', color: B, fontSize: 14, fontWeight: 600, padding: '8px 2px', cursor: 'pointer' }}>‹ Retour</button>
          <h2 style={h2}>{cfg.item.name}</h2>
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 16 }}>
            {cfg.loading ? <div style={{ color: '#9a8e80', fontSize: 13, padding: 10 }}>Chargement des options…</div> : (
              <>
                {optionAttrs.map(a => (
                  <div key={a.attrId} style={{ marginBottom: 15 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{a.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {a.values.map(v => <div key={v} style={opt(cfg.sel[a.attrId] === v)} onClick={() => pick(a.attrId, v)}>{v}</div>)}
                    </div>
                  </div>
                ))}
                {fraisierSelected && (cfg.kind === 'cake'
                  ? <div style={{ fontSize: 12, color: '#8a5a00', background: '#FFF6E5', border: '1px solid #f0d9b8', borderRadius: 10, padding: '8px 11px', marginBottom: 14 }}>🍓 Pour l'option <b>fraisier</b>, il faudra prévoir de récupérer votre commande <b>après 16 h</b>. Les fraises arrivent parfois en retard, ce qui peut ralentir toute la chaîne de préparation.</div>
                  : <div style={{ fontSize: 12, color: '#8a5a00', background: '#FFF6E5', border: '1px solid #f0d9b8', borderRadius: 10, padding: '8px 11px', marginBottom: 14 }}>🍓 Le <b>fraisier</b> est disponible <b>à partir de 12 h</b>.</div>)}
                {textAttrs.map(a => (
                  <div key={a.attrId} style={{ marginBottom: 15 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                      {a.name}
                      {/th[èe]me/i.test(a.name) ? <span style={{ color: B }}> *</span>
                        : /\bage\b|âge/i.test(a.name) ? <span style={{ color: '#9a8e80', fontWeight: 400, fontSize: 12 }}> (0 si vide)</span>
                          : /message/i.test(a.name) ? <span style={{ color: '#9a8e80', fontWeight: 400, fontSize: 12 }}> (« pas de message » si vide)</span>
                            : <span style={{ color: '#9a8e80', fontWeight: 400, fontSize: 12 }}> (optionnel)</span>}
                    </div>
                    <input value={cfg.text[a.attrId] || ''} onChange={e => setText(a.attrId, e.target.value)} style={inp} />
                  </div>
                ))}
                {(cfg.kind === 'gm' || cfg.kind === 'cake') && (
                  <div style={{ marginBottom: 15 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                      📎 Photos du modèle
                      {cfg.kind === 'cake'
                        ? <span style={{ color: B }}> *</span>
                        : <span style={{ color: '#9a8e80', fontWeight: 400, fontSize: 12 }}> (optionnel)</span>}
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1.5px dashed ${B}`, color: B, borderRadius: 12, padding: '11px 13px', fontSize: 13, cursor: 'pointer', background: '#fff' }}>
                      {cfg.photoFiles?.length ? 'Ajouter une photo' : 'Joindre une photo'}
                      <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => {
                        const arr = Array.from(e.target.files || []).filter(f => f && f.type?.startsWith('image/'))
                        if (arr.length) setCfg(c => ({ ...c, photoFiles: [...(c.photoFiles || []), ...arr], photoPreviews: [...(c.photoPreviews || []), ...arr.map(f => URL.createObjectURL(f))] }))
                        e.target.value = ''
                      }} />
                    </label>
                    {cfg.photoPreviews?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {cfg.photoPreviews.map((src, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <img src={src} alt="" style={{ maxHeight: 90, borderRadius: 10, border: `1px solid ${LINE}`, objectFit: 'contain' }} />
                            <button type="button" onClick={() => setCfg(c => ({ ...c, photoFiles: (c.photoFiles || []).filter((_, k) => k !== i), photoPreviews: (c.photoPreviews || []).filter((_, k) => k !== i) }))}
                              style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', fontSize: 11, border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {cfg.kind === 'cake' && <div style={{ fontSize: 12, color: '#9a8e80', marginTop: 6 }}>Au moins une photo du gâteau que vous voulez est obligatoire pour commander.</div>}
                  </div>
                )}
                <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>💬 Commentaire / précision (optionnel)</div>
                  <input value={cfg.comment} onChange={e => setCfg(c => ({ ...c, comment: e.target.value }))} placeholder="ex : décor en bleu, sans fruits à coque…" style={inp} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 2px' }}>
                  <span>Prix {!firmOrder && <span style={{ fontSize: 12, color: '#9a8e80' }}>(approximatif)</span>}{usePartPrice && <span style={{ fontSize: 12, color: '#9a8e80' }}> · {persons} × {partPrice} DH</span>}</span>
                  <b style={{ color: B, fontSize: 20 }}>{price != null ? `${firmOrder ? '' : '~'}${price} DH` : '— DH'}</b>
                </div>
                <button onClick={addToCart} disabled={price == null} style={addbtn(price == null)}>Ajouter à ma commande</button>
              </>
            )}
          </div>
        </div>
      )}

      {screen === 'gmlist' && (
        <div style={{ padding: 16 }}>
          <button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', color: B, fontSize: 14, fontWeight: 600, padding: '8px 2px', cursor: 'pointer' }}>‹ Retour aux cake design</button>
          <h2 style={h2}>Des gourmandises ? 🧁</h2>
          <p style={{ fontSize: 13, color: '#6a5d52', margin: '-6px 2px 14px' }}>Pour compléter. Ou validez directement votre commande en bas.</p>
          {extraCats.map(c => (
            <div key={c.key} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: B, margin: '2px 2px 8px' }}>{c.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                {c.items.map(it => (
                  <div key={it.tmplId} style={tile} onClick={() => openItem(it, 'gm')}>
                    <div style={{ height: 110, background: '#F4EADb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                      {it.image ? <img src={it.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧁'}
                    </div>
                    <div style={{ padding: '9px 10px', fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                    <div style={{ padding: '0 10px 9px', fontSize: 13, color: B, fontWeight: 700 }}>{it.configurable ? 'configurer' : `${firmOrder ? '' : '~'}${it.price ?? '—'} DH`}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {extraCats.length === 0 && <div style={{ color: '#9a8e80', fontSize: 13 }}>Aucune gourmandise disponible.</div>}
          {cartSectionJsx}
        </div>
      )}

      {screen === 'finalize' && (
        <div style={{ padding: 16 }}>
          <button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', color: B, fontSize: 14, fontWeight: 600, padding: '8px 2px', cursor: 'pointer' }}>‹ Ajouter autre chose</button>
          <h2 style={h2}>Finaliser ma commande</h2>
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 16 }}>
            <div style={{ marginBottom: 15 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Votre nom et prénom</div><input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom Nom" style={inp} /></div>
            <div style={{ marginBottom: 15 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Votre téléphone</div><input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="06…" style={inp} /></div>
            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏬 Retrait en boutique</div>
              <div style={{ fontSize: 12.5, color: '#8a5a00', background: '#FFF6E5', border: '1px solid #f0d9b8', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45 }}>
                🚚 <b>La livraison est possible</b> — mais elle se programme directement avec la boutique. <b>Appelez-nous</b> pour l'organiser selon les disponibilités.
              </div>
            </div>
            {mode === 'livraison' && (
              <div style={{ marginBottom: 15 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Quartier <span style={{ fontSize: 12, color: '#9a8e80' }}>(frais de livraison)</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {quartiers.length === 0 && <span style={{ fontSize: 12, color: '#9a8e80' }}>Chargement des quartiers…</span>}
                  {quartiers.map(q => <div key={q.variantId} style={opt(quartier?.variantId === q.variantId)} onClick={() => setQuartier(q)}>{q.zone} <span style={{ opacity: .7, fontSize: 11.5 }}>+{q.price}</span></div>)}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 15 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Date souhaitée</div><input type="date" value={date} min={new Date().toLocaleDateString('en-CA')} onChange={e => setDate(e.target.value)} style={inp} /></div>
            {mode === 'retrait'
              ? <div style={{ marginBottom: 15 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Heure de retrait</div>
                  <input type="time" value={heure} onChange={e => setHeure(e.target.value)} style={inp} />
                  {/* Cake design : créneaux disponibles (les complets ne sont pas choisissables). */}
                  {date && cart.some(c => c.isCake) && (
                    <CakeDayPlanning clientMode date={date} selectedHour={parseInt(heure, 10)}
                      onPick={h => setHeure(`${String(h).padStart(2, '0')}:00`)} />
                  )}
                </div>
              : <div style={{ marginBottom: 15 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Créneau de livraison (2h)</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{CRENEAUX.map(cr => <div key={cr} style={opt(creneau === cr)} onClick={() => setCreneau(cr)}>{cr}</div>)}</div></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 2px', borderTop: `1px solid ${LINE}`, marginTop: 6 }}>
              <span>Total {!firmOrder && <span style={{ fontSize: 12, color: '#9a8e80' }}>(approximatif)</span>}</span><b style={{ color: B, fontSize: 20 }}>{firmOrder ? '' : '~'}{total} DH</b>
            </div>
            {!firmOrder && <div style={{ fontSize: 11.5, color: '#9a8e80', margin: '-6px 2px 12px' }}>💰 Prix approximatif — le montant exact vous sera confirmé par Lily Gourmet.</div>}

            <button onClick={submit} disabled={submitting} style={{ width: '100%', background: GOLD, color: '#3a2a10', border: 'none', borderRadius: 999, padding: 15, fontSize: 15.5, fontWeight: 800, cursor: 'pointer', opacity: submitting ? .6 : 1 }}>{submitting ? 'Envoi…' : 'Confirmer ma commande'}</button>
          </div>
        </div>
      )}

      {screen === 'done' && (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 54 }}>💛</div>
          <h2 style={{ fontSize: 22, color: B }}>Merci {name || ''} !</h2>
          <p style={{ color: '#6a5d52', fontSize: 14.5, lineHeight: 1.5 }}>{firmOrder ? 'Voici votre devis 🌸' : 'Votre commande a bien été envoyée à Lily Gourmet.'}<br />{firmOrder ? 'On vous confirme la disponibilité de la date.' : 'On revient vers vous très vite pour confirmer.'}</p>
          {/* Récap = le devis « sur place » */}
          <div style={{ marginTop: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px', textAlign: 'left' }}>
            {cart.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, color: '#3a2a22', padding: '3px 0' }}>
                <span>{c.qty > 1 ? `${c.qty}× ` : ''}{c.name}</span>
                <span style={{ fontWeight: 600 }}>{Math.round((Number(c.price) || 0) * (c.qty || 1))} DH</span>
              </div>
            ))}
            {mode === 'livraison' && quartier && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, color: '#3a2a22', padding: '3px 0' }}>
                <span>Livraison · {quartier.zone}</span><span style={{ fontWeight: 600 }}>{quartier.price} DH</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${LINE}`, marginTop: 8, paddingTop: 8, fontSize: 15 }}>
              <b>Total{firmOrder ? '' : ' (approximatif)'}</b><b style={{ color: B }}>{Math.round(total)} DH</b>
            </div>
            <div style={{ fontSize: 12, color: '#9a8e80', marginTop: 6 }}>📅 {mode === 'livraison' ? `Livraison ${date} · ${creneau || ''}` : `Retrait ${date} · ${heure || ''}`}</div>
          </div>
          {!firmOrder && <p style={{ marginTop: 12, background: '#FFF6E5', border: '1px solid #f0d9b8', borderRadius: 12, padding: '12px 14px', color: '#8a5a00', fontSize: 13.5 }}>Le total est <b>approximatif</b> — le <b>prix exact</b> vous sera confirmé.</p>}
          <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px', color: '#6a5d52', fontSize: 13.5 }}>
            <div style={{ marginBottom: 10 }}>Un <b>événement</b> à organiser ? Complétez avec du <b>salé</b>, des <b>boissons</b> et des <b>plateaux sucrés</b> 💛</div>
            {(plateaux.sale || plateaux.sucre) && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                {plateaux.sale && <div style={{ flex: 1 }}><img src={plateaux.sale} alt="Plateau salé" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10 }} /><div style={{ fontSize: 12, marginTop: 4 }}>Plateau salé</div></div>}
                {plateaux.sucre && <div style={{ flex: 1 }}><img src={plateaux.sucre} alt="Plateau sucré" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10 }} /><div style={{ fontSize: 12, marginTop: 4 }}>Plateau sucré</div></div>}
              </div>
            )}
            {!catalogue && (
              <button onClick={() => { const p = new URLSearchParams({ commande: '2' }); if (name) p.set('nom', name); if (phone) p.set('tel', phone); window.location.href = `${window.location.origin}/?${p.toString()}` }}
                style={{ width: '100%', background: B, color: CREAM, border: 'none', borderRadius: 999, padding: 13, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
                Compléter ma commande (salé, boissons, plateaux…)
              </button>
            )}
          </div>
        </div>
      )}

      {crossOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(36,26,22,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }} onClick={closeCross}>
          <div style={{ background: CREAM, width: '100%', maxWidth: 430, borderRadius: '22px 22px 0 0', padding: '20px 18px 26px', maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: B, textAlign: 'center', margin: '4px 0 12px', fontSize: 19 }}>✨ Des accessoires ?</h3>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              {acc.bougieVariants.length > 0 && <div style={{ ...accTile, ...((bougieOpen || bougieInCart > 0) ? { borderColor: bougieInCart > 0 ? '#B6E2C8' : B, background: bougieInCart > 0 ? '#DCF0E2' : '#FBF3E6' } : {}) }} onClick={() => setBougieOpen(o => !o)}><div style={{ fontSize: 28 }}>🕯️</div><div style={{ fontSize: 11.5, fontWeight: 600 }}>Bougies</div><div style={{ fontSize: 11, color: bougieInCart > 0 ? '#085041' : B, fontWeight: 700 }}>{bougieOpen ? 'ouvert ▾' : (bougieInCart > 0 ? '✓ ×' + bougieInCart : 'choisir →')}</div></div>}
              {acc.etincelle && <div style={{ ...accTile, ...(accAdded.etincelle ? { background: '#DCF0E2', borderColor: '#B6E2C8' } : {}) }} onClick={() => addAccTile('etincelle', 'Bougies étincelles', acc.etincelle.variantId, acc.etincelle.price)}><div style={{ fontSize: 28 }}>🎇</div><div style={{ fontSize: 11.5, fontWeight: 600 }}>Étincelles</div><div style={{ fontSize: 11, color: accAdded.etincelle ? '#085041' : B, fontWeight: 700 }}>{accAdded.etincelle ? '✓ Ajouté ×' + accAdded.etincelle : (firmOrder ? '' : '~') + acc.etincelle.price + ' DH'}</div></div>}
              {acc.topper && <div style={{ ...accTile, ...(accAdded.topper ? { background: '#DCF0E2', borderColor: '#B6E2C8' } : {}) }} onClick={() => addAccTile('topper', 'Topper Happy Birthday', acc.topper.variantId, acc.topper.price)}><div style={{ fontSize: 12, color: B, fontWeight: 800, fontFamily: 'Georgia, serif', lineHeight: 1.05, padding: '6px 0' }}>Happy<br />Birthday</div><div style={{ fontSize: 11.5, fontWeight: 600 }}>Topper</div><div style={{ fontSize: 11, color: accAdded.topper ? '#085041' : B, fontWeight: 700 }}>{accAdded.topper ? '✓ Ajouté ×' + accAdded.topper : (firmOrder ? '' : '~') + acc.topper.price + ' DH'}</div></div>}
            </div>
            {bougieOpen && acc.bougieVariants.length > 0 && (
              <div style={{ marginBottom: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 13, color: '#6a5d52', marginBottom: 8 }}>Combien de bougies ? (tapez le nombre)</div>
                {acc.bougieVariants.map(bv => (
                  <div key={bv.type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', fontSize: 13.5, borderBottom: `1px solid ${LINE}` }}>
                    <span>🕯️ {bv.type} <b style={{ color: B, fontSize: 12, marginLeft: 6 }}>{bv.price ? (firmOrder ? '' : '~') + bv.price + ' DH' : 'offert'}</b></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => bqChange(bv.type, -1)} style={stepBtn}>−</button>
                      <input type="number" inputMode="numeric" min="0" value={bougieQty[bv.type] || 0} onChange={e => setBougieQty(q => ({ ...q, [bv.type]: Math.max(0, parseInt(e.target.value) || 0) }))} style={{ width: 54, textAlign: 'center', padding: '7px 4px', border: `1.5px solid ${LINE}`, borderRadius: 8, fontSize: 15, background: CREAM }} />
                      <button onClick={() => bqChange(bv.type, 1)} style={stepBtn}>+</button>
                    </span>
                  </div>
                ))}
                <button onClick={() => { addBougies(); setBougieOpen(false) }} style={{ ...addbtn(false), marginTop: 12 }}>Ajouter ces bougies</button>
              </div>
            )}
            <button onClick={closeCross} style={{ width: '100%', background: GOLD, color: '#3a2a10', border: 'none', borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Continuer →</button>
          </div>
        </div>
      )}

      {cart.length > 0 && (screen === 'list' || screen === 'gmlist') && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: 430, margin: '0 auto', background: '#fff', borderTop: `1px solid ${LINE}`, boxShadow: '0 -4px 18px rgba(0,0,0,.10)', padding: '10px 16px', zIndex: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, fontSize: 12.5, color: '#6a5d52' }}>🛒 {cart.length} article(s)<br /><b style={{ color: B, fontSize: 17 }}>{firmOrder ? '' : '~'}{cartSum} DH</b> {!firmOrder && <span style={{ fontSize: 10.5, color: '#9a8e80' }}>approx.</span>}</div>
          <button onClick={goFinalize} style={{ background: GOLD, color: '#3a2a10', border: 'none', borderRadius: 999, padding: '13px 22px', fontSize: 15, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>Valider →</button>
        </div>
      )}
    </div>
  )
}
