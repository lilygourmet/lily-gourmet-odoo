import { supabase } from './supabase'
import { downloadBulletinBytes } from './bulletins'
import { memoCache } from './memoCache'
import { todayISO } from './dates'

// Groupes/catégories d'employé (menu déroulant). Simple étiquette de classement :
// n'active aucune permission (le dispatch des perms reste manuel).
export const EMPLOYE_GROUPES = [
  'Pâtisserie',
  'Café / Boutique',
  'Caisse',
  'Commercial / WhatsApp',
  'Livreur',
  'Production',
  'RH / Admin',
  'Aucun',
]

// --- Groupes dynamiques (table employe_groupes). Repli sur la liste fixe ci-dessus. ---
// Cache 10 min (change quasi jamais) ; vidé après ajout/renommage/suppression.
async function _loadGroupes() {
  const { data, error } = await supabase
    .from('employe_groupes').select('nom').order('sort', { ascending: true }).order('nom')
  if (error || !data?.length) return EMPLOYE_GROUPES
  return data.map(g => g.nom)
}
export const loadGroupes = memoCache(_loadGroupes)

export async function createGroupe(nom) {
  const n = (nom || '').trim()
  if (!n) throw new Error('Nom vide')
  const { error } = await supabase.from('employe_groupes').insert({ nom: n })
  if (error) throw error
  loadGroupes.clear()
}

// Renomme un groupe ET met à jour tous les employés + comptes qui l'utilisaient.
export async function renameGroupe(oldNom, newNom) {
  const n = (newNom || '').trim()
  if (!n) throw new Error('Nom vide')
  const { error } = await supabase.from('employe_groupes').update({ nom: n }).eq('nom', oldNom)
  if (error) throw error
  await supabase.from('employes').update({ groupe: n }).eq('groupe', oldNom)
  await supabase.from('profiles').update({ groupe: n }).eq('groupe', oldNom)
  loadGroupes.clear()
}

// Supprime un groupe et détache les employés + comptes concernés.
export async function deleteGroupe(nom) {
  const { error } = await supabase.from('employe_groupes').delete().eq('nom', nom)
  if (error) throw error
  await supabase.from('employes').update({ groupe: null }).eq('groupe', nom)
  await supabase.from('profiles').update({ groupe: null }).eq('groupe', nom)
  loadGroupes.clear()
}

// ============================================================
// CRUD EMPLOYÉS
// ============================================================

/**
 * Charge tous les employés (actifs en premier, puis par nom).
 */
export async function loadEmployes(filterActif = null, excludeFantome = false) {
  let query = supabase
    .from('employes')
    .select('*, societe:societes(*)')
    .order('actif', { ascending: false })
    .order('nom', { ascending: true })

  if (filterActif !== null) query = query.eq('actif', filterActif)
  // Employés fantômes : masqués des suivis (pointage/congés) mais gardés pour
  // l'onglet Employés et les Salaires (qui n'activent pas ce filtre).
  if (excludeFantome) query = query.eq('fantome', false)

  const { data, error } = await query
  if (error) throw error
  const employes = data || []
  // Le salaire net vit dans une table séparée (admin-only). On le rattache ici.
  // Pour un non-admin, la requête renvoie [] (RLS) → salaire_net reste null.
  const { data: remu } = await supabase.from('employes_remuneration').select('employe_id, salaire_net')
  const salById = new Map((remu || []).map(r => [r.employe_id, r.salaire_net]))
  return employes.map(e => ({ ...e, salaire_net: salById.has(e.id) ? salById.get(e.id) : null }))
}

/**
 * Crée un employé.
 */
export async function createEmploye(emp, userId) {
  // Le salaire net est stocké à part (table admin-only) : on l'isole du reste.
  const { salaire_net, ...rest } = emp
  const { data, error } = await supabase
    .from('employes')
    .insert({ ...rest, created_by: userId, updated_by: userId })
    .select()
    .single()
  if (error) throw error
  if (salaire_net !== undefined) {
    const { error: e2 } = await supabase
      .from('employes_remuneration')
      .upsert({ employe_id: data.id, salaire_net })
    if (e2) throw e2
  }
  return data
}

/**
 * Modifie un employé.
 */
