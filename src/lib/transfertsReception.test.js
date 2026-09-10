import { describe, it, expect, vi, beforeEach } from 'vitest'

// Ce qu'on veut prouver : réceptionner crée TOUJOURS le bon Odoo, ou dit
// pourquoi. Le 2026-09-10, cinq transferts ont été reçus sans bon et sans la
// moindre erreur — le rappel de réception chargeait la ligne sans sa colonne
// `odoo_product_id`, et `confirmTransfert` en concluait « article non relié à
// Odoo » puis sortait en silence.

const lignes = new Map()
const appels = { fetch: [], maj: [] }

const table = () => {
  const filtres = {}
  const api = {
    select: () => api,
    eq: (col, v) => { filtres[col] = v; return api },
    maybeSingle: async () => ({ data: lignes.get(filtres.id) || null }),
    update: (patch) => ({
      eq: async (col, v) => {
        appels.maj.push(patch)
        lignes.set(v, { ...(lignes.get(v) || {}), ...patch })
        return { error: null }
      },
    }),
  }
  return api
}

vi.mock('./supabase', () => ({ supabase: { from: () => table() } }))
vi.mock('./watiInfo', () => ({ sendWatiInfo: vi.fn() }))

const { confirmTransfert } = await import('./transfertsStock')

const user = { id: 'u1', full_name: 'Botica' }

beforeEach(() => {
  lignes.clear()
  appels.fetch = []
  appels.maj = []
  global.fetch = vi.fn(async (url, opts) => {
    appels.fetch.push({ url, body: JSON.parse(opts.body) })
    return { ok: true, json: async () => ({ ok: true, id: 999, name: 'E-ACP/INTPDXPD/09999' }) }
  })
})

describe('réception d’un transfert', () => {
  it('crée le bon Odoo même si l’appelant n’a pas chargé l’article Odoo', async () => {
    // Exactement le cas du rappel rouge : la ligne arrive sans odoo_product_id.
    lignes.set(7, { id: 7, odoo_product_id: 5939 })
    const ref = await confirmTransfert(
      { id: 7, matiere: 'MP- Oeufs blanc', qty_envoye: 2, sens: 'annexe_boutique', famille: 'mp' },
      2, user)
    expect(ref).toBe('E-ACP/INTPDXPD/09999')
    expect(appels.fetch).toHaveLength(1)
    expect(appels.fetch[0].body.lignes[0].odooProductId).toBe(5939)
  })

  it('n’appelle pas Odoo quand la ligne est refusée', async () => {
    lignes.set(8, { id: 8, odoo_product_id: 5939 })
    const ref = await confirmTransfert(
      { id: 8, matiere: 'MP- Oeufs blanc', qty_envoye: 2, sens: 'annexe_boutique', famille: 'mp' },
      0, user, { refuse: true })
    expect(ref).toBeNull()
    expect(appels.fetch).toHaveLength(0)
  })

  it('ne SORT JAMAIS en silence : sans article Odoo, l’erreur est écrite et levée', async () => {
    lignes.set(9, { id: 9, odoo_product_id: null })
    await expect(confirmTransfert(
      { id: 9, matiere: 'MP- Inconnu', qty_envoye: 1, sens: 'annexe_boutique', famille: 'mp' },
      1, user)).rejects.toThrow(/aucun article Odoo/)
    expect(appels.maj.some(p => p.odoo_error)).toBe(true)
  })
})
