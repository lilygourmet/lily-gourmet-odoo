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

// Le decoupage a-t-il perdu des caracteres (nom trop long meme en petit) ?
function aEteTronque(texte, lignes) {
  return lignes.join(' ').length < String(texte || '').trim().length
}

// Coupe un texte en lignes d'au plus `parLigne` caracteres, sans couper les mots
// (sauf mot plus long qu'une ligne). Au-dela de `maxLignes`, on tronque avec « . ».
function couperEnLignes(texte, parLigne, maxLignes) {
  const lignes = []
  let courante = ''
  for (const mot of String(texte || '').split(/\s+/).filter(Boolean)) {
    const essai = courante ? `${courante} ${mot}` : mot
    if (essai.length <= parLigne) { courante = essai; continue }
    if (courante) lignes.push(courante)
    courante = mot.length > parLigne ? mot.slice(0, parLigne) : mot
  }
  if (courante) lignes.push(courante)
  if (lignes.length > maxLignes) {
    const gardees = lignes.slice(0, maxLignes)
    gardees[maxLignes - 1] = gardees[maxLignes - 1].slice(0, Math.max(1, parLigne - 1)) + '.'
    return gardees
  }
  return lignes
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
  // On decoupe le nom NOUS-MEMES, une ligne = un champ ^FO. Laisser ZPL le faire
  // (^FB) le fait imprimer les lignes en trop PAR-DESSUS les precedentes : un nom
  // de trois lignes sortait illisible (« nohseblat » pour « chocolat noisette »,
  // vecu le 2026-08-31). Et ^FO (coin haut-gauche) au lieu de ^FT (ligne de base),
  // sinon la premiere ligne sort hors de l'etiquette.
  // Le prix est en BAS A DROITE (choix de Layla, 2026-08-31) : le nom prend donc
  // toute la largeur en haut au lieu de s'ecraser sur 250 points.
  const hasPrice = !!priceLine
  // Largeur REELLEMENT imprimee, MESUREE sur la machine le 2026-08-31 (mire de
  // 12/14/16/18 caracteres en police 22) : 16 caracteres de 20 points passent,
  // 18 sont coupes. L'etiquette fait 400 points mais les bords ne recoivent rien.
  const nameWidth = 320
  const maxLignes = subtitle ? 2 : 3
  // On essaie la plus grosse police qui rentre, puis on descend. Avec ^A0N,h,w
  // chaque caractere occupe exactement w points, donc le compte est exact.
  const nom = escapeZpl(name)
  let nameFont = 22
  let nomLignes = []
  for (const f of [22, 20, 18, 16, 14]) {
    nameFont = f
    nomLignes = couperEnLignes(nom, Math.floor(nameWidth / (f - 2)), maxLignes)
    if (nomLignes.every(l => l.length * (f - 2) <= nameWidth) && !aEteTronque(nom, nomLignes)) break
  }
  const interligne = nameFont + 3
  nomLignes.forEach((l, i) => {
    lines.push(`^FO10,${10 + i * interligne}^A0N,${nameFont},${nameFont - 2}^FD${l}^FS`)
  })

  // Subtitle (X personnes) : juste sous la DERNIERE ligne du nom, jamais dessus.
  if (subtitle) {
    const y = 10 + nomLignes.length * interligne + 2
    lines.push(`^FO10,${y}^A0N,20,18^FD${escapeZpl(subtitle)}^FS`)
  }

  // ===== BAS : code-barres a gauche, PRIX a droite =====
  lines.push('^FO12,108^BY2')
  lines.push('^BCN,52,Y,N,N')
  lines.push(`^FD${escapeZplBarcode(barcode)}^FS`)

  // Prix aligne a droite : avec ^A0N,h,w chaque caractere fait w points, donc on
  // calcule nous-memes le x (^FB,R replierait le texte, cf. le nom plus haut).
  if (hasPrice) {
    // Marge de 22 points a droite : colle au bord, le « DH » sortait de l'etiquette.
    const p = escapeZpl(priceLine)
    const w = 26
    const x = Math.max(230, 378 - p.length * w)
    lines.push(`^FO${x},132^A0N,32,${w}^FD${p}^FS`)
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
