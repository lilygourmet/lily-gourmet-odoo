import { useState, useEffect } from 'react'
import {
  loadUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  ROLE_LABELS,
  ROLE_COLORS,
} from '../lib/users'

export default function AdminUsers({ currentUser, onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resetPasswordFor, setResetPasswordFor] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const data = await loadUsers()
      setUsers(data || [])
    } catch (e) {
      console.error('loadUsers error:', e)
      alert(`Erreur de chargement : ${e.message}`)
    }
    setLoading(false)
  }

  async function handleCreate(formData) {
    try {
      await createUser({
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
        fullName: formData.fullName.trim(),
        role: formData.role,
        perm_sync: formData.permSync,
        perm_check: formData.permCheck,
        perm_polys: formData.permPolys,
        perm_delete: formData.permDelete,
        perm_patissier: formData.permPatissier,
        perm_print_batch: formData.permPrintBatch,
        perm_print_single: formData.permPrintSingle,
        perm_recaps: formData.permRecaps,
      })
      setShowNewForm(false)
      await refresh()
    } catch (e) {
      alert(`Erreur création : ${e.message}`)
    }
  }

  async function handleUpdate(userId, formData) {
    try {
      await updateUser(userId, {
        username: formData.username.trim(),
        full_name: formData.fullName.trim(),
        role: formData.role,
        active: formData.active,
        perm_sync: formData.permSync,
        perm_check: formData.permCheck,
        perm_polys: formData.permPolys,
        perm_delete: formData.permDelete,
        perm_patissier: formData.permPatissier,
        perm_print_batch: formData.permPrintBatch,
        perm_print_single: formData.permPrintSingle,
        perm_recaps: formData.permRecaps,
      })
      setEditingUser(null)
      await refresh()
    } catch (e) {
      alert(`Erreur modification : ${e.message}`)
    }
  }

  async function handleResetPassword(userId, newPassword) {
    try {
      await resetUserPassword(userId, newPassword)
      setResetPasswordFor(null)
      alert('Mot de passe réinitialisé ✅')
    } catch (e) {
      alert(`Erreur : ${e.message}`)
    }
  }

  async function handleDelete(userId) {
    try {
      await deleteUser(userId)
      setConfirmDelete(null)
      await refresh()
    } catch (e) {
      alert(`Erreur suppression : ${e.message}`)
    }
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
        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
              ADMIN
            </div>
            <div className="font-fraunces italic text-[22px] font-medium text-ink leading-tight">
              Gestion des utilisateurs
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-3">
          {loading && (
            <div className="text-center text-ink-mute italic py-4">
              Chargement...
            </div>
          )}

          {/* Bouton ajouter user */}
          {!loading && !showNewForm && !editingUser && (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full px-4 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all flex items-center justify-center gap-2"
            >
              <span>+</span>
              <span>Ajouter un utilisateur</span>
            </button>
          )}

          {/* Form création */}
          {showNewForm && (
            <UserForm
              onSubmit={handleCreate}
              onCancel={() => setShowNewForm(false)}
              isNew={true}
            />
          )}

          {/* Liste users */}
          {!loading && !showNewForm && (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id}>
                  {editingUser?.id === u.id ? (
                    <UserForm
                      initialData={u}
                      onSubmit={(data) => handleUpdate(u.id, data)}
                      onCancel={() => setEditingUser(null)}
                      isNew={false}
                    />
                  ) : (
                    <UserCard
                      user={u}
                      isCurrentUser={u.id === currentUser?.id}
                      onEdit={() => setEditingUser(u)}
                      onResetPassword={() => setResetPasswordFor(u)}
                      onDelete={() => setConfirmDelete(u)}
                    />
                  )}
                </div>
              ))}

              {users.length === 0 && (
                <div className="text-center text-ink-mute italic py-4">
                  Aucun utilisateur
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal reset password */}
      {resetPasswordFor && (
        <ResetPasswordModal
          user={resetPasswordFor}
          onClose={() => setResetPasswordFor(null)}
          onConfirm={(newPwd) => handleResetPassword(resetPasswordFor.id, newPwd)}
        />
      )}

      {/* Modal confirmation suppression */}
      {confirmDelete && (
        <DeleteConfirmModal
          user={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete.id)}
        />
      )}
    </div>
  )
}

// ==========================================
// CARTE UTILISATEUR
// ==========================================

