import { describe, it, expect, vi } from 'vitest'

// Ce module parle à Supabase ; on ne teste ici que le calcul des quantités.
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./watiInfo', () => ({ sendWatiInfo: vi.fn() }))

const { unitesPour, versUniteOdoo, messageReception, habitude, FACTEUR_ALERTE } = await import('./transfertsStock')

describe('unités proposées à la saisie', () => {
  it('propose grammes et kilos pour ce qui se pèse', () => {
    expect(unitesPour('kg')).toEqual(['g', 'kg'])
    expect(unitesPour('g')).toEqual(['g', 'kg'])
  })

  it('ne propose que la pièce pour ce qui se compte', () => {
    expect(unitesPour('Units')).toEqual(['u.'])
    expect(unitesPour('')).toEqual(['u.'])
  })
})

describe('quantité envoyée à Odoo', () => {
  it('convertit les grammes en kilos (sinon 500 g deviendraient 500 kg)', () => {
    expect(versUniteOdoo(500, 'g', 'kg')).toBe(0.5)
    expect(versUniteOdoo(2.5, 'kg', 'g')).toBe(2500)
  })

  it('ne touche à rien quand l\'unité est déjà la bonne', () => {
    expect(versUniteOdoo(3, 'kg', 'kg')).toBe(3)
    expect(versUniteOdoo(12, 'u.', 'Units')).toBe(12)
  })

  it('arrondit au lieu de traîner des décimales fausses', () => {
    expect(versUniteOdoo(1, 'g', 'kg')).toBe(0.001)
    expect(versUniteOdoo(333, 'g', 'kg')).toBe(0.333)
  })
})

describe('le message envoyé à celui qui a préparé le transfert', () => {
  const ligne = {
    sens: 'annexe_boutique', matiere: 'SM. Glacage chocolat GIANDUJA',
    qty_envoye: 5480000, unite: 'g', envoye_par: 'Yasmina',
  }

  it('dit REFUSÉ, avec ce qui avait été envoyé et qui a refusé', () => {
    const m = messageReception(ligne, 0, { refuse: true, par: 'Meriem' })
    expect(m).toContain('REFUSÉ')
    expect(m).toContain('5 480 000 g')
    expect(m).toContain('envoyé par Yasmina')
    expect(m).toContain('refusé par Meriem')
    expect(m).toContain('aucun bon Odoo')
  })

  // Le cas vécu le 22/08 : 5 480 000 g envoyés pour 5,48 reçus, et l'expéditeur
  // n'a jamais su que sa ligne avait été corrigée.
  it('dit MODIFIÉ et montre les DEUX quantités', () => {
    const m = messageReception(ligne, 5.48, { ref: 'WH/INT/00042' })
    expect(m).toContain('MODIFIÉ')
    expect(m).toContain('5 480 000 g envoyé')
    expect(m).toContain('5,48 g reçu')
    expect(m).toContain('WH/INT/00042')
  })

  it('reste sobre quand la réception est conforme', () => {
    const m = messageReception({ ...ligne, qty_envoye: 12 }, 12, { ref: 'WH/INT/00043' })
    expect(m).not.toContain('MODIFIÉ')
    expect(m).not.toContain('REFUSÉ')
    expect(m).toContain('Prod boutique a reçu 12 g')
  })

  it('ne confond pas 5 et « 5.0 » : la comparaison porte sur les nombres', () => {
    expect(messageReception({ ...ligne, qty_envoye: '5' }, 5, {})).not.toContain('MODIFIÉ')
  })
})

describe('le garde-fou des quantites aberrantes', () => {
  // Le 28/08, 2 500 kg de mascarpone sont partis pour 2,5 : le bon Odoo a ete
  // cree avec 2,5 tonnes, et personne ne l'a vu.
  const passes = [
    { odoo_product_id: 7, qty_envoye: 2 },
    { odoo_product_id: 7, qty_envoye: 5 },
    { odoo_product_id: 7, qty_envoye: 3 },
    { odoo_product_id: 9, qty_envoye: 900 },
  ]

  it('retient le plus gros envoi deja fait de CET article', () => {
    expect(habitude(passes, 7)).toBe(5)
    expect(habitude(passes, 9)).toBe(900)
  })

  it('ne dit rien pour un article jamais transfere', () => {
    expect(habitude(passes, 42)).toBe(null)
  })

  it('declenche sur le mascarpone a 2 500, pas sur un envoi deux fois plus gros', () => {
    const record = habitude(passes, 7)
    expect(2500 > record * FACTEUR_ALERTE).toBe(true)
    expect(10 > record * FACTEUR_ALERTE).toBe(false)
  })

  it('ignore les envois a zero, qui ecraseraient le repere', () => {
    expect(habitude([{ odoo_product_id: 7, qty_envoye: 0 }], 7)).toBe(null)
  })
})
