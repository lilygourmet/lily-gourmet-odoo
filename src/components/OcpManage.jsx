import { useState, useEffect } from 'react'
import Skeleton from './Skeleton'
import { loadOrderCatalog, loadOrderProduct, searchOrderProducts } from '../lib/commande'
import { loadOcpOverrides, addOcpOverride, removeOcpOverride, setOcpPhoto, removeOcpPhoto } from '../lib/ocp'
import { loadUsers, setUserOcpNotif } from '../lib/users'
import { toast } from '../lib/toast'

// Gestion VISUELLE du lien OCP : même présentation que le lien (catégories + tuiles),
// avec ✕ pour enlever un article et ➕ pour en ajouter dans la catégorie.
const B = '#7a1f3d', LINE = '#e7dccb', SOFT = '#6b5f57'
const FRUITS = ['Fraise', 'Framboise', 'Myrtille', 'Ananas', 'Mangue', 'Pastèque', 'Melon', 'Pêche', 'Abricot', 'Prune', 'Cerise', 'Raisin', 'Figue', 'Pomme', 'Poire', 'Banane']
const SECS = ['Dattes', 'Amandes', 'Noix de pécan', 'Noix de cajou', 'Noix', 'Noisettes', 'Pistache']
const HERBES = ['Menthe (botte)', 'Verveine (botte)', 'Thé (boîte)']
const VERRINES = ['Coupe de fruits', 'Verrine sucrée', 'Verrine salée']

