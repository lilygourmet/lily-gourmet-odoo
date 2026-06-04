import { supabase } from './supabase'
import { loadMonthData, calculerMois, firstDay, setAjustement } from './pointage'
import { createDemandeConge } from './conges'

// ============================================================
// "À TRAITER" — absences non justifiées + jours de repos travaillés (récup)
// détectés depuis le pointage. On scanne le mois courant + le mois précédent.
// ============================================================

const todayYMD = () => new Date().toISOString().slice(0, 10)

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
    for (const emp of data.employes) {
      const { journal } = calculerMois(emp, mois, annee, data)
      for (const d of journal) {
        if (d.date > today) continue   // on ne traite pas le futur
        if (d.statut === 'absent') {
          if (!couvertParDemande(emp.id, d.date)) {
            absences.push({ employe_id: emp.id, nom: emp.nom, date: d.date, jour: d.jour_semaine })
          }
        } else if (Number(d.jours_recup) > 0) {
          if (!recupTraite.has(`${emp.id}|${d.date}`)) {
            recups.push({ employe_id: emp.id, nom: emp.nom, date: d.date, jour: d.jour_semaine, label: d.label })
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
const CLASSIF_TO_TYPE = {
  sans_solde: 'sans solde',
  annuel: 'annuel',
  maladie: 'maladie_courte',
}

/**
 * Traite une absence : crée une DEMANDE de congé sur ce jour (sans solde /
 * annuel / maladie). Elle repart dans le parcours de validation des congés.
 */
export async function traiterAbsence({ employe_id, date, classification, raison, userId }) {
  const type_conge = CLASSIF_TO_TYPE[classification]
  if (!type_conge) throw new Error('Classification invalide')
  return createDemandeConge({
    employe_id,
    date_debut: date,
    date_fin: date,
    type_conge,
    motif: raison || null,
    demande_par: userId,
  })
}

/**
 * VALIDE une récup : on garde le jour de récup (déjà compté par le pointage —
 * source unique, donc PAS de double comptage) et on enregistre la raison.
 */
export async function validerRecup({ employe_id, date, raison, userId }) {
  await setAjustement(employe_id, date, 'recup_raison', raison || '', userId)
}

/**
 * REFUSE une récup : on annule le jour de récup (ajustement jours_recup = 0 →
 * il ne sera pas compté dans le solde). La raison du refus est notée.
 */
export async function refuserRecup({ employe_id, date, raison, userId }) {
  await setAjustement(employe_id, date, 'jours_recup', '0', userId)
  await setAjustement(employe_id, date, 'recup_raison', raison ? `Refusé : ${raison}` : 'Refusé', userId)
}
