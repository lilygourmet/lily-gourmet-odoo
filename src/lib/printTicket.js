// ============================================================
// Impression ticket Epson : l'app depose, le PC de la boutique vient chercher
// ============================================================
//
// Architecture :
//   Navigateur  ->  table print_jobs (Supabase)  ->  PC de la boutique  ->  Imprimante
//
// Pourquoi pas en direct ? Le navigateur ne peut PAS appeler le PC : un site en
// « https » n'a pas le droit d'appeler un « http » sur le reseau local. Chrome
// laisse l'autoriser a la main, Safari et l'iPad non — et l'adresse du PC change
// quand la box la redistribue (vecu deux fois : .241 -> .5, plus rien n'imprimait
// depuis les autres appareils). Donc c'est le PC qui vient chercher le travail,
// toutes les secondes, via /api/print-queue.
//
// Consequences : ca marche depuis n'importe quel appareil, meme hors du WiFi de
// la boutique ; il faut juste que le PC soit allume, comme avant. Compter une
// seconde ou deux entre le clic et la sortie du ticket.
// ============================================================

import { supabase } from './supabase'

// Au-dela, on considere que le ticket ne sortira pas (PC eteint, imprimante
// coupee) et on rend la main a la personne devant l'ecran.
const ATTENTE_MAX_MS = 40000
// Le PC doit s'etre manifeste recemment pour etre considere allume.
const SIGNE_DE_VIE_MS = 30000

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

// ----- Envoi : on depose dans la file, le PC vient chercher -----

// L'imprimante ne gere pas l'UTF-8 : on retire les accents (é->e, à->a, ç->c...)
// pour eviter les caracteres bizarres sur le ticket.
function sansAccents(texte) {
  return String(texte).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Depose N tickets d'un coup et attend qu'ils soient tous sortis.
// Renvoie un tableau, dans l'ordre : { ok: true } ou { ok: false, error }.
export async function sendTickets(textes) {
  if (!textes.length) return []

  const { data: jobs, error } = await supabase
    .from('print_jobs')
    .insert(textes.map(t => ({ text: sansAccents(t), cut: true })))
    .select('id')
  if (error) {
    // La table n'accepte que les utilisateurs connectes : un jeton expire fait
    // retomber en « anon » et l'envoi est refuse. Le dire simplement.
    if (/row-level security|permission/i.test(error.message)) {
      throw new Error('Ta session a expire — deconnecte-toi et reconnecte-toi, puis reessaie')
    }
    throw new Error(`Impossible d'envoyer a l'impression : ${error.message}`)
  }

  const ids = jobs.map(j => j.id)
  const resultats = new Map()
  const debut = Date.now()

  while (resultats.size < ids.length && Date.now() - debut < ATTENTE_MAX_MS) {
    await new Promise(r => setTimeout(r, 700))
    const { data } = await supabase
      .from('print_jobs')
      .select('id, status, error')
      .in('id', ids.filter(id => !resultats.has(id)))
    for (const j of data || []) {
      if (j.status === 'done') resultats.set(j.id, { ok: true })
      else if (j.status === 'error') resultats.set(j.id, { ok: false, error: j.error || 'Impression ratee' })
    }
  }

  return ids.map(id => resultats.get(id) || {
    ok: false,
    error: "Le PC d'impression n'a pas repondu — verifie qu'il est allume",
  })
}

// Un seul ticket. Throw si il n'est pas sorti (comportement d'avant).
export async function sendTicket(ticketText) {
  const [r] = await sendTickets([ticketText])
  if (!r.ok) throw new Error(r.error)
  return r
}

// Le PC d'impression a-t-il donne signe de vie recemment ?
export async function pingPrinter() {
  const { data } = await supabase
    .from('print_helper_status')
    .select('last_seen, printer_found')
    .eq('id', 1)
    .maybeSingle()
  if (!data?.last_seen) return false
  return Date.now() - new Date(data.last_seen).getTime() < SIGNE_DE_VIE_MS
}

// Imprime un article complet en utilisant le format A.
// Retourne une promesse qui se resout en succes ou rejette en cas d'erreur.
// Si boxIndex et boxTotal sont fournis et boxTotal > 1, le ticket affiche
// "N / TOTAL" en tres grand et gras en bas.
export async function printArticleTicket({ deliveryAt, orderNum, clientName, productName, quantity, boxIndex, boxTotal }) {
  const text = buildTicketTextA({ deliveryAt, orderNum, clientName, productName, quantity, boxIndex, boxTotal })
  return sendTicket(text)
}

// Imprime plusieurs articles. Pour chaque article, si boxCount > 1, imprime
// boxCount tickets numerotes "1/N", "2/N"...
// Tous les tickets sont deposes EN UNE FOIS (sinon on attendrait le PC autant
// de fois qu'il y a de tickets), puis on rend compte de chacun.
// Renvoie { ok: N, errors: [...] } pour gerer les echecs partiels.
export async function printArticleBatch(articles) {
  const aImprimer = []
  for (const a of articles) {
    const boxCount = Math.max(1, parseInt(a.boxCount) || 1)
    for (let i = 1; i <= boxCount; i++) {
      // boxIndex/boxTotal seulement si plusieurs boites (sinon ticket simple sans num)
      const data = boxCount > 1 ? { ...a, boxIndex: i, boxTotal: boxCount } : a
      aImprimer.push({ article: a, boxIndex: i, text: buildTicketTextA(data) })
    }
  }

  let resultats
  try {
    resultats = await sendTickets(aImprimer.map(t => t.text))
  } catch (e) {
    // Meme pas reussi a deposer (pas de reseau) : tout est en erreur.
    return {
      ok: 0,
      errors: aImprimer.map(t => ({ article: t.article, error: e.message, boxIndex: t.boxIndex })),
      total: aImprimer.length,
    }
  }

  const errors = []
  let ok = 0
  resultats.forEach((r, i) => {
    if (r.ok) ok++
    else errors.push({ article: aImprimer[i].article, error: r.error, boxIndex: aImprimer[i].boxIndex })
  })
  return { ok, errors, total: aImprimer.length }
}
