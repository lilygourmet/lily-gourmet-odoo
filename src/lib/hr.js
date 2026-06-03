import { supabase } from './supabase'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'

// ============================================================
// CRUD EMPLOYÉS
// ============================================================

/**
 * Charge tous les employés (actifs en premier, puis par nom).
 */
export async function loadEmployes(filterActif = null) {
  let query = supabase
    .from('employes')
    .select('*, societe:societes(*)')
    .order('actif', { ascending: false })
    .order('nom', { ascending: true })

  if (filterActif !== null) query = query.eq('actif', filterActif)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Crée un employé.
 */
export async function createEmploye(emp, userId) {
  const { data, error } = await supabase
    .from('employes')
    .insert({ ...emp, created_by: userId, updated_by: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Modifie un employé.
 */
export async function updateEmploye(id, updates, userId) {
  const { data, error } = await supabase
    .from('employes')
    .update({ ...updates, updated_by: userId })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
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
    required: ['nom_famille', 'prenom', 'cin', 'salaire', 'date_effet'],
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
export async function generateAttestation(type, data) {
  const info = TEMPLATES[type]
  if (!info) throw new Error(`Type d'attestation inconnu : ${type}`)

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
  // Les modèles utilisent un placeholder {DATE_REDACTION} (cf. scripts/fix-attestations-templates.mjs)
  // → plus besoin de remplacer des dates hardcodées dans le XML.

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
    // Abandon de poste : par défaut aujourd'hui −4 j (départ) et −2 j (mise en demeure)
    DATE_DEPART: fmtDateFR(data.date_depart || new Date(Date.now() - 4 * 86400000)),
    DATE_MED: fmtDateFR(data.date_med || new Date(Date.now() - 2 * 86400000)),
  }

  // 6. Rendu
  try {
    doc.render(templateValues)
  } catch (e) {
    console.error('Erreur Docxtemplater:', e)
    throw new Error('Erreur lors de la génération du document : ' + (e.message || e))
  }

  // 7. Générer le blob et déclencher le téléchargement
  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  const nomFichier = formatFilename(type, data.nom)
  saveAs(blob, nomFichier)
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
  const date = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  return `${label}_${nomClean}_${date}.docx`
}
