import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { navTabsForUser } from '../lib/navTabs'
import { useNavBadges } from '../lib/useNavBadges'

const TOP = ['calendar', 'recap', 'tasks', 'checklist', 'conversations', 'caisse', 'hr', 'devis-internet', 'photoshop']

// Onglets qui ouvrent un site externe (et non une vue interne).
const EXTERNAL_URLS = {
  'cake-vision-link': 'https://cake-vision-app.vercel.app',
  'ai-gemini': 'https://gemini.google.com/app',
  'ai-chatgpt': 'https://chatgpt.com',
}
const GROUPS = [
  { id: 'prod',   label: 'Production',     emoji: '🥐', views: ['prod', 'fabrication', 'fabrication-glacage', 'fabrication-pate-sucre', 'fabrication-prod', 'fabrication-annexe', 'fabrication-valider', 'valider-annexe', 'sales', 'stock-gs', 'stock-prod-vitrine', 'stock-prod-annexe', 'inventaire', 'inventaire-prod', 'patissier', 'stock-poly', 'transferts-mp', 'transferts-sm'] },
  { id: 'cafe',   label: 'Café / Vitrine', emoji: '☕', views: ['vitrine', 'vitrine-previsions', 'vitrine-sale', 'reception-vitrine', 'fin-journee', 'reglements-livraisons', 'stock'] },
  { id: 'outils', label: 'Outils',         emoji: '🧰', views: ['etiquettes', 'etiquettes-prix', 'etiquettes-boites', 'messages', 'devis', 'modifications', 'livraisons', 'paiements', 'freezer', 'check-cd', 'economat', 'supports', 'simu-gateaux', 'ocp-link', 'facture-ocp', 'annuaire', 'cake-vision-link', 'cake-vision-edit', 'ai-gemini', 'ai-chatgpt'] },
]

function rhSubs(user) {
  const admin = user?.role === 'admin'
  return [
    { hrTab: 'employes',     label: 'Employés',          emoji: '👥' },
    { hrTab: 'attestations', label: 'Attestations',      emoji: '📄' },
    { hrTab: 'pointage',     label: 'Pointage',          emoji: '⏰' },
    { hrTab: 'conges', ctab: 'demandes',    label: 'Demandes congé',    emoji: '🌴' },
    { hrTab: 'conges', ctab: 'valides',     label: 'Congés validés',    emoji: '✅' },
    { hrTab: 'conges', ctab: 'allocations', label: 'Allocations',       emoji: '📊' },
    { hrTab: 'conges', ctab: 'soldes',      label: 'Soldes employés',   emoji: '⚖️' },
    { hrTab: 'conges', ctab: 'equipe',      label: 'Calendrier équipe', emoji: '📅' },
    { hrTab: 'acces',        label: 'Accès locaux',      emoji: '🔑' },
    admin && { hrTab: 'salaires',  label: 'Salaires',          emoji: '💰' },
    admin && { hrTab: 'bulletins', label: 'Bulletins de paie', emoji: '🧾' },
  ].filter(Boolean)
}

function caisseSubs(user) {
  const admin = !!(user?.perm_caisse_admin || user?.role === 'admin')
  if (!admin) return null
  return [
    { caisseTab: 'enveloppes', label: 'Enveloppes',     emoji: '📊' },
    { caisseTab: 'caisses',    label: 'Caisses gérées',  emoji: '💼' },
    { caisseTab: 'salaires',   label: 'Salaires',        emoji: '💵' },
    { caisseTab: 'recherche',  label: 'Recherche',       emoji: '🔍' },
    { caisseTab: 'params',     label: 'Paramètres',      emoji: '⚙️' },
  ]
}

function read(key, def) { try { return localStorage.getItem(key) || def } catch { return def } }

