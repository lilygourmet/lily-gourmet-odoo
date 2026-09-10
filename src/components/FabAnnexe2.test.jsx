// @vitest-environment jsdom
// L'interrupteur est le filet de sécurité de Layla : « j'aimerai tester cette
// version et si j'aime pas revenir à l'ancienne ». S'il casse, l'atelier reste
// coincé sur un écran qu'il ne veut pas — d'où ces tests.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('./FabAnnexe2View', () => ({
  default: ({ onBasculer }) => (
    <button onClick={onBasculer}>essayer le nouvel écran</button>
  ),
}))
vi.mock('./FabAnnexe2SimpleView', () => ({
  default: ({ onBasculer }) => (
    <button onClick={onBasculer}>revenir à l'ancien écran</button>
  ),
}))

const { default: FabAnnexe2 } = await import('./FabAnnexe2')

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('l’aiguillage entre les deux écrans', () => {
  it('part sur l’ANCIEN : rien ne bouge tant que personne n’a appuyé', () => {
    render(<FabAnnexe2 />)
    expect(screen.getByText('essayer le nouvel écran')).toBeTruthy()
  })

  it('bascule sur le nouveau, et se souvient de la tablette', () => {
    render(<FabAnnexe2 />)
    fireEvent.click(screen.getByText('essayer le nouvel écran'))
    expect(screen.getByText("revenir à l'ancien écran")).toBeTruthy()
    expect(localStorage.getItem('lg:annexe2-simple')).toBe('1')
  })

  it('revient en arrière d’un seul appui', () => {
    render(<FabAnnexe2 />)
    fireEvent.click(screen.getByText('essayer le nouvel écran'))
    fireEvent.click(screen.getByText("revenir à l'ancien écran"))
    expect(screen.getByText('essayer le nouvel écran')).toBeTruthy()
  })

  it('rouvre sur l’écran choisi la dernière fois', () => {
    localStorage.setItem('lg:annexe2-simple', '1')
    render(<FabAnnexe2 />)
    expect(screen.getByText("revenir à l'ancien écran")).toBeTruthy()
  })
})
