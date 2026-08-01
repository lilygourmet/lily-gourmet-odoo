import { useState, useEffect } from 'react'

// useState qui se souvient de sa valeur (texte) dans localStorage,
// pour rester sur le même sous-onglet après un rafraîchissement de page.
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved !== null ? saved : initial
    } catch { return initial }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
      // Prévient les autres composants (ex. barre latérale) qui lisent cette clé
      // pour qu'ils rafraîchissent leur surlignage.
      window.dispatchEvent(new CustomEvent('lily-persist', { detail: { key } }))
    } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue]
}
