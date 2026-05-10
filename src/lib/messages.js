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

// Capitalise chaque mot (premiere lettre majuscule)
// Garde les caracteres arabes / emojis intacts
function capitalizeWords(str) {
  if (!str) return ''
  return str.replace(/(^|\s|-)([a-zA-ZÀ-ÿ])/g, (m, sep, c) => sep + c.toUpperCase())
            .replace(/(^|\s|-)([a-zA-ZÀ-ÿ])(\S*)/g, (m, sep, c, rest) => sep + c.toUpperCase() + rest.toLowerCase())
}

// Auto-replace J.A / JA / J A / H.B / HB / H B etc. par leur version longue
// + capitalise les prenoms qui suivent
export function expandShorthand(raw) {
  if (!raw) return ''
  let s = String(raw).trim()

  // Normaliser : remplacer toutes les variantes de J.A / JA / J A par "Joyeux Anniversaire"
  // Variantes acceptees : J.A, JA, J A, j.a, ja, j a (au debut ou apres espace)
  s = s.replace(/(^|\s)(J\s*\.?\s*A)(?=\s|$)/gi, '$1Joyeux Anniversaire')

  // Variantes H.B / HB / H B -> "Happy Birthday"
  s = s.replace(/(^|\s)(H\s*\.?\s*B)(?=\s|$)/gi, '$1Happy Birthday')

  // Remplacer aussi "joyeux anniversaire" / "happy birthday" en minuscules par version capitalisee
  s = s.replace(/joyeux\s+anniversaire/gi, 'Joyeux Anniversaire')
  s = s.replace(/happy\s+birthday/gi, 'Happy Birthday')

  // Capitaliser le reste (prenoms et premiere lettre du message)
  // Si le message contient une formule connue, capitaliser ce qui suit
  const formules = [
    /^(Joyeux Anniversaire)\s+(.+)$/i,
    /^(Happy Birthday)\s+(.+)$/i,
    /^(Felicitations|Félicitations)\s+(.+)$/i,
    /^(Bienvenue)\s+(.+)$/i,
  ]
  for (const rx of formules) {
    const m = s.match(rx)
    if (m) {
      s = `${m[1]} ${capitalizeWords(m[2])}`
      break
    }
  }

  // Si pas une formule connue, juste capitaliser la premiere lettre
  // (sauf si c'est de l'arabe)
  if (!/[\u0600-\u06FF]/.test(s) && s.length > 0) {
    // Verifier si pas deja capitalisee
    const first = s.charAt(0)
    if (first !== first.toUpperCase()) {
      s = first.toUpperCase() + s.slice(1)
    }
  }

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

// Categorie source d'un message : 'cd' (gateaux) | 'prod' (entremets/mignardises) | 'accessoire' | 'autre'
// On utilise le category deja stocke dans sales_lines par le sync, en fallback sur le prefixe du nom
export function classifyMessageSource(line) {
  const cat = (line.category || '').toUpperCase()
  if (cat === 'CD') return 'cd'
  if (cat === 'PROD') return 'prod'

  // Fallback sur le prefixe (sales_lines.prefix ou parser le nom)
  const name = String(line.product_name || '').replace(/^\[\d+\]\s*/, '').trim()
  if (/^(CD-|GM-|GMD-)/i.test(name)) return 'cd'
  if (/^(E-|MI-|V-)/i.test(name)) return 'prod'
  if (/^GS-/i.test(name)) return 'prod' // GS- aussi en prod (cookies/plateaux)

  // Accessoires connus (issus de la vue Patissier)
  if (/cupcakes?/i.test(name)) return 'accessoire'
  if (/magnums?\b/i.test(name)) return 'accessoire'
  if (/cake\s*pops?/i.test(name)) return 'accessoire'
  if (/boite\s+signature/i.test(name)) return 'accessoire'
  if (/sabl[eé]s?\s+boite/i.test(name)) return 'accessoire'

  return 'autre'
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
// Charger les messages d'aujourd'hui uniquement
// Exclut les accessoires (Cupcakes, Magnums, Cake pops, etc.)
// ============================================================
export async function loadMessagesToday() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const fromDateStr = `${yyyy}-${mm}-${dd}`

  const lines = await loadSalesLinesForRange(fromDateStr, 1)

  // Charger les messages deja imprimes pour annoter
  const { data: printed } = await supabase
    .from('messages_printed')
    .select('source_key, printed_at, printed_by')
    .order('printed_at', { ascending: false })
    .limit(2000)

  const printedMap = new Map()
  if (printed) {
    for (const p of printed) {
      if (!printedMap.has(p.source_key)) printedMap.set(p.source_key, p)
    }
  }

  const messages = []
  for (const line of lines) {
    const source = classifyMessageSource(line)
    if (source === 'accessoire' || source === 'autre') continue

    const raw = extractMessage(line.product_name)
    if (!raw) continue

    const expanded = expandShorthand(raw)
    const sourceKey = `ligne:${line.odoo_line_id}`
    const printedInfo = printedMap.get(sourceKey)

    messages.push({
      id: sourceKey,
      sourceKey,
      type: 'order',
      source,                // 'cd' | 'prod'
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

  messages.sort((a, b) => new Date(a.deliveryAt) - new Date(b.deliveryAt))
  return messages
}

// Garder l'ancienne fonction pour compat (utilisee nulle part en V2 mais au cas ou)
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
      if (!printedMap.has(p.source_key)) printedMap.set(p.source_key, p)
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
