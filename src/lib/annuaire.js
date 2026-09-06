// ============================================================
// Annuaire du personnel : page publique /annuaire (photo + appel direct).
// Le lien porte une clé secrète (?k=…) vérifiée par le serveur.
// ============================================================
const API = '/api/wati-webhook?action=annuaire'
const CLE_APPAREIL = 'lily.annuaire.cle'
const FAVORIS = 'lily.annuaire.favoris'

// Clé du lien. Trouvée dans l'adresse (?k=…), elle est gardée sur l'appareil :
// le raccourci de l'écran d'accueil peut alors ouvrir « /annuaire » tout court.
export function cleAnnuaire() {
  const dansUrl = new URLSearchParams(window.location.search).get('k')
  try {
    if (dansUrl) { localStorage.setItem(CLE_APPAREIL, dansUrl); return dansUrl }
    return localStorage.getItem(CLE_APPAREIL)
  } catch {
    return dansUrl   // navigation privée : on se contente de l'adresse
  }
}

export async function chargerContacts(cle) {
  const res = await fetch(`${API}&op=list&k=${encodeURIComponent(cle || '')}`)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d.contacts || []
}

// Réservé à l'admin (jeton de connexion) : obtenir le lien, ou en changer.
async function appelAdmin(op) {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const t = localStorage.getItem('lily_jwt')
    if (t) headers.Authorization = 'Bearer ' + t
  } catch { /* ignore */ }
  const res = await fetch(`${API}&op=${op}`, { method: 'POST', headers, body: '{}' })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d.key
}
export const lienAnnuaire = () => appelAdmin('link')
export const changerLienAnnuaire = () => appelAdmin('reset')

export const urlAnnuaire = cle => `${window.location.origin}/annuaire?k=${cle}`

// ---- Favoris : gardés sur CET appareil, chacun les siens ----
export function lireFavoris() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORIS) || '[]')) } catch { return new Set() }
}
export function ecrireFavoris(favoris) {
  try { localStorage.setItem(FAVORIS, JSON.stringify([...favoris])) } catch { /* navigation privée */ }
}
export function basculerFavori(id, favoris) {
  const suite = new Set(favoris)
  suite.has(id) ? suite.delete(id) : suite.add(id)
  ecrireFavoris(suite)
  return suite
}

// 0661234567 → 06 61 23 45 67
export function joliNumero(tel) {
  const chiffres = String(tel || '').replace(/\D/g, '')
  return chiffres.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
}

// Lien d'appel du bouton vert (null si l'employé n'a pas de numéro).
export function lienTel(tel) {
  const propre = String(tel || '').replace(/[^\d+]/g, '')
  return propre ? 'tel:' + propre : null
}
