// Cache « charge une fois, garde quelques minutes » pour les listes de RÉFÉRENCE
// qui changent rarement (étiquettes, phrases types, jours fériés, livreurs…).
// Évite de les re-télécharger à chaque ouverture/navigation d'écran.
//
// - Garde le résultat en mémoire pendant ttlMs (filet : se rafraîchit tout seul après).
// - Une entrée par combinaison d'arguments (ex: loadJoursFeries({annee}) ).
// - .clear() vide le cache → à appeler après une modification pour voir le changement tout de suite.
export function memoCache(fn, ttlMs = 10 * 60 * 1000) {
  const store = new Map()   // clé(args) -> { at, promise }
  const cached = (...args) => {
    const key = args.length ? JSON.stringify(args) : '_'
    const hit = store.get(key)
    if (hit && (Date.now() - hit.at) < ttlMs) return hit.promise
    const promise = Promise.resolve(fn(...args)).catch(e => { store.delete(key); throw e })
    store.set(key, { at: Date.now(), promise })
    return promise
  }
  cached.clear = () => store.clear()
  return cached
}
