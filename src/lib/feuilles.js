// ============================================================
// LA FEUILLE DE FOURNÉE, DE L'IMPRESSION À LA DÉCLARATION.
//
// « Les pâtissiers impriment les recettes, prennent les ingrédients, font les
// recettes, mais ne déclarent pas ce qu'ils ont fait » (Layla, 2026-09-19).
//
// SA RÈGLE, et c'est la bonne : **imprimer n'engage à rien** — on peut imprimer
// et ne jamais aller chercher la marchandise. C'est le moment où l'économe
// DONNE qui engage. À partir de là, la déclaration est due.
//
// Chaque feuille imprimée porte un QR. Deux papiers, deux gestes, et ils ne se
// mélangent pas parce qu'ils ne restent pas au même endroit :
//   • la DEMANDE À L'ÉCONOMAT reste chez l'économe → « ✓ Donné » ;
//   • la FEUILLE DE RECETTE part avec le pâtissier → « déclarer ».
// Même feuille, même jeton : c'est l'adresse du QR qui dit lequel des deux.
// ============================================================

import qr from 'qrcode-generator'
import { aBesoinDeLEconomat } from './feuillesAImprimer'

/** Un jeton par feuille, fabriqué ICI. */
export function nouvelId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID()
  } catch { /* vieux navigateur */ }
  // Repli : 32 chiffres au hasard, au format d'un uuid.
  const h = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** L'adresse que le QR ouvre. `don` = le papier de l'économe. */
export function lienFeuille(id, don = false) {
  return `${window.location.origin}/?feuille=${id}${don ? '&don=1' : ''}`
}

/**
 * Le QR, en image prête à imprimer.
 *
 * ⚠️ Une IMAGE, pas un dessin : une image s'imprime partout pareil, y compris
 * depuis un téléphone — et toute cette chaîne d'impression a déjà coûté assez
 * cher en surprises (voir `index.css`, les pièges iPhone).
 */
export function imageQr(id, don = false) {
  const g = qr(0, 'M')
  g.addData(lienFeuille(id, don))
  g.make()
  return g.createDataURL(4, 1)
}

/**
 * On vient d'imprimer : on pose les feuilles côté serveur.
 *
 * ⚠️ SANS FAIRE ATTENDRE L'IMPRESSION. Les jetons sont fabriqués ici, donc le
 * QR part sur le papier tout de suite ; l'enregistrement suit à son rythme.
 * Si le réseau tombe, on perd le suivi — jamais l'impression.
 */
export function poserFeuilles(feuilles, userId) {
  const utiles = (feuilles || []).filter(f => f.feuilleId)
  if (!utiles.length) return
  // ⚠️ TOUTES LES FEUILLES D'UNE MÊME IMPRESSION PORTENT LE MÊME NUMÉRO. Il
  // n'engage RIEN : l'économe scanne feuille par feuille, sinon on écrirait
  // qu'il a donné une matière qu'il n'a pas sortie (Layla, 2026-09-19). Ce
  // numéro sert seulement à lui dire ce qui l'attend encore pour ce gâteau.
  const liasse = nouvelId()
  const corps = JSON.stringify({
    userId: userId || null,
    liasse,
    feuilles: utiles.map(f => ({
      id: f.feuilleId,
      produit: f.produit,
      libelle: f.libelle || null,
      unite: f.unite || null,
      qty: f.qty,
      pour: (f.chemin || [])[0] || null,
      // Du gâteau jusqu'à cette recette : c'est par là que le scan la rouvrira.
      chemin: f.chemin || null,
      // ⚠️ RIEN À ALLER CHERCHER = RIEN À ATTENDRE (Layla, 2026-09-19 : « si
      // une cascade est imprimée et qu'elle n'a pas de MP, elle doit aller
      // directement dans À déclarer »). Une fournée dont tous les composants
      // sont déjà au frigo ne passe pas par l'économe — sans ça, elle serait
      // restée coincée à « pas encore donné » POUR TOUJOURS, et n'aurait
      // jamais été réclamée.
      sansEconomat: !aBesoinDeLEconomat(f),
    })),
  })
  fetch('/api/fab-annexe?feuilles=imprimees', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps,
  }).catch(() => { /* le suivi peut manquer ; l'impression, non */ })
}

/**
 * Éteindre la ligne rouge quand la déclaration est passée par l'ÉCRAN.
 *
 * ⚠️ L'écran « c'est fait » existait avant le QR, et les pâtissiers le
 * connaissent. Sans ce raccord, la fournée restait rouge dans « À déclarer »,
 * et la redéclarer comptait le travail DEUX FOIS — deux ordres Odoo, deux fois
 * le stock. On ne fait jamais attendre pour ça : la déclaration est déjà
 * enregistrée, cette ligne-ci n'est que du ménage.
 */
export function eteindreFeuille(produit, qty, fabricationId = null) {
  fetch('/api/fab-annexe?feuilles=eteindre', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produit, qty, fabricationId }),
  }).catch(() => { /* le ménage peut attendre ; la déclaration est faite */ })
}