export default function OcpManage() {
  const [catalog, setCatalog] = useState(null)
  const [ov, setOv] = useState([])
  const [active, setActive] = useState('jus')
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [varItem, setVarItem] = useState(null)
  const [photoItem, setPhotoItem] = useState(null)
  const [users, setUsers] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

  const reloadOv = () => loadOcpOverrides().then(setOv).catch(() => {})
  useEffect(() => { loadOrderCatalog().then(setCatalog).catch(() => {}); reloadOv(); loadUsers().then(setUsers).catch(() => {}) }, [])

  // Choisir directement qui reçoit la notif devis OCP (toggle par personne).
  async function toggleOcpNotif(u) {
    if (u.role === 'admin') return   // les admins reçoivent toujours
    const next = !u.perm_notif_ocp
    setUsers(us => us.map(x => x.id === u.id ? { ...x, perm_notif_ocp: next } : x))
    try { await setUserOcpNotif(u.id, next) } catch (e) { toast.error(e?.message || 'Échec'); setUsers(us => us.map(x => x.id === u.id ? { ...x, perm_notif_ocp: !next } : x)) }
  }

  if (!catalog) return <Skeleton rows={5} />

  const C = {}; catalog.forEach(c => { C[c.key] = c })
  const pick = (key, filt) => (C[key]?.items || []).filter(it => !filt || filt(it.name || '')).map(it => ({ tmplId: it.tmplId, name: it.name, img: it.image || '', configurable: it.configurable }))
  const free = arr => arr.map(n => ({ name: n, free: true }))
  // Mêmes catégories que le lien (présentation identique).
  const cats = [
    { key: 'jus', label: 'Jus', items: pick('b', n => /litre/i.test(n)) },
    { key: 'pls', label: 'Plateaux sucrés', items: pick('mi', n => /plateau/i.test(n)) },
    { key: 'vie', label: 'Viennoiseries', items: pick('v', n => /mini|micro/i.test(n)) },
    { key: 'cak', label: 'Cakes', items: [...pick('v', n => /^cake/i.test(n)), ...pick('gs', n => /mini cakes/i.test(n))] },
    { key: 'ver', label: 'Verrines', items: free(VERRINES) },
    { key: 'ent', label: 'Entremets', items: pick('e') },
    { key: 'gs', label: 'Gâteaux secs', items: pick('gs', n => !/mini cakes/i.test(n)) },
    { key: 'sal', label: 'Salé', items: pick('sa', n => /plateau|tacos|vol.?au.?vent|croquette/i.test(n)) },
    { key: 'cho', label: 'Coffrets chocolat', items: pick('saison', n => /chocolat|prestige|coffret|cannage|panier|dor|c[ée]ramique|nougat|sellou|guimauve/i.test(n)) },
    { key: 'fru', label: 'Fruits', items: free(FRUITS) },
    { key: 'sec', label: 'Fruits secs', items: free(SECS) },
    { key: 'her', label: 'Autre', items: free(HERBES) },
  ]
  const imgByTmpl = {}; catalog.forEach(c => (c.items || []).forEach(it => { if (it.tmplId) imgByTmpl[it.tmplId] = it.image || '' }))
  const hidden = new Set(ov.filter(o => o.action === 'hide').map(o => `${o.category}|${o.label}`))
  const photoMap = {}; ov.filter(o => o.action === 'photo').forEach(o => { photoMap[`${o.category}|${o.label}`] = o.image })
  // marque caché + ajoute les articles « add »
  cats.forEach(c => {
    c.items = c.items.map(it => ({ ...it, hidden: hidden.has(`${c.key}|${it.name}`) }))
    ov.filter(o => o.action === 'add' && o.category === c.key).forEach(o => c.items.push({ name: o.label, added: true, ovId: o.id, free: o.is_free, img: imgByTmpl[o.tmpl_id] || '' }))
  })
  const c = cats.find(x => x.key === active) || cats[0]
  const nbOcpNotif = users.filter(u => u.active !== false && (u.role === 'admin' || u.perm_notif_ocp)).length

  async function toggle(it) {
    setBusy(true)
    try {
      if (it.added) { await removeOcpOverride(it.ovId) }
      else if (it.hidden) { const o = ov.find(x => x.action === 'hide' && x.category === c.key && x.label === it.name); if (o) await removeOcpOverride(o.id) }
      else { await addOcpOverride({ action: 'hide', category: c.key, label: it.name }) }
      await reloadOv()
    } catch (e) { toast.error(e?.message || 'Échec (SQL ocp_overrides lancé ?)') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 12 }}>
      <h1 className="font-fraunces text-2xl text-bordeaux mb-1">🍽️ Lien OCP — articles</h1>
      <p className="text-[12px] text-ink-soft mb-3">Tape <b style={{ color: '#b42424' }}>✕</b> pour enlever un article du lien, <b style={{ color: '#1e7e4f' }}>➕</b> pour le remettre. « Ajouter » en bas. <a href="/?client=ocp" target="_blank" className="text-bordeaux underline">Ouvrir le lien</a></p>

      {/* Qui reçoit la notif WhatsApp à chaque nouveau devis OCP (section pliable) */}
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 12, marginBottom: 14 }}>
        <button onClick={() => setNotifOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: B }}>📩 Notif devis OCP — qui reçoit ? <span style={{ fontWeight: 600, color: SOFT }}>({nbOcpNotif})</span></span>
          <span style={{ fontSize: 16, color: SOFT }}>{notifOpen ? '▾' : '▸'}</span>
        </button>
        {notifOpen && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
              {users.filter(u => u.active !== false && (u.full_name || u.username)).map(u => {
                const on = u.role === 'admin' || u.perm_notif_ocp
                return (
                  <button key={u.id} onClick={() => toggleOcpNotif(u)} disabled={u.role === 'admin'}
                    style={{ padding: '6px 11px', borderRadius: 20, border: `1.5px solid ${on ? B : LINE}`, background: on ? '#fbeef2' : '#fff', color: on ? B : SOFT, fontSize: 12.5, fontWeight: 700, cursor: u.role === 'admin' ? 'default' : 'pointer' }}>
                    {on ? '✓ ' : ''}{u.full_name || u.username}{u.role === 'admin' ? ' (admin)' : ''}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: SOFT, marginTop: 8 }}>Les admins reçoivent toujours. Clique un nom pour l'ajouter / l'enlever.</div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
        {cats.map(cc => <button key={cc.key} onClick={() => setActive(cc.key)} style={{ flexShrink: 0, padding: '8px 13px', border: 'none', borderRadius: 30, fontSize: 13, fontWeight: 700, background: cc.key === active ? B : '#e7dcc8', color: cc.key === active ? '#fff' : SOFT }}>{cc.label}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {c.items.map((it, i) => {
          const ph = photoMap[`${c.key}|${it.name}`]; const img = ph || it.img
          return (
          <div key={i} style={{ background: '#fff', border: `1px solid ${it.hidden ? '#eee' : LINE}`, borderRadius: 16, padding: '10px 8px', textAlign: 'center', position: 'relative', opacity: it.hidden ? 0.5 : 1 }}>
            <button onClick={() => toggle(it)} disabled={busy}
              style={{ position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: 14, border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, background: it.hidden ? '#1e7e4f' : '#b42424' }}>
              {it.hidden ? '＋' : '✕'}
            </button>
            {img ? <img src={img} alt="" style={{ width: '100%', height: 88, objectFit: 'contain', borderRadius: 10 }} /> : <div style={{ height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{it.free ? '🍽️' : '🧺'}</div>}
            <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 6, lineHeight: 1.15 }}>{it.name}{it.added && <span style={{ fontSize: 10, color: SOFT }}> (ajouté)</span>}</div>
            {!it.hidden && <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 7 }}>
              <button onClick={() => setPhotoItem(it)} style={{ padding: '5px 10px', borderRadius: 20, border: `1px solid ${B}`, background: ph ? '#fbeef2' : '#fff', color: B, fontSize: 11.5, fontWeight: 700 }}>📷 {ph ? 'Photo ✓' : 'Photo'}</button>
              {it.tmplId && it.configurable && !it.added &&
                <button onClick={() => setVarItem(it)} style={{ padding: '5px 10px', borderRadius: 20, border: `1px solid ${B}`, background: '#fff', color: B, fontSize: 11.5, fontWeight: 700 }}>⚙︎ Variantes</button>}
            </div>}
          </div>
          )
        })}
        <button onClick={() => setAddOpen(true)} style={{ background: '#f3ede1', border: `1.5px dashed ${B}`, borderRadius: 16, padding: 10, color: B, fontWeight: 800, fontSize: 14, minHeight: 120 }}>➕ Ajouter<br />un article</button>
      </div>

      {addOpen && <AddModal cat={c} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reloadOv() }} />}
      {varItem && <VariantModal item={varItem} catKey={c.key} ov={ov} onClose={() => setVarItem(null)} onChanged={reloadOv} />}
      {photoItem && <PhotoModal item={photoItem} catKey={c.key} current={photoMap[`${c.key}|${photoItem.name}`]} onClose={() => setPhotoItem(null)} onChanged={reloadOv} />}
    </div>
  )
}

