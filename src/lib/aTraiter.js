import { supabase } from './supabase'
import { loadMonthData, calculerMois, firstDay, setAjustement } from './pointage'
import { createDemandeConge, calculSoldeConges, createAllocation } from './conges'

// ============================================================
// "À TRAITER" — absences non justifiées + jours de repos travaillés (récup)
// détectés depuis le pointage. On scanne le mois courant + le mois précédent.
// ============================================================

const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function periodsToScan() {
  const now = new Date()
  const cM = now.getMonth() + 1, cY = now.getFullYear()
  const pM = cM === 1 ? 12 : cM - 1
  const pY = cM === 1 ? cY - 1 : cY
  return [{ mois: pM, annee: pY }, { mois: cM, annee: cY }]
}

/**
 * Renvoie { absences:[...], recups:[...] } à traiter.
 * - absence = jour 'absent' (date passée) non couvert par un congé en demande.
 *   (les congés validés ne sont jamais 'absent' dans le pointage.)
 * - recup   = jour de repos/férié/congé travaillé (jours_recup > 0) dont la
 *   raison n'a pas encore été saisie (ajustement champ 'recup_raison').
 */
export async function loadATraiter() {
  const today = todayYMD()
  const periods = periodsToScan()
  const minDate = firstDay(periods[0].mois, periods[0].annee)

  // Congés en attente de validation → un jour déjà en demande sort de la liste.
  const { data: congesDemande } = await supabase
    .from('conges').select('employe_id,date_debut,date_fin')
    .eq('statut', 'demande').gte('date_fin', minDate)
  const couvertParDemande = (empId, ymd) =>
    (congesDemande || []).some(c => c.employe_id === empId && c.date_debut <= ymd && c.date_fin >= ymd)

  // Récup DÉJÀ allouées (allocation type 'autre'/'recup' = Récupération, par date_evt)
  // → on ne re-suggère pas ce jour-là (sinon doublon).
  const { data: recupAllocs } = await supabase
    .from('conges_allocations').select('employe_id,date_evt,statut,type')
    .in('type', ['autre', 'recup']).gte('date_evt', minDate)
  const recupDejaAllouee = new Set(
    (recupAllocs || [])
      .filter(a => a.statut !== 'annule' && a.date_evt)
      .map(a => `${a.employe_id}|${a.date_evt}`)
  )

  // Absences classées sans suite (ancien jour off / déjà traité ailleurs) → on les
  // retire de la liste (aucun congé créé, aucun ajustement de pointage).
  const { data: absIgnoreesData } = await supabase
    .from('rh_absences_ignorees').select('employe_id,date_jour').gte('date_jour', minDate)
  const absIgnorees = new Set((absIgnoreesData || []).map(a => `${a.employe_id}|${a.date_jour}`))

  // Solde de congé par employé : sert à proposer en absence uniquement les types
  // ALLOUÉS (événements, récup) et à bloquer l'envoi si le solde est épuisé.
  // (même règle que le formulaire de demande de congé.) Données préchargées en une fois.
  const anneeNow = new Date().getFullYear()
  const [{ data: congesValides }, { data: allAllocs }, { data: pmois }, { data: fData }] = await Promise.all([
    supabase.from('conges').select('*').eq('statut', 'valide'),
    supabase.from('conges_allocations').select('*').eq('annee', anneeNow).eq('statut', 'valide'),
    supabase.from('pointages_mois').select('employe_id,jours_recup').eq('annee', anneeNow),
    supabase.from('jours_feries').select('date'),
  ])
  const congesByEmp = new Map()
  for (const c of congesValides || []) {
    if (!congesByEmp.has(c.employe_id)) congesByEmp.set(c.employe_id, [])
    congesByEmp.get(c.employe_id).push(c)
  }
  const allocsByEmp = new Map()
  for (const a of allAllocs || []) {
    if (!allocsByEmp.has(a.employe_id)) allocsByEmp.set(a.employe_id, [])
    allocsByEmp.get(a.employe_id).push(a)
  }
  const recupByEmp = new Map()
  for (const r of pmois || []) recupByEmp.set(r.employe_id, (recupByEmp.get(r.employe_id) || 0) + Number(r.jours_recup || 0))
  const feriesSet = new Set((fData || []).map(f => f.date))
  const prefetched = { allocsByEmp, recupByEmp, feriesSet }
  const soldeByEmp = new Map()
  async function soldeFor(emp) {
    if (!soldeByEmp.has(emp.id)) {
      soldeByEmp.set(emp.id, await calculSoldeConges(emp, congesByEmp.get(emp.id) || [], today, prefetched))
    }
    return soldeByEmp.get(emp.id)
  }

  const absences = []
  const recups = []
  for (const { mois, annee } of periods) {
    const data = await loadMonthData(mois, annee)
    // Récup déjà traités (raison saisie) = ajustement champ 'recup_raison'
    const recupTraite = new Set(
      (data.ajustements || [])
        .filter(a => a.champ === 'recup_raison')
        .map(a => `${a.employe_id}|${a.date_jour}`)
    )
    // Employés qui POINTENT réellement ce mois (au moins 1 pointage). Ceux qui ne
    // pointent jamais (ex: Badea Bahri, Rachida Haimer) ne sont PAS comptés absents.
    const aPointe = new Set((data.pointages || []).map(p => String(p.employe_id)))
    // Jours où l'employé a pointé quelque chose (même le matin / pointage incomplet)
    // → ces jours ne sont JAMAIS comptés absents.
    const pointeCeJour = new Set(
      (data.pointages || []).filter(p => p.date_pointage).map(p => `${p.employe_id}|${p.date_pointage}`)
    )
    for (const emp of data.employes) {
      const { journal } = calculerMois(emp, mois, annee, data)
      for (const d of journal) {
        if (d.date > today) continue   // on ne traite pas le futur
        // Employé parti (date de sortie) ou pas encore entré → on ignore.
        if (emp.date_sortie && d.date > emp.date_sortie) continue
        if (emp.date_entree && d.date < emp.date_entree) continue
        if (d.statut === 'absent') {
          // On ne déclare une absence que pour un jour TERMINÉ et synchronisé.
          // Le jour même n'est pas fiable (pointage de l'après-midi pas encore synchronisé
          // depuis Odoo) → on attend le lendemain pour éviter les fausses absences.
          if (d.date === today) continue
          const aPointeCeJour = pointeCeJour.has(`${emp.id}|${d.date}`)
          if (aPointe.has(String(emp.id)) && !aPointeCeJour && !couvertParDemande(emp.id, d.date) && !absIgnorees.has(`${emp.id}|${d.date}`)) {
            absences.push({ employe_id: emp.id, nom: emp.nom, date: d.date, jour: d.jour_semaine, heures_prevues: d.heures_prevues, solde: await soldeFor(emp) })
          }
        } else if (Number(d.jours_recup) > 0) {
          const k = `${emp.id}|${d.date}`
          if (!recupTraite.has(k) && !recupDejaAllouee.has(k)) {
            recups.push({ employe_id: emp.id, nom: emp.nom, date: d.date, jour: d.jour_semaine, label: d.label, jours: Number(d.jours_recup) || 0 })
          }
        }
      }
    }
  }
  absences.sort((a, b) => b.date.localeCompare(a.date))
  recups.sort((a, b) => b.date.localeCompare(a.date))
  return { absences, recups }
}