/** Les feuilles du jour — l'écran de l'économe et celui des pâtissiers. */
export async function feuillesDuJour() {
  const r = await fetch('/api/fab-annexe?feuilles=jour&cb=' + Date.now())
  const j = await r.json()
  if (j?.error) throw new Error(j.error)
  return j.feuilles || []
}

/** Une feuille précise — ce que le QR ouvre. */
export async function lireFeuille(id) {
  const r = await fetch('/api/fab-annexe?feuille=' + encodeURIComponent(id))
  const j = await r.json()
  if (j?.error) throw new Error(j.error)
  return j.feuille
}

const agir = async (id, mode, corps = {}) => {
  const r = await fetch(`/api/fab-annexe?feuille=${encodeURIComponent(id)}&mode=${mode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  })
  const j = await r.json()
  if (j?.error) throw new Error(j.error)
  // ⚠️ Un refus n'est pas une panne : la feuille est close, et le serveur dit
  // pourquoi. On le remonte tel quel pour que l'écran l'affiche en clair.
  if (j?.refus) throw new Error(j.refus)
  return j
}

/** L'économe a donné la marchandise : la déclaration devient due. */
export const donner = (id, userId) => agir(id, 'donner', { userId })

/**
 * LE PÂTISSIER REND LA MARCHANDISE.
 *
 * « Si je veux faire un retour, c'est le pâtissier qui décide » (Layla,
 * 2026-09-20). Il est le seul à savoir qu'il ne fera pas cette fournée. La
 * ligne quitte alors « À déclarer » et va attendre chez l'économe.
 */
export const demanderRetour = (id, userId, toute = false) =>
  agir(id, 'rendre', { userId, toute })

/**
 * Le reste de la cascade qu'un retour emporterait.
 *
 * La liasse a été imprimée pour UN gâteau : sans sa crème, ni la génoise ni le
 * cadre n'ont de sens aujourd'hui. On ne touche jamais à ce qui est déjà
 * déclaré — c'est du travail fait.
 */
export const resteDeLaCascade = (feuilles, f) => (feuilles || []).filter(x =>
  x.liasse && x.liasse === f?.liasse && x.id !== f.id
  && !x.declare_le && !x.pas_faite_le && !x.retour_le)

/**
 * L'ÉCONOME CONFIRME L'AVOIR RÉCUPÉRÉE — « jusqu'à ce qu'il clique retourné ».
 * C'est le seul geste qu'il puisse honnêtement poser, et il ferme la ligne.
 */
export const retourRecu = id => agir(id, 'retour-recu', {})

/** Rendue par le pâtissier, pas encore récupérée par l'économe. */
export const enRetour = feuilles => (feuilles || []).filter(f =>
  f.retour_le && !f.pas_faite_le && !f.declare_le)

/**
 * RENDUE À L'ÉCONOME — la seule façon pour une ligne de partir sans avoir été
 * déclarée.
 *
 * ⚠️ « PAS FAITE » N'EXISTE PLUS COMME BOUTON (Layla, 2026-09-20). Une fournée
 * qu'on n'a pas eu le temps de faire n'a rien à effacer : « c'est systématique
 * gardé » — la crème attend au frigo, le travail se fera. La ligne reste donc
 * dans « À déclarer » jusqu'à ce qu'elle soit faite, sans qu'on ait à cliquer
 * quoi que ce soit.
 *
 * Elle ne disparaît que si la marchandise est REVENUE à l'économe : là, il n'y
 * a plus rien à attendre de personne.
 *
 * (La colonne s'appelle encore `pas_faite_le` en base : la renommer coûterait
 * une migration pour rien.)
 */
export const rendue = id => agir(id, 'pas-faite', { motif: 'rendue' })

/** Fini, d'une façon ou d'une autre : plus rien à en attendre. */
const clos = f => !!(f?.declare_le || f?.pas_faite_le)

/**
 * Cette feuille attend-elle encore l'économe ?
 *
 * Seules celles qui DEMANDENT quelque chose l'attendent. Les autres n'ont rien
 * à lui réclamer — elles attendent leurs sœurs (voir `aDeclarer`).
 */
const attendLEconome = f => !clos(f) && !f.sans_economat && !f.donne_le

/**
 * PAR OÙ ROUVRIR CETTE FEUILLE.
 *
 * Le chemin complet quand on l'a — « Cadre Citron › Crème au beurre › Crème
 * citron ». Une crème n'est PAS au catalogue des articles suivis : la nommer
 * seule ne l'ouvre pas, on n'y descend que depuis son gâteau.
 *
 * ⚠️ REPLI POUR LES PAPIERS D'AVANT. Les feuilles imprimées avant le
 * 2026-09-20 n'ont pas de chemin enregistré, et les papiers se ressemblent
 * tous sur le plan de travail : sans repli, scanner un vieux papier renvoyait
 * à la liste d'accueil sans rien dire. Avec `[gâteau, article]`, 8 des 10
 * derniers vieux papiers de Layla retombent juste — vérifié sur ses vraies
 * données. Les deux autres descendent de trois niveaux : l'écran pèle alors
 * une marche et ouvre le gâteau, ce qui reste utilisable.
 */
export function cheminDe(f) {
  if (f?.chemin && f.chemin.length) return f.chemin
  return f?.pour && f.pour !== f.produit ? [f.pour, f.produit] : [f?.produit]
}

/** L'état d'une feuille, en un mot. */
export function etatFeuille(f) {
  if (f?.declare_le) return 'declaree'
  if (f?.pas_faite_le) return 'pas-faite'
  if (f?.donne_le) return 'a-declarer'
  return 'imprimee'
}

/** Depuis combien de temps, en clair : « 40 min », « 5 h ». */
export function depuis(quand) {
  const t = Date.parse(quand || '')
  if (!t) return ''
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} j`
}

/**
 * CE QUI EST DÛ.
 *
 * Deux façons pour une feuille de le devenir, et elles viennent toutes deux de
 * Layla (2026-09-19) :
 *
 *   • elle DEMANDAIT de la matière → elle est due quand l'économe l'a scannée,
 *     elle et pas une autre : « sinon ça dit qu'il a donné toute la matière » ;
 *
 *   • elle ne demandait RIEN → elle est due quand plus aucune demande de sa
 *     cascade n'attend. La tarte ne réclame rien elle-même, mais on ne la monte
 *     pas tant que sa crème n'a pas été servie : « si les autres MP ne sont pas
 *     scannés, ça part pas ». Et si la cascade entière ne demande rien — tout
 *     était déjà au frigo — alors rien n'attend, et elle est due dès
 *     l'impression : « pas de MP → direct dans À déclarer ».
 *
 * ⚠️ Ce qui est déclaré n'y est plus. « Que ce qui reste à déclarer » : une
 * liste vide veut dire qu'il n'y a rien à faire — et rien à cliquer.
 */
export function aDeclarer(feuilles) {
  const liassesQuiAttendent = new Set(
    (feuilles || []).filter(attendLEconome).map(f => f.liasse))
  return (feuilles || []).filter(f => {
    if (clos(f)) return false
    // Rendue : le pâtissier n'a plus rien à en faire, elle attend l'économe.
    if (f.retour_le) return false
    if (f.donne_le) return true              // l'économe a donné : c'est dû
    if (!f.sans_economat) return false       // elle attend encore son « donné »
    // Rien à demander : elle attend que sa cascade soit servie en entier.
    // Sans liasse (une vieille ligne), on ne fait attendre personne.
    return !f.liasse || !liassesQuiAttendent.has(f.liasse)
  })
}

/**
 * Ce que l'économe a SORTI DE SA RÉSERVE et que personne n'a déclaré.
 *
 * ⚠️ ON REGARDE `donne_le`, PAS `donne_par` (Layla, 2026-09-20 : « quand je
 * redonne, ça ne me donne pas la main de re-rendre »). Le scan est anonyme —
 * c'est tout l'intérêt, les mains sont farineuses — donc `donne_par` reste
 * souvent vide. S'appuyer dessus, c'était faire disparaître le bouton dès que
 * la marchandise était donnée AU COMPTOIR plutôt que depuis l'app.
 *
 * C'est ce qu'il peut reprendre — et rien d'autre : une fournée qui n'avait
 * rien à lui demander n'a rien à lui rendre. « Rendue n'est pas à rendre »
 * (Layla, 2026-09-20).
 */
export const aReprendre = feuilles => (feuilles || []).filter(f =>
  f.donne_le && !f.declare_le && !f.pas_faite_le && !f.retour_le)

/**
 * LES INGRÉDIENTS SONT-ILS SORTIS POUR CET ARTICLE ?
 *
 * « Quand c'est figé, imprimé et ingrédient donné, ça reste figé — impossible
 * de réinitialiser à moins qu'on retourne les ingrédients » (Layla,
 * 2026-09-20).
 *
 * C'est plus strict que le verrou d'avant, et c'est juste : tant qu'on pouvait
 * réinitialiser, on pouvait prétendre après coup avoir prévu moins — alors que
 * la matière était déjà sortie de la réserve pour le compte d'origine. Odoo
 * aurait alors consommé moins que ce qui avait réellement quitté l'économat.
 *
 * Le seul moyen de rouvrir le chiffre est donc de RENDRE la marchandise. Ce
 * qui est SORTI de la fournée, lui, reste libre : on déclare toujours ce qu'on
 * a vraiment obtenu.
 */
export const ingredientsSortis = (feuilles, produit) => (feuilles || []).some(f =>
  f.produit === produit && f.donne_le && !f.retour_le && !f.declare_le && !f.pas_faite_le)

/** Ce que l'économe n'a pas encore donné — et lui seul peut le débloquer. */
export const aDonner = feuilles => (feuilles || []).filter(attendLEconome)
