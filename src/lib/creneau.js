// Créneau de livraison.
//
// Quand une commande contient une ligne « Livraison », le client reçoit un
// CRÉNEAU de 2 h (« entre 13h et 15h ») et la commande doit être prête 30 min
// avant le début de ce créneau.
//
// L'heure enregistrée dans Odoo (commitment_date) est l'heure de PRÉPARATION
// (12:30) : c'est elle que voient tous les écrans internes (calendrier,
// checklist, prod, pâtissier, impression) sans avoir à les modifier un par un.
// Le créneau annoncé au client est reconstitué à partir d'elle.
//
// Un RETRAIT en boutique n'est pas concerné : heure exacte, comme avant.

export const CRENEAU_MIN = 120      // durée du créneau annoncé au client
export const AVANCE_PREP_MIN = 30   // préparation avant le début du créneau

const toMin = (t) => {
  const [h, m] = String(t || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN
}
const toHHMM = (mn) => `${String(Math.floor(mn / 60) % 24).padStart(2, '0')}:${String(mn % 60).padStart(2, '0')}`

/**
 * Nom d'article = la ligne « Livraison » ?
 *
 * ⚠️ Le quartier est une VARIANTE du produit : la ligne s'appelle en vrai
 * « Livraison (Hay Riad) », « Livraison (Agdal) »… Une règle qui exigeait le mot
 * seul ne reconnaissait donc AUCUNE livraison réelle — tout ce qui en dépend
 * (créneau de 2 h, heure de préparation, livreur obligatoire) est resté éteint
 * depuis l'écriture du module. On accepte la parenthèse, mais rien d'autre :
 * « Livraison express » reste un article différent.
 */
export const estLigneLivraison = (name) =>
  /^livraison\s*(\(.*\))?$/i.test(String(name || '').trim())

/**
 * Heure saisie (= début du créneau, 13:00) → heure à enregistrer dans Odoo (12:30).
 * Sans heure ou avant 00:30, on ne décale pas : la commande basculerait la veille
 * et disparaîtrait du bon jour au calendrier.
 */
export function heurePreparation(time) {
  const mn = toMin(time)
  if (!Number.isFinite(mn) || mn < AVANCE_PREP_MIN) return time
  return toHHMM(mn - AVANCE_PREP_MIN)
}

/** Fin du créneau à partir de son début (13:00 → 15:00). */
export const finCreneau = (debut) => {
  const mn = toMin(debut)
  return Number.isFinite(mn) ? toHHMM(mn + CRENEAU_MIN) : ''
}

/** Heure de préparation Odoo (12:30) → créneau annoncé au client { debut, fin }. */
export function creneauClient(time) {
  const mn = toMin(time)
  if (!Number.isFinite(mn)) return null
  const debut = mn + AVANCE_PREP_MIN
  return { debut: toHHMM(debut), fin: toHHMM(debut + CRENEAU_MIN) }
}

/**
 * Le créneau Odoo (champ `livraison_hour`, ex. « 22-08-26 13h-15h ») est-il un
 * créneau de 2 h ? C'est ce qui distingue une commande prise avec la nouvelle
 * règle d'une ancienne (créneau d'1 h, heure Odoo = heure annoncée au client) :
 * les commandes déjà enregistrées gardent donc leur affichage d'origine.
 */
export function estCreneau2h(slot) {
  const m = String(slot || '').match(/(\d{1,2})h(\d{2})?-(\d{1,2})h(\d{2})?/)
  if (!m) return false
  return ((+m[3]) * 60 + (+(m[4] || 0))) - ((+m[1]) * 60 + (+(m[2] || 0))) === CRENEAU_MIN
}

/** Créneau lisible « 13h-15h » extrait du champ Odoo (vide si ancienne commande). */
export function creneauDepuisSlot(slot) {
  if (!estCreneau2h(slot)) return ''
  const m = String(slot).match(/(\d{1,2}h(?:\d{2})?)-(\d{1,2}h(?:\d{2})?)/)
  return `${m[1]}-${m[2]}`
}

/** « 22/08/2026 » + créneau Odoo → « 22/08/2026 entre 13h et 15h » (vide si pas un créneau). */
export function texteCreneauClient(dateText, slot) {
  if (!estCreneau2h(slot)) return ''
  const m = String(slot).match(/(\d{1,2}h(?:\d{2})?)-(\d{1,2}h(?:\d{2})?)/)
  return `${dateText} entre ${m[1]} et ${m[2]}`
}

/** « 13:00 » → « 13h » ; « 13:30 » → « 13h30 » (lisible dans un message client). */
export const heureLisible = (t) => {
  const [h, m] = String(t || '').split(':')
  return `${parseInt(h, 10)}h${m && m !== '00' ? m : ''}`
}

/** Créneau lisible à partir de l'heure de préparation : « entre 13h et 15h ». */
export function texteCreneau(timePrep) {
  const c = creneauClient(timePrep)
  return c ? `entre ${heureLisible(c.debut)} et ${heureLisible(c.fin)}` : ''
}
