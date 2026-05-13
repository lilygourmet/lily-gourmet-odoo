// ============================================================
// Impression ticket Epson via helper local sur PC Windows
// ============================================================
//
// Architecture :
//   Navigateur (cette app)  ->  http://192.168.1.241:9999/print  ->  Imprimante TM-T88VII
//
// Le helper Node tourne sur le PC Windows toujours allume de la boutique.
// Il forward le texte vers l'imprimante via ESC/POS (port 9100).
//
// Note "mixed content" :
//   L'app Vercel tourne en HTTPS, le helper en HTTP. Les navigateurs bloquent
//   par defaut. L'utilisateur doit autoriser le mixed content pour le site
//   (clic sur le cadenas dans la barre d'URL -> "Parametres du site" ->
//   "Contenu non securise : Autoriser") -- une fois par appareil.
// ============================================================

// URL du helper - modifie ici si l'IP du PC change.
// Tu peux aussi la surcharger via la variable VITE_PRINTER_HELPER_URL au build.
// HTTPS car helper utilise un certificat auto-signe. La premiere fois sur chaque
// appareil, l'utilisateur doit visiter https://192.168.1.241:9999/health pour
// accepter le certificat (alerte "connexion non securisee" -> Avancé -> Continuer).
export const PRINTER_HELPER_URL =
  import.meta.env?.VITE_PRINTER_HELPER_URL ||
  'https://192.168.1.241:9999'

// ----- Helpers de formatage du texte ticket -----

// Nettoie un nom de produit : retire le code [123] eventuel en debut
function cleanProductName(name) {
  return String(name || '').replace(/^\[\d+\]\s*/, '').trim()
}

// Formate une date en "Mercredi 13 mai 2026"
function formatDateLong(date) {
  if (!date) return ''
  const d = (date instanceof Date) ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Formate une heure en "13h00"
function formatHour(date) {
  if (!date) return ''
  const d = (date instanceof Date) ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}h${mm}`
}

// ----- Format A : ticket minimaliste (choix de Layla) -----
//
// LILY GOURMET
// -----------------
// Mercredi 13 mai 2026
// 13h00
// S48387
// Znati Maha
// x1 SA- Plateau Quiches (18)
//
// Le texte renvoye contient des sequences ESC/POS qui agrandissent le titre.
// Le helper ajoute init + coupe automatique.
//
// Si boxTotal > 1, on ajoute "N / TOTAL" en TRES grand et gras en bas du ticket.
export function buildTicketTextA({ deliveryAt, orderNum, clientName, productName, quantity, boxIndex, boxTotal }) {
  const dateStr = formatDateLong(deliveryAt)
  const hourStr = formatHour(deliveryAt)
  const product = cleanProductName(productName)
  const qty = quantity || 1

  // ESC/POS codes :
  //   \x1b!\x30  = double height + double width + bold (taille moyenne)
  //   \x1b!\x10  = double width seul
  //   \x1b!\x00  = reset normal
  //   \x1ba\x01  = align center
  //   \x1ba\x00  = align left
  //   \x1dB\x01  = inverse video on (blanc sur noir)
  //   \x1dB\x00  = inverse video off
  //   \x1d!\xNN  = taille du texte (4 bits hauteur, 4 bits largeur).
  //                \x77 = largeur x8 + hauteur x8 (TRES grand)
  //                \x66 = largeur x7 + hauteur x7
  //                \x33 = largeur x4 + hauteur x4 (deja gros)
  //   \x1bE\x01  = bold on
  //   \x1bE\x00  = bold off
  const lines = []
  lines.push('\x1ba\x01')              // centrer
  lines.push('\x1b!\x30LILY GOURMET\x1b!\x00')
  lines.push('-----------------')
  lines.push('\x1ba\x00')              // re-aligner a gauche
  lines.push('')
  if (dateStr) lines.push(dateStr.charAt(0).toUpperCase() + dateStr.slice(1))
  if (hourStr) lines.push(hourStr)
  lines.push('')
  if (orderNum) lines.push(orderNum)
  if (clientName) lines.push(clientName)
  lines.push('')
  lines.push(`\x1b!\x10x${qty} ${product}\x1b!\x00`)   // article en moyen-large

  // Numerotation des boites : uniquement si > 1 boite au total.
  // Tres grand (taille 7x), en gras, centre.
  if (boxTotal && boxTotal > 1 && boxIndex) {
    lines.push('')
    lines.push('')
    lines.push('\x1ba\x01')                          // centrer
    lines.push('\x1bE\x01')                          // gras
    lines.push('\x1d!\x77' + `${boxIndex} / ${boxTotal}` + '\x1d!\x00')   // taille 8x8
    lines.push('\x1bE\x00')                          // fin gras
    lines.push('\x1ba\x00')                          // realigner gauche
  }

  return lines.join('\n')
}

// ----- Envoi au helper -----

// Envoie un ticket et resout en cas de succes. Throw sinon.
export async function sendTicket(ticketText) {
  const url = `${PRINTER_HELPER_URL}/print`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: ticketText, cut: true }),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Helper a renvoye ${resp.status} - ${txt}`)
  }
  return resp.json().catch(() => ({ ok: true }))
}

// Healthcheck simple : verifie que le helper repond
export async function pingPrinter() {
  try {
    const resp = await fetch(`${PRINTER_HELPER_URL}/health`, { method: 'GET' })
    if (!resp.ok) return false
    const data = await resp.json().catch(() => null)
    return !!(data && data.ok)
  } catch (e) {
    return false
  }
}

// Imprime un article complet en utilisant le format A.
// Retourne une promesse qui se resout en succes ou rejette en cas d'erreur.
// Si boxIndex et boxTotal sont fournis et boxTotal > 1, le ticket affiche
// "N / TOTAL" en tres grand et gras en bas.
export async function printArticleTicket({ deliveryAt, orderNum, clientName, productName, quantity, boxIndex, boxTotal }) {
  const text = buildTicketTextA({ deliveryAt, orderNum, clientName, productName, quantity, boxIndex, boxTotal })
  return sendTicket(text)
}

// Imprime plusieurs articles en serie. Pour chaque article, si boxCount > 1,
// imprime boxCount tickets avec numerotation "1/N", "2/N", etc.
// Renvoie { ok: N, errors: [...] } pour gerer les erreurs partielles.
export async function printArticleBatch(articles) {
  const errors = []
  let ok = 0
  for (const a of articles) {
    const boxCount = Math.max(1, parseInt(a.boxCount) || 1)
    for (let i = 1; i <= boxCount; i++) {
      try {
        // boxIndex/boxTotal seulement si plusieurs boites (sinon ticket simple sans num)
        const ticketData = boxCount > 1
          ? { ...a, boxIndex: i, boxTotal: boxCount }
          : a
        await printArticleTicket(ticketData)
        ok++
        // Petit delai entre 2 tickets pour ne pas saturer le helper
        await new Promise(r => setTimeout(r, 200))
      } catch (e) {
        errors.push({ article: a, error: e.message, boxIndex: i })
      }
    }
  }
  return { ok, errors, total: articles.reduce((s, a) => s + Math.max(1, parseInt(a.boxCount) || 1), 0) }
}
