// @vitest-environment jsdom
// ============================================================
// L'INTERRUPTEUR DES MINI / MAXI.
//
// « Compliqué, le truc de suivi, pause » (Layla, 2026-09-20). Ce qui compte
// ici : l'état se VOIT (et s'annonce aux lecteurs d'écran), et un clic le
// bascule — pas deux états qui se ressemblent.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Interrupteur, Pastille } from './Interrupteur'

afterEach(cleanup)

describe('l’interrupteur', () => {
  it('dit s’il est allumé, et répond au doigt', () => {
    const onClick = vi.fn()
    render(<Interrupteur on onClick={onClick}>Me le proposer</Interrupteur>)
    const b = screen.getByRole('switch')
    expect(b.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(b)
    expect(onClick).toHaveBeenCalled()
  })

  it('éteint, il le dit aussi', () => {
    render(<Interrupteur on={false} onClick={() => {}}>Me le proposer</Interrupteur>)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })
})

describe('les pastilles', () => {
  it('chacune sa couleur : l’or pour les figés, le bordeaux pour « À finir »', () => {
    const { container } = render(
      <>
        <Pastille on ton="or" onClick={() => {}}>❄️ 2 figés</Pastille>
        <Pastille on ton="bordeaux" onClick={() => {}}>🍮 À finir</Pastille>
        <Pastille on={false} ton="bordeaux" onClick={() => {}}>🍮 À finir</Pastille>
      </>
    )
    const [or, bordeaux, eteinte] = [...container.querySelectorAll('button')]
    expect(or.className).toMatch(/text-gold/)
    expect(bordeaux.className).toMatch(/text-bordeaux/)
    // Éteinte : grise, et elle le dit.
    expect(eteinte.className).toMatch(/text-ink-mute/)
    expect(eteinte.getAttribute('aria-pressed')).toBe('false')
  })
})
