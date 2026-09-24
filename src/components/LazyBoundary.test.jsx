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
import { estPanneDeMorceau, urlSansCache, doitRecharger } from './LazyBoundary'

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

// ============================================================
// RECHARGER D'APRÈS LA VERSION, PAS D'APRÈS UN CHRONOMÈTRE.
//
// « Ça marche sauf pour quelques onglets — réfléchis pourquoi » (Layla,
// 2026-09-24). Chaque écran est téléchargé au clic, dans un fichier renommé à
// chaque mise en ligne : les écrans déjà ouverts marchent, ceux ouverts après
// un déploiement réclament un fichier disparu. L'ancien garde-fou refusait de
// recharger deux fois en 60 s, donc en cliquant sur plusieurs onglets
// d'affilée le message revenait.
// ============================================================
describe('décider s’il faut recharger', () => {
  it('page périmée → on recharge', () => {
    expect(doitRecharger({ versionPage: '100', versionServeur: '200', dejaRechargePour: null }))
      .toBe(true)
  })

  // ⚠️ La page est à jour : le morceau manque pour une AUTRE raison. Recharger
  // n'y changerait rien et ferait perdre ce qui est en train d'être tapé.
  it('page à jour → on montre l’erreur, on ne recharge pas', () => {
    expect(doitRecharger({ versionPage: '200', versionServeur: '200', dejaRechargePour: null }))
      .toBe(false)
  })

  it('déjà rechargé pour cette version → pas de boucle', () => {
    expect(doitRecharger({ versionPage: '100', versionServeur: '200', dejaRechargePour: '200' }))
      .toBe(false)
  })

  // ⚠️ Une NOUVELLE mise en ligne après un rechargement doit repartir : sinon
  // un déploiement de plus laisserait l'écran mort.
  it('une version encore plus récente → on recharge à nouveau', () => {
    expect(doitRecharger({ versionPage: '100', versionServeur: '300', dejaRechargePour: '200' }))
      .toBe(true)
  })

  it.each([
    ['serveur injoignable', { versionPage: '100', versionServeur: null }],
    ['en local, pas de numéro', { versionPage: null, versionServeur: '200' }],
  ])('%s → on ne tranche pas, repli sur le délai', (_, args) => {
    expect(doitRecharger({ ...args, dejaRechargePour: null })).toBe(null)
  })
})
