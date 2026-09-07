// ============================================================
// Date du jour en HEURE LOCALE (fuseau de l'appareil = Maroc).
// À utiliser partout au lieu de new Date().toISOString().slice(0,10)
// qui renvoie la date UTC → décalée d'un jour entre minuit et 1h.
// ============================================================
export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Le jour LOCAL d'un horodatage venu de la base (qui est en UTC).
 * `compte_le.slice(0,10)` donnait la date UTC : au Maroc (UTC+1), tout ce qui
 * est saisi entre minuit et 1 h portait la veille — et « les comptages
 * d'aujourd'hui » n'en voyait aucun.
 */
export function jourLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
