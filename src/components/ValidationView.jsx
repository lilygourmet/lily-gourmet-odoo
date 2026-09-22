import { useState, useEffect, useMemo, useRef } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { loadOrdres, loadFaits, loadManques, validerDansOdoo, annulerOrdre, chercherArticles, dernierEcran, garderEcran, loadSaisies, saveSaisies, loadStocksNegatifs, setFait, rendementPourOdoo } from '../lib/fabrication'
import { todayISO } from '../lib/dates'
import { quandFait } from '../lib/jourLisible'

// ====== « À valider » : la page dédiée ======
// Tout ce que l'équipe a marqué « fait » (montages, préparations, tournées de
// glaçage) attend ici sa confirmation dans Odoo. On ne force jamais sans une
// demande explicite. Réservée à perm_valider_of.

// Quantités consommées corrigées et ingrédients ajoutés à la main : gardés côté
// serveur, donc retrouvés sur un autre appareil, et effacés à la validation.
const CLE_SAISIES = 'valider_saisies'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

// Odoo répond avec l'état de l'ordre, en anglais : « progress » ne dit rien à
// personne. On traduit, et surtout on dit quoi faire.
const enClair = m => ({
  progress: "commencé, mais pas terminé : un ingrédient n'était pas réservé. Refais « Valider » — s'il insiste, c'est qu'il en manque vraiment.",
  confirmed: "Odoo n'a pas pu le terminer : regarde ce qui manque, plus haut.",
  cancel: 'cet ordre a été annulé dans Odoo',
  draft: 'cet ordre est encore en brouillon dans Odoo',
  to_close: "Odoo le dit prêt à clôturer, mais ne l'a pas clôturé",
}[m] || m)
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
// A l'atelier on ne pese pas 1 234,56 g : les quantites s'affichent entieres.
const qte = (q, u) => (norm(u) === 'kg'
  ? `${nb(Math.round(q * 1000))} g`
  : `${nb(Math.round(q))} ${norm(u) === 'g' ? 'g' : u}`)
// Une préparation se pèse à la sortie du four ; un gâteau monté, non.
const estPrepa = n => /^SM\b/i.test(String(n || ''))
// Le champ « sorti » parle GRAMMES pour ce qui se pèse, PIÈCES pour le reste.
const versSaisie = (q, u) => (norm(u) === 'kg' ? Math.round(q * 1000) : Math.round(q))
const depuisSaisie = (n, u) => (norm(u) === 'kg' ? n / 1000 : n)
const propre = n => String(n || '')
  .replace(/^SM\.?\s*/i, '').replace(/^CD\*\s*/i, '').replace(/^MP-\s*/i, '').replace(/^C-\s*/i, '')
  .replace(/\s*\bCD\*?\b\s*$/i, '').replace(/\s*\baccs\b/i, '').trim()

/**
 * Champ de recherche d'un article Odoo : on tape, il propose.
 * Sert à noter un ingrédient que la recette ne prévoyait pas.
 * Exporté : « À valider Annexe » est le jumeau de cet écran et s'en sert tel
 * quel — deux copies auraient fini par diverger.
 */
