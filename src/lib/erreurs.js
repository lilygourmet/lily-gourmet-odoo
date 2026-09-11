// ============================================================
// Traduire les erreurs techniques en phrases que l'atelier comprend.
//
// Vécu le 2026-09-11 : « Échec : new row violates row-level security policy
// for table "prod_fabrications" » en voulant marquer une base de flan faite.
// Personne ne peut deviner que ça veut dire « ta session a expiré ».
//
// Le jeton de connexion dure 12 heures. Une tablette allumée toute la journée
// le perd en cours de route : la lecture continue de marcher (l'écran a l'air
// normal), mais plus rien ne s'enregistre.
// ============================================================

/**
 * Est-ce que cette erreur veut dire « tu n'es plus connecté » ?
 * C'est le message que Postgres renvoie quand le rôle n'a pas le droit
 * d'écrire — chez nous, toujours parce que le jeton a expiré.
 */
export const sessionPerdue = e => /row-level security|jwt|permission denied|not authenticated/i
  .test(String(e?.message || e || ''))

/** L'erreur, dite simplement. */
export function enClairErreur(e) {
  if (sessionPerdue(e)) {
    return 'Ta session a expiré : déconnecte-toi, reconnecte-toi, et recommence. Rien n\'a été enregistré.'
  }
  return 'Échec : ' + String(e?.message || e || '')
}
