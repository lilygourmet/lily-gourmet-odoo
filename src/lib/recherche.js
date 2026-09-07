// ============================================================
// Chercher comme on parle, pas comme la base est écrite.
//
// Les noms d'articles sont longs et pénibles à taper juste :
// « SM. Genoise Vanille KG commun », « Sm- Le Citron Framboise (10) ».
// À l'atelier on tape vite, sur une tablette, avec les doigts pleins de farine :
//   • dans le désordre      « vanille genoise »
//   • avec une faute        « gribha behla », « chantily »
//   • sans les accents      « genoise creme »
//   • en abrégé             « cit fram »
// Le `includes()` d'avant ne trouvait rien de tout ça.
//
// La règle : CHAQUE mot tapé doit se retrouver dans le nom, dans n'importe quel
// ordre, à une faute près pour les mots assez longs. Un mot en trop fait
// disparaître le résultat — c'est ce qui permet d'affiner en tapant.
// ============================================================

/** Sans accents, sans majuscules, sans ponctuation : « Crème brûlée » → « creme brulee ». */
export function aplatir(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // les accents partent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')                        // - . ( ) / deviennent des espaces
    .trim()
}

/**
 * Le nombre de corrections pour passer d'un mot à l'autre (Levenshtein), en
 * s'arrêtant dès qu'on dépasse `max` : inutile de calculer 8 quand on refuse à 2.
 */
export function distance(a, b, max = 2) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let avant = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const courant = [i]
    let mini = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      courant[j] = Math.min(avant[j] + 1, courant[j - 1] + 1, avant[j - 1] + cout)
      if (courant[j] < mini) mini = courant[j]
    }
    if (mini > max) return max + 1        // toute la ligne est déjà trop loin
    avant = courant
  }
  return avant[b.length]
}

/**
 * Combien de fautes on pardonne : aucune sur un mot court, où une lettre change
 * le sens (« cbs » n'est pas « cds »), deux sur un mot long — « gribha » pour
 * « ghriba » en demande déjà deux.
 */
function tolerance(mot) {
  if (mot.length <= 3) return 0
  if (mot.length <= 5) return 1
  return 2
}

/** Ce mot-là se retrouve-t-il dans ces mots-ci ? */
function motDedans(mot, mots) {
  // le plus courant : un début de mot (« cit » pour « citron »)
  for (const m of mots) if (m.startsWith(mot)) return true
  for (const m of mots) if (m.includes(mot)) return true
  const t = tolerance(mot)
  if (!t) return false
  // Une faute de frappe : « gribha » pour « ghriba ». La première lettre doit
  // tenir — sans ça « carton » rattrapait « citron », et la liste se remplissait
  // de voisins qui n'ont rien à voir.
  for (const m of mots) {
    if (m[0] !== mot[0]) continue
    if (Math.abs(m.length - mot.length) > t) continue
    if (distance(m, mot, t) <= t) return true
  }
  return false
}

/**
 * `texte` répond-il à ce qui est tapé ? Une requête vide accepte tout, pour que
 * l'écran montre sa liste tant que personne n'a rien tapé.
 */
export function correspond(texte, requete) {
  const q = aplatir(requete)
  if (!q) return true
  const cible = aplatir(texte)
  if (cible.includes(q)) return true          // tapé exactement, dans l'ordre
  const mots = cible.split(' ').filter(Boolean)
  return q.split(' ').filter(Boolean).every(mot => motDedans(mot, mots))
}

/**
 * Filtre une liste et la range : ce qui commence par ce qui est tapé d'abord,
 * puis ce qui le contient, puis les rattrapages à une faute près.
 */
export function chercher(liste, requete, texteDe = x => x) {
  const q = aplatir(requete)
  if (!q) return liste
  const note = x => {
    const c = aplatir(texteDe(x))
    if (c.startsWith(q)) return 0
    if (c.includes(q)) return 1
    return 2
  }
  return liste
    .filter(x => correspond(texteDe(x), requete))
    .map((x, i) => ({ x, i, n: note(x) }))
    .sort((a, b) => a.n - b.n || a.i - b.i)     // à note égale, l'ordre d'origine
    .map(o => o.x)
}