export async function countATraiter() {
  const { absences, recups } = await loadATraiter()
  return absences.length + recups.length
}

// Classification d'absence -> type de congé créé (en demande).
// Mêmes types qu'une demande de congé classique (cf. CongesView.jsx).
const CLASSIF_TO_TYPE = {
  annuel: 'annuel',
  maladie_courte: 'maladie_courte',
  maladie_longue: 'maladie_longue',
  mariage: 'mariage',
  naissance: 'naissance',
  deces: 'deces',
  circoncision: 'circoncision',
  maternite: 'maternite',
  'sans solde': 'sans solde',
  recup: 'recup',
}

/**
 * Traite une absence : crée une DEMANDE de congé sur ce jour (sans solde /
 * annuel / maladie). Elle repart dans le parcours de validation des congés.
 */
export async function traiterAbsence({ employe_id, date_debut, date_fin, classification, raison, userId, justificatif_path = null }) {
  const type_conge = CLASSIF_TO_TYPE[classification]
  if (!type_conge) throw new Error('Classification invalide')
  return createDemandeConge({
    employe_id,
    date_debut,
    date_fin: date_fin || date_debut,   // l'absence peut couvrir plusieurs jours
    type_conge,
    motif: raison || null,
    demande_par: userId,
    justificatif_path,
  })
}

/**
 * Oubli de pointage : la personne était bien présente mais a oublié de pointer.
 * On marque le jour PRÉSENT (heures prévues comptées comme travaillées) — comme
 * le bouton « Marquer présent » du pointage.
 */
export async function traiterOubliPointage({ employe_id, date, heures_prevues, userId }) {
  await setAjustement(employe_id, date, 'heures_travaillees', String(heures_prevues ?? 8.5), userId)
  await setAjustement(employe_id, date, 'statut', 'present', userId)
}

/**
 * CLASSE une absence sans suite (ne crée AUCUN congé, ne touche PAS au pointage) :
 *   raison = 'ancien_jour_off' (l'employé a changé de jour off)
 *          | 'deja_traite'     (déjà couvert par un autre congé)
 * L'absence disparaît simplement de la liste « À traiter ».
 */
export async function ignorerAbsence({ employe_id, date, raison, userId }) {
  const { error } = await supabase
    .from('rh_absences_ignorees')
    .upsert({ employe_id, date_jour: date, raison, created_by: userId }, { onConflict: 'employe_id,date_jour' })
  if (error) throw error
}

/**
 * VALIDE une récup : enregistre la raison ET crédite le jour gagné sous forme
 * d'allocation (type 'autre', datée du jour travaillé).
 *
 * L'allocation est la SEULE source des jours de récup dans le solde. Le
 * commentaire d'origine disait qu'il ne fallait pas en créer parce que le
 * pointage comptait déjà ces jours — c'était faux : `joursRecupGagnesAnnee`
 * lit une colonne `jours_recup` qui n'existe pas (elle s'appelle
 * `jours_recuperation`) et renvoie 0 en silence. Sans allocation, valider une
 * récup ne créditait donc rien du tout.
 *
 * `date_evt` = le jour travaillé : c'est ce qui fait disparaître la ligne de la
 * liste « à traiter » (cf. recupDejaAllouee dans loadATraiter), donc pas de
 * double crédit possible en revalidant.
 */
export async function validerRecup({ employe_id, date, jours = 0, raison, userId }) {
  await setAjustement(employe_id, date, 'recup_raison', raison || '', userId)
  if (!(Number(jours) > 0)) return
  await createAllocation({
    employe_id,
    annee: Number(String(date).slice(0, 4)),
    type: 'autre',
    jours: Number(jours),
    raison: raison ? `Récup jour travaillé — ${raison}` : 'Récup jour travaillé',
    date_evt: date,
    source: 'manuel',
    created_by: userId,
  })
}

/**
 * REFUSE une récup : on annule le jour de récup (ajustement jours_recup = 0 →
 * il ne sera pas compté dans le solde). La raison du refus est notée.
 */
export async function refuserRecup({ employe_id, date, raison, userId }) {
  await setAjustement(employe_id, date, 'jours_recup', '0', userId)
  await setAjustement(employe_id, date, 'recup_raison', raison ? `Refusé : ${raison}` : 'Refusé', userId)
}
