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

// Nom du bundle JS actuellement chargé (ex: /assets/index-Ab12Cd.js)
function loadedBundle() {
  const s = document.querySelector('script[type="module"][src*="/assets/index-"]')
  return s ? s.getAttribute('src') : null
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
    const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
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

// Au retour sur l'app (le cas le plus fréquent : on rouvre l'icône) + toutes les 5 min.
document.addEventListener('visibilitychange', checkForUpdate)
window.addEventListener('focus', checkForUpdate)
setInterval(checkForUpdate, 5 * 60 * 1000)
