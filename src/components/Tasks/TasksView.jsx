import { useState, useEffect, useMemo } from 'react'
import {
  loadTasksReceived, loadTasksSent, countUnreadTasks,
  markTaskRead, deleteTask, loadTeamTasks
} from '../../lib/tasks'
import TaskDetailModal from './TaskDetailModal'
import NewTaskModal from './NewTaskModal'
import { Trash2, Paperclip } from 'lucide-react'

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
]

function monthKey(isoDateString) {
  if (!isoDateString) return ''
  const d = new Date(isoDateString)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

function monthLabel(yyyymm) {
  if (!yyyymm) return ''
  const [y, m] = yyyymm.split('-')
  return MONTHS_FR[parseInt(m, 10) - 1] + ' ' + y
}

function fmtDate(isoString, withTime = true) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    })
  } catch { return isoString }
}

export default function TasksView({ user }) {
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [filter, setFilter] = useState('todo')
  const [detailTask, setDetailTask] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const isAdmin = user?.role === 'admin'
  const [teamTasks, setTeamTasks] = useState(null)
  const [teamStatus, setTeamStatus] = useState('todo')
  const [teamPerson, setTeamPerson] = useState('all')

  useEffect(() => { reload(true) }, [user?.id])

  // Charge les tâches de l'équipe quand on ouvre l'onglet Équipe (admin)
  useEffect(() => {
    if (filter === 'team' && isAdmin && teamTasks === null) {
      loadTeamTasks().then(setTeamTasks).catch(e => { console.error('team tasks:', e); setTeamTasks([]) })
    }
  }, [filter, isAdmin, teamTasks])

  async function reload(showInitialToast = false) {
    if (!user?.id) return
    setLoading(true)
    try {
      const [r, s] = await Promise.all([
        loadTasksReceived(user.id),
        loadTasksSent(user.id),
      ])
      setReceived(r)
      setSent(s)
      if (showInitialToast) {
        const unread = r.filter(t => t.status === 'todo' && !t.is_read).length
        const urgent = r.filter(t => t.status === 'todo' && !t.is_read && t.is_urgent).length
        if (unread > 0) {
          setToastMsg(
            `Tu as ${unread} nouvelle${unread > 1 ? 's' : ''} tâche${unread > 1 ? 's' : ''}` +
            (urgent > 0 ? ` dont ${urgent} urgente${urgent > 1 ? 's' : ''}` : '')
          )
          setShowToast(true)
          setTimeout(() => setShowToast(false), 5000)
        }
      }
      if (teamTasks !== null) {
        loadTeamTasks().then(setTeamTasks).catch(() => {})
      }
    } catch (e) {
      console.error('reload tasks:', e)
    }
    setLoading(false)
  }

  async function openTask(task) {
    if (task.to_user_id === user.id && task.status === 'todo' && !task.is_read) {
      try { await markTaskRead(task.id) } catch (e) { console.warn('markTaskRead:', e?.message) }
    }
    setDetailTask({ ...task, is_read: true, read_at: task.read_at || new Date().toISOString() })
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('Supprimer cette tâche ? (action irréversible)')) return
    try {
      await deleteTask(taskId, user.id, isAdmin)
      reload()
    } catch (e) {
      alert(e?.message || 'Erreur suppression')
    }
  }

  const todoCount  = received.filter(t => t.status === 'todo').length
  const doneCount  = received.filter(t => t.status === 'done').length
  const unreadCount = received.filter(t => t.status === 'todo' && !t.is_read).length
  const sentCount  = sent.length

  const filteredList = useMemo(() => {
    let list
    if (filter === 'sent') list = sent
    else list = received.filter(t => t.status === filter)

    list = [...list].sort((a, b) => {
      if (a.is_urgent !== b.is_urgent) return b.is_urgent - a.is_urgent
      if (filter === 'todo') {
        const ra = a.is_read ? 1 : 0
        const rb = b.is_read ? 1 : 0
        if (ra !== rb) return ra - rb
      }
      return new Date(b.sent_at) - new Date(a.sent_at)
    })
    return list
  }, [filter, received, sent])

  const byMonth = useMemo(() => {
    const map = {}
    filteredList.forEach(t => {
      const k = monthKey(t.sent_at)
      if (!map[k]) map[k] = []
      map[k].push(t)
    })
    return map
  }, [filteredList])

  const sortedMonths = useMemo(() => Object.keys(byMonth).sort((a, b) => b.localeCompare(a)), [byMonth])

  return (
    <div style={{ padding: '20px 16px 72px', maxWidth: '42rem', margin: '0 auto' }}>
      {showToast && (
        <div style={{
          background: '#FCEEE8', border: '1px solid #993556', padding: '10px 14px',
          borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#993556',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          {toastMsg}
          <button onClick={() => setShowToast(false)} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            cursor: 'pointer', color: '#993556', fontSize: 14
          }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: '#1a0f0a' }}>
            Tâches à faire
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4a3a30' }}>
            {todoCount} à faire {unreadCount > 0 && (
              <span style={{ color: '#993556', fontWeight: 500 }}>
                ({unreadCount} non lue{unreadCount > 1 ? 's' : ''})
              </span>
            )} · {doneCount} terminées
          </p>
        </div>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          Nouvelle tâche
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={filter === 'todo'} onClick={() => setFilter('todo')}>
          À faire ({todoCount})
        </Chip>
        <Chip active={filter === 'done'} onClick={() => setFilter('done')}>
          Terminées ({doneCount})
        </Chip>
        {isAdmin && (
          <Chip active={filter === 'team'} onClick={() => setFilter('team')}>
            👥 Équipe
          </Chip>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <Chip active={filter === 'sent'} onClick={() => setFilter('sent')}>
            Envoyées par moi ({sentCount})
          </Chip>
        </span>
      </div>

      {loading && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>
      )}
      {filter === 'team' && (
        <TeamPanel
          teamTasks={teamTasks}
          teamStatus={teamStatus} setTeamStatus={setTeamStatus}
          teamPerson={teamPerson} setTeamPerson={setTeamPerson}
          currentUserId={user.id}
          onOpen={openTask}
          onDelete={handleDeleteTask}
        />
      )}

      {!loading && filter !== 'team' && filteredList.length === 0 && (
        <div style={{
          padding: 28, textAlign: 'center', color: '#4a3a30',
          background: '#F9F6F1', borderRadius: 8, fontSize: 13
        }}>
          Aucune tâche dans cette catégorie.
        </div>
      )}
      {!loading && filter !== 'team' && sortedMonths.map(m => {
        const list = byMonth[m]
        const urgents = list.filter(t => t.is_urgent && t.status !== 'done').length
        return (
          <div key={m}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: '#4a3a30',
              margin: '14px 0 8px', padding: '0 4px', textTransform: 'capitalize'
            }}>
              {monthLabel(m)} · {list.length}
              {urgents > 0 && (
                <span style={{ color: '#A32D2D', marginLeft: 8 }}>
                  · {urgents} urgent{urgents > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 8,
              marginBottom: 14
            }}>
              {list.map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  currentUserId={user.id}
                  onClick={() => openTask(t)}
                  onDelete={(t.from_user_id === user.id || isAdmin) ? () => handleDeleteTask(t.id) : null}
                />
              ))}
            </div>
          </div>
        )
      })}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          currentUserId={user.id}
          onClose={() => setDetailTask(null)}
          onActionDone={reload}
        />
      )}
      {showNew && (
        <NewTaskModal
          currentUser={user}
          onClose={() => setShowNew(false)}
          onCreated={reload}
        />
      )}
    </div>
  )
}