// Photo de l'employé : upload dans le bucket public + enregistre l'URL sur la fiche.
const PHOTO_BUCKET = 'photos-employes'
export async function uploadPhotoEmploye(file, empId, userId) {
  if (!file || !empId) return null
  const ext = (String(file.name || 'jpg').split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const path = `${empId}/photo_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  const url = data?.publicUrl || null
  await updateEmploye(empId, { photo_url: url }, userId)
  return url
}

export async function updateEmploye(id, updates, userId) {
  // Le salaire net est stocké à part (table admin-only) : on l'isole du reste.
  const { salaire_net, ...rest } = updates
  const { data, error } = await supabase
    .from('employes')
    .update({ ...rest, updated_by: userId })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  if (salaire_net !== undefined) {
    const { error: e2 } = await supabase
      .from('employes_remuneration')
      .upsert({ employe_id: id, salaire_net })
    if (e2) throw e2
  }
  return data
}

/**
 * Supprime un employé.
 */
export async function deleteEmploye(id) {
  const { error } = await supabase.from('employes').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// GÉNÉRATION DE DOCUMENTS .docx
// ============================================================

/**
 * Mois en français pour formatage des dates.
 */
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
]

/**
 * Formatte une date en "JJ/MM/AAAA" (ex : "23/05/2026").
 * Input : Date | string ISO | string déjà formattée
 */
export function fmtDateFR(d) {
  if (!d) return ''
  let date
  if (d instanceof Date) date = d
  else if (typeof d === 'string') {
    // Si déjà au format JJ/MM/AAAA
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d
    // Sinon parse ISO
    date = new Date(d)
  }
  if (!date || isNaN(date)) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/**
 * Date du jour au format "JJ/MM/AAAA".
 */
export function todayFR() {
  return fmtDateFR(new Date())
}

/**
 * Mapping type d'attestation → nom de fichier modèle + variables nécessaires
 */
const TEMPLATES = {
  salaire: {
    file: '/hr_modeles/salaire_template.docx',
    label: 'Attestation de salaire',
    required: ['nom', 'cnss', 'salaire'],
  },
  travail_en_poste: {
    file: '/hr_modeles/travail_en_poste_template.docx',
    label: 'Certificat de travail (en poste)',
    required: ['nom', 'cnss', 'date_entree', 'poste'],
  },
  travail_depart: {
    file: '/hr_modeles/travail_depart_template.docx',
    label: 'Certificat de travail (départ)',
    required: ['nom', 'cnss', 'date_entree', 'date_sortie', 'poste'],
  },
  accuse: {
    file: '/hr_modeles/accuse_template.docx',
    label: 'Accusé de remise des documents de départ',
    required: ['nom'],
  },
  pack_depart: {
    // Type SPÉCIAL (pas de fichier) : fusionne les 3 modèles Word en 1 seul .docx.
    label: '📦 Pack départ (Certif. travail + Accusé + Salaire en 1)',
    required: ['nom', 'cnss', 'poste', 'date_entree', 'date_sortie', 'salaire'],
    pack: true,
  },
  stage: {
    file: '/hr_modeles/stage_template.docx',
    label: 'Attestation de stage',
    required: ['nom', 'cin', 'date_debut', 'date_fin'],
  },
  mise_en_demeure: {
    file: '/hr_modeles/mise_en_demeure_template.docx',
    label: 'Mise en demeure (absence)',
    required: ['nom'],
  },
  abandon_poste: {
    file: '/hr_modeles/abandon_poste_template.docx',
    label: 'Abandon de poste',
    required: ['nom'],
  },
  cdi_smig: {
    file: '/hr_modeles/cdi_smig_template.docx',
    label: 'Contrat CDI - SMIG (sans montant)',
    // Note : nom_famille + prenom au lieu de nom_arabe seul
    required: ['nom_famille', 'prenom', 'cin', 'date_effet'],
    category: 'contrat',
  },
  cdi_salaire: {
    file: '/hr_modeles/cdi_salaire_template.docx',
    label: 'Contrat CDI - Salaire > SMIG',
    required: ['nom_famille', 'prenom', 'cin', 'salaire', 'date_entree'],
    category: 'contrat',
  },
  cdd_smig: {
    file: '/hr_modeles/cdd_smig_template.docx',
    label: 'Contrat CDD - SMIG (sans montant)',
    required: ['nom_famille', 'prenom', 'cin', 'duree', 'date_debut', 'date_fin', 'date_effet'],
    category: 'contrat',
  },
  cdd_salaire: {
    file: '/hr_modeles/cdd_salaire_template.docx',
    label: 'Contrat CDD - Salaire > SMIG',
    required: ['nom_famille', 'prenom', 'cin', 'salaire', 'duree', 'date_debut', 'date_fin', 'date_effet'],
    category: 'contrat',
  },
}

export function getTemplateInfo(type) {
  return TEMPLATES[type]
}

export function getAllTemplates() {
  return Object.entries(TEMPLATES).map(([key, info]) => ({ key, ...info }))
}

/**
 * Génère un document .docx et déclenche le téléchargement.
 *
 * @param {string} type - clé du template (salaire, travail_en_poste, ...)
 * @param {object} data - données à injecter ({ nom, cnss, cin, poste, salaire, date_entree, ... })
 * @returns {Promise<void>}
 */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Remplit un modèle .docx (Docxtemplater) et renvoie le PizZip rempli (sans télécharger).
async function fillTemplate(type, data) {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'), import('docxtemplater'),
  ])
  const info = TEMPLATES[type]
  if (!info || !info.file) throw new Error(`Type d'attestation inconnu : ${type}`)

  // Vérifier données requises
  for (const f of info.required) {
    if (!data[f]) throw new Error(`Champ obligatoire manquant : ${f}`)
  }

  // 1. Charger le fichier .docx
  const resp = await fetch(info.file)
  if (!resp.ok) throw new Error(`Impossible de charger le modèle : ${info.file} (HTTP ${resp.status})`)
  const buf = await resp.arrayBuffer()

  // 2. PizZip + Docxtemplater
  const zip = new PizZip(buf)

  const today = todayFR()

  // 4. Docxtemplater
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  })

  // 5. Préparer les valeurs pour le template
  const templateValues = {
    NOM: data.nom || '',
    NOM_ARABE: data.nom_arabe || data.nom || '',
    NOM_FAMILLE: data.nom_famille || '',
    PRENOM: data.prenom || '',
    CNSS: data.cnss || '',
    CIN: data.cin || '',
    POSTE: data.poste || '',
    ADRESSE: data.adresse || '',
    NATIONALITE: data.nationalite || 'مغربي',
    SALAIRE: data.salaire ? formatSalaire(data.salaire) : '',
    DUREE: data.duree || '',
    DATE_ENTREE: fmtDateFR(data.date_entree),
    DATE_SORTIE: fmtDateFR(data.date_sortie),
    DATE_DEBUT: fmtDateFR(data.date_debut),
    DATE_FIN: fmtDateFR(data.date_fin),
    DATE_EFFET: fmtDateFR(data.date_effet),
    DATE_REDACTION: today,
    DATE_EMISSION: fmtDateFR(data.date_emission || new Date()),
    DATE: today,
    // Variables du modèle CDI (libellés avec espaces) :
    'DATE DEBUT DE TRAVAIL': fmtDateFR(data.date_entree),
    'DATE AUJOURD’HUI': today,
    // Abandon de poste : par défaut aujourd'hui −4 j (départ) et −2 j (mise en demeure)
    DATE_DEPART: fmtDateFR(data.date_depart || new Date(Date.now() - 4 * 86400000)),
    DATE_MED: fmtDateFR(data.date_med || new Date(Date.now() - 2 * 86400000)),
  }

  // Contrats : {NOM} = nom de famille (les contrats séparent nom et prénom).
  if (info.category === 'contrat') {
    templateValues.NOM = data.nom_famille || templateValues.NOM
  }

  try {
    doc.render(templateValues)
  } catch (e) {
    console.error('Erreur Docxtemplater:', e)
    throw new Error('Erreur lors de la génération du document : ' + (e.message || e))
  }
  return doc.getZip()
}

