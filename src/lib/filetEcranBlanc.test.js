// @vitest-environment jsdom
// ============================================================
// LE FILET CONTRE L'ÉCRAN BLANC.
//
// « Le lien d'essai ne fonctionne plus » — page blanche (Layla, 2026-09-20).
// Le téléphone gardait la page d'avant, qui réclame des fichiers renommés
// depuis : 404, et rien ne s'affiche. Aucun code à nous ne tourne alors — d'où
// ce bout de script dans `index.html` même.
//
// Ce test le rejoue tel qu'il est écrit dans la page : s'il se met à recharger
// en boucle, c'est tout l'atelier qui s'arrête (vécu le 09/09 : « le site
// saute, se remet et saute »).
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

/** Le script de secours, extrait de la vraie page. */
const script = (() => {
  const html = fs.readFileSync('index.html', 'utf8')
  const m = html.match(/<script>\s*(\/\/ Le secours[\s\S]*?)<\/script>/)
  if (!m) throw new Error('le filet a disparu d’index.html')
  return m[1]
})()

// ⚠️ Un test qui casse `sessionStorage` doit le rendre : sans ça, tous les
// suivants héritent d'un navigateur qui refuse sa mémoire.
const vraiStockage = window.sessionStorage

let remplace
beforeEach(() => {
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true, value: vraiStockage,
  })
  vi.useFakeTimers()
  remplace = vi.fn()
  delete window.location
  window.location = { href: 'https://app.test/?article=SM.%20Creme&declarer=1', replace: remplace }
  sessionStorage.clear()
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(() => { vi.useRealTimers() })

/** Poser le filet, puis laisser passer le temps. */
const poser = (secondes = 13) => {
  // eslint-disable-next-line no-eval
  eval(script)
  vi.advanceTimersByTime(secondes * 1000)
}

describe('le filet', () => {
  it('recharge quand rien ne s’est affiché', () => {
    poser()
    expect(remplace).toHaveBeenCalledTimes(1)
  })

  // ⚠️ L'ADRESSE EST GARDÉE : le `?article=` d'un QR voyage dedans, et le
  // perdre renverrait le pâtissier à l'accueil.
  it('garde ce que le QR demandait', () => {
    poser()
    const u = new URL(remplace.mock.calls[0][0])
    expect(u.searchParams.get('article')).toBe('SM. Creme')
    expect(u.searchParams.get('declarer')).toBe('1')
    expect(u.searchParams.get('lg')).toBeTruthy()   // l'adresse neuve
  })

  it('ne touche à rien quand l’app s’est affichée', () => {
    document.body.innerHTML = '<div id="root"><div>l’app est là</div></div>'
    poser()
    expect(remplace).not.toHaveBeenCalled()
  })

  // ⚠️ LE PLUS IMPORTANT : une app vraiment cassée ne doit pas tourner en
  // boucle. Une fois par minute, pas plus.
  it('ne recharge pas deux fois de suite', () => {
    poser()
    expect(remplace).toHaveBeenCalledTimes(1)
    poser()
    expect(remplace).toHaveBeenCalledTimes(1)
  })

  /**
   * ⚠️ CE TEST DISAIT L'INVERSE, ET C'ÉTAIT LUI LE TROU (Layla, 2026-09-22 :
   * « page blanche sur Safari, ça marche sur Chrome »).
   *
   * « Sans mémoire de session, il s'abstient » : or Safari en navigation
   * privée REFUSE `sessionStorage`. Le filet ne servait donc à rien
   * exactement là où il servait le plus. Le garde-fou anti-boucle vit
   * maintenant dans l'ADRESSE (`?lg=` est son propre horodatage) : il ne
   * demande rien au navigateur.
   */
  it('marche même quand le navigateur refuse sa mémoire (Safari privé)', () => {
    const vrai = window.sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('bloqué par le navigateur') },
    })
    poser()
    expect(remplace).toHaveBeenCalledTimes(1)
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: vrai })
  })

  it('et il ne boucle pas non plus sans mémoire : l’adresse le retient', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('bloqué par le navigateur') },
    })
    // On revient AVEC le `?lg=` qu'il vient de poser : il doit se taire.
    window.location = {
      href: `https://app.test/?article=X&lg=${Date.now()}`, replace: remplace,
    }
    poser()
    expect(remplace).not.toHaveBeenCalled()
  })
})

