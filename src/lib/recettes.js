// ============================================================
// REFAIRE LA RECETTE AUTOUR D'UN INGRÉDIENT.
//
// « Les recettes s'affichent, je ne change rien. Je vois les quantités de
// chaque chose. Si j'ai l'habitude de bosser avec 1 000 g de sucre, je vais
// modifier ça et la suite suit, pour voir le ratio avec les autres »
// (Layla, 2026-09-23).
//
// C'est le geste du pâtissier, pas celui d'un tableur : on ne corrige pas une
// ligne, on RÈGLE LA RECETTE ENTIÈRE à partir de celle qu'on connaît. Mettre
// 1 000 g de sucre là où Odoo en écrit 250, c'est multiplier toute la recette
// par quatre — la farine, les œufs, et le nombre de gâteaux qui en sortent.
//
// ⚠️ RIEN N'EST ENREGISTRÉ. Odoo garde sa recette : on ne fait que la lire à
// une autre échelle.
// ============================================================
import { nb, enGrammes, uniteAffichee } from './ecranSimple'

/**
 * UNE QUANTITÉ AVEC SES DÉCIMALES, mais seulement quand elles disent quelque
 * chose. « Ne pas montrer de chiffre après la virgule si ,00 ; sinon montrer
 * max 2 chiffres » (Layla, 2026-09-23).
 *
 * `qte()` arrondit à l'entier : c'est bien pour l'atelier, qui pèse au gramme.
 * Ici on règle une recette à une autre échelle, et le tiers d'une fournée
 * tombe rarement rond — 4 266,67 g arrondi à 4 267 fait perdre le compte quand
 * on remonte la cascade. Comme partout, on lit en GRAMMES.
 */
export function qteRecette(v, u) {
  const g = Math.round(enGrammes(v, u) * 100) / 100
  return `${nb(g)} ${uniteAffichee(u)}`.trim()
}

const nombre = v => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * La nouvelle quantité de l'ARTICLE quand on impose celle d'un ingrédient.
 *
 * `quantite`     : ce qu'on fabrique aujourd'hui (6 tartes)
 * `besoinActuel` : ce que la recette demande alors (250 g de sucre)
 * `besoinVoulu`  : ce qu'on veut y mettre (1 000 g)
 *   → 6 × (1 000 / 250) = 24 tartes, et tout le reste suit.
 *
 * Rend `null` quand le calcul n'a pas de sens — un ingrédient à zéro ne donne
 * aucune échelle, et une quantité vide n'est pas une demande.
 */
export function quantitePour({ quantite, besoinActuel, besoinVoulu }) {
  const q = nombre(quantite)
  const a = nombre(besoinActuel)
  const v = nombre(besoinVoulu)
  if (q === null || a === null || v === null) return null
  if (!(q > 0) || !(a > 0) || !(v > 0)) return null
  // Trois décimales : au-delà, c'est du bruit sur une balance de labo.
  return Math.round(q * (v / a) * 1000) / 1000
}

// ============================================================
// LES RECETTES DÉJÀ LUES, GARDÉES SOUS LA MAIN.
//
// « Que les recettes se chargent une fois pour toutes ; si besoin de mise à
// jour, bouton pour tout charger — comme ça c'est pas long » (Layla,
// 2026-09-23). Chaque ouverture repartait chez Odoo : une seconde et demie à
// chaque clic, pour une recette qui n'a pas bougé depuis des semaines.
//
// On garde donc dans le téléphone (`localStorage`, pas la session : ça doit
// survivre à la fermeture de l'app) — et c'est le BOUTON qui décide quand tout
// relire. Une recette corrigée dans Odoo n'apparaît pas toute seule : c'est
// assumé, et c'est justement ce qui rend l'écran instantané.
// ============================================================

const CLE = 'lg:recettes'
const CLE_LISTE = 'lg:recettes-liste'
// Tout le catalogue tient dedans (une centaine d'articles) : c'est le but,
// « que dès que j'ouvre ça s'affiche systématiquement ». Le plafond n'est plus
// là que pour empêcher une dérive — un article retiré du catalogue, un
// renommage — de faire grossir le stockage sans fin.
const MAX = 300

/**
 * Ranger une recette, en laissant partir les plus vieilles.
 *
 * À part et testée, parce que c'est la seule vraie règle ici : sans plafond,
 * le stockage finit plein, et `localStorage` refuse alors TOUT en silence.
 */
export function ajouterAuCache(cache, produit, noeud, maintenant = Date.now(), max = MAX) {
  const suivant = { ...(cache || {}), [produit]: { quand: maintenant, noeud } }
  const noms = Object.keys(suivant)
  if (noms.length <= max) return suivant
  const trop = noms
    .sort((a, b) => (suivant[a].quand || 0) - (suivant[b].quand || 0))
    .slice(0, noms.length - max)
  for (const n of trop) delete suivant[n]
  return suivant
}

const lire = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* plein : tant pis */ } }
const oublier = k => { try { localStorage.removeItem(k) } catch { /* rien à faire */ } }

// ⚠️ UNE COPIE EN MÉMOIRE, relue une seule fois. Cent recettes, c'est un gros
// JSON : le relire et le réécrire à chaque article préchargé, c'était geler
// l'écran pendant le chargement. Le disque ne sert qu'à survivre à la
// fermeture de l'app.
let memo = null
const toutes = () => (memo ||= lire(CLE) || {})

export const recetteGardee = produit => toutes()[produit]?.noeud || null
export const recettesGardees = () => Object.keys(toutes())

export function garderLaRecette(produit, noeud) {
  memo = ajouterAuCache(toutes(), produit, noeud)
  ecrire(CLE, memo)
}

/** Un paquet d'un coup : une seule écriture sur le disque, pas cinquante. */
export function garderDesRecettes(articles) {
  let c = toutes()
  for (const a of articles || []) if (a?.produit) c = ajouterAuCache(c, a.produit, a)
  memo = c
  ecrire(CLE, memo)
}

export const listeGardee = () => lire(CLE_LISTE)
export const garderLaListe = l => ecrire(CLE_LISTE, l)

/** Le bouton « Mettre à jour » : on oublie tout, on relira chez Odoo. */
export const toutOublier = () => { memo = {}; oublier(CLE); oublier(CLE_LISTE) }
