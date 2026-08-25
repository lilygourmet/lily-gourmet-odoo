import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================
// Garde-fou : tout écran doit être RANGEABLE par l'utilisateur.
//
// Un écran déclaré dans navTabs.js apparaît dans « Ranger mes onglets » — dans
// le cadre « Pas encore rangés » tant qu'on ne l'a pas classé. Un écran oublié
// là devient introuvable : ni dans la barre, ni dans le réglage (c'est arrivé
// aux onglets Fabrication).
//
// Si ce test échoue : ajoute ton écran dans TAB_DEFS (src/lib/navTabs.js).
// S'il ne doit VRAIMENT pas être un onglet (ouvert par un lien ou un bouton),
// ajoute-le ci-dessous en expliquant pourquoi.
// ============================================================

const racine = path.resolve(__dirname, '../..')
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8')

// Écrans qui ne sont pas des onglets, et pourquoi.
const HORS_BARRE = {
  'caisse-rapide': "lien direct donné à Meriem (?view=caisse-rapide), pas un onglet",
  'nouvelle-commande': "panneau ouvert depuis une conversation, pas un onglet",
  'presence': "bouton dédié dans la barre du haut (accès à tout le monde)",
  'absences': "ouvert depuis l'écran Présence",
}

describe('rangement des onglets', () => {
  const routees = [...new Set(
    [...lire('src/App.jsx').matchAll(/activeView === '([^']+)'/g)].map(m => m[1])
  )]
  const declarees = new Set(
    [...lire('src/lib/navTabs.js').matchAll(/\{ view: '([^']+)'/g)].map(m => m[1])
  )

  it('chaque écran de l\'app est rangeable (ou déclaré hors barre)', () => {
    const oublies = routees.filter(v => !declarees.has(v) && !(v in HORS_BARRE))
    expect(oublies, `Écran(s) introuvable(s) pour l'utilisateur : ${oublies.join(', ')}.
Ajoute-les dans TAB_DEFS (src/lib/navTabs.js) pour qu'ils apparaissent dans
« Ranger mes onglets », ou dans HORS_BARRE de ce test s'ils ne sont pas des onglets.`).toEqual([])
  })

  it('la liste des écrans hors barre reste à jour', () => {
    const morts = Object.keys(HORS_BARRE).filter(v => !routees.includes(v))
    expect(morts, `Ces écrans n'existent plus dans App.jsx : ${morts.join(', ')}`).toEqual([])
  })

  // Ces onglets n'ouvrent pas un écran de l'app : lien externe, ou vue par défaut.
  const SANS_ECRAN_INTERNE = {
    calendar: "vue par défaut de l'app, pas de test activeView",
    'cake-vision-link': 'ouvre le site Galerie CD (lien externe)',
    'ai-gemini': 'ouvre Gemini (lien externe)',
    'ai-chatgpt': 'ouvre ChatGPT (lien externe)',
  }

  it('un onglet déclaré mène bien quelque part', () => {
    const sansEcran = [...declarees].filter(v => !routees.includes(v) && !(v in SANS_ECRAN_INTERNE))
    expect(sansEcran, `Onglet(s) sans écran correspondant : ${sansEcran.join(', ')}.
Soit l'écran manque dans App.jsx, soit c'est un lien externe à déclarer dans
SANS_ECRAN_INTERNE de ce test.`).toEqual([])
  })
})
