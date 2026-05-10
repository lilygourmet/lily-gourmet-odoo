// ============================================================
// API: POST /api/labels-client-zpl
//
// Genere des etiquettes ZPL par commande client.
// Format etiquette : 5 x 2.5 cm (^PW400 ^LL200)
//
// Body JSON :
//  - mode = "single" (1 article * N etiquettes) ou "indiv" (regroupe les indiv)
//  - orderNum : "S48305"
//  - clientName : "Said Himmi"
//
//  Si mode="single" :
//    - productName : "Plateau Tartelettes"
//    - count : nombre d'etiquettes (genere 1/N, 2/N, ... ou pas de X/Y si count=1)
//
//  Si mode="indiv" :
//    - items : [{ name: "Fraisier", qty: 2 }, ...]
//    - On groupe sur autant d'etiquettes que necessaire (3 lignes max par etiquette)
// ============================================================

function escZpl(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // accents
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .trim()
}

// Retire le prefixe Odoo type "[123]" et nettoye
function cleanProductName(name) {
  return String(name || '')
    .replace(/^\[\d+\]\s*/, '')
    .trim()
}

// Etiquette 5x2.5cm pour plateau / boite / article unique
// Layout :
//   - haut gauche : orderNum (petit)
//   - haut droit : X/Y (si total>1, bordeaux)
//   - milieu : clientName (gros)
//   - bas : productName (petit)
function buildSingleLabel({ orderNum, clientName, productName, index, total }) {
  const lines = []
  lines.push('^XA')
  lines.push('^CI28')
  lines.push('^PW400')
  lines.push('^LL200')
  lines.push('^LH0,0')

  // Haut gauche : numero commande (16pt env)
  if (orderNum) {
    lines.push(`^FO10,8^A0N,22,22^FD${escZpl(orderNum)}^FS`)
  }

  // Haut droit : X/Y (si plusieurs)
  if (index && total && total > 1) {
    lines.push(`^FO260,8^A0N,24,24^FB130,1,0,R,0^FD${escZpl(index + ' / ' + total)}^FS`)
  }

  // Milieu : nom client (gros, centre)
  lines.push(`^FO10,55^A0N,32,32^FB380,1,0,C,0^FD${escZpl(clientName)}^FS`)

  // Bas : nom produit (centre, petit, 2 lignes max)
  if (productName) {
    lines.push(`^FO10,115^A0N,22,22^FB380,2,0,C,0^FD${escZpl(productName)}^FS`)
  }

  lines.push('^XZ')
  lines.push('')
  return lines.join('\n')
}

// Etiquette pour individuels regroupes
// Layout :
//   - haut : orderNum + clientName (petit)
//   - milieu : liste articles "2 x Fraisier" sur 3 lignes max
//   - haut droit : X/Y si decoupe en plusieurs etiquettes
function buildIndivLabel({ orderNum, clientName, items, index, total }) {
  const lines = []
  lines.push('^XA')
  lines.push('^CI28')
  lines.push('^PW400')
  lines.push('^LL200')
  lines.push('^LH0,0')

  // Haut : "S48305 Himmi"
  const header = (orderNum ? orderNum + ' ' : '') + (clientName || '')
  lines.push(`^FO10,8^A0N,22,22^FD${escZpl(header)}^FS`)

  // Haut droit : X/Y si plusieurs
  if (index && total && total > 1) {
    lines.push(`^FO280,8^A0N,22,22^FB110,1,0,R,0^FD${escZpl(index + '/' + total)}^FS`)
  }

  // Liste articles : 3 lignes max, chacune format "N x nom"
  // Position Y = 45, 80, 115, 150 (4 lignes possibles, max 3 utilisees)
  const yStart = 45
  const yStep = 38
  items.slice(0, 4).forEach((item, idx) => {
    const text = `${item.qty} x ${cleanProductName(item.name)}`
    lines.push(`^FO10,${yStart + idx * yStep}^A0N,26,26^FB380,1,0,L,0^FD${escZpl(text)}^FS`)
  })

  lines.push('^XZ')
  lines.push('')
  return lines.join('\n')
}

// Decoupe les indiv en plusieurs etiquettes (3 lignes par etiquette)
const INDIV_PER_LABEL = 3

function chunkIndiv(items) {
  const chunks = []
  for (let i = 0; i < items.length; i += INDIV_PER_LABEL) {
    chunks.push(items.slice(i, i + INDIV_PER_LABEL))
  }
  return chunks
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body || {}
    const mode = body.mode || 'single'
    const orderNum = String(body.orderNum || '').trim()
    const clientName = String(body.clientName || '').trim()

    if (!orderNum && !clientName) {
      return res.status(400).json({ error: 'orderNum or clientName required' })
    }

    let zpl = ''

    if (mode === 'single') {
      const productName = cleanProductName(body.productName)
      const count = Math.max(1, Math.min(99, Number(body.count) || 1))

      for (let i = 1; i <= count; i++) {
        zpl += buildSingleLabel({
          orderNum, clientName, productName,
          index: i,
          total: count,
        })
      }
    } else if (mode === 'indiv') {
      const items = Array.isArray(body.items) ? body.items.filter(it => it && it.name && it.qty > 0) : []
      if (items.length === 0) {
        return res.status(400).json({ error: 'items required for indiv mode' })
      }

      const chunks = chunkIndiv(items)
      const total = chunks.length
      chunks.forEach((chunk, idx) => {
        zpl += buildIndivLabel({
          orderNum, clientName,
          items: chunk,
          index: idx + 1,
          total,
        })
      })
    } else {
      return res.status(400).json({ error: `unknown mode: ${mode}` })
    }

    res.status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="etiquette-${orderNum}.zpl"`)
      .send(zpl)
  } catch (e) {
    console.error('[labels-client-zpl] error:', e)
    return res.status(500).json({ error: e.message })
  }
}
