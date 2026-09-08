// ====== Mode test ======
// Pour essayer l'app sans rien écrire dans Odoo. On l'active avec ?test=1 dans
// l'adresse (et on le coupe avec ?test=0) ; il reste actif tant que l'onglet
// est ouvert. Les lectures restent vraies : ce sont les vrais ordres, les vrais
// stocks. Seules les écritures vers Odoo sont simulées — valider un ordre,
// lancer une tournée, réserver des composants.
// Supabase, lui, est bien écrit : cocher « fait » marche pour de bon, et se
// décoche pareil.

const CLE = 'mode-test-odoo'

// Lu DÈS LE CHARGEMENT : l'app efface l'adresse au démarrage
// (history.replaceState), le paramètre n'existerait déjà plus au premier rendu.
let actif = false
try {
  actif = sessionStorage.getItem(CLE) === '1'
  // L'adresse porte déjà « ?view=… » quand on est dans un onglet : y coller
  // « ?test=1 » fait DEUX points d'interrogation, et URLSearchParams ne voit
  // plus rien. On cherche donc le réglage dans l'adresse entière.
  const m = window.location.search.match(/[?&]test=([01])\b/)
  const p = m ? m[1] : null
  if (p === '1') { sessionStorage.setItem(CLE, '1'); actif = true }
  if (p === '0') { sessionStorage.removeItem(CLE); actif = false }
} catch { actif = false }

export function estModeTest() { return actif }
