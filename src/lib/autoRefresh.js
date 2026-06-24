// Re-vérifie « au bon moment » : quand on revient sur l'app (onglet/téléphone
// réveillé) + un filet de sécurité espacé. Remplace les rafraîchissements
// fréquents en boucle qui faisaient doublon avec le temps réel (« la sonnette »).
//
// - À l'instant où l'app redevient visible (onglet ré-affiché, écran rallumé) →
//   on rafraîchit (c'est là que la sonnette a pu rater quelque chose).
// - Un intervalle ESPACÉ tourne en plus, mais uniquement quand l'app est visible.
//
// Renvoie une fonction de nettoyage (à retourner depuis un useEffect).
export function refreshOnReturn(refresh, netMs = 15 * 60 * 1000) {
  const onVisible = () => { if (!document.hidden) refresh() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  const iv = setInterval(() => { if (!document.hidden) refresh() }, netMs)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    clearInterval(iv)
  }
}
