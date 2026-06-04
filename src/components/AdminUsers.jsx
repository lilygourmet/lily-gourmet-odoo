import { useState, useEffect } from 'react'
import {
  loadUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  hardDeleteUser,
  loadTeams,
  createTeam,
  deleteTeam,
  ROLE_LABELS,
  ROLE_COLORS,
  saveNavbarConfig,
} from '../lib/users'
import { ECONOMAT_PROFILS } from '../lib/economat'
import { loadEmployes } from '../lib/hr'
import { navTabsForUser } from '../lib/navTabs'
import NavbarConfigModal from './NavbarConfigModal'

export default function AdminUsers({ currentUser, onClose }) {
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const [employes, setEmployes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [duplicateFromUser, setDuplicateFromUser] = useState(null)
  const [showTeamMgr, setShowTeamMgr] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resetPasswordFor, setResetPasswordFor] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmHardDelete, setConfirmHardDelete] = useState(null)
  const [showNavbarConfigFor, setShowNavbarConfigFor] = useState(null)
  const [collapsedTeams, setCollapsedTeams] = useState({})  // { teamId: true } = replie
  const [showInactive, setShowInactive] = useState(false)   // masquer les désactivés par défaut
  const [userSearch, setUserSearch] = useState('')          // filtre de recherche d'utilisateur
  const [dragOverTeam, setDragOverTeam] = useState(null)
  const [draggedUser, setDraggedUser] = useState(null)

  function toggleTeam(teamId) {
    setCollapsedTeams(prev => ({ ...prev, [teamId]: !prev[teamId] }))
  }

  // Drag & drop : deplacer un user vers une autre equipe
  async function handleDropUserOnTeam(user, newTeamId) {
    const targetId = newTeamId === '__none__' ? null : newTeamId
    if (user.team_id === targetId) return  // pas de changement
    try {
      await updateUser(user.id, { team_id: targetId })
      await refresh()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const [data, teamsData, empData] = await Promise.all([loadUsers(), loadTeams(), loadEmployes(true)])
      setUsers(data || [])
      setTeams(teamsData || [])
      setEmployes((empData || []).slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '')))
      // Au premier chargement seulement : fermer toutes les equipes par defaut.
      // On garde les choix de l'utilisateur sur les refreshs suivants pour ne pas
      // refermer une equipe qu'il vient d'ouvrir.
      setCollapsedTeams(prev => {
        if (Object.keys(prev).length > 0) return prev
        const all = {}
        for (const t of (teamsData || [])) all[t.id] = true
        all['__none__'] = true   // section "sans equipe"
        return all
      })
    } catch (e) {
      console.error('loadUsers error:', e)
      alert(`Erreur de chargement : ${e.message}`)
    }
    setLoading(false)
  }

  async function handleCreateTeam(name) {
    if (!name || !name.trim()) return
    try {
      await createTeam(name)
      await refresh()
    } catch (e) {
      alert(`Erreur création équipe : ${e.message}`)
    }
  }

  async function handleDeleteTeam(teamId) {
    if (!confirm('Supprimer cette équipe ?')) return
    try {
      await deleteTeam(teamId)
      await refresh()
    } catch (e) {
      alert(`Erreur : ${e.message}`)
    }
  }

  async function handleCreate(formData) {
    try {
      await createUser({
        username: formData.username.trim().toLowerCase(),
        password: formData.password,
        full_name: formData.fullName.trim(),
        role: formData.role,
        perm_sync: formData.permSync,
        perm_check: formData.permCheck,
        perm_polys: formData.permPolys,
        perm_delete: formData.permDelete,
        perm_patissier: formData.permPatissier,
        perm_print_batch: formData.permPrintBatch,
        perm_print_single: formData.permPrintSingle,
        perm_recaps: formData.permRecaps,
        perm_define_gm: formData.permDefineGM,
        prod_category: formData.prodCategory,
        perm_prod: formData.permProd,
        perm_sales: formData.permSales,
        team_id: formData.teamId,
        perm_calendar: formData.permCalendar,
        perm_labels: formData.permLabels,
        perm_freezer: formData.permFreezer,
        perm_messages: formData.permMessages,
        perm_etiquettes: formData.permEtiquettes,
        perm_stock_patissier: formData.permStockPatissier,
        perm_stock_cafe: formData.permStockCafe,
        perm_stock_audit: formData.permStockAudit,
        perm_stock_gs: formData.permStockGS,
        perm_vitrine_sale: formData.permVitrineSale,
        perm_caisse: formData.permCaisse,
        perm_caisse_admin: formData.permCaisseAdmin,
        perm_hr: formData.permHR,
        perm_admin_users: formData.permAdminUsers,
        perm_cake_vision: formData.permCakeVision,
        perm_conversations: formData.permConversations,
        perm_modification: formData.permModification,
        perm_mark_payment_proof: formData.permMarkPaymentProof,
        perm_view_payments: formData.permViewPayments,
        perm_validate_payments: formData.permValidatePayments,
        economat_profil: formData.economatProfil || null,
        perm_econome: formData.permEconome,
        whatsapp: formData.whatsapp?.trim() || null,
        employe_id: formData.employe_id || null,
      })
      setShowNewForm(false)
      setDuplicateFromUser(null)
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
        perm_define_gm: formData.permDefineGM,
        prod_category: formData.prodCategory,
        perm_prod: formData.permProd,
        perm_sales: formData.permSales,
        team_id: formData.teamId,
        perm_calendar: formData.permCalendar,
        perm_labels: formData.permLabels,
        perm_freezer: formData.permFreezer,
        perm_messages: formData.permMessages,
        perm_etiquettes: formData.permEtiquettes,
        perm_stock_patissier: formData.permStockPatissier,
        perm_stock_cafe: formData.permStockCafe,
        perm_stock_audit: formData.permStockAudit,
        perm_stock_gs: formData.permStockGS,
        perm_vitrine_sale: formData.permVitrineSale,
        perm_caisse: formData.permCaisse,
        perm_caisse_admin: formData.permCaisseAdmin,
        perm_hr: formData.permHR,
        perm_admin_users: formData.permAdminUsers,
        perm_cake_vision: formData.permCakeVision,
        perm_conversations: formData.permConversations,
        perm_modification: formData.permModification,
        perm_mark_payment_proof: formData.permMarkPaymentProof,
        perm_view_payments: formData.permViewPayments,
        perm_validate_payments: formData.permValidatePayments,
        economat_profil: formData.economatProfil || null,
        perm_econome: formData.permEconome,
        whatsapp: formData.whatsapp?.trim() || null,
        employe_id: formData.employe_id || null,
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
      console.error('[handleDelete]', e)
      alert(`Erreur désactivation : ${e?.message || 'erreur inconnue'}`)
    }
  }

  // Suppression definitive : reservee aux users deja desactives.
  async function handleHardDelete(userId) {
    try {
      await hardDeleteUser(userId)
      setConfirmHardDelete(null)
      await refresh()
    } catch (e) {
      console.error('[handleHardDelete]', e)
      alert(`Erreur suppression : ${e?.message || 'erreur inconnue'}\n\nL'utilisateur peut etre lie a des donnees historiques (commandes faites, logs...). Dans ce cas il faut garder son compte desactive.`)
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

          {/* Boutons ajouter user + gerer equipes */}
          {!loading && !showNewForm && !editingUser && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewForm(true)}
                className="flex-1 px-4 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all flex items-center justify-center gap-2"
              >
                <span>+</span>
                <span>Ajouter utilisateur</span>
              </button>
              <button
                onClick={() => setShowTeamMgr(true)}
                className="px-4 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-cream-warm text-ink border border-line rounded-lg hover:border-bordeaux transition-all"
              >
                Gérer équipes
              </button>
            </div>
          )}

          {/* Form création */}
          {showNewForm && (
            <UserForm
              initialData={duplicateFromUser ? {
                // Copier toutes les permissions sauf username/password/full_name
                ...duplicateFromUser,
                username: '',
                full_name: '',
                id: undefined,
              } : undefined}
              onSubmit={handleCreate}
              onCancel={() => { setShowNewForm(false); setDuplicateFromUser(null) }}
              isNew={true}
              teams={teams}
              employes={employes}
              duplicatedFromName={duplicateFromUser ? (duplicateFromUser.full_name || duplicateFromUser.username) : null}
            />
          )}

          {/* Liste users groupes par equipe */}
          {!loading && !showNewForm && (
            <div className="space-y-4">
              {/* Recherche d'utilisateur (par nom ou identifiant) */}
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="🔍 Chercher un utilisateur (nom ou identifiant)…"
                className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
              />
              {users.some(u => u.active === false) && (
                <button
                  onClick={() => setShowInactive(v => !v)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-line text-ink-soft hover:bg-cream-warm"
                >
                  {showInactive
                    ? '🙈 Masquer les désactivés'
                    : `👁 Voir les désactivés (${users.filter(u => u.active === false).length})`}
                </button>
              )}
              {(() => {
                // Si le viewer n'est pas admin (donc perm_admin_users), masquer les admins
                const isCurrentSuperAdmin = currentUser?.role === 'admin'
                const q = userSearch.trim().toLowerCase()
                const visibleUsers = (isCurrentSuperAdmin
                  ? users
                  : users.filter(u => u.role !== 'admin')
                ).filter(u => showInactive || u.active !== false)
                  .filter(u => !q
                    || (u.full_name || '').toLowerCase().includes(q)
                    || (u.username || '').toLowerCase().includes(q))
                // Grouper users par team_id
                const groups = new Map()
                for (const u of visibleUsers) {
                  const tid = u.team_id || '__none__'
                  if (!groups.has(tid)) groups.set(tid, [])
                  groups.get(tid).push(u)
                }
                // Ordre : teams ordonnés (TOUS, meme vides) + Aucune équipe à la fin
                const orderedTeams = [...teams].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
                const sections = []
                for (const t of orderedTeams) {
                  sections.push({ team: t, users: groups.get(t.id) || [] })
                }
                if (groups.has('__none__')) {
                  sections.push({ team: { id: '__none__', name: 'Sans équipe' }, users: groups.get('__none__') })
                } else {
                  // Toujours montrer la zone "Sans equipe" pour permettre le drop
                  sections.push({ team: { id: '__none__', name: 'Sans équipe' }, users: [] })
                }
                return sections.map(({ team, users: teamUsers }) => {
                  // Pendant une recherche : on cache les équipes sans résultat.
                  if (q && teamUsers.length === 0) return null
                  const isCollapsed = collapsedTeams[team.id]
                  const isDragOver = dragOverTeam === team.id
                  return (
                    <div
                      key={team.id}
                      onDragOver={(e) => { e.preventDefault(); setDragOverTeam(team.id) }}
                      onDragLeave={() => setDragOverTeam(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedUser) handleDropUserOnTeam(draggedUser, team.id)
                        setDragOverTeam(null)
                        setDraggedUser(null)
                      }}
                      className={`rounded-lg ${isDragOver ? 'bg-bordeaux/5 ring-2 ring-bordeaux/30' : ''}`}
                    >
                      <button
                        onClick={() => toggleTeam(team.id)}
                        className="w-full flex items-center gap-2 mb-2 pb-1 border-b border-bordeaux/30 hover:bg-cream-warm/30 px-1 py-1 rounded transition-colors"
                      >
                        <span className="text-[10px] text-ink-mute">{isCollapsed ? '▶' : '▼'}</span>
                        <span className="font-mono text-[11px] tracking-[0.15em] uppercase text-bordeaux font-bold">
                          {team.name}
                        </span>
                        <span className="text-[10px] text-ink-mute">({teamUsers.length})</span>
                      </button>
                      {!isCollapsed && (
                        <div className="space-y-2">
                          {teamUsers.map(u => (
                            <div
                              key={u.id}
                              draggable={editingUser?.id !== u.id}
                              onDragStart={() => setDraggedUser(u)}
                              onDragEnd={() => { setDraggedUser(null); setDragOverTeam(null) }}
                              className={`${draggedUser?.id === u.id ? 'opacity-50' : ''} cursor-move`}
                            >
                              {editingUser?.id === u.id ? (
                                <UserForm
                                  initialData={u}
                                  onSubmit={(data) => handleUpdate(u.id, data)}
                                  onCancel={() => setEditingUser(null)}
                                  isNew={false}
                                  currentUser={currentUser}
                                  teams={teams}
                                  employes={employes}
                                />
                              ) : (
                                <UserCard
                                  user={u}
                                  isCurrentUser={u.id === currentUser?.id}
                                  onEdit={() => setEditingUser(u)}
                                  onResetPassword={() => setResetPasswordFor(u)}
                                  onDelete={() => setConfirmDelete(u)}
                                  onHardDelete={() => setConfirmHardDelete(u)}
                                  onDuplicate={() => { setDuplicateFromUser(u); setShowNewForm(true) }}
                                  onConfigNavbar={() => setShowNavbarConfigFor(u)}
                                />
                              )}
                            </div>
                          ))}
                          {teamUsers.length === 0 && (
                            <div className="text-[10px] text-ink-mute italic py-2 px-2">
                              Glisser un user ici
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}

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

      {/* Modal suppression définitive */}
      {confirmHardDelete && (
        <HardDeleteConfirmModal
          user={confirmHardDelete}
          onClose={() => setConfirmHardDelete(null)}
          onConfirm={() => handleHardDelete(confirmHardDelete.id)}
        />
      )}

      {/* Modal disposition des onglets (pour un utilisateur) */}
      {showNavbarConfigFor && (
        <NavbarConfigModal
          tabs={navTabsForUser(showNavbarConfigFor)}
          config={showNavbarConfigFor.navbar_config}
          onSave={async (cfg) => { await saveNavbarConfig(showNavbarConfigFor.id, cfg); await refresh() }}
          onClose={() => setShowNavbarConfigFor(null)}
        />
      )}

      {/* Modal gestion équipes */}
      {showTeamMgr && (
        <TeamManagerModal
          teams={teams}
          users={users}
          onClose={() => setShowTeamMgr(false)}
          onCreate={handleCreateTeam}
          onDelete={handleDeleteTeam}
        />
      )}
    </div>
  )
}

// ==========================================
// MODAL : GESTION DES EQUIPES
// ==========================================
function TeamManagerModal({ teams, users, onClose, onCreate, onDelete }) {
  const [newName, setNewName] = useState('')

  function countUsers(teamId) {
    return users.filter(u => u.team_id === teamId).length
  }

  return (
    <div className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md p-5 shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-fraunces italic text-[20px] text-ink mb-3">Gestion des équipes</h3>

        {/* Liste équipes */}
        <div className="space-y-1 mb-4 max-h-[40vh] overflow-y-auto">
          {teams.length === 0 ? (
            <p className="text-[12px] text-ink-mute italic">Aucune équipe</p>
          ) : teams.map(t => {
            const count = countUsers(t.id)
            return (
              <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-cream-warm rounded border border-line/60">
                <div>
                  <span className="text-[13px] font-medium text-ink">{t.name}</span>
                  <span className="text-[10px] text-ink-mute ml-2">({count} user{count !== 1 ? 's' : ''})</span>
                </div>
                <button
                  onClick={() => onDelete(t.id)}
                  className="w-6 h-6 rounded-full text-ink-mute hover:bg-bordeaux/10 hover:text-bordeaux transition-colors text-[14px]"
                  title={count > 0 ? "Les users de cette équipe redeviendront 'sans équipe'" : "Supprimer"}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>

        {/* Ajout */}
        <div className="flex gap-2 pt-3 border-t border-line">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nom de la nouvelle équipe"
            className="flex-1 px-3 py-2 text-[12px] border border-line rounded-lg bg-cream-warm focus:outline-none focus:border-bordeaux"
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) {
                onCreate(newName)
                setNewName('')
              }
            }}
          />
          <button
            onClick={() => { if (newName.trim()) { onCreate(newName); setNewName('') } }}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-bordeaux text-cream rounded-lg text-[11px] disabled:opacity-50 hover:bg-bordeaux-deep"
          >
            Ajouter
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full py-2 border border-line rounded-full text-[12px] text-ink-soft hover:bg-cream-warm"
        >
          Fermer
        </button>
      </div>
    </div>
  )
}

// ==========================================
// CARTE UTILISATEUR
// ==========================================

function UserCard({ user, isCurrentUser, onEdit, onResetPassword, onDelete, onHardDelete, onDuplicate, onConfigNavbar }) {
  const perms = []
  if (user.perm_sync) perms.push('Sync')
  if (user.perm_check) perms.push('Cocher')
  if (user.perm_polys) perms.push('Polys')
  if (user.perm_delete) perms.push('Supprimer')
  if (user.perm_patissier) perms.push('Accessoires')
  if (user.perm_print_batch) perms.push('Imprimer batch')
  if (user.perm_print_single) perms.push('Imprimer 1 cmd')
  if (user.perm_recaps) perms.push('Recaps ventes')
  if (user.perm_define_gm) perms.push('Définir GM')
  if (user.perm_prod) perms.push('Vue Prod')
  if (user.perm_sales) perms.push('Vue Salés')

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
        <button
          onClick={onConfigNavbar}
          className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded hover:bg-cream-warm transition-all"
          title="Choisir quels onglets cet utilisateur voit et leur ordre"
        >
          ⚙️ Onglets
        </button>
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded hover:bg-cream-warm transition-all"
            title="Créer un nouvel utilisateur avec les mêmes permissions"
          >
            ⎘ Dupliquer
          </button>
        )}
        {!isCurrentUser && user.active !== false && (
          <button
            onClick={onDelete}
            className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-bordeaux border border-bordeaux rounded hover:bg-bordeaux hover:text-cream transition-all inline-flex items-center gap-1"
          >
            <i className="ti ti-user-off text-[12px]" aria-hidden="true"></i>
            Désactiver
          </button>
        )}
        {!isCurrentUser && user.active === false && (
          <>
            <span className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-ink-mute border border-line rounded inline-flex items-center gap-1">
              <i className="ti ti-user-off text-[12px]" aria-hidden="true"></i>
              Désactivé
            </span>
            <button
              onClick={onHardDelete}
              className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase text-[#A03333] border border-[#A03333] rounded hover:bg-[#A03333] hover:text-cream transition-all inline-flex items-center gap-1"
              title="Suppression définitive"
            >
              <i className="ti ti-trash text-[12px]" aria-hidden="true"></i>
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ==========================================
// FORMULAIRE (création + édition)
// ==========================================

function UserForm({ onSubmit, onCancel, initialData, isNew, teams = [], employes = [], duplicatedFromName = null, currentUser = null }) {
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
    permDefineGM: initialData?.perm_define_gm || false,
    prodCategory: initialData?.prod_category || null,
    permProd: initialData?.perm_prod || false,
    permSales: initialData?.perm_sales || false,
    teamId: initialData?.team_id || null,
    permCalendar: initialData?.perm_calendar !== undefined ? initialData.perm_calendar : false,
    permLabels: initialData?.perm_labels !== undefined ? initialData.perm_labels : false,
    permFreezer: initialData?.perm_freezer !== undefined ? initialData.perm_freezer : false,
    permMessages: initialData?.perm_messages !== undefined ? initialData.perm_messages : false,
    permEtiquettes: initialData?.perm_etiquettes !== undefined ? initialData.perm_etiquettes : false,
    permStockPatissier: initialData?.perm_stock_patissier !== undefined ? initialData.perm_stock_patissier : false,
    permStockCafe: initialData?.perm_stock_cafe !== undefined ? initialData.perm_stock_cafe : false,
    permStockAudit: initialData?.perm_stock_audit !== undefined ? initialData.perm_stock_audit : false,
    permStockGS: initialData?.perm_stock_gs !== undefined ? initialData.perm_stock_gs : false,
    permVitrineSale: initialData?.perm_vitrine_sale !== undefined ? initialData.perm_vitrine_sale : false,
    permCaisse: initialData?.perm_caisse !== undefined ? initialData.perm_caisse : false,
    permCaisseAdmin: initialData?.perm_caisse_admin !== undefined ? initialData.perm_caisse_admin : false,
    permHR: initialData?.perm_hr !== undefined ? initialData.perm_hr : false,
    permAdminUsers: initialData?.perm_admin_users !== undefined ? initialData.perm_admin_users : false,
    permCakeVision: initialData?.perm_cake_vision !== undefined ? initialData.perm_cake_vision : false,
    permConversations: initialData?.perm_conversations !== undefined ? initialData.perm_conversations : false,
    permModification: initialData?.perm_modification !== undefined ? initialData.perm_modification : false,
    permMarkPaymentProof: initialData?.perm_mark_payment_proof !== undefined ? initialData.perm_mark_payment_proof : false,
    permViewPayments: initialData?.perm_view_payments !== undefined ? initialData.perm_view_payments : false,
    permValidatePayments: initialData?.perm_validate_payments !== undefined ? initialData.perm_validate_payments : false,
    economatProfil: initialData?.economat_profil || '',
    permEconome: initialData?.perm_econome !== undefined ? initialData.perm_econome : false,
    whatsapp: initialData?.whatsapp || '',
    employe_id: initialData?.employe_id ?? '',
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
        {isNew ? (duplicatedFromName ? `Dupliqué de ${duplicatedFromName}` : 'Nouvel utilisateur') : 'Modifier'}
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

      {/* Nom complet — choisi dans la liste des employés (lie aussi le user à l'employé) */}
      <div>
        <label className="block text-[11px] font-medium text-ink-soft mb-1">
          Nom complet (choisir l'employé)
        </label>
        <select
          value={formData.employe_id || ''}
          onChange={e => {
            const newId = e.target.value ? Number(e.target.value) : ''
            const emp = employes.find(x => x.id === newId)
            setFormData(prev => ({
              ...prev,
              employe_id: newId === '' ? null : newId,
              fullName: emp ? emp.nom : prev.fullName,
              whatsapp: emp?.telephone ? emp.telephone : prev.whatsapp,
            }))
          }}
          className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux"
        >
          <option value="">— Choisir un employé —</option>
          {employes.map(e => (
            <option key={e.id} value={e.id}>
              {e.nom}{e.poste ? ` · ${e.poste}` : ''}{e.telephone ? ` · ${e.telephone}` : ''}
            </option>
          ))}
        </select>
        {/* Champ texte de repli (si le nom doit différer ou si pas d'employé lié) */}
        <input
          type="text"
          value={formData.fullName}
          onChange={e => update('fullName', e.target.value)}
          placeholder="Nom complet affiché (modifiable si besoin)"
          className="w-full mt-2 px-3 py-2 text-[12px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
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
        <div className="flex gap-2 flex-wrap">
          <RoleButton
            label="Utilisateur"
            active={formData.role === 'user'}
            onClick={() => update('role', 'user')}
          />
          {currentUser?.role === 'admin' && (
            <RoleButton
              label="Admin"
              active={formData.role === 'admin'}
              onClick={() => update('role', 'admin')}
            />
          )}
          <RoleButton
            label="Récap"
            active={formData.role === 'recap'}
            onClick={() => update('role', 'recap')}
          />
          <RoleButton
            label="Livreur"
            active={formData.role === 'livreur'}
            onClick={() => update('role', 'livreur')}
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
          {(isAdmin || formData.permCalendar) && <>
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
          </>}
          <PermCheckbox
            id="perm-patissier"
            label="🧁 Mode Accessoires (voit uniquement les GM)"
            checked={isAdmin || formData.permPatissier}
            onChange={v => update('permPatissier', v)}
          />
          {(isAdmin || formData.permCalendar) && <>
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
          </>}
          <PermCheckbox
            id="perm-recaps"
            label="📊 Voir les récaps de ventes"
            checked={isAdmin || formData.permRecaps}
            onChange={v => update('permRecaps', v)}
          />
          <PermCheckbox
            id="perm-labels"
            label="🏷️ Imprimer les étiquettes CD (Zebra)"
            checked={isAdmin || formData.permLabels}
            onChange={v => update('permLabels', v)}
          />
          <PermCheckbox
            id="perm-freezer"
            label="❄️ Voir liste sortie congélateur"
            checked={isAdmin || formData.permFreezer}
            onChange={v => update('permFreezer', v)}
          />
          <PermCheckbox
            id="perm-messages"
            label="💌 Voir l'onglet Messages"
            checked={isAdmin || formData.permMessages}
            onChange={v => update('permMessages', v)}
          />
          <PermCheckbox
            id="perm-conversations"
            label="📱 Voir les Conversations WhatsApp"
            checked={isAdmin || formData.permConversations}
            onChange={v => update('permConversations', v)}
          />
          <PermCheckbox
            id="perm-modification"
            label="✏️ Traiter les Modifications de commande"
            checked={isAdmin || formData.permModification}
            onChange={v => update('permModification', v)}
          />
          <PermCheckbox
            id="perm-etiquettes"
            label="🏷 Voir l'onglet Étiquettes (Entremets/GS/Surgelés)"
            checked={isAdmin || formData.permEtiquettes}
            onChange={v => update('permEtiquettes', v)}
          />
          <PermCheckbox
            id="perm-cake-vision"
            label="📸 Voir la Galerie CD"
            checked={isAdmin || formData.permCakeVision}
            onChange={v => update('permCakeVision', v)}
          />
          <PermCheckbox
            id="perm-mark-payment-proof"
            label="💰 Marquer une preuve de paiement"
            checked={isAdmin || formData.permMarkPaymentProof}
            onChange={v => update('permMarkPaymentProof', v)}
          />
          <PermCheckbox
            id="perm-view-payments"
            label="👁 Voir les paiements à valider"
            checked={isAdmin || formData.permViewPayments}
            onChange={v => update('permViewPayments', v)}
          />
          <PermCheckbox
            id="perm-validate-payments"
            label="✅ Valider les paiements"
            checked={isAdmin || formData.permValidatePayments}
            onChange={v => update('permValidatePayments', v)}
          />
          <PermCheckbox
            id="perm-stock-patissier"
            label="🥐 Voir l'onglet Vitrine (saisie pâtissier)"
            checked={isAdmin || formData.permStockPatissier}
            onChange={v => update('permStockPatissier', v)}
          />
          <PermCheckbox
            id="perm-vitrine-sale"
            label="🥟 Voir l'onglet Vitrine Salé"
            checked={isAdmin || formData.permVitrineSale}
            onChange={v => update('permVitrineSale', v)}
          />
          <PermCheckbox
            id="perm-stock-cafe"
            label="📦 Voir Réception Vitrine + Fin de journée (équipe café)"
            checked={isAdmin || formData.permStockCafe}
            onChange={v => update('permStockCafe', v)}
          />
          <PermCheckbox
            id="perm-stock-audit"
            label="📊 Voir l'onglet Stock (audit + historique)"
            checked={isAdmin || formData.permStockAudit}
            onChange={v => update('permStockAudit', v)}
          />
          <PermCheckbox
            id="perm-stock-gs"
            label="🥪 Voir l'onglet Stock GS- (sous-vue salés)"
            checked={isAdmin || formData.permStockGS}
            onChange={v => update('permStockGS', v)}
          />
          {currentUser?.role === 'admin' && (
            <PermCheckbox
              id="perm-caisse"
              label="💰 Caisse (vue limitée — pour Meriem)"
              checked={isAdmin || formData.permCaisse}
              onChange={v => update('permCaisse', v)}
            />
          )}
          {currentUser?.role === 'admin' && (
            <PermCheckbox
              id="perm-caisse-admin"
              label="💰 Caisse · Admin (accès complet au module)"
              checked={isAdmin || formData.permCaisseAdmin}
              onChange={v => update('permCaisseAdmin', v)}
            />
          )}
          {currentUser?.role === 'admin' && (
            <PermCheckbox
              id="perm-hr"
              label="🏢 RH (gestion employés sans salaire, attestations limitées, récap pointage)"
              checked={isAdmin || formData.permHR}
              onChange={v => update('permHR', v)}
            />
          )}
          {currentUser?.role === 'admin' && (
            <PermCheckbox
              id="perm-admin-users"
              label="👑 Super-admin permissions (gère les utilisateurs sans accès Caisse/RH)"
              checked={isAdmin || formData.permAdminUsers}
              onChange={v => update('permAdminUsers', v)}
            />
          )}
          <PermCheckbox
            id="perm-define-gm"
            label="✏️ Définir les détails GM"
            checked={isAdmin || formData.permDefineGM}
            onChange={v => update('permDefineGM', v)}
          />
        </div>

        {/* Vue Production : 3 checkboxes (calendrier + prod + sales) */}
        <div className="mt-3 pt-3 border-t border-line">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">Vue production</div>
          <div className="flex flex-col gap-1">
            <PermCheckbox
              id="perm-calendar"
              label="📅 Calendrier"
              checked={isAdmin || formData.permCalendar}
              onChange={v => update('permCalendar', v)}
            />
            <PermCheckbox
              id="perm-prod"
              label="🥐 Production (E-, MI-, V-)"
              checked={isAdmin || formData.permProd}
              onChange={v => update('permProd', v)}
            />
            <PermCheckbox
              id="perm-sales"
              label="🥪 Salés (SA-, SAK-, GS-)"
              checked={isAdmin || formData.permSales}
              onChange={v => update('permSales', v)}
            />
          </div>
        </div>

        {/* Equipe (dropdown) */}
        <div className="mt-3 pt-3 border-t border-line">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">Équipe</div>
          <select
            value={formData.teamId || ''}
            onChange={e => update('teamId', e.target.value || null)}
            className="w-full px-3 py-2 border border-line rounded-lg text-[12px] bg-cream-warm focus:outline-none focus:border-bordeaux"
          >
            <option value="">— Aucune équipe —</option>
            {(teams || []).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Numéro WhatsApp (pour recevoir les notifs de tâches) */}
        <div className="mt-3 pt-3 border-t border-line">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">Numéro WhatsApp (notifs de tâches)</div>
          <input
            type="text"
            value={formData.whatsapp}
            onChange={e => update('whatsapp', e.target.value)}
            placeholder="ex. 0661114878"
            className="w-full px-3 py-2 border border-line rounded-lg text-[12px] bg-cream-warm focus:outline-none focus:border-bordeaux"
          />
          {formData.employe_id && (
            <div className="text-[10px] text-ink-mute mt-1">
              Pré-rempli depuis l'employé lié. Modifie ici si le WhatsApp diffère.
            </div>
          )}
        </div>

        {/* Économat : profil (ouvre les catégories) + économe (reçoit les demandes) */}
        <div className="mt-3 pt-3 border-t border-line">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">Économat (demandes d'articles)</div>
          <select
            value={formData.economatProfil || ''}
            onChange={e => update('economatProfil', e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-[12px] bg-cream-warm focus:outline-none focus:border-bordeaux mb-2"
          >
            <option value="">— Aucun profil (pas d'accès) —</option>
            {ECONOMAT_PROFILS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <PermCheckbox
            id="perm-econome"
            label="📥 Économe (reçoit les demandes d'articles)"
            checked={formData.permEconome}
            onChange={v => update('permEconome', v)}
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
          Désactiver cet utilisateur ?
        </div>
        <div className="text-[13px] text-ink-soft mb-4 leading-snug">
          <span className="font-medium text-ink">{user.full_name || user.username}</span>
          <br />
          <span className="text-[11px] text-ink-mute italic">
            Le compte sera désactivé et ne pourra plus se connecter. Tu peux le réactiver
            plus tard en éditant l'utilisateur (case « Compte actif »). L'historique est préservé.
          </span>
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
            Désactiver
          </button>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// Modal confirmation suppression DEFINITIVE
// (utilisee pour un user deja desactive)
// ==========================================
function HardDeleteConfirmModal({ user, onClose, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-[#A03333] p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-fraunces italic text-[18px] font-medium text-[#A03333] mb-2">
          ⚠ Supprimer définitivement ?
        </div>
        <div className="text-[13px] text-ink-soft mb-4 leading-snug">
          <span className="font-medium text-ink">{user.full_name || user.username}</span>
          <br />
          <span className="text-[11px] text-ink-mute italic">
            Le compte sera supprimé de la base. Cette action est <strong>irréversible</strong>.
            Si l'utilisateur a des données historiques liées (commandes, logs...), la
            suppression peut échouer — dans ce cas, garde le compte désactivé.
          </span>
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
            className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-[#A03333] text-cream rounded-lg hover:bg-[#7a2525] transition-all"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

