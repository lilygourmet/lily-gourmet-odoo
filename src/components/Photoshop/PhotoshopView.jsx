import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { listPhotos, uploadPhoto, trashPhoto, restorePhoto, renamePhoto, setPhotoSize, replacePhotoImage, duplicatePhoto, purgeOldTemp, purgeOldTrash, listFonts, uploadFont } from '../../lib/photoshop'
import RegionEditor from './RegionEditor'
import RemoveBgModal from './RemoveBgModal'
import DummyModal from './DummyModal'
import { loadImg, trimToContent } from './imgutil'
import { extractPsdLayers } from '../../lib/psdImport'
import { loadCdDay } from '../../lib/commande'

// ====== Studio photos : composer une planche A4 d'images imprimables pour gâteaux ======
// Porté de la maquette validée (mockups/photos-gateaux-composeur.html).
// Référence « commande du jour » (comme Charge CD) : date ISO + regroupement des gâteaux identiques.
const psToISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function psGroupCakes(cakes) {
  const map = new Map()
  for (const c of cakes) {
    const key = `${c.orderRef}|${c.pers}|${c.photo}|${c.isDevis}`
    if (map.has(key)) map.get(key).count++
    else map.set(key, { ...c, count: 1 })
  }
  return [...map.values()]
}
const MARG = 1, PW = 480           // PW = largeur affichée d'une page (px)
const AR_KEYS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي','ء','ة','ى','أ','إ','آ','ؤ','ئ','لا','٠','١','٢','٣','٤','٥','٦','٧','٨','٩']
const PAGE_FORMATS = [
  { name: 'A4', w: 21, h: 29.7 },
  { name: 'Burnaway', w: 19.5, h: 24 },
  { name: 'XL', w: 32, h: 53 },
]
const TRASH = '🗑️ Poubelle'                              // catégorie corbeille (à part, hors thèmes)
const FONT_LIST = [
  { v: "'Dancing Script',cursive", l: 'Dancing Script (manuscrite)' },
  { v: "'Great Vibes',cursive", l: 'Great Vibes (élégante)' },
  { v: "'Satisfy',cursive", l: 'Satisfy (décontractée)' },
  { v: "'Pacifico',cursive", l: 'Pacifico (ronde)' },
  { v: "'Lobster',cursive", l: 'Lobster (épaisse)' },
  { v: "'Playfair Display',serif", l: 'Playfair (chic)' },
  { v: "'Montserrat',sans-serif", l: 'Montserrat (moderne)' },
  { v: 'Georgia,serif', l: 'Georgia (classique)' },
  { v: "'Bebas Neue',sans-serif", l: 'Bebas Neue (titre)' },
  { v: "'Anton',sans-serif", l: 'Anton (gras)' },
  { v: "'Caveat',cursive", l: 'Caveat (stylo)' },
  { v: "'Amiri',serif", l: 'عربي — Amiri (classique)' },
  { v: "'Aref Ruqaa',serif", l: 'عربي — Aref Ruqaa (calligraphie)' },
  { v: "'Reem Kufi',sans-serif", l: 'عربي — Reem Kufi (moderne)' },
  { v: "'Cairo',sans-serif", l: 'عربي — Cairo (net)' },
  { v: "'Tajawal',sans-serif", l: 'عربي — Tajawal (simple)' },
  { v: "'Scheherazade New',serif", l: 'عربي — Scheherazade (livre)' },
]

function shapeCss(f) {
  if (f === 'rond') return { borderRadius: '50%' }
  if (f === 'arrondi') return { borderRadius: '16%' }
  if (f === 'losange') return { clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }
  if (f === 'hexagone') return { clipPath: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)' }
  if (f === 'coeur') return { clipPath: 'url(#psHeart)' }
  return {}
}
const fitNow = it => (it.fit || 'contain')   // 'contain' = jamais déformé (garde les proportions) ; 'fill' seulement si choisi explicitement
const maskSize = it => { const f = fitNow(it); return f === 'fill' ? '100% 100%' : f }
const cropInset = it => ((it.ct || it.cr || it.cb || it.cl) ? `inset(${it.ct || 0}% ${it.cr || 0}% ${it.cb || 0}% ${it.cl || 0}%)` : 'none')

// découpe le contexte canvas selon la forme (boîte w×h centrée à l'origine). Sert à aplatir une composition.
const HEART_D = 'M50,97 C50,97,3,62,3,32 C3,14,18,3,34,3 C43,3,50,10,50,18 C50,10,57,3,66,3 C82,3,97,14,97,32 C97,62,50,97,50,97 Z'
function clipForme(ctx, forme, w, h) {
  if (!forme || forme === 'none') return
  const X = px => -w / 2 + px / 100 * w, Y = py => -h / 2 + py / 100 * h
  ctx.beginPath()
  if (forme === 'rond') { ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.clip(); return }
  if (forme === 'carre') { ctx.rect(-w / 2, -h / 2, w, h); ctx.clip(); return }
  if (forme === 'arrondi') { const r = Math.min(w, h) * 0.16; const x = -w / 2, y = -h / 2; ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.clip(); return }
  if (forme === 'losange') { ctx.moveTo(X(50), Y(0)); ctx.lineTo(X(100), Y(50)); ctx.lineTo(X(50), Y(100)); ctx.lineTo(X(0), Y(50)); ctx.closePath(); ctx.clip(); return }
  if (forme === 'hexagone') {[[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]].forEach(([a, b], i) => i ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b))); ctx.closePath(); ctx.clip(); return }
  if (forme === 'coeur') { const m = new DOMMatrix().translateSelf(-w / 2, -h / 2).scaleSelf(w / 100, h / 100); const p = new Path2D(); p.addPath(new Path2D(HEART_D), m); ctx.clip(p) }
}

// Path2D de la forme (boîte w×h centrée à l'origine). Rectangle pour « none ».
function formePath2D(forme, w, h) {
  const p = new Path2D()
  const X = px => -w / 2 + px / 100 * w, Y = py => -h / 2 + py / 100 * h
  const f = (!forme || forme === 'none') ? 'carre' : forme
  if (f === 'rond') p.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
  else if (f === 'arrondi') { const r = Math.min(w, h) * 0.16, x = -w / 2, y = -h / 2; p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r) }
  else if (f === 'losange') { p.moveTo(X(50), Y(0)); p.lineTo(X(100), Y(50)); p.lineTo(X(50), Y(100)); p.lineTo(X(0), Y(50)); p.closePath() }
  else if (f === 'hexagone') {[[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]].forEach(([a, b], i) => i ? p.lineTo(X(a), Y(b)) : p.moveTo(X(a), Y(b))); p.closePath() }
  else if (f === 'coeur') { const m = new DOMMatrix().translateSelf(-w / 2, -h / 2).scaleSelf(w / 100, h / 100); p.addPath(new Path2D(HEART_D), m) }
  else p.rect(-w / 2, -h / 2, w, h)
  return p
}
// Contour INTÉRIEUR : on clippe la forme et on trace un trait double → seule la moitié interne reste.
function strokeForme(ctx, forme, w, h, color, lw) {
  if (!lw || lw <= 0) return
  const p = formePath2D(forme, w, h)
  ctx.save(); ctx.clip(p)
  ctx.lineWidth = lw * 2; ctx.strokeStyle = color; ctx.lineJoin = 'round'
  ctx.stroke(p)
  ctx.restore()
}

function Outline({ forme }) {
  if (!forme || forme === 'none') return null
  const s = { stroke: '#cfc7ba', fill: 'none', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }
  let shape = null
  if (forme === 'rond') shape = <ellipse cx="50" cy="50" rx="49.5" ry="49.5" {...s} />
  else if (forme === 'carre') shape = <rect x="0.5" y="0.5" width="99" height="99" {...s} />
  else if (forme === 'arrondi') shape = <rect x="0.5" y="0.5" width="99" height="99" rx="16" ry="16" {...s} />
  else if (forme === 'losange') shape = <polygon points="50,0.5 99.5,50 50,99.5 0.5,50" {...s} />
  else if (forme === 'hexagone') shape = <polygon points="25,0.5 75,0.5 99.5,50 75,99.5 25,99.5 0.5,50" {...s} />
  else if (forme === 'coeur') shape = <path d="M50,97 C50,97,3,62,3,32 C3,14,18,3,34,3 C43,3,50,10,50,18 C50,10,57,3,66,3 C82,3,97,14,97,32 C97,62,50,97,50,97 Z" {...s} />
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{shape}</svg>
}

// recherche tolérante : sans accents, sans casse, fautes de frappe acceptées
const deburr = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}
function matchText(query, text) {
  const q = deburr(query).trim(); if (!q) return true
  const t = deburr(text), toks = t.split(/[^a-z0-9]+/).filter(Boolean)
  return q.split(/\s+/).every(w => t.includes(w) || toks.some(tok => lev(tok, w) <= (w.length <= 4 ? 1 : 2)))
}

// Sauvegarde locale de la composition (garde le travail si on sort par erreur).
const PS_LS = 'ps_composition'
function loadComp() {
  try { const r = localStorage.getItem(PS_LS); if (r) { const d = JSON.parse(r); if (Array.isArray(d.placed)) return d } } catch { /* */ }
  return null
}

