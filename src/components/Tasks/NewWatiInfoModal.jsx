import { useState, useEffect } from 'react'
import { loadAllUsers } from '../../lib/tasks'
import { sendWatiInfo, loadWatiInfos, loadGroupesPourInfo } from '../../lib/watiInfo'
import SearchSelect from '../SearchSelect'

/**
 * Modal « Wati info » : envoyer une simple information par WhatsApp à 1+ personnes
 * ou un groupe (≠ tâche). Affiche aussi l'historique des dernières infos envoyées.
 */
export default function NewWatiInfoModal({ currentUser, onClose }) {
  const [users, setUsers] = useState([])
  const [mode, setMode] = useState('person')   // 'person' | 'multi' | 'group' | 'all'
  const [toUserId, setToUserId] = useState('')
  const [multiIds, setMultiIds] = useState([])
  const [multiSearch, setMultiSearch] = useState('')
  const [groupValue, setGroupValue] = useState('')
  const [groupes, setGroupes] = useState([])        // [{ nom, profileIds }] depuis Employés
  const [groupCheckedIds, setGroupCheckedIds] = useState([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => { (async () => {
    try {
      const list = await loadAllUsers()
      setUsers(list)
      const firstOther = list.find(u => u.id !== currentUser?.id)
      setToUserId(firstOther?.id || list[0]?.id || '')
    } catch (e) { console.warn('loadAllUsers:', e?.message) }
    loadGroupesPourInfo().then(setGroupes).catch(() => {})
    loadWatiInfos().then(setHistory).catch(() => {})
  })() }, [currentUser?.id])

  // Sélection d'un groupe : pré-coche tous ses membres.
  function selectGroup(nom) {
    setGroupValue(nom)
    const g = groupes.find(x => x.nom === nom)
    setGroupCheckedIds(g ? [...g.profileIds] : [])
  }

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (!message.trim()) { setError('Le message est obligatoire'); return }

    // Liste des destinataires + libellé de la cible (pour l'historique)
    let recipientIds = []
    let cible = ''
    if (mode === 'person') {
      if (!toUserId) { setError('Sélectionne un destinataire'); return }
      recipientIds = [toUserId]
      const u = users.find(x => x.id === toUserId)
      cible = u?.full_name || u?.username || '1 personne'
    } else if (mode === 'multi') {
      recipientIds = multiIds.filter(id => id !== currentUser.id)
      if (!recipientIds.length) { setError('Sélectionne au moins une personne'); return }
      cible = `${recipientIds.length} personnes`
    } else if (mode === 'group') {
      if (!groupValue) { setError('Choisis un groupe'); return }
      recipientIds = groupCheckedIds
      if (!recipientIds.length) { setError('Sélectionne au moins un membre du groupe'); return }
      cible = `Groupe ${groupValue}`
    } else {
      recipientIds = users.filter(u => u.active !== false).map(u => u.id)
      cible = 'Tout le personnel'
    }
    if (!recipientIds.length) { setError('Aucun destinataire trouvé.'); return }

    setSending(true); setError(null); setOkMsg(null)
    try {
      const { sent, total } = await sendWatiInfo({
        message, recipientIds, cible,
        userId: currentUser.id, userName: currentUser.full_name || currentUser.username,
      })
      setOkMsg(`Info envoyée à ${sent}/${total} destinataire(s).`)
      setMessage('')
      loadWatiInfos().then(setHistory).catch(() => {})
    } catch (e) {
      setError(e?.message || "Erreur lors de l'envoi")
    } finally {
      setSending(false)
    }
  }

  const userOptions = [...users]
    .sort((a, b) => (a.full_name || a.username || '').localeCompare(b.full_name || b.username || ''))
    .map(u => ({ value: u.id, label: `👤 ${u.full_name || u.username || u.id.slice(0, 8)}${u.id === currentUser?.id ? ' (moi)' : ''}` }))
  const nbAll = users.filter(u => u.active !== false).length
  const selectedGroup = groupes.find(g => g.nom === groupValue) || null
  const nameOf = id => {
    const u = users.find(x => x.id === id)
    return u?.full_name || u?.username || id.slice(0, 8)
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1a0f0a' }}>📢 Envoyer une info</h3>
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
                  {userOptions.filter(o => o.label.toLowerCase().includes(multiSearch.toLowerCase())).map(o => {
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
              <div>
                <select value={groupValue} onChange={e => selectGroup(e.target.value)} style={inputStyle}>
                  <option value="">— choisir un groupe —</option>
                  {groupes.map(g => <option key={g.nom} value={g.nom}>{g.nom} ({g.profileIds.length})</option>)}
                </select>
                {groupes.length === 0 && (
                  <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 5 }}>
                    Aucun groupe avec des comptes. Assigne un groupe aux employés dans l'onglet Employés.
                  </div>
                )}
                {selectedGroup && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#8a7a70', marginBottom: 4 }}>Membres qui recevront l'info :</div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e5d8c3', borderRadius: 6 }}>
                      {selectedGroup.profileIds.map(id => {
                        const checked = groupCheckedIds.includes(id)
                        return (
                          <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f0e9dd', fontSize: 13, background: checked ? '#F7E3EA' : 'white' }}>
                            <input type="checkbox" checked={checked}
                              onChange={() => setGroupCheckedIds(ids => checked ? ids.filter(x => x !== id) : [...ids, id])}
                              style={{ width: 15, height: 15, accentColor: '#993556' }} />
                            👤 {nameOf(id)}
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 5 }}>{groupCheckedIds.length} / {selectedGroup.profileIds.length} sélectionné(s)</div>
                  </div>
                )}
              </div>
            )}
            {mode === 'all' && (
              <div style={{ fontSize: 12, color: '#4a3a30', padding: '8px 10px', background: '#F4F0EA', borderRadius: 6, marginTop: 5 }}>
                📢 Envoyée à <b>tout le personnel</b> ({nbAll} pers.) par WhatsApp.
              </div>
            )}
          </label>

          <label style={lblStyle}>
            Message <span style={{ color: '#993556' }}>*</span>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Ex : Réunion demain à 9h. Merci d'être à l'heure."
              rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} maxLength={1000} />
          </label>

          {error && <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>{error}</div>}
          {okMsg && <div style={{ padding: '8px 12px', background: '#EAF3DE', color: '#27500A', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>{okMsg}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={sending} style={btnSecondary}>Fermer</button>
            <button type="submit" disabled={sending} style={btnPrimary}>📤 {sending ? 'Envoi…' : 'Envoyer l\'info'}</button>
          </div>
        </form>

        {/* Historique */}
        {history.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid #eee3d6', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0f0a', marginBottom: 8 }}>Infos envoyées</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map(h => (
                <div key={h.id} style={{ fontSize: 12, color: '#4a3a30', background: '#FAF6F0', borderRadius: 6, padding: '7px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{h.cible || '?'}</span>
                    <span style={{ color: '#8a7a70', whiteSpace: 'nowrap' }}>{fmtDate(h.sent_at)}</span>
                  </div>
                  <div style={{ marginTop: 2 }}>{h.message}</div>
                  <div style={{ color: '#8a7a70', fontSize: 10, marginTop: 2 }}>par {h.sender_name || '?'} · {h.recipient_count} dest.</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: 'white', borderRadius: 12, padding: 22, maxWidth: 460, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }
const lblStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 12 }
const inputStyle = { display: 'block', width: '100%', padding: '9px 11px', marginTop: 5, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' }
const btnSecondary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30' }
const btnPrimary = { fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