function UserCard({ user, isCurrentUser, onEdit, onResetPassword, onDelete }) {
  const perms = []
  if (user.perm_sync) perms.push('Sync')
  if (user.perm_check) perms.push('Cocher')
  if (user.perm_polys) perms.push('Polys')
  if (user.perm_delete) perms.push('Supprimer')
  if (user.perm_patissier) perms.push('Patissier')
  if (user.perm_print_batch) perms.push('Imprimer batch')
  if (user.perm_print_single) perms.push('Imprimer 1 cmd')
  if (user.perm_recaps) perms.push('Recaps ventes')

  return (
    <div className={`rounded-lg border p-3 transition-all ${user.active ? 'border-line/60 bg-cream' : 'border-line/40 bg-cream-warm opacity-60'}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[14px] text-ink">
              {user.full_name || user.username}
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${ROLE_COLORS[user.role] || 'bg-line/20 text-ink-mute'}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
            {!user.active && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-ink-mute/20 text-ink-mute">
                Inactif
              </span>
            )}
            {isCurrentUser && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-gold/20 text-chocolate">
                Vous
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-ink-soft mt-0.5">
            @{user.username}
          </div>
          {perms.length > 0 && user.role !== 'admin' && (
            <div className="text-[10px] text-ink-mute mt-1.5">
              Permissions : {perms.join(' · ')}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={onEdit}
          className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded hover:bg-cream-warm transition-all"
        >
          Modifier
        </button>
        <button
          onClick={onResetPassword}
          className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded hover:bg-cream-warm transition-all"
        >
          🔑 Reset MDP
        </button>
        {!isCurrentUser && (
          <button
            onClick={onDelete}
            className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-bordeaux border border-bordeaux rounded hover:bg-bordeaux hover:text-cream transition-all"
          >
            ✕ Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

// ==========================================
// FORMULAIRE (création + édition)
// ==========================================

function UserForm({ onSubmit, onCancel, initialData, isNew }) {
  const [formData, setFormData] = useState({
    username: initialData?.username || '',
    fullName: initialData?.full_name || '',
    password: '',
    role: initialData?.role || 'user',
    active: initialData?.active !== false,
    permSync: initialData?.perm_sync || false,
    permCheck: initialData?.perm_check !== false,
    permPolys: initialData?.perm_polys !== false,
    permDelete: initialData?.perm_delete || false,
    permPatissier: initialData?.perm_patissier || false,
    permPrintBatch: initialData?.perm_print_batch || false,
    permPrintSingle: initialData?.perm_print_single || false,
    permRecaps: initialData?.perm_recaps || false,
  })

  function handleSubmit() {
    if (isNew) {
      if (!formData.username.trim()) {
        alert('Le nom d\'utilisateur est requis')
        return
      }
      if (!formData.fullName.trim()) {
        alert('Le nom complet est requis')
        return
      }
      if (!formData.password || formData.password.length < 4) {
        alert('Le mot de passe doit faire au moins 4 caractères')
        return
      }
    }
    onSubmit(formData)
  }

  function update(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const isAdmin = formData.role === 'admin'

  return (
    <div className="rounded-lg border border-bordeaux bg-bordeaux/5 p-4 space-y-3">
      <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-bordeaux font-semibold mb-1">
        {isNew ? 'Nouveau utilisateur' : 'Modifier'}
      </div>

      {/* Username (uniquement à la création) */}
      {isNew && (
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">
            Nom d'utilisateur (login)
          </label>
          <input
            type="text"
            value={formData.username}
            onChange={e => update('username', e.target.value)}
            placeholder="ex: marie"
            autoComplete="off"
            className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux"
          />
        </div>
      )}

      {/* Nom complet */}
      <div>
        <label className="block text-[11px] font-medium text-ink-soft mb-1">
          Nom complet
        </label>
        <input
          type="text"
          value={formData.fullName}
          onChange={e => update('fullName', e.target.value)}
          placeholder="ex: Marie Dupont"
          className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux"
        />
      </div>

      {/* Password (uniquement à la création) */}
      {isNew && (
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">
            Mot de passe
          </label>
          <input
            type="text"
            value={formData.password}
            onChange={e => update('password', e.target.value)}
            placeholder="Au moins 4 caractères"
            autoComplete="new-password"
            className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux"
          />
          <div className="text-[10px] text-ink-mute mt-1">
            (Pour changer le MDP plus tard, utilise "Reset MDP")
          </div>
        </div>
      )}

      {/* Rôle */}
      <div>
        <label className="block text-[11px] font-medium text-ink-soft mb-1.5">
          Rôle
        </label>
        <div className="flex gap-2">
          <RoleButton
            label="Utilisateur"
            active={formData.role === 'user'}
            onClick={() => update('role', 'user')}
          />
          <RoleButton
            label="Admin"
            active={formData.role === 'admin'}
            onClick={() => update('role', 'admin')}
          />
        </div>
      </div>

      {/* Active (uniquement édition) */}
      {!isNew && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`active-${initialData?.id}`}
            checked={formData.active}
            onChange={e => update('active', e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor={`active-${initialData?.id}`} className="text-[12px] text-ink">
            Compte actif
          </label>
        </div>
      )}

      {/* Permissions */}
      <div>
        <label className="block text-[11px] font-medium text-ink-soft mb-1.5">
          Permissions {isAdmin && <span className="text-ink-mute italic">(admin = tout autorisé)</span>}
        </label>
        <div className={`space-y-2 ${isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
          <PermCheckbox
            id="perm-sync"
            label="🔄 Synchroniser depuis Odoo"
            checked={isAdmin || formData.permSync}
            onChange={v => update('permSync', v)}
          />
          <PermCheckbox
            id="perm-check"
            label="✅ Cocher les étapes (Couvert / Fini / Rangé)"
            checked={isAdmin || formData.permCheck}
            onChange={v => update('permCheck', v)}
          />
          <PermCheckbox
            id="perm-polys"
            label="📏 Choisir la taille des polys"
            checked={isAdmin || formData.permPolys}
            onChange={v => update('permPolys', v)}
          />
          <PermCheckbox
            id="perm-delete"
            label="🗑 Supprimer une commande"
            checked={isAdmin || formData.permDelete}
            onChange={v => update('permDelete', v)}
          />
          <PermCheckbox
            id="perm-patissier"
            label="👨‍🍳 Mode Patissier (voit uniquement les GM)"
            checked={isAdmin || formData.permPatissier}
            onChange={v => update('permPatissier', v)}
          />
          <PermCheckbox
            id="perm-print-batch"
            label="🖨️ Imprimer toutes les commandes (batch)"
            checked={isAdmin || formData.permPrintBatch}
            onChange={v => update('permPrintBatch', v)}
          />
          <PermCheckbox
            id="perm-print-single"
            label="🖨️ Imprimer une commande seule"
            checked={isAdmin || formData.permPrintSingle}
            onChange={v => update('permPrintSingle', v)}
          />
          <PermCheckbox
            id="perm-recaps"
            label="📊 Voir les récaps de ventes"
            checked={isAdmin || formData.permRecaps}
            onChange={v => update('permRecaps', v)}
          />
        </div>
      </div>

      {/* Boutons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all"
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all"
        >
          {isNew ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

function RoleButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase rounded-lg transition-all ${active ? 'bg-bordeaux text-cream' : 'bg-cream text-ink-soft border border-line hover:border-bordeaux'}`}
    >
      {label}
    </button>
  )
}

function PermCheckbox({ id, label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      <label htmlFor={id} className="text-[12px] text-ink leading-snug">
        {label}
      </label>
    </div>
  )
}

// ==========================================
// MODALE RESET PASSWORD
// ==========================================

function ResetPasswordModal({ user, onClose, onConfirm }) {
  const [newPassword, setNewPassword] = useState('')

  function handleSubmit() {
    if (!newPassword || newPassword.length < 4) {
      alert('Le mot de passe doit faire au moins 4 caractères')
      return
    }
    onConfirm(newPassword)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-line p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-fraunces italic text-[18px] font-medium text-ink mb-1">
          Nouveau mot de passe
        </div>
        <div className="text-[12px] text-ink-soft mb-4">
          Pour <span className="font-mono text-bordeaux">@{user.username}</span>
        </div>

        <input
          type="text"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="Nouveau mot de passe"
          autoComplete="new-password"
          className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all"
          >
            Réinitialiser
          </button>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// MODALE CONFIRMATION SUPPRESSION
// ==========================================

function DeleteConfirmModal({ user, onClose, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-bordeaux p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-fraunces italic text-[18px] font-medium text-ink mb-2">
          Supprimer cet utilisateur ?
        </div>
        <div className="text-[13px] text-ink-soft mb-4 leading-snug">
          <span className="font-medium text-ink">{user.full_name || user.username}</span>
          <br />
          <span className="text-[11px] text-ink-mute italic">Cette action est irréversible.</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}
