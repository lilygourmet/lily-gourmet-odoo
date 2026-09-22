// ============================================================
// LES REBUTS — ce qu'on jette, et qui l'a jeté.
//
// « Il y a un endroit spécial dans Odoo pour les rebuts, tu les as vus ? »
// (Layla, 2026-09-22). Oui : `stock.scrap`, vers « Virtual Locations/Scrap »,
// et l'équipe s'en sert déjà tous les jours (huit rebuts ce jour-là, chacun
// avec son numéro SP/…).
//
// ⚠️ ON N'INVENTE DONC RIEN. Pas de table à nous, pas de SQL à lancer pour
// l'historique : Odoo le tient, numéroté, et il est consultable là-bas comme
// ici. Une table de plus, c'était deux vérités qui divergeraient.
// ============================================================
import { estModeTest } from './modeTest'
import { confirmDialog } from './confirmDialog'
import { toast } from './toast'
import { propre, qte } from './ecranSimple'

/** Ce qui a été jeté ces derniers jours, le plus récent d'abord. */
export async function loadRebuts(jours = 14) {
  const r = await fetch(`/api/fab-annexe?rebuts=1&jours=${jours}&cb=${Date.now()}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d.rebuts || []
}

/**
 * JETER. La quantité part en GRAMMES (ou en pièces), comme partout dans ces
 * écrans — c'est le serveur qui la remet dans l'unité d'Odoo.
 *
 * ⚠️ Irréversible depuis l'app : `action_validate` sort la marchandise du
 * stock pour de bon.
 */
export async function jeter({ produit, qty, motif }, userId) {
  const r = await fetch('/api/fab-annexe?rebuts=1', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produit, qty, motif, userId, test: estModeTest() }),
  })
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d
}

/** Les rebuts rangés par jour, le plus récent en haut. */
export function parJourRebut(rebuts) {
  const par = new Map()
  for (const x of rebuts || []) {
    const j = String(x.quand || '').slice(0, 10)
    if (!par.has(j)) par.set(j, { jour: j, lignes: [] })
    par.get(j).lignes.push(x)
  }
  return [...par.values()].sort((a, b) => b.jour.localeCompare(a.jour))
}

/**
 * LE GESTE DE JETER, AVEC SA CONFIRMATION — partagé par les écrans.
 *
 * ⚠️ La confirmation NOMME l'article et la quantité : « jeter 140 g de Subleme
 * Fleur d'Oranger Pistache ? ». Un « tu confirmes ? » tout seul ne dit pas ce
 * qu'on s'apprête à perdre.
 *
 * Rend `null` si on renonce, la réponse d'Odoo (avec son numéro SP/…) sinon.
 */
export async function demanderAJeter({ produit, libelle, qty, unite, motif }, userId) {
  const ok = await confirmDialog(
    `Jeter ${qte(qty, unite)} de « ${propre(libelle || produit)} » ?\n\n`
    + "Ça sort du stock d'Odoo pour de bon. On ne peut pas revenir en arrière depuis l'app.",
    { confirmLabel: 'Oui, jeter', danger: true })
  if (!ok) return null
  const r = await jeter({ produit, qty, motif }, userId)
  toast.success(r?.name ? `Jeté — ${r.name}` : 'Jeté.')
  return r
}
