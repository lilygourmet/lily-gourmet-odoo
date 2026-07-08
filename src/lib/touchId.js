// Déverrouillage biométrique (Touch ID sur Mac / empreinte) via WebAuthn.
// C'est PROPRE À L'APPAREIL : l'identifiant de la clé est gardé en local (localStorage).
// Sert de raccourci par-dessus le code (le code reste la solution universelle).
const KEY = 'lily_touchid_cred'

function bufToB64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
function b64ToBuf(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export function touchIdAvailable() {
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create)
}
// Vrai si CE Mac/navigateur a bien un authentificateur biométrique utilisable pour les sites.
export async function platformAuthAvailable() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}
export function touchIdRegistered() {
  return !!localStorage.getItem(KEY)
}
export function clearTouchId() {
  localStorage.removeItem(KEY)
}

// Enregistre Touch ID sur CET appareil (demande l'empreinte une fois).
export async function registerTouchId() {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Lily Gourmet', id: location.hostname },
      user: { id: userId, name: 'lily-tablock', displayName: 'Lily Gourmet' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
      attestation: 'none',
    },
  })
  if (!cred) throw new Error('Touch ID non configuré')
  localStorage.setItem(KEY, bufToB64(cred.rawId))
}

// Déverrouille avec Touch ID. Renvoie true si l'empreinte est validée.
export async function unlockTouchId() {
  const id = localStorage.getItem(KEY)
  if (!id) throw new Error('Touch ID pas encore configuré sur cet appareil')
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: b64ToBuf(id) }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
  return !!assertion
}
