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
  // ⚠️ TOUTES LES FEUILLES D'UNE MÊME IMPRESSION PORTENT LE MÊME NUMÉRO. Une
  // cascade s'imprime d'un bloc, pour UN gâteau : servir une seule de ses
  // demandes engage la cascade entière, et l'économe ne scanne qu'une fois
  // (Layla, 2026-09-19).
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
  return j
}

/** L'économe a donné la marchandise : la déclaration devient due. */
export const donner = (id, userId) => agir(id, 'donner', { userId })

/** Ce qui est sorti de la fournée. */
export const declarer = (id, qty) => agir(id, 'declarer', { qty })

/**
 * « Pas faite » — une réponse valable, et il en faut une.
 * Sans porte de sortie, ils cesseraient de passer par l'économe, et on perdrait
 * justement la trace qu'on cherche à construire.
 */
export const pasFaite = (id, motif = '') => agir(id, 'pas-faite', { motif })

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
 * Ce qui est DÛ : donné par l'économe, et toujours pas déclaré.
 *
 * ⚠️ Ce qui est déclaré n'y est plus. « Que ce qui reste à déclarer » (Layla) :
 * une liste vide veut dire qu'il n'y a rien à faire — et rien à cliquer.
 */
export const aDeclarer = feuilles =>
  (feuilles || []).filter(f => etatFeuille(f) === 'a-declarer')

/** Ce que l'économe n'a pas encore donné. */
export const aDonner = feuilles =>
  (feuilles || []).filter(f => etatFeuille(f) === 'imprimee')
