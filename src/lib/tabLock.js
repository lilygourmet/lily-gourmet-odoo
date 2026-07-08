// Verrou à code des onglets Caisse / RH. Le code est vérifié CÔTÉ SERVEUR (jamais dans le navigateur).
async function call(op, body = {}, withAuth = false) {
  const headers = { 'Content-Type': 'application/json' }
  if (withAuth) {
    const t = localStorage.getItem('lily_jwt')
    if (t) headers.Authorization = 'Bearer ' + t
  }
  const res = await fetch('/api/wati-webhook?action=tab-lock', {
    method: 'POST', headers, body: JSON.stringify({ op, ...body }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d
}

export const verifyTabLock = code => call('verify', { code })
export const tabLockStatus = () => call('status')
export const setTabLockCode = (code, currentCode) => call('set', { code, currentCode }, true)
