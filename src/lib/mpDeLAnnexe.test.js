// « Ne pas prendre en considération les MP- pour le moment dans la validation
// des recettes » (Layla, 2026-09-11). À l'annexe, le stock des matières
// premières n'est pas tenu : 47 tonnes de sucre, une gélatine à −7 590 g.
import { describe, it, expect } from 'vitest'
import { mpDeLAnnexe } from '../../api/freezer-list.js'

describe('mpDeLAnnexe', () => {
  it('une matière première d’un ordre de l’annexe ne bloque plus', () => {
    expect(mpDeLAnnexe('MP- Sucre Granule', 'WHPDX/MO/21437')).toBe(true)
    expect(mpDeLAnnexe('MP- Gelatine en poudre', 'WHPDX/MO/21437')).toBe(true)
  })

  it('la référence entre crochets ne la cache pas', () => {
    expect(mpDeLAnnexe('[1234] MP- Beurre entremets', 'WHPDX/MO/21437')).toBe(true)
  })

  it('ce qui se FABRIQUE bloque toujours : c’est le vrai travail', () => {
    expect(mpDeLAnnexe('SM. Crème légère vanille citron', 'WHPDX/MO/21437')).toBe(false)
    expect(mpDeLAnnexe('SM. Biscuit a la cuillere (plaque)', 'WHPDX/MO/21437')).toBe(false)
  })

  it('au labo cake design, la matière première garde son garde-fou', () => {
    expect(mpDeLAnnexe('MP- Sucre Granule', 'WHLVP/MO/202179')).toBe(false)
  })

  it('tient devant du vide', () => {
    expect(mpDeLAnnexe(null, null)).toBe(false)
    expect(mpDeLAnnexe('MP- Sucre', '')).toBe(false)
  })
})