function buildEntries(user, byView, allowed) {
  const cfg = user?.navbar_config
  const custom = cfg && Array.isArray(cfg.items) && cfg.items.length > 0
  let entries = []
  if (custom) {
    const placed = new Set()
    for (const it of cfg.items) {
      if (it.type === 'group') {
        const tabs = (it.tabs || []).map(v => byView[v]).filter(Boolean)
        if (tabs.length) { tabs.forEach(t => placed.add(t.view)); entries.push({ kind: 'group', id: it.id || it.label, label: it.label || 'Dossier', emoji: it.emoji || '📁', tabs }) }
      } else if (it.type === 'tab') {
        const t = byView[it.view]
        if (t) { placed.add(t.view); entries.push({ kind: 'tab', t }) }
      }
    }
    const hidden = new Set(cfg.hidden || [])
    const left = allowed.filter(t => !placed.has(t.view) && !hidden.has(t.view))
    left.forEach(t => entries.push({ kind: 'tab', t }))
  } else {
    TOP.map(v => byView[v]).filter(Boolean).forEach(t => entries.push({ kind: 'tab', t }))
    for (const g of GROUPS) {
      const tabs = g.views.map(v => byView[v]).filter(Boolean)
      if (tabs.length) entries.push({ kind: 'group', id: g.id, label: g.label, emoji: g.emoji, tabs })
    }
    const used = new Set([...TOP, ...GROUPS.flatMap(g => g.views)])
    allowed.filter(t => !used.has(t.view)).forEach(t => entries.push({ kind: 'tab', t }))
  }
  // RH et Caisse (1er niveau) deviennent des dossiers dépliés.
  return entries.map(e => {
    if (e.kind === 'tab' && e.t.view === 'hr') return { kind: 'rh', id: 'hr', label: 'RH', emoji: '🏢', subs: rhSubs(user) }
    if (e.kind === 'tab' && e.t.view === 'caisse') { const s = caisseSubs(user); if (s) return { kind: 'caisse', id: 'caisse', label: 'Caisse', emoji: '💰', subs: s } }
    return e
  })
}

