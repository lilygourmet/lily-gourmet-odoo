// ============================================================
// LE FILET QUI RECHARGE TOUT SEUL après un déploiement.
//
// Vécu le 2026-09-23 : « Chargement impossible. Recharger — Importing a module
// script failed » en cliquant sur Conversations, sur téléphone. Le site était
// sain ; c'est la page restée ouverte qui réclamait un fichier renommé. Le
// rechargement automatique existait, mais ne reconnaissait pas la phrase de
// Safari — donc jamais sur iPhone ni iPad.
// ============================================================
import { describe, it, expect } from 'vitest'
import { estPanneDeMorceau } from './LazyBoundary'

describe('reconnaître « le morceau n’a pas pu être chargé »', () => {
  it.each([
    ['Safari (iPhone, iPad)', 'Importing a module script failed.'],
    ['Chrome / Edge', 'Failed to fetch dynamically imported module: https://lily-gourmet-odoo.vercel.app/assets/InboxView-CdP2xptD.js'],
    ['Firefox', 'error loading dynamically imported module: https://…/assets/InboxView.js'],
    ['Vite (feuille de style)', 'Unable to preload CSS for /assets/InboxView.css'],
    ['webpack', 'Loading chunk 42 failed'],
  ])('%s', (_, message) => {
    expect(estPanneDeMorceau(message)).toBe(true)
  })

  // ⚠️ L'AUTRE MOITIÉ : recharger sur n'importe quelle erreur ferait tourner
  // l'app en boucle et ferait perdre ce que Layla est en train de taper.
  it.each([
    ['une vraie erreur de code', "Cannot read properties of undefined (reading 'map')"],
    ['Odoo injoignable', 'Odoo indisponible (503)'],
    ['session expirée', 'Ta session a expiré'],
    ['rien du tout', ''],
    ['pas de message', null],
  ])('ne recharge pas pour : %s', (_, message) => {
    expect(estPanneDeMorceau(message)).toBe(false)
  })
})
