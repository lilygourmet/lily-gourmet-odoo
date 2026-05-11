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

// Genere les lignes ZPL "nom + nb pers (+ prix)" pour les etiquettes selectionnees
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

    for (let i = 0; i < repeats; i++) {
      blocks.push(buildSingleZpl(nameClean, subtitle, priceLine))
    }
  }

  return blocks.join('\n')
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

function buildSingleZpl(name, subtitle, priceLine) {
  // Format Zebra 5cm x 2.5cm (203dpi -> 400 x 200 dots)
  // Layout centre vertical : bloc nom + subtitle (+ prix) regroupe au milieu
  const lines = []
  lines.push('^XA')
  lines.push('^CI28')         // UTF-8
  lines.push('^MMT')          // mode tear-off
  lines.push('^PW400')        // print width 5cm
  lines.push('^LL200')        // label length 2.5cm
  lines.push('^LS0')

  // 3 cas : nom seul / nom+pers / nom+pers+prix
  // L'etiquette fait 200 dots de haut. On centre le bloc dans la zone Y=20..180.
  if (priceLine && subtitle) {
    // 3 lignes : nom (haut), pers (milieu), prix (bas)
    // Nom : Y=20 (2 lignes possibles)
    lines.push('^FT10,55^A0N,28,28^FB380,2,0,C,0^FD' + escapeZpl(name) + '^FS')
    // Pers : Y=120
    lines.push('^FT10,135^A0N,24,24^FB380,1,0,C,0^FD' + escapeZpl(subtitle) + '^FS')
    // Prix : Y=170
    lines.push('^FT10,185^A0N,28,28^FB380,1,0,C,0^FD' + escapeZpl(priceLine) + '^FS')
  } else if (subtitle) {
    // 2 lignes : nom (60% haut) + pers (40% bas), groupes au centre vertical
    // Bloc total : nom de Y=45 a Y=110, pers a Y=150
    lines.push('^FT10,75^A0N,32,32^FB380,2,0,C,0^FD' + escapeZpl(name) + '^FS')
    lines.push('^FT10,160^A0N,28,28^FB380,1,0,C,0^FD' + escapeZpl(subtitle) + '^FS')
  } else {
    // 1 seule ligne : nom centre verticalement (Y=100)
    lines.push('^FT10,115^A0N,36,36^FB380,2,0,C,0^FD' + escapeZpl(name) + '^FS')
  }

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
