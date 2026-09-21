// ============================================================
// CE QUI RESTE À METTRE EN FORME.
//
// « Quand une mousse, une crème, une chantilly, un crémeux se fait, j'ai
// besoin que ça parte dans À déclarer leur découpe » — la chantilly est PIPÉE,
// le crémeux COULÉ dans les moules, le voile DÉCOUPÉ (Layla, 2026-09-20). Une
// préparation n'est pas finie quand elle sort de la cuve.
//
// Et la règle du retour, qu'elle a tranchée le même jour : « quand une mousse
// reste en stock, elle revient dans À déclarer parce qu'elle doit être finie ».
// Ce n'est donc pas un rappel qu'on montre une fois : tant qu'il en reste au
// Stock Prod, la ligne revient — le lendemain, et les jours suivants.
//
// ⚠️ LA LISTE VIT EN BASE (`annexe_mise_en_forme`), pas dans le code : un
// article renommé chez Odoo casserait une liste écrite en dur, c'est déjà
// arrivé. Et on ne la devine pas depuis le nom : « SM. Base CBS 23 cm » et
// « SM- Base Tarte CBS 18 cm » sont la même chose écrite de deux façons.
// ============================================================

import { enGrammes, enUnite } from './ecranSimple'

/**
 * CE QUI RESTE À METTRE EN FORME, prêt à afficher.
 *
 * ⚠️ C'est le SERVEUR qui compte, et pour une bonne raison : le stock d'Odoo ne
 * baisse qu'à la validation de l'ordre, et l'atelier valide en fin de journée.
 * Un vrac dispatché ce matin serait resté toute la journée dans la liste, à
 * réclamer un travail déjà fait. Le serveur retire donc ce que les formats
 * déclarés aujourd'hui en ont consommé (`resteG`, en grammes).
 */
export async function loadAFinir({ frais = false } = {}) {
  // ⚠️ L'ÉCRAN VEUT DU FRAIS, LA PASTILLE NON. Le calcul coûte six secondes à
  // froid et la barre le relance à chaque changement d'écran : elle se
  // contente d'un chiffre d'une minute. L'écran, lui, doit voir la ligne
  // disparaître dès qu'on a dispatché.
  const r = await fetch('/api/fab-annexe?afinir=1' + (frais ? '&frais=1' : '') + '&cb=' + Date.now())
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return aMettreEnForme(d.vracs)
}

/**
 * Ce qui attend VRAIMENT sa mise en forme.
 *
 * ⚠️ On ne compte pas les poussières. Un stock traîne toujours à 0,4 g après
 * une répartition — l'afficher, c'est une ligne qui ne part jamais et qu'on
 * apprend à ignorer, puis tout le reste avec.
 */
export function aMettreEnForme(vracs) {
  return (vracs || [])
    .filter(a => resteVraiment(a.resteG, a.unite))
    .sort((a, b) => (a.libelle || a.produit).localeCompare(b.libelle || b.produit, 'fr'))
}

/** `resteG` est déjà en grammes — sauf pour ce qui se compte en pièces. */
const resteVraiment = (resteG, unite) => {
  const s = Number(resteG) || 0
  return /^u$/i.test(String(unite || '').trim()) ? s >= 1 : s >= 1
}

/**
 * LES FORMATS d'un vrac : ce dans quoi il se coule, se pipe, se découpe.
 * `parUnite` est ce qu'une pièce en prend, dans `uniteVrac`.
 */
