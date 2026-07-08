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

// Adresses possibles du helper, essayees DANS L'ORDRE jusqu'a ce qu'une reponde :
//  1) http://localhost:9999  -> le PC qui pilote l'imprimante (jamais bloque par le navigateur)
//  2) http://192.168.1.241:9999 -> l'IP du PC sur le reseau, pour les TABLETTES / autres ordis
//     (HTTP depuis un site HTTPS : il faut autoriser le "contenu non securise" 1x par appareil)
// Surchargeable au build via VITE_PRINTER_HELPER_URL (placee en tete si definie).
const PC_LAN_URL = 'http://192.168.1.241:9999'
function helperCandidates() {
  const list = []
  if (import.meta.env?.VITE_PRINTER_HELPER_URL) list.push(import.meta.env.VITE_PRINTER_HELPER_URL)
  list.push('http://localhost:9999', PC_LAN_URL)
  return [...new Set(list.map(u => u.replace(/\/+$/, '')))]
}
// Memorise la base qui a marche pour ne pas re-sonder a chaque ticket.
let _workingBase = null
export const PRINTER_HELPER_URL = PC_LAN_URL   // compat (non utilise directement)

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
//    Lily Gourmet                    (petit, centre, en-tete discret)
// -----------------
// ZNATI MAHA                         (TRES GRAND + GRAS, le nom saute aux yeux)
// -----------------
// S48387
// Mercredi 13 mai 2026
// 13h00
//
// x1 SA- Plateau Quiches (18)
//
//      1 / 2                         (TRES grand + gras, si boxTotal >= 2)
//
// Le helper ajoute init + coupe automatique.
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
  //   \x1d!\xNN  = taille du texte (4 bits largeur, 4 bits hauteur)
  //                \x22 = largeur x3 + hauteur x3 (gros mais qui rentre sur 1 ligne)
  //                \x33 = largeur x4 + hauteur x4 (deja tres gros)
  //                \x77 = largeur x8 + hauteur x8 (TRES grand)
  //   \x1bE\x01  = bold on
  //   \x1bE\x00  = bold off
  const lines = []

  // --- En-tete Lily Gourmet (petit, centre) ---
  lines.push('\x1ba\x01')              // centrer
  lines.push('Lily Gourmet')
  lines.push('-----------------')

  // --- Nom du client (TRES grand + gras + centre) ---
  // Taille \x22 (4x large, 4x haut) + gras -> le nom saute aux yeux.
  // On met en MAJUSCULES pour maximiser la lisibilite.
  if (clientName) {
    lines.push('')
    lines.push('\x1bE\x01')             // gras ON
    lines.push('\x1d!\x22')             // taille 4x4
    lines.push(clientName.toUpperCase())
    lines.push('\x1d!\x00')             // reset taille
    lines.push('\x1bE\x00')             // gras OFF
    lines.push('-----------------')
  }

  // --- Code commande + date + heure ---
  lines.push('\x1ba\x00')              // re-aligner a gauche
  lines.push('')
  if (orderNum) lines.push(orderNum)
  if (dateStr) lines.push(dateStr.charAt(0).toUpperCase() + dateStr.slice(1))
  if (hourStr) lines.push(hourStr)
  lines.push('')

  // --- Article ---
  lines.push(`\x1b!\x10x${qty} ${product}\x1b!\x00`)   // article en moyen-large

  // --- Numerotation des boites (uniquement si > 1 boite au total) ---
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

  // Marge en bas : evite que la decoupe coupe la fin du ticket (num 1/2, article)
  lines.push('', '', '', '')

  return lines.join('\n')
}

// ----- Format groupé : plusieurs articles d'une même commande sur UN ticket -----
// Même en-tête que le format A (Lily Gourmet, nom client en grand, code/date/heure),
// puis la LISTE des articles (ex : tous les jus, ou tous les GS- d'une commande).
export function buildTicketGroup({ deliveryAt, orderNum, clientName, items }) {
  const dateStr = formatDateLong(deliveryAt)
  const hourStr = formatHour(deliveryAt)
  const lines = []

  lines.push('\x1ba\x01')              // centrer
  lines.push('Lily Gourmet')
  lines.push('-----------------')

  if (clientName) {
    lines.push('')
    lines.push('\x1bE\x01')             // gras ON
    lines.push('\x1d!\x22')             // taille 4x4
    lines.push(clientName.toUpperCase())
    lines.push('\x1d!\x00')             // reset taille
    lines.push('\x1bE\x00')             // gras OFF
    lines.push('-----------------')
  }

  lines.push('\x1ba\x00')              // aligner a gauche
  lines.push('')
  if (orderNum) lines.push(orderNum)
  if (dateStr) lines.push(dateStr.charAt(0).toUpperCase() + dateStr.slice(1))
  if (hourStr) lines.push(hourStr)
  lines.push('')

  // --- Liste des articles (chacun en moyen-large) ---
  for (const it of (items || [])) {
    const product = cleanProductName(it.productName)
    const qty = it.quantity || 1
    lines.push(`\x1b!\x10x${qty} ${product}\x1b!\x00`)
  }

  lines.push('', '', '', '')
  return lines.join('\n')
}

// Imprime UN ticket groupé (plusieurs articles). Résout en succès, rejette sinon.
export async function printGroupTicket({ deliveryAt, orderNum, clientName, items }) {
  return sendTicket(buildTicketGroup({ deliveryAt, orderNum, clientName, items }))
}

// ----- Envoi au helper -----

// Envoie un ticket et resout en cas de succes. Throw sinon.
// Essaie chaque base candidate (localhost, puis IP du PC) jusqu'a ce qu'une reponde.
export async function sendTicket(ticketText) {
  // L'imprimante ne gere pas l'UTF-8 : on retire les accents (é->e, è->e, à->a,
  // ç->c...) pour eviter les caracteres bizarres sur le ticket.
  const safeText = ticketText.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const cands = helperCandidates()
  const bases = _workingBase ? [_workingBase, ...cands.filter(b => b !== _workingBase)] : cands
  let lastErr = null
  for (const base of bases) {
    try {
      const resp = await fetch(`${base}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: safeText, cut: true }),
      })
      if (!resp.ok) { const txt = await resp.text().catch(() => ''); lastErr = new Error(`Helper a renvoye ${resp.status} - ${txt}`); continue }
      const data = await resp.json().catch(() => ({ ok: true }))
      // Le helper peut répondre HTTP 200 mais { ok:false } (ex. imprimante hors-ligne) → c'est un échec.
      if (data && data.ok === false) { lastErr = new Error(data.error || 'Imprimante hors-ligne'); continue }
      _workingBase = base
      return data
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('Aucun helper joignable')
}

// Healthcheck simple : verifie que le helper repond (sur n'importe quelle base candidate)
export async function pingPrinter() {
  const cands = helperCandidates()
  const bases = _workingBase ? [_workingBase, ...cands.filter(b => b !== _workingBase)] : cands
  for (const base of bases) {
    try {
      const resp = await fetch(`${base}/health`, { method: 'GET' })
      if (!resp.ok) continue
      const data = await resp.json().catch(() => null)
      if (data && data.ok) { _workingBase = base; return true }
    } catch (e) { /* essaie la suivante */ }
  }
  return false
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
