// Petit "ding" discret généré par code (Web Audio API) — pas de fichier audio.
// Respecte le réglage utilisateur (localStorage) et le mute de l'onglet (géré
// par le navigateur). Joué à la réception d'un nouveau message client.

const SOUND_KEY = 'lily.conv.sound'

export function isDingEnabled() {
  return localStorage.getItem(SOUND_KEY) !== 'off' // activé par défaut
}

export function setDingEnabled(on) {
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
}

let audioCtx = null

export function playDing() {
  if (!isDingEnabled()) return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const now = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    // Deux notes courtes (style WhatsApp Web)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1320, now + 0.08)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01) // volume discret
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)

    osc.start(now)
    osc.stop(now + 0.26)
  } catch (_) {
    // Bloqué (pas d'interaction préalable, etc.) -> échec silencieux
  }
}
