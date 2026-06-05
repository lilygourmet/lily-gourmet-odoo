// src/lib/maps.js
// Construit un lien Google Maps FIABLE à partir d'une note de commande qui peut
// contenir : des coordonnées GPS, un lien Maps (parfois cassé), ou une adresse.
//
// Piège réglé : le format "google.com/maps/search/LAT,LNG" (chemin) est REFUSÉ
// par Google Maps. Le format fiable est "?api=1&query=LAT,LNG".

export function buildMapsHref(note, { textFallback = true } = {}) {
  if (!note) return null
  const s = String(note)

  // 1) Coordonnées GPS (lat,lng), même si elles sont à l'intérieur d'un lien cassé.
  const coord = s.match(/(-?\d{1,3}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/)
  if (coord) {
    return `https://www.google.com/maps/search/?api=1&query=${coord[1]},${coord[2]}`
  }

  // 2) Un vrai lien Maps déjà présent (lien court partagé, etc.) → on le garde tel quel.
  const url = s.match(/https?:\/\/[^\s<>"]*(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|waze\.com)[^\s<>"]*/i)
  if (url) return url[0]

  // 3) Sinon : adresse en texte → recherche classique (format query, fiable).
  if (!textFallback) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.trim())}`
}