// ⚠️ DOUZE SECONDES DEVANT UN ÉCRAN BLANC, C'EST ONZE DE TROP. Quand un
// fichier répond 404, le navigateur le dit TOUT DE SUITE : on n'a aucune
// raison d'attendre le minuteur.
describe('la réaction immédiate au fichier manquant', () => {
  const echouer = (tag = 'SCRIPT') => {
    const ev = new Event('error')
    Object.defineProperty(ev, 'target', { value: { tagName: tag } })
    window.dispatchEvent(ev)
  }

  it('un script qui ne se charge pas recharge aussitôt', () => {
    // eslint-disable-next-line no-eval
    eval(script)
    echouer('SCRIPT')
    expect(remplace).toHaveBeenCalledTimes(1)
  })

  it('une feuille de style manquante aussi', () => {
    // eslint-disable-next-line no-eval
    eval(script)
    echouer('LINK')
    expect(remplace).toHaveBeenCalledTimes(1)
  })

  // Une image cassée n'est pas une app cassée.
  it('mais pas une image', () => {
    // eslint-disable-next-line no-eval
    eval(script)
    echouer('IMG')
    expect(remplace).not.toHaveBeenCalled()
  })

  it('et deux fichiers manquants ne font qu’un rechargement', () => {
    // eslint-disable-next-line no-eval
    eval(script)
    echouer('SCRIPT')
    echouer('SCRIPT')
    expect(remplace).toHaveBeenCalledTimes(1)
  })
})

// ============================================================
// QUAND ÇA NE REPART PAS : ON PARLE, AU LIEU DE RECHARGER.
//
// « Page blanche sur Safari, ça marche sur Chrome », puis « toujours rien »
// (Layla, 2026-09-22). Une page blanche ne se diagnostique pas à distance :
// sur un iPhone, personne n'ouvre une console. Tant qu'elle reste blanche, on
// ne sait RIEN — et moi je devine, ce qui a coûté assez cher aujourd'hui.
//
// Au deuxième échec, l'écran dit ce qui manque, et elle peut le lire.
// ============================================================
describe('le message qui remplace l’écran blanc', () => {
  it('au PREMIER échec, il recharge sans rien montrer', () => {
    poser()
    expect(remplace).toHaveBeenCalledTimes(1)
    expect(document.getElementById('root').innerHTML).toBe('')
  })

  it('au DEUXIÈME, il arrête de recharger et affiche la raison', () => {
    window.location = { href: `https://app.test/?lg=${Date.now() - 70000}`, replace: remplace }
    // eslint-disable-next-line no-eval
    eval(script)
    const ev = new Event('error')
    Object.defineProperty(ev, 'target', { value: { tagName: 'SCRIPT', src: 'https://app.test/assets/main-XYZ.js' } })
    window.dispatchEvent(ev)
    remplace.mockClear()
    vi.advanceTimersByTime(13000)

    const html = document.getElementById('root').innerHTML
    expect(html).toContain('L’app n’a pas pu démarrer')
    expect(html).toContain('main-XYZ.js')        // le fichier qui manque, nommé
    expect(html).toContain('Réessayer')
  })

  it('et il le dit même quand le navigateur n’a rien signalé', () => {
    window.location = { href: `https://app.test/?lg=${Date.now() - 70000}`, replace: remplace }
    poser()
    expect(document.getElementById('root').innerHTML)
      .toContain('aucune erreur signalée par le navigateur')
  })

  it('l’app affichée ne voit jamais ce message', () => {
    window.location = { href: `https://app.test/?lg=${Date.now() - 70000}`, replace: remplace }
    document.body.innerHTML = '<div id="root"><div>l’app est là</div></div>'
    poser()
    expect(document.getElementById('root').innerHTML).not.toContain('n’a pas pu démarrer')
  })
})
