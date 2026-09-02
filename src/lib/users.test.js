import { describe, it, expect } from 'vitest'
import { buildLogin, buildPassword } from './users'

describe('buildLogin', () => {
  it('prénom + 3 premières lettres du nom de famille, minuscule sans accent', () => {
    expect(buildLogin('Asmae El Abbadi')).toBe('asmaeabb')
    expect(buildLogin('Mohamed Ben Ali')).toBe('mohamedali')
    expect(buildLogin('Souad Tazi')).toBe('souadtaz')
  })
  it('gère les accents et les espaces multiples', () => {
    expect(buildLogin('Yôûssef   Amine   Tâzi')).toBe('yousseftaz')
  })
  it('prénom seul (pas de nom de famille) → prénom seul', () => {
    expect(buildLogin('Karima')).toBe('karima')
  })
  it('vide → chaîne vide', () => {
    expect(buildLogin('')).toBe('')
    expect(buildLogin(null)).toBe('')
  })
})

describe('buildPassword', () => {
  it('prénom + année d\'entrée', () => {
    expect(buildPassword('Asmae El Abbadi', '2023-05-01')).toBe('asmae2023')
    expect(buildPassword('Souad Tazi', '2024-09-15')).toBe('souad2024')
  })
  it('sans date d\'entrée → prénom seul', () => {
    expect(buildPassword('Asmae El Abbadi', null)).toBe('asmae')
    expect(buildPassword('Asmae El Abbadi', '')).toBe('asmae')
  })
})

// ============================================================
// Garde-fou : une permission oubliée dans la signature de updateUser
// ============================================================
// Vécu le 2026-09-02 : `perm_check_cd` avait été ajouté à la liste des
// « if (perm_x !== undefined) » mais PAS aux paramètres de la fonction.
// Résultat : « Can't find variable: perm_check_cd » et TOUTE modification
// d'utilisateur échouait, quelle que soit la permission touchée.
// Ce test relit le fichier et compare les deux listes.
describe('updateUser — toute permission testée doit être déclarée', () => {
  it('aucune variable utilisée sans être un paramètre de la fonction', async () => {
    const fs = await import('node:fs')
    const url = await import('node:url')
    const chemin = url.fileURLToPath(new URL('./users.js', import.meta.url))
    const src = fs.readFileSync(chemin, 'utf8')

    const debut = src.indexOf('export async function updateUser')
    const corps = src.slice(debut, src.indexOf('\n}\n', debut))
    const signature = corps.slice(corps.indexOf('{') + 1, corps.indexOf('})'))

    const motif = /\b(perm_[a-z_]+|livreur_defaut|economat_profil|employe_id)\b/g
    const declarees = new Set(signature.match(motif) || [])
    const testees = [...corps.matchAll(/if \((perm_[a-z_]+|livreur_defaut|economat_profil|employe_id) !== undefined\)/g)].map(m => m[1])

    const oubliees = [...new Set(testees)].filter(n => !declarees.has(n))
    expect(oubliees).toEqual([])
  })
})
