// ============================================================
// LA PERMISSION « REBUTS » EST-ELLE DÉCLARÉE PARTOUT ?
//
// « Celui qui a la perm des rebuts / crée un onglet rebut » (Layla,
// 2026-09-22).
//
// ⚠️ UNE PERMISSION SE DÉCLARE À SEPT ENDROITS (CLAUDE.md), et celui qu'on
// oublie est toujours le même : `permsList.js`, qui alimente l'onglet « Par
// permission ». Ce test les regarde tous — il coûte trois lectures de fichier
// et évite une permission invisible.
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canRebuts } from './auth'
import { PERMS } from './permsList'

const lire = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('le droit de jeter', () => {
  it('appartient à l’admin, et à qui a la permission', () => {
    expect(canRebuts({ role: 'admin' })).toBe(true)
    expect(canRebuts({ role: 'user', perm_rebuts: true })).toBe(true)
  })

  // ⚠️ Jeter sort la marchandise du stock POUR DE BON : par défaut, non.
  it('n’appartient à personne d’autre, et surtout pas par défaut', () => {
    expect(canRebuts({ role: 'user' })).toBe(false)
    expect(canRebuts({ role: 'user', perm_rebuts: false })).toBe(false)
    expect(canRebuts(null)).toBe(false)
    expect(canRebuts(undefined)).toBe(false)
  })
})

describe('les sept endroits', () => {
  it('1-2. auth.js : le SELECT la lit, et la règle existe', () => {
    const s = lire('./auth.js')
    expect(s).toContain('perm_rebuts')
    expect(s).toMatch(/export function canRebuts/)
  })

  it('3-5. users.js : lecture, création, mise à jour', () => {
    const s = lire('./users.js')
    // Trois fois au moins : le select, le paramètre de création, la mise à jour.
    expect(s.split('perm_rebuts').length - 1).toBeGreaterThanOrEqual(4)
    expect(s).toMatch(/updates\.perm_rebuts = perm_rebuts/)
  })

  it('6. AdminUsers.jsx : le formulaire, les deux sauvegardes et la case', () => {
    const s = lire('../components/AdminUsers.jsx')
    expect(s.split('perm_rebuts: formData.permRebuts').length - 1).toBe(2)
    expect(s).toContain('id="perm-rebuts"')
  })

  // ⚠️ CELUI QU'ON OUBLIE — c'est lui qui alimente « Par permission ».
  it('7. permsList.js : celui qu’on oublie toujours', () => {
    expect(PERMS.some(p => p.key === 'perm_rebuts')).toBe(true)
  })

  it('et le SQL est écrit, prêt à lancer', () => {
    const s = lire('../../supabase/perm_rebuts.sql')
    expect(s).toMatch(/add column if not exists perm_rebuts/)
    expect(s).toMatch(/default false/)
  })
})

// ⚠️ ET L'ONGLET SE RANGE : sans ça il est introuvable — ni dans la barre, ni
// dans le réglage « Ranger mes onglets » (règle de Layla).
describe('l’onglet Rebut est rangeable', () => {
  it('déclaré dans navTabs, routé dans App, rangé dans SideNav', () => {
    expect(lire('./navTabs.js')).toMatch(/view: 'rebut'/)
    expect(lire('../App.jsx')).toMatch(/activeView === 'rebut'/)
    expect(lire('../components/SideNav.jsx')).toContain("'rebut'")
  })
})
