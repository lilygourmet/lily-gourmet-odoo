// ============================================================
// Mise à jour automatique de l'app
// ------------------------------------------------------------
// Problème réglé : certains appareils (surtout l'app ajoutée à l'écran d'accueil)
// gardaient une VIEILLE version en cache → les nouveautés n'apparaissaient jamais.
//
// Principe : on regarde le nom du bundle JS chargé (Vite y met un hash unique à
// chaque déploiement). De temps en temps (et au retour sur l'app), on re-télécharge
// la page d'accueil SANS cache et on compare. Si le hash a changé → nouvelle version
// déployée → on PRÉVIENT (bannière « cliquer pour mettre à jour »). On ne recharge
// JAMAIS tout seul : c'est l'utilisateur qui clique quand il veut.
// ============================================================

// Nom du bundle JS actuellement chargé (ex: /assets/main-Ab12Cd.js)
//
// ⚠️ Ce bundle s'est appelé « index- » puis « main- » : chercher un seul de ces
// noms revenait à ne rien trouver, et l'app cessait alors de signaler les
// nouvelles versions — sans bruit. On prend maintenant le premier script du
// dossier assets, quel que soit son nom.
const BUNDLE = /\/assets\/(?:main|index)-[A-Za-z0-9_-]+\.js/

function loadedBundle() {
  for (const s of document.querySelectorAll('script[type="module"][src]')) {
    const m = s.getAttribute('src').match(BUNDLE)
    if (m) return m[0]
  }
  return null
}

const MINE = loadedBundle()
let busy = false
let notified = false   // une fois la bannière prévenue, inutile de re-signaler

async function checkForUpdate() {
  if (busy || !MINE) return
  if (document.visibilityState !== 'visible') return
  busy = true
  try {
    // page d'accueil fraîche, sans cache (le ?_= force aussi le contournement)
    const res = await fetch('/?_=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) return
    const html = await res.text()
    const m = html.match(BUNDLE)
    if (!m) return
    // Le bundle servi diffère de celui chargé → nouvelle version en ligne.
    // On prévient la bannière (cliquer pour mettre à jour), SANS recharger.
    if (!MINE.includes(m[0]) && !notified) {
      notified = true
      window.dispatchEvent(new Event('lg:update-available'))
    }
  } catch {
    /* hors ligne / erreur réseau → on réessaiera plus tard */
  } finally {
    busy = false
  }
}

// ------------------------------------------------------------
// Filet : ÉCRAN BLANC après un déploiement.
// Un onglet resté ouvert garde l'ancienne page ; quand il va chercher un écran
// (ils se chargent à la demande), le fichier a changé de nom et n'existe plus.
// Vite prévient par « vite:preloadError » : on recharge, une seule fois, pour
// repartir sur la version en ligne. Le garde évite de boucler si le fichier
// manque vraiment.
// ------------------------------------------------------------
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('lg:recharge')) return
    sessionStorage.setItem('lg:recharge', '1')
  } catch { /* navigation privée : on recharge quand même, une fois */ }
  window.location.reload()
})
// Une session qui s'est chargée jusqu'au bout n'a plus besoin du garde.
window.addEventListener('load', () => {
  try { sessionStorage.removeItem('lg:recharge') } catch { /* sans importance */ }
})

// Au retour sur l'app (le cas le plus fréquent : on rouvre l'icône) + toutes les 5 min.
document.addEventListener('visibilitychange', checkForUpdate)
window.addEventListener('focus', checkForUpdate)
setInterval(checkForUpdate, 5 * 60 * 1000)
