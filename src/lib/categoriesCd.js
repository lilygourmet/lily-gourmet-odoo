// ============================================================
// LES CATÉGORIES DE « MINI / MAXI CD ».
//
// « Regrouper mini/maxi par catégorie » (Layla, 2026-09-21). L'écran alignait
// 293 articles à la suite : on y cherchait une crème au beurre entre deux
// cadres de 40x40.
//
// ⚠️ PAS LA CATÉGORIE D'ODOO, et c'est son choix : « le type d'article, lu
// dans le nom ». Mesuré le jour même — Odoo range ces 293 articles en quatre
// paquets (Cake design SM : 155, Cake design : 78, All : 32, Produits Semi
// Finis : 28), dont un « All » qui ne veut rien dire et un autre qui contient
// la moitié de l'écran. Le nom, lui, dit vraiment ce qu'est l'article.
//
// ⚠️ L'ORDRE COMPTE : on lit de haut en bas, et la première règle qui répond
// gagne. « SM CD*. Coeur 15p » est une forme avant d'être autre chose.
// ============================================================

const plat = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const REGLES = [
  // Les accessoires se reconnaissent à leur suffixe « Accs » — cupcakes,
  // cake pops, magnums. Ils passent en premier : un « Base Grand Cupcake
  // Chocolat Accs » n'est pas une base de gâteau.
  { cle: 'accessoires', emoji: '🧁', nom: 'Accessoires', test: n => /\baccs\b/.test(n) },
  // Ce qui se VEND, monté et décoré : les étages, les letter cakes, les plaques.
  { cle: 'gateaux', emoji: '🎂', nom: 'Gâteaux à étages', test: n => /^cd\s*-/.test(n) },
  // Les crèmes, avant les formes : « SM CD*. Creme au Beurre » n'est pas un cadre.
  { cle: 'cremes', emoji: '🥣', nom: 'Crèmes', test: n => /\bcreme/.test(n) },
  // Ce qui se cuit et se coupe à une taille : 13x13, 15 cm, bombes, cœurs.
  { cle: 'formes', emoji: '⬛', nom: 'Cadres & formes',
    test: n => /\d+\s*x\s*\d+|\d+\s*cm|\bbombe\b|\bcoeur\b|letter/.test(n) },
  // Tout ce qui se prépare et se garde : pâtes, sirops, glaçages, croquants.
  { cle: 'bases', emoji: '🍫', nom: 'Pâtes, sirops & finitions',
    test: n => /\bpate\b|\bsirop\b|\bglacage\b|craquant|amandes/.test(n) },
]

const RESTE = { cle: 'autres', emoji: '📦', nom: 'Le reste' }

/** À quelle catégorie appartient cet article ? */
export function categorieCd(produit) {
  const n = plat(produit)
  return REGLES.find(r => r.test(n)) || RESTE
}

/**
 * Les articles rangés par catégorie, dans l'ordre de l'atelier : ce qu'on
 * prépare tous les jours d'abord, ce qui se vend à la fin.
 *
 * Une catégorie vide ne s'affiche pas — on ne montre pas un dossier pour rien.
 */
export function parCategorieCd(articles) {
  const paquets = new Map()
  for (const a of articles || []) {
    const c = categorieCd(a.produit)
    const e = paquets.get(c.cle) || { ...c, articles: [] }
    e.articles.push(a)
    paquets.set(c.cle, e)
  }
  const ordre = ['formes', 'cremes', 'bases', 'accessoires', 'gateaux', 'autres']
  return ordre.map(k => paquets.get(k)).filter(Boolean)
}
