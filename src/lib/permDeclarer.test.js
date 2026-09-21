// ============================================================
// « À DÉCLARER » A SA PROPRE PERMISSION.
//
// « Rajouter permission à déclarer à l'équipe » (Layla, 2026-09-21).
//
// Avant, l'onglet s'ouvrait avec « Fabrication Annexe 2 » : donner l'un
// donnait l'autre — les tournées, les mini/maxi, tout ce qui est sous le mini.
// Or dire ce qu'on a fabriqué ne demande rien de tout ça.
//
// ⚠️ Ce que ce test garde surtout : PERSONNE NE PERD RIEN. Qui avait
// « Fabrication Annexe 2 » continue de voir « À déclarer ».
// ============================================================
import { describe, it, expect } from 'vitest'
import { canDeclarer, canVoirDonne, sansColonneAbsente } from './auth'
import { navTabsForUser } from './navTabs'
import { PERMS } from './permsList'

// On passe par la vraie fonction de l'app : c'est elle qui décide ce que
// chacun voit dans sa barre.
const voit = (u) => navTabsForUser(u).some(t => t.view === 'a-declarer')

describe('qui peut déclarer', () => {
  it('celui qui a la nouvelle permission', () => {
    expect(canDeclarer({ perm_declarer: true })).toBe(true)
  })

  it('⚠️ celui qui avait Fabrication Annexe 2 la garde', () => {
    expect(canDeclarer({ perm_fabrication_annexe: true })).toBe(true)
  })

  it('l’admin, comme toujours', () => {
    expect(canDeclarer({ role: 'admin' })).toBe(true)
  })

  it('personne d’autre', () => {
    expect(canDeclarer({ perm_caisse: true })).toBe(false)
    expect(canDeclarer({})).toBe(false)
    expect(canDeclarer(null)).toBe(false)
  })
})

describe('l’onglet apparaît dans la barre', () => {
  it('pour qui a la nouvelle permission', () => {
    expect(voit({ perm_declarer: true })).toBe(true)
  })

  it('⚠️ et toujours pour qui avait Fabrication Annexe 2', () => {
    expect(voit({ perm_fabrication_annexe: true })).toBe(true)
  })

  it('pas pour les autres', () => {
    expect(voit({ perm_caisse: true })).toBe(false)
  })

  it('⚠️ jamais pour un livreur', () => {
    expect(voit({ role: 'livreur', perm_declarer: true })).toBe(false)
  })
})

describe('⚠️ le piège : la permission doit être dans permsList', () => {
  // C'est le plus souvent oublié — c'est lui qui alimente l'onglet
  // « Par permission » de l'écran Utilisateurs.
  it('elle y est, avec son libellé et son explication', () => {
    const p = PERMS.find(x => x.key === 'perm_declarer')
    expect(p, 'perm_declarer doit être dans permsList.js').toBeTruthy()
    expect(p.label).toBe('À déclarer')
    expect(p.desc.length).toBeGreaterThan(20)
  })
})

describe('la permission « Donné »', () => {
  it('celui qui a la nouvelle permission', () => {
    expect(canVoirDonne({ perm_donne: true })).toBe(true)
  })

  it('⚠️ celui qui avait l’Économat la garde', () => {
    expect(canVoirDonne({ economat_profil: 'cuisine' })).toBe(true)
    expect(canVoirDonne({ perm_econome: true })).toBe(true)
  })

  it('personne d’autre', () => {
    expect(canVoirDonne({ perm_caisse: true })).toBe(false)
    expect(canVoirDonne(null)).toBe(false)
  })

  it('l’onglet suit, et jamais pour un livreur', () => {
    const voitDonne = u => navTabsForUser(u).some(t => t.view === 'donne')
    expect(voitDonne({ perm_donne: true })).toBe(true)
    expect(voitDonne({ perm_econome: true })).toBe(true)
    expect(voitDonne({ perm_caisse: true })).toBe(false)
    expect(voitDonne({ role: 'livreur', perm_donne: true })).toBe(false)
  })

  it('⚠️ elle est dans permsList (le piège habituel)', () => {
    const p = PERMS.find(x => x.key === 'perm_donne')
    expect(p, 'perm_donne doit être dans permsList.js').toBeTruthy()
    expect(p.label).toBe('Donné')
  })
})

describe('⚠️ LE FILET : une colonne manquante ne doit en coûter QU’UNE', () => {
  // C'est ce filet qui, mal écrit, a fait perdre tous les accès à tout le
  // monde le 2026-09-21. Il retirait 22 permissions parce qu'une manquait.
  const SELECT = 'id, username, perm_caisse, perm_devis, perm_donne, employe_id'

  it('elle retire la colonne que Postgres nomme, et elle seule', () => {
    expect(sansColonneAbsente(SELECT, 'column profiles.perm_donne does not exist'))
      .toBe('id, username, perm_caisse, perm_devis, employe_id')
  })

  it('⚠️ les autres permissions restent TOUTES', () => {
    const r = sansColonneAbsente(SELECT, 'column profiles.perm_donne does not exist')
    expect(r).toContain('perm_caisse')
    expect(r).toContain('perm_devis')
  })

  it('une erreur qui ne nomme pas de colonne : on ne touche à rien', () => {
    expect(sansColonneAbsente(SELECT, 'JWT expired')).toBe(null)
    expect(sansColonneAbsente(SELECT, '')).toBe(null)
  })

  it('une colonne qui n’est pas dans le SELECT : rien à retirer', () => {
    expect(sansColonneAbsente(SELECT, 'column profiles.perm_autre does not exist')).toBe(null)
  })
})
