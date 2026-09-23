// ============================================================
// L'HEURE DU MAROC — UN SEUL RÉGLAGE, POUR TOUTE L'APP.
//
// « Modifier l'heure sur le système, on est passé à GMT 0 », puis « c'est
// surtout pour les commandes » (Layla, 2026-09-23).
//
// MESURÉ le soir même, à trois sources :
//     son téléphone        20:02
//     UTC                  20:02   ← identique
//     Africa/Casablanca    21:02   ← une heure d'avance
//
// Le pays est à GMT+0 ; la base de fuseaux du serveur, elle, croit encore
// UTC+1. Or tout le code faisait confiance à `Africa/Casablanca` — treize
// endroits. Chaque conversion ajoutait donc une heure fantôme.
//
// ⚠️ ET ÇA TOUCHAIT LES COMMANDES. Une livraison saisie pour 19 h était
// enregistrée à 18 h UTC : juste tant que le pays est à UTC+1, fausse d'une
// heure dès qu'il passe à GMT+0. Une heure d'avance sur toutes les livraisons.
//
// ⚠️ POURQUOI UN RÉGLAGE À LA MAIN PLUTÔT QUE LE FUSEAU : parce qu'on vient
// précisément de voir le fuseau se tromper, et qu'on ne peut pas mettre à jour
// la base de fuseaux d'un serveur qu'on ne gère pas. Un nombre ici, changé en
// UNE ligne, vaut mieux que treize conversions qui mentent ensemble.
//
// ⚠️ QUAND LE PAYS REPASSERA À UTC+1 : remettre `DECALAGE_FORCE = 1`. Et si un
// jour la base de fuseaux redevient fiable, `null` lui rend la main.
// ============================================================

/** Décalage du Maroc par rapport à UTC, en heures. `null` = suivre le fuseau. */
export const DECALAGE_FORCE = 0

/**
 * LE NOM DE FUSEAU À DONNER À `Intl` / `toLocaleString`.
 *
 * ⚠️ C'est LUI qu'on échange dans le code existant, et rien d'autre : treize
 * appels gardent leur forme, leurs options, leur comportement — seul le fuseau
 * change. Un remplacement d'un mot vaut mieux qu'une réécriture de treize
 * conversions un soir de bascule horaire.
 *
 * ⚠️ `Etc/GMT-1` vaut bien UTC+1 : le signe est INVERSÉ dans les noms `Etc/GMT`.
 * C'est déroutant, c'est la norme POSIX, et se tromper de signe décale de deux
 * heures au lieu d'une.
 */
export const FUSEAU_MAROC = DECALAGE_FORCE === null || DECALAGE_FORCE === undefined
  ? 'Africa/Casablanca'
  : (DECALAGE_FORCE === 0 ? 'UTC' : `Etc/GMT${DECALAGE_FORCE > 0 ? '-' : '+'}${Math.abs(DECALAGE_FORCE)}`)

/** Le décalage réel, en heures, pour cet instant-là. */
export function decalageMaroc(d = new Date()) {
  if (DECALAGE_FORCE !== null && DECALAGE_FORCE !== undefined) return DECALAGE_FORCE
  // Le repli : on demande au fuseau, en comparant midi UTC à son heure locale.
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local - utc) / 3600000)
}

/**
 * L'instant, vu du Maroc — un `Date` qu'on peut lire avec les méthodes `getUTC…`
 * pour obtenir l'heure LOCALE. C'est le tour de passe-passe habituel : on
 * décale l'instant, puis on le lit en UTC.
 */
const vuDuMaroc = d => new Date(new Date(d).getTime() + decalageMaroc(d) * 3600000)

/** « 20:02 » — l'heure du Maroc, minutes comprises. */
export function heureMaroc(d = new Date()) {
  const m = vuDuMaroc(d)
  return `${String(m.getUTCHours()).padStart(2, '0')}:${String(m.getUTCMinutes()).padStart(2, '0')}`
}

/** L'heure seule, en nombre : 20. Sert aux tâches qui doivent partir à 23 h. */
export function heureSeuleMaroc(d = new Date()) {
  return vuDuMaroc(d).getUTCHours()
}

/** « 2026-09-23 » — le jour au Maroc, jamais le jour UTC. */
export function jourMaroc(d = new Date()) {
  return vuDuMaroc(d).toISOString().slice(0, 10)
}

/**
 * Une date + une heure LOCALES vers l'instant UTC à écrire dans Odoo.
 * « 19:00 » saisi au Maroc devient « 19:00 » UTC tant qu'on est à GMT+0.
 */
export function marocVersUtc(dateStr, heureStr) {
  const [Y, M, D] = String(dateStr).split('-').map(Number)
  const [hh, mm] = String(heureStr || '00:00').split(':').map(Number)
  const midi = new Date(Date.UTC(Y, (M || 1) - 1, D || 1, 12, 0, 0))
  const dec = decalageMaroc(midi)
  return new Date(Date.UTC(Y, (M || 1) - 1, D || 1, (hh || 0) - dec, mm || 0, 0))
}
