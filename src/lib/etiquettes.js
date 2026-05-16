// Helpers pour la vue Etiquettes
// Charge les articles E-/GS-/SU- depuis Supabase et gere le state des quantites

import { supabase } from './supabase.js'

export async function loadEtiquettesArticles() {
  const { data, error } = await supabase
    .from('etiquettes_articles')
    .select('*')
    .eq('sale_ok', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

// Genere une cle unique pour identifier une quantite
// - Entremets : "{templateId}:{taille}"
// - GS / SU : "{templateId}"
export function makeQtyKey(templateId, size = null) {
  return size ? `${templateId}:${size}` : `${templateId}`
}

// Genere les lignes ZPL "nom + nb pers (+ prix) + code-barres" pour les etiquettes selectionnees
// items : [{ article, size, qty }]
export function buildZplLabels(items) {
  // Format etiquette Zebra 5cm x 2.5cm (203dpi -> 400 x 200 dots)
  // On genere une etiquette par occurrence (qty fois)
  const blocks = []

  for (const { article, size, qty } of items) {
    const repeats = Math.max(0, qty)
    if (repeats === 0) continue

    // Retire le prefixe Odoo [123] ET les prefixes E-/GS-/SU-
    const nameClean = stripAllPrefixes(article.name)
    const subtitle = size ? `${size} personnes` : ''

    // Prix : uniquement pour GS et SU (jamais pour les entremets E-)
    let priceLine = null
    if ((article.category === 'gs' || article.category === 'su')
        && article.price && article.price > 0) {
      priceLine = formatPrice(article.price)
    }

    // Code-barres : utilise le barcode Odoo si dispo, sinon fallback sur template_id
    const barcode = pickBarcode(article)

    for (let i = 0; i < repeats; i++) {
      blocks.push(buildSingleZpl(nameClean, subtitle, priceLine, barcode))
    }
  }

  return blocks.join('\n')
}

function pickBarcode(article) {
  // Priorite : barcode Odoo natif > default_code > template_id en fallback
  const raw = article.barcode || article.default_code || ''
  const s = String(raw).trim()
  if (s) return s
  // Fallback : utilise l'id template Odoo pour que le code-barres soit toujours present
  // et permette de retrouver l'article au scan via la table etiquettes_articles
  return String(article.odoo_template_id || '0')
}

function stripAllPrefixes(name) {
  // Retire d'abord le code Odoo [123]
  let s = String(name || '').replace(/^\[\d+\]\s*/, '').trim()
  // Puis le prefixe E- / GS- / SU- (avec eventuels espaces)
  s = s.replace(/^(E|GS|SU)\s*-\s*/i, '').trim()
  return s
}

// Format prix : "350 DH" (sans centimes inutiles), "12,50 DH" si decimal
function formatPrice(p) {
  if (!p || isNaN(p)) return ''
  const rounded = Math.round(p * 100) / 100
  const isInt = Number.isInteger(rounded)
  const txt = isInt
    ? String(rounded)
    : rounded.toFixed(2).replace('.', ',')
  return `${txt} DH`
}

function stripOdooPrefix(name) {
  // Conserve pour compat externe : retire juste le [123]
  return String(name || '').replace(/^\[\d+\]\s*/, '').trim()
}

function buildSingleZpl(name, subtitle, priceLine, barcode) {
  // Format Zebra 5cm x 2.5cm (203dpi -> 400 x 200 dots)
  //
  // Layout (inspire du template Odoo) :
  //   +-----------------------------------------+
  //   | Nom article (1-2 lignes)       PRIX     |  haut
  //   | subtitle (pers) si present              |
  //   |                                         |
  //   | ████ Code 128 ████                      |  bas
  //   +-----------------------------------------+
  //
  // Zone texte gauche : x=10..260, prix a droite : x=265..395
  // Zone code-barres : x=10..395, y=110..195

  const lines = []
  lines.push('^XA')
  lines.push('^CI28')         // UTF-8
  lines.push('^MMT')          // mode tear-off
  lines.push('^PW400')        // print width 5cm
  lines.push('^LL200')        // label length 2.5cm
  lines.push('^LS0')

  // ===== ZONE TEXTE (haut) =====
  // Nom de l'article : 1-2 lignes, gauche, police moyenne
  // Largeur de bloc reservee : 250 (laisse 140 pour le prix a droite)
  const hasPrice = !!priceLine
  const nameWidth = hasPrice ? 250 : 380
  lines.push(`^FT10,30^A0N,22,20^FB${nameWidth},2,0,L,0^FD${escapeZpl(name)}^FS`)

  // Subtitle (X personnes) : sous le nom, plus petit
  if (subtitle) {
    lines.push(`^FT10,90^A0N,20,18^FB${nameWidth},1,0,L,0^FD${escapeZpl(subtitle)}^FS`)
  }

  // Prix : a droite, plus gros, aligne avec le nom
  if (hasPrice) {
    lines.push(`^FT265,40^A0N,32,24^FB130,1,0,R,0^FD${escapeZpl(priceLine)}^FS`)
  }

  // ===== CODE-BARRES (bas) =====
  // Code 128, hauteur 65 dots, ligne texte interpretee visible en dessous
  // ^BY2 = module 2 dots (largeur de barre fine)
  // ^BCN,65,Y,N,N = Code 128, normal, 65 high, print interpretation line YES, line above NO, no UCC check
  lines.push('^FO10,115^BY2')
  lines.push('^BCN,65,Y,N,N')
  lines.push(`^FD${escapeZplBarcode(barcode)}^FS`)

  lines.push('^PQ1,0,1,Y')
  lines.push('^XZ')
  return lines.join('\n')
}

function escapeZpl(s) {
  // ZPL: caracteres speciaux echappes via ^FH
  // Pour simplifier, on remplace les accents par equivalent ASCII
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // retire accents
    .replace(/[^\x20-\x7E]/g, '')       // garde uniquement ASCII printable
    .replace(/\^/g, ' ')                // ^ est reserve ZPL
    .replace(/~/g, ' ')                 // ~ aussi
}

function escapeZplBarcode(s) {
  // Code 128 accepte ASCII imprimable. On retire tout ce qui pourrait casser
  // l'encodage, en gardant chiffres/lettres/quelques symboles courants.
  return String(s || '')
    .replace(/[\^~]/g, '')             // caracteres reserves ZPL
    .replace(/[^\x20-\x7E]/g, '')      // ASCII printable uniquement
    .trim() || '0'
}

// Trigger le sync articles depuis Odoo
export async function syncEtiquettesFromOdoo(token) {
  const r = await fetch('/api/sync-etiquettes', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`Sync etiquettes erreur ${r.status}: ${txt}`)
  }
  return await r.json()
}
