// La colonne `pour` n'existe pas tant que Layla n'a pas lancé
// `supabase/fab_prod_pour.sql`. Une déclaration ne doit JAMAIS être perdue
// pour autant : on perd le lien, jamais le travail de l'atelier.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const envoyees = []
let reponse = () => ({ data: { id: 1 }, error: null })

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      insert: ligne => {
        envoyees.push(ligne)
        return { select: () => ({ single: async () => reponse(ligne) }) }
      },
    }),
  },
}))

const { addFabProd } = await import('./fabricationProd')

const declarer = () => addFabProd('2026-09-10', 'SM. Ganache Gold', 2700, 'g',
  'u1', 3, 'annexe', null, false, 'SM- Base CBS 23 cm')

beforeEach(() => { envoyees.length = 0 })

describe('addFabProd et le lien « pour »', () => {
  it('écrit le lien quand la colonne existe', async () => {
    reponse = () => ({ data: { id: 1 }, error: null })
    await declarer()
    expect(envoyees.length).toBe(1)
    expect(envoyees[0].pour).toBe('SM- Base CBS 23 cm')
  })

  it('réessaie SANS le lien quand la colonne manque', async () => {
    reponse = ligne => (ligne.pour
      ? { data: null, error: { message: "Could not find the 'pour' column of 'prod_fabrications' in the schema cache" } }
      : { data: { id: 2 }, error: null })
    const ligne = await declarer()
    expect(ligne.id).toBe(2)
    expect(envoyees.length).toBe(2)
    expect(envoyees[1].pour).toBeUndefined()
    // Le travail est bien enregistré, avec sa quantité.
    expect(envoyees[1].qty).toBe(2700)
  })

  it('ne masque PAS une vraie erreur : elle remonte tout de suite', async () => {
    reponse = () => ({ data: null, error: { message: 'permission denied for table prod_fabrications' } })
    await expect(declarer()).rejects.toMatchObject({ message: /permission denied/ })
    expect(envoyees.length).toBe(1)
  })

  it('sans lien, une seule écriture — rien ne change pour l’ancien circuit', async () => {
    reponse = () => ({ data: { id: 3 }, error: null })
    await addFabProd('2026-09-10', 'SM- Tiramisu 15cm', 13, 'u', 'u1', 1, 'annexe')
    expect(envoyees.length).toBe(1)
    expect(envoyees[0].pour).toBeUndefined()
  })
})