export async function loadFormats(produit) {
  const r = await fetch('/api/fab-annexe?formats=' + encodeURIComponent(produit))
  if (!r.ok) throw new Error(`Formats illisibles (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.formats || []
}

/**
 * CE QUE LA RECETTE PRÉVOIT pour ce dispatch, en GRAMMES.
 *
 * ⚠️ Tout se calcule en grammes et rien qu'en grammes. Le vrac se compte
 * parfois en kilos chez Odoo et sa ligne de recette en grammes (ou l'inverse) :
 * c'est exactement le chemin par lequel un facteur mille se glisse — il l'a
 * déjà fait, avec 14,33 g de crème là où il en fallait 14 328.
 */
export function prevuParLaRecette(formats, quantites) {
  return (formats || []).reduce((t, f) => {
    const n = Number(quantites?.[f.produit]) || 0
    return t + n * enGrammes(f.parUnite, f.uniteVrac)
  }, 0)
}

/**
 * LE DISPATCH, PRÊT À PARTIR : un ordre par format, et ce que le vrac y laisse.
 *
 * « Une ligne qui demande la répartition, la mise en forme doit être réclamée.
 * Et surtout dire : est-ce qu'il t'est resté de la crème à la fin, pour
 * compléter ou pour stocker » (Layla, 2026-09-20).
 *
 * Deux cas, et c'est sa règle depuis le 19 :
 *   • il reste quelque chose → on n'y touche pas, la recette s'applique telle
 *     quelle et le reste dort au frigo (il reviendra demain dans « À finir ») ;
 *   • il ne reste RIEN → tout ce qui a été fait rentre dans les produits, même
 *     ce que la recette ne demandait pas. La consigne va sur le PREMIER format
 *     servi, et les autres reçoivent zéro : sans ce zéro, Odoo reprendrait sa
 *     recette au prorata et compterait le vrac deux fois (même règle que
 *     `repartir`, qui pose la cuve entière sur la taille lancée).
 */
export function dispatchVersOdoo({ vrac, stock, uniteStock, formats, quantites, reste,
  uniteVracArticle = null }) {
  const servis = (formats || [])
    .filter(f => (Number(quantites?.[f.produit]) || 0) > 0)
    .map(f => ({ produit: f.produit, qty: Number(quantites[f.produit]), unite: f.unite,
      uniteVrac: f.uniteVrac }))
  if (!servis.length) return []

  const stockG = enGrammes(stock, uniteStock)
  const resteG = Math.max(0, Math.min(stockG, enGrammes(reste, uniteStock)))
  const consommeG = stockG - resteG
  const prevuG = prevuParLaRecette(formats, quantites)

  // La recette tombe juste (au gramme près) : rien à imposer à Odoo.
  if (Math.abs(consommeG - prevuG) <= 1) return servis.map(s => ({ ...s, ajustements: null }))

  // ⚠️ LA QUANTITÉ IMPOSÉE PART DANS L'UNITÉ DE L'ARTICLE, jamais dans celle de
  // la ligne de recette (Layla, 2026-09-21 : « assure-toi que partout pareil »).
  // C'est le serveur qui convertit, en un seul endroit — voir
  // `ajustementsEnUniteLigne`. Cet écran-ci convertissait DÉJÀ vers l'unité de
  // la ligne : la conversion se serait alors faite deux fois, et on aurait
  // rejoué le facteur mille par l'autre bout.
  const uniteImposee = uniteVracArticle || s0(servis).uniteVrac
  return servis.map((s, i) => ({
    ...s,
    ajustements: { [vrac]: i === 0 ? arrondi(enUnite(consommeG, uniteImposee)) : 0 },
  }))
}

const arrondi = v => Math.round(v * 1000) / 1000
// Le repli quand l'écran ne sait pas dire l'unité de l'article : l'unité de la
// ligne, comme avant. Elles sont identiques dans l'immense majorité des cas.
const s0 = servis => servis[0] || {}

/**
 * QUI EST COCHÉ « à mettre en forme » — pour l'écran Mini / maxi.
 *
 * « À choisir dans les mini et maxi annexe ce qui apparaît dans les à finir »
 * (Layla, 2026-09-20). La liste vivait en base, hors de sa portée, comme les
 * mini/maxi avant l'écran qui les a ouverts.
 */
export async function loadMiseEnForme() {
  const r = await fetch('/api/fab-annexe?miseenforme=1&cb=' + Date.now())
  if (!r.ok) throw new Error(`Liste illisible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.produits || []
}

/** Cocher ou décocher un article. */
export async function setMiseEnForme(produit, actif, note = null) {
  const r = await fetch('/api/fab-annexe?miseenforme=1', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produit, actif, note }),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return true
}
