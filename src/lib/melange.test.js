// ============================================================
// « L'APPAREIL À FLAN », EN UNE LIGNE.
//
// « Enlever les ingrédients et noter le total de l'appareil à flan »
// (Layla, 2026-09-12). Dans le rappel « Pour 1 … », sept lignes de matières
// premières n'apprennent rien ; ce qu'on veut savoir, c'est combien
// d'appareil va dans un flan — 1 568 g.
//
// ⚠️ Ce n'est PAS une cuve. Une cuve se fait en entier quoi qu'il arrive et
// Odoo la consomme en entier ; un mélange suit le nombre de gâteaux. Le flan
// est lancé tantôt par 1, tantôt par 2 (60 ordres relevés) : une cuve fixe se
// tromperait une fois sur deux. Ce regroupement ne touche QUE l'affichage.
// ============================================================
import { describe, it, expect } from 'vitest'
import { melangeDe } from './ecranSimple'

describe('le mélange du flan', () => {
  it('les sept ingrédients de l’appareil sont reconnus', () => {
    for (const n of ['MP- Crème whipping', 'MP- Lait UHT', 'MP- Vanille Gousse Bourbon',
      'MP- Sucre Granule', 'MP- Oeufs entier', 'MP- Maizena', 'MP- Beurre entremets']) {
      expect(melangeDe('SM- flan vanille 20 cm', n)).toBe("L'appareil à flan")
    }
  })

  it('⚠️ le pécan, la base et le praliné restent à part', () => {
    // Ce sont la garniture et le fond, pas l'appareil — Layla les a laissés
    // dehors dans l'aperçu qu'elle a validé.
    for (const n of ['SM. Pécan caramélise flan Production',
      'SM- base flan vanille 20 cm', 'MP- Praliné Noisette 50%']) {
      expect(melangeDe('SM- flan vanille 20 cm', n)).toBe(null)
    }
  })

  it('⚠️ l’espace INSÉCABLE d’Odoo ne casse pas la reconnaissance', () => {
    // Le lait du royal n'était pas figé pour cette raison exacte (2026-09-10).
    expect(melangeDe('SM- flan vanille 20 cm', 'MP- Lait UHT')).toBe("L'appareil à flan")
  })

  it('les autres gâteaux ne sont pas touchés', () => {
    expect(melangeDe('SM- Tiramisu indiv', 'MP- Lait UHT')).toBe(null)
    expect(melangeDe('SM- Royal Chocolat 20 cm', 'MP- Crème whipping')).toBe(null)
    expect(melangeDe('', 'MP- Lait UHT')).toBe(null)
  })

  it('le total : 1 568 g pour un flan', () => {
    const recette = { 'MP- Crème whipping': 500, 'MP- Lait UHT': 500,
      'MP- Vanille Gousse Bourbon': 8, 'MP- Sucre Granule': 160,
      'MP- Oeufs entier': 200, 'MP- Maizena': 100, 'MP- Beurre entremets': 100,
      'SM. Pécan caramélise flan Production': 100, 'MP- Praliné Noisette 50%': 100 }
    const total = Object.entries(recette)
      .filter(([n]) => melangeDe('SM- flan vanille 20 cm', n))
      .reduce((t, [, g]) => t + g, 0)
    expect(total).toBe(1568)
  })
})
