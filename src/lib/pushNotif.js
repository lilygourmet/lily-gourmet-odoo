// Helpers cote client pour les notifications push
// Utilises par StockReception : abonnement, demande permission, etc.

// Cle publique VAPID injectee a la build via Vite (.env)
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

// Convertit la cle base64-url en Uint8Array (format attendu par PushManager)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Verifie la compatibilite du navigateur
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Etat actuel de l'autorisation : 'granted' / 'denied' / 'default'
export function getPushPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// Enregistre le service worker (au boot de l'app, idempotent)
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  } catch (e) {
    console.warn('[push] SW register error:', e)
    return null
  }
}

// Demande la permission + abonne le navigateur + envoie l'abonnement au backend
// Renvoie true si tout OK, false sinon.
// userId : l'id de l'utilisateur connecte (profile.id)
// role : 'cafe' (par defaut). Permet de filtrer cote send.
export async function subscribeToPush(userId, role = 'cafe') {
  if (!isPushSupported()) {
    console.info('[push] navigateur incompatible')
    return false
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY manquante')
    return false
  }

  // 1. Demande la permission a l'utilisateur
  let perm = Notification.permission
  if (perm === 'default') {
    perm = await Notification.requestPermission()
  }
  if (perm !== 'granted') {
    console.info('[push] permission refusee:', perm)
    return false
  }

  // 2. Recupere/cree l'enregistrement du service worker
  const reg = await registerServiceWorker()
  if (!reg) return false
  // Attend que le SW soit pret
  await navigator.serviceWorker.ready

  // 3. S'abonne au push manager
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    } catch (e) {
      console.warn('[push] subscribe error:', e)
      return false
    }
  }

  // 4. Envoie l'abonnement au backend pour stockage
  try {
    const r = await fetch('/api/push?action=subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        role,
        subscription: subscription.toJSON(),
      }),
    })
    if (!r.ok) {
      const txt = await r.text()
      console.warn('[push] backend subscribe failed:', r.status, txt)
      return false
    }
    return true
  } catch (e) {
    console.warn('[push] backend subscribe error:', e)
    return false
  }
}

// Desabonne (au logout par exemple - optionnel)
export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
}
