import { useState, useEffect } from 'react'
import { loadUsers, createUser, updateUser, resetUserPassword, deleteUser, ROLE_LABELS, ROLE_COLORS } from '../lib/users'

export default function AdminUsers({ currentUser, onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [resetPasswordFor, setResetPasswordFor] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    loadUsers().then(data => {
      setUsers(data)
      setLoading(false)
    })
  }, [])

  async function refresh() {
    const data = await loadUsers()
    setUsers(data)
  }

  async function handleCreate(formData) {
    const result = await createUser(
      formData.username,
      formData.password,
      formData.fullName,
      formData.role
    )
    if (!result.success) {
      alert(`Erreur : ${result.error}`)
      return
    }
    setShowNewForm(false)
    await refresh()
  }

  async function handleUpdate(userId, formData) {
    const result = await updateUser(userId, formData.fullName, formData.role, formData.active)
    if (!result.success) {
      alert(`Erreur : ${result.error}`)
      return
    }
    setEditingId(null)
    await refresh()
  }

  async function handleResetPassword(userId, newPassword) {
    const result = await resetUserPassword(userId, newPassword)
    if (!result.success) {
      alert(`Erreur : ${result.error}`)
      return
    }
    setResetPasswordFor(null)
    alert('Mot de passe réinitialisé ✅')
  }

  async function handleDelete(userId) {
    const result = await deleteUser(userId)
    if (!result.success) {
      alert(`Erreur : ${result.error}`)
      return
    }
    setConfirmDelete(null)
    await refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-line"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
              ADMINISTRATION
            </div>
            <div className="font-fraunces italic text-[22px] font-medium text-ink leading-tight">
              Gestion des utilisateurs
            </div>
            <div className="text-[11px] text-ink-mute mt-1">{users.length} compte{users.length > 1 ? 's' : ''}</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full py-2.5 text-[11px] font-medium tracking-wider uppercase text-bordeaux border border-bordeaux border-dashed rounded-lg hover:bg-bordeaux hover:text-cream transition-all"
            >
              + Nouvel employé
            </button>
          ) : (
            <UserForm
              onCancel={() => setShowNewForm(false)}
              onSave={handleCreate}
              isNew
            />
          )}

          {loading ? (
            <div className="text-center text-ink-mute italic py-8">Chargement...</div>
          ) : (
            users.map(u => (
              <div key={u.id} className={`rounded-lg border p-3 ${u.active ? 'bg-cream border-line/60' : 'bg-cream-warm border-line/40 opacity-60'}`}>
                {editingId === u.id ? (
                  <UserForm
                    user={u}
                    onCancel={() => setEditingId(null)}
                    onSave={(data) => handleUpdate(u.id, data)}
                  />
                ) : resetPasswordFor === u.id ? (
                  <ResetPasswordForm
                    user={u}
                    onCancel={() => setResetPasswordFor(null)}
                    onSave={(pwd) => handleResetPassword(u.id, pwd)}
                  />
                ) : confirmDelete === u.id ? (
                  <div className="rounded-lg border border-bordeaux bg-bordeaux/5 p-3">
                    <div className="text-[13px] text-ink mb-3">
                      Supprimer définitivement <strong>{u.username}</strong> ?
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 px-3 py-2 text-[11px] font-medium uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm"
                      >
                        Non
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="flex-1 px-3 py-2 text-[11px] font-medium uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep"
                      >
                        Oui supprimer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[12px] text-bordeaux font-semibold">{u.username}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                        {!u.active && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-ink-mute/20 text-ink-mute font-mono uppercase">
                            Désactivé
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-ink mt-0.5">{u.full_name}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingId(u.id)}
                        className="w-8 h-8 rounded-full border border-line hover:border-bordeaux hover:text-bordeaux flex items-center justify-center text-[14px]"
                        title="Modifier"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setResetPasswordFor(u.id)}
                        className="w-8 h-8 rounded-full border border-line hover:border-bordeaux hover:text-bordeaux flex items-center justify-center text-[12px]"
                        title="Réinitialiser mot de passe"
                      >
                        🔑
                      </button>
                      {u.id !== currentUser.id && (
                        <button
                          onClick={() => setConfirmDelete(u.id)}
                          className="w-8 h-8 rounded-full border border-line hover:border-bordeaux hover:bg-bordeaux hover:text-cream flex items-center justify-center text-[12px]"
                          title="Supprimer"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function UserForm({ user, onCancel, onSave, isNew }) {
  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [role, setRole] = useState(user?.role || 'user')
  const [active, setActive] = useState(user?.active ?? true)

  function handleSubmit(e) {
    e.preventDefault()
    if (isNew && (!username || !password || !fullName)) {
      alert('Tous les champs sont requis')
      return
    }
    if (!fullName) {
      alert('Nom complet requis')
      return
    }
    onSave(isNew
      ? { username, password, fullName, role }
      : { fullName, role, active }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {isNew && (
        <>
          <input
            type="text"
            placeholder="Nom d'utilisateur (ex: fatima)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            className="w-full px-3 py-2 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
            required
          />
          <input
            type="text"
            placeholder="Mot de passe initial"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
            required
          />
        </>
      )}
      <input
        type="text"
        placeholder="Nom complet"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full px-3 py-2 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
        required
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="w-full px-3 py-2 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
      >
        <option value="user">User — étapes uniquement</option>
        <option value="admin">Admin — polys + décocher</option>
        <option value="admin_plus">Admin+ — import + suppression</option>
        <option value="super_admin">Super Admin — gestion users</option>
      </select>
      {!isNew && (
        <label className="flex items-center gap-2 text-[12px] text-ink-soft py-1">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Compte actif
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-[11px] font-medium uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="flex-1 px-3 py-2 text-[11px] font-medium uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep"
        >
          {isNew ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

function ResetPasswordForm({ user, onCancel, onSave }) {
  const [pwd, setPwd] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (pwd) onSave(pwd) }} className="space-y-2">
      <div className="text-[12px] text-ink-soft">
        Nouveau mot de passe pour <strong>{user.username}</strong>
      </div>
      <input
        type="text"
        placeholder="Nouveau mot de passe"
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
        autoFocus
        className="w-full px-3 py-2 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
        required
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-[11px] font-medium uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="flex-1 px-3 py-2 text-[11px] font-medium uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep"
        >
          Réinitialiser
        </button>
      </div>
    </form>
  )
}