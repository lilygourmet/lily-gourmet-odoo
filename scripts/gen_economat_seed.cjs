#!/usr/bin/env node
// Génère supabase/economat_seed.sql à partir du fichier Excel des articles économat.
// Usage : node scripts/gen_economat_seed.cjs "/chemin/vers/economat_groupes_par_categorie.xlsx"
// (défaut : ~/Desktop/A SUP/economat_groupes_par_categorie.xlsx)
//
// L'Excel = 1 feuille par catégorie, colonnes : name | unit | group_suggestion.
// Re-exécutable : si l'Excel change, relancer ce script puis rejouer le SQL.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

const xlsxPath = process.argv[2]
  || path.join(os.homedir(), 'Desktop', 'A SUP', 'economat_groupes_par_categorie.xlsx')

if (!fs.existsSync(xlsxPath)) {
  console.error('Fichier introuvable :', xlsxPath)
  process.exit(1)
}

// Mapping profil métier -> noms de catégories (logique fixe, indépendante de l'Excel)
const PROFIL_CATEGORIES = {
  prod_annex:              ['Production'],
  prod_finition_cd:        ['Finition - CD Prod', 'Production'],
  cake_design:             ['Cake Design'],
  boutique:                ['Boutique'],
  chocolat_cuisine_menage: [],
}

// --- Décompression dans un dossier temporaire ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'economat-'))
execSync(`unzip -o ${JSON.stringify(xlsxPath)} -d ${JSON.stringify(tmp)}`, { stdio: 'ignore' })

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#10;/g, '\n').replace(/&apos;/g, "'").replace(/&quot;/g, '"')

function readShared() {
  const xml = fs.readFileSync(path.join(tmp, 'xl/sharedStrings.xml'), 'utf8')
  const out = []
  const reSi = /<si>([\s\S]*?)<\/si>/g
  let m
  while ((m = reSi.exec(xml))) {
    let text = ''
    const reT = /<t[^>]*>([\s\S]*?)<\/t>/g
    let t
    while ((t = reT.exec(m[1]))) text += t[1]
    out.push(decode(text))
  }
  return out
}