export default function SideNav({ user, activeView, onNavigate, width, mode, onSetMode, collapsed, onExpand }) {
  // Onglet externe → on ouvre le site ; sinon navigation interne normale.
  const openTab = (view, opts) => {
    const url = EXTERNAL_URLS[view]
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); return }
    onNavigate(view, opts)
  }
  const allowed = navTabsForUser(user)
  const byView = Object.fromEntries(allowed.map(t => [t.view, t]))
  const entries = buildEntries(user, byView, allowed)
  const badges = useNavBadges(user)   // { conversations, tasks, paiements, modifications, livraisons, devis-internet, hr }
  const sumBadges = (tabs) => tabs.reduce((s, t) => s + (badges[t.view] || 0), 0)

  // Re-lit le localStorage (sous-onglet actif) quand il change ailleurs (barre du
  // haut) → le surlignage de la barre latérale suit le changement d'onglet.
  const [, bump] = useState(0)
  useEffect(() => {
    const h = () => bump(n => n + 1)
    window.addEventListener('lily-persist', h)
    return () => window.removeEventListener('lily-persist', h)
  }, [])

  const onHr = activeView === 'hr'
  const onCaisse = activeView === 'caisse'
  const curHr = onHr ? read('lily.hr.tab', 'employes') : null
  const curConges = onHr ? read('lily.conges.tab', 'demandes') : null
  const curCaisse = onCaisse ? read('caisse_active_tab', 'enveloppes') : null

  const activeOpenId = entries.find(e =>
    (e.kind === 'rh' && onHr) || (e.kind === 'caisse' && onCaisse) ||
    (e.kind === 'group' && e.tabs.some(t => t.view === activeView)))?.id
  const [open, setOpen] = useState(() => new Set(activeOpenId ? [activeOpenId] : []))
  const [railHover, setRailHover] = useState(null)   // { text, top } : étiquette du rail au survol
  const isOpen = id => open.has(id)   // repli libre (même le dossier où on est)
  const toggle = id => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Recherche d'onglet : liste plate de toutes les destinations (onglets + sous-onglets RH/Caisse).
  const [q, setQ] = useState('')
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const searchTargets = [
    ...allowed.filter(t => t.view !== 'hr' && t.view !== 'caisse').map(t => ({ label: t.label, emoji: t.emoji, go: () => openTab(t.view) })),
    ...(allowed.some(t => t.view === 'hr') ? rhSubs(user).map(s => ({ label: `RH · ${s.label}`, emoji: s.emoji, go: () => onNavigate('hr', { hrTab: s.hrTab, congesTab: s.ctab }) })) : []),
    ...(allowed.some(t => t.view === 'caisse') && caisseSubs(user) ? caisseSubs(user).map(s => ({ label: `Caisse · ${s.label}`, emoji: s.emoji, go: () => onNavigate('caisse', { caisseTab: s.caisseTab }) })) : []),
  ]
  const results = q.trim() ? searchTargets.filter(x => norm(x.label).includes(norm(q))) : null

  const Badge = ({ n }) => (!n || n <= 0) ? null : (
    <span style={{
      marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, background: '#dc2626', color: '#fff', borderRadius: 999,
    }}>{n > 99 ? '99+' : n}</span>
  )

  const leaf = ({ key, active, label, emoji, onClick, count }) => (
    <button key={key} onClick={onClick} title={label} style={{
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%',
      padding: '8px 11px 8px 26px', borderRadius: 9, border: '1px solid transparent',
      background: active ? '#993556' : 'transparent', color: active ? '#faf7f2' : '#4a3a30',
      fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'left',
    }}>
      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <Badge n={count} />
    </button>
  )

  const topLeaf = (t) => (
    <button key={t.view} onClick={() => openTab(t.view)} title={t.label} style={{
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%',
      padding: '8px 11px', borderRadius: 9, border: '1px solid transparent',
      background: activeView === t.view ? '#993556' : 'transparent', color: activeView === t.view ? '#faf7f2' : '#4a3a30',
      fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'left',
    }}>
      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{t.emoji}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
      <Badge n={badges[t.view]} />
    </button>
  )

  const Folder = ({ id, label, emoji, hasActive, count, children }) => (
    <div>
      <button onClick={() => toggle(id)} style={{
        display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', width: '100%',
        padding: '8px 11px', borderRadius: 9, border: '1px solid transparent', marginTop: 2,
        background: 'transparent', color: hasActive ? '#993556' : '#1a0f0a', fontSize: 13, fontWeight: 600, textAlign: 'left',
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {count > 0 && !isOpen(id) && <Badge n={count} />}
        {isOpen(id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {isOpen(id) && children}
    </div>
  )

  // Mode RAIL : icônes fixes. Survol d'une icône → son nom sort en étiquette (pas d'élargissement).
  if (collapsed) {
    const iconFor = e => e.kind === 'tab' ? e.t.emoji : e.emoji
    const labelFor = e => e.kind === 'tab' ? e.t.label : e.label
    const countFor = e => e.kind === 'tab' ? (badges[e.t.view] || 0) : e.kind === 'rh' ? (badges.hr || 0) : e.kind === 'caisse' ? 0 : sumBadges(e.tabs)
    const activeFor = e => e.kind === 'tab' ? activeView === e.t.view : e.kind === 'rh' ? onHr : e.kind === 'caisse' ? onCaisse : e.tabs.some(t => t.view === activeView)
    const clickFor = e => {
      if (e.kind === 'tab') return () => openTab(e.t.view)
      if (e.kind === 'rh') return () => onNavigate('hr')
      if (e.kind === 'caisse') return () => onNavigate('caisse')
      return () => { if (e.tabs[0]) openTab(e.tabs[0].view) }
    }
    const showLab = (ev, text) => setRailHover({ text, top: ev.currentTarget.getBoundingClientRect().top })
    const modes = [['fixe', '📌', 'Barre fixe'], ['auto', '⇤', 'Barre auto-cachée'], ['rail', '▥', "Rail d'icônes"]]
    return (
      <nav style={{ width, height: '100%', background: '#F7F2EA', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', overflowX: 'hidden', padding: '12px 0', gap: 4 }}>
        <img src="/Logo_LG.jpg" alt="LG" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6, marginBottom: 6 }} />
        {entries.map((e, i) => {
          const n = countFor(e)
          return (
            <button key={e.id || (e.t && e.t.view) || i} onClick={clickFor(e)}
              onMouseEnter={ev => showLab(ev, labelFor(e))} onMouseLeave={() => setRailHover(null)}
              style={{ position: 'relative', width: 38, height: 38, borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 18,
                background: activeFor(e) ? '#993556' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span>{iconFor(e)}</span>
              {n > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n > 99 ? '99+' : n}</span>}
            </button>
          )
        })}
        {onSetMode && (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10 }}>
            {modes.map(([m, ic, lab]) => (
              <button key={m} onClick={() => onSetMode(m)} onMouseEnter={ev => showLab(ev, lab)} onMouseLeave={() => setRailHover(null)}
                style={{ width: 30, height: 30, borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: '1px solid ' + (mode === m ? '#993556' : '#e5d8c3'), background: mode === m ? '#993556' : '#fff', color: mode === m ? '#fff' : '#8a7a70' }}>{ic}</button>
            ))}
          </div>
        )}
        {railHover && (
          <div style={{ position: 'fixed', left: (width + 8) + 'px', top: railHover.top + 'px', zIndex: 60, pointerEvents: 'none',
            background: '#fff', border: '1px solid #e5d8c3', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 600,
            color: '#1a0f0a', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.14)' }}>{railHover.text}</div>
        )}
      </nav>
    )
  }

  return (
    <nav style={{
      width, height: '100%', background: '#F7F2EA',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', padding: '12px 8px', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <button onClick={() => onNavigate('calendar')} title="Lily Gourmet" style={{
          display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
          background: 'none', border: 'none', padding: '4px 8px', flex: 1, minWidth: 0,
        }}>
          <img src="/Logo_LG.jpg" alt="LG" style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Geist, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#1a0f0a', overflow: 'hidden', textOverflow: 'ellipsis' }}>LILY GOURMET</span>
        </button>
      </div>

      {/* Sélecteur d'affichage de la barre — chacun choisit, c'est mémorisé */}
      {onSetMode && (
        <div style={{ display: 'flex', gap: 4, padding: '0 4px 10px' }} title="Comment afficher la barre de gauche">
          {[['fixe', 'Fixe'], ['auto', 'Auto'], ['rail', 'Rail']].map(([m, lab]) => (
            <button key={m} onClick={() => onSetMode(m)} style={{
              flex: 1, fontSize: 10.5, fontWeight: 600, padding: '5px 4px', borderRadius: 7, cursor: 'pointer',
              border: '1px solid ' + (mode === m ? '#993556' : '#e5d8c3'),
              background: mode === m ? '#993556' : '#fff', color: mode === m ? '#fff' : '#8a7a70',
            }}>{lab}</button>
          ))}
        </div>
      )}

      {/* Recherche d'onglet */}
      <div style={{ position: 'relative', padding: '0 4px 10px' }}>
        <Search size={14} strokeWidth={1.8} style={{ position: 'absolute', left: 14, top: 9, color: '#8a7a70', pointerEvents: 'none' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Rechercher un onglet…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 11px 7px 32px', borderRadius: 9, border: '1px solid #e5d8c3', background: '#fff', color: '#1a0f0a', fontSize: 12.5, outline: 'none' }}
        />
        {q && <button onClick={() => setQ('')} title="Effacer" style={{ position: 'absolute', right: 12, top: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#8a7a70', fontSize: 14 }}>✕</button>}
      </div>

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {results.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: '8px 11px', fontStyle: 'italic' }}>Aucun onglet trouvé.</div>}
          {results.map((r, i) => (
            <button key={i} onClick={() => { r.go(); setQ('') }} title={r.label} style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%',
              padding: '8px 11px', borderRadius: 9, border: '1px solid transparent', background: 'transparent',
              color: '#4a3a30', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'left',
            }}>
              <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{r.emoji}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            </button>
          ))}
        </div>
      )}

      {!results && entries.map((e, i) => {
        if (e.kind === 'tab') return topLeaf(e.t)
        if (e.kind === 'rh') return (
          <Folder key="hr" id="hr" label={e.label} emoji={e.emoji} hasActive={onHr} count={badges.hr || 0}>
            {e.subs.map(s => leaf({
              key: s.hrTab + (s.ctab || ''), label: s.label, emoji: s.emoji,
              active: onHr && curHr === s.hrTab && (s.hrTab !== 'conges' || curConges === s.ctab),
              onClick: () => onNavigate('hr', { hrTab: s.hrTab, congesTab: s.ctab }),
              count: (s.hrTab === 'conges' && s.ctab === 'demandes') ? (badges.hr || 0) : 0,
            }))}
          </Folder>
        )
        if (e.kind === 'caisse') return (
          <Folder key="caisse" id="caisse" label={e.label} emoji={e.emoji} hasActive={onCaisse}>
            {e.subs.map(s => leaf({
              key: s.caisseTab, label: s.label, emoji: s.emoji,
              active: onCaisse && curCaisse === s.caisseTab,
              onClick: () => onNavigate('caisse', { caisseTab: s.caisseTab }),
            }))}
          </Folder>
        )
        return (
          <Folder key={e.id || i} id={e.id} label={e.label} emoji={e.emoji} hasActive={e.tabs.some(t => t.view === activeView)} count={sumBadges(e.tabs)}>
            {e.tabs.map(t => leaf({ key: t.view, label: t.label, emoji: t.emoji, active: activeView === t.view, onClick: () => openTab(t.view), count: badges[t.view] || 0 }))}
          </Folder>
        )
      })}
    </nav>
  )
}
