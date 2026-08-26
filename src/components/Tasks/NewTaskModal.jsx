import { useState, useEffect } from 'react'
import { createTask, loadAllUsers, uploadTaskAttachment } from '../../lib/tasks'
import { loadGroupesPourInfo } from '../../lib/watiInfo'
import SearchSelect from '../SearchSelect'

/**
 * Modal pour créer une nouvelle tâche.
 * Props :
 *  - currentUser : user connecté ({ id, username })
 *  - onClose() : fermer
 *  - onCreated() : après création
 */
export default function NewTaskModal({ currentUser, onClose, onCreated }) {
  const [users, setUsers] = useState([])
  const [groupes, setGroupes] = useState([])   // [{ nom, profileIds }] depuis les Employés
  const [mode, setMode] = useState('person')   // 'person' | 'multi' | 'group' | 'all'
  const [toUserId, setToUserId] = useState('')
  const [multiIds, setMultiIds] = useState([])
  const [multiSearch, setMultiSearch] = useState('')
  const [groupValue, setGroupValue] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { (async () => {
    try {
      const list = await loadAllUsers()
      setUsers(list)
      const firstOther = list.find(u => u.id !== currentUser?.id)
      setToUserId(firstOther?.id || list[0]?.id || '')
    } catch (e) {
      console.warn('loadAllUsers:', e?.message)
    }
    loadGroupesPourInfo().then(setGroupes).catch(() => {})
  })() }, [currentUser?.id])

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    setError(null)
    if (!f) { setFile(null); return }
    if (f.size > 5 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 5 MB)')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!title.trim()) { setError('Le titre est obligatoire'); return }

    // Construire la liste des destinataires selon le mode
    let recipients = []
    if (mode === 'person') {
      if (!toUserId) { setError('Sélectionne un destinataire'); return }
      recipients = [toUserId]
    } else if (mode === 'multi') {
      recipients = multiIds.filter(id => id !== currentUser.id)
      if (!recipients.length) { setError('Sélectionne au moins une personne'); return }
    } else if (mode === 'group') {
      if (!groupValue) { setError('Choisis un groupe'); return }
      const g = groupes.find(x => x.nom === groupValue)
      recipients = (g?.profileIds || []).filter(id => id !== currentUser.id)
    } else {
      recipients = users.filter(u => u.active !== false && u.id !== currentUser.id).map(u => u.id)
    }
    if (!recipients.length) { setError('Aucun destinataire trouvé.'); return }

    setSaving(true); setError(null)
    try {
      let attachment = null
      if (file) {
        setUploading(true)
        attachment = await uploadTaskAttachment(file, currentUser.id)
        setUploading(false)
      }
      const base = { title: title.trim(), description: description.trim(), fromUserId: currentUser.id, isUrgent, attachment, dueDate: dueDate || null }
      // Une tâche (+ notif WhatsApp) par destinataire, par lots de 8.
      for (let i = 0; i < recipients.length; i += 8) {
        const chunk = recipients.slice(i, i + 8)
        await Promise.all(chunk.map(uid => createTask({ ...base, toUserId: uid })))
      }
      onCreated?.()
      onClose()
    } catch (e) {
      setError(e?.message || 'Erreur lors de l\'envoi')
      setSaving(false); setUploading(false)
    }
  }

  const userOptions = [...users]
    .sort((a, b) => (a.full_name || a.username || '').localeCompare(b.full_name || b.username || ''))
    .map(u => ({
      value: u.id,
      label: `👤 ${u.full_name || u.username || u.id.slice(0, 8)}${u.id === currentUser?.id ? ' (moi)' : ''}`,
    }))
  const nbAll = users.filter(u => u.active !== false && u.id !== currentUser?.id).length

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1a0f0a' }}>
            Nouvelle tâche
          </h3>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={lblStyle}>
            À qui ?
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5, marginBottom: 8 }}>
              {[['person', '👤 Personne'], ['multi', '✅ Plusieurs'], ['group', '👥 Groupe'], ['all', '📢 Tout le perso']].map(([k, lab]) => (
                <button key={k} type="button" onClick={() => setMode(k)}
                  style={{ flex: '1 1 45%', padding: '7px 6px', fontSize: 11, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (mode === k ? '#993556' : '#e5d8c3'), background: mode === k ? '#993556' : 'white', color: mode === k ? 'white' : '#4a3a30' }}>{lab}</button>
              ))}
            </div>
            {mode === 'person' && (
              <SearchSelect options={userOptions} value={toUserId} onChange={setToUserId} placeholder="Tape un nom…" inputStyle={{ ...inputStyle }} />
            )}
            {mode === 'multi' && (
              <div>
                <input value={multiSearch} onChange={e => setMultiSearch(e.target.value)} placeholder="Filtrer par nom…" style={inputStyle} />
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e5d8c3', borderRadius: 6, marginTop: 5 }}>
                  {userOptions.filter(o => o.value !== currentUser?.id && o.label.toLowerCase().includes(multiSearch.toLowerCase())).map(o => {
                    const checked = multiIds.includes(o.value)
                    return (
                      <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f0e9dd', fontSize: 13, background: checked ? '#F7E3EA' : 'white' }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setMultiIds(ids => checked ? ids.filter(x => x !== o.value) : [...ids, o.value])}
                          style={{ width: 15, height: 15, accentColor: '#993556' }} />
                        {o.label}
                      </label>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 5 }}>{multiIds.length} sélectionné(s)</div>
              </div>
            )}
            {mode === 'group' && (
              <select value={groupValue} onChange={e => setGroupValue(e.target.value)} style={inputStyle}>
                <option value="">— choisir un groupe —</option>
                {groupes.map(g => <option key={g.nom} value={g.nom}>{g.nom} ({g.profileIds.length})</option>)}
              </select>
            )}
            {mode === 'all' && (
              <div style={{ fontSize: 12, color: '#4a3a30', padding: '8px 10px', background: '#F4F0EA', borderRadius: 6, marginTop: 5 }}>
                📢 Envoyée à <b>tout le personnel</b> ({nbAll} pers.) + notification WhatsApp à chacun.
              </div>
            )}
          </label>

          <label style={lblStyle}>
            Titre <span style={{ color: '#993556' }}>*</span>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex : Vérifier stock farine T55"
              style={inputStyle}
              maxLength={200}
            />
          </label>

          <label style={lblStyle}>
            Description (optionnel)
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Détails supplémentaires…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              maxLength={1000}
            />
          </label>

          <label style={lblStyle}>
            À faire avant (optionnel)
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </label>

          {/* Pièce jointe */}
          <label style={lblStyle}>
            Pièce jointe (optionnel — max 5 MB)
            <input
              type="file"
              onChange={handleFileChange}
              style={{ ...inputStyle, padding: '7px 11px', cursor: 'pointer' }}
            />
            {file && (
              <div style={{
                marginTop: 6, padding: '6px 10px', background: '#F4F0EA',
                borderRadius: 6, fontSize: 11, color: '#4a3a30',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>{file.name}</span>
                <span style={{ color: '#8a7a70' }}>({(file.size / 1024).toFixed(1)} KB)</span>
                <button type="button" onClick={() => setFile(null)} style={{
                  marginLeft: 'auto', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontSize: 14, color: '#993556',
                }}>✕</button>
              </div>
            )}
          </label>

          {/* Case Urgent */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 8,
            cursor: 'pointer', marginBottom: 14
          }}>
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={e => setIsUrgent(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: '#A32D2D', fontWeight: 500 }}>
              Marquer comme urgent
            </span>
          </label>

          {error && (
            <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving} style={btnSecondary}>
              Annuler
            </button>
            <button type="submit" disabled={saving} style={btnPrimary}>
              📤 {uploading ? 'Upload…' : saving ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
}
const modal = {
  background: 'white', borderRadius: 12, padding: 22, maxWidth: 440, width: '100%',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
}
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }
const lblStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 12 }
const inputStyle = {
  display: 'block', width: '100%', padding: '9px 11px', marginTop: 5,
  fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6,
  fontFamily: 'inherit', boxSizing: 'border-box', background: 'white'
}
const btnSecondary = {
  fontSize: 13, padding: '9px 16px', borderRadius: 8,
  border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30'
}
const btnPrimary = {
  fontSize: 13, padding: '9px 16px', borderRadius: 8,
  border: '1px solid #993556', background: '#993556', color: 'white',
  cursor: 'pointer', fontWeight: 500
}