// Mappe nom de feuille -> fichier worksheets/sheetN.xml via workbook.xml + rels
function sheetFilesByName() {
  const wb = fs.readFileSync(path.join(tmp, 'xl/workbook.xml'), 'utf8')
  const rels = fs.readFileSync(path.join(tmp, 'xl/_rels/workbook.xml.rels'), 'utf8')
  const ridToTarget = {}
  let r
  const reRel = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g
  while ((r = reRel.exec(rels))) ridToTarget[r[1]] = r[2]
  const out = []
  const reSheet = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g
  let s
  while ((s = reSheet.exec(wb))) {
    const target = ridToTarget[s[2]] || ''
    out.push({ name: decode(s[1]), file: 'xl/' + target.replace(/^\//, '') })
  }
  return out
}

function colToNum(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n }

function readSheetRows(file, shared) {
  const xml = fs.readFileSync(path.join(tmp, file), 'utf8')
  const rows = []
  const reRow = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
  let r
  while ((r = reRow.exec(xml))) {
    const cells = {}
    const reC = /<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g
    let c
    while ((c = reC.exec(r[2]))) {
      const col = colToNum(c[1])
      const type = c[2]
      const vM = c[3].match(/<v>([\s\S]*?)<\/v>/)
      const isM = c[3].match(/<t[^>]*>([\s\S]*?)<\/t>/)
      let val = ''
      if (type === 's' && vM) val = shared[parseInt(vM[1], 10)] || ''
      else if (type === 'inlineStr' && isM) val = decode(isM[1])
      else if (vM) val = vM[1]
      cells[col] = val.trim()
    }
    rows.push(cells)
  }
  return rows
}

const q = (v) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

// --- Lecture ---
const shared = readShared()
const sheets = sheetFilesByName()

const categories = []   // { id, name, order }
const groups = []       // { id, categoryId, name, order }
const articles = []     // { id, categoryId, groupId, name, unit, order }
let catId = 0, groupId = 0, artId = 0

for (const sheet of sheets) {
  catId += 1
  const category = { id: catId, name: sheet.name, order: catId * 10 }
  categories.push(category)

  const rows = readSheetRows(sheet.file, shared)
  const groupIdByName = new Map()
  let artOrder = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = row[1] || ''
    const unit = row[2] || ''
    const groupName = row[3] || ''
    if (i === 0 && name.toLowerCase() === 'name') continue  // ligne d'en-tête
    if (!name) continue

    let gId = null
    if (groupName) {
      if (!groupIdByName.has(groupName)) {
        groupId += 1
        groups.push({ id: groupId, categoryId: category.id, name: groupName, order: (groupIdByName.size + 1) * 10 })
        groupIdByName.set(groupName, groupId)
      }
      gId = groupIdByName.get(groupName)
    }

    artOrder += 10
    artId += 1
    articles.push({ id: artId, categoryId: category.id, groupId: gId, name, unit: unit || null, order: artOrder })
  }
}

// --- Génération SQL ---
let sql = ''
sql += '-- ============================================================\n'
sql += '-- LILY GOURMET — ÉCONOMAT — Données (catégories / groupes / articles)\n'
sql += '-- GÉNÉRÉ automatiquement par scripts/gen_economat_seed.cjs — NE PAS éditer à la main.\n'
sql += `-- Source : ${path.basename(xlsxPath)} · ${categories.length} catégories, ${groups.length} groupes, ${articles.length} articles\n`
sql += '-- À exécuter APRÈS economat_setup.sql. Re-exécutable (upsert par id).\n'
sql += '-- ============================================================\n\n'

sql += '-- Catégories\n'
sql += 'INSERT INTO economat_categories (id, name, display_order) VALUES\n'
sql += categories.map(c => `  (${c.id}, ${q(c.name)}, ${c.order})`).join(',\n')
sql += '\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, active = true;\n\n'

sql += '-- Groupes\n'
sql += 'INSERT INTO economat_groups (id, category_id, name, display_order) VALUES\n'
sql += groups.map(g => `  (${g.id}, ${g.categoryId}, ${q(g.name)}, ${g.order})`).join(',\n')
sql += '\nON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, display_order = EXCLUDED.display_order;\n\n'

sql += '-- Articles\n'
sql += 'INSERT INTO economat_articles (id, category_id, group_id, name, unit, display_order) VALUES\n'
sql += articles.map(a => `  (${a.id}, ${a.categoryId}, ${a.groupId === null ? 'NULL' : a.groupId}, ${q(a.name)}, ${q(a.unit)}, ${a.order})`).join(',\n')
sql += '\nON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id, group_id = EXCLUDED.group_id, name = EXCLUDED.name, unit = EXCLUDED.unit, display_order = EXCLUDED.display_order, active = true;\n\n'

sql += '-- Mapping profil -> catégories\n'
const pcRows = []
for (const [profil, catNames] of Object.entries(PROFIL_CATEGORIES)) {
  for (const cn of catNames) {
    const c = categories.find(x => x.name === cn)
    if (c) pcRows.push(`  (${q(profil)}, ${c.id})`)
  }
}
if (pcRows.length) {
  sql += 'INSERT INTO economat_profil_categories (profil, category_id) VALUES\n'
  sql += pcRows.join(',\n')
  sql += '\nON CONFLICT (profil, category_id) DO NOTHING;\n\n'
}

sql += '-- Recaler les séquences (car on a inséré des id explicites)\n'
sql += "SELECT setval(pg_get_serial_sequence('economat_categories','id'), (SELECT COALESCE(MAX(id),1) FROM economat_categories));\n"
sql += "SELECT setval(pg_get_serial_sequence('economat_groups','id'), (SELECT COALESCE(MAX(id),1) FROM economat_groups));\n"
sql += "SELECT setval(pg_get_serial_sequence('economat_articles','id'), (SELECT COALESCE(MAX(id),1) FROM economat_articles));\n"

const outPath = path.join(__dirname, '..', 'supabase', 'economat_seed.sql')
fs.writeFileSync(outPath, sql, 'utf8')
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`OK -> ${outPath}`)
console.log(`${categories.length} catégories, ${groups.length} groupes, ${articles.length} articles`)
for (const c of categories) {
  const ng = groups.filter(g => g.categoryId === c.id).length
  const na = articles.filter(a => a.categoryId === c.id).length
  console.log(`  - ${c.name} : ${ng} groupes, ${na} articles`)
}
