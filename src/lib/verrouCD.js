import { manqueTolerable } from './fabAnnexe'

/**
 * LE VERROU DE FABRICATION CD : ce composant empêche-t-il de dire « c'est fait » ?
 *
 * Sorti de l'écran pour être testable — c'est la règle qui a laissé passer deux
 * gâteaux le 2026-09-12, il ne faut pas qu'elle reparte de travers.
 *
 * ⚠️ CE QUI A CLOCHÉ. L'écran écartait du verrou tout ce qui s'appelle « SM. »
 * (avec le point), via une liste qui servait à l'origine à ne PAS déplier
 * certaines recettes à l'affichage. Or les crèmes du cake design s'appellent
 * justement « SM. CD* Crème Pâtissière », « SM. CD* Crème au Beurre Praliné » :
 * elles n'étaient jamais regardées, même à stock ZÉRO. La crème au beurre
 * vanille de WHLVP/MO/202582 s'est déclarée faite avec 0 g de crème pâtissière
 * sur les 850 demandés, et le 24x31 Praliné de la commande S52693 avec 0,08 kg
 * de praliné sur 0,9.
 *
 * Ce qui reste hors du verrou, et seulement ça :
 *   · les BASES — elles se cochent dans le bloc du haut, pas ici ;
 *   · la génoise et l'eau du robinet — jamais bloquantes (règle de Layla) ;
 *   · ce qui n'a PAS de recette dans Odoo : l'app ne saurait ni la montrer ni
 *     lancer l'ordre, bloquer là-dessus condamnerait l'article pour toujours ;
 *   · ce qui est déjà déclaré fait pour ce lot-là.
 *
 * Et la tolérance est celle de l'annexe, au chiffre près (`manqueTolerable`) :
 * au plus 5 % du besoin ET au plus 50 g, jamais sur ce qui se compte à la
 * pièce. Quelques grammes de balance ne bloquent pas un gâteau qui est monté.
 */
export function bloqueSur({ besoin, unite, dispo, aRecette = true, declare = false, exempte = false }) {
  if (declare || exempte || !aRecette) return false
  const d = Number(dispo) || 0
  // Rien du tout : ça bloque, quelle que soit la quantité demandée.
  if (d <= 0.001) return true
  const b = Number(besoin) || 0
  // Sans besoin connu, on ne dresse pas de mur sur un calcul qu'on n'a pas.
  if (!(b > 0)) return false
  if (d >= b - 1e-7) return false                     // il y en a assez
  // ⚠️ L'unité passe TELLE QUELLE : `manqueTolerable` a besoin de savoir si
  // ces nombres sont des grammes ou des kilos pour juger les 50 g, et il
  // refuse de lui-même la moindre tolérance sur les pièces.
  return !manqueTolerable(b, d, unite)
}
