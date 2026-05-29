import { useState, useEffect } from 'react'
import { Palette, Tags, Wallet, Store, Eye, EyeOff, Trash2, Pencil, Loader2, Search } from 'lucide-react'
import { loadDestinataires, createDestinataire, updateDestinataire, deleteDestinataire,
         loadCategories, createCategorie, updateCategorie,
         loadSalairesDefaut, setSalaireDefaut,
         loadPosConfigs, togglePosConfig } from '../../lib/caisse'
import { COLOR_PALETTE, COLORS_BY_TYPE } from './_helpers'

// Palette d'emojis pré-sélectionnés pour les catégories
const EMOJI_PICKER = [
  '🛒', '🍞', '🥐', '🥖', '🧀', '🥩', '🐟', '🥦',
  '🚖', '🚗', '⛽', '📦', '🌍', '✈️',
  '🔧', '🛠️', '⚙️', '🔌', '💡', '🪚',
  '💼', '🧾', '💰', '💵', '💳', '🏦',
  '💧', '🚿', '🔥', '❄️', '⚡',
  '👤', '👥', '👶', '🧑‍🍳',
  '🎁', '🎉', '☕', '🍰', '🧁',
  '📱', '💻', '🖥️', '🖨️',
  '🩹', '💊', '🏥',
  '❓', '⚪', '🔴', '🟢', '🟡', '🔵',
]

export default function ParametresView({ user }) {
  return (
    <div>
      <DestinatairesSection />
      <CategoriesSection />
      <SalairesDefautSection />
      <PosSessionsSection />
    </div>
  )
}

function Section({ title, icon, desc, children }) {
  return (
    <div style={{ background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>{icon} {title}</div>
      <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 20 }}>{desc}</div>
      {children}
    </div>
  )
}

