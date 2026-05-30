// Outil one-shot : pour chaque modèle d'attestation dans public/hr_modeles/,
//  1) retire les surlignages jaunes (<w:highlight ... />),
//  2) remplace l'expression « Rabat, le <date> » par « Rabat, le {DATE_REDACTION} »
//     (placeholder docxtemplater) — y compris quand la date est éclatée sur plusieurs
//     <w:t> runs dans le XML (cas fréquent après édition Word).
//
// Exécution : `node scripts/fix-attestations-templates.mjs`
// (modifie les .docx en place ; faire un commit ensuite).

import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'

const DIR = 'public/hr_modeles'

function fixDocXml(xml) {
  // 1) Retire toutes les balises <w:highlight ... />
  xml = xml.replace(/<w:highlight\s[^/]*\/>/g, '')

  // 2) Remplace les paragraphes contenant « Rabat » + une date
  xml = xml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (whole, inner) => {
    const plain = inner.replace(/<[^>]+>/g, '')
    if (!/Rabat/i.test(plain)) return whole

    // Considère seulement les paragraphes qui contiennent une date hardcodée
    // (deux chiffres / deux chiffres / quatre chiffres, espaces tolérés)
    const hasDate = /\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4}/.test(plain)
    const hasPlaceholder = /\{DATE_REDACTION\}/.test(plain)
    if (!hasDate && !hasPlaceholder) return whole

    // Récupère <w:pPr>...</w:pPr> (props du paragraphe) si présent
    const pPrMatch = inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)
    const pPr = pPrMatch ? pPrMatch[0] : ''

    // Récupère le premier <w:rPr>...</w:rPr> (props de run) pour conserver la police/taille
    const rPrMatch = inner.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)
    const rPr = rPrMatch ? rPrMatch[0] : ''

    // Reconstruit un paragraphe propre : un seul run avec le placeholder
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">Rabat, le {DATE_REDACTION}</w:t></w:r></w:p>`
  })

  return xml
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.docx'))
let touched = 0
for (const fname of files) {
  const fp = path.join(DIR, fname)
  const buf = fs.readFileSync(fp)
  const zip = new PizZip(buf)
  const docXml = zip.file('word/document.xml')
  if (!docXml) {
    console.warn('Skip (pas de document.xml):', fname)
    continue
  }
  const before = docXml.asText()
  const after = fixDocXml(before)
  if (before === after) {
    console.log('Inchangé:', fname)
    continue
  }
  zip.file('word/document.xml', after)
  const out = zip.generate({ type: 'nodebuffer' })
  fs.writeFileSync(fp, out)
  console.log('Corrigé:', fname)
  touched++
}
console.log(`\n${touched} fichier(s) modifié(s).`)