// Vue admin : tâches de toute l'équipe, groupées par personne (destinataire).
function TeamPanel({ teamTasks, teamStatus, setTeamStatus, teamPerson, setTeamPerson, currentUserId, onOpen, onDelete }) {
  if (teamTasks === null) {
    return <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>
  }

  const peopleMap = {}
  for (const t of teamTasks) {
    const id = t.to_user_id
    if (!id) continue
    if (!peopleMap[id]) peopleMap[id] = { id, name: t.to_user?.full_name || t.to_user?.username || '?', todo: 0, done: 0 }
    if (t.status === 'done') peopleMap[id].done++
    else peopleMap[id].todo++
  }
  const people = Object.values(peopleMap).sort((a, b) => b.todo - a.todo || a.name.localeCompare(b.name))

  const visible = teamTasks.filter(t => {
    if (teamPerson !== 'all' && t.to_user_id !== teamPerson) return false
    if (teamStatus === 'todo') return t.status === 'todo'
    if (teamStatus === 'done') return t.status === 'done'
    return true
  })
  const groups = {}
  for (const t of visible) {
    const id = t.to_user_id || 'none'
    if (!groups[id]) groups[id] = []
    groups[id].push(t)
  }
  const groupIds = Object.keys(groups).sort((a, b) => (peopleMap[b]?.todo || 0) - (peopleMap[a]?.todo || 0))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={teamPerson} onChange={e => setTeamPerson(e.target.value)}
                style={{ padding: '8px 11px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8, background: 'white', cursor: 'pointer' }}>
          <option value="all">Tout le monde</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.todo} à faire)</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          <Chip active={teamStatus === 'todo'} onClick={() => setTeamStatus('todo')}>À faire</Chip>
          <Chip active={teamStatus === 'done'} onClick={() => setTeamStatus('done')}>Faites</Chip>
          <Chip active={teamStatus === 'all'} onClick={() => setTeamStatus('all')}>Toutes</Chip>
        </div>
      </div>

      {visible.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 8, fontSize: 13 }}>
          Aucune tâche.
        </div>
      )}

      {groupIds.map(id => {
        const list = groups[id]
        const p = peopleMap[id]
        return (
          <div key={id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a0f0a', margin: '8px 4px' }}>
              {p?.name || '—'} <span style={{ fontWeight: 400, color: '#8a7a70', fontSize: 12 }}>· {p?.todo || 0} à faire · {p?.done || 0} faites</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {list.map(t => (
                <TaskCard key={t.id} task={t} currentUserId={currentUserId} onClick={() => onOpen(t)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskCard({ task, currentUserId, onClick, onDelete }) {
  const isSent = task.from_user_id === currentUserId && task.to_user_id !== currentUserId
  const isSentToSelf = task.from_user_id === currentUserId && task.to_user_id === currentUserId
  const isReceived = task.to_user_id === currentUserId
  const isDone = task.status === 'done'
  const wasEdited = (task.edited_count || 0) > 0
  const hasAttachment = !!task.attachment_path
  const isOverdue = task.due_date && !isDone && task.due_date < new Date().toISOString().slice(0, 10)
  const dueLabel = task.due_date ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''

  const fromName = task.from_user?.full_name || task.from_user?.username || '?'
  const toName   = task.to_user?.full_name   || task.to_user?.username   || '?'

  let borderColor = '#E5C0B6', leftColor = '#993556'
  if (isSent && !isSentToSelf) { borderColor = '#B5D4F4'; leftColor = '#378ADD' }
  if (isDone) { borderColor = '#C8E0AC'; leftColor = '#97C459' }
  if (task.is_urgent && !isDone) { leftColor = '#E24B4A' }
  // Bordure orangée si modifiée et pas faite
  if (wasEdited && !isDone) { borderColor = '#F0C97A' }

  let statusBadge
  if (isDone) {
    statusBadge = isSent && !isSentToSelf
      ? <Badge bg="#EAF3DE" col="#27500A">Faite par {toName}</Badge>
      : <Badge bg="#EAF3DE" col="#27500A">Fait</Badge>
  } else if (isSent && !isSentToSelf) {
    statusBadge = task.is_read
      ? <Badge bg="#E6F1FB" col="#0C447C">Lue par {toName}</Badge>
      : <Badge bg="#E6F1FB" col="#0C447C">Envoyée</Badge>
  } else {
    statusBadge = <Badge bg="#FCEEE8" col="#993556">À faire</Badge>
  }

  let footer
  if (isSent && !isSentToSelf) {
    if (isDone)            footer = <>Faite le {fmtDate(task.done_at)}</>
    else if (task.is_read) footer = <>Lue le {fmtDate(task.read_at)}</>
    else                   footer = <>Pour <strong>{toName}</strong> · {fmtDate(task.sent_at)}</>
  } else {
    if (isDone)            footer = <>De <strong>{fromName}</strong> · fait {fmtDate(task.done_at)}</>
    else                   footer = <>De <strong>{fromName}</strong> · {fmtDate(task.sent_at)}</>
  }

  const titleStyle = isDone && !isSent
    ? { textDecoration: 'line-through', color: '#4a3a30' }
    : {}

  const unreadDot = (isReceived || isSentToSelf) && !task.is_read && !isDone

  return (
    <div onClick={onClick} style={{
      position: 'relative',
      background: 'white', borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
      border: `1px solid ${borderColor}`, borderLeft: `4px solid ${leftColor}`,
      boxShadow: '0 4px 12px rgba(122,42,68,.06)',
      opacity: isDone ? 0.75 : 1,
      transition: 'transform 0.1s',
    }}
    onMouseDown={e => e.currentTarget.style.transform = 'translateY(0)'}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>

      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Supprimer la tâche"
          style={{
            position: 'absolute', top: 6, right: 6, width: 24, height: 24,
            borderRadius: 6, border: '1px solid #e5d8c3', background: 'white',
            cursor: 'pointer', fontSize: 12, lineHeight: 1, color: '#A32D2D',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><Trash2 size={13} strokeWidth={1.8} /></button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap', paddingRight: onDelete ? 28 : 0 }}>
        {statusBadge}
        {task.is_urgent && !isDone && (
          <Badge bg="#FCEBEB" col="#A32D2D">Urgent</Badge>
        )}
        {wasEdited && !isDone && (
          <Badge bg="#FFF1DA" col="#8A5A00">Modifiée</Badge>
        )}
        {hasAttachment && (
          <Badge bg="#F4F0EA" col="#4a3a30"><Paperclip size={11} strokeWidth={1.8} /> Pièce jointe</Badge>
        )}
        {task.due_date && (
          isOverdue
            ? <Badge bg="#FCEBEB" col="#A32D2D">En retard ({dueLabel})</Badge>
            : <Badge bg="#F4F0EA" col="#4a3a30">Avant le {dueLabel}</Badge>
        )}
        {(isReceived || isSentToSelf) && task.is_read && !isDone && (
          <Badge bg="#FFF6E5" col="#7A5510">Lu</Badge>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3, color: '#1a0f0a', ...titleStyle }}>
        {unreadDot && (
          <span style={{
            display: 'inline-block', width: 7, height: 7,
            borderRadius: '50%', background: '#993556', marginRight: 6
          }} />
        )}
        {task.title}
      </div>

      <div style={{ fontSize: 11, color: '#4a3a30' }}>
        {footer}
      </div>
    </div>
  )
}

function Badge({ bg, col, children }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 999,
      background: bg, color: col, fontWeight: 500, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 3
    }}>
      {children}
    </span>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
    }}>{children}</button>
  )
}

const btnPrimary = {
  padding: '11px 18px', fontSize: 13, fontWeight: 600,
  background: '#993556', color: '#faf7f2', border: '1px solid #993556',
  borderRadius: 10, cursor: 'pointer'
}
