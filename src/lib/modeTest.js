// ====== Mode test ======
// Pour essayer l'app sans rien écrire dans Odoo. On l'active avec ?test=1 dans
// l'adresse (et on le coupe avec ?test=0) ; il reste actif tant que l'onglet
// est ouvert. Les lectures restent vraies : ce sont les vrais ordres, les vrais
// stocks. Seules les écritures vers Odoo sont simulées — valider un ordre,
// lancer une tournée, réserver des composants.
// Supabase, lui, est bien écrit : cocher « fait » marche pour de bon, et se
// décoche pareil.

const CLE = 'mode-test-odoo'

export function estModeTest() {
  try {
    const p = new URLSearchParams(window.location.search).get('test')
    if (p === '1') sessionStorage.setItem(CLE, '1')
    if (p === '0') sessionStorage.removeItem(CLE)
    return sessionStorage.getItem(CLE) === '1'
  } catch { return false }
}
