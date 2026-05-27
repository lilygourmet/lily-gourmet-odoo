import { useState } from 'react'
import {
  markTaskDone, undoTaskDone, updateTask,
  getAttachmentURL, uploadTaskAttachment
} from '../../lib/tasks'

/**
 * Modal de détail d'une tâche.
 * Mode "lecture" + mode "édition" (expéditeur sur tâche non faite)
 */
export default function TaskDetailModal({ task: initialTask, currentUserId, onClose, onActionDone }) {
  const [task, setTask] = useState(initialTask)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title || '')
  const [editDesc, setEditDesc] = useState(task.description || '')
  const [editUrgent, setEditUrgent] = useState(!!task.is_urgent)
  const [editFile, setEditFile] = useState(null)
  const [removeAttachment, setRemoveAttachment] = useState(false)

  const isSent = task.from_user_id === currentUserId && task.to_user_id !== currentUserId
  const isSentToSelf = task.from_user_id === currentUserId && task.to_user_id === currentUserId
  const isReceived = task.to_user_id === currentUserId
  const isDone = task.status === 'done'
  const canUndo = isDone && task.from_user_id === currentUserId
  // Expéditeur peut modifier une tâche non faite
  const canEdit = !isDone && task.from_user_id === currentUserId
  const wasEdited = (task.edited_count || 0) > 0

  const fromName = task.from_user?.username || task.from_user?.full_name || '?'
  const toName   = task.to_user?.username   || task.to_user?.full_name   || '?'

  async function handleDone() {
    setSaving(true); setError(null)
    try {
      await markTaskDone(task.id)
      onActionDone?.()
      onClose()
    } catch (e) {
      setError(e?.message || 'Erreur')
      setSaving(false)
    }
  }

  async function handleUndo() {
    if (!confirm('Remettre cette tâche à faire ?')) return
    setSaving(true); setError(null)
    try {
      await undoTaskDone(task.id, currentUserId)
      onActionDone?.()
      onClose()
    } catch (e) {
      setError(e?.message || 'Erreur')
      setSaving(false)
    }
  }

  async function handleDownloadAttachment() {
    try {
      const url = await getAttachmentURL(task.attachment_path)
      if (url) window.open(url, '_blank')
    } catch (e) {
      setError('Impossible de télécharger : ' + (e.message || e))
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    setError(null)
    if (!f) { setEditFile(null); return }
    if (f.size > 5 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 5 MB)')
      e.target.value = ''
      return
    }
    setEditFile(f)
    setRemoveAttachment(false)
  }

  async function handleSaveEdit() {
    if (!editTitle.trim()) { setError('Le titre est obligatoire'); return }
    setSaving(true); setError(null)
    try {
      const updates = {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        is_urgent: editUrgent,
      }
      // Si nouveau fichier : upload + remplacement
      if (editFile) {
        const newAttachment = await uploadTaskAttachment(editFile, currentUserId)
        updates.attachment_path = newAttachment.path
        updates.attachment_name = newAttachment.name
        updates.attachment_size = newAttachment.size
        updates.attachment_type = newAttachment.type
        updates._replaceAttachment = true   // signal pour supprimer l'ancien
      } else if (removeAttachment) {
        updates._removeAttachment = true
      }
      await updateTask(task.id, currentUserId, updates)
      // Mettre à jour l'affichage local
      setTask(t => ({
        ...t,
        ...updates,
        edited_count: (t.edited_count || 0) + 1,
        edited_at: new Date().toISOString(),
        is_read: false,
        read_at: null,
      }))
      setEditMode(false)
      setEditFile(null)
      setRemoveAttachment(false)
      onActionDone?.()
    } catch (e) {
      setError(e?.message || 'Erreur')
    }
    setSaving(false)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditTitle(task.title || '')
    setEditDesc(task.description || '')
    setEditUrgent(!!task.is_urgent)
    setEditFile(null)
    setRemoveAttachment(false)
    setError(null)
  }

  // Badge statut
  let statusBadge
  if (isDone) {
    statusBadge = <Badge bg="#EAF3DE" col="#27500A">✓ Fait</Badge>
  } else if (task.is_read) {
    statusBadge = <Badge bg="#FFF6E5" col="#7A5510">👁 Lu</Badge>
  } else {
    statusBadge = <Badge bg="#FCEEE8" col="#993556">⏳ À faire</Badge>
  }

  // Méta lignes
  const metaLines = []
  if (isReceived) {
    metaLines.push(<>De <strong>{fromName}</strong> · envoyé {fmtDate(task.sent_at)}</>)
    if (task.read_at) metaLines.push(<>👁 Tu l'as lue le {fmtDate(task.read_at)}</>)
    if (task.done_at) metaLines.push(<>✓ Faite le {fmtDate(task.done_at)}</>)
    if (wasEdited && task.edited_at) {
      metaLines.push(<><span style={{ color: '#A32D2D' }}>⚠️ Modifiée le {fmtDate(task.edited_at)}{task.edited_count > 1 ? ` (${task.edited_count} fois)` : ''}</span></>)
    }
  } else {
    metaLines.push(<>Envoyée à <strong>{toName}</strong> · {fmtDate(task.sent_at)}</>)
    if (task.read_at) metaLines.push(<>👁 Lue par {toName} le {fmtDate(task.read_at)}</>)
    if (task.done_at) metaLines.push(<>✓ Faite le {fmtDate(task.done_at)}</>)
    if (wasEdited && task.edited_at) {
      metaLines.push(<>✏️ Dernière modification : {fmtDate(task.edited_at)}{task.edited_count > 1 ? ` (${task.edited_count} fois)` : ''}</>)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {statusBadge}
            {task.is_urgent && <Badge bg="#FCEBEB" col="#A32D2D">⚠️ Urgent</Badge>}
            {wasEdited && <Badge bg="#FFF1DA" col="#8A5A00">⚠️ Modifiée</Badge>}
          </div>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        {!editMode ? (
          <>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 500, color: '#1a0f0a' }}>
              {task.title}
            </h3>

            <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 14, lineHeight: 1.7 }}>
              {metaLines.map((line, i) => <div key={i}>{line}</div>)}
            </div>

            {task.description && (
              <div style={{
                padding: '10px 12px', background: '#F9F6F1', borderRadius: 8,
                fontSize: 13, marginBottom: 14, lineHeight: 1.6, color: '#1a0f0a',
                whiteSpace: 'pre-wrap',
              }}>
                {task.description}
              </div>
            )}

            {/* Pièce jointe (visible par destinataire ET expéditeur) */}
            {task.attachment_path && task.attachment_name && (
              <div style={{
                padding: '10px 12px', background: '#F4F0EA', borderRadius: 8,
                marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>📎</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#1a0f0a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.attachment_name}
                  </div>
                  {task.attachment_size && (
                    <div style={{ fontSize: 10, color: '#8a7a70' }}>
                      {(task.attachment_size / 1024).toFixed(1)} KB
                    </div>
                  )}
                </div>
                <button onClick={handleDownloadAttachment} style={{
                  padding: '6px 12px', fontSize: 12, background: '#993556', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
                }}>
                  ⬇ Ouvrir
                </button>
              </div>
            )}

            {error && (
              <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            {/* Bouton Marquer fait */}
            {!isDone && (isReceived || isSentToSelf) && (
              <>
                <button onClick={handleDone} disabled={saving} style={btnSuccess}>
                  ✓ {saving ? 'Enregistrement…' : 'Marquer comme fait'}
                </button>
                {isSent && !isSentToSelf && (
                  <div style={{ marginTop: 8, fontSize: 10, color: '#8a7a70', textAlign: 'center' }}>
                    {fromName} recevra une notification
                  </div>
                )}
              </>
            )}

            {/* Bouton Modifier : expéditeur sur tâche non faite */}
            {canEdit && (
              <button onClick={() => setEditMode(true)} style={btnEdit}>
                ✏️ Modifier la tâche
              </button>
            )}

            {/* Bouton Défaire */}
            {canUndo && (
              <>
                <button onClick={handleUndo} disabled={saving} style={btnUndo}>
                  ↩ Défaire (remettre à faire)
                </button>
                <div style={{ marginTop: 8, fontSize: 10, color: '#8a7a70', textAlign: 'center' }}>
                  Seul l'expéditeur peut défaire
                </div>
              </>
            )}

            <button onClick={onClose} style={btnClose2}>
              Fermer
            </button>
          </>
        ) : (
          // ════ MODE ÉDITION ════
          <>
            <div style={{
              padding: '8px 12px', background: '#FFF1DA', color: '#8A5A00',
              borderRadius: 6, fontSize: 11, marginBottom: 14,
            }}>
              ✏️ Modification de la tâche — {toName} sera prévenu(e) que la tâche a été modifiée.
            </div>

            <label style={lblStyle}>
              Titre <span style={{ color: '#993556' }}>*</span>
              <input
                type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                style={inputStyle} maxLength={200} autoFocus
              />
            </label>

            <label style={lblStyle}>
              Description
              <textarea
                value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                maxLength={1000}
              />
            </label>

            {/* Pièce jointe existante */}
            {task.attachment_path && task.attachment_name && !removeAttachment && !editFile && (
              <div style={{
                padding: '8px 10px', background: '#F4F0EA', borderRadius: 6,
                marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              }}>
                <span>📎 {task.attachment_name}</span>
                <button type="button" onClick={() => setRemoveAttachment(true)} style={{
                  marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#993556', fontSize: 12,
                }}>
                  🗑 Supprimer
                </button>
              </div>
            )}
            {removeAttachment && (
              <div style={{
                padding: '8px 10px', background: '#FCEEE8', color: '#A32D2D',
                borderRadius: 6, marginBottom: 12, fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>🗑 Pièce jointe sera supprimée</span>
                <button type="button" onClick={() => setRemoveAttachment(false)} style={{
                  marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#993556',
                }}>Annuler</button>
              </div>
            )}

            <label style={lblStyle}>
              📎 {task.attachment_path ? 'Remplacer la pièce jointe' : 'Pièce jointe'} (max 5 MB)
              <input
                type="file" onChange={handleFileChange}
                style={{ ...inputStyle, padding: '7px 11px', cursor: 'pointer' }}
              />
              {editFile && (
                <div style={{
                  marginTop: 6, padding: '6px 10px', background: '#EAF3DE',
                  borderRadius: 6, fontSize: 11, color: '#27500A',
                }}>
                  📄 Nouveau : {editFile.name} ({(editFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </label>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 8,
              cursor: 'pointer', marginBottom: 14
            }}>
              <input type="checkbox" checked={editUrgent} onChange={e => setEditUrgent(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: '#A32D2D', fontWeight: 500 }}>⚠️ Urgent</span>
            </label>

            {error && (
              <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancelEdit} disabled={saving} style={{ ...btnClose2, flex: 1, marginTop: 0 }}>
                Annuler
              </button>
              <button onClick={handleSaveEdit} disabled={saving} style={{ ...btnSuccess, flex: 1 }}>
                {saving ? 'Enregistrement…' : '✓ Enregistrer modifications'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Badge({ bg, col, children }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 999,
      background: bg, color: col, fontWeight: 500, whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  )
}

function fmtDate(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return isoString }
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
}
const modal = {
  background: 'white', borderRadius: 12, padding: 22, maxWidth: 480, width: '100%',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
}
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#8a7a70' }
const btnSuccess = {
  width: '100%', padding: '10px 14px', fontSize: 13,
  background: '#97C459', color: 'white', border: '1px solid #97C459',
  borderRadius: 8, cursor: 'pointer', fontWeight: 500
}
const btnEdit = {
  width: '100%', padding: '10px 14px', fontSize: 13, marginTop: 8,
  background: 'white', color: '#1a0f0a', border: '1px solid #e5d8c3',
  borderRadius: 8, cursor: 'pointer', fontWeight: 500,
}
const btnUndo = {
  width: '100%', padding: '10px 14px', fontSize: 13, marginTop: 8,
  background: 'white', color: '#993556', border: '1px solid #993556',
  borderRadius: 8, cursor: 'pointer'
}
const btnClose2 = {
  marginTop: 12, width: '100%', padding: '8px 14px', fontSize: 12,
  background: 'white', border: '1px solid #e5d8c3', borderRadius: 8, cursor: 'pointer',
  color: '#4a3a30'
}
const lblStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#1a0f0a', marginBottom: 12 }
const inputStyle = {
  display: 'block', width: '100%', padding: '9px 11px', marginTop: 5,
  fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6,
  fontFamily: 'inherit', boxSizing: 'border-box', background: 'white'
}