// ---- Destinataires ----
function DestinatairesSection() {
  const [list, setList] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'caisse_geree', color_key: 'vert_clair' })

  useEffect(() => { reload() }, [])
  async function reload() { setList(await loadDestinataires({ activeOnly: false })) }

  async function handleAdd() {
    if (!form.name) return
    await createDestinataire(form)
    setAdding(false); setForm({ name: '', type: 'caisse_geree', color_key: 'vert_clair' }); reload()
  }
  async function handleDelete(id) {
    if (!confirm('Désactiver ce destinataire ?')) return
    await deleteDestinataire(id); reload()
  }
  async function handleToggleActive(d) {
    await updateDestinataire(d.id, { active: !d.active }); reload()
  }

  return (
    <Section title="Destinataires des enveloppes" icon={<Palette size={16} />}
      desc="Chaque destinataire a sa propre couleur. Si déjà utilisé, il sera désactivé au lieu d'être supprimé.">
      {list.map(d => {
        const c = COLOR_PALETTE[d.color_key] || COLOR_PALETTE.gris
        return (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 140px 32px 32px', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 8, marginBottom: 5, background: d.active ? '#F4F0EA' : '#F9F6F1', opacity: d.active ? 1 : 0.55 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: c.bg, border: `1px solid ${c.border}` }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: '#4a3a30' }}>{d.type === 'caisse_geree' ? 'caisse-gérée' : d.type}</div>
            </div>
            <div><span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'white', color: '#4a3a30' }}>{c.label}</span></div>
            <button onClick={() => handleToggleActive(d)} style={iconBtn} title={d.active ? 'Désactiver' : 'Réactiver'}>{d.active ? <Eye size={15} /> : <EyeOff size={15} />}</button>
            <button onClick={() => handleDelete(d.id)} style={iconBtn} title="Supprimer"><Trash2 size={15} /></button>
          </div>
        )
      })}

      {!adding && <button onClick={() => setAdding(true)} style={addBtn}>+ Ajouter un destinataire</button>}
      {adding && (
        <div style={{ marginTop: 12, padding: 14, background: '#F9F6F1', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Nom</div>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <div style={{ fontSize: 11, color: '#4a3a30', margin: '10px 0 4px' }}>Type</div>
          <select value={form.type} onChange={e => {
            const newType = e.target.value
            const firstColor = COLORS_BY_TYPE[newType][0]
            setForm({ ...form, type: newType, color_key: firstColor })
          }} style={inputStyle}>
            <option value="caisse_geree">caisse-gérée</option>
            <option value="perso">perso</option>
            <option value="banque">banque</option>
          </select>
          <div style={{ fontSize: 11, color: '#4a3a30', margin: '10px 0 4px' }}>Couleur</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COLORS_BY_TYPE[form.type].map(ck => {
              const c = COLOR_PALETTE[ck]
              const sel = form.color_key === ck
              return (
                <button key={ck} onClick={() => setForm({ ...form, color_key: ck })} style={{
                  width: 32, height: 32, borderRadius: 8, background: c.bg, border: `2px solid ${sel ? c.border : 'transparent'}`, cursor: 'pointer',
                }} title={c.label} />
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button onClick={() => setAdding(false)} style={btnSlim}>Annuler</button>
            <button onClick={handleAdd} style={btnPrimary}>Créer</button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ---- Catégories ----
function CategoriesSection() {
  return (
    <Section title="Catégories de sortie · par caisse" icon={<Tags size={16} />}
      desc="Chaque caisse a ses propres catégories. Ajouter / renommer / désactiver.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <CategoryColumn caisseOwner="meriem"   label="Caisse Meriem"   color={{ bg: '#EAF3DE', text: '#27500A' }} />
        <CategoryColumn caisseOwner="layla_lg" label="Caisse Layla LG" color={{ bg: '#E1F5EE', text: '#085041' }} />
      </div>
    </Section>
  )
}

function EmojiPicker({ selected, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, padding: 8, background: 'white', borderRadius: 8, border: '0.5px solid #e5d8c3', maxHeight: 140, overflowY: 'auto' }}>
      {EMOJI_PICKER.map(em => (
        <button key={em} type="button" onClick={() => onSelect(em)} style={{
          padding: 6, fontSize: 18, lineHeight: 1, cursor: 'pointer',
          background: selected === em ? '#FAEEDA' : 'transparent',
          border: selected === em ? '2px solid #EF9F27' : '1px solid transparent',
          borderRadius: 6,
        }}>{em}</button>
      ))}
    </div>
  )
}

function CategoryColumn({ caisseOwner, label, color }) {
  const [cats, setCats] = useState([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('❓')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ emoji: '', name: '' })

  useEffect(() => { reload() }, [])
  async function reload() { setCats(await loadCategories(caisseOwner)) }

  async function handleAdd() {
    if (!newName) return
    await createCategorie({ caisseOwner, name: newName, emoji: newEmoji })
    setAdding(false); setNewName(''); setNewEmoji('❓'); reload()
  }
  async function handleDeactivate(id) {
    if (!confirm('Désactiver cette catégorie ?')) return
    await updateCategorie(id, { active: false }); reload()
  }
  function startEdit(cat) {
    setEditingId(cat.id)
    setEditForm({ emoji: cat.emoji || '❓', name: cat.name })
  }
  async function saveEdit() {
    if (!editForm.name) return
    await updateCategorie(editingId, { emoji: editForm.emoji, name: editForm.name })
    setEditingId(null); reload()
  }

  return (
    <div>
      <div style={{ background: color.bg, color: color.text, padding: '8px 12px', borderRadius: 8, marginBottom: 8, fontSize: 13, fontWeight: 500 }}>{label}</div>
      {cats.map(c => {
        if (editingId === c.id) {
          return (
            <div key={c.id} style={{ padding: 10, background: '#F9F6F1', borderRadius: 8, marginBottom: 4, border: '1px solid #993556' }}>
              <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Nom" autoFocus />
              <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Emoji : <span style={{ fontSize: 18 }}>{editForm.emoji}</span></div>
              <EmojiPicker selected={editForm.emoji} onSelect={(em) => setEditForm({ ...editForm, emoji: em })} />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => setEditingId(null)} style={btnSlim}>Annuler</button>
                <button onClick={saveEdit} style={btnPrimary}>Enregistrer</button>
              </div>
            </div>
          )
        }
        return (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 28px 28px', gap: 6, alignItems: 'center', padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: '#F4F0EA' }}>
            <div style={{ fontSize: 13 }}>{c.emoji} {c.name}</div>
            <button onClick={() => startEdit(c)} style={iconBtn} title="Modifier"><Pencil size={14} /></button>
            <button onClick={() => handleDeactivate(c.id)} style={iconBtn} title="Supprimer"><Trash2 size={14} /></button>
          </div>
        )
      })}
      {!adding && <button onClick={() => setAdding(true)} style={{ ...addBtn, marginTop: 6 }}>+ Ajouter</button>}
      {adding && (
        <div style={{ marginTop: 8, padding: 10, background: '#F9F6F1', borderRadius: 8 }}>
          <input type="text" placeholder="Nom de la catégorie" value={newName} onChange={e => setNewName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} autoFocus />
          <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Emoji : <span style={{ fontSize: 18 }}>{newEmoji}</span></div>
          <EmojiPicker selected={newEmoji} onSelect={setNewEmoji} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={() => setAdding(false)} style={btnSlim}>Annuler</button>
            <button onClick={handleAdd} style={btnPrimary}>Créer</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Salaires défaut ----
function SalairesDefautSection() {
  const [defaults, setDefaults] = useState({})
  const [editing, setEditing] = useState({})

  useEffect(() => { reload() }, [])
  async function reload() { setDefaults(await loadSalairesDefaut()) }

  async function handleSave(ben, val) {
    await setSalaireDefaut(ben, Number(val))
    setEditing({ ...editing, [ben]: false }); reload()
  }

  return (
    <Section title="Salaires par défaut" icon={<Wallet size={16} />}
      desc="Montant pré-rempli quand tu crées un nouveau salaire. Éditable au cas par cas.">
      {['nezha', 'layla'].map(ben => (
        <div key={ben} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 200px', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 8, marginBottom: 5, background: '#F4F0EA' }}>
          <span style={{ width: 14, height: 14, borderRadius: 999, display: 'inline-block', background: ben === 'nezha' ? '#EF9F27' : '#D85A30' }} />
          <div style={{ fontSize: 13, fontWeight: 500 }}>{ben === 'nezha' ? 'Nezha' : 'Layla'}</div>
          <input key={defaults[ben]} type="number" defaultValue={defaults[ben] || 0} onBlur={(e) => handleSave(ben, e.target.value)} style={inputStyle} />
        </div>
      ))}
    </Section>
  )
}

// ---- Sessions POS ----
function PosSessionsSection() {
  const [list, setList] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => { reload() }, [refreshKey])
  async function reload() {
    const data = await loadPosConfigs()
    console.log('[PosSessionsSection] loaded', data?.length, 'configs')
    setList(data || [])
  }

  async function handleDetect() {
    setSyncing(true)
    try {
      const res = await fetch('/api/caisse-api?action=list-pos', { method: 'POST' })
      const json = await res.json()
      console.log('[detect-pos]', json)
      if (json.error) {
        alert('Erreur : ' + json.error)
      } else {
        if (json.configs && json.configs.length > 0) {
          alert(`✓ ${json.configs.length} session(s) POS détectée(s)`)
        }
        // Force le reload via changement de key
        setRefreshKey(k => k + 1)
      }
    } catch (e) { alert(e.message) }
    setSyncing(false)
  }

  async function handleToggle(id, active) {
    await togglePosConfig(id, active)
    setRefreshKey(k => k + 1)
  }

  return (
    <Section title="Sessions POS détectées (Odoo)" icon={<Store size={16} />}
      desc="Sessions Odoo auto-détectées. Désactivée = aucune enveloppe ne sera créée pour cette session.">
      <button onClick={handleDetect} disabled={syncing} style={{ ...btnNormal, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {syncing ? <><Loader2 size={14} className="animate-spin" /> Détection…</> : <><Search size={14} /> Détecter les sessions Odoo</>}
      </button>
      {list.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: 10 }}>Aucune session détectée pour l'instant. Cliquez ci-dessus.</div>}
      {list.map(p => (
        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 100px', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 8, marginBottom: 5, background: '#F4F0EA' }}>
          <span style={{ display: 'inline-flex', color: '#4a3a30' }}><Store size={18} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: '#8a7a70' }}>détecté · dernière sync : {p.last_synced_at ? new Date(p.last_synced_at).toLocaleString('fr-FR') : 'jamais'}</div>
          </div>
          <button onClick={() => handleToggle(p.id, !p.active)} style={{
            width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: p.active ? '#1D9E75' : '#C4BFB6', position: 'relative',
          }}>
            <span style={{ position: 'absolute', top: 2, [p.active ? 'right' : 'left']: 2, width: 16, height: 16, background: 'white', borderRadius: '50%' }} />
          </button>
          <div style={{ fontSize: 11, color: p.active ? '#1D7A5C' : '#8a7a70' }}>{p.active ? 'Actif' : 'Inactif'}</div>
        </div>
      ))}
    </Section>
  )
}

const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#8a7a70', fontSize: 14 }
const addBtn  = { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', marginTop: 10 }
const btnSlim    = { fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnNormal  = { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
const inputStyle = { padding: '8px 10px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' }
