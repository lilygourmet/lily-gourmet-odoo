import { useState, useEffect } from 'react'
import { setTabLockCode, tabLockStatus } from '../lib/tabLock'
import { touchIdAvailable, touchIdRegistered, registerTouchId, clearTouchId, platformAuthAvailable } from '../lib/touchId'
import { toast } from '../lib/toast'

// Écran admin : définir / changer le code des onglets Caisse & RH.
export default function TabLockSettingsModal({ onClose }) {
  const [isSet, setIsSet] = useState(null)
  const [current, setCurrent] = useState('')
  const [code, setCode] = useState('')
  const [code2, setCode2] = useState('')
  const [busy, setBusy] = useState(false)
  const [touchReg, setTouchReg] = useState(touchIdRegistered())

  useEffect(() => { tabLockStatus().then(r => setIsSet(!!r.isSet)).catch(() => setIsSet(false)) }, [])

  async function toggleTouchId() {
    if (touchReg) { clearTouchId(); setTouchReg(false); toast.success('Touch ID désactivé sur cet appareil'); return }
    if (!(await platformAuthAvailable())) {
      toast.error('Ce Mac/navigateur ne propose pas Touch ID pour les sites. Essaie Safari ou Chrome à jour, avec Touch ID activé sur le Mac.')
      return
    }
    try { await registerTouchId(); setTouchReg(true); toast.success('Touch ID activé sur cet appareil ✓') }
    catch (e) {
      const n = e?.name || ''
      if (n === 'NotAllowedError') toast.error('Touch ID annulé (ou expiré). Réessaie et valide avec ton doigt.')
      else toast.error('Touch ID impossible : ' + (n || e?.message || 'erreur') + '.')
    }
  }

  async function save() {
    if (isSet && !current) { toast.error('Entre l\'ancien code d\'abord.'); return }
    if (code.length < 4) { toast.error('Code trop court (4 chiffres minimum).'); return }
    if (code !== code2) { toast.error('Les deux codes ne correspondent pas.'); return }
    setBusy(true)
    try {
      await setTabLockCode(code, current)
      toast.success('Code enregistré ✓')
      onClose()
    } catch (e) { toast.error('Erreur : ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-bordeaux text-cream px-4 py-3 flex items-center justify-between">
          <h3 className="font-fraunces italic text-[17px]">🔒 Code Caisse / RH</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-cream/20">✕</button>
        </div>
        <div className="p-4">
          <p className="text-[12px] text-ink-soft mb-3">
            Ce code sera demandé à chaque ouverture des onglets <b>Caisse</b> et <b>RH</b> (sur ton compte admin).
            {isSet === true && <span className="text-bordeaux"> Un code est déjà défini — le nouveau le remplacera.</span>}
          </p>
          {isSet === true && (
            <div className="mb-2">
              <div className="text-[12px] font-bold text-ink-soft mb-1">Ancien code</div>
              <input type="password" inputMode="numeric" value={current} onChange={e => setCurrent(e.target.value)}
                className="w-full text-center tracking-[0.3em] text-[18px] px-3 py-2 border border-line rounded-lg" placeholder="••••" />
            </div>
          )}
          <div className="mb-2">
            <div className="text-[12px] font-bold text-ink-soft mb-1">Nouveau code (4 chiffres ou +)</div>
            <input type="password" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)}
              className="w-full text-center tracking-[0.3em] text-[18px] px-3 py-2 border border-line rounded-lg" placeholder="••••" />
          </div>
          <div className="mb-4">
            <div className="text-[12px] font-bold text-ink-soft mb-1">Confirme le code</div>
            <input type="password" inputMode="numeric" value={code2} onChange={e => setCode2(e.target.value)}
              className="w-full text-center tracking-[0.3em] text-[18px] px-3 py-2 border border-line rounded-lg" placeholder="••••" />
          </div>
          <button onClick={save} disabled={busy || !code || !code2}
            className="w-full bg-bordeaux text-cream rounded-lg py-2.5 text-[14px] font-bold disabled:opacity-50">
            {busy ? '…' : 'Enregistrer le code'}
          </button>

          {touchIdAvailable() && (
            <div className="mt-4 pt-3 border-t border-line">
              <div className="text-[12px] font-bold text-ink-soft mb-1">👆 Touch ID (cet appareil)</div>
              <p className="text-[11px] text-ink-soft mb-2">
                {touchReg
                  ? 'Activé sur cet appareil — tu peux déverrouiller au doigt.'
                  : 'Déverrouille Caisse/RH avec ton empreinte sur CE Mac (le code reste utilisable partout).'}
              </p>
              <button onClick={toggleTouchId}
                className={`w-full rounded-lg py-2 text-[13px] font-bold border ${touchReg ? 'border-line text-ink-soft' : 'border-bordeaux text-bordeaux'}`}>
                {touchReg ? 'Désactiver Touch ID ici' : 'Activer Touch ID sur cet appareil'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
