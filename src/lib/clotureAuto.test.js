// ============================================================
// LA CLÔTURE AUTOMATIQUE DU COMPTAGE — ses garde-fous.
//
// « Ça doit s'arrêter automatiquement avant que les ventes commencent, pour ne
// pas avoir un rapport faux », puis « en fait ils comptent tout le temps le
// soir mais ne clôturent pas le compte », et « 23 h c'est bien » (Layla,
// 2026-09-22).
//
// MESURÉ : ils comptent entre 18 h et 20 h (254 / 554 / 192 comptages). Mais la
// journée n'était clôturée le soir même qu'une fois sur deux ; les autres fois
// à 08 h 42, 09 h 00, 09 h 31, 09 h 39 — LE LENDEMAIN. Or c'est la clôture qui
// prend la photo du stock Odoo : prise le lendemain matin, elle inclut déjà les
// ventes du jour, et tous les écarts sont faux.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('../../api/stock-cloture-auto.js', import.meta.url)), 'utf8')
const vercel = JSON.parse(readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'))

describe('l’heure', () => {
  // ⚠️ Les tâches de Vercel tournent en UTC ; Casablanca est à UTC+1.
  // 23 h ici = 22 h là-bas. Se tromper d'une heure, c'est clôturer pendant
  // que le café compte encore.
  it('tourne à 22 h UTC, soit 23 h à Casablanca', () => {
    const c = vercel.crons.find(x => x.path === '/api/stock-cloture-auto')
    expect(c).toBeTruthy()
    expect(c.schedule).toBe('0 22 * * *')
  })

  it('et le JOUR se calcule à Casablanca, pas en UTC', () => {
    expect(src).toContain("timeZone: 'Africa/Casablanca'")
  })
})

describe('ce qu’elle refuse de faire', () => {
  // ⚠️ Sans comptage, clôturer fabriquerait exactement le rapport faux qu'on
  // cherche à éviter : tous les articles à zéro, tous en écart.
  it('ne clôt jamais une journée où rien n’a été compté', () => {
    expect(src).toContain("raison: 'rien de compté'")
  })

  // ⚠️ Une journée oubliée depuis trois jours ne se rattrape pas : sa photo
  // Odoo serait celle d'aujourd'hui.
  it('ne touche qu’à la journée DU JOUR', () => {
    expect(src).toMatch(/\.eq\('day', jour\)/)
    expect(src).toMatch(/\.eq\('status', 'open'\)/)
  })

  it('et elle est réservée au cron ou au secret', () => {
    expect(src).toContain("x-vercel-cron")
    expect(src).toContain("Unauthorized")
  })
})

describe('ce qu’elle fait', () => {
  it('passe la journée en « submitted »', () => {
    expect(src).toContain("status: 'submitted'")
  })

  // ⚠️ C'est LE point : la photo du stock Odoo doit être prise à la clôture,
  // pas le lendemain matin.
  it('prend la photo du stock Odoo dans la foulée', () => {
    expect(src).toContain('/api/stock-odoo-snapshot')
    expect(src).toContain('initial: true')
  })

  // La clôture porte le nom de celui qui a compté en dernier, pas d'un compte
  // technique : c'est son travail qu'on ferme.
  it('met la clôture au nom de celui qui a compté en dernier', () => {
    expect(src).toContain('counted_by')
    expect(src).toMatch(/submitted_by: par/)
  })
})
