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

// Réservé à l'admin (jeton de connexion) : le lien, et qui apparaît dedans.
async function appelAdmin(op, corps = {}) {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const t = localStorage.getItem('lily_jwt')
    if (t) headers.Authorization = 'Bearer ' + t
  } catch { /* ignore */ }
  const res = await fetch(`${API}&op=${op}`, { method: 'POST', headers, body: JSON.stringify(corps) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
  return d
}
// { key, masques } : le lien + les employés retirés de l'annuaire.
export const lienAnnuaire = () => appelAdmin('link')
export const changerLienAnnuaire = () => appelAdmin('reset')
export const masquerEmploye = (id, masque) => appelAdmin('hide', { id, masque })

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

// Lien WhatsApp. wa.me exige l'indicatif pays : 06… → 2126…
export function lienWhatsApp(tel) {
  const chiffres = String(tel || '').replace(/\D/g, '')
  if (!chiffres) return null
  const international = chiffres.startsWith('212') ? chiffres
    : chiffres.startsWith('0') ? '212' + chiffres.slice(1)
    : chiffres
  return 'https://wa.me/' + international
}

// ---- Employés retirés de l'annuaire, écrits en dur (demande de Layla) ----
// Un employé est retiré si un mot de son nom figure ici. Le serveur s'en sert
// pour la page publique, l'onglet admin pour les afficher barrés.
export const MASQUES_EN_DUR = ['badiaa', 'bahri', 'rachida', 'nezha', 'layla']

export function estMasqueEnDur(nom) {
  const mots = String(nom || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // enlève les accents
    .toLowerCase().split(/[^a-z]+/).filter(Boolean)
  return mots.some(m => MASQUES_EN_DUR.includes(m))
}
