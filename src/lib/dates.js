// ============================================================
// Date du jour en HEURE LOCALE (fuseau de l'appareil = Maroc).
// À utiliser partout au lieu de new Date().toISOString().slice(0,10)
// qui renvoie la date UTC → décalée d'un jour entre minuit et 1h.
// ============================================================
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
