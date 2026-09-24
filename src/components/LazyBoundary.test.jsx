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
import { estPanneDeMorceau, urlSansCache } from './LazyBoundary'

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

// ============================================================
// RECHARGER POUR DE VRAI.
//
// « Sur Safari sur Mac toujours le même message » (Layla, 2026-09-24), alors
// que Chrome se réparait seul : `location.reload()` a le droit de resservir la
// page depuis le cache de Safari, qui réclame alors les mêmes fichiers
// disparus. Un paramètre qui change force le téléchargement.
// ============================================================
describe('recharger sans reprendre la page du cache', () => {
  it('ajoute un paramètre qui change', () => {
    expect(urlSansCache('https://lily-gourmet-odoo.vercel.app/', 1758672000000))
      .toBe('https://lily-gourmet-odoo.vercel.app/?v=1758672000000')
  })

  // ⚠️ Un lien profond doit survivre : sinon recharger ferait perdre la
  // conversation ou le devis qu'on était en train d'ouvrir.
  it('garde les autres paramètres', () => {
    const u = new URL(urlSansCache('https://x.app/?conv=1329&view=conversations', 42))
    expect(u.searchParams.get('conv')).toBe('1329')
    expect(u.searchParams.get('view')).toBe('conversations')
    expect(u.searchParams.get('v')).toBe('42')
  })

  it('ne s’empile pas à chaque rechargement', () => {
    const une = urlSansCache('https://x.app/?v=111', 222)
    expect(une).toBe('https://x.app/?v=222')
    expect(une.match(/v=/g)).toHaveLength(1)
  })

  it('rend l’adresse telle quelle si elle est illisible', () => {
    expect(urlSansCache('pas-une-url', 1)).toBe('pas-une-url')
  })
})
