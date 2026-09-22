// ============================================================
// PRESQUE LÀ : il en manque si peu que ce n'est pas une pénurie, c'est la
// balance.
//
// « 100 g, pour quelques grammes qui manquent, je pense c'est ok de laisser
// l'app prendre l'article et mettre consommé tout » (Layla, 2026-09-11) — le
// pécan du flan, 97 g pour 100 demandés. Puis, le 2026-09-22, devant 636 g de
// crème pâtissière pour 640 demandés : « quand ça se rapproche, le laisser ».
//
// ⚠️ CETTE RÈGLE VIT ICI, ET NULLE PART AILLEURS. Elle servait déjà à
// Fabrication CD et à l'annexe ; « À valider » la réclamait à son tour, et le
// serveur ne peut pas importer `fabAnnexe.js` (qui parle à Supabase et au
// navigateur). Plutôt que de la recopier — c'est comme ça qu'on se retrouve
// avec deux règles qui divergent —, elle est seule, ici, sans dépendance.
// ============================================================
// ⚠️ L'extension EST OBLIGATOIRE : ce fichier est importé par le serveur
// (`api/freezer-list.js`), où Node résout les modules sans l'ajouter tout seul.
import { enGrammes } from './unites.js'

// Deux garde-fous, choisis par Layla le 2026-09-12 :
//   • au plus 5 % du besoin — 3 g sur 100, c'est la balance ; 3 g sur 10,
//     c'est un tiers de la recette ;
//   • au plus 50 g — sur une cuve de 5 kg, 5 % feraient 250 g, et 250 g de
//     crème qui manquent, ce n'est plus une imprécision.
const PART_TOLEREE = 0.05
const GRAMMES_TOLERES = 50

/**
 * Ce manque-là est-il celui de la balance ?
 *
 * ⚠️ JAMAIS sur ce qui se compte à la PIÈCE. Il manque un fond de tarte sur
 * dix : ce n'est pas la balance, c'est une tarte qu'on ne peut pas faire.
 *
 * ⚠️ Et JAMAIS quand il n'y a RIEN : zéro n'est pas « presque tout ».
 */
export function manqueTolerable(besoin, dispo, unite) {
  if (/^units?$|^u$/i.test(String(unite || '').trim())) return false
  const b = Number(besoin) || 0
  const d = Number(dispo) || 0
  const manque = b - d
  if (!(b > 0) || !(manque > 0) || !(d > 0)) return false
  const enG = enGrammes(manque, unite)
  return manque <= b * PART_TOLEREE && enG !== null && enG <= GRAMMES_TOLERES
}
