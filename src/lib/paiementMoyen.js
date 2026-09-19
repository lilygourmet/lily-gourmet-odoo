// ============================================================
// COMMENT LE CLIENT A PAYÉ : virement bancaire, ou carte en ligne.
//
// Les deux ne demandent pas le même travail. Un VIREMENT, il faut le retrouver
// sur le relevé de la banque ; une CB EN LIGNE est déjà encaissée. D'où la
// règle de Layla (2026-09-19) : « ils ne doivent pas les mélanger » — l'écran
// des paiements n'en montre qu'une famille à la fois, jamais les deux.
//
// ⚠️ ET LA COULEUR NE SUFFIT PAS (Layla, même jour). Un trait doré ne dit rien
// à qui ne connaît pas le code, ne se voit pas sur un écran fatigué et
// disparaît à l'impression. Le MOT est donc écrit partout où la couleur
// apparaît — c'est pour ça que les deux vivent ici ensemble, et jamais l'un
// sans l'autre.
// ============================================================

/**
 * Les deux moyens, dans l'ordre où ils s'affichent.
 *
 * `court` sert à l'étiquette sur la carte, `label` + `sous` aux deux grosses
 * cases du formulaire. Les couleurs reprennent celles de l'app : l'or pour ce
 * qui reste à vérifier à la banque, le vert pour ce qui est déjà encaissé.
 */
export const MOYENS = [
  {
    cle: 'virement',
    emoji: '🏦',
    label: 'Virement',
    sous: 'bancaire',
    court: 'VIREMENT',
    bord: 'border-l-gold',
    pastille: 'bg-gold-pale text-gold border-gold',
    actif: 'bg-gold text-cream border-gold',
  },
  {
    cle: 'cb',
    emoji: '💳',
    label: 'CB',
    sous: 'en ligne',
    court: 'CB EN LIGNE',
    bord: 'border-l-success',
    pastille: 'bg-success-bg text-success border-success',
    actif: 'bg-success text-cream border-success',
  },
]

/**
 * Ce qu'on affiche pour les preuves d'AVANT le 19/09/2026.
 *
 * Elles sont 570 et n'ont aucun moyen enregistré. On ne le devine pas : leur
 * inventer un virement, c'est écrire une information qu'on n'a pas. Elles ont
 * donc leur propre famille, en pointillés, qui ne se montre que s'il en reste.
 */
export const NON_PRECISE = {
  cle: 'inconnu',
  emoji: '•',
  label: 'Non précisé',
  sous: 'avant le 19/09',
  court: 'NON PRÉCISÉ',
  bord: 'border-l-line',
  pastille: 'bg-cream-deep text-ink-mute border-ink-mute border-dashed',
  actif: 'bg-ink-mute text-cream border-ink-mute',
}

/** Le moyen d'une preuve — jamais `undefined`, pour ne rien avoir à tester ailleurs. */
export function moyenDe(m) {
  return MOYENS.find(x => x.cle === m?.payment_method) || NON_PRECISE
}
