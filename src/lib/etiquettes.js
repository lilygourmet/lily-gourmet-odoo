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

// Genere les lignes ZPL "nom + nb pers" pour les etiquettes selectionnees
// items : [{ article, size, qty }]
export function buildZplLabels(items) {
  // Format etiquette Zebra 4x6 (largeur 800 dots @ 203dpi)
  // On genere une etiquette par occurrence (qty fois)
  const blocks = []

  for (const { article, size, qty } of items) {
    const repeats = Math.max(0, qty)
    if (repeats === 0) continue

    const nameClean = stripOdooPrefix(article.name)
    const subtitle = size ? `${size} personnes` : ''

    for (let i = 0; i < repeats; i++) {
      blocks.push(buildSingleZpl(nameClean, subtitle))
    }
  }

  return blocks.join('\n')
}

function stripOdooPrefix(name) {
  // Retire le prefixe [123] si present
  return String(name || '').replace(/^\[\d+\]\s*/, '').trim()
}

function buildSingleZpl(name, subtitle) {
  // Format basique 4x6 pouces (203dpi -> 812x1218 dots)
  // Texte centre, nom en gros, subtitle en plus petit
  const lines = []
  lines.push('^XA')           // start
  lines.push('^MMT')          // mode tear-off
  lines.push('^PW812')        // print width
  lines.push('^LL406')        // label length (2 pouces)
  lines.push('^LS0')

  // Nom : font 0 (sans-serif), grand, centre
  lines.push('^FT50,150^A0N,60,60^FB712,2,0,C,0^FD' + escapeZpl(name) + '^FS')

  if (subtitle) {
    lines.push('^FT50,260^A0N,40,40^FB712,1,0,C,0^FD' + escapeZpl(subtitle) + '^FS')
  }

  lines.push('^PQ1,0,1,Y')   // 1 etiquette
  lines.push('^XZ')          // end
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
