import { useState } from 'react'
import { changeMyPassword } from '../lib/users'

export default function ChangePasswordModal({ user, onClose }) {
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPwd !== confirmPwd) {
      setError('Les deux nouveaux mots de passe ne correspondent pas')
      return
    }
    if (newPwd.length < 4) {
      setError('Minimum 4 caractères')
      return
    }

    setSaving(true)
    try {
      const result = await changeMyPassword(user.id, oldPwd, newPwd)
      if (!result?.success) {
        setError(result?.error || 'Le changement de mot de passe a échoué')
        return
      }
      alert('Mot de passe changé ✅')
      onClose()
    } catch (err) {
      setError(err?.message || 'Erreur lors du changement de mot de passe')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
              MON COMPTE
            </div>
            <div className="font-fraunces italic text-[20px] font-medium text-ink">
              Changer mon mot de passe
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          <input
            type="password"
            placeholder="Ancien mot de passe"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            autoFocus
            className="w-full px-3 py-2.5 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
            required
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full px-3 py-2.5 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
            required
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            className="w-full px-3 py-2.5 border border-line bg-cream rounded-lg text-[13px] focus:outline-none focus:border-bordeaux"
            required
          />
          {error && (
            <div className="text-[11px] text-bordeaux font-medium text-center">{error}</div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  )
}