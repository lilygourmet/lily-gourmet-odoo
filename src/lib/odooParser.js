// Parser pour les donnees Odoo Lily Gourmet (sync API)
// Filtre CD- + GM- uniquement, ignore Bougies/Decoration

/**
 * Parse une commande Odoo + ses lignes en format app.
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
    // IMPORTANT : trim() pour enlever les \n  en debut de nom
    const productName = (line.name || '').trim()

    if (shouldIgnoreProduct(productName)) continue

    const quantity = parseFloat(line.product_uom_qty) || 0
    if (quantity === 0) continue

    const type = /^CD-/i.test(productName) ? 'CD' : 'GM'

    const title = extractTitle(productName)

    // Si on n'arrive pas a extraire un titre, on skip cette ligne
    if (!title) continue

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
  // productName est deja trim()
  // 1) On enleve le prefixe CD-/GM- (avec ou sans espace apres)
  let cleaned = productName.replace(/^(CD-|GM-)\s*/i, '')

  // 2) On prend tout jusqu'au premier "Thème:" / "Age:" / "Message:" / "Option:"
  // (le tout en mode multiligne car le nom contient des \n)
  const stopMatch = cleaned.match(/^([\s\S]*?)(?:\n\s*)?(?:Thème|Age|Message|Option)\s*:/m)
  if (stopMatch) {
    cleaned = stopMatch[1]
  }

  // 3) On nettoie : trim + remplace \n et multiples espaces par 1 espace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned || null
}

/**
 * Decompose le titre en parties (etages, pers, taille, parfums)
 */
function decomposeTitle(title, type) {
  const empty = { etages: null, pers: null, taille_value: null, parfums: [] }
  if (!title) return empty

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
    if (etages && /^\d+$/.test(parts[0])) {
      pers = parseInt(parts[0], 10)
      parfums = parts.slice(1)
    } else {
      parfums = parts
    }
  } else {
    // GM-
    const first = parts[0]
    const boiteMatch = first.match(/^[Bb]oite\s+de\s+(\d+)$/i)
    if (boiteMatch) {
      pers = parseInt(boiteMatch[1], 10)
      parfums = parts.slice(1)
    } else if (/^\d+$/.test(first)) {
      pers = parseInt(first, 10)
      parfums = parts.slice(1)
    } else {
      taille_value = first
      parfums = parts.slice(1)
    }
  }

  return { etages, pers, taille_value, parfums }
}

function extractField(text, fieldName, stopWords) {
  // Echapper les chars speciaux dans les stopWords (ex: 'è' dans 'Thème')
  const stopPattern = stopWords.map(w => `${w}\\s*:`).join('|')
  // Mode multiligne : on accepte \n entre les champs
  const regex = new RegExp(
    `${fieldName}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${stopPattern})|\\s*$)`,
    'i'
  )
  const match = text.match(regex)
  if (!match) return null

  let value = match[1].trim()
  if (!value) return null

  // Stop sur les autres mots cles si trouves
  for (const stop of stopWords) {
    const stopIdx = value.search(new RegExp(`\\b${stop}\\s*:`, 'i'))
    if (stopIdx !== -1) value = value.substring(0, stopIdx).trim()
  }

  if (/^(Age|Message|Thème|Option)\s*:?\s*$/i.test(value)) return null

  return cleanText(value)
}

function cleanText(str) {
  if (!str) return null
  const cleaned = str.trim().replace(/\s+/g, ' ')
  return cleaned.length > 0 ? cleaned : null
}
