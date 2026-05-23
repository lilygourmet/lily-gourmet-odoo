import { useState } from 'react'
import { markTaskDone, undoTaskDone } from '../lib/tasks'

/**
 * Modal de détail d'une tâche.
 * Props :
 *  - task : la tâche complète (avec from_user, to_user)
 *  - currentUserId : id du user connecté
 *  - onClose() : fermer
 *  - onActionDone() : recharge appelé après mark done / undo
 */
export default function TaskDetailModal({ task, currentUserId, onClose, onActionDone }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const isSent = task.from_user_id === currentUserId && task.to_user_id !== currentUserId
  const isSentToSelf = task.from_user_id === currentUserId && task.to_user_id === currentUserId
  const isReceived = task.to_user_id === currentUserId
  const isDone = task.status === 'done'
  // L'expéditeur peut défaire (et le sender_to_self est aussi expéditeur)
  const canUndo = isDone && task.from_user_id === currentUserId

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

  // Statut badge
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
  } else {
    metaLines.push(<>Envoyée à <strong>{toName}</strong> · {fmtDate(task.sent_at)}</>)
    if (task.read_at) metaLines.push(<>👁 Lue par {toName} le {fmtDate(task.read_at)}</>)
    if (task.done_at) metaLines.push(<>✓ Faite le {fmtDate(task.done_at)}</>)
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {statusBadge}
            {task.is_urgent && <Badge bg="#FCEBEB" col="#A32D2D">⚠️ Urgent</Badge>}
          </div>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 500, color: '#3A3733' }}>
          {task.title}
        </h3>

        <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 14, lineHeight: 1.7 }}>
          {metaLines.map((line, i) => <div key={i}>{line}</div>)}
        </div>

        {task.description && (
          <div style={{
            padding: '10px 12px', background: '#F9F6F1', borderRadius: 8,
            fontSize: 13, marginBottom: 14, lineHeight: 1.6, color: '#3A3733'
          }}>
            {task.description}
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Bouton Marquer fait : destinataire seulement, et pas encore fait */}
        {!isDone && (isReceived || isSentToSelf) && (
          <>
            <button onClick={handleDone} disabled={saving} style={btnSuccess}>
              ✓ {saving ? 'Enregistrement…' : 'Marquer comme fait'}
            </button>
            {isSent && !isSentToSelf && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#9B968D', textAlign: 'center' }}>
                {fromName} recevra une notification
              </div>
            )}
          </>
        )}

        {/* Bouton Défaire : expéditeur d'une tâche faite */}
        {canUndo && (
          <>
            <button onClick={handleUndo} disabled={saving} style={btnUndo}>
              ↩ Défaire (remettre à faire)
            </button>
            <div style={{ marginTop: 8, fontSize: 10, color: '#9B968D', textAlign: 'center' }}>
              Seul l'expéditeur peut défaire
            </div>
          </>
        )}

        <button onClick={onClose} style={{
          marginTop: 12, width: '100%', padding: '8px 14px', fontSize: 12,
          background: 'white', border: '1px solid #E8E2D8', borderRadius: 8, cursor: 'pointer',
          color: '#6F6A60'
        }}>
          Fermer
        </button>
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
  } catch {
    return isoString
  }
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
}
const modal = {
  background: 'white', borderRadius: 12, padding: 22, maxWidth: 440, width: '100%',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
}
const btnClose = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B968D' }
const btnSuccess = {
  width: '100%', padding: '10px 14px', fontSize: 13,
  background: '#97C459', color: 'white', border: '1px solid #97C459',
  borderRadius: 8, cursor: 'pointer', fontWeight: 500
}
const btnUndo = {
  width: '100%', padding: '10px 14px', fontSize: 13,
  background: 'white', color: '#993556', border: '1px solid #993556',
  borderRadius: 8, cursor: 'pointer'
}
