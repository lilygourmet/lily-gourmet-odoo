// Parser pour les donnees Odoo Lily Gourmet (sync API)
// Filtre CD- + GM- uniquement, ignore Bougies/Decoration

/**
 * Parse une commande Odoo + ses lignes en format app.
 * @param {Object} odooOrder - sale.order
 * @param {Array} odooLines - sale.order.line
 * @returns {Object|null}
 */
export function parseOdooOrder(odooOrder, odooLines) {
  if (!odooOrder || !odooLines) return null

  const orderNum = odooOrder.name
  if (!orderNum) return null

  const commitmentDate = odooOrder.commitment_date
  if (!commitmentDate) return null
  const deliveryAt = new Date(commitmentDate.replace(' ', 'T') + 'Z')

  const deliverySlot = odooOrder.livraison_hour || null

  const clientName = Array.isArray(odooOrder.partner_id)
    ? odooOrder.partner_id[1]
    : null

  const warning = parseHtmlNote(odooOrder.note)

  const items = parseItems(odooLines, warning)
  if (items.length === 0) return null

  return {
    orderNum,
    clientName,
    deliveryAt,
    deliverySlot,
    odooId: odooOrder.id,
    odooState: odooOrder.state,
    items,
  }
}

/**
 * Parse une liste de commandes Odoo + leurs lignes.
 */
export function parseOdooOrders(odooOrders, linesByOrderId) {
  const result = []
  for (const order of odooOrders) {
    const lines = linesByOrderId.get(order.id) || []
    const parsed = parseOdooOrder(order, lines)
    if (parsed) result.push(parsed)
  }
  return result
}

// ==========================================
// HELPERS
// ==========================================

function parseHtmlNote(htmlNote) {
  if (!htmlNote) return null
  let text = htmlNote.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (/^(Commentaire du client\s*:?)$/i.test(text)) return null
  if (text.length < 3) return null
  return text
}

function shouldIgnoreProduct(productName) {
  if (!productName) return true
  const trimmed = productName.trim()

  if (!/^(CD-|GM-|GM\s*-)/i.test(trimmed)) return true

  if (/^(CD-|GM-)\s*Bougies/i.test(trimmed)) return true

  if (/D[ée]coration\s+suppl[ée]mentaire/i.test(trimmed)) return true

  return false
}

function parseItems(odooLines, warning) {
  const items = []

  for (const line of odooLines) {
    const productName = line.name || ''

    if (shouldIgnoreProduct(productName)) continue

    const quantity = parseFloat(line.product_uom_qty) || 0
    if (quantity === 0) continue

    const type = /^CD-/i.test(productName.trim()) ? 'CD' : 'GM'

    const title = extractTitle(productName)
    const theme = extractField(productName, 'Thème', ['Age', 'Message', 'Option'])
    const age = extractField(productName, 'Age', ['Message', 'Option'])
    const message = extractField(productName, 'Message', ['Age', 'Option', 'Acompte'])

    const decomposed = decomposeTitle(title, type)

    const priceUnit = parseFloat(line.price_unit) || 0
    const isGift = priceUnit === 100

    const warnings = warning ? [warning] : []

    items.push({
      type,
      title: cleanText(title),
      etages: decomposed.etages,
      pers: decomposed.pers,
      taille_value: decomposed.taille_value,
      parfums: decomposed.parfums,
      theme,
      age,
      message,
      warnings,
      quantity,
      isGift,
    })
  }

  return items
}

function extractTitle(productName) {
  const match = productName.match(/^(?:CD-|GM-)\s*([^\n]+?)(?=\s*(?:Thème|Age|Message|Option)\s*:|$)/s)
  if (match) return match[1].trim()
  return productName.split('\n')[0].replace(/^(CD-|GM-)\s*/, '').trim()
}

/**
 * Decompose le titre en parties (etages, pers, taille, parfums)
 * @param {string} title
 * @param {string} type - 'CD' ou 'GM'
 */
function decomposeTitle(title, type) {
  const empty = { etages: null, pers: null, taille_value: null, parfums: [] }
  if (!title) return empty

  // Etages : seulement pour CD-
  let etages = null
  if (type === 'CD') {
    const etagesMatch = title.match(/(\d+)\s*étages?/i)
    if (etagesMatch) etages = parseInt(etagesMatch[1], 10)
  }

  const parenMatch = title.match(/\(([^)]+)\)/)
  if (!parenMatch) return { ...empty, etages }

  const parts = parenMatch[1].split(',').map(p => p.trim()).filter(p => p)
  if (parts.length === 0) return { ...empty, etages }

  let pers = null
  let taille_value = null
  let parfums = []

  if (type === 'CD') {
    // CD- : 1er element = pers (nombre), reste = parfums
    if (etages && /^\d+$/.test(parts[0])) {
      pers = parseInt(parts[0], 10)
      parfums = parts.slice(1)
    } else {
      parfums = parts
    }
  } else {
    // GM- : 1er element = "boite de N" (pers) OU taille texte
    const first = parts[0]
    const boiteMatch = first.match(/^[Bb]oite\s+de\s+(\d+)$/i)
    if (boiteMatch) {
      pers = parseInt(boiteMatch[1], 10)
      parfums = parts.slice(1)
    } else if (/^\d+$/.test(first)) {
      // Au cas ou : "(24, Mixte)" sans le mot "boite"
      pers = parseInt(first, 10)
      parfums = parts.slice(1)
    } else {
      // Texte (Grand, Grand simple, 500g...) -> taille_value
      taille_value = first
      parfums = parts.slice(1)
    }
  }

  return { etages, pers, taille_value, parfums }
}

function extractField(text, fieldName, stopWords) {
  const stopPattern = stopWords.map(w => `${w}\\s*:`).join('|')
  const regex = new RegExp(`${fieldName}\\s*:\\s*([^\\n]*?)(?=\\s+(?:${stopPattern})|\\s*$)`, 's')
  const match = text.match(regex)
  if (!match) return null

  let value = match[1].trim()
  if (!value) return null

  for (const stop of stopWords) {
    const stopIdx = value.search(new RegExp(`\\b${stop}\\s*:`))
    if (stopIdx !== -1) value = value.substring(0, stopIdx).trim()
  }

  if (/^(Age|Message|Thème|Option)\s*:?\s*$/.test(value)) return null

  return cleanText(value)
}

function cleanText(str) {
  if (!str) return null
  const cleaned = str.trim().replace(/\s+/g, ' ')
  return cleaned.length > 0 ? cleaned : null
}