// Génère un document .docx (1 modèle) et déclenche le téléchargement.
export async function generateAttestation(type, data) {
  const { saveAs } = await import('file-saver')
  const zip = await fillTemplate(type, data)
  const blob = zip.generate({ type: 'blob', mimeType: DOCX_MIME })
  saveAs(blob, formatFilename(type, data.nom))
}

// Récupère les `n` derniers bulletins (PDF) d'un employé : par CNSS, sinon par nom.
async function dernierssBulletins(data, n = 3) {
  const base = () => supabase.from('bulletins_paie').select('period, storage_path, label, cnss').order('period', { ascending: false })
  let rows = []
  if (data.cnss) { const r = await base().eq('cnss', data.cnss); rows = r.data || [] }
  if (!rows.length && (data.nom || '').trim()) { const r = await base().ilike('label', `%${data.nom.trim()}%`); rows = r.data || [] }
  return rows.slice(0, n)
}

// PACK DÉPART : 1 fichier .zip contenant
//   • les 3 attestations (modèles Word EXACTS) fusionnées en UN seul .docx,
//   • les 3 derniers bulletins de paie (PDF) de l'employé.
// (Un Word ne peut pas contenir de PDF → on regroupe tout dans un seul .zip.)
export async function generateDepartPackWord(data) {
  const [{ default: PizZip }, { PDFDocument }, { saveAs }] = await Promise.all([
    import('pizzip'), import('pdf-lib'), import('file-saver'),
  ])
  // 1) Fusionner les 3 attestations en 1 .docx (on garde l'en-tête/format du 1er).
  const types = ['travail_depart', 'accuse', 'salaire']
  const zips = []
  for (const t of types) zips.push(await fillTemplate(t, data))
  const DOC = 'word/document.xml'
  const base = zips[0]
  let baseXml = base.file(DOC).asText()
  const cut = xml => { const i = xml.lastIndexOf('<w:sectPr'); return i >= 0 ? i : xml.lastIndexOf('</w:body>') }
  const PAGEBREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
  let inserts = ''
  for (let i = 1; i < zips.length; i++) {
    const xml = zips[i].file(DOC).asText()
    const start = xml.indexOf('<w:body>') + '<w:body>'.length
    inserts += PAGEBREAK + xml.slice(start, cut(xml))
  }
  const at = cut(baseXml)
  baseXml = baseXml.slice(0, at) + inserts + baseXml.slice(at)
  base.file(DOC, baseXml)
  const docxBytes = base.generate({ type: 'uint8array' })

  const nom = (data.nom || 'employe').replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').replace(/\s+/g, '_')

  // 2) Récupérer les 3 derniers bulletins (PDF).
  const bulletins = await dernierssBulletins(data, 3)
  let nbBul = 0

  // 3) Fusionner les bulletins en UN seul PDF.
  const pack = new PizZip()
  pack.file(`1_Attestations_depart_${nom}.docx`, docxBytes)
  if (bulletins.length) {
    const merged = await PDFDocument.create()
    for (const b of bulletins) {
      try {
        const bytes = await downloadBulletinBytes(b.storage_path)
        const src = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(src, src.getPageIndices())
        pages.forEach(p => merged.addPage(p))
        nbBul++
      } catch (e) { /* bulletin illisible, on saute */ }
    }
    if (nbBul) pack.file(`2_Bulletins_${nom}.pdf`, await merged.save())
  }
  const blob = pack.generate({ type: 'blob', mimeType: 'application/zip' })
  saveAs(blob, `Pack_depart_${nom}.zip`)
  return { bulletins: nbBul }
}

