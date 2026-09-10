import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ecranSimple, basculerEcran } from './ecranSimple'

// Le choix vit dans la tablette : une peut essayer, l'autre garder l'ancien.
function fausseMemoire() {
  const m = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  })
  return m
}

afterEach(() => vi.unstubAllGlobals())

describe('l’interrupteur des deux écrans', () => {
  beforeEach(() => fausseMemoire())

  it('part sur l’ANCIEN écran : rien ne change tant qu’on n’a pas appuyé', () => {
    expect(ecranSimple()).toBe(false)
  })

  it('bascule, et se souvient', () => {
    expect(basculerEcran()).toBe(true)
    expect(ecranSimple()).toBe(true)
  })

  it('revient en arrière d’un seul appui', () => {
    basculerEcran()
    expect(basculerEcran()).toBe(false)
    expect(ecranSimple()).toBe(false)
  })

  it('ne casse rien quand la tablette refuse de retenir', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('navigation privée') },
      setItem: () => { throw new Error('navigation privée') },
    })
    expect(ecranSimple()).toBe(false)
    expect(() => basculerEcran()).not.toThrow()
  })
})