function AddModal({ cat, onClose, onDone }) {
  const [src, setSrc] = useState('odoo')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sel2, setSel2] = useState(null)   // produit Odoo choisi { tmplId, name, image, configurable }
  const [variants, setVariants] = useState([])
  const [variantId, setVariantId] = useState('')
  const [freeName, setFreeName] = useState('')
  const [freeUnit, setFreeUnit] = useState('')
  const [busy, setBusy] = useState(false)

  // Recherche dans TOUS les produits Odoo (avec petit délai pour ne pas requêter à chaque lettre).
  useEffect(() => {
    if (sel2 || query.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      searchOrderProducts(query.trim()).then(setResults).catch(() => setResults([])).finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(t)
  }, [query, sel2])

  // Variantes du produit choisi (tailles / parfums).
  useEffect(() => {
    setVariants([]); setVariantId('')
    if (!sel2) return
    loadOrderProduct(sel2.tmplId).then(p => { const vs = (p.variants || []).map(v => ({ id: v.id, label: Object.values(v.values || {}).join(' · ') || 'variante' })); setVariants(vs.length > 1 ? vs : []) }).catch(() => {})
  }, [sel2])

  async function save() {
    setBusy(true)
    try {
      if (src === 'libre') {
        if (!freeName.trim()) { toast.error('Nom requis'); setBusy(false); return }
        await addOcpOverride({ action: 'add', category: cat.key, label: freeName.trim(), is_free: true, item_kind: 'free', unit: freeUnit.trim() || null })
      } else {
        if (!sel2) { toast.error('Choisis un produit'); setBusy(false); return }
        const v = variants.find(x => String(x.id) === String(variantId))
        await addOcpOverride({ action: 'add', category: cat.key, label: sel2.name + (v ? ` — ${v.label}` : ''), tmpl_id: sel2.tmplId, variant_id: v ? v.id : null, item_kind: cat.key === 'ent' ? 'size' : 'unit', is_free: false, image: sel2.image || null })
      }
      toast.success('Ajouté ✓'); onDone()
    } catch (e) { toast.error(e?.message || 'Échec (SQL ocp_overrides lancé ?)') }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 18, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 12px', color: B }}>Ajouter dans « {cat.label} »</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setSrc('odoo')} style={tab(src === 'odoo')}>Produit Odoo</button>
          <button onClick={() => setSrc('libre')} style={tab(src === 'libre')}>Article libre</button>
        </div>
        {src === 'odoo' ? (
          sel2 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: `1px solid ${LINE}`, borderRadius: 12, marginBottom: 8 }}>
                {sel2.image ? <img src={sel2.image} alt="" style={{ width: 42, height: 42, objectFit: 'contain' }} /> : <span style={{ fontSize: 26 }}>🧺</span>}
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{sel2.name}</span>
                <button onClick={() => setSel2(null)} style={{ border: 'none', background: 'none', color: B, fontWeight: 700, fontSize: 13 }}>Changer</button>
              </div>
              {variants.length > 0 && <select value={variantId} onChange={e => setVariantId(e.target.value)} style={sel}><option value="">— variante (toutes) —</option>{variants.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>}
            </div>
          ) : (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Chercher un produit Odoo…" autoFocus style={sel} />
              {searching && <div style={{ fontSize: 12, color: SOFT, marginBottom: 6 }}>Recherche…</div>}
              {results.map(p => (
                <button key={p.tmplId} onClick={() => setSel2(p)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: 8, border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff', marginBottom: 6 }}>
                  {p.image ? <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} /> : <span style={{ fontSize: 22 }}>🧺</span>}
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                </button>
              ))}
              {!searching && query.trim().length >= 2 && results.length === 0 && <div style={{ fontSize: 12.5, color: SOFT }}>Aucun produit trouvé.</div>}
            </>
          )
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={freeName} onChange={e => setFreeName(e.target.value)} placeholder="Nom de l'article" style={{ ...sel, flex: 1 }} />
            <input value={freeUnit} onChange={e => setFreeUnit(e.target.value)} placeholder="unité" style={{ ...sel, width: 100 }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 700, color: SOFT }}>Annuler</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#1e7e4f', color: '#fff', fontWeight: 800 }}>{busy ? '…' : 'Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}

// Masquer / réafficher les variantes (tailles, parfums…) d'un produit dans le lien OCP.
function VariantModal({ item, catKey, ov, onClose, onChanged }) {
  const [variants, setVariants] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    loadOrderProduct(item.tmplId).then(p => setVariants((p.variants || []).map(v => ({ id: v.id, label: Object.values(v.values || {}).join(' · ') || 'variante' })))).catch(() => setVariants([]))
  }, [item.tmplId])

  const hiddenRows = ov.filter(o => o.action === 'hide_variant' && String(o.tmpl_id) === String(item.tmplId))
  const hiddenIds = new Set(hiddenRows.map(o => o.variant_id))

  async function toggle(v) {
    setBusy(true)
    try {
      if (hiddenIds.has(v.id)) { const r = hiddenRows.find(o => o.variant_id === v.id); if (r) await removeOcpOverride(r.id) }
      else await addOcpOverride({ action: 'hide_variant', category: catKey, label: v.label, tmpl_id: item.tmplId, variant_id: v.id })
      await onChanged()
    } catch (e) { toast.error(e?.message || 'Échec (SQL ocp_overrides lancé ?)') }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 18, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', color: B }}>Variantes — {item.name}</h3>
        <p style={{ fontSize: 12, color: SOFT, margin: '0 0 12px' }}>Tape <b style={{ color: '#b42424' }}>✕</b> pour masquer une variante dans le lien, <b style={{ color: '#1e7e4f' }}>＋</b> pour la remettre.</p>
        {variants === null ? <div style={{ color: SOFT, fontSize: 13 }}>Chargement…</div>
          : variants.length === 0 ? <div style={{ color: SOFT, fontSize: 13 }}>Ce produit n'a pas de variante.</div>
          : variants.map(v => {
            const hid = hiddenIds.has(v.id)
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 4px', borderBottom: `1px solid ${LINE}`, opacity: hid ? 0.5 : 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{v.label}</span>
                <button onClick={() => toggle(v)} disabled={busy} style={{ width: 30, height: 30, borderRadius: 15, border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, background: hid ? '#1e7e4f' : '#b42424' }}>{hid ? '＋' : '✕'}</button>
              </div>
            )
          })}
        <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: 12, borderRadius: 12, border: 'none', background: B, color: '#fff', fontWeight: 800 }}>Fermer</button>
      </div>
    </div>
  )
}
// Réduit une image (fichier ou collée) à ~400px → data URL léger (évite d'alourdir la base + le lien).
function fileToSmall(file, cb) {
  const rd = new FileReader()
  rd.onload = () => {
    const img = new Image()
    img.onload = () => {
      const max = 400; let w = img.width, h = img.height
      if (w > h && w > max) { h = h * max / w; w = max } else if (h > max) { w = w * max / h; h = max }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      cb(cv.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => cb(null)
    img.src = rd.result
  }
  rd.readAsDataURL(file)
}

// Photo « à la main » : coller (Ctrl+V), choisir un fichier, ou coller un lien d'image.
function PhotoModal({ item, catKey, current, onClose, onChanged }) {
  const [preview, setPreview] = useState(current || '')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  function onPaste(e) {
    const list = e.clipboardData?.items || []
    for (const it of list) {
      if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { fileToSmall(f, d => d && setPreview(d)); e.preventDefault(); return } }
    }
  }
  function onFile(e) { const f = e.target.files?.[0]; if (f) fileToSmall(f, d => d && setPreview(d)) }

  async function save() {
    const image = url.trim() || preview
    if (!image) { toast.error('Colle ou choisis une image'); return }
    setBusy(true)
    try { await setOcpPhoto(catKey, item.name, image); toast.success('Photo enregistrée ✓'); onChanged(); onClose() }
    catch (e) { toast.error(e?.message || 'Échec (colonne image manquante ? relance le SQL)') }
    finally { setBusy(false) }
  }
  async function clear() {
    setBusy(true)
    try { await removeOcpPhoto(catKey, item.name); toast.success('Photo retirée'); onChanged(); onClose() }
    catch (e) { toast.error(e?.message || 'Échec') }
    finally { setBusy(false) }
  }

  const shown = url.trim() || preview
  return (
    <div onClick={onClose} onPaste={onPaste} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} onPaste={onPaste} style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 18, width: '100%', maxWidth: 560 }}>
        <h3 style={{ margin: '0 0 4px', color: B }}>Photo — {item.name}</h3>
        <p style={{ fontSize: 12, color: SOFT, margin: '0 0 12px' }}>Colle une image (Ctrl+V / coller), choisis un fichier, ou colle un lien d'image. Elle s'affichera dans le lien OCP.</p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          {shown
            ? <img src={shown} alt="" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 12, objectFit: 'contain', border: `1px solid ${LINE}` }} />
            : <div style={{ width: 160, height: 130, border: `1.5px dashed ${LINE}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SOFT, fontSize: 13, textAlign: 'center', padding: 10 }}>Colle une image ici<br />(Ctrl+V)</div>}
        </div>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: SOFT }}>Choisir un fichier</span>
          <input type="file" accept="image/*" onChange={onFile} style={{ display: 'block', marginTop: 4, fontSize: 13 }} />
        </label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="…ou coller un lien d'image (https://…)" style={sel} />

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {current && <button onClick={clear} disabled={busy} style={{ padding: 12, borderRadius: 12, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 700, color: '#b42424' }}>Retirer</button>}
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 700, color: SOFT }}>Annuler</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#1e7e4f', color: '#fff', fontWeight: 800 }}>{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

const sel = { width: '100%', padding: 10, border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 14, marginBottom: 8, background: '#fff' }
const tab = on => ({ flex: 1, padding: 9, borderRadius: 10, border: `1px solid ${on ? B : LINE}`, background: on ? '#fbeef2' : '#fff', color: on ? B : SOFT, fontWeight: 700, fontSize: 13 })
