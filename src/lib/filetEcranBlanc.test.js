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
  const m = html.match(/<script>\s*(setTimeout\(function[\s\S]*?)<\/script>/)
  if (!m) throw new Error('le filet a disparu d’index.html')
  return m[1]
})()

let remplace
beforeEach(() => {
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

  it('sans mémoire de session, il s’abstient plutôt que de boucler', () => {
    const vrai = window.sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('bloqué par le navigateur') },
    })
    poser()
    expect(remplace).not.toHaveBeenCalled()
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: vrai })
  })
})
