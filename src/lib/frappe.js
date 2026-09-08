// ------------------------------------------------------------
// Le pavé de calculette de l'atelier : ce que donne une touche appliquée au
// nombre affiché. Les chiffres poussent à droite, comme sur une caisse.
// ------------------------------------------------------------
export function frappe(txt, t) {
  const v = String(txt ?? '')
  if (t === '←') return v.length > 1 ? v.slice(0, -1) : '0'
  if (t === ',') return v.includes('.') || v.includes(',') ? v : (v || '0') + '.'
  return v === '0' ? t : v + t
}
