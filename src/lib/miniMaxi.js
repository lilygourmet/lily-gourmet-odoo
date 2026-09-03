/**
 * Ce que DEVRAIENT être les mini/maxi d'Odoo pour chaque préparation SM,
 * calculé sur la consommation réelle des 90 derniers jours.
 * → { jours, lieux: [{ id, nom, articles: [...] }] }
 */
export async function loadMiniMaxi() {
  const r = await fetch('/api/freezer-list?mode=minmax')
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return await r.json()
}

/** Les libellés des statuts, dans l'ordre où on veut les voir. */
export const STATUTS = [
  ['creer', 'à créer'],
  ['nulle', 'règle à 0/0'],
  ['revoir', 'à comparer'],
  ['demande', 'à la demande'],
  ['archive', 'archivé'],
]

/** Un nombre lisible : pas de décimale inutile sur les grosses quantités. */
export function nbFr(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }).format(v)
}
