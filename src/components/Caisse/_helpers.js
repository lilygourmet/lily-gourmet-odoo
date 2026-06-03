// Helpers pour le module Caisse — couleurs, formatters, constantes

// Palette des couleurs disponibles (clé technique → CSS)
export const COLOR_PALETTE = {
  vert_clair:  { bg: '#EAF3DE', border: '#97C459', text: '#27500A', emoji: '🟢', label: 'Vert clair' },
  vert_teal:   { bg: '#E1F5EE', border: '#1D9E75', text: '#085041', emoji: '🟩', label: 'Vert teal' },
  vert_olive:  { bg: '#EDF0DA', border: '#8FA12D', text: '#3F4A0A', emoji: '🫒', label: 'Olive' },
  orange:      { bg: '#FAEEDA', border: '#EF9F27', text: '#633806', emoji: '🟧', label: 'Orange' },
  corail:      { bg: '#FAECE7', border: '#D85A30', text: '#712B13', emoji: '🟥', label: 'Corail' },
  jaune:       { bg: '#FAF6DA', border: '#D9C229', text: '#5C4F06', emoji: '🟨', label: 'Jaune' },
  rose:        { bg: '#FCE7F2', border: '#D85AA7', text: '#71135B', emoji: '🌸', label: 'Rose' },
  bleu:        { bg: '#E6F1FB', border: '#378ADD', text: '#0C447C', emoji: '🟦', label: 'Bleu' },
  bleu_marine: { bg: '#E0E5F2', border: '#3D54AE', text: '#162455', emoji: '⚓', label: 'Bleu marine' },
  cyan:        { bg: '#E0F1F2', border: '#2DA4B0', text: '#0A4F55', emoji: '💧', label: 'Cyan' },
  violet:      { bg: '#EEEDFE', border: '#7F77DD', text: '#3C3489', emoji: '🟣', label: 'Violet' },
  gris:        { bg: '#EDEDEA', border: '#8a7a70', text: '#1a0f0a', emoji: '⚫', label: 'Gris' },
}

// Couleurs par type (pour suggérer dans la palette)
export const COLORS_BY_TYPE = {
  caisse_geree: ['vert_clair', 'vert_teal', 'vert_olive'],
  perso:        ['orange', 'corail', 'jaune', 'rose'],
  banque:       ['bleu', 'bleu_marine', 'cyan'],
}

// Couleur "À affecter" (gris pointillé)
export const UNASSIGNED_STYLE = {
  bg: 'var(--color-background-secondary, #F4F0EA)',
  border: 'var(--color-border-primary, #C4BFB6)',
  text: 'var(--color-text-primary, #1a0f0a)',
}

// Récupère le style d'une enveloppe selon son destinataire
export function envStyle(destinataire) {
  if (!destinataire) {
    return { ...UNASSIGNED_STYLE, borderStyle: 'dashed', borderWidth: '1.5px' }
  }
  const c = COLOR_PALETTE[destinataire.color_key] || COLOR_PALETTE.gris
  return { bg: c.bg, border: c.border, text: c.text, borderStyle: 'solid', borderWidth: '0.5px' }
}

// Formatage montant : 1 250 dh
export function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '–'
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(Number(n))
  return sign + abs.toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/\s/g, ' ') + ' dh'
}

// Formatage date courte : "18 mai"
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_LONG  = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function fmtDateCourte(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getDate()} ${MOIS_COURT[dt.getMonth()]}`
}

export function fmtDateLongue(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getDate()} ${MOIS_LONG[dt.getMonth()]} ${dt.getFullYear()}`
}

export function fmtMois(monthIdx) {
  return MOIS_LONG[monthIdx]
}

export function fmtMoisCourt(monthIdx) {
  return MOIS_COURT[monthIdx].replace('.', '')
}

// Couleurs des destinataires de salaire (Nezha / Layla)
export const SALAIRE_COLORS = {
  nezha: COLOR_PALETTE.orange,
  layla: COLOR_PALETTE.corail,
}

// Destinations possibles pour le reliquat salaire
export const RELIQUAT_DESTINATIONS = [
  { key: 'caisse_meriem',   label: 'Caisse Meriem',  color: 'vert_clair' },
  { key: 'caisse_layla_lg', label: 'Caisse Layla LG', color: 'vert_teal'  },
  { key: 'nezha_perso',     label: 'Nezha perso',     color: 'orange'     },
  { key: 'layla_perso',     label: 'Layla perso',     color: 'corail'     },
  { key: 'report_mois_suivant', label: 'Report mois suivant', color: 'bleu' },
]

// Libellé d'affichage d'une destination de reliquat (gère le marqueur « consommé »).
export function reliquatDestLabel(key) {
  if (key === 'report_applique') return 'Reporté (déduit du mois suivant) ✓'
  return RELIQUAT_DESTINATIONS.find(d => d.key === key)?.label || key || '—'
}

// Caisses-gérées (clés techniques)
export const CAISSES_GEREES = [
  { key: 'meriem',   label: 'Meriem',   color: 'vert_clair' },
  { key: 'layla_lg', label: 'Layla LG', color: 'vert_teal'  },
]

// Statuts salaire
export const SALAIRE_STATUS_LABELS = {
  brouillon: { label: 'Brouillon',     bg: 'var(--color-background-secondary, #F4F0EA)', text: 'var(--color-text-secondary, #4a3a30)' },
  pret:      { label: 'Prêt à payer',  bg: '#E6F1FB', text: '#0C447C' },
  paye:      { label: 'Payé',          bg: '#E1F5EE', text: '#085041' },
}

// Mois 1..12 pour les onglets
export const MOIS_TABS = MOIS_COURT.map((m, i) => ({
  idx: i + 1,
  label: m.replace('.', '').charAt(0).toUpperCase() + m.replace('.', '').slice(1),
}))

// Récupère le mois courant (1..12)
export function currentMonth() {
  return new Date().getMonth() + 1
}

export function currentYear() {
  return new Date().getFullYear()
}

// Bornes de mois pour les queries (gte / lt)
export function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

// ISO YYYY-MM-DD du jour
export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
