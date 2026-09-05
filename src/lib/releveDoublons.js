// Détection des doublons dans les lignes de relevé bancaire « à lier ».
//
// Deux relevés qui se recouvrent (ou deux banques) montrent parfois la MÊME opération :
//   - sous deux dates (date d'opération / date de valeur) → doublon certain
//   - avec une orthographe différente (BENOMAR / BENNOMAR) → doublon probable, à l'œil de Layla
// Le n° d'opération, quand il existe, sert déjà de repère ailleurs ; ici on n'a que le nom.

// Mots présents dans tous les libellés bancaires : ils ne disent rien du client.
const MOTS_BANQUE = /^(VIR|VIRT|VIREMENT|VIREMENTS|INST|RECU|RECUE|EMIS|MME|MLLE|MR|MONSIEUR|MADAME|DE|DU|DES|LA|LE|LES|ET|PAR|SUR|WEB|VERS|COMPTE|REGUL|REMISE|CHEQUE|CHQ|ENC|VERSEMENT|ESPECE|ESPECES|PAYM|CARTE)$/

// Nom « utile » d'un libellé : que les mots du client, triés (l'ordre varie d'un relevé à l'autre).
// « VIRT RECU MME SELMA BENOMAR » → « BENOMAR SELMA »
export function nomDeLigne(label) {
  return (label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !/\d/.test(w) && !MOTS_BANQUE.test(w))
    .sort()
    .join(' ')
}

// Odoo compte les centimes, la banque arrondit au dirham : en dessous d'un demi-dirham,
// deux montants sont le MÊME montant. (L'app affiche de toute façon des dirhams entiers.)
export const ECART_MINI = 0.5

// Signature d'un dépôt : montant + n° d'opération (le PLUS LONG nombre du libellé — un
// court serait un code, pas un numéro). Deux lignes de même signature sont la MÊME
// opération, même écrites autrement : la banque sort la date d'opération sur un document
// et la date de valeur sur l'autre, et « N » / « N° » selon le format.
// Montant arrondi au DIRHAM : une caisse Odoo à 10 333,20 et le versement bancaire de
// 10 333,00 sont le même dépôt — au centime près, ils ne se reconnaissaient pas.
// null quand le libellé ne porte aucun numéro : on ne peut alors rien affirmer.
export function signatureDepot(amount, label) {
  const nums = (label || '').match(/\d{5,}/g) || []
  const ref = nums.sort((a, b) => b.length - a.length || (a < b ? 1 : -1))[0]
  return ref ? `${Math.round(Number(amount))}|${ref}` : null
}

// Une caisse justifiée par une PREUVE MANUELLE (photo du bordereau) ne porte aucun n°
// d'opération : impossible de la relier par signature. On reconnaît son dépôt comme le
// fait le rapprochement auto (reconcileEnvelopes) — même montant, à `joursMax` près de la
// date du versement. Sans date de versement, le montant suffit.
export function memeDepotSansNumero(ligne, caisse, joursMax = 7) {
  const montant = Number(caisse.amount_proof ?? caisse.amount_cash)
  if (!(montant > 0)) return false
  if (Math.abs(Number(ligne.amount) - montant) >= ECART_MINI) return false
  if (!caisse.proof_date || !ligne.ligne_date) return true
  const jours = Math.abs((new Date(ligne.ligne_date) - new Date(caisse.proof_date)) / 86400000)
  return jours <= joursMax
}

// Ressemblance entre deux textes, de 0 (rien à voir) à 1 (identiques) — distance de Levenshtein.
export function similarite(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const m = a.length, n = b.length
  const d = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return 1 - d[n] / Math.max(m, n)
}

const jours = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000)
const libelleNorm = s => (s || '').toUpperCase().replace(/\s+/g, ' ').trim()
// N° d'opération imprimés dans le libellé (5 chiffres et plus).
const numeros = s => new Set((s || '').match(/\d{5,}/g) || [])
// Deux libellés qui portent des n° d'opération et n'en partagent AUCUN = deux opérations
// réelles (ex. 200 dh le 29/07 : n° 2376336 et 2378161). Jamais fusionnées.
const numerosContraires = (a, b) => {
  const na = numeros(a), nb = numeros(b)
  if (!na.size || !nb.size) return false
  return ![...na].some(n => nb.has(n))
}
// Un nom ne sert à comparer que s'il est un peu consistant : au moins 2 mots et 6 lettres.
// Sinon (« REMISE CHEQUE A ENC 47106191 » → rien d'utile) on comparerait du bruit.
const nomFiable = n => !!n && n.split(' ').length >= 2 && n.replace(/ /g, '').length >= 6

