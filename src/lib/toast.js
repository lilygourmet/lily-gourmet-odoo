// Toasts impératifs : appelables de n'importe où, même hors composant React.
//   import { toast } from '../lib/toast'
//   toast.success('Enregistré')   toast.error('Échec')   toast('Info')
// Rendu par <ToastHost/> (monté une fois dans App). Non bloquant (≠ alert()).

let listeners = []
let seq = 0

export function subscribeToasts(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function emit(type, message, duration) {
  const id = ++seq
  const t = { id, type, message: String(message ?? ''), duration }
  listeners.forEach(l => { try { l(t) } catch { /* ignore */ } })
  return id
}

export function toast(message, opts = {}) {
  return emit(opts.type || 'info', message, opts.duration ?? 3500)
}
toast.success = (m, o = {}) => emit('success', m, o.duration ?? 3000)
toast.error = (m, o = {}) => emit('error', m, o.duration ?? 5000)
toast.info = (m, o = {}) => emit('info', m, o.duration ?? 3500)