export default function PhotoshopView({ user, onNavigate }) {
  const [placed, setPlaced] = useState(() => loadComp()?.placed || [])
  const [selUids, setSelUids] = useState([])
  // Onglets = TAILLES. Chaque onglet a son format + sa pile de pages (continuité en longueur).
  const [tabs, setTabs] = useState(() => { const c = loadComp(); if (c?.tabs) return c.tabs; const fmt = (c?.pageFmts && c.pageFmts[0]) || c?.pageFmt || PAGE_FORMATS[0]; return [{ fmt, npages: c?.npages || 1 }] })
  const [prop, setProp] = useState(true)
  const [activeTab, setActiveTab] = useState(0)   // onglet (= taille) ouvert
  const safeTab = Math.min(activeTab, tabs.length - 1)
  const curTab = tabs[safeTab] || { fmt: PAGE_FORMATS[0], npages: 1 }
  const CMW = curTab.fmt.w, CMH = curTab.fmt.h
  const npages = Math.max(curTab.npages || 1, ...(placed.length ? placed.filter(it => (it.tab || 0) === safeTab).map(it => (it.page || 0) + 1) : [1]))
  // helpers onglets/pages
  const updateTab = (patch) => setTabs(arr => arr.map((t, i) => i === safeTab ? { ...t, ...patch } : t))
  const setTabFmt = (f) => updateTab({ fmt: f })
  const addPageToTab = () => updateTab({ npages: npages + 1 })
  const addTab = () => { setTabs(arr => [...arr, { fmt: PAGE_FORMATS[0], npages: 1 }]); setActiveTab(tabs.length); setSelUids([]) }
  const deleteTab = (t) => {
    if (tabs.length <= 1) { if (placed.some(it => (it.tab || 0) === t) && !confirm('Vider cette taille (enlever tout) ?')) return; setPlaced(list => list.filter(it => (it.tab || 0) !== t)); updateTab({ npages: 1 }); return }
    if (!confirm('Supprimer cette taille et tout son contenu ?')) return
    setPlaced(list => list.filter(it => (it.tab || 0) !== t).map(it => ((it.tab || 0) > t ? { ...it, tab: it.tab - 1 } : it)))
    setTabs(arr => arr.filter((_, i) => i !== t))
    setActiveTab(a => (a > t ? a - 1 : Math.min(a, tabs.length - 2)))
    setSelUids([])
  }
  const [customFonts, setCustomFonts] = useState([])   // polices ajoutées (fichiers)
  const [arKb, setArKb] = useState(false)              // clavier arabe à l'écran
  const [marq, setMarq] = useState(null)               // rectangle de sélection à la souris (lasso)
  const fontInput = useRef(null), txtRef = useRef(null)
  // bibliothèque (tout chargé une fois, filtré côté client → recherche tolérante)
  const [theme, setTheme] = useState(null)
  const [search, setSearch] = useState('')
  const [allPhotos, setAllPhotos] = useState([])
  const [libLoading, setLibLoading] = useState(true)
  const [busy, setBusy] = useState('')
  // dialogue d'ajout d'une photo (nom + destination)
  const [queue, setQueue] = useState([])
  const [qName, setQName] = useState('')
  const [qTheme, setQTheme] = useState('__temp__')
  const [qNewTheme, setQNewTheme] = useState('')
  const lastTheme = useRef('__temp__')
  const [cleanMode, setCleanMode] = useState(false)   // nettoyage : 1 clic = supprimer
  const [bulk, setBulk] = useState(null)              // import en lot : { files, theme, newTheme }
  const [regionSrc, setRegionSrc] = useState(null)    // éditeur de zone (recolorer/effacer)
  const [regionUid, setRegionUid] = useState(null)
  const [removeBgSrc, setRemoveBgSrc] = useState(null)
  const [removeBgUid, setRemoveBgUid] = useState(null)
  const [showDummy, setShowDummy] = useState(false)   // générateur de dummies
  // photo de référence : les gâteaux du jour (comme Charge CD) qu'on garde « en face » en travaillant
  const [refDate, setRefDate] = useState(null)        // jour affiché (ISO) ; null = section repliée
  const [refConfirmed, setRefConfirmed] = useState(null)  // gâteaux confirmés (rapide, Supabase)
  const [refDevis, setRefDevis] = useState(null)          // devis (lent, Odoo) — ajoutés après
  const [refTitle, setRefTitle] = useState('')        // n° de la commande choisie (titre vignette)
  const [refPhotos, setRefPhotos] = useState([])      // [{ dataUrl, name }] de la vignette affichée
  const [refIdx, setRefIdx] = useState(0)             // photo affichée si plusieurs
  const [refPos, setRefPos] = useState({ x: 360, y: 90 })  // position de la vignette flottante
  const [refScale, setRefScale] = useState(1)              // zoom dans la photo
  const [refPan, setRefPan] = useState({ x: 0, y: 0 })     // déplacement dans la photo zoomée
  const refDrag = useRef(null)

  const uid = useRef(1), grpSeq = useRef(0)
  const sizeSave = useRef({ timer: null, pending: {} })   // sauvegarde (débounce) de la taille par photo
  const libEdits = useRef([])   // pile : pour annuler une retouche dans la vignette (Ctrl+Z)
  const cloudSync = useRef({ timer: null, last: {} })   // sauvegarde cloud auto (débounce) : last[libId] = dernière image déjà enregistrée
  const elMap = useRef(new Map())        // uid -> DOM element (pour drag fluide)
  const pageMap = useRef(new Map())      // page index -> DOM element
  const drag = useRef(null)
  const fileInput = useRef(null)
  const folderInput = useRef(null)
  const bulkInput = useRef(null)
  const psdInput = useRef(null)
  const psdFolderInput = useRef(null)

  const sel = selUids.length === 1 ? placed.find(p => p.uid === selUids[0]) : null
  const isSel = u => selUids.some(x => x === u)

  // ---------- photo de référence : les gâteaux du jour (comme Charge CD) ----------
  useEffect(() => {
    if (!refDate) return
    let off = false
    setRefConfirmed(null); setRefDevis(null)
    loadCdDay(refDate, 'confirmed').then(d => { if (!off) setRefConfirmed(d || {}) }).catch(() => { if (!off) setRefConfirmed({}) })
    loadCdDay(refDate, 'devis').then(d => { if (!off) setRefDevis(d || {}) }).catch(() => { if (!off) setRefDevis({}) })
    return () => { off = true }
  }, [refDate])
  const refCakes = useMemo(() => {
    if (refConfirmed === null) return null
    const all = []
    for (const h in refConfirmed) all.push(...refConfirmed[h])
    for (const h in (refDevis || {})) all.push(...refDevis[h])
    return psGroupCakes(all)
  }, [refConfirmed, refDevis])
  const shiftRefDay = n => { const d = new Date(refDate + 'T12:00:00'); d.setDate(d.getDate() + n); setRefDate(psToISO(d)) }
  const showCake = c => {
    if (!c.photo) return
    setRefTitle(c.orderRef || ''); setRefPhotos([{ dataUrl: c.photo, name: c.orderRef }])
    setRefIdx(0); setRefScale(1); setRefPan({ x: 0, y: 0 })
  }
  const refZoom = d => setRefScale(s => { const n = Math.min(5, Math.max(1, +(s + d).toFixed(1))); if (n === 1) setRefPan({ x: 0, y: 0 }); return n })
  const refGoto = next => { setRefIdx(i => next(i)); setRefScale(1); setRefPan({ x: 0, y: 0 }) }
  const onRefImgDown = e => {
    if (refScale <= 1) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY, px: refPan.x, py: refPan.y }
    const move = ev => setRefPan({ x: start.px + (ev.clientX - start.x), y: start.py + (ev.clientY - start.y) })
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up)
  }
  const onRefDragStart = e => {
    e.preventDefault()
    refDrag.current = { dx: e.clientX - refPos.x, dy: e.clientY - refPos.y }
    const move = ev => { if (refDrag.current) setRefPos({ x: ev.clientX - refDrag.current.dx, y: ev.clientY - refDrag.current.dy }) }
    const up = () => { refDrag.current = null; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up)
  }

  // ---------- bibliothèque : tout chargé une fois, filtré côté client ----------
  const loadAll = useCallback(async () => { setLibLoading(true); setAllPhotos(await listPhotos({ limit: 5000 })); setLibLoading(false) }, [])
  // Pose un dummy généré DIRECTEMENT sur la planche, à sa vraie taille (cm) — pas dans la bibliothèque.
  const placeDummy = (src, wCm, hCm, nom) => {
    const w = Math.max(0.5, Math.round(wCm * 10) / 10)
    const h = Math.max(0.5, Math.round(hCm * 10) / 10)
    setPlaced(list => {
      const s = freeSpot(list, w, h)
      const it = { uid: uid.current++, type: 'photo', src, nom: nom || 'Dummy', libId: null, forme: 'none', fit: 'contain', w, h, rot: 0, zoom: 100, ratio: w / h, x: s.x, y: s.y, page: s.page, tab: s.tab, tint: '#ff5aa0', tintA: 0, ct: 0, cr: 0, cb: 0, cl: 0 }
      setSelUids([it.uid]); return [...list, it]
    })
    setShowDummy(false)
  }
  const allPhotosRef = useRef(allPhotos); allPhotosRef.current = allPhotos
  useEffect(() => { loadAll() }, [loadAll])
  // au démarrage : purge des « Temporaire » de +7 jours, et chargement des polices ajoutées
  useEffect(() => { (async () => {
    try { const n = await purgeOldTemp(7); const t = await purgeOldTrash(30); if (n || t) loadAll() } catch (e) { /* ignore */ }
    try {
      const fonts = await listFonts()
      for (const f of fonts) { try { const ff = new FontFace(f.name, `url(${f.url})`); await ff.load(); document.fonts.add(ff) } catch (e) { /* ignore */ } }
      setCustomFonts(fonts)
    } catch (e) { /* ignore */ }
  })() }, [])   // eslint-disable-line
  useEffect(() => { for (const r of [folderInput, psdFolderInput]) { const el = r.current; if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', ''); el.setAttribute('mozdirectory', '') } } }, [])
  const themes = useMemo(() => {   // hors Poubelle (à part)
    const c = {}; allPhotos.forEach(p => { const t = p.theme || '_divers'; if (t === TRASH) return; c[t] = (c[t] || 0) + 1 })
    return Object.entries(c).map(([theme, n]) => ({ theme, n })).sort((a, b) => a.theme.localeCompare(b.theme))
  }, [allPhotos])
  const trashCount = useMemo(() => allPhotos.filter(p => p.theme === TRASH).length, [allPhotos])
  const photos = useMemo(() => {
    let r = theme === TRASH ? allPhotos.filter(p => p.theme === TRASH) : allPhotos.filter(p => p.theme !== TRASH)
    if (theme && theme !== TRASH) r = r.filter(p => p.theme === theme)
    if (search.trim()) {
      const q = deburr(search.trim()).split(/\s+/)[0]                              // 1er mot cherché, sans accents
      const pos = nom => { const i = deburr(nom || '').indexOf(q); return i < 0 ? 9999 : i }   // début=0 → en tête
      r = r.filter(p => matchText(search, (p.nom || '') + ' ' + (p.theme || '')))
           .sort((a, b) => pos(a.nom) - pos(b.nom))                                // mot au début d'abord, puis milieu/fin
    }
    return r.slice(0, 500)
  }, [allPhotos, theme, search])

  // ---------- placement sans déplacer les autres ----------
  const collides = (list, t, p, x, y, w, h) => list.some(it => (it.tab || 0) === t && it.page === p && x < it.x + it.w && x + w > it.x && y < it.y + it.h && y + h > it.y)
  const freeSpot = (list, w, h) => {
    for (let p = 0; p < npages; p++) for (let y = MARG; y + h <= CMH - MARG + 0.01; y += 0.5) for (let x = MARG; x + w <= CMW - MARG + 0.01; x += 0.5)
      if (!collides(list, safeTab, p, x, y, w, h)) return { page: p, tab: safeTab, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
    updateTab({ npages: npages + 1 })
    return { page: npages, tab: safeTab, x: MARG, y: MARG }
  }

  const addPhoto = (src, nom, libPhoto) => {
    const img = new Image()
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight || 1
      const w = libPhoto?.last_w || 5                                  // largeur mémorisée pour CETTE photo
      const h = Math.max(0.5, Math.round(w / ratio * 10) / 10)         // hauteur TOUJOURS calée sur les proportions de l'image (jamais de bords vides)
      if (libPhoto?.id) cloudSync.current.last[libPhoto.id] = src      // image d'origine : ne pas la ré-enregistrer tant qu'elle n'est pas retouchée
      setPlaced(list => {
        const s = freeSpot(list, w, h)
        const it = { uid: uid.current++, type: 'photo', src, nom: nom || 'photo', libId: libPhoto?.id || null, forme: 'none', fit: 'contain', w, h, rot: 0, zoom: 100, ratio, x: s.x, y: s.y, page: s.page, tab: s.tab, tint: '#ff5aa0', tintA: 0, ct: 0, cr: 0, cb: 0, cl: 0 }
        setSelUids([it.uid]); return [...list, it]
      })
    }
    img.src = src
  }
  const addText = () => setPlaced(list => {
    const s = freeSpot(list, 6, 1.5)
    const it = { uid: uid.current++, type: 'text', txt: 'Joyeux\nanniversaire', color: '#7a1f3d', size: 1.5, rot: 0, w: 6, h: 1.5, x: s.x, y: s.y, page: s.page, tab: s.tab, font: "'Dancing Script',cursive" }
    setSelUids([it.uid]); return [...list, it]
  })
  const addShape = () => setPlaced(list => {
    const s = freeSpot(list, 5, 5)
    const it = { uid: uid.current++, type: 'shape', forme: 'rond', color: '#fce8ef', w: 5, h: 5, ratio: 1, rot: 0, x: s.x, y: s.y, page: s.page, tab: s.tab }
    setSelUids([it.uid]); return [...list, it]
  })

  // ---------- impression (vraies pages A4) ----------
  const printPages = () => {
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const shapeStr = f => f === 'rond' ? 'border-radius:50%' : f === 'arrondi' ? 'border-radius:16%'
      : f === 'losange' ? 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)'
      : f === 'hexagone' ? 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'
      : f === 'coeur' ? 'clip-path:url(#psHeart)' : ''
    const pagesHtml = tabs.map((t, ti) => {
      const tNp = Math.max(t.npages || 1, ...(placed.filter(it => (it.tab || 0) === ti).map(it => (it.page || 0) + 1).concat([1])))
      return Array.from({ length: tNp }).map((_, p) => {
      const items = placed.filter(it => (it.tab || 0) === ti && it.page === p).map(it => {
        const pos = `position:absolute;left:${it.x}cm;top:${it.y}cm;transform:rotate(${it.rot || 0}deg) scaleX(${it.flipH ? -1 : 1}) scaleY(${it.flipV ? -1 : 1});`
        if (it.type === 'text') return `<div style="${pos}font-size:${it.size}cm;line-height:1.1;color:${it.color};font-weight:700;white-space:pre;text-align:center;unicode-bidi:plaintext;font-family:${it.font || "'Dancing Script',cursive"}">${esc(it.txt)}</div>`
        const box = `${pos}width:${it.w}cm;height:${it.h}cm;overflow:hidden;${shapeStr(it.forme)}${it.bd ? `box-shadow:inset 0 0 0 ${it.bd}cm ${it.bdColor || '#000'};` : ''}`
        if (it.type === 'shape') return `<div style="${box};background:${it.color}"></div>`
        const fit = it.fit || 'contain'
        const ms = fit === 'fill' ? '100% 100%' : fit
        const crop = (it.ct || it.cr || it.cb || it.cl) ? `clip-path:inset(${it.ct || 0}% ${it.cr || 0}% ${it.cb || 0}% ${it.cl || 0}%);` : ''
        const tint = it.tintA > 0 ? `<div style="position:absolute;inset:0;background:${it.tint};opacity:${it.tintA / 100};mix-blend-mode:multiply;-webkit-mask:url('${it.src}') center/${ms} no-repeat;mask:url('${it.src}') center/${ms} no-repeat;${crop}"></div>` : ''
        return `<div style="${box}"><img src="${it.src}" style="width:100%;height:100%;object-fit:${fit};transform:scale(${(it.zoom || 100) / 100});${crop}">${tint}</div>`
      }).join('')
      return `<div class="page" style="width:${t.fmt.w}cm;height:${t.fmt.h}cm">${items}</div>`
      }).join('')
    }).join('')
    const heart = '<svg width="0" height="0"><defs><clipPath id="psHeart" clipPathUnits="objectBoundingBox"><path d="M0.5,0.97 C0.5,0.97,0.03,0.62,0.03,0.32 C0.03,0.14,0.18,0.03,0.34,0.03 C0.43,0.03,0.5,0.1,0.5,0.18 C0.5,0.1,0.57,0.03,0.66,0.03 C0.82,0.03,0.97,0.14,0.97,0.32 C0.97,0.62,0.5,0.97,0.5,0.97 Z"/></clipPath></defs></svg>'
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Pacifico&family=Lobster&family=Playfair+Display:wght@700&family=Montserrat:wght@800&family=Satisfy&display=swap" rel="stylesheet">
<style>@page{size:auto;margin:0}*{box-sizing:border-box}body{margin:0}.page{position:relative;overflow:hidden;page-break-after:always}</style>
</head><body>${heart}${pagesHtml}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert("Autorise les fenêtres pop-up pour imprimer."); return }
    w.document.write(html); w.document.close()
  }

  // rangement auto (étagères)
  const arrange = () => {
    let ux = MARG, uy = MARG, rowH = 0, pg = 0; const UW = CMW - 2 * MARG, GAP = 0.4
    const out = placed.map(it => {
      if ((it.tab || 0) !== safeTab) return it
      if (ux + it.w > MARG + UW + 0.001) { ux = MARG; uy += rowH + GAP; rowH = 0 }
      if (uy + it.h > CMH - MARG + 0.001) { pg++; ux = MARG; uy = MARG; rowH = 0 }
      const n = { ...it, page: pg, x: ux, y: uy }; ux += it.w + GAP; rowH = Math.max(rowH, it.h); return n
    })
    setPlaced(out); updateTab({ npages: Math.max(1, pg + 1) })
  }

  // ---------- sélection / groupes ----------
  const groupMembers = (list, u) => { const it = list.find(x => x.uid === u); return (it && it.grp != null) ? list.filter(x => x.grp === it.grp).map(x => x.uid) : [u] }
  const select = (u, additive) => setSelUids(prev => {
    if (additive) { const i = prev.indexOf(u); return i >= 0 ? prev.filter(x => x !== u) : [...prev, u] }
    return groupMembers(placed, u)
  })
  const groupSel = () => { if (selUids.length < 2) return; const gid = ++grpSeq.current; setPlaced(p => p.map(it => isSel(it.uid) ? { ...it, grp: gid } : it)) }
  const ungroupSel = () => setPlaced(p => p.map(it => isSel(it.uid) ? { ...it, grp: null } : it))

  // ---------- édition ----------
  const patch = (u, obj) => setPlaced(p => p.map(it => it.uid === u ? { ...it, ...obj } : it))
  const setForme = v => { if (!sel) return; patch(sel.uid, v !== 'none' ? { forme: v, h: sel.w, fit: 'contain' } : { forme: v }) }
  // mémorise (débounce) la dernière taille utilisée pour CETTE photo (base + cache local)
  const rememberSize = (libId, w, h) => {
    if (!libId) return
    setAllPhotos(p => p.map(x => x.id === libId ? { ...x, last_w: w, last_h: h } : x))
    sizeSave.current.pending[libId] = { w, h }
    clearTimeout(sizeSave.current.timer)
    sizeSave.current.timer = setTimeout(() => {
      const pend = sizeSave.current.pending; sizeSave.current.pending = {}
      Object.entries(pend).forEach(([id, s]) => setPhotoSize(id, s.w, s.h).catch(() => {}))
    }, 700)
  }
  // met à jour la vignette (LOCAL → fiable, instantané, annulable). Garde l'ancienne pour Ctrl+Z.
  const persistEdit = (libId, dataURL) => {
    if (!libId || !String(dataURL || '').startsWith('data:')) return
    const ph = allPhotos.find(x => x.id === libId)
    if (ph) { libEdits.current.push({ libId, prevUrl: ph.url }); if (libEdits.current.length > 30) libEdits.current.shift() }
    setAllPhotos(p => p.map(x => x.id === libId ? { ...x, url: dataURL } : x))
  }
  const setDim = (k, v) => {
    if (!sel) return; v = Math.max(0.5, parseFloat(v) || 1)
    let nw, nh
    if (k === 'w') { nw = v; nh = prop ? Math.max(0.5, Math.round(v / sel.ratio * 10) / 10) : sel.h; patch(sel.uid, { w: nw, ...(prop ? { h: nh } : {}) }) }
    else { nh = v; nw = prop ? Math.max(0.5, Math.round(v * sel.ratio * 10) / 10) : sel.w; patch(sel.uid, { h: nh, ...(prop ? { w: nw } : {}) }) }
    if (sel.type === 'photo') rememberSize(sel.libId, nw, nh)
  }
  const setTextSize = v => { if (!sel) return; const s = Math.max(0.3, parseFloat(v) || 1); patch(sel.uid, { size: s, h: s }) }
  const setPct = v => {
    if (!sel) return; const p = parseInt(v) || 100; const b = baseRef.current
    if (sel.type === 'text') patch(sel.uid, { size: Math.max(0.3, Math.round(b.size * p / 100 * 10) / 10), h: Math.max(0.3, Math.round(b.size * p / 100 * 10) / 10) })
    else { const nw = Math.max(0.5, Math.round(b.w * p / 100 * 10) / 10), nh = Math.max(0.5, Math.round(b.h * p / 100 * 10) / 10); patch(sel.uid, { w: nw, h: nh }); if (sel.type === 'photo') rememberSize(sel.libId, nw, nh) }
  }
  const baseRef = useRef({ w: 5, h: 5, size: 1.5 })   // taille de référence pour le %
  const [pctSlider, setPctSlider] = useState(100)
  useEffect(() => { if (sel) { baseRef.current = { w: sel.w, h: sel.h, size: sel.size }; setPctSlider(100) } }, [selUids]) // eslint-disable-line
  const rot = d => { if (!sel) return; patch(sel.uid, { rot: ((((sel.rot || 0) + d) % 360) + 360) % 360 }) }
  const resetCrop = () => { if (!sel) return; patch(sel.uid, { ct: 0, cr: 0, cb: 0, cl: 0 }) }

  const toFront = () => setPlaced(p => { const mv = p.filter(x => isSel(x.uid)); return [...p.filter(x => !isSel(x.uid)), ...mv] })
  const toBack = () => setPlaced(p => { const mv = p.filter(x => isSel(x.uid)); return [...mv, ...p.filter(x => !isSel(x.uid))] })
  const dupSel = () => setPlaced(list => {
    const idx = {}; list.forEach((x, i) => { idx[x.uid] = i })
    const members = selUids.map(u => list.find(x => x.uid === u)).filter(Boolean).sort((a, b) => idx[a.uid] - idx[b.uid])
    if (!members.length) return list
    const minx = Math.min(...members.map(m => m.x)), miny = Math.min(...members.map(m => m.y))
    const maxx = Math.max(...members.map(m => m.x + m.w)), maxy = Math.max(...members.map(m => m.y + m.h))
    const s = freeSpot(list, maxx - minx, maxy - miny); const gid = members.length > 1 ? ++grpSeq.current : null
    const copies = members.map(m => ({ ...m, uid: uid.current++, page: s.page, tab: s.tab, x: Math.round((s.x + (m.x - minx)) * 10) / 10, y: Math.round((s.y + (m.y - miny)) * 10) / 10, grp: gid }))
    setSelUids(copies.map(c => c.uid)); return [...list, ...copies]
  })
  const delSel = useCallback(() => { setPlaced(p => p.filter(x => !selUids.includes(x.uid))); setSelUids([]) }, [selUids])

  // aplatit la sélection (composition) en UNE image et l'enregistre dans la bibliothèque
  const saveGroup = async () => {
    const items = placed.filter(p => selUids.includes(p.uid))   // dans l'ordre des calques
    if (items.length < 2) { alert('Sélectionne au moins 2 éléments à enregistrer ensemble.'); return }
    const bx = Math.min(...items.map(i => i.x)), by = Math.min(...items.map(i => i.y))
    const bw = Math.max(...items.map(i => i.x + i.w)) - bx, bh = Math.max(...items.map(i => i.y + i.h)) - by
    const nom = prompt('Nom de la composition :', 'Composition')
    if (nom == null) return
    setBusy('Création de l’image…')
    try {
      const SC = 60
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bw * SC)); cv.height = Math.max(1, Math.round(bh * SC))
      const ctx = cv.getContext('2d')
      for (const it of items) {
        const cx = (it.x + it.w / 2 - bx) * SC, cy = (it.y + it.h / 2 - by) * SC
        const wp = it.w * SC, hp = it.h * SC
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((it.rot || 0) * Math.PI / 180); ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1)
        if (it.type === 'text') {
          ctx.fillStyle = it.color || '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          const fp = (it.size || 1) * SC; ctx.font = `700 ${fp}px ${it.font || "'Dancing Script',cursive"}`
          const lines = String(it.txt || '').split('\n'); const lh = fp * 1.1
          lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * lh))
        } else if (it.type === 'shape') {
          clipForme(ctx, it.forme, wp, hp); ctx.fillStyle = it.color || '#eee'; ctx.fillRect(-wp / 2, -hp / 2, wp, hp)
        } else {
          const img = await loadImg(it.src)
          clipForme(ctx, it.forme, wp, hp)
          const ratio = img.naturalWidth / img.naturalHeight || 1
          let dw = wp, dh = hp
          if ((it.fit || 'contain') !== 'fill') { if (wp / hp > ratio) { dh = hp; dw = hp * ratio } else { dw = wp; dh = wp / ratio } }
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
        }
        if (it.bd > 0 && it.type !== 'text') strokeForme(ctx, it.forme, wp, hp, it.bdColor || '#000', it.bd * SC)
        ctx.restore()
      }
      const r = trimToContent(cv)
      const blob = await (await fetch(r.dataURL)).blob()
      const saved = await uploadPhoto(blob, { theme: 'Mes compositions', nom: nom.trim() || 'Composition', createdBy: user?.id })
      setAllPhotos(p => [saved, ...p])
      alert('Composition enregistrée dans « Mes compositions » ✅')
    } catch (e) { alert('Impossible d’enregistrer : ' + (e.message || e)) } finally { setBusy('') }
  }

  // ajouter une police perso (fichier .ttf/.otf/.woff) → enregistrée + utilisable tout de suite
  const onAddFont = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy('Ajout de la police…')
    try {
      const nf = await uploadFont(f)
      try { const ff = new FontFace(nf.name, `url(${nf.url})`); await ff.load(); document.fonts.add(ff) } catch (e2) { /* */ }
      setCustomFonts(p => p.some(x => x.name === nf.name) ? p : [...p, nf])
      if (sel && sel.type === 'text') patch(sel.uid, { font: `'${nf.name}'` })
      alert('Police « ' + nf.name + ' » ajoutée ✅')
    } catch (e3) { alert('Police non ajoutée : ' + (e3.message || e3)) } finally { setBusy('') }
  }
  // clavier arabe : insère une lettre dans le texte à la position du curseur
  const insertAr = (ch) => {
    if (!sel || sel.type !== 'text') return
    const ta = txtRef.current, s = sel.txt || ''
    const a = ta ? ta.selectionStart : s.length, b = ta ? ta.selectionEnd : s.length
    const nv = s.slice(0, a) + ch + s.slice(b)
    patch(sel.uid, { txt: nv })
    setTimeout(() => { if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = a + ch.length } }, 0)
  }

  // remplit la/les page(s) avec N copies identiques de l'élément sélectionné (grille auto)
  const fillCopies = () => {
    if (!sel) return
    const n = parseInt(prompt(`Combien de copies de « ${sel.nom || 'cet élément'} » ?`, '12'))
    if (!n || n < 1) return
    const src = sel, GAP = 0.3
    const cols = Math.max(1, Math.floor((CMW - 2 * MARG + GAP) / (src.w + GAP)))
    const rowsPer = Math.max(1, Math.floor((CMH - 2 * MARG + GAP) / (src.h + GAP)))
    const perPage = cols * rowsPer
    const copies = []
    for (let i = 0; i < n; i++) {
      const page = Math.floor(i / perPage), idx = i % perPage, r = Math.floor(idx / cols), c = idx % cols
      copies.push({ ...src, uid: uid.current++, grp: null, page, tab: safeTab, x: Math.round((MARG + c * (src.w + GAP)) * 10) / 10, y: Math.round((MARG + r * (src.h + GAP)) * 10) / 10 })
    }
    setPlaced(list => [...list.filter(x => x.uid !== src.uid), ...copies])   // remplace l'original par la grille
    setSelUids([])
  }
  // lasso : démarre un rectangle de sélection sur la zone vide d'une page
  const onPageDown = (e, p) => {
    if (e.target !== e.currentTarget) return   // clic sur un élément → pas de lasso
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width * CMW, y = (e.clientY - rect.top) / rect.height * CMH
    drag.current = { marquee: true, page: p, rect, x0: x, y0: y, x1: x, y1: y }
    setMarq({ page: p, x0: x, y0: y, x1: x, y1: y }); setSelUids([])
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* */ }
  }
  const clearPage = (p) => { setPlaced(list => list.filter(it => !((it.tab || 0) === safeTab && it.page === p))); setSelUids([]) }
  const clearAll = () => { if (!placed.length) return; if (!confirm('Vider toutes les pages ? (les images restent dans la bibliothèque)')) return; setPlaced([]); setSelUids([]); setTabs([{ fmt: PAGE_FORMATS[0], npages: 1 }]); setActiveTab(0) }
  // cale le cadre de la photo sélectionnée sur ses proportions (enlève les bords vides)
  const fitFrame = () => { if (!sel || sel.type !== 'photo' || sel.forme !== 'none') return; const nh = Math.max(0.5, Math.round(sel.w / sel.ratio * 10) / 10); patch(sel.uid, { h: nh }); rememberSize(sel.libId, sel.w, nh) }
  const openRegion = () => { if (sel && sel.type === 'photo') { setRegionUid(sel.uid); setRegionSrc(sel.src) } }

  // ---------- baguette magique : enlève le fond uni (flood-fill depuis les coins) ----------
  const removeBg = () => { if (sel && sel.type === 'photo') { setRemoveBgUid(sel.uid); setRemoveBgSrc(sel.src) } }   // ouvre le dialogue (tolérance + aperçu)
  // rogne en pixels (insets) + resserre le cadre au contenu
  const bakeCrop = async () => {
    if (!sel || sel.type !== 'photo' || !(sel.ct || sel.cr || sel.cb || sel.cl)) return
    setBusy('Rognage…')
    try {
      const img = await loadImg(sel.src)
      const W = img.naturalWidth, H = img.naturalHeight
      const sx = Math.round(W * (sel.cl || 0) / 100), sy = Math.round(H * (sel.ct || 0) / 100)
      const sw = Math.max(1, Math.round(W * (100 - (sel.cl || 0) - (sel.cr || 0)) / 100)), sh = Math.max(1, Math.round(H * (100 - (sel.ct || 0) - (sel.cb || 0)) / 100))
      const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh
      cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      const r = trimToContent(cv)
      const nh = Math.max(0.5, Math.round(sel.w / (r.w / r.h) * 10) / 10)
      patch(sel.uid, { src: r.dataURL, ratio: r.w / r.h, h: nh, ct: 0, cr: 0, cb: 0, cl: 0 })
      rememberSize(sel.libId, sel.w, nh); persistEdit(sel.libId, r.dataURL)
    } catch (e) { alert('Rognage impossible (image externe protégée).') } finally { setBusy('') }
  }

  // ---------- glisser-déposer (DOM direct -> fluide) ----------
  const onItemPointerDown = (ev, it) => {
    if (ev.shiftKey) { select(it.uid, true); ev.preventDefault(); return }
    const targetSel = isSel(it.uid) ? selUids : groupMembers(placed, it.uid)
    if (!isSel(it.uid)) setSelUids(targetSel)
    const pageEl = pageMap.current.get(it.page)
    const set = targetSel.map(u => { const p = placed.find(x => x.uid === u); return p ? { uid: u, el: elMap.current.get(u), x0: p.x, y0: p.y } : null }).filter(Boolean)
    drag.current = { pageEl, startPage: it.page, sx: ev.clientX, sy: ev.clientY, set, cur: {} }
    try { ev.target.setPointerCapture(ev.pointerId) } catch (e) { /* ignore */ }
    ev.preventDefault()
  }
  const onRotDown = (ev, it) => {
    ev.stopPropagation(); ev.preventDefault()
    const pageEl = pageMap.current.get(it.page); if (!pageEl) return
    const r = pageEl.getBoundingClientRect()
    const cx = r.left + (it.x + it.w / 2) / CMW * r.width, cy = r.top + (it.y + it.h / 2) / CMH * r.height
    drag.current = { rot: true, uid: it.uid, el: elMap.current.get(it.uid), cx, cy, flipH: it.flipH, flipV: it.flipV }
    try { ev.target.setPointerCapture(ev.pointerId) } catch (e) { /* */ }
  }
  const onResizeDown = (ev, it, sx, sy) => {   // coin : redimensionne LIBRE (ancré au coin opposé) ; Shift = proportionnel
    ev.stopPropagation(); ev.preventDefault()
    const pageEl = pageMap.current.get(it.page); if (!pageEl) return
    const r = pageEl.getBoundingClientRect()
    const rot = (it.rot || 0) * Math.PI / 180, cos = Math.cos(rot), sin = Math.sin(rot)
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2
    const ax = cx - sx * (it.w / 2) * cos + sy * (it.h / 2) * sin   // coin opposé (fixe)
    const ay = cy - sx * (it.w / 2) * sin - sy * (it.h / 2) * cos
    drag.current = { resize: true, uid: it.uid, libId: it.libId, isPhoto: it.type === 'photo', el: elMap.current.get(it.uid), isText: it.type === 'text', sx, sy, cos, sin, ax, ay, rl: r.left, rt: r.top, rw: r.width, rh: r.height, w0: it.w, h0: it.h, size0: it.size, fit0: it.fit, cur: null }
    try { ev.target.setPointerCapture(ev.pointerId) } catch (e) { /* */ }
  }
  useEffect(() => {
    const move = ev => {
      const dr = drag.current; if (!dr) return
      if (dr.marquee) { dr.x1 = (ev.clientX - dr.rect.left) / dr.rect.width * CMW; dr.y1 = (ev.clientY - dr.rect.top) / dr.rect.height * CMH; setMarq(m => m ? { ...m, x1: dr.x1, y1: dr.y1 } : m); return }
      if (dr.rot) { const ang = Math.round(Math.atan2(ev.clientY - dr.cy, ev.clientX - dr.cx) * 180 / Math.PI + 90); dr.curRot = ((ang % 360) + 360) % 360; if (dr.el) dr.el.style.transform = `rotate(${dr.curRot}deg) scaleX(${dr.flipH ? -1 : 1}) scaleY(${dr.flipV ? -1 : 1})`; return }
      if (dr.resize) {
        const Px = (ev.clientX - dr.rl) / dr.rw * CMW, Py = (ev.clientY - dr.rt) / dr.rh * CMH
        const ex = Px - dr.ax, ey = Py - dr.ay
        const du = ex * dr.cos + ey * dr.sin, dv = -ex * dr.sin + ey * dr.cos
        let nw = Math.max(0.5, dr.sx * du), nh = Math.max(0.5, dr.sy * dv)
        if (dr.isText || ev.shiftKey) { const s = Math.max(nw / dr.w0, nh / dr.h0); nw = Math.max(0.5, dr.w0 * s); nh = Math.max(0.5, dr.h0 * s) }
        nw = Math.round(nw * 10) / 10; nh = Math.round(nh * 10) / 10
        const ncx = dr.ax + dr.sx * (nw / 2) * dr.cos - dr.sy * (nh / 2) * dr.sin
        const ncy = dr.ay + dr.sx * (nw / 2) * dr.sin + dr.sy * (nh / 2) * dr.cos
        const nx = Math.round((ncx - nw / 2) * 10) / 10, ny = Math.round((ncy - nh / 2) * 10) / 10
        dr.cur = { x: nx, y: ny, w: nw, h: nh }
        if (dr.isText) { dr.cur.size = Math.max(0.3, Math.round(dr.size0 * (nw / dr.w0) * 10) / 10); dr.cur.h = dr.cur.size }
        // Étirement libre (sans Shift) d'une photo = déformation : l'image suit le cadre (object-fit fill)
        if (dr.isPhoto) dr.cur.fit = ev.shiftKey ? dr.fit0 : 'fill'
        if (dr.el) { dr.el.style.left = (nx / CMW * 100) + '%'; dr.el.style.top = (ny / CMH * 100) + '%'; if (dr.isText) dr.el.style.fontSize = (dr.cur.size / CMW * PW) + 'px'; else { dr.el.style.width = (nw / CMW * 100) + '%'; dr.el.style.height = (nh / CMH * 100) + '%'; if (dr.isPhoto) { const img = dr.el.querySelector('img'); if (img) img.style.objectFit = dr.cur.fit } } }
        return
      }
      if (!dr.pageEl) return
      const r0 = dr.pageEl.getBoundingClientRect()
      // page survolée : permet de glisser une photo vers une autre page (2e, 3e…)
      let tp = dr.startPage, trect = r0
      for (const [pi, el] of pageMap.current) { const rr = el.getBoundingClientRect(); if (ev.clientY >= rr.top && ev.clientY <= rr.bottom) { tp = pi; trect = rr; break } }
      const dxcm = (ev.clientX - dr.sx) / r0.width * CMW, dycm = (ev.clientY - dr.sy) / r0.height * CMH
      dr.set.forEach(d => {
        const p = placed.find(x => x.uid === d.uid); if (!p) return
        // position cible dans la page survolée (coordonnées écran → cm de la page cible)
        const screenTop = r0.top + d.y0 / CMH * r0.height + (ev.clientY - dr.sy)
        const tx = Math.max(-(p.w - 1), Math.min(CMW - 1, Math.round((d.x0 + dxcm) * 10) / 10))
        const ty = Math.max(-(p.h - 1), Math.min(CMH - 1, Math.round((screenTop - trect.top) / trect.height * CMH * 10) / 10))
        dr.cur[d.uid] = { x: tx, y: ty, page: tp }
        // aperçu live (sur la page d'origine, autorisé à dépasser ~1 cm pour rattraper)
        if (d.el) {
          const lx = Math.max(-(p.w - 1), Math.min(CMW - 1, Math.round((d.x0 + dxcm) * 10) / 10))
          const ly = Math.max(-(p.h - 1), Math.min(CMH - 1, Math.round((d.y0 + dycm) * 10) / 10))
          d.el.style.left = (lx / CMW * 100) + '%'; d.el.style.top = (ly / CMH * 100) + '%'
        }
      })
    }
    const up = () => { const dr = drag.current
      if (dr && dr.marquee) {
        const minx = Math.min(dr.x0, dr.x1 ?? dr.x0), maxx = Math.max(dr.x0, dr.x1 ?? dr.x0), miny = Math.min(dr.y0, dr.y1 ?? dr.y0), maxy = Math.max(dr.y0, dr.y1 ?? dr.y0)
        if (maxx - minx > 0.3 || maxy - miny > 0.3) {
          const got = placedRef.current.filter(it => it.page === dr.page && it.x < maxx && it.x + it.w > minx && it.y < maxy && it.y + it.h > miny).map(it => it.uid)
          setSelUids(got)
        }
        setMarq(null); drag.current = null; return
      }
      if (dr) { if (dr.rot) { if (dr.curRot != null) setPlaced(p => p.map(it => it.uid === dr.uid ? { ...it, rot: dr.curRot } : it)) } else if (dr.resize) { if (dr.cur) { setPlaced(p => p.map(it => it.uid === dr.uid ? { ...it, ...dr.cur } : it)); if (dr.isPhoto && dr.libId) rememberSize(dr.libId, dr.cur.w, dr.cur.h) } } else if (dr.cur && Object.keys(dr.cur).length) { const cur = dr.cur; setPlaced(p => p.map(it => cur[it.uid] ? { ...it, ...cur[it.uid] } : it)) } } drag.current = null }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }
  }, [placed, tabs, activeTab])

  // touche Effacer + coller (Ctrl+V) + annuler (Ctrl/Cmd+Z)
  useEffect(() => {
    const key = ev => {
      const t = document.activeElement, tg = t && t.tagName
      const inField = tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT'
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) { if (inField) return; ev.preventDefault(); undo(); return }
      // flèches du clavier = bouger l'élément sélectionné (Shift = plus grand pas)
      if (ev.key.indexOf('Arrow') === 0) {
        if (inField || !selUids.length) return
        ev.preventDefault()
        const step = ev.shiftKey ? 1 : 0.1
        const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0
        const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0
        setPlaced(p => p.map(it => selUids.includes(it.uid)
          ? { ...it, x: Math.round((it.x + dx) * 100) / 100, y: Math.round((it.y + dy) * 100) / 100 }
          : it))
        return
      }
      if (ev.key !== 'Backspace' && ev.key !== 'Delete') return
      if (inField) return
      if (selUids.length) { ev.preventDefault(); delSel() }
    }
    const paste = ev => {
      const items = ev.clipboardData && ev.clipboardData.items; if (!items) return
      for (const it of items) {
        if (it.type && it.type.indexOf('image') === 0) {
          const blob = it.getAsFile(); if (!blob) continue
          setQueue(q => [...q, { src: URL.createObjectURL(blob), blob, defaultName: 'collée' }])
          ev.preventDefault()
        }
      }
    }
    document.addEventListener('keydown', key); document.addEventListener('paste', paste)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('paste', paste) }
  }, [selUids, delSel]) // eslint-disable-line

  // ---------- annuler (Ctrl/Cmd+Z) : historique des compositions ----------
  const placedRef = useRef(placed); placedRef.current = placed
  const histRef = useRef([]); const undoingRef = useRef(false)
  useEffect(() => {
    if (undoingRef.current) { undoingRef.current = false; return }
    const t = setTimeout(() => {
      const h = histRef.current, snap = JSON.stringify(placed)
      if (h[h.length - 1] !== snap) { h.push(snap); if (h.length > 16) h.shift() }
    }, 350)
    return () => clearTimeout(t)
  }, [placed])
  // sauvegarde cloud AUTOMATIQUE (débounce 1,5 s) : la bibliothèque reflète toujours l'état FINAL de chaque photo.
  // → pas de bouton à oublier ; et comme on enregistre l'état stabilisé, Ctrl+Z reste fiable (l'annulation est ce qui finit enregistré).
  useEffect(() => {
    clearTimeout(cloudSync.current.timer)
    cloudSync.current.timer = setTimeout(async () => {
      const seen = {}
      for (const p of placedRef.current) {
        if (p.type !== 'photo' || !p.libId || seen[p.libId]) continue
        seen[p.libId] = 1
        const cur = p.src
        if (cloudSync.current.last[p.libId] === cur) continue          // déjà à jour
        cloudSync.current.last[p.libId] = cur                          // marque tout de suite (évite double envoi)
        try {
          const blob = await (await fetch(cur)).blob()
          const ph = allPhotosRef.current.find(x => x.id === p.libId)
          const res = await replacePhotoImage(p.libId, blob, ph?.theme)
          setAllPhotos(ap => ap.map(x => x.id === p.libId ? { ...x, path: res.path, url: res.url } : x))
        } catch (e) { cloudSync.current.last[p.libId] = null }          // échec → retentera au prochain changement
      }
    }, 1500)
    return () => clearTimeout(cloudSync.current.timer)
  }, [placed])
  // composition rechargée → recaler le compteur d'uid + éviter une ré-sauvegarde cloud inutile
  useEffect(() => {
    for (const it of placed) {
      if ((it.uid || 0) >= uid.current) uid.current = it.uid + 1
      if (it.type === 'photo' && it.libId) cloudSync.current.last[it.libId] = it.src
    }
  }, []) // eslint-disable-line
  // sauvegarde locale (débounce) : si on sort par erreur, la composition revient ; vidée par « Tout vider »
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (placed.length) localStorage.setItem(PS_LS, JSON.stringify({ placed, tabs, activeTab }))
        else localStorage.removeItem(PS_LS)
      } catch { /* quota (composition lourde) : on n'enregistre pas */ }
    }, 800)
    return () => clearTimeout(t)
  }, [placed, tabs, activeTab])

  const undo = useCallback(() => {
    const h = histRef.current, cur = JSON.stringify(placedRef.current)
    if (h[h.length - 1] !== cur) h.push(cur)   // fige l'état courant si pas encore enregistré
    if (h.length < 2) return
    h.pop()
    const prevStr = h[h.length - 1]
    try {   // annuler une retouche → remettre la vignette (et le cloud) comme avant
      const c = JSON.parse(cur), pr = JSON.parse(prevStr)
      const reverted = pr.some(p => p.libId && (c.find(x => x.uid === p.uid) || {}).src !== p.src)
      if (reverted && libEdits.current.length) {
        const e = libEdits.current.pop()
        setAllPhotos(ap => ap.map(x => x.id === e.libId ? { ...x, url: e.prevUrl } : x))
      }
    } catch (e) { /* ignore */ }
    undoingRef.current = true
    setSelUids([])
    setPlaced(JSON.parse(prevStr))
  }, [])

  // ---------- charger / supprimer ----------
  const importFiles = async (files, useFolderTheme) => {
    if (!files.length) { alert('Aucune image trouvée.'); return }
    let ok = 0, fail = 0, lastErr = ''
    const total = files.length, CC = 5
    setBusy(`Import… 0/${total}`)
    for (let i = 0; i < total; i += CC) {
      await Promise.all(files.slice(i, i + CC).map(async f => {
        const parts = (f.webkitRelativePath || f.name).split('/')
        const th = useFolderTheme && parts.length > 1 ? parts[parts.length - 2] : '_imports'
        try { await uploadPhoto(f, { theme: th, nom: f.name.replace(/\.[^.]+$/, ''), createdBy: user?.id }); ok++ }
        catch (e2) { fail++; lastErr = e2?.message || String(e2) }
      }))
      setBusy(`Import… ${ok + fail}/${total}`)
    }
    setBusy(''); loadAll()
    alert(`Import terminé : ${ok} ajoutée(s)${fail ? `, ${fail} échec(s).\n\nErreur : ${lastErr}` : ' ✅'}`)
  }
  const onPickFiles = e => {
    const files = [...(e.target.files || [])]; e.target.value = ''
    setQueue(q => [...q, ...files.map(f => ({ src: URL.createObjectURL(f), blob: f, defaultName: f.name.replace(/\.[^.]+$/, '') }))])
  }
  // dialogue d'ajout : nommer + choisir la destination, puis poser sur la page + enregistrer en biblio
  useEffect(() => { if (queue[0]) { setQName(queue[0].defaultName || ''); setQTheme(lastTheme.current); setQNewTheme('') } }, [queue])
  const confirmAdd = () => {
    const item = queue[0]; if (!item) return
    const name = (qName || '').trim() || item.defaultName || 'photo'
    let th = qTheme
    if (th === '__new__') th = (qNewTheme || '').trim() || 'Temporaire'
    else if (th === '__temp__') th = 'Temporaire'
    addPhoto(item.src, name)
    uploadPhoto(item.blob, { theme: th, nom: name, createdBy: user?.id }).then(r => setAllPhotos(p => r ? [r, ...p] : p)).catch(e => alert('Enregistrement échoué : ' + (e?.message || e)))
    lastTheme.current = qTheme
    setQueue(q => q.slice(1))
  }
  const skipAdd = () => setQueue(q => q.slice(1))
  // import en lot rapide : 1 seule catégorie pour tout, sans nommer chaque photo
  const onBulkPick = e => {
    const files = [...(e.target.files || [])]; e.target.value = ''
    if (files.length) setBulk({ files, theme: lastTheme.current === '__temp__' ? '' : lastTheme.current, newTheme: '' })
  }
  const onPsdPick = e => {
    const files = [...(e.target.files || [])].filter(f => /\.psd$/i.test(f.name)); e.target.value = ''
    if (files.length) setBulk({ files, theme: '', newTheme: '', psd: true })
  }
  const runBulk = async () => {
    const b = bulk; if (!b) return
    let th = b.theme; if (th === '__new__' || !th) th = (b.newTheme || '').trim() || 'Temporaire'
    setBulk(null)
    if (b.psd) {   // éclater chaque PSD en éléments
      const seen = new Set(); let ok = 0, fail = 0, lastErr = ''; const added = []
      for (let fi = 0; fi < b.files.length; fi++) {
        setBusy(`PSD ${fi + 1}/${b.files.length} : lecture des calques…`)
        let layers = []
        try { layers = await extractPsdLayers(b.files[fi], seen) } catch (e2) { fail++; lastErr = e2?.message || String(e2); continue }
        for (let i = 0; i < layers.length; i++) {
          try { const r = await uploadPhoto(layers[i].blob, { theme: th, nom: layers[i].nom, createdBy: user?.id }); added.push(r); ok++ } catch (e2) { fail++; lastErr = e2?.message || String(e2) }
          if (i % 5 === 0) setBusy(`PSD ${fi + 1}/${b.files.length} : ${ok} éléments ajoutés…`)
        }
      }
      setBusy(''); setAllPhotos(p => [...added, ...p]); lastTheme.current = th
      alert(`PSD terminés : ${ok} élément(s) ajouté(s) dans « ${th} »${fail ? `, ${fail} échec(s).\n${lastErr}` : ' ✅'}`)
      return
    }
    let ok = 0, fail = 0, lastErr = ''; const total = b.files.length, added = []
    setBusy(`Import… 0/${total}`)
    for (let i = 0; i < total; i += 6) {
      await Promise.all(b.files.slice(i, i + 6).map(async f => {
        try { const r = await uploadPhoto(f, { theme: th, nom: f.name.replace(/\.[^.]+$/, ''), createdBy: user?.id }); added.push(r); ok++ }
        catch (e2) { fail++; lastErr = e2?.message || String(e2) }
      }))
      setBusy(`Import… ${ok + fail}/${total}`)
    }
    setBusy(''); setAllPhotos(p => [...added, ...p]); lastTheme.current = th
    alert(`Import terminé : ${ok} ajoutée(s) dans « ${th} »${fail ? `, ${fail} échec(s).\n${lastErr}` : ' ✅'}`)
  }
  const onPickFolder = e => {
    const files = [...(e.target.files || [])].filter(f => /\.(png|jpe?g|webp)$/i.test(f.name) && !/(^|\/)_apercus\//.test(f.webkitRelativePath || ''))
    e.target.value = ''; importFiles(files, true)
  }
  const onDeletePhoto = async (ph, skipConfirm) => {
    if (!skipConfirm && !confirm(`Supprimer « ${ph.nom} » de la bibliothèque ?`)) return
    setAllPhotos(p => { const np = p.filter(x => x.id !== ph.id); if (theme && !np.some(x => x.theme === theme)) setTheme(null); return np })   // catégorie vidée → disparaît + on la quitte
    try { await trashPhoto(ph.id) } catch (e) { alert('Suppression impossible : ' + e.message); loadAll() }   // → corbeille (garde les 5 dernières)
  }
  const onRestorePhoto = async (ph) => {
    try { const t = await restorePhoto(ph.id); setAllPhotos(p => p.map(x => x.id === ph.id ? { ...x, theme: t } : x)) } catch (e) { alert('Restauration impossible : ' + e.message); loadAll() }
  }
  const onRenamePhoto = async (ph) => {
    const nom = prompt('Nouveau nom :', ph.nom || '')
    if (nom == null) return
    setAllPhotos(p => p.map(x => x.id === ph.id ? { ...x, nom: nom.trim() } : x))
    try { await renamePhoto(ph.id, nom) } catch (e) { alert('Renommage impossible : ' + e.message); loadAll() }
  }
  const onDuplicatePhoto = async (ph) => {
    try { const copy = await duplicatePhoto(ph.id); if (copy) setAllPhotos(p => [copy, ...p]) }
    catch (e) { alert('Duplication impossible : ' + e.message) }
  }

  // ---------- rendu d'un élément ----------
  const renderItem = it => {
    const common = {
      key: it.uid, 'data-uid': it.uid,
      ref: el => { if (el) elMap.current.set(it.uid, el); else elMap.current.delete(it.uid) },
      onPointerDown: e => onItemPointerDown(e, it),
      style: { position: 'absolute', left: `${it.x / CMW * 100}%`, top: `${it.y / CMH * 100}%`, cursor: 'move', transform: `rotate(${it.rot || 0}deg) scaleX(${it.flipH ? -1 : 1}) scaleY(${it.flipV ? -1 : 1})` },
      className: isSel(it.uid) ? 'ps-it ps-sel' : 'ps-it',
    }
    if (it.type === 'text') {
      const fs = it.size / CMW * PW
      return <div {...common} style={{ ...common.style, fontSize: fs, lineHeight: 1.1, color: it.color, fontWeight: 700, whiteSpace: 'pre', textAlign: 'center', fontFamily: it.font || "'Dancing Script',cursive", unicodeBidi: 'plaintext', overflow: 'visible' }}>{it.txt}</div>
    }
    const box = { ...common.style, width: `${it.w / CMW * 100}%`, height: `${it.h / CMH * 100}%`, overflow: 'hidden', ...shapeCss(it.forme), ...(it.bd ? { boxShadow: `inset 0 0 0 ${it.bd * PW / CMW}px ${it.bdColor || '#000'}` } : {}) }
    if (it.type === 'shape') return <div {...common} style={{ ...box, background: it.color }}><Outline forme={it.forme} /></div>
    return (
      <div {...common} style={box}>
        <img src={it.src} alt="" draggable={false} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: fitNow(it), transform: `scale(${(it.zoom || 100) / 100})`, clipPath: cropInset(it), pointerEvents: 'none' }} />
        {it.tintA > 0 && <div style={{ position: 'absolute', inset: 0, background: it.tint, opacity: it.tintA / 100, mixBlendMode: 'multiply', WebkitMaskImage: `url("${it.src}")`, maskImage: `url("${it.src}")`, WebkitMaskSize: maskSize(it), maskSize: maskSize(it), WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', clipPath: cropInset(it), pointerEvents: 'none' }} />}
        <Outline forme={it.forme} />
      </div>
    )
  }

  const isShape = sel && sel.type === 'shape', isText = sel && sel.type === 'text', isPhoto = sel && sel.type === 'photo'
  const lab = 'block text-[11px] font-semibold text-ink-soft mb-1'
  const inp = 'w-full border border-line rounded-lg px-2 py-1.5 text-[13px]'
  const btn = 'w-full rounded-lg px-3 py-2 text-[13px] font-semibold mb-2'

  return (
    <div className="h-screen flex flex-col bg-[#e9e2d6]">
      <svg width="0" height="0" style={{ position: 'absolute' }}><defs><clipPath id="psHeart" clipPathUnits="objectBoundingBox"><path d="M0.5,0.97 C0.5,0.97,0.03,0.62,0.03,0.32 C0.03,0.14,0.18,0.03,0.34,0.03 C0.43,0.03,0.5,0.1,0.5,0.18 C0.5,0.1,0.57,0.03,0.66,0.03 C0.82,0.03,0.97,0.14,0.97,0.32 C0.97,0.62,0.5,0.97,0.5,0.97 Z" /></clipPath></defs></svg>
      <style>{`.ps-it.ps-sel{outline:2px solid #993556;outline-offset:1px}`}</style>

      {/* Barre du haut */}
      <header className="bg-bordeaux text-white px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <button onClick={() => onNavigate && onNavigate('calendar')} className="bg-white/20 rounded-lg px-3 py-1.5 text-[13px] font-bold">← Retour</button>
        <h1 className="font-fraunces text-[15px] m-0">🎨 Studio photos</h1>
        <div className="flex-1" />
        {busy && <span className="text-[12px] opacity-90">{busy}</span>}
        <button onClick={addText} className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">✍️ Texte</button>
        <button onClick={addShape} className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">⬤ Forme</button>
        <button onClick={() => setShowDummy(true)} title="Générer une forme de gâteau (dummy) à l'échelle" className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">🎂 Dummy</button>
        <button onClick={arrange} className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">🪄 Ranger</button>
        <button onClick={fitFrame} title="Cale le cadre de la photo sélectionnée sur ses proportions (enlève les bords vides)" className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">📐 Cadre</button>
        <button onClick={openRegion} title="Modifier une zone de la photo sélectionnée (gomme, sélection, copier, couleur)" className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">🖌️ Zone</button>
        <select value={PAGE_FORMATS.some(f => f.name === curTab.fmt.name) ? curTab.fmt.name : '__custom__'} title="Taille de l'onglet actif"
          onChange={e => {
            const v = e.target.value
            if (v === '__custom__') { const w = parseFloat(prompt('Largeur de la page en cm :', curTab.fmt.w)); const h = parseFloat(prompt('Hauteur de la page en cm :', curTab.fmt.h)); if (w > 0 && h > 0) setTabFmt({ name: `Perso ${w}×${h}`, w, h }) }
            else { const f = PAGE_FORMATS.find(x => x.name === v); if (f) setTabFmt(f) }
          }}
          className="bg-white/20 text-white rounded-lg px-2 py-1.5 text-[12px] font-bold">
          {PAGE_FORMATS.map(f => <option key={f.name} value={f.name} className="text-ink">{f.name} ({f.w}×{f.h})</option>)}
          {!PAGE_FORMATS.some(f => f.name === curTab.fmt.name) && <option value={curTab.fmt.name} className="text-ink">{curTab.fmt.name}</option>}
          <option value="__custom__" className="text-ink">✏️ Personnalisé…</option>
        </select>
        <button onClick={addPageToTab} title="Ajouter une page (même taille, à la suite)" className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">＋ Page</button>
        <button onClick={clearAll} title="Vider toutes les pages" className="bg-white/20 rounded-lg px-3 py-1.5 text-[12px] font-bold">🗑️ Tout vider</button>
        <button onClick={printPages} className="bg-white text-bordeaux rounded-lg px-3 py-1.5 text-[12px] font-bold">🖨️ Imprimer</button>
      </header>

      {/* Vignette flottante : la photo de la commande, « en face », déplaçable par-dessus le plan de travail */}
      {refPhotos.length > 0 && (
        <div className="fixed z-[60] bg-white rounded-xl shadow-2xl border border-bordeaux/40 overflow-hidden select-none" style={{ left: refPos.x, top: refPos.y, width: 270 }}>
          <div onPointerDown={onRefDragStart} className="flex items-center gap-1 px-2 py-1.5 bg-bordeaux text-white cursor-move">
            <span className="text-[12px] font-bold flex-1 truncate">📦 {refTitle}</span>
            <button onClick={() => refZoom(-0.5)} title="Dézoomer" className="bg-white/20 rounded w-5 h-5 text-[13px] leading-none">−</button>
            <button onClick={() => refZoom(0.5)} title="Zoomer" className="bg-white/20 rounded w-5 h-5 text-[13px] leading-none">＋</button>
            <button onClick={() => setRefPhotos([])} title="Fermer" className="bg-white/20 rounded w-5 h-5 text-[12px] leading-none">✕</button>
          </div>
          <div className="overflow-hidden bg-[#f3eee6]" style={{ maxHeight: 360 }}>
            <img src={refPhotos[refIdx]?.dataUrl} alt={refPhotos[refIdx]?.name || ''} onPointerDown={onRefImgDown}
              draggable={false} className="block w-full max-h-[360px] object-contain"
              style={{ transform: `translate(${refPan.x}px, ${refPan.y}px) scale(${refScale})`, cursor: refScale > 1 ? 'grab' : 'default' }} />
          </div>
          {refPhotos.length > 1 && (
            <div className="flex items-center justify-center gap-3 py-1 bg-cream text-[12px]">
              <button onClick={() => refGoto(i => (i - 1 + refPhotos.length) % refPhotos.length)} className="px-2 font-bold">◀</button>
              <span>{refIdx + 1} / {refPhotos.length}</span>
              <button onClick={() => refGoto(i => (i + 1) % refPhotos.length)} className="px-2 font-bold">▶</button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Bibliothèque */}
        <aside className="w-[240px] flex-shrink-0 border-r border-line bg-cream p-2.5 overflow-auto">
          {/* Gâteaux du jour (comme Charge CD) : choisis une date, clique un gâteau → vignette déplaçable + zoom */}
          <div className="mb-2 p-1.5 rounded-lg bg-white border border-line">
            <div className="text-[11px] font-bold text-bordeaux mb-1">📦 Gâteaux du jour</div>
            {!refDate ? (
              <button onClick={() => setRefDate(psToISO(new Date()))} className="w-full bg-bordeaux text-white rounded-lg py-1.5 text-[12px] font-bold">📅 Afficher les commandes</button>
            ) : (
              <>
                <div className="flex items-center gap-1 mb-1.5">
                  <button onClick={() => shiftRefDay(-1)} title="Jour précédent" className="bg-cream border border-line rounded-lg w-6 h-7 text-[12px] font-bold">◀</button>
                  <input type="date" value={refDate} onChange={e => e.target.value && setRefDate(e.target.value)} className={inp + ' flex-1 text-[11px]'} />
                  <button onClick={() => shiftRefDay(1)} title="Jour suivant" className="bg-cream border border-line rounded-lg w-6 h-7 text-[12px] font-bold">▶</button>
                  <button onClick={() => { setRefDate(null); setRefConfirmed(null); setRefDevis(null) }} title="Fermer" className="bg-cream border border-line rounded-lg w-6 h-7 text-[12px]">✕</button>
                </div>
                {refCakes === null ? <div className="text-[10px] text-ink-mute">Chargement…</div>
                  : refCakes.length === 0 ? <div className="text-[10px] text-ink-mute">Aucun gâteau ce jour.</div>
                  : (
                    <div className="grid grid-cols-3 gap-1">
                      {refCakes.map((c, i) => (
                        <button key={i} onClick={() => showCake(c)} disabled={!c.photo} title={`${c.orderRef || ''}${c.pers ? ' · ' + c.pers + ' pers' : ''}`}
                          className="relative text-center disabled:opacity-50 hover:opacity-80">
                          {c.photo
                            ? <img src={c.photo} alt="" className={'w-full h-14 object-cover rounded-md border-2 ' + (c.isDevis ? 'border-amber-400' : 'border-red-500')} />
                            : <div className={'w-full h-14 rounded-md border-2 bg-cream flex items-center justify-center text-[18px] ' + (c.isDevis ? 'border-amber-400' : 'border-red-500')}>🎂</div>}
                          {c.count > 1 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-bordeaux text-white text-[9px] font-bold flex items-center justify-center">×{c.count}</span>}
                          <div className="text-[9px] text-ink-soft leading-tight">{c.pers ? c.pers + 'p' : '—'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                {refConfirmed !== null && refDevis === null && <div className="text-[10px] text-amber-600 mt-1">⏳ devis…</div>}
              </>
            )}
          </div>
          <div className="flex gap-1.5 mb-2">
            <button onClick={() => fileInput.current?.click()} className="flex-1 bg-bordeaux text-white rounded-lg py-1.5 text-[12px] font-bold">＋ Charger</button>
            <button onClick={() => psdInput.current?.click()} title="Importer des PSD (éclate les calques)" className="bg-white border border-bordeaux text-bordeaux rounded-lg py-1.5 px-2 text-[12px] font-bold">🧩 PSD</button>
            <button onClick={() => setTheme(theme === TRASH ? null : TRASH)} title={`Poubelle (${trashCount})`} className={'rounded-lg py-1.5 px-2 text-[12px] border ' + (theme === TRASH ? 'bg-ink text-white border-ink' : 'bg-white border-line')} style={theme === TRASH ? { background: '#1a0f0a', color: '#fff' } : {}}>🗑️</button>
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
          <input ref={folderInput} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={onPickFolder} />
          <input ref={bulkInput} type="file" accept="image/*" multiple className="hidden" onChange={onBulkPick} />
          <input ref={psdInput} type="file" accept=".psd" multiple className="hidden" onChange={onPsdPick} />
          <input ref={psdFolderInput} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={onPsdPick} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (nom ou catégorie)…" className={inp + ' mb-2'} />
          <select value={theme === TRASH ? '' : (theme || '')} onChange={e => setTheme(e.target.value || null)} className={inp + ' mb-1'}>
            <option value="">Tous les thèmes ({themes.reduce((a, t) => a + t.n, 0)})</option>
            {themes.map(t => <option key={t.theme} value={t.theme}>{t.theme} ({t.n})</option>)}
          </select>
          <button onClick={() => setCleanMode(v => !v)} className={'w-full rounded-lg py-1.5 text-[12px] font-bold mb-2 ' + (cleanMode ? 'bg-red-600 text-white' : 'bg-white border border-line')}>
            {cleanMode ? '✓ Terminer le nettoyage' : '🧹 Nettoyer (1 clic = supprimer)'}
          </button>
          {libLoading ? <p className="text-[12px] text-ink-mute">Chargement…</p> : (
            <div className="grid grid-cols-2 gap-1.5">
              {photos.map(ph => (
                <div key={ph.id} className={'relative bg-white border rounded-lg p-1 cursor-pointer group ' + (cleanMode ? 'border-red-200 hover:border-red-500 hover:bg-red-50' : 'border-line hover:border-bordeaux')} onClick={() => cleanMode ? onDeletePhoto(ph, true) : addPhoto(ph.url, ph.nom, ph)} title={cleanMode ? 'Cliquer pour supprimer' : ph.nom}>
                  <img src={ph.url} alt={ph.nom} loading="lazy" crossOrigin="anonymous" className="w-full h-16 object-contain" />
                  <div className="text-[9px] text-ink-soft h-6 overflow-hidden leading-tight mt-0.5">{ph.nom}</div>
                  {theme === TRASH
                    ? <button onClick={e => { e.stopPropagation(); onRestorePhoto(ph) }} title="Remettre à sa place" className="absolute top-0.5 right-0.5 bg-white/90 border border-line rounded px-1 h-5 text-[10px] opacity-0 group-hover:opacity-100">↩️</button>
                    : cleanMode
                      ? <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-red-500/10 rounded-lg text-[18px]">🗑️</div>
                      : <>
                        <button onClick={e => { e.stopPropagation(); onRenamePhoto(ph) }} title="Renommer" className="absolute top-0.5 left-0.5 bg-white/90 border border-line rounded w-5 h-5 text-[11px] opacity-0 group-hover:opacity-100">✏️</button>
                        <button onClick={e => { e.stopPropagation(); onDuplicatePhoto(ph) }} title="Dupliquer" className="absolute bottom-0.5 right-0.5 bg-white/90 border border-line rounded w-5 h-5 text-[11px] opacity-0 group-hover:opacity-100">📋</button>
                        <button onClick={e => { e.stopPropagation(); onDeletePhoto(ph) }} title="Supprimer" className="absolute top-0.5 right-0.5 bg-white/90 border border-line rounded w-5 h-5 text-[11px] opacity-0 group-hover:opacity-100">🗑️</button>
                      </>}
                </div>
              ))}
              {!photos.length && <p className="col-span-2 text-[12px] text-ink-mute">Aucune image. Charge, colle (Ctrl+V) ou importe un dossier.</p>}
            </div>
          )}
        </aside>

        {/* Onglets = TAILLES ; dans chaque onglet, les pages s'empilent (continuité) */}
        <main className="flex-1 flex flex-col min-h-0">
          <div className="flex items-end gap-1 px-3 pt-2 bg-[#dcd2c4] border-b border-line overflow-x-auto flex-shrink-0">
            {tabs.map((t, ti) => (
              <div key={ti} onClick={() => { setActiveTab(ti); setSelUids([]) }}
                title={`${t.fmt.name} · ${t.fmt.w}×${t.fmt.h} cm`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-[12px] font-semibold cursor-pointer whitespace-nowrap border border-b-0 ${ti === safeTab ? 'bg-white text-ink border-line' : 'bg-[#cfc4b4] text-[#6b5e50] border-transparent hover:bg-[#e7ddcf]'}`}>
                📐 {t.fmt.name}
                <span onClick={e => { e.stopPropagation(); deleteTab(ti) }} title="Supprimer cette taille" className="w-4 h-4 rounded-full flex items-center justify-center text-[#a08e7c] hover:text-red-600 hover:bg-black/10">×</span>
              </div>
            ))}
            <button onClick={addTab} title="Ajouter une taille (nouvel onglet)" className="px-3 py-1.5 rounded-t-lg text-[12px] font-bold text-bordeaux border border-dashed border-[#b3a692] mb-px">＋ Taille</button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex flex-col items-center gap-4" onPointerDown={e => { if (e.target === e.currentTarget) setSelUids([]) }}>
            {Array.from({ length: npages }).map((_, p) => (
              <div key={p} ref={el => { if (el) pageMap.current.set(p, el); else pageMap.current.delete(p) }}
                data-page={p} onPointerDown={e => onPageDown(e, p)} className="relative bg-white border border-[#bbb] shadow-md flex-shrink-0"
                style={{ width: PW, height: PW * CMH / CMW }}>
                {placed.some(it => (it.tab || 0) === safeTab && it.page === p) && <button onClick={() => clearPage(p)} title="Vider cette page" className="absolute top-1 right-1 z-[8] bg-white/90 border border-line rounded px-1.5 py-0.5 text-[11px] hover:bg-red-50 hover:border-red-300">🗑️ Vider</button>}
                {marq && marq.page === p && <div style={{ position: 'absolute', left: `${Math.min(marq.x0, marq.x1) / CMW * 100}%`, top: `${Math.min(marq.y0, marq.y1) / CMH * 100}%`, width: `${Math.abs(marq.x1 - marq.x0) / CMW * 100}%`, height: `${Math.abs(marq.y1 - marq.y0) / CMH * 100}%`, border: '1.5px dashed #993556', background: 'rgba(153,53,86,0.08)', pointerEvents: 'none', zIndex: 7 }} />}
                {placed.filter(it => (it.tab || 0) === safeTab && it.page === p).map(renderItem)}
                {selUids.length === 1 && (() => { const it = placed.find(x => x.uid === selUids[0]); if (!it || (it.tab || 0) !== safeTab || it.page !== p) return null; const pageHpx = PW * CMH / CMW, halfH = (it.h / 2) / CMH * pageHpx; return (
                  <>
                    <div onPointerDown={e => onRotDown(e, it)} title="Tourner (attrape et fais pivoter)"
                      style={{ position: 'absolute', left: `${(it.x + it.w / 2) / CMW * 100}%`, top: `${(it.y + it.h / 2) / CMH * 100}%`, transform: `translate(-50%,-50%) rotate(${it.rot || 0}deg) translateY(${-(halfH + 20)}px)`, width: 16, height: 16, borderRadius: '50%', background: '#fff', border: '2px solid #993556', cursor: 'grab', zIndex: 6, touchAction: 'none' }} />
                    {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
                      <div key={i} onPointerDown={e => onResizeDown(e, it, sx, sy)} title="Étirer (Shift = garder les proportions)"
                        style={{ position: 'absolute', left: `${(it.x + it.w / 2) / CMW * 100}%`, top: `${(it.y + it.h / 2) / CMH * 100}%`, transform: `translate(-50%,-50%) rotate(${it.rot || 0}deg) translate(${sx * (it.w / 2) / CMW * PW}px, ${sy * (it.h / 2) / CMH * pageHpx}px)`, width: 22, height: 22, cursor: 'nwse-resize', zIndex: 6, touchAction: 'none' }} />
                    ))}
                  </>
                ) })()}
              </div>
            ))}
          </div>
        </main>

        {/* Panneau de réglages */}
        <aside className="w-[280px] flex-shrink-0 border-l border-line bg-cream-warm p-3 overflow-auto">
          {selUids.length === 0 && <p className="text-[12px] text-ink-soft">Clique une image à gauche pour l'ajouter.<br /><br />Puis glisse-la pour la placer, ou règle-la ici.<br /><br /><b>Maj+clic</b> = sélectionner plusieurs.<br /><b>Ctrl+V</b> = coller une photo.</p>}

          {selUids.length > 1 && (
            <div>
              <div className="text-[13px] font-bold mb-1">{selUids.length} éléments sélectionnés</div>
              <p className="text-[12px] text-ink-soft mb-3">Maj+clic pour ajouter/enlever. Puis groupe-les pour les déplacer/dupliquer ensemble.</p>
              <button onClick={groupSel} className={btn + ' bg-bordeaux text-white'}>🔗 Grouper</button>
              <button onClick={ungroupSel} className={btn + ' bg-white border border-line'}>⛓️‍💥 Dégrouper</button>
              <button onClick={dupSel} className={btn + ' bg-bordeaux text-white'}>✦ Dupliquer (ensemble)</button>
              <button onClick={saveGroup} className={btn + ' bg-white border border-bordeaux text-bordeaux'}>💾 Enregistrer comme image (biblio)</button>
              <button onClick={delSel} className={btn + ' bg-red-50 text-red-700 border border-red-200'}>🗑️ Retirer la sélection</button>
            </div>
          )}

          {sel && (
            <div>

              <label className={lab}>Taille (%) : {pctSlider}%</label>
              <input type="range" min="10" max="1000" value={pctSlider} onChange={e => { setPctSlider(+e.target.value); setPct(e.target.value) }} className="w-full mb-3" />

              {!isText && <>
                <label className={lab}>Forme</label>
                <select value={sel.forme} onChange={e => setForme(e.target.value)} className={inp + ' mb-2'}>
                  <option value="none">Aucune (photo détourée)</option><option value="rond">Rond / ovale</option><option value="carre">Carré</option><option value="arrondi">Carré arrondi</option><option value="coeur">Cœur</option><option value="losange">Losange</option><option value="hexagone">Hexagone</option>
                </select>
                {isPhoto && sel.forme !== 'none' && <>
                  <label className={lab}>Photo dans la forme</label>
                  <select value={sel.fit} onChange={e => patch(sel.uid, { fit: e.target.value })} className={inp + ' mb-2'}>
                    <option value="cover">Remplir</option><option value="contain">Entière</option><option value="fill">Déformer</option>
                  </select>
                  <label className={lab}>Zoom photo : {sel.zoom || 100}%</label>
                  <input type="range" min="20" max="300" value={sel.zoom || 100} onChange={e => patch(sel.uid, { zoom: +e.target.value })} className="w-full mb-2" />
                </>}
                {isShape && <>
                  <label className={lab}>Couleur de la forme</label>
                  <input type="color" value={sel.color} onChange={e => patch(sel.uid, { color: e.target.value })} className="w-11 h-8 border border-line rounded-md mb-2 bg-white p-0.5" />
                </>}
                {(isPhoto || isShape) && <>
                  <label className={lab}>Contour (cadre)</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="color" value={sel.bdColor || '#7a1f2b'} onChange={e => patch(sel.uid, { bdColor: e.target.value })} className="w-11 h-8 border border-line rounded-md bg-white p-0.5 flex-shrink-0" />
                    <input type="range" min="0" max="1" step="0.05" value={sel.bd || 0} onChange={e => patch(sel.uid, { bd: parseFloat(e.target.value) })} className="flex-1" />
                    <span className="text-[11px] w-12 text-right text-ink-soft">{Math.round((sel.bd || 0) * 10)} mm</span>
                  </div>
                </>}
                <div className="flex gap-2 items-end mb-2">
                  <div className="flex-1"><label className={lab}>Largeur (cm)</label><input type="number" step="0.5" value={sel.w} onChange={e => setDim('w', e.target.value)} className={inp} /></div>
                  <div className="flex-1"><label className={lab}>Hauteur (cm)</label><input type="number" step="0.5" value={sel.h} onChange={e => setDim('h', e.target.value)} className={inp} /></div>
                  <button onClick={() => setProp(v => !v)} className={`rounded-lg px-2 py-1.5 text-[12px] border border-line ${prop ? 'bg-[#fbeef2]' : 'bg-white'}`}>{prop ? '🔒' : '🔓'}</button>
                </div>
                {isPhoto && <>
                  <label className={lab}>✂️ Rogner les bords (%)</label>
                  <div className="flex gap-1.5 mb-1">
                    <label className="flex-1 text-[10px] text-ink-soft">Haut<input type="range" min="0" max="45" value={sel.ct || 0} onChange={e => patch(sel.uid, { ct: +e.target.value })} className="w-full" /></label>
                    <label className="flex-1 text-[10px] text-ink-soft">Bas<input type="range" min="0" max="45" value={sel.cb || 0} onChange={e => patch(sel.uid, { cb: +e.target.value })} className="w-full" /></label>
                  </div>
                  <div className="flex gap-1.5 mb-1">
                    <label className="flex-1 text-[10px] text-ink-soft">Gauche<input type="range" min="0" max="45" value={sel.cl || 0} onChange={e => patch(sel.uid, { cl: +e.target.value })} className="w-full" /></label>
                    <label className="flex-1 text-[10px] text-ink-soft">Droite<input type="range" min="0" max="45" value={sel.cr || 0} onChange={e => patch(sel.uid, { cr: +e.target.value })} className="w-full" /></label>
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <button onClick={bakeCrop} className={'flex-1 rounded-lg px-2 py-2 text-[12px] font-semibold ' + ((sel.ct || sel.cr || sel.cb || sel.cl) ? 'bg-bordeaux text-white' : 'bg-white border border-line opacity-50')}>✓ Valider le rognage</button>
                    <button onClick={resetCrop} className="bg-white border border-line rounded-lg px-2 py-2 text-[12px]">↺ Annuler</button>
                  </div>
                  <button onClick={removeBg} className={btn + ' bg-white border border-line'}>🪄 Enlever le fond</button>
                </>}
              </>}

              {isText && <>
                <label className={lab}>Texte (Entrée = nouvelle ligne)</label>
                <textarea ref={txtRef} rows="2" value={sel.txt} onChange={e => patch(sel.uid, { txt: e.target.value })} className={inp + ' mb-1 resize-y'} dir="auto" />
                <button onClick={() => setArKb(v => !v)} className={'w-full rounded-lg py-1.5 text-[12px] border mb-2 ' + (arKb ? 'bg-bordeaux text-white border-bordeaux' : 'bg-white border-line')}>⌨️ Clavier arabe</button>
                {arKb && (
                  <div className="mb-2 p-1.5 bg-cream-warm border border-line rounded-lg" dir="rtl">
                    <div className="grid grid-cols-8 gap-1">
                      {AR_KEYS.map(k => <button key={k} onClick={() => insertAr(k)} className="bg-white border border-line rounded py-1 text-[15px] hover:bg-[#fbeef2]">{k}</button>)}
                    </div>
                    <div className="flex gap-1 mt-1" dir="ltr">
                      <button onClick={() => insertAr(' ')} className="flex-1 bg-white border border-line rounded py-1 text-[11px]">␣ espace</button>
                      <button onClick={() => insertAr('\n')} className="bg-white border border-line rounded py-1 px-2 text-[11px]">↵ ligne</button>
                    </div>
                  </div>
                )}
                <label className={lab}>Police</label>
                <select value={sel.font} onChange={e => patch(sel.uid, { font: e.target.value })} className={inp + ' mb-1'}>
                  {FONT_LIST.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                  {customFonts.map(f => <option key={f.name} value={`'${f.name}'`}>⭐ {f.name}</option>)}
                </select>
                <div className="flex gap-1 mb-2">
                  <button onClick={() => fontInput.current?.click()} className="flex-1 bg-white border border-bordeaux text-bordeaux rounded-lg py-1.5 text-[12px] font-bold">➕ Ajouter une police (.ttf)</button>
                  <a href="https://www.1001freefonts.com/cartoon-fonts.php" target="_blank" rel="noreferrer" className="bg-white border border-line rounded-lg py-1.5 px-2 text-[12px] flex items-center" title="Site de polices gratuites — télécharge le .ttf puis « Ajouter une police »">🔗 Lien polices</a>
                </div>
                <input ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={onAddFont} />
                <div className="flex gap-2 items-end mb-2">
                  <div><label className={lab}>Couleur</label><input type="color" value={sel.color} onChange={e => patch(sel.uid, { color: e.target.value })} className="w-11 h-8 border border-line rounded-md bg-white p-0.5" /></div>
                  <div className="flex-1"><label className={lab}>Taille texte (cm)</label><input type="number" step="0.3" value={sel.size} onChange={e => setTextSize(e.target.value)} className={inp} /></div>
                </div>
              </>}

              <label className={lab}>Rotation (°)</label>
              <div className="flex gap-1.5 items-center mb-2">
                <button onClick={() => rot(-90)} className="border border-line rounded-lg px-2 py-1.5">↺</button>
                <input type="number" step="5" value={sel.rot || 0} onChange={e => patch(sel.uid, { rot: parseFloat(e.target.value) || 0 })} className={inp} />
                <button onClick={() => rot(90)} className="border border-line rounded-lg px-2 py-1.5">↻</button>
              </div>
              <div className="flex gap-1.5 mb-2">
                <button onClick={() => patch(sel.uid, { flipH: !sel.flipH })} className={'flex-1 rounded-lg py-2 text-[12px] border ' + (sel.flipH ? 'bg-bordeaux text-white border-bordeaux' : 'bg-white border-line')}>⇄ Miroir H</button>
                <button onClick={() => patch(sel.uid, { flipV: !sel.flipV })} className={'flex-1 rounded-lg py-2 text-[12px] border ' + (sel.flipV ? 'bg-bordeaux text-white border-bordeaux' : 'bg-white border-line')}>⇅ Miroir V</button>
              </div>
              <div className="flex gap-1.5 mb-2">
                <button onClick={toFront} className="flex-1 bg-white border border-line rounded-lg py-2 text-[12px]">⬆️ Devant</button>
                <button onClick={toBack} className="flex-1 bg-white border border-line rounded-lg py-2 text-[12px]">⬇️ Derrière</button>
              </div>
              <button onClick={dupSel} className={btn + ' bg-bordeaux text-white'}>✦ Dupliquer</button>
              <button onClick={fillCopies} className={btn + ' bg-white border border-bordeaux text-bordeaux'}>🖨️ Remplir la page de copies…</button>
              <button onClick={delSel} className={btn + ' bg-red-50 text-red-700 border border-red-200'}>🗑️ Retirer</button>
            </div>
          )}
        </aside>
      </div>

      {queue[0] && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 w-[360px] max-w-full">
            <div className="font-fraunces text-[15px] mb-2">Ajouter une photo{queue.length > 1 ? ` (${queue.length} en attente)` : ''}</div>
            <img src={queue[0].src} alt="" className="w-full h-40 object-contain border border-line rounded-lg mb-3 bg-cream" />
            <label className={lab}>Nom</label>
            <input autoFocus value={qName} onChange={e => setQName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmAdd() }} className={inp + ' mb-2'} placeholder="ex. Logo client" />
            <label className={lab}>Enregistrer dans</label>
            <select value={qTheme} onChange={e => setQTheme(e.target.value)} className={inp + ' mb-2'}>
              <option value="__temp__">🕒 Temporaire</option>
              <option value="__new__">➕ Nouvelle catégorie…</option>
              <optgroup label="Catégories existantes">{themes.map(t => <option key={t.theme} value={t.theme}>{t.theme}</option>)}</optgroup>
            </select>
            {qTheme === '__new__' && <input value={qNewTheme} onChange={e => setQNewTheme(e.target.value)} className={inp + ' mb-2'} placeholder="Nom de la nouvelle catégorie" />}
            <div className="flex gap-2 mt-2">
              <button onClick={confirmAdd} className="flex-1 bg-bordeaux text-white rounded-lg py-2 text-[13px] font-bold">Ajouter</button>
              <button onClick={skipAdd} className="bg-white border border-line rounded-lg py-2 px-3 text-[13px]">Passer</button>
            </div>
          </div>
        </div>
      )}

      {removeBgSrc && <RemoveBgModal src={removeBgSrc} onClose={res => {
        if (res) { const it = placed.find(p => p.uid === removeBgUid); const w = it ? it.w : 5; const nh = Math.max(0.5, Math.round(w / res.ratio * 10) / 10); patch(removeBgUid, { src: res.src, ratio: res.ratio, h: nh }); rememberSize(it?.libId, w, nh); persistEdit(it?.libId, res.src) }
        setRemoveBgSrc(null)
      }} />}

      {regionSrc && <RegionEditor src={regionSrc} onExtract={({ src }) => addPhoto(src, 'Découpe')} onClose={res => {
        if (res) { const it = placed.find(p => p.uid === regionUid); const w = it ? it.w : 5; const nh = Math.max(0.5, Math.round(w / res.ratio * 10) / 10); patch(regionUid, { src: res.src, ratio: res.ratio, h: nh, ct: 0, cr: 0, cb: 0, cl: 0 }); rememberSize(it?.libId, w, nh); persistEdit(it?.libId, res.src) }
        setRegionSrc(null)
      }} />}

      {showDummy && <DummyModal onClose={() => setShowDummy(false)} onPlace={placeDummy} />}

      {bulk && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 w-[360px] max-w-full">
            <div className="font-fraunces text-[15px] mb-1">{bulk.psd ? `🧩 Éclater ${bulk.files.length} PSD` : `📥 Importer ${bulk.files.length} photos`}</div>
            <p className="text-[12px] text-ink-soft mb-2">{bulk.psd ? 'Chaque PSD sera éclaté en éléments (doublons/fonds/planches écartés). Choisis UNE catégorie.' : 'Choisis UNE catégorie pour tout le lot (les noms = noms des fichiers, modifiables ensuite).'}</p>
            <label className={lab}>Catégorie</label>
            <select value={bulk.theme} onChange={e => setBulk({ ...bulk, theme: e.target.value })} className={inp + ' mb-2'}>
              <option value="">🕒 Temporaire</option>
              <option value="__new__">➕ Nouvelle catégorie…</option>
              <optgroup label="Catégories existantes">{themes.map(t => <option key={t.theme} value={t.theme}>{t.theme}</option>)}</optgroup>
            </select>
            {(bulk.theme === '__new__') && <input autoFocus value={bulk.newTheme} onChange={e => setBulk({ ...bulk, newTheme: e.target.value })} className={inp + ' mb-2'} placeholder="Nom de la nouvelle catégorie" />}
            <div className="flex gap-2 mt-2">
              <button onClick={runBulk} className="flex-1 bg-bordeaux text-white rounded-lg py-2 text-[13px] font-bold">{bulk.psd ? 'Éclater les PSD' : 'Importer le lot'}</button>
              <button onClick={() => setBulk(null)} className="bg-white border border-line rounded-lg py-2 px-3 text-[13px]">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {busy && <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"><div className="bg-white rounded-xl px-6 py-4 text-[14px] font-semibold">{busy}</div></div>}
    </div>
  )
}
