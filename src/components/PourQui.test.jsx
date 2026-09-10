// @vitest-environment jsdom
// « La ganache déclarée garde le lien "pour Base CBS 23 cm" jusque dans
// À valider Annexe » (Layla, 2026-09-10).
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PourQui } from './ValidationAnnexeView'

afterEach(cleanup)

describe('le lien « pour »', () => {
  it('dit pour quel gâteau la préparation a été faite', () => {
    render(<PourQui pour="SM- Base CBS 23 cm" />)
    expect(screen.getByText(/Base CBS 23 cm/)).toBeTruthy()
    expect(screen.getByText(/pour/)).toBeTruthy()
  })

  it('ne dit rien quand la fournée n’est réservée à personne', () => {
    const { container } = render(<PourQui pour={null} />)
    expect(container.textContent).toBe('')
  })
})
