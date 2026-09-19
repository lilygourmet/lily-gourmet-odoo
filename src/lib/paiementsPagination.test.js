// ============================================================
// LE PLAFOND DES 1000 LIGNES, BOUCHÉ.
//
// Supabase s'arrête à 1000 lignes et ne prévient pas : ce n'est pas un réglage
// du navigateur, c'est le serveur qui refuse. Vérifié en vrai le 2026-09-19 —
// lui en demander 2000 en rend 1000. **Écrire une limite plus grande ne sert
// donc à rien** ; seule la lecture par pages en sort.
//
// Les preuves de paiement étaient 571 ce jour-là. Passé 1000, les plus
// anciennes auraient disparu de l'onglet « Traités » sans un mot — et un
// paiement qu'on ne retrouve plus, c'est un client qu'on rappelle pour rien.
//
// Ce test fait donc ce que fait le vrai serveur : il ne rend JAMAIS plus de
// 1000 lignes d'un coup, quoi qu'on lui demande.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TOTAL = 2300           // au-delà de deux pages pleines
const PLAFOND = 1000
let demandes = []

// Le faux Supabase : on note chaque tranche réclamée, et on applique le plafond.
const faireRequete = () => {
  const q = {
    select: () => q,
    eq: () => q,
    not: () => q,
    gte: () => q,
    lt: () => q,
    order: () => q,
    range: (de, a) => {
      demandes.push([de, a])
      const large = a - de + 1
      const combien = Math.min(large, PLAFOND, Math.max(0, TOTAL - de))
      return Promise.resolve({
        data: Array.from({ length: combien }, (_, i) => ({ id: 'p' + (de + i) })),
        error: null,
      })
    },
  }
  return q
}

vi.mock('./supabase', () => ({ supabase: { from: () => faireRequete() } }))

const { loadPaymentsToValidate } = await import('./conversations')

beforeEach(() => { demandes = [] })

describe('les preuves de paiement au-delà de 1000', () => {
  it('les ramène TOUTES, pas les 1000 premières', async () => {
    const tout = await loadPaymentsToValidate()
    expect(tout.length).toBe(TOTAL)
  })

  it('les lit par pages de 1000, sans trou ni doublon', async () => {
    await loadPaymentsToValidate()
    expect(demandes).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    const ids = (await loadPaymentsToValidate()).map(x => x.id)
    expect(new Set(ids).size).toBe(TOTAL)
  })

  it('s’arrête dès qu’une page n’est pas pleine — pas de lecture sans fin', async () => {
    await loadPaymentsToValidate()
    // La 3e page rend 300 lignes : on ne demande pas de 4e.
    expect(demandes.length).toBe(3)
  })
})
