// ============================================================
// Mise à jour automatique de l'app
// ------------------------------------------------------------
// Problème réglé : certains appareils (surtout l'app ajoutée à l'écran d'accueil)
// gardaient une VIEILLE version en cache → les nouveautés n'apparaissaient jamais.
//
// Principe : on regarde le nom du bundle JS chargé (Vite y met un hash unique à
// chaque déploiement). De temps en temps (et au retour sur l'app), on re-télécharge
// la page d'accueil SANS cache et on compare. Si le hash a changé → nouvelle version
// déployée.
//
// ⚠️ UN SEUL RECHARGEMENT AUTOMATIQUE PAR JOUR, LE PREMIER (Layla, 2026-09-23 :
// « recharge tout le matin au démarrage et après avec bannière »). La bannière
// seule ne suffisait pas : le 23/09, « À finir » a rejoué un bug corrigé la
// veille parce que l'écran tournait encore sur l'ancien code — et du vieux code
// qui parle à Odoo, ça ne se voit pas passer.
//
// Mais recharger à toute heure, c'est couper l'atelier au milieu d'une fournée.
// La journée démarre donc sur du neuf, et ensuite on se contente de PROPOSER.
//
// DEUX GARDE-FOUS, et ils comptent :
//  • on ne coupe JAMAIS quelqu'un en train de taper (un champ au doigt = on
//    attend, et la bannière prend le relais) ;
//  • une seule fois par jour. Si après ça le navigateur ressert quand même
//    l'ancien fichier, on repasse à la bannière — jamais une boucle.
// ============================================================

import { todayISO } from './dates'

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

// Le JOUR du dernier rechargement automatique. Dans `localStorage` : il doit
// survivre à la fermeture de l'onglet, sinon rouvrir l'app en rouvrirait le
// droit dix fois par matinée. Sans mémoire (navigation privée), on s'en passe :
// on se contentera de la bannière.
const DEJA = 'lg:maj-jour'
const lire = k => { try { return localStorage.getItem(k) } catch { return null } }
const ecrire = (k, v) => { try { localStorage.setItem(k, v) } catch { /* tant pis */ } }

/** Quelqu'un est-il en train d'écrire ? On ne lui arrache pas son champ. */
function enTrainDeTaper() {
  const el = document.activeElement
  if (!el) return false
  return /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable === true
}

/**
 * Que faire d'une version servie différente de la nôtre.
 * Séparé du reste pour être vérifiable : c'est la règle, pas la plomberie.
 */
export function decisionMaj({ charge, servi, jour, dernierJour, enTrainDeTaper: tape }) {
  if (!charge || !servi) return 'rien'
  if (charge.includes(servi)) return 'rien'          // déjà à jour
  if (tape) return 'banniere'                        // on ne coupe pas une saisie
  if (dernierJour === jour) return 'banniere'        // déjà rechargé aujourd'hui
  return 'recharger'
}

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
    const quoiFaire = decisionMaj({
      charge: MINE, servi: m[0],
      jour: todayISO(), dernierJour: lire(DEJA), enTrainDeTaper: enTrainDeTaper(),
    })
    if (quoiFaire === 'recharger') {
      ecrire(DEJA, todayISO())
      window.location.reload()
      return
    }
    if (quoiFaire === 'banniere' && !notified) {
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
// Vite prévient par « vite:preloadError » : on recharge pour repartir sur la
// version en ligne.
//
// ⚠️ Le garde retient l'HEURE du dernier rechargement, et rien ne l'efface.
// Vécu le 09/09 sur tablette et téléphone : « le site saute, se remet et
// saute ». Le garde était remis à zéro à chaque chargement de page, alors que
// l'erreur arrive APRÈS — au moment d'ouvrir un écran. Chaque rechargement
// effaçait donc la trace du précédent, et l'app rechargeait sans fin.
// ------------------------------------------------------------
const ENTRE_DEUX_RECHARGES = 60 * 1000

window.addEventListener('vite:preloadError', () => {
  let dernier
  try {
    dernier = Number(sessionStorage.getItem('lg:recharge') || 0)
  } catch {
    return   // sans mémoire, pas de garde possible : mieux vaut ne pas boucler
  }
  if (Date.now() - dernier < ENTRE_DEUX_RECHARGES) return
  try { sessionStorage.setItem('lg:recharge', String(Date.now())) } catch { return }
  window.location.reload()
})

// Au retour sur l'app (le cas le plus fréquent : on rouvre l'icône) + toutes les 5 min.
document.addEventListener('visibilitychange', checkForUpdate)
window.addEventListener('focus', checkForUpdate)
setInterval(checkForUpdate, 5 * 60 * 1000)