/**
 * Formate un salaire pour l'affichage : "8500" → "8 500"
 */
function formatSalaire(s) {
  const num = Number(String(s).replace(/[^\d.]/g, ''))
  if (isNaN(num)) return String(s)
  // Pas d'espace de séparation des milliers : les espaces cassent la
  // lecture LTR des nombres dans un texte arabe RTL.
  // Le nombre reste lisible : 8000 plutôt que 8 000.
  return String(num)
}

/**
 * Génère un nom de fichier descriptif.
 */
function formatFilename(type, nom) {
  const labels = {
    salaire: 'Attestation_Salaire',
    travail_en_poste: 'Certificat_Travail',
    travail_depart: 'Certificat_Travail_Depart',
    accuse: 'Accuse_Remise_Documents',
    stage: 'Attestation_Stage',
    mise_en_demeure: 'Mise_En_Demeure',
    abandon_poste: 'Abandon_De_Poste',
    cdi_smig: 'Contrat_CDI_SMIG',
    cdi_salaire: 'Contrat_CDI_Salaire',
    cdd_smig: 'Contrat_CDD_SMIG',
    cdd_salaire: 'Contrat_CDD_Salaire',
  }
  const label = labels[type] || 'Document'
  const nomClean = (nom || 'Employe').replace(/\s+/g, '_').replace(/[^\w\-]/g, '')
  const date = todayISO()  // YYYY-MM-DD (heure locale)
  return `${label}_${nomClean}_${date}.docx`
}
