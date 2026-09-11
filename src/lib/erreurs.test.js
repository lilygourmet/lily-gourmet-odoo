// « Échec : new row violates row-level security policy for table
// "prod_fabrications" » — le message que Layla a vu en voulant marquer une
// base de flan faite (2026-09-11). Il veut dire : ta session a expiré.
import { describe, it, expect } from 'vitest'
import { enClairErreur, sessionPerdue } from './erreurs'

describe('les erreurs, dites simplement', () => {
  it('reconnaît la session expirée derrière le jargon de Postgres', () => {
    const e = new Error('new row violates row-level security policy for table "prod_fabrications"')
    expect(sessionPerdue(e)).toBe(true)
    expect(enClairErreur(e)).toMatch(/session a expiré/)
    expect(enClairErreur(e)).toMatch(/Rien n'a été enregistré/)
  })

  it('reconnaît aussi un jeton refusé', () => {
    expect(sessionPerdue({ message: 'JWT expired' })).toBe(true)
    expect(sessionPerdue({ message: 'permission denied for table prod_fabrications' })).toBe(true)
  })

  it('laisse passer les vraies erreurs, telles quelles', () => {
    expect(enClairErreur(new Error('Odoo indisponible (502)'))).toBe('Échec : Odoo indisponible (502)')
    expect(sessionPerdue(new Error('Odoo indisponible (502)'))).toBe(false)
  })

  it('tient devant du vide', () => {
    expect(sessionPerdue(null)).toBe(false)
    expect(enClairErreur(null)).toBe('Échec : ')
  })
})