/**
 * Retire les doublons CERTAINS et signale les doublons PROBABLES.
 *
 * Certain (une seule ligne gardée, la plus ancienne) : même montant, même nom, dates
 * proches, et les deux lignes viennent d'IMPORTS DIFFÉRENTS. Ce dernier point est le
 * garde-fou : deux vrais virements identiques du même client figurent dans le MÊME
 * relevé (donc le même import) et sont conservés tous les deux.
 *
 * Probable (les deux lignes restent, marquées `doublon_probable`) : même montant, dates
 * proches et noms qui se ressemblent (BENOMAR / BENNOMAR) — à Layla de trancher.
 */
export function marquerDoublons(lignes, { ecartCertain = 3, ecartProbable = 7, seuil = 0.85 } = {}) {
  const parMontant = new Map()
  for (const l of lignes) {
    const k = Math.round(Number(l.amount) * 100)
    if (!parMontant.has(k)) parMontant.set(k, [])
    parMontant.get(k).push(l)
  }
  const retirees = new Set()
  const probables = new Map()   // key → { date, label }
  for (const groupe of parMontant.values()) {
    if (groupe.length < 2) continue
    const g = [...groupe].sort((a, b) => String(a.ligne_date).localeCompare(String(b.ligne_date)))
    const noms = new Map(g.map(l => [l.key, nomDeLigne(l.label)]))
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i], b = g[j]
        if (retirees.has(a.key) || retirees.has(b.key)) continue
        const na = noms.get(a.key), nb = noms.get(b.key)
        const ecart = jours(a.ligne_date, b.ligne_date)
        // Deux lignes du MÊME document sont deux opérations réelles : on n'y touche jamais.
        // C'est le PDF qui fait foi (releve_url), pas l'instant de l'import : le relevé et
        // l'extrait choisis ensemble arrivent dans le même import, à la même seconde — s'y
        // fier laissait passer TOUS les doublons entre ces deux documents.
        const memeDoc = (a.releve_url && b.releve_url)
          ? a.releve_url === b.releve_url
          : String(a.created_at).slice(0, 19) === String(b.created_at).slice(0, 19)
        if (memeDoc) continue
        // Même montant + dates proches + imports différents = la MÊME opération, même si
        // les deux relevés l'écrivent autrement (« VIRT RECU MLLE MERIAM MALEK » vs
        // « VIR INST RECU 2203444 3751003105 ») — le libellé n'est pas une identité.
        // Deux garde-fous : des n° d'opération qui se contredisent, ou deux noms de
        // clients bien lisibles et différents, = deux opérations réelles.
        // Deux noms de clients lisibles restent départagés par Layla (bloc « probable »
        // ci-dessous) : c'est le seul cas où le libellé garde le dernier mot.
        const deuxNoms = nomFiable(na) && nomFiable(nb)
        // L'extrait TRONQUE le libellé du relevé (« ...ASS.SPORTIVE DES FAR » vs
        // « ...ASS.SPORTIVE DES FAR RABA »). Un libellé préfixe de l'autre — l'égalité
        // comprise — c'est la même opération écrite plus court, même quand les deux
        // portent un nom lisible. Longueur minimale : un libellé quasi vide serait le
        // préfixe de n'importe quoi.
        const la = libelleNorm(a.label), lb = libelleNorm(b.label)
        const court = la.length <= lb.length ? la : lb
        const tronque = court.length >= 10 && (la.startsWith(lb) || lb.startsWith(la))
        if (ecart <= ecartCertain && !numerosContraires(a.label, b.label) &&
            (tronque || !deuxNoms)) {
          retirees.add(b.key)                       // on garde la plus ancienne (a)
        } else if (ecart <= ecartProbable && nomFiable(na) && nomFiable(nb) && similarite(na, nb) >= seuil) {
          probables.set(a.key, { date: b.ligne_date, label: b.label })
          probables.set(b.key, { date: a.ligne_date, label: a.label })
        }
      }
    }
  }
  return lignes
    .filter(l => !retirees.has(l.key))
    .map(l => (probables.has(l.key) ? { ...l, doublon_probable: probables.get(l.key) } : l))
}
