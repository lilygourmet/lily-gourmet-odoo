import { supabase } from './supabase'
import { loadSalesLinesForRange } from './salesLines'

// ============================================================
// Extraction des messages depuis les commandes Odoo
// Le champ product_name contient parfois "Message: ..." ou "Message : ..."
// ============================================================

// Detecte si un texte contient au moins un caractere arabe
export function isArabic(text) {
  if (!text) return false
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text)
}

// Auto-replace J.A / JA / HB par leur version longue
// Respecte la casse et la position (debut de chaine ou apres espace)
export function expandShorthand(raw) {
  if (!raw) return ''
  let s = String(raw).trim()

  // J.A ou JA en debut de chaine ou apres espace -> "Joyeux Anniversaire"
  s = s.replace(/(^|\s)(J\.?A)(?=\s|$)/g, '$1Joyeux Anniversaire')
  // HB en debut de chaine ou apres espace -> "Happy Birthday"
  s = s.replace(/(^|\s)(HB)(?=\s|$)/g, '$1Happy Birthday')

  return s
}

// Detecte si le message est de type J.A (anniversaire FR/EN/AR)
// pour appliquer le layout 2 lignes (formule + nom)
export function detectBirthdayLayout(text) {
  if (!text) return null
  const t = text.trim()
  // FR
  if (/^Joyeux Anniversaire\s+(.+)$/i.test(t)) {
    const m = t.match(/^Joyeux Anniversaire\s+(.+)$/i)
    return { greeting: 'Joyeux Anniversaire', name: m[1].trim() }
  }
  // EN
  if (/^Happy Birthday\s+(.+)$/i.test(t)) {
    const m = t.match(/^Happy Birthday\s+(.+)$/i)
    return { greeting: 'Happy Birthday', name: m[1].trim() }
  }
  // AR : "عيد ميلاد سعيد <nom>"
  if (/^عيد\s*ميلاد\s*سعيد\s+(.+)$/.test(t)) {
    const m = t.match(/^عيد\s*ميلاد\s*سعيد\s+(.+)$/)
    return { greeting: 'عيد ميلاد سعيد', name: m[1].trim() }
  }
  return null
}

// Extrait le message d'un product_name d'apres le motif "Message: ..." ou "Message : ..."
// Renvoie null si pas de message
export function extractMessage(productName) {
  if (!productName) return null
  // Match "Message:" suivi du texte (jusqu'a la fin de ligne ou parenthese fermante a la fin)
  const m = String(productName).match(/Message\s*:\s*(.+?)\s*$/i)
  if (!m) return null
  let raw = m[1].trim()
  // Enlever ponctuation finale isolee
  raw = raw.replace(/[.\s]+$/, '').trim()
  if (!raw) return null
  return raw
}

// ============================================================
// Charger les messages depuis sales_lines (7 jours par defaut)
// ============================================================
export async function loadMessagesForRange(fromDateStr, daysCount = 7) {
  const lines = await loadSalesLinesForRange(fromDateStr, daysCount)

  // Charger les messages deja imprimes pour annoter
  const { data: printed } = await supabase
    .from('messages_printed')
    .select('source_key, printed_at, printed_by')
    .order('printed_at', { ascending: false })
    .limit(2000)

  const printedMap = new Map()
  if (printed) {
    for (const p of printed) {
      if (!printedMap.has(p.source_key)) {
        printedMap.set(p.source_key, p)
      }
    }
  }

  const messages = []
  for (const line of lines) {
    const raw = extractMessage(line.product_name)
    if (!raw) continue

    const expanded = expandShorthand(raw)
    const sourceKey = `ligne:${line.odoo_line_id}`
    const printedInfo = printedMap.get(sourceKey)

    messages.push({
      id: sourceKey,
      sourceKey,
      type: 'order',
      raw,
      text: expanded,
      isArabic: isArabic(expanded),
      orderNum: line.order_num,
      clientName: line.client_name,
      deliveryAt: line.delivery_at,
      productName: line.product_name,
      odooLineId: line.odoo_line_id,
      printedAt: printedInfo?.printed_at || null,
      printedBy: printedInfo?.printed_by || null,
    })
  }

  // Trier par delivery_at
  messages.sort((a, b) => new Date(a.deliveryAt) - new Date(b.deliveryAt))
  return messages
}

// Grouper les messages par jour (YYYY-MM-DD)
export function groupMessagesByDay(messages) {
  const map = new Map()
  for (const msg of messages) {
    const d = new Date(msg.deliveryAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(msg)
  }
  return map
}

// Marquer un message comme imprime
export async function markMessagePrinted(sourceKey, messageText, userId) {
  const { error } = await supabase
    .from('messages_printed')
    .insert({
      source_key: sourceKey,
      message_text: messageText,
      printed_by: userId,
    })
  if (error) throw error
  return true
}

// ============================================================
// Picker emoji : liste curee
// ============================================================
export const EMOJI_PICKER = [
  '😀', '😁', '😊', '🥳', '😍', '🤗',
  '🎂', '🎉', '🎈', '🎁', '🍰', '🧁',
  '❤️', '💖', '💕', '💝', '🌹', '🌺',
  '⭐', '✨', '🌟', '🎊', '🎀', '👑',
]
