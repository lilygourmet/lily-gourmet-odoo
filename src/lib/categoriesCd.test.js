// ============================================================
// « Regrouper mini/maxi par catégorie » (Layla, 2026-09-21) — par le TYPE lu
// dans le nom, pas par la catégorie d'Odoo (quatre paquets dont un « All »).
// ============================================================
import { describe, it, expect } from 'vitest'
import { categorieCd, parCategorieCd } from './categoriesCd'

const cat = n => categorieCd(n).nom

describe('à quelle catégorie appartient un article', () => {
  it('les cadres et les formes', () => {
    expect(cat('SM CD*- 13x13 Cakedesign')).toBe('Cadres & formes')
    expect(cat('SM CD*- 15 cm Vanille Bleu')).toBe('Cadres & formes')
    expect(cat('SM CD*- 18cm Bombe Cakedesign')).toBe('Cadres & formes')
    expect(cat('SM CD*. Coeur 15p Cakedesign')).toBe('Cadres & formes')
  })

  it('les crèmes', () => {
    expect(cat('SM CD*. Creme au Beurre Praline')).toBe('Crèmes')
    expect(cat('SM CD*. Creme Citron STK')).toBe('Crèmes')
    expect(cat('SM CD*. Creme Patissiere')).toBe('Crèmes')
  })

  it('les pâtes, sirops et finitions', () => {
    expect(cat('SM CD*. Pate a Sucre Melange')).toBe('Pâtes, sirops & finitions')
    expect(cat('SM CD*. Sirop Imbibage kg')).toBe('Pâtes, sirops & finitions')
    expect(cat('SM CD*. Glacage Royal')).toBe('Pâtes, sirops & finitions')
    expect(cat('SM CD*. Amandes Caramelisees')).toBe('Pâtes, sirops & finitions')
  })

  it('les accessoires, reconnus à « Accs »', () => {
    expect(cat('SM CD*. Boule Cake Pops Accs')).toBe('Accessoires')
    expect(cat('SM CD*. Magnum CBS Accs')).toBe('Accessoires')
    // ⚠️ Et il passe AVANT les formes : une base de cupcake n'est pas un cadre.
    expect(cat('SM CD*. Base Mini Cupcake Vanille Accs')).toBe('Accessoires')
  })

  it('les gâteaux qui se vendent', () => {
    expect(cat('CD- Cakedesign 60 cm (90 pers) CD*')).toBe('Gâteaux à étages')
    expect(cat('CD- Cakedesign Letter Cake CD*')).toBe('Gâteaux à étages')
    expect(cat('CD- Cakedesign Plaque fraisier CD*')).toBe('Gâteaux à étages')
  })

  // ⚠️ L'ORDRE DES RÈGLES : une crème au beurre porte parfois une taille dans
  // son nom, un gâteau vendu porte toujours « cm ». La première règle qui
  // répond gagne, et c'est ce qui les range bien.
  it('un gâteau vendu reste un gâteau, même en 60 cm', () => {
    expect(cat('CD- Cakedesign 60 cm (90 pers) CD*')).not.toBe('Cadres & formes')
  })

  it('ce qu’on ne sait pas nommer tombe dans « Le reste »', () => {
    expect(cat('SM CD*. Truc Inconnu')).toBe('Le reste')
  })
})

describe('le rangement de l’écran', () => {
  const liste = [
    { produit: 'CD- Cakedesign 60 cm (90 pers) CD*' },
    { produit: 'SM CD*. Creme au Beurre Vanille' },
    { produit: 'SM CD*- 20x27 Cakedesign' },
    { produit: 'SM CD*. Magnum Nut Accs' },
  ]

  it('range dans l’ordre de l’atelier : les formes d’abord, la vente à la fin', () => {
    expect(parCategorieCd(liste).map(g => g.cle))
      .toEqual(['formes', 'cremes', 'accessoires', 'gateaux'])
  })

  it('ne montre pas un dossier vide', () => {
    expect(parCategorieCd([{ produit: 'SM CD*. Creme Citron' }]).map(g => g.nom))
      .toEqual(['Crèmes'])
    expect(parCategorieCd([])).toEqual([])
  })
})
