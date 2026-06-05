import { describe, it, expect } from 'vitest'
import { buildMapsHref } from './maps'

describe('buildMapsHref', () => {
  it('coordonnées GPS → format ?api=1&query= (fiable)', () => {
    expect(buildMapsHref('33.975620269775,-6.8344011306763'))
      .toBe('https://www.google.com/maps/search/?api=1&query=33.975620269775,-6.8344011306763')
  })

  it('lien cassé "maps/search/LAT,LNG" → extrait les coords et corrige', () => {
    expect(buildMapsHref('https://www.google.com/maps/search/33.975620269775,-6.8344011306763'))
      .toBe('https://www.google.com/maps/search/?api=1&query=33.975620269775,-6.8344011306763')
  })

  it('coords au milieu d\'un texte → extraites', () => {
    expect(buildMapsHref('Livrer ici : 33.9756,-6.8344 merci'))
      .toBe('https://www.google.com/maps/search/?api=1&query=33.9756,-6.8344')
  })

  it('lien court partagé → gardé tel quel', () => {
    expect(buildMapsHref('Ma loc https://maps.app.goo.gl/abc123 stp'))
      .toBe('https://maps.app.goo.gl/abc123')
  })

  it('adresse texte → recherche query (fallback par défaut)', () => {
    expect(buildMapsHref('6 rue Soumaya, Rabat'))
      .toBe('https://www.google.com/maps/search/?api=1&query=6%20rue%20Soumaya%2C%20Rabat')
  })

  it('adresse texte avec textFallback:false → null', () => {
    expect(buildMapsHref('6 rue Soumaya, Rabat', { textFallback: false })).toBeNull()
  })

  it('vide → null', () => {
    expect(buildMapsHref('')).toBeNull()
    expect(buildMapsHref(null)).toBeNull()
  })
})
