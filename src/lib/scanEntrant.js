// ============================================================
// CE QUE LE QR DEMANDE, RETENU AVANT QUE L'ADRESSE NE SOIT EFFACÉE.
//
// « Scanne pour déclarer n'emmène pas vers l'article direct, ça emmène vers
// tous les articles à faire » (Layla, 2026-09-20).
//
// ⚠️ LA CAUSE : au démarrage, `App.jsx` range l'onglet dans l'adresse
// (`history.replaceState('?view=…')`) — et emporte au passage le `?article=`
// du scan. L'écran de fabrication, chargé à la demande, arrive APRÈS : il ne
// trouvait plus qu'une adresse vide et affichait donc sa liste d'accueil.
//
// Ce fichier est importé par `main.jsx`, donc lu au tout premier instant,
// avant React. Il met de côté ce que le QR demandait ; l'adresse peut ensuite
// être réécrite, on ne perd rien.
// ============================================================

const lu = (() => {
  try {
    const sp = new URLSearchParams(window.location.search)
    const article = sp.get('article')
    if (!article) return null
    return { article, declarer: sp.get('declarer') === '1' }
  } catch {
    return null   // pas d'adresse lisible (rendu hors navigateur)
  }
})()

let restant = lu

/**
 * Ce que le scan demandait — UNE SEULE FOIS.
 *
 * On le vide en le rendant : revenir sur l'écran plus tard, ou changer
 * d'onglet et revenir, ne doit pas rouvrir la déclaration une deuxième fois.
 */
export function prendreLeScan() {
  const x = restant
  restant = null
  return x
}

/**
 * Poser une demande sans passer par l'adresse — quand on vient de « À
 * déclarer » et qu'on est déjà dans l'app.
 *
 * ⚠️ L'onglet « À déclarer » ne déclare RIEN lui-même (Layla, 2026-09-20 :
 * « à déclarer, enlève le bouton déclarer »). Il avait sa propre petite saisie,
 * qui refaisait une déclaration appauvrie à côté de l'écran qui connaît les
 * cuves, le pressage et le reste de la crème. Toucher une ligne ouvre donc le
 * vrai écran, exactement comme le QR.
 */
export function poserLeScan(demande) {
  restant = demande || null
}
