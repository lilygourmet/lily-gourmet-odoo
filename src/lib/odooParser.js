// Parser pour les donnees Odoo Lily Gourmet (sync API)
// Filtre CD- + GM- uniquement, ignore Bougies/Decoration
// Warnings : extraits depuis les lignes Odoo "orphelines" (sans prefixe CD-/GM-)
//            qui suivent immediatement une ligne CD- ou GM-

/**
 * Parse une commande Odoo + ses lignes en format app.
 */
export function parseOdooOrder(odooOrder, odooLines) {
  if (!odooOrder || !odooLines) return null

  const orderNum = odooOrder.name
  if (!orderNum) return null

  const commitmentDate = odooOrder.commitment_date
  if (!commitmentDate) return null

  // Parsing securise : Odoo renvoie "YYYY-MM-DD HH:MM:SS",
  // mais parfois le format peut etre inattendu (string vide, deja en ISO, etc.)
  let deliveryAt
  try {
    const dateStr = String(commitmentDate).trim()
    if (!dateStr) return null
    const isoStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z'
    deliveryAt = new Date(isoStr)
    if (isNaN(deliveryAt.getTime())) {
      console.warn(`[odooParser] commitment_date invalide pour ${orderNum}: "${commitmentDate}"`)
      return null
    }
  } catch (e) {
    console.warn(`[odooParser] erreur parsing date pour ${orderNum}: "${commitmentDate}" -> ${e.message}`)
    return null
  }

  const deliverySlot = odooOrder.livraison_hour || null

  const clientName = Array.isArray(odooOrder.partner_id)
    ? odooOrder.partner_id[1]
    : null

  // Vendeur : user_id (vendeur officiel) sinon create_uid (qui a confirme le devis)
  const sellerName =
    (Array.isArray(odooOrder.user_id) ? odooOrder.user_id[1] : null) ||
    (Array.isArray(odooOrder.create_uid) ? odooOrder.create_uid[1] : null) ||
    null

  // 1) Pre-traitement : pour chaque ligne, decide si c'est un produit CD/GM,
  // un produit a ignorer (SA-, Acompte, Bougies...), ou une ligne "warning".
  // Les lignes warning sont celles dont le name (apres trim) :
  //   - ne commence pas par un prefixe connu
  //   - n'est pas un montant/acompte
  //   - vient APRES une ligne CD-/GM- (logique sequentielle)
  const items = parseItems(odooLines)
  if (items.length === 0) return null

  return {
    orderNum,
    clientName,
    sellerName,
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

const KNOWN_PREFIXES = /^(CD-|GM-|GM\s*-|GMD-|SA-|SAK-|E-|MI-|RA-|GS-|V-|B-|H-|N-|Acompte|Bougies|Down\s+Payment|Livraison)/i

// Detecte les lignes 'warning' : pas de prefixe connu, pas un montant, contiennent du texte utile
function isPotentialWarningLine(productName) {
  if (!productName) return false
  const trimmed = productName.trim()
  if (trimmed.length < 3) return false
  // Si c'est un produit connu, ce n'est pas un warning
  if (KNOWN_PREFIXES.test(trimmed)) return false
  // Eviter "Down Payment" (acompte en anglais)
  if (/^Down\s+Payment/i.test(trimmed)) return false
  return true
}

// 1ère ligne RÉELLE du nom (le produit) : on saute les ⚠️ et on retire le [882] éventuel.
// On ne juge le produit QUE sur cette ligne — sinon une option citée dans la description
// (« Décoration supplémentaire », « Bougies »…) ferait rejeter à tort le vrai gâteau.
function productFirstLine(productName) {
  const fl = String(productName || '').trim().split('\n').map(s => s.trim())
    .find(s => s && !/^⚠️/.test(s)) || ''
  return fl.replace(/^\[\s*\d+\s*\]\s*/, '')
}

// Detecte si une ligne est un produit CD- / GM- / GMD- a garder
export function isCdGmProduct(productName) {
  if (!productName) return false
  const head = productFirstLine(productName)
  if (!/^(CD-|GM-|GM\s*-|GMD-)/i.test(head)) return false
  if (/^(CD-|GM-|GMD-)\s*Bougies/i.test(head)) return false
  if (/^(CD-|GM-|GMD-)?\s*D[ée]coration\s+suppl[ée]mentaire/i.test(head)) return false
  // Ignorer les toppers (decoration cake)
  if (/^CD-\s*Happy\s+Birthday\s+Topper/i.test(head)) return false
  if (/\btopper\b/i.test(head)) return false
  return true
}

// Detecte les lignes Odoo a IGNORER completement (pas warning, pas produit)
// E-, MI-, RA-, GS-, V-, B-, H-, N- = produits qu'on ne veut ni en commande ni en warning
// Livraison = ligne de livraison Odoo (frais de port), pas un warning
// [XXX] devant un de ces prefixes aussi
function isIgnoredProduct(productName) {
  if (!productName) return false
  const trimmed = productName.trim()
  // Retirer le [XXX] eventuel au debut
  const noRef = trimmed.replace(/^\[\s*\d+\s*\]\s*/, '')
  return /^(E-|MI-|RA-|GS-|V-|B-|H-|N-|SA-|SAK-|Acompte|Down\s+Payment|Livraison)/i.test(noRef)
}

function parseItems(odooLines) {
  const items = []
  let lastItemRef = null  // Reference vers le dernier item ajoute (pour rattacher les warnings)

  for (const line of odooLines) {
    const productName = (line.name || '').trim()
    const quantity = parseFloat(line.product_uom_qty) || 0

    // CAS 1 : Ligne CD- ou GM- a garder
    if (isCdGmProduct(productName)) {
      if (quantity === 0) continue

      // Les ⚠️ sont desormais ecrits DANS la description de l'article (1 par ligne).
      const cleanName = productName.split('\n').filter(p => !/^\s*⚠️/.test(p)).join('\n').trim()
      const embeddedWarns = productName.split('\n')
        .filter(p => /^\s*⚠️/.test(p))
        .map(p => p.replace(/^\s*⚠️\s*/, '').replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 0)

      const type = /^CD-/i.test(productName) ? 'CD' : 'GM'
      const title = extractTitle(cleanName)
      if (!title) continue

      const DECOR_STOPS = ['Modèle', 'Modelage', 'Impression', 'Moule', 'Décor', 'Fleurs']
      const OTHER = ['Thème', 'Age', 'Message', 'Option']
      const theme = extractField(cleanName, 'Thème', ['Age', 'Message', 'Option', ...DECOR_STOPS])
      const age = extractField(cleanName, 'Age', ['Message', 'Option', ...DECOR_STOPS])
      const message = extractField(cleanName, 'Message', ['Age', 'Option', 'Acompte', ...DECOR_STOPS])
      const modele = extractField(cleanName, 'Modèle', ['Modelage', 'Impression', 'Moule', 'Décor', 'Fleurs', ...OTHER])
      const modelage = extractField(cleanName, 'Modelage', ['Modèle', 'Impression', 'Moule', 'Décor', 'Fleurs', ...OTHER])
      const impression = extractField(cleanName, 'Impression', ['Modèle', 'Modelage', 'Moule', 'Décor', 'Fleurs', ...OTHER])
      const moule = extractField(cleanName, 'Moule', ['Modèle', 'Modelage', 'Impression', 'Décor', 'Fleurs', ...OTHER])
      const decor = extractField(cleanName, 'Décor', ['Modèle', 'Modelage', 'Impression', 'Moule', 'Fleurs', ...OTHER])
      const fleurs = extractField(cleanName, 'Fleurs', ['Modèle', 'Modelage', 'Impression', 'Moule', 'Décor', ...OTHER])

      const decomposed = decomposeTitle(title, type)

      const priceUnit = parseFloat(line.price_unit) || 0
      const isGift = priceUnit === 100

      const item = {
        type,
        title: cleanText(title),
        etages: decomposed.etages,
        pers: decomposed.pers,
        taille_value: decomposed.taille_value,
        parfums: decomposed.parfums,
        theme,
        age,
        message,
        modele,
        modelage,
        impression,
        moule,
        decor,
        fleurs,
        warnings: embeddedWarns,
        quantity,
        isGift,
      }
      items.push(item)
      lastItemRef = item
      continue
    }

    // CAS 2 : Lignes a ignorer completement (E-, MI-, RA-, [474] E-, Livraison, etc.)
    // Important : ce check vient AVANT le check warning pour eviter de les traiter en warning
    if (isIgnoredProduct(productName)) {
      lastItemRef = null  // coupe le rattachement warning
      continue
    }

    // Un VRAI produit (prix > 0 ou product_id) sans préfixe connu n'est NI un gâteau NI un
    // avertissement — ex. « Plateau Bagels » (salé). Un vrai avertissement est une note libre (prix 0).
    const isRealProduct = (parseFloat(line.price_unit) || parseFloat(line.price_total) || 0) > 0
      || (Array.isArray(line.product_id) ? !!line.product_id[0] : !!line.product_id)

    // CAS 3 : Ligne "warning" potentielle (suit un CD- ou GM-) — seulement si ce n'est PAS un vrai produit
    if (lastItemRef && isPotentialWarningLine(productName) && !isRealProduct) {
      const warningText = productName.replace(/\s+/g, ' ').trim()
      if (warningText.length > 2) {
        lastItemRef.warnings.push(warningText)
      }
      continue
    }
    // Vrai produit non géré ci-dessus (ex. plateau salé sans préfixe) → coupe le rattachement warning
    // (il est affiché ailleurs, via les lignes de vente), et n'est jamais collé au gâteau.
    if (isRealProduct) { lastItemRef = null; continue }

    // CAS 4 : Tout le reste (SA-, Acompte, etc.) -> coupe le rattachement warning
    if (KNOWN_PREFIXES.test(productName) || /^Down\s+Payment/i.test(productName)) {
      lastItemRef = null
    }
  }

  return items
}

function extractTitle(productName) {
  // productName est deja trim()
  let cleaned = productName.replace(/^(CD-|GM-|GMD-)\s*/i, '')

  const stopMatch = cleaned.match(/^([\s\S]*?)(?:\n\s*)?(?:Thème|Age|Message|Option|Modèle|Modelage|Impression|Moule|Décor|Fleurs)\s*:/m)
  if (stopMatch) {
    cleaned = stopMatch[1]
  }

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

  // Cake design « nouvelle commande » (configurateur) : format attribut « Nom : Valeur »,
  // ex. « … Nombre de personnes : 10 parfum étage 1 ( l'étage le plus haut) : fraisier ».
  // Le nb de personnes et le parfum sont APRÈS des « : » (pas dans une parenthèse de variante).
  if (type === 'CD' && /parfum\b[^:]*:/i.test(title)) {
    const persMatch = title.match(/nombre de personnes\s*:\s*(\d+)/i)
    const parfums = []
    const re = /parfum\b[^:]*:\s*(.+?)(?=\s+parfum\b[^:]*:|$)/gi
    let pm
    while ((pm = re.exec(title))) { const v = pm[1].trim(); if (v) parfums.push(v) }
    return { etages, pers: persMatch ? parseInt(persMatch[1], 10) : null, taille_value: null, parfums }
  }

  const parenMatch = title.match(/\(([^)]+)\)/)
  if (!parenMatch) return { ...empty, etages }

  const parts = parenMatch[1].split(',').map(p => p.trim()).filter(p => p)
  if (parts.length === 0) return { ...empty, etages }

  let pers = null
  let taille_value = null
  let parfums = []

  // Formes connues pour CD-
  const FORMES = /^(carr[eé]|rectangle|rond|bomb[eé]|coeur|c\u0153ur)$/i

  if (type === 'CD') {
    // Parser intelligent : scanner tous les elements pour identifier
    // - nombres = pers (priorité au plus grand si plusieurs, mais en general il n'y en a qu'un)
    // - mots qui matchent FORMES = taille_value
    // - reste = parfums
    for (const p of parts) {
      if (/^\d+$/.test(p)) {
        // C'est un nombre = pers
        if (pers === null) pers = parseInt(p, 10)
        // Si on a deja un pers, on ignore les autres nombres (cas rare)
      } else if (FORMES.test(p)) {
        taille_value = p
      } else {
        parfums.push(p)
      }
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
  const stopPattern = stopWords.map(w => `${w}\\s*:`).join('|')
  const regex = new RegExp(
    `${fieldName}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${stopPattern})|\\s*$)`,
    'i'
  )
  const match = text.match(regex)
  if (!match) return null

  let value = match[1].trim()
  if (!value) return null

  for (const stop of stopWords) {
    const stopIdx = value.search(new RegExp(`\\b${stop}\\s*:`, 'i'))
    if (stopIdx !== -1) value = value.substring(0, stopIdx).trim()
  }

  if (/^(Age|Message|Thème|Option|Modèle|Modelage|Impression|Moule|Décor|Fleurs)\s*:?\s*$/i.test(value)) return null

  return cleanText(value)
}

function cleanText(str) {
  if (!str) return null
  const cleaned = str.trim().replace(/\s+/g, ' ')
  return cleaned.length > 0 ? cleaned : null
}