export function AjoutIngredient({ onChoisir }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [cherche, setCherche] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return
    let vivant = true
    // on attend une petite pause avant d'interroger Odoo, sinon une question
    // partirait à chaque lettre tapée
    const t = setTimeout(async () => {
      try { const a = await chercherArticles(q); if (vivant) setRes(a) } catch { if (vivant) setRes([]) }
      if (vivant) setCherche(false)
    }, 300)
    return () => { vivant = false; clearTimeout(t) }
  }, [q])

  return (
    <div className="mt-2">
      <input value={q} onChange={e => {
          setQ(e.target.value)
          setRes([])
          setCherche(e.target.value.trim().length >= 2)
        }}
        placeholder="+ ajouter un ingrédient présent en Stock Prod"
        className="w-full text-[13.5px] border border-line rounded-lg px-3 py-2 bg-white" />
      {q.trim().length >= 2 && (
        <div className="mt-1 border border-line rounded-lg bg-white max-h-[190px] overflow-y-auto">
          {cherche && <div className="px-3 py-2 text-[12.5px] text-ink-mute">recherche…</div>}
          {!cherche && !res.length && <div className="px-3 py-2 text-[12.5px] text-ink-mute">aucun article de ce nom</div>}
          {res.map(a => (
            <button key={a.id} onClick={() => { onChoisir(a); setQ(''); setRes([]) }}
              className="w-full text-left px-3 py-2 text-[13px] border-b border-[#f0e8db] last:border-0 hover:bg-cream-warm">
              {a.nom}
              <span className="text-ink-mute text-[11.5px]"> · il y en a {qte(a.stock, a.unite)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ValidationView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(() => dernierEcran('valider'))
  const [sel, setSel] = useState(() => (dernierEcran('valider') || []).map(x => x.name))
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [confirmer, setConfirmer] = useState(false)
  const [refus, setRefus] = useState(false)   // annulation groupée en cours
  const [tour, setTour] = useState(0)
  // Odoo met une à deux secondes à répondre. L'écran s'ouvre entre-temps sur la
  // liste de la dernière fois — et quand celle-ci était VIDE, il affirmait
  // « Rien à valider » en toute confiance. Layla, le 2026-09-08 : « pourquoi
  // 202295 ne va pas dans valider, je l'ai créé dans fabrication CD » — sa
  // déclaration datait de deux minutes et arrivait bien, une seconde plus tard.
  // Tant qu'on n'a pas la réponse, on ne dit RIEN sur le vide.
  const [chargement, setChargement] = useState(true)
  const [ouvert, setOuvert] = useState(null)      // l'ordre dont on note les consommations
  const [notes, setNotes] = useState({})          // { ordre: { idLigne: quantité } }
  const [ajouts, setAjouts] = useState({})        // { ordre: [ingrédients ajoutés à la main] }
  // Vrai dès que les quantités gardées côté serveur ont été relues : tant que
  // c'est faux, on n'enregistre RIEN (voir le commentaire de l'effet plus bas).
  const saisiesLues = useRef(false)
  // Les compteurs faux du labo, montrés en colonne à droite : c'est la réponse
  // à « pourquoi ça me dit qu'il manque alors que la crème est là ».
  const [negatifs, setNegatifs] = useState([])
  // { 'WHLVP/MO/202295': '2026-09-08T15:39:51Z' } — le jour où c'est FAIT
  const [datesFaites, setDatesFaites] = useState({})
  // Ce que l'atelier a dit avoir VRAIMENT sorti, dans l'unité de l'ordre Odoo.
  // Rempli depuis la coche posée dans Fabrication CD, corrigeable ici avant
  // l'envoi — « les deux » (Layla, 2026-09-18).
  const [sortis, setSortis] = useState({})

  useEffect(() => {
    let vivant = true
    loadStocksNegatifs()
      .then(l => { if (vivant) setNegatifs(l) })
      .catch(() => { /* un compteur non lu ne doit pas gêner la validation */ })
    return () => { vivant = false }
  }, [tour])

  // `chargement` part à vrai et ne repasse à vrai nulle part : inutile, les deux
  // boutons qui relancent la lecture remettent d'abord la liste à zéro, et une
  // liste absente suffit à afficher le squelette. Le remettre ici était en plus
  // un appel d'état interdit dans un effet (react-hooks/set-state-in-effect).
  useEffect(() => {
    let vivant = true
    Promise.all([loadOrdres(), loadFaits()])
      .then(async ([tous, f]) => {
        if (!vivant) return
        // Tout ce qui est marqué fait : les ordres nommés directement (montages,
        // tournées de glaçage ou de pâte à sucre, et tout ce qu'on ajoutera) et
        // les préparations, cochées par produit. On ne filtre PAS sur la liste
        // de Fabrication CD : elle ne contient que les articles « CD* », et la
        // pâte à sucre n'en fait pas partie. C'est Odoo qui dira, plus bas, ce
        // qui est encore ouvert.
        const noms = new Set()
        const ouvertsOdoo = new Set(tous.map(o => o.name))
        // Quand chaque ordre a-t-il été DÉCLARÉ ? La production compte pour le
        // jour où elle a été faite, pas pour celui où on la valide : un gâteau
        // monté lundi et validé mercredi doit compter lundi dans Odoo.
        const quand = {}
        for (const [c, info] of Object.entries(f)) {
          if (!info || !info.fait_le) continue
          if (/^WH.*\/MO\//i.test(c)) quand[c] = info.fait_le
          for (const n of (info.ordres || [])) if (!quand[n]) quand[n] = info.fait_le
        }
        setDatesFaites(quand)
        for (const [c, info] of Object.entries(f)) {
          if (/^WH.*\/MO\//i.test(c)) { noms.add(c); continue }
          if (!c.startsWith('PREP:')) continue
          // exactement les ordres retenus au moment de la coche, pas tous ceux
          // du même article
          for (const n of (info && info.ordres) || []) if (ouvertsOdoo.has(n)) noms.add(n)
        }
        if (!noms.size) { setLignes([]); garderEcran('valider', []); return }
        const m = await loadManques([...noms])
        if (!vivant) return
        // validé ou annulé dans Odoo entre-temps : ça n'attend plus rien
        const ouverts = m.filter(x => x.etat !== 'done' && x.etat !== 'cancel')
        setLignes(ouverts)
        const rendus = {}
        for (const l of ouverts) {
          const info = f[l.name]
          const r = rendementPourOdoo({
            declare: info && info.qty, uniteDeclaree: info && info.qty_unite,
            prevu: l.qty, uniteOdoo: l.unite,
          })
          if (r !== null) rendus[l.name] = r
        }
        setSortis(rendus)
        // ⚠️ RIEN N'EST COCHÉ D'AVANCE. « à valider tout est décoché. et je
        // coche comme je veux » (Layla, 2026-09-19). Valider envoie dans Odoo
        // et ne se défait pas : le choix appartient à la personne, pas à l'app.
        setSel([])
        garderEcran('valider', ouverts)
        // Ce qui avait été corrigé ailleurs, sans écraser ce qu'on tape ici.
        const vivants = new Set(ouverts.map(x => x.name))
        const gardees = await loadSaisies(CLE_SAISIES).catch(() => ({}))
        const garder = (recu, actuel) => Object.fromEntries(
          Object.entries({ ...(recu || {}), ...actuel }).filter(([n]) => vivants.has(n)))
        setNotes(n => garder(gardees.notes, n))
        setAjouts(a => garder(gardees.ajouts, a))
        saisiesLues.current = true
      })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
      .finally(() => { if (vivant) setChargement(false) })
    return () => { vivant = false }
  }, [tour])

  const perdu = useRef(false)
  // Enregistrement retardé : pas un appel par touche du clavier, et jamais avant
  // d'avoir RELU les quantités gardées côté serveur.
  //
  // ⚠️ Le garde-fou d'avant regardait si la liste était là — mais l'écran
  // s'ouvre déjà sur celle de la dernière fois, gardée en mémoire. Elle était
  // donc présente dès la première milliseconde, et 0,9 s plus tard l'app
  // enregistrait des quantités VIDES par-dessus les vraies, puis relisait ce
  // vide. Taper ses corrections, aller voir un autre onglet, revenir : tout
  // était perdu. C'est la panne du 04/09 que le commentaire disait vouloir
  // éviter. On attend maintenant que `loadSaisies` ait vraiment répondu.
  useEffect(() => {
    if (!lignes || !saisiesLues.current) return undefined
    const t = setTimeout(() => {
      saveSaisies(CLE_SAISIES, { notes, ajouts })
        .then(() => { perdu.current = false })
        // Un échec silencieux a fait perdre une demi-journée de saisies le 04/09.
        .catch(() => {
          if (perdu.current) return
          perdu.current = true
          toast.error('Tes quantités ne sont PAS enregistrées : elles seront perdues en quittant l\'écran.')
        })
    }, 900)
    return () => clearTimeout(t)
  }, [lignes, notes, ajouts])

  // Un ingrédient qui manque est parfois fabriqué par un AUTRE ordre de la même
  // liste : il ne manque pas, il attend sa validation. Même règle que « À
  // valider Annexe », posée le 2026-09-04.
  const cleArticle = n => String(n || '').replace(/^\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  // TOUS les producteurs d'un article, pas seulement le dernier vu : une tournée
  // coupée en deux ordres en a deux, et n'en retenir qu'un laissait l'autre
  // passer APRÈS son consommateur — exactement ce que le tri veut empêcher.
  const producteurDe = useMemo(() => {
    const m = new Map()
    for (const l of lignes || []) {
      if (!l.produit) continue
      const k = cleArticle(l.produit)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(l.name)
    }
    return m
  }, [lignes])
  // Ce qui FABRIQUE part avant ce qui CONSOMME, sinon le second échoue.
  const rangerParDependance = (liste) => {
    const parNom = new Map(liste.map(l => [l.name, l]))
    const vus = new Set(); const sortie = []
    const poser = (l, chemin) => {
      if (!l || vus.has(l.name) || chemin.has(l.name)) return
      chemin.add(l.name)
      for (const c of l.lignes || []) {
        for (const four of (producteurDe.get(cleArticle(c.produit)) || [])) {
          if (four !== l.name) poser(parNom.get(four), chemin)
        }
      }
      chemin.delete(l.name)
      if (!vus.has(l.name)) { vus.add(l.name); sortie.push(l) }
    }
    for (const l of liste) poser(l, new Set())
    return sortie
  }

  const choisis = useMemo(() => (lignes || []).filter(l => sel.includes(l.name)), [lignes, sel])
  const prets = choisis.filter(l => !l.manques.length)
  const bloques = choisis.filter(l => l.manques.length)
  // On ADDITIONNE les manques d'un même article. Avant, on n'en gardait qu'un
  // seul par article : trois ordres bloqués à 2 000 g de la même crème, et la
  // fenêtre annonçait 2 000 g alors que 6 000 g allaient passer en négatif.
  // C'est la seule chose qui protège avant une action irréversible.
  const manquesCumules = [...bloques.flatMap(l => l.manques)
    .reduce((m, x) => {
      const vu = m.get(x.produit)
      if (vu) vu.manque += (Number(x.manque) || 0)
      else m.set(x.produit, { ...x, manque: Number(x.manque) || 0 })
      return m
    }, new Map()).values()]

  // Annuler l'ordre dans Odoo. Demande délibérée, donc on va au-delà du
  // décochage : même un ordre lancé par Odoo lui-même part. Il n'est pas
  // effacé, il passe en « annulé » — la trace reste là-bas.
  async function annuler(l) {
    const ok = await confirmDialog(
      `Annuler l'ordre ${l.name} — ${propre(l.produit)} ?\n\n`
      + "Il passera en « annulé » dans Odoo et sortira de cette liste. Rien ne sera fabriqué.",
      { confirmLabel: "Annuler l'ordre", danger: true })
    if (!ok) return
    try {
      const r = await annulerOrdre([l.name], user?.id)
      // Un ordre qui sert une COMMANDE ne s'annule pas : la déclaration part,
      // l'ordre reste, et le gâteau revient dans « ce qu'il faut faire ».
      const cmd = r && r.commandes && r.commandes[l.name]
      // En mode test le serveur ne touche à rien et renvoie 0 annulation : dire
      // « Odoo a refusé » ferait croire à une panne.
      if (r && r.test) toast.success('Mode test : rien annulé dans Odoo')
      else if (cmd) {
        await setFait({ name: l.name }, false, user?.id)
        setLignes(v => { const reste = (v || []).filter(x => x.name !== l.name); garderEcran('valider', reste); return reste })
        setSel(v => v.filter(n => n !== l.name))
        toast.success(`Déclaration retirée. L'ordre reste : il sert la commande ${cmd}.`)
      } else if (r && r.annules) {
        setLignes(v => { const reste = (v || []).filter(x => x.name !== l.name); garderEcran('valider', reste); return reste })
        setSel(v => v.filter(n => n !== l.name))
        toast.success(l.name + ' annulé dans Odoo')
      } else toast.error((r && r.refuses && r.refuses[0]) || "Odoo a refusé l'annulation")
    } catch (e) { toast.error(e.message || String(e)) }
  }

  // Refuser d'un coup ce qui est coché. C'est exactement le « annuler l'ordre »
  // de chaque ligne, mais sur toute la sélection : le faire une par une était
  // long, et ce bouton-là est caché au fond du panneau « ce qui a été consommé ».
  async function refuser() {
    if (!choisis.length) return
    const ok = await confirmDialog(
      `Annuler ${choisis.length} ordre${choisis.length > 1 ? 's' : ''} dans Odoo ?\n\n`
      + choisis.map(l => `• ${propre(l.produit)} — ${l.name}`).join('\n')
      + "\n\nIls passeront en « annulé » dans Odoo et sortiront de cette liste. Rien ne sera fabriqué.",
      { confirmLabel: 'Annuler ces ordres', danger: true })
    if (!ok) return
    setRefus(true)
    // Ce qui est DÉJÀ annulé dans Odoo doit sortir de l'écran même si la suite
    // échoue : sinon un paquet passé, un paquet en panne de réseau, et les
    // ordres annulés restaient affichés sans rien dire — on recliquait, et
    // Odoo répondait « refusé » pour des ordres qui étaient bel et bien partis.
    const noms = []
    const refuses = []
    const retires = []
    let panne = null
    let modeTest = false
    try {
      // Odoo n'en relit que 50 à la fois : au-delà, les suivants partiraient
      // à la trappe sans rien dire.
      for (let i = 0; i < choisis.length; i += 50) {
        const r = await annulerOrdre(choisis.slice(i, i + 50).map(l => l.name), user?.id)
        if (r && r.test) modeTest = true
        noms.push(...((r && r.noms) || []))
        // Ceux qui servent une commande : on retire la déclaration, l'ordre reste.
        for (const [n, cmd] of Object.entries((r && r.commandes) || {})) {
          await setFait({ name: n }, false, user?.id).catch(() => { })
          retires.push(`${n} → ${cmd}`)
        }
        refuses.push(...((r && r.refuses) || []).filter(x => !/sert la commande/.test(x)))
      }
    } catch (e) { panne = e.message || String(e) }
    try {
      const partis = new Set([...noms, ...retires.map(x => x.split(' → ')[0])])
      if (partis.size) {
        setLignes(v => { const reste = (v || []).filter(x => !partis.has(x.name)); garderEcran('valider', reste); return reste })
        setSel(v => v.filter(n => !partis.has(n)))
      }
      if (noms.length) toast.success(noms.length + (noms.length > 1 ? ' ordres annulés' : ' ordre annulé') + ' dans Odoo')
      if (retires.length) {
        toast.success(`Déclaration retirée pour ${retires.length} ordre(s) qui servent une commande : `
          + retires.join(' · ') + ". Les ordres restent.")
      }
      if (refuses.length) toast.error('Odoo a refusé : ' + refuses.join(' · '))
      if (panne) toast.error('Interrompu après ' + noms.length + ' annulation(s) : ' + panne)
      else if (modeTest) toast.success('Mode test : rien annulé dans Odoo')
      else if (!noms.length && !refuses.length && !retires.length) toast.error("Odoo n'a rien annulé")
    } catch (e) { toast.error(e.message || String(e)) }
    setRefus(false)
  }

  async function lancer(forcer) {
    const cibles = rangerParDependance(forcer ? bloques : prets).map(l => l.name)
    if (!cibles.length) return
    setEnvoi(true)
    const aEnvoyer = {}
    for (const n of cibles) {
      if (!notes[n]) continue
      const ordre = (lignes || []).find(x => x.name === n)
      const conv = {}
      for (const [id, v] of Object.entries(notes[n])) {
        const c = (ordre?.lignes || []).find(x => String(x.id) === String(id))
        const fact = norm(c?.unite) === 'kg' ? 1000 : 1
        if (v !== '' && Number(v) >= 0) conv[id] = Number(v) / fact
      }
      if (Object.keys(conv).length) aEnvoyer[n] = conv
    }
    const enPlus = {}
    for (const n of cibles) {
      const liste = (ajouts[n] || []).filter(a => Number(a.qty) > 0)
      if (!liste.length) continue
      enPlus[n] = liste.map(a => ({
        produit: a.produit, uom: a.uom,
        qty: Number(a.qty) / (norm(a.unite) === 'kg' ? 1000 : 1),
      }))
    }
    try {
      // La production compte pour le jour où elle a été FAITE, pas pour celui où
      // on la valide. Odoo enregistre donc la date de la déclaration.
      const quand = {}
      for (const n of cibles) if (datesFaites[n]) quand[n] = datesFaites[n]
      // Ce qui est vraiment sorti de la fournée. Odoo garde les ingrédients de
      // la quantité PRÉVUE : `validerOrdre` écrit `quantity_done` = la quantité
      // prévue de chaque composant, pas une quantité recalculée.
      const produits = {}
      for (const n of cibles) if (sortis[n] > 0) produits[n] = sortis[n]
      const res = await validerDansOdoo(cibles, forcer, user?.id, aEnvoyer, enPlus,
        Object.keys(produits).length ? produits : null, quand)
      setResultats(res)
      // Ce qui est validé n'a plus rien à faire dans la liste. Ce qui a échoué
      // y reste, avec son message : c'est encore à traiter.
      const faits = new Set(res.filter(r => r.ok).map(r => r.name))
      if (faits.size) {
        setLignes(l => {
          const reste = (l || []).filter(x => !faits.has(x.name))
          garderEcran('valider', reste)
          return reste
        })
        setSel(s2 => s2.filter(n => !faits.has(n)))
        const sansFaits = o => Object.fromEntries(Object.entries(o).filter(([n]) => !faits.has(n)))
        setNotes(sansFaits)
        setAjouts(sansFaits)
        toast.success(faits.size + (faits.size > 1 ? ' ordres validés' : ' ordre validé') + ' dans Odoo')
      }
    } catch (e) { toast.error(e.message || String(e)) }
    setEnvoi(false)
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      {/* Deux colonnes sur ordinateur : la validation à gauche, les compteurs
          faux à droite. Sur téléphone la colonne passe simplement dessous. */}
      <div className="mx-auto px-4 py-5 max-w-[1010px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="font-fraunces italic text-[26px] font-medium">À valider CD-</h1>
          <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
            className="ml-auto bg-white border border-line rounded-xl px-3 py-2 text-[13px] text-ink-soft">↻ Actualiser</button>
        </div>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Ce qui est marqué « fait » et attend sa confirmation dans Odoo. La génoise et l'eau ne sont pas comptées dans les manques.
        </p>

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">{erreur}</div>}
        {(!lignes || (chargement && !lignes.length)) && !erreur && <Skeleton rows={4} />}
        {envoi && <p className="text-center text-ink-mute py-8">Validation en cours dans Odoo…</p>}

        {resultats && !envoi && (
          <>
            {resultats.map(r => (
              <div key={r.name} className={'rounded-xl px-3.5 py-3 mb-2 ' +
                (r.ok ? 'bg-[#EAF3DE] border border-[#cfe0b8]' : 'bg-[#FCEEE8] border border-[#f0c9c9]')}>
                <b className="text-[14.5px]">{r.ok ? '✓' : '✗'} {r.name}</b>
                <div className="text-[12.5px] text-ink-soft">
                  {r.ok ? 'validé dans Odoo' : enClair(r.message)}
                  {r.glacage > 0 && ` · ${nb(Math.round(r.glacage))} g de glaçage royal consommés dedans`}
                  {r.pour && ` · réservé aussitôt pour ${r.pour}`}
                </div>
              </div>
            ))}
            <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
              className="w-full bg-bordeaux text-cream rounded-2xl py-3.5 text-[15px] font-bold mt-2">Terminer</button>
          </>
        )}

        {lignes && !chargement && !resultats && !envoi && lignes.length === 0 && (
          <div className="py-14 text-center text-ink-mute text-[14px] bg-cream-warm rounded-xl">
            Rien à valider pour le moment.<br />
            <span className="text-[12.5px]">Ce que l'équipe marque « fait » dans Fabrication CD ou Fabrication Glaçage arrive ici.</span>
          </div>
        )}

        {lignes && !resultats && !envoi && lignes.map(l => {
          const on = sel.includes(l.name)
          return (
            <div key={l.name} className={'border border-line rounded-xl mb-2 overflow-hidden border-l-4 ' +
              (l.manques.length ? 'border-l-[#d9a441]' : 'border-l-[#7ba05b]')}>
              {/* ⚠️ MÊME TRAITEMENT QU'« À VALIDER ANNEXE » (Layla, 2026-09-22 :
                  « arrange le look de À valider CD aussi »). Une carte tenait en
                  six lignes ; elle en tient deux. Rien n'a changé dans les
                  gestes — seulement dans ce qui se lit.

                  ⚠️ LA PASTILLE « prêt / il manque » A DISPARU : le liseré de
                  gauche le dit déjà, en couleur, sans un mot. */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white">
                <input type="checkbox" checked={on} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                  onChange={e => setSel(v => (e.target.checked ? [...v, l.name] : v.filter(x => x !== l.name)))} />
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold leading-tight">{propre(l.produit)}</div>
                  {/* ⚠️ LA SEULE CHOSE QUI DOIT ARRÊTER L'ŒIL : une fournée
                      prévue pour PLUS TARD. Valider aujourd'hui ce qui est prévu
                      jeudi, ça se voit trop tard. Le reste part en bas, en gris. */}
                  {l.quand && String(l.quand).slice(0, 10) > todayISO() && (
                    <div className="text-[11.5px] text-[#854F0B] font-bold">
                      prévu le {new Date(String(l.quand).replace(' ', 'T') + 'Z')
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </div>
                  )}
                </div>
                {/* Ce qui est VRAIMENT sorti. Pré-rempli avec ce qui a été
                    déclaré au labo, corrigeable ici — « les deux » (Layla,
                    2026-09-18). Vide = on garde la quantité prévue.
                    ⚠️ On tape des GRAMMES quand l'ordre est en kilos, comme
                    partout ailleurs ; la conversion ne vit qu'ici.
                    ⚠️ Et il est REMONTÉ sur la ligne du nom : c'est le seul
                    chiffre qu'on touche, il doit être sous le pouce. */}
                {estPrepa(l.produit) ? (
                  <>
                    <input type="text" inputMode="decimal"
                      aria-label={`Quantité vraiment sortie de ${propre(l.produit)}`}
                      value={sortis[l.name] === undefined ? '' : versSaisie(sortis[l.name], l.unite)}
                      onChange={e => {
                        const t = String(e.target.value).replace(/[^\d.,]/g, '').replace(',', '.')
                        const v3 = Number(t)
                        setSortis(v2 => {
                          const c = { ...v2 }
                          // Vide, ou pas encore un nombre (« 5, ») : on oublie la
                          // ligne plutôt que d'y ranger un NaN.
                          if (t === '' || !Number.isFinite(v3)) delete c[l.name]
                          else c[l.name] = depuisSaisie(v3, l.unite)
                          return c
                        })
                      }}
                      onClick={e => e.stopPropagation()}
                      placeholder={String(versSaisie(l.qty, l.unite))}
                      className="w-[84px] shrink-0 text-right tabular-nums rounded-lg px-2 py-1.5
                                 border border-line bg-cream text-[14px] font-extrabold" />
                    <span className="text-[11.5px] text-ink-mute shrink-0 whitespace-nowrap">
                      / {qte(l.qty, l.unite)}
                    </span>
                  </>
                ) : (
                  <span className="text-[14px] font-extrabold shrink-0 whitespace-nowrap">
                    {qte(l.qty, l.unite)}
                  </span>
                )}
                {/* ⚠️ « annuler l'ordre » REMONTE ICI, en croix. Il dormait tout
                    au fond du panneau des consommations, là où personne n'allait
                    le chercher. Même geste, même confirmation. */}
                <button onClick={() => annuler(l)} title="Annuler l’ordre"
                  aria-label={`Annuler l’ordre ${l.name}`}
                  className="shrink-0 text-ink-mute text-[16px] px-1.5 py-0.5">✕</button>
              </div>
              {l.manques.length > 0 && (
                <div className="px-3 pb-2 pl-[44px] text-[12.5px] text-[#854F0B]">
                  {l.manques.map((m, i) => {
                    const fours = (producteurDe.get(cleArticle(m.produit)) || []).filter(n => n !== l.name)
                    return (
                      <div key={i}>
                        il manque <b className="text-ink">{qte(m.manque, m.unite)}</b> de {propre(m.produit)}
                        {fours.length > 0 && (
                          <span className="block text-[11px] text-[#3d6f8e]">
                            attend <b className="font-mono">{fours.join(', ')}</b> — dans cette liste
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* La ligne grise : tout ce qui ne se touche pas — le numéro, le
                  lieu, l'heure de l'atelier, la date prévue. Elles étaient trois
                  lignes l'une sous l'autre ; c'en est une. */}
              <div className="px-3 pb-2 pl-[44px] flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-ink-mute font-mono">
                  {l.name}{l.lieu ? ` · ${l.lieu}` : ''}
                  {/* Quand ça a été marqué fait à l'atelier — jour ET heure
                      (Layla, 2026-09-19) : on valide parfois deux jours après. */}
                  {datesFaites[l.name] ? ` · fait ${quandFait(datesFaites[l.name])}` : ''}
                  {l.quand && String(l.quand).slice(0, 10) <= todayISO()
                    ? ` · prévu le ${new Date(String(l.quand).replace(' ', 'T') + 'Z')
                      .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}
                </span>
                {(l.lignes || []).length > 0 && (
                  <button onClick={() => setOuvert(ouvert === l.name ? null : l.name)}
                    className="ml-auto text-[11.5px] font-bold text-bordeaux border border-line
                               rounded-full px-2.5 py-0.5 bg-cream">
                    {ouvert === l.name ? '▾' : '▸'} consommé
                  </button>
                )}
              </div>

              {(l.lignes || []).length > 0 && (
                <div>
                  {ouvert === l.name && (
                    <div className="px-3.5 pb-3 border-t border-line pt-2.5">
                      <p className="text-[12px] text-ink-mute mb-2">
                        Corrige les quantités si tu n'as pas utilisé exactement la recette.
                        Ferme sans rien changer pour garder ce qui est prévu.
                      </p>
                      {l.lignes.map(c => {
                        // Odoo compte parfois en kg, l'équipe pense en grammes :
                        // on saisit en grammes et on reconvertit à l'envoi.
                        const enG = norm(c.unite) === 'kg'
                        const fact = enG ? 1000 : 1
                        const val = (notes[l.name] || {})[c.id]
                        const affiche = val !== undefined ? val : Math.round((c.consomme ?? c.besoin) * fact * 100) / 100
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db] last:border-0">
                            <span className="flex-1 text-[13.5px] min-w-0">{propre(c.produit)}</span>
                            <input type="number" min="0" step="any" inputMode="decimal" value={affiche}
                              onChange={e => setNotes(n => ({
                                ...n, [l.name]: { ...(n[l.name] || {}), [c.id]: e.target.value },
                              }))}
                              className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                            <span className="text-[12px] text-ink-mute w-[26px]">{enG ? 'g' : c.unite}</span>
                          </div>
                        )
                      })}

                      {(ajouts[l.name] || []).map((a, i) => (
                        <div key={'a' + i} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db]">
                          <span className="flex-1 text-[13.5px] min-w-0 text-bordeaux">{propre(a.nom)}</span>
                          <input type="number" min="0" step="any" inputMode="decimal" value={a.qty}
                            onChange={e => setAjouts(m => ({
                              ...m,
                              [l.name]: (m[l.name] || []).map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                            }))}
                            className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                          <span className="text-[12px] text-ink-mute w-[26px]">{norm(a.unite) === 'kg' ? 'g' : a.unite}</span>
                          <button onClick={() => setAjouts(m => ({
                            ...m, [l.name]: (m[l.name] || []).filter((_, j) => j !== i),
                          }))} className="text-ink-mute text-[15px] px-1" title="retirer">✕</button>
                        </div>
                      ))}

                      <AjoutIngredient onChoisir={a => setAjouts(m => ({
                        ...m,
                        [l.name]: [...(m[l.name] || []), { produit: a.id, nom: a.nom, uom: a.uom, unite: a.unite, qty: '' }],
                      }))} />

                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        <button onClick={() => setOuvert(null)}
                          className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-soft">
                          fermer sans changer
                        </button>
                        {/* ⚠️ « annuler l'ordre » N'EST PLUS ICI : il est
                            remonté en croix, au bout de la ligne du nom. Au fond
                            de ce panneau, il fallait d'abord ouvrir « consommé »
                            pour le trouver — personne n'y allait. */}
                        {(notes[l.name] || ajouts[l.name]) && (
                          <button onClick={() => {
                            setNotes(n => { const s2 = { ...n }; delete s2[l.name]; return s2 })
                            setAjouts(m => { const s2 = { ...m }; delete s2[l.name]; return s2 })
                          }}
                            className="ml-auto rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-mute">
                            revenir à la recette
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {lignes && lignes.length > 0 && !resultats && !envoi && (
          <>
            <div className="text-[12.5px] text-ink-soft my-3">
              {choisis.length} sélectionné(s) · {prets.length} prêt(s), {bloques.length} à forcer
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => lancer(false)} disabled={!prets.length}
                className={'flex-1 min-w-[200px] rounded-2xl py-3.5 text-[15px] font-bold ' +
                  (prets.length ? 'bg-bordeaux text-cream' : 'bg-white border border-line text-ink-mute')}>
                Valider la sélection{prets.length ? ` (${prets.length})` : ''}
              </button>
              <button onClick={() => setConfirmer(true)} disabled={!bloques.length}
                className={'rounded-2xl py-3.5 px-4 text-[13.5px] font-bold border bg-white ' +
                  (bloques.length ? 'border-danger text-danger' : 'border-line text-ink-mute')}>
                Forcer la sélection{bloques.length ? ` (${bloques.length})` : ''}
              </button>
            </div>
            {/* Refuser : ce qui a été coché « fait » par erreur, ou qu'on ne
                fabriquera pas. Sous les deux autres et en clair, pour ne pas
                se tromper de bouton. */}
            <button onClick={refuser} disabled={!choisis.length || refus}
              className={'w-full mt-2 rounded-2xl py-3 text-[13.5px] font-bold border bg-white ' +
                (choisis.length && !refus ? 'border-danger text-danger' : 'border-line text-ink-mute')}>
              {refus ? 'Annulation dans Odoo…' : `Refuser la sélection${choisis.length ? ` (${choisis.length})` : ''}`}
            </button>
            <p className="text-[11.5px] text-ink-mute mt-1.5 text-center">
              « Refuser » annule l'ordre dans Odoo : rien ne sera fabriqué, et il ne revient pas dans Fabrication CD.
            </p>
          </>
        )}
        </div>

        {/* Les compteurs faux, à droite. Un stock négatif compte comme zéro
            disponible : c'est lui qui fait dire « il manque » alors que la
            matière est là. La liste part du pire. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            <div className="px-3.5 pt-3 pb-2 border-b border-line">
              <b className="text-[14px]">⚠️ Compteurs faux</b>
              <span className="text-[12px] text-ink-mute tabular-nums"> · {negatifs.length}</span>
              <p className="text-[11.5px] text-ink-mute mt-1 leading-snug">
                Odoo en compte moins que zéro. C'est ce qui fait dire « il manque »
                alors que la matière est là.
              </p>
            </div>
            {negatifs.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-ink-mute text-[13px]">Aucun — tout est à zéro ou au-dessus.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                {negatifs.map(a => (
                  <div key={a.produit} className="flex items-baseline gap-2 px-3.5 py-1.5 border-b border-dashed border-[#f0e8db] last:border-0">
                    <span className="flex-1 min-w-0 text-[12.5px]">{propre(a.produit)}</span>
                    <b className="text-[12.5px] text-danger whitespace-nowrap tabular-nums">
                      {qte(a.qty, a.unite)}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmer && (
        <div className="fixed inset-0 z-[80] bg-ink/50 flex items-center justify-center p-4"
          onPointerDown={e => { if (e.target === e.currentTarget) setConfirmer(false) }}>
          <div className="bg-white rounded-2xl p-4 max-w-[420px]">
            <b className="text-[16px]">Forcer la validation ?</b>
            <p className="text-[13px] text-ink-soft mt-1 mb-2">Odoo enregistrera la fabrication même si le stock ne suit pas. Il manque :</p>
            {manquesCumules.map((m, i) => (
              <div key={i} className="text-[13.5px]">• <b>{qte(m.manque, m.unite)}</b> de {propre(m.produit)}</div>
            ))}
            <p className="text-[12px] text-ink-mute mt-2">Le stock de ces articles deviendra négatif dans Odoo.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setConfirmer(false); lancer(true) }}
                className="flex-1 bg-danger text-cream rounded-xl py-3 text-[14px] font-bold">Forcer</button>
              <button onClick={() => setConfirmer(false)} className="rounded-xl py-3 px-4 text-[14px] border border-line">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
