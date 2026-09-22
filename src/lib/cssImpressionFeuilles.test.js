// ============================================================
// LE PIÈGE D'IMPRESSION DE L'IPHONE, GARDÉ PAR UN TEST.
//
// Il est revenu DEUX FOIS. Retiré le 2026-09-18 sur un mauvais diagnostic,
// remis le lendemain — et le 2026-09-22 Layla imprime sa Voile Mangue Passion :
// « ça m'a sorti que la demande d'économat », puis « oui de l'iPhone, encore
// des pages blanches qui sortent ».
//
// LA RÈGLE : un bloc qui doit se COUPER entre deux pages ne porte jamais
// `display: flex` ni une hauteur imposée en centimètres. 23 cm de hauteur plus
// les marges dépassent la hauteur imprimable que l'iPhone se choisit : chaque
// feuille déborde d'un poil sur la suivante (les pages blanches), et WebKit
// renonce à couper la boîte flexible (la feuille qui manque).
//
// Les rangées d'UNE ligne — la bande du chiffre, une ligne d'ingrédient, une
// signature — ont le droit d'être flexibles : elles ne se coupent jamais.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8')

/** Le corps d'une règle CSS, par son sélecteur exact. */
const regle = sel => {
  const i = css.indexOf(`\n  ${sel} {`)
  if (i < 0) return null
  return css.slice(i, css.indexOf('}', i))
}

// Les blocs qui se paginent : une feuille = une page.
const PAGINES = ['.feuille-impr', '.feuille-economat', '.feuille-sortie']

describe('les feuilles à imprimer se coupent entre les pages', () => {
  it('aucun bloc paginé n’impose de hauteur en centimètres', () => {
    for (const sel of PAGINES) {
      const r = regle(sel)
      if (!r) continue
      expect(r, `${sel} impose une hauteur : l’iPhone sortira des pages blanches`)
        .not.toMatch(/(min-)?height\s*:\s*[\d.]+\s*cm/)
    }
  })

  it('aucun bloc paginé n’est une boîte flexible', () => {
    for (const sel of PAGINES) {
      const r = regle(sel)
      if (!r) continue
      expect(r, `${sel} est en flex : WebKit renonce à le couper`)
        .not.toMatch(/display\s*:\s*(inline-)?flex/)
    }
  })

  // ⚠️ `margin-top: auto` ne pousse en bas QUE dans une boîte flexible. Le
  // laisser sans elle, c'est croire que le cadre est en bas de page alors
  // qu'il est collé à la recette.
  it('plus de « margin-top: auto » dans les feuilles', () => {
    const bloc = css.slice(css.indexOf('@media print'))
    expect(bloc).not.toMatch(/margin-top\s*:\s*auto/)
  })

  it('et chaque feuille demande bien sa propre page', () => {
    expect(regle('.feuille-impr')).toMatch(/page-break-after\s*:\s*always/)
  })
})
