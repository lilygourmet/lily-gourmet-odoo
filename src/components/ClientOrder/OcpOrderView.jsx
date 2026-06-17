import { useState, useEffect } from 'react'
import { loadOrderCatalog, loadOrderProduct, createOcpDevis, loadOrderSizes } from '../../lib/commande'
import { loadOcpOverrides } from '../../lib/ocp'

// ============================================================
// Lien dédié OCP (?client=ocp) — prise de commande tactile rapide.
// Catégories tactiles + recap modifiable → devis brouillon Odoo (client OCP SA), SANS prix affichés.
// Articles hors Odoo (fruits, fruits secs, verrines, herbes, boulettes) → produit « Autre » + description.
// ============================================================

const B = '#7a1f3d', CREAM = '#FBF6EE', LINE = '#e7dccb', SOFT = '#6b5f57', GREEN = '#3f9d6d'
// Fruits : unité par fruit (kg entier / pièce / barquette)
const FRUITS = [
  ['Fraise', 'kg', '🍓'], ['Framboise', 'barquette', '🔴'], ['Myrtille', 'barquette', '🫐'],
  ['Ananas', 'pièce', '🍍'], ['Mangue', 'pièce', '🥭'],
  ['Pastèque', 'kg', '🍉'], ['Melon', 'kg', '🍈'], ['Pêche', 'kg', '🍑'], ['Abricot', 'kg', '🍑'],
  ['Prune', 'kg', '🟣'], ['Cerise', 'kg', '🍒'], ['Raisin', 'kg', '🍇'], ['Figue', 'kg', '🟪'],
  ['Pomme', 'kg', '🍎'], ['Poire', 'kg', '🍐'], ['Banane', 'kg', '🍌'],
]
const SECS = ['Dattes', 'Amandes', 'Noix de pécan', 'Noix de cajou', 'Noix', 'Noisettes', 'Pistache']
const HERBES = ['Menthe (botte)', 'Verveine (botte)', 'Thé (boîte)']
const VERRINES = ['Coupe de fruits', 'Verrine sucrée', 'Verrine salée']
// Ces 3 fruits n'ont pas d'emoji → image par défaut (remplaçable par une photo « à la main »).
const W = f => `https://commons.wikimedia.org/wiki/Special:FilePath/${f}?width=320`
const DEFAULT_IMG = { 'Framboise': W('Raspberries05.jpg'), 'Prune': W('Plums.jpg'), 'Figue': W('Fig.jpg') }
const today = () => new Date().toLocaleDateString('en-CA')

