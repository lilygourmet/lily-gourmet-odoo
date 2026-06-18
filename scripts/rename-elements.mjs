// Renomme les PNG extraits avec des noms lisibles (map #num -> nom).
//   node scripts/rename-elements.mjs "Spiderman LS"
import { readdirSync, renameSync } from 'node:fs'
const stem = process.argv[2] || 'Spiderman LS'
const dir = `cake-photos/${stem}`

const NAMES = {
  1:'Bulle explosion (vide)',2:'Chiffre 4 (rouge)',3:'Chiffre 4 (rouge)',4:'Petits chiffres 1-9',5:'BOOM',
  6:'Chiffre 5 (bulle)',7:'Araignee (logo)',8:'Bulles BD assorties',9:'BAM',10:'SLASH',
  11:'BAM',12:'Spiderman (figurine)',13:'Ville (cercle jaune)',14:'KA-POW',15:'BOOM',
  16:'Spiderman saut',17:'Masque Spiderman',18:'Ville coloree',19:'ZAP',20:'BOOM',
  21:'Ville coloree',22:'Spiderman saut',23:'Iron Man',24:'Iron Man (cercle)',25:'Prenom Simo',
  26:'Cercle vide',27:'Spiderman (cercle)',28:'Prenom Haron',29:'Cercle vide',30:'Cercle vide',
  31:'Cercle vide',32:'Spiderman debout',33:'Spidey (cartoon)',34:'Toile araignee',35:'Toile araignee',
  36:'Spidey (cartoon)',37:'Logo PAPA',38:'Planche badges Spiderman',39:'Badge Spiderman (cercle)',40:'Planche mini Spiderman',
  41:'Planche badges araignee',42:'Planche badges araignee',43:'Planche badges (bleu)',44:'Planche badges',45:'Planche bulles BD',
  46:'Ville (silhouette noire)',47:'Spiderman saut',48:'Masque Spiderman',49:'Toile araignee (noire)',50:'Spiderman court',
  51:'Araignee (logo)',52:'Ville (silhouette noire)',53:'Happy Birthday (bulle)',54:'Spiderman',55:'Spiderman',
  56:'BAM',57:'Point exclamation (BD)',58:'Toile araignee',59:'BOOM',60:'Voiture bleue',
  61:'Logo Chanel',62:'Logo Prada',63:'Logo Gucci',64:'Logo Hermes',65:'Logo Louis Vuitton',
  66:'Fond vert',67:'Texte Gucci',68:'Cadre vide',69:'Texte Chanel',70:'Monogramme LV',
  71:'Texte Netherlands',72:'Drapeau Pays-Bas',73:'Texte Germany',74:'Drapeau Allemagne',75:'Texte Belgium',
  76:'Drapeau Belgique',77:'Texte Portugal',78:'Drapeau Portugal',79:'Drapeau Espagne',80:'Texte Spain',
  81:'Drapeau Irlande',82:'Texte Ireland',83:'Toile araignee',84:'Araignee (logo)',85:'Chiffres (rouge toile)',
  86:'Chiffre 5 (Spiderman)',87:'Chiffre 6 (Spiderman)',88:'Chiffre 2 (Spiderman)',89:'ZAP',90:'POW',
  91:'Chiffre 7 (Spiderman)',92:'Masque Spiderman',93:'Spiderman',94:'Ville coloree',95:'Spiderman accroupi',
  96:'Badge Spiderman (cercle)',97:'Badge Spiderman (cercle)',98:'Planche badges Spiderman',99:'Badge araignee (cercle)',
  100:'Masque Spiderman',101:'Masque Spiderman (incline)',102:'Spiderman accroupi',103:'Masque Spiderman',104:'Masque Spiderman',
  105:'Badge araignee (cercle)',106:'Rond Spider-Man (texte)',107:'Masque Spiderman',108:'Spiderman visage (cercle)',109:'Spiderman BD (cercle)',
  110:'BAM',111:'Spiderman BD (cercle)',112:'Spiderman BD (cercle)',113:'Spiderman BD (cercle)',114:'Spiderman BD (cercle)',
  115:'Spiderman BD (cercle)',116:'Spiderman BD (cercle)',117:'Spiderman (gros plan)',118:'Spiderman BD (cercle)',119:'Spiderman BD (cercle)',
  120:'Spiderman BD (cercle)',121:'Spiderman (gros plan)',122:'Spiderman BD (cercle)',123:'Spiderman BD (cercle)',124:'Spiderman BD (cercle)',
  125:'Spiderman (gros plan)',126:'Spiderman (gros plan)',127:'Spiderman BD (cercle)',128:'Spiderman BD (cercle)',129:'Spiderman BD (cercle)',
  130:'Spiderman BD (cercle)',131:'Spiderman BD (cercle)',132:'Spiderman BD (cercle)',133:'Spiderman BD (cercle)',134:'Spiderman BD (cercle)',
  135:'Spiderman BD (cercle)',136:'Spiderman BD (cercle)',137:'Spiderman BD (cercle)',138:'Spiderman BD (cercle)',139:'Spiderman BD (cercle)',
  140:'Spiderman BD (cercle)',141:'Spiderman BD (cercle)',142:'Spiderman BD (cercle)',143:'Spiderman BD (cercle)',144:'Happy Birthday (texte)',
}

const files = readdirSync(dir).filter(f => /\.png$/i.test(f))
let n = 0
for (const f of files) {
  const num = parseInt(f)
  const nm = NAMES[num]
  if (!nm) { console.log('  (pas de nom pour #' + num + ' : ' + f + ')'); continue }
  const target = `${String(num).padStart(3, '0')} ${nm}.png`
  if (f !== target) { renameSync(`${dir}/${f}`, `${dir}/${target}`); n++ }
}
console.log(`${n} fichier(s) renommé(s).`)
