import { useState, useRef } from 'react'
import { X, RotateCcw, GripVertical, FolderPlus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { toast } from '../lib/toast'

// Emojis proposés pour les dossiers (clic pour choisir).
const FOLDER_EMOJIS = ['📁', '🗂️', '🥐', '☕', '🧰', '📦', '🍰', '🧁', '🥪', '🛒', '📊', '💰', '🏢', '📱', '📄', '🏷️', '❄️', '🧾', '🎨', '🔧', '🌙', '📅', '✅', '📋', '⭐', '🔴', '🟢', '🟡', '🔵', '🟣']

// ============================================================
// NavbarConfigModal v2 : l'utilisateur range ses onglets comme il veut.
// - onglets "seuls" = boutons directs dans la barre rouge
// - dossiers = menus déroulants (nom + emoji libres)
// - glisser-déposer (souris + tactile) pour l'ordre
// - menu "Ranger…" pour déplacer un onglet (barre / dossier / caché)
// Tout onglet non rangé tombe dans le menu « Plus » (jamais perdu).
//
// Format enregistré : { version:2, items:[ {type:'tab',view} |
//   {type:'group',id,label,emoji,tabs:[view,...]} ] }
// ============================================================

// Construit la liste de travail à partir de la config existante (v1 ou v2).
function buildItems(config, allTabs) {
  const allowed = new Set(allTabs.map(t => t.view))
  if (Array.isArray(config?.items)) {
    return config.items
      .map(it => it.type === 'group'
        ? { type: 'group', id: it.id, label: it.label || 'Dossier', emoji: it.emoji || '📁', tabs: (it.tabs || []).filter(v => allowed.has(v)) }
        : { type: 'tab', view: it.view })
      .filter(it => it.type === 'group' || allowed.has(it.view))
  }
  if (config && (config.order || config.hidden)) {
    const hidden = new Set(config.hidden || [])
    return (config.order || []).filter(v => allowed.has(v) && !hidden.has(v)).map(v => ({ type: 'tab', view: v }))
  }
  // Pas de config : tout à plat dans l'ordre par défaut
  return allTabs.map(t => ({ type: 'tab', view: t.view }))
}

// ---- Petit composant de tri par glisser (souris + tactile) ----
function Sortable({ name, ids, onReorder, children }) {
  const containerRef = useRef(null)
  const idsRef = useRef(ids)
  idsRef.current = ids
  const [dragId, setDragId] = useState(null)

  function start(e, id) {
    e.preventDefault()
    setDragId(id)
    const move = ev => {
      const y = ev.clientY
      const rows = Array.from(containerRef.current?.querySelectorAll(`[data-sort="${name}"]`) || [])
      const cur = idsRef.current
      const without = cur.filter(x => x !== id)
      let insertAt = without.length
      for (const row of rows) {
        const rid = row.getAttribute('data-sortid')
        if (rid === id) continue
        const rect = row.getBoundingClientRect()
        if (y < rect.top + rect.height / 2) { insertAt = without.indexOf(rid); break }
      }
      if (insertAt < 0) insertAt = without.length
      const next = [...without.slice(0, insertAt), id, ...without.slice(insertAt)]
      if (next.join('|') !== cur.join('|')) onReorder(next)
    }
    const up = () => {
      setDragId(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={containerRef}>
      {ids.map(id => (
        <div key={id} data-sort={name} data-sortid={id} className={dragId === id ? 'opacity-50' : ''}>
          {children(id, { onPointerDown: e => start(e, id), style: { touchAction: 'none', cursor: 'grab' } })}
        </div>
      ))}
    </div>
  )
}

export default function NavbarConfigModal({ tabs, config, onSave, onClose }) {
  const tabsByView = Object.fromEntries(tabs.map(t => [t.view, t]))
  const [items, setItems] = useState(() => buildItems(config, tabs))
  const [saving, setSaving] = useState(false)
  const [pickerFor, setPickerFor] = useState(null)   // id du dossier dont le choix d'emoji est ouvert
  // Dossiers repliés : avec une dizaine de dossiers pleins, il fallait défiler
  // sur toute la hauteur pour déplacer un onglet. Tout est replié au départ.
  const [replies, setReplies] = useState(() => new Set(
    (Array.isArray(config?.items) ? config.items : []).filter(i => i.type === 'group').map(i => i.id)
  ))
  const basculer = id => setReplies(r => { const n = new Set(r); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Onglets rangés nulle part -> section "Caché (menu Plus)"
  const placed = new Set()
  for (const it of items) {
    if (it.type === 'group') it.tabs.forEach(v => placed.add(v))
    else placed.add(it.view)
  }
  const unplaced = tabs.filter(t => !placed.has(t.view))
  const groups = items.filter(it => it.type === 'group')

  // id stable d'une entrée de premier niveau (pour le tri)
  const topId = it => it.type === 'group' ? 'grp:' + it.id : 'tab:' + it.view
  const topIds = items.map(topId)

  function reorderTop(newIds) {
    const byId = Object.fromEntries(items.map(it => [topId(it), it]))
    setItems(newIds.map(id => byId[id]).filter(Boolean))
  }
  function reorderGroupTabs(groupId, newViews) {
    setItems(items.map(it => (it.type === 'group' && it.id === groupId) ? { ...it, tabs: newViews } : it))
  }

  // Déplace un onglet : dest = 'top' | 'grp:<id>' | 'hidden'
  function moveTab(view, dest) {
    // 1) retire l'onglet de partout
    let next = items
      .filter(it => !(it.type === 'tab' && it.view === view))
      .map(it => it.type === 'group' ? { ...it, tabs: it.tabs.filter(v => v !== view) } : it)
    // 2) ajoute à la destination
    if (dest === 'top') {
      next = [...next, { type: 'tab', view }]
    } else if (dest.startsWith('grp:')) {
      const gid = dest.slice(4)
      next = next.map(it => (it.type === 'group' && it.id === gid) ? { ...it, tabs: [...it.tabs, view] } : it)
    } // 'hidden' = on ne le remet nulle part
    setItems(next)
  }

  function addGroup() {
    setItems([...items, { type: 'group', id: 'g' + Date.now(), label: 'Dossier', emoji: '📁', tabs: [] }])
  }
  function updateGroup(id, patch) {
    setItems(items.map(it => (it.type === 'group' && it.id === id) ? { ...it, ...patch } : it))
  }
  function deleteGroup(id) {
    // ses onglets redeviennent "non rangés" (menu Plus)
    setItems(items.filter(it => !(it.type === 'group' && it.id === id)))
  }

  async function persist(cfg) {
    setSaving(true)
    try {
      await onSave(cfg)
      onClose()
    } catch (e) {
      toast.error('Erreur : ' + (e?.message || e))
      setSaving(false)
    }
  }
  const handleSave = () => persist({ version: 2, items })
  const handleReset = () => persist(null)

  // Menu "Ranger…" affiché sous chaque onglet
  function MoveSelect({ view, location }) {
    return (
      <select
        value={location}
        onChange={e => moveTab(view, e.target.value)}
        onPointerDown={e => e.stopPropagation()}
        className="text-[11px] border border-line rounded-md bg-cream px-1.5 py-1 text-ink max-w-[130px]"
        title="Ranger cet onglet"
      >
        <option value="top">Barre (bouton direct)</option>
        {groups.map(g => <option key={g.id} value={'grp:' + g.id}>{g.emoji} {g.label}</option>)}
        <option value="hidden">Cacher (menu « Plus »)</option>
      </select>
    )
  }

  function TabRow({ view, location, handleProps }) {
    const t = tabsByView[view]
    if (!t) return null
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-cream-warm/40 mb-1">
        {handleProps
          ? <span {...handleProps} className="text-ink-mute flex-shrink-0"><GripVertical size={16} /></span>
          : <span className="w-4 flex-shrink-0" />}
        <span className="flex-1 text-[13px] text-ink truncate"><span className="mr-1.5">{t.emoji || '•'}</span>{t.label}</span>
        {location !== 'top' && (
          <button
            onClick={() => moveTab(view, 'top')}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-bordeaux/40 text-bordeaux text-[11px] hover:bg-bordeaux hover:text-cream transition-all"
            title="Mettre cet onglet dans la barre"
          >⬆ Barre</button>
        )}
        <MoveSelect view={view} location={location} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-cream w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div>
            <div className="font-semibold text-[15px] text-ink">Mes onglets</div>
            <div className="text-[11px] text-ink-mute">Glisse pour l'ordre · « Ranger… » pour déplacer</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-cream-warm flex items-center justify-center">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Corps */}
        <div className="overflow-y-auto px-3 py-3 flex-1">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={addGroup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-bordeaux/40 text-bordeaux text-[12px] hover:bg-bordeaux hover:text-cream transition-all"
            >
              <FolderPlus size={15} strokeWidth={1.8} /> Nouveau dossier
            </button>
            {items.some(i => i.type === 'group') && (
              <button
                onClick={() => setReplies(r => r.size ? new Set() : new Set(items.filter(i => i.type === 'group').map(i => i.id)))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line text-ink-soft text-[12px] hover:bg-cream-warm"
              >
                {replies.size ? <><ChevronDown size={14} /> Tout ouvrir</> : <><ChevronRight size={14} /> Tout replier</>}
              </button>
            )}
          </div>

          {/* Liste de premier niveau (onglets seuls + dossiers), triable */}
          {/* Pas encore rangés — EN HAUT : c'est ici que tombent les onglets
              récents, et on ne les voyait pas, tout en bas de la liste. */}
          {unplaced.length > 0 && (
            <div className="mb-4 rounded-xl border border-bordeaux/30 bg-bordeaux/5 p-2">
              <div className="text-[11px] font-semibold text-bordeaux uppercase tracking-wider mb-1.5 px-1">
                Pas encore rangés ({unplaced.length}) · pour l'instant dans le menu « Plus »
              </div>
              {unplaced.map(t => <TabRow key={t.view} view={t.view} location="hidden" handleProps={null} />)}
            </div>
          )}

          <Sortable name="top" ids={topIds} onReorder={reorderTop}>
            {(id, handleProps) => {
              const it = items.find(x => topId(x) === id)
              if (!it) return null
              if (it.type === 'tab') {
                return <TabRow view={it.view} location="top" handleProps={handleProps} />
              }
              // Dossier
              return (
                <div className="border border-line rounded-xl mb-2 bg-cream">
                  <div className="flex items-center gap-2 px-2 py-2 border-b border-line">
                    <span {...handleProps} className="text-ink-mute flex-shrink-0"><GripVertical size={16} /></span>
                    <button
                      onClick={() => basculer(it.id)}
                      onPointerDown={e => e.stopPropagation()}
                      className="w-7 h-7 rounded-md border border-line bg-cream-warm text-ink-soft flex items-center justify-center flex-shrink-0"
                      title={replies.has(it.id) ? 'Voir les onglets' : 'Replier'}
                      aria-expanded={!replies.has(it.id)}
                    >
                      {replies.has(it.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <div className="relative flex-shrink-0" onPointerDown={e => e.stopPropagation()}>
                      <button
                        onClick={() => setPickerFor(pickerFor === it.id ? null : it.id)}
                        className="w-9 h-8 text-center text-[16px] border border-line rounded-md bg-cream-warm"
                        title="Choisir l'emoji du dossier"
                      >{it.emoji || '📁'}</button>
                      {pickerFor === it.id && (
                        <div className="absolute z-[60] top-full left-0 mt-1 bg-cream border border-line rounded-lg shadow-xl p-2 grid grid-cols-6 gap-1 w-[212px]">
                          {FOLDER_EMOJIS.map(em => (
                            <button key={em} onClick={() => { updateGroup(it.id, { emoji: em }); setPickerFor(null) }}
                              className="text-[18px] leading-none p-1.5 rounded hover:bg-cream-warm">{em}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      value={it.label}
                      onChange={e => updateGroup(it.id, { label: e.target.value })}
                      onPointerDown={e => e.stopPropagation()}
                      className="flex-1 text-[13px] border border-line rounded-md bg-cream-warm px-2 py-1 text-ink"
                      placeholder="Nom du dossier"
                    />
                    <button
                      onClick={() => deleteGroup(it.id)}
                      className="w-8 h-8 rounded-full hover:bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0"
                      title="Supprimer le dossier (les onglets repassent dans « Plus »)"
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                  {replies.has(it.id) ? (
                    <button onClick={() => basculer(it.id)}
                      className="w-full text-left px-3 py-1.5 text-[11.5px] text-ink-mute hover:bg-cream-warm">
                      {it.tabs.length === 0 ? 'Vide' : `${it.tabs.length} onglet${it.tabs.length > 1 ? 's' : ''} — voir`}
                    </button>
                  ) : (
                  <div className="px-2 py-2">
                    {it.tabs.length === 0 ? (
                      <div className="text-[11px] text-ink-mute italic px-1 py-1">Vide — range des onglets ici avec « Ranger… »</div>
                    ) : (
                      <Sortable name={'g-' + it.id} ids={it.tabs} onReorder={v => reorderGroupTabs(it.id, v)}>
                        {(view, hp) => <TabRow view={view} location={'grp:' + it.id} handleProps={hp} />}
                      </Sortable>
                    )}
                  </div>
                  )}
                </div>
              )
            }}
          </Sortable>

        </div>

        {/* Pied */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-line text-[12px] text-ink hover:bg-cream-warm disabled:opacity-50"
            title="Remettre l'affichage par défaut"
          >
            <RotateCcw size={15} strokeWidth={1.8} /> Réinitialiser
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-full bg-bordeaux text-cream text-[13px] font-medium hover:bg-bordeaux-deep disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
