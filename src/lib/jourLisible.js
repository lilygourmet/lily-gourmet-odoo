// « Vendredi 29 août · Aujourd'hui » — le repère de jour de l'équipe, partagé
// par CD Négatif et Check CD- pour que les deux écrans parlent pareil.
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function fmtDayLabel(dateStr, today) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((date - todayDate) / 86400000)
  const nomJour = JOURS[date.getDay() === 0 ? 6 : date.getDay() - 1]
  let label = `${nomJour.charAt(0).toUpperCase() + nomJour.slice(1)} ${date.getDate()} ${MOIS[date.getMonth()]}`
  if (diff === 0) label += ' · Aujourd\'hui'
  else if (diff === 1) label += ' · Demain'
  return label
}