export default function OcpOrderView() {
  const [cats, setCats] = useState(null)
  const [active, setActive] = useState('')
  const [zone, setZone] = useState('Hay Riad')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('09:00')
  const [qty, setQty] = useState({})
  const [autre, setAutre] = useState('')
  const [recap, setRecap] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')
  const [entVar, setEntVar] = useState({})   // tmplId -> [{id,size,label}]
  const [tailleByTmpl, setTailleByTmpl] = useState({})   // tmplId -> "18 · 28" (taille affichée sous le nom)
  const [hiddenVar, setHiddenVar] = useState(() => new Set())   // variant_id masqués (tailles/parfums)

  useEffect(() => {
    loadOrderCatalog().then(async (raw) => {
      const C = {}; (raw || []).forEach(c => { C[c.key] = c })
      const pick = (key, filt) => (C[key]?.items || []).filter(it => !filt || filt(it.name || '')).map(it => ({ tmplId: it.tmplId, name: it.name, img: it.image || '' }))
      let jus = []
      const jusItem = (C.b?.items || []).find(it => /litre/i.test(it.name || ''))
      if (jusItem) {
        try {
          const prod = await loadOrderProduct(jusItem.tmplId)
          const fa = (prod.attributes || []).find(a => /parfum|go[uû]t|type/i.test(a.name))
          if (fa) jus = (prod.variants || []).map(v => ({ tmplId: jusItem.tmplId, variantId: v.id, name: v.values[fa.attrId], variantHint: v.values[fa.attrId], img: jusItem.image || '' })).filter(x => x.name)
        } catch { /* ignore */ }
        if (!jus.length) jus = [{ tmplId: jusItem.tmplId, name: 'Jus (litre)', img: jusItem.image || '' }]
      }
      const built = [
        { key: 'jus', label: 'Jus', kind: 'unit', items: jus },
        { key: 'pls', label: 'Plateaux sucrés', kind: 'unit', items: pick('mi', n => /plateau/i.test(n)) },
        { key: 'vie', label: 'Viennoiseries', kind: 'unit', items: pick('v', n => /mini|micro/i.test(n)) },
        { key: 'cak', label: 'Cakes', kind: 'unit', items: [...pick('v', n => /^cake/i.test(n)), ...pick('gs', n => /mini cakes/i.test(n))] },
        { key: 'ver', label: 'Verrines', kind: 'unit', items: VERRINES.map(n => ({ free: true, name: n, emoji: '🍮' })) },
        { key: 'ent', label: 'Entremets', kind: 'size', items: pick('e') },
        { key: 'gs', label: 'Gâteaux secs', kind: 'unit', items: pick('gs', n => !/mini cakes/i.test(n)) },
        { key: 'sal', label: 'Salé', kind: 'unit', items: pick('sa', n => /plateau|tacos|vol.?au.?vent|croquette/i.test(n)) },
        { key: 'cho', label: 'Coffrets chocolat', kind: 'unit', items: pick('saison', n => /chocolat|prestige|coffret|cannage|panier|dor|c[ée]ramique|nougat|sellou|guimauve/i.test(n)) },
        { key: 'fru', label: 'Fruits', kind: 'free', items: FRUITS.map(([n, u, e]) => ({ free: true, name: n, unit: u, emoji: e, img: DEFAULT_IMG[n] || '' })) },
        { key: 'sec', label: 'Fruits secs', kind: 'free', items: SECS.map(n => ({ free: true, name: n, unit: 'boîte 250 g', emoji: '🥜' })) },
        { key: 'her', label: 'Autre', kind: 'free', note: true, items: HERBES.map(n => ({ free: true, name: n, emoji: '🌿' })) },
      ]
      // Ajouts / retraits gérés depuis l'app (onglet « Lien OCP »).
      try {
        const ov = await loadOcpOverrides()
        const hidden = new Set(ov.filter(o => o.action === 'hide').map(o => `${o.category}|${o.label}`))
        const hidVar = new Set(ov.filter(o => o.action === 'hide_variant').map(o => o.variant_id))
        const imgByTmpl = {}; (raw || []).forEach(cc => (cc.items || []).forEach(it => { if (it.tmplId) imgByTmpl[it.tmplId] = it.image || '' }))
        // masque les articles entiers ET les variantes (parfums de jus…) masquées
        built.forEach(cc => { cc.items = cc.items.filter(it => !hidden.has(`${cc.key}|${it.name}`) && !(it.variantId && hidVar.has(it.variantId))) })
        ov.filter(o => o.action === 'add').forEach(o => {
          const cc = built.find(x => x.key === o.category); if (!cc) return
          cc.items.push(o.is_free ? { free: true, name: o.label, unit: o.unit || '', emoji: '➕' } : { tmplId: o.tmpl_id, variantId: o.variant_id || undefined, name: o.label, variantHint: o.variant_hint || undefined, img: o.image || imgByTmpl[o.tmpl_id] || '' })
        })
        // photos mises à la main depuis l'app (priment sur l'image par défaut)
        const photoMap = {}; ov.filter(o => o.action === 'photo').forEach(o => { photoMap[`${o.category}|${o.label}`] = o.image })
        built.forEach(cc => cc.items.forEach(it => { const p = photoMap[`${cc.key}|${it.name}`]; if (p) it.img = p }))
        // « Choix de la taille » activé sur certains articles → sélectionnable comme les entremets.
        const sizeOn = new Set(ov.filter(o => o.action === 'size_on').map(o => `${o.category}|${o.label}`))
        built.forEach(cc => cc.items.forEach(it => { if (sizeOn.has(`${cc.key}|${it.name}`)) it.sizeSel = true }))
        setHiddenVar(hidVar)
      } catch { /* table absente → catalogue par défaut */ }
      const out = built.filter(c => c.note || c.items.length)
      setCats(out); setActive(out[0]?.key || '')
    }).catch(e => setErr(e?.message || 'Catalogue indisponible'))
  }, [])

  // Préchargement des tailles EN 1 APPEL pour TOUTES les catégories (entremets interactifs
  // + libellé de taille affiché sous chaque autre article).
  useEffect(() => {
    if (!cats) return
    const allTmpl = [...new Set(cats.flatMap(c => c.items.map(it => it.tmplId)).filter(Boolean))]
    if (!allTmpl.length) return
    loadOrderSizes(allTmpl).then(sizes => {
      // Variantes interactives : entremets (X pers) + articles « Choix de la taille » activé (valeur brute).
      const entTmpls = new Set((cats.find(c => c.key === 'ent')?.items || []).map(it => String(it.tmplId)).filter(Boolean))
      const selTmpls = new Set(cats.flatMap(c => c.items).filter(it => it.sizeSel).map(it => String(it.tmplId)).filter(Boolean))
      const m = {}
      for (const t in sizes) {
        const isEnt = entTmpls.has(String(t)), isSel = selTmpls.has(String(t))
        if (!isEnt && !isSel) continue
        m[t] = sizes[t].filter(v => !hiddenVar.has(v.id)).map(v => ({
          id: v.id, size: v.size,
          label: isEnt ? (/^1$/.test(String(v.size)) ? 'Individuel' : (v.size ? v.size + ' pers' : 'Standard')) : (v.size || 'Standard'),
        }))
      }
      setEntVar(m)
      // Toutes catégories : libellé de taille (lecture seule) sous le nom
      const tb = {}
      for (const t in sizes) {
        const vals = [...new Set((sizes[t] || []).filter(v => !hiddenVar.has(v.id)).map(v => (v.size || '').trim()).filter(Boolean))]
        if (vals.length) tb[t] = vals.join(' · ')
      }
      setTailleByTmpl(tb)
    }).catch(() => {})
  }, [cats, hiddenVar])

  if (err && !done) return <Center>{err}</Center>
  if (!cats) return <Center>Chargement…</Center>
  if (done) return <Center><div style={{ fontSize: 40 }}>✅</div><h2 style={{ color: B }}>Commande envoyée !</h2><p style={{ color: SOFT }}>Devis {done} bien reçu. Nous revenons vers vous pour confirmer.</p></Center>

  const findCat = k => cats.find(c => c.key === k)
  const totOf = (c, ii) => {
    if (c.kind === 'size' || c.items[ii]?.sizeSel) { const base = `${c.key}-${ii}`; return Object.keys(qty).filter(k => k.startsWith(base + ':')).reduce((s, k) => s + qty[k], 0) }
    return qty[`${c.key}-${ii}`] || 0
  }
  const chg = (key, d) => setQty(q => { const v = Math.max(0, (q[key] || 0) + d); const n = { ...q }; if (v <= 0) delete n[key]; else n[key] = v; return n })
  const setVal = (key, val) => setQty(q => { const x = Math.max(0, Math.floor(Number(val) || 0)); const n = { ...q }; if (x <= 0) delete n[key]; else n[key] = x; return n })
  const count = Object.keys(qty).length + (autre.trim() ? 1 : 0)
  const c = findCat(active) || cats[0]
  if (!c) return <Center>Catalogue indisponible.</Center>

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', background: CREAM, minHeight: '100vh', paddingBottom: 84, color: '#2b2522', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' }}>
      <div style={{ background: B, color: CREAM, padding: '11px 16px' }}><h1 style={{ margin: 0, fontSize: 15 }}>Commande — LG traiteur OCP</h1></div>

      <div style={{ position: 'sticky', top: 0, background: CREAM, zIndex: 20, padding: '8px 12px 6px', boxShadow: '0 6px 10px -6px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
          {['Hay Riad', 'Technopolis'].map(z => {
            const on = zone === z
            return <div key={z} onClick={() => setZone(z)} style={{ flex: 1, border: `1.5px solid ${on ? B : LINE}`, background: on ? '#fbeef2' : '#fff', color: on ? B : '#2b2522', borderRadius: 11, padding: 9, textAlign: 'center', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{z}</div>
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input type="date" value={date} min={today()} onChange={e => setDate(e.target.value)} style={inp} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none' }} className="ocp-cats">
          {cats.map(cc => <button key={cc.key} onClick={() => { setActive(cc.key); window.scrollTo({ top: 0 }) }} style={{ flexShrink: 0, padding: '11px 17px', border: 'none', borderRadius: 30, fontSize: 14.5, fontWeight: 700, background: cc.key === active ? B : '#e7dcc8', color: cc.key === active ? '#fff' : SOFT }}>{cc.label}</button>)}
        </div>
      </div>

      <div style={{ padding: '14px 12px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {c.items.map((it, ii) => <Tile key={ii} c={c} ii={ii} it={it} qty={qty} chg={chg} setVal={setVal} totOf={totOf} entVar={entVar} tailleByTmpl={tailleByTmpl} />)}
        </div>
        {c.note && <textarea value={autre} onChange={e => setAutre(e.target.value)} placeholder="Écrivez ici ce que vous voulez en plus…" style={{ width: '100%', marginTop: c.items.length ? 12 : 0, padding: 12, border: `1px solid ${LINE}`, borderRadius: 12, fontSize: 15, fontFamily: 'inherit', minHeight: 110 }} />}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 520, margin: '0 auto', background: '#fff', borderTop: `1px solid ${LINE}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: SOFT, fontWeight: 800 }}>{count} article{count > 1 ? 's' : ''}</div>
        <button onClick={() => setRecap(true)} style={{ flex: 1, background: GREEN, color: '#fff', border: 'none', borderRadius: 24, padding: 14, fontSize: 15, fontWeight: 800 }}>Vérifier & envoyer</button>
      </div>

      {recap && <Recap cats={cats} qty={qty} chg={chg} setVal={setVal} autre={autre} zone={zone} date={date} time={time} entVar={entVar} onClose={() => setRecap(false)} busy={busy}
        onConfirm={async () => {
          setBusy(true); setErr('')
          try {
            const items = []
            for (const key in qty) {
              const [base, sub] = key.split(':'); const i = base.lastIndexOf('-'); const ck = base.slice(0, i), ii = +base.slice(i + 1)
              const cc = findCat(ck); const it = cc && cc.items[ii]
              if (!cc || !it) continue
              if (it.free) items.push({ free: true, group: ck === 'fru' ? 'fruits' : null, name: it.name, qty: qty[key], unit: it.unit || '' })
              else if (it.variantId) items.push({ variantId: it.variantId, name: it.name, qty: qty[key] })   // ajouté avec variante précise
              else if (cc.kind === 'size' || it.sizeSel) { const v = (entVar[it.tmplId] || []).find(x => String(x.id) === sub); items.push({ variantId: Number(sub), name: `${it.name}${v ? ' — ' + v.label : ''}`, qty: qty[key] }) }
              else items.push({ tmplId: it.tmplId, kind: cc.kind, variantHint: it.variantHint || null, name: it.name, qty: qty[key] })
            }
            if (autre.trim()) items.push({ autre: autre.trim() })
            const r = await createOcpDevis({ zone, date, time, items })
            if (!r?.ok) throw new Error(r?.error || 'Erreur')
            setDone(r.name)
          } catch (e) { setErr(e?.message || 'Erreur'); setBusy(false) }
        }} />}
      {err && !done && <div style={{ position: 'fixed', bottom: 70, left: 12, right: 12, maxWidth: 496, margin: '0 auto', background: '#fdecec', color: '#b42424', padding: 10, borderRadius: 10, fontSize: 13, textAlign: 'center' }}>{err}</div>}
      <style>{`.ocp-cats::-webkit-scrollbar{display:none}`}</style>
    </div>
  )
}

function Tile({ c, ii, it, qty, chg, setVal, totOf, entVar, tailleByTmpl }) {
  const base = `${c.key}-${ii}`; const tot = totOf(c, ii); const sel = tot > 0
  const isSize = c.kind === 'size' || it.sizeSel   // entremets OU « choix de la taille » activé
  const taille = it.tmplId ? (tailleByTmpl?.[it.tmplId] || '') : ''
  const canTap = !isSize && (c.kind === 'unit' || c.kind === 'free')
  const [imgOk, setImgOk] = useState(true)
  const hasImg = it.img && imgOk
  const thumb = hasImg
    ? <img src={it.img} alt="" onError={() => setImgOk(false)} style={{ width: '100%', height: 96, objectFit: 'contain', borderRadius: 10 }} />
    : <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54 }}>{it.emoji || '🍽️'}</div>
  return (
    <div onClick={canTap ? () => chg(base, 1) : undefined}
      style={{ background: '#fff', border: `1px solid ${sel ? B : LINE}`, boxShadow: sel ? `0 0 0 2px ${B} inset` : 'none', borderRadius: 16, padding: '10px 8px', textAlign: 'center', position: 'relative', cursor: canTap ? 'pointer' : 'default' }}>
      {sel && <div style={{ position: 'absolute', top: -8, right: -8, background: B, color: '#fff', minWidth: 26, height: 26, borderRadius: 13, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{tot}</div>}
      {thumb}
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6, lineHeight: 1.15 }}>{it.name}</div>
      {!isSize && taille && <div style={{ fontSize: 11, color: SOFT, marginTop: 3 }}>Taille : {taille}</div>}
      {isSize ? (
        (entVar[it.tmplId] || []).length
          ? (entVar[it.tmplId]).map(v => <SizeRow key={v.id} label={v.label} k={`${base}:${v.id}`} qty={qty} chg={chg} setVal={setVal} />)
          : <div style={{ fontSize: 11, color: SOFT, marginTop: 6 }}>…</div>
      ) : sel && (
        <>
          {it.unit && <div style={{ fontSize: 10.5, color: SOFT, marginTop: 4 }}>{it.unit}</div>}
          <Qbar k={base} n={qty[base] || 0} chg={chg} setVal={setVal} />
        </>
      )}
    </div>
  )
}
function SizeRow({ label, k, qty, chg, setVal }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 7, fontSize: 12, fontWeight: 700, color: SOFT }}>
    <span>{label}</span><Qbar k={k} n={qty[k] || 0} chg={chg} setVal={setVal} mini />
  </div>
}
function Qbar({ k, n, chg, setVal, mini }) {
  const b = { width: mini ? 28 : 34, height: mini ? 28 : 34, borderRadius: '50%', border: `1.5px solid ${B}`, background: '#fff', color: B, fontSize: mini ? 17 : 21, fontWeight: 800, lineHeight: 1 }
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: mini ? 6 : 10, marginTop: mini ? 0 : 8 }}>
    <button onClick={e => { e.stopPropagation(); chg(k, -1) }} style={b}>−</button>
    <input type="number" inputMode="numeric" value={n} onClick={e => e.stopPropagation()} onChange={e => setVal(k, e.target.value)}
      style={{ width: mini ? 40 : 50, height: mini ? 28 : 34, textAlign: 'center', fontSize: mini ? 14 : 16, fontWeight: 800, border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: '#2b2522' }} />
    <button onClick={e => { e.stopPropagation(); chg(k, 1) }} style={b}>+</button>
  </div>
}

function Recap({ cats, qty, chg, setVal, autre, zone, date, time, entVar, onClose, onConfirm, busy }) {
  const findCat = k => cats.find(c => c.key === k)
  // Regroupé par article : chaque quantité est SOUS l'article (tailles d'entremets incluses).
  const groups = []; const byBase = {}
  Object.keys(qty).forEach(key => {
    const [base, sub] = key.split(':'); const i = base.lastIndexOf('-'); const ck = base.slice(0, i), ii = +base.slice(i + 1)
    const c = findCat(ck); const it = c && c.items[ii]
    if (!c || !it) return
    if (!byBase[base]) { byBase[base] = { name: it.name + (it.unit ? ` · ${it.unit}` : ''), rows: [] }; groups.push(byBase[base]) }
    let label = ''
    if (c.kind === 'size' || it.sizeSel) { const v = (entVar[it.tmplId] || []).find(x => String(x.id) === sub); label = v ? v.label : '' }
    byBase[base].rows.push({ key, label, n: qty[key] })
  })
  return (
    <div style={{ position: 'fixed', inset: 0, background: CREAM, zIndex: 50, overflow: 'auto', paddingBottom: 90 }}>
      <h2 style={{ margin: 0, padding: '14px 16px', background: B, color: '#fff', fontSize: 16, position: 'sticky', top: 0 }}>Vérifiez votre commande</h2>
      <div style={{ fontSize: 12, color: SOFT, padding: '10px 16px 4px', fontWeight: 700 }}>📍 {zone} · {date || '(date ?)'} à {time}</div>
      {groups.length === 0 && !autre.trim() && <div style={{ padding: 30, textAlign: 'center', color: SOFT }}>Aucun article.</div>}
      {groups.map((g, gi) => (
        <div key={gi} style={{ padding: '10px 16px', borderBottom: '1px solid #f0e9dc' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: g.rows.some(r => r.label) ? 6 : 4 }}>{g.name}</div>
          {g.rows.map(r => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              {r.label && <span style={{ fontSize: 12.5, color: SOFT, minWidth: 64 }}>{r.label}</span>}
              <Qbar k={r.key} n={r.n} chg={chg} setVal={setVal} mini />
            </div>
          ))}
        </div>
      ))}
      {autre.trim() && <div style={{ padding: '9px 16px', borderBottom: '1px solid #f0e9dc', fontSize: 13.5 }}>✍️ {autre}</div>}
      <div style={{ padding: 16 }}>
        <button disabled={busy || (!groups.length && !autre.trim()) || !date} onClick={onConfirm} style={{ width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 24, padding: 15, fontSize: 15, fontWeight: 800, opacity: (busy || (!groups.length && !autre.trim()) || !date) ? .5 : 1 }}>{busy ? 'Envoi…' : 'Confirmer la commande'}</button>
        <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', color: SOFT, marginTop: 10, fontSize: 14, fontWeight: 700 }}>‹ Modifier</button>
        {!date && <div style={{ textAlign: 'center', color: '#b42424', fontSize: 12, marginTop: 8 }}>Choisissez une date.</div>}
      </div>
    </div>
  )
}

const inp = { flex: 1, padding: 9, border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 14, background: '#fff' }
function Center({ children }) { return <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh', background: CREAM, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, fontFamily: '-apple-system,system-ui,sans-serif' }}>{children}</div> }
