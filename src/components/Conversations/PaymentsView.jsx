import { useState, useEffect } from 'react'
import { usePersistedState } from '../../lib/usePersistedState'
import { toast } from '../../lib/toast'
import { Paperclip } from 'lucide-react'
import { loadPaymentsToValidate, validatePayment, rejectPayment, getMediaSignedUrl, lirePreuvesPaiement, loadPayeursLus } from '../../lib/conversations'
import { canValidatePayments } from '../../lib/auth'
import { MOYENS, NON_PRECISE, moyenDe } from '../../lib/paiementMoyen'

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtAmount(n) {
  if (n == null) return ''
  return `${Number(n).toLocaleString('fr-FR')} DH`
}

// Liste interne des preuves de paiement transférées depuis Conversations.
export default function PaymentsView({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [urls, setUrls] = useState({}) // messageId -> URL affichable
  const [busyId, setBusyId] = useState(null)
  const [tab, setTab] = usePersistedState('lily.payments.tab', 'todo') // 'todo' = à valider | 'done' = déjà validés
  // ⚠️ UNE SEULE FAMILLE À LA FOIS, ET PAS DE « TOUT » (Layla, 2026-09-19 :
  // « ils ne doivent pas les mélanger »). Un virement se retrouve sur le relevé
  // de la banque, une CB est déjà encaissée : on fait les uns, puis les autres.
  const [moyen, setMoyen] = usePersistedState('lily.payments.moyen', 'virement')
  const [q, setQ] = useState('')
  const [lecture, setLecture] = useState(null)   // avancement de la lecture des pièces jointes
  const [payeurs, setPayeurs] = useState({})     // nom de l'émetteur lu sur chaque pièce jointe
  // Mois à lire (AAAA-MM). Vide = tout. La lecture part des preuves les plus récentes :
  // sans ce choix, viser un vieux mois obligeait à lire tous les suivants d'abord.
  const [moisLecture, setMoisLecture] = useState('')

  const canValidate = canValidatePayments(user)

  // Lit les pièces jointes pour y relever le nom de l'ÉMETTEUR du virement.
  //
  // La banque écrit le nom de QUI PAIE, Odoo celui de QUI ACHÈTE : quand un proche paie
  // pour la cliente, rien ne relie les deux et le virement reste « non lié » pour toujours.
  // La preuve, elle, est déjà rattachée à la commande — il ne manque que ce nom-là.
  //
  // Chaque document est un appel à l'IA : on y va par paquets, et on annonce combien il
  // reste, plutôt que de lancer des centaines de lectures d'un coup sans prévenir.
  async function handleLireJointes() {
    if (lecture) return
    setLecture({ fait: 0, total: 0 })
    try {
      const r = await lirePreuvesPaiement({
        mois: moisLecture || null,
        onProgress: (fait, total) => setLecture({ fait, total }),
      })
      await refresh()
      toast(r.lues
        ? `${r.lues} preuve(s) lue(s), ${r.trouves} nom(s) d'émetteur trouvé(s)`
          + (r.restantes ? ` — ${r.restantes} restante(s), reclique pour continuer` : ' — tout est lu ✅')
        : 'Toutes les preuves ont déjà été lues.')
    } catch (e) { toast('Erreur : ' + (e?.message || e)) }
    finally { setLecture(null) }
  }

  async function refresh() {
    setLoading(true); setError('')
    try {
      const data = await loadPaymentsToValidate()
      try { setPayeurs(await loadPayeursLus()) } catch { /* pas bloquant */ }
      setItems(data)
      // Prépare les URL affichables (lien direct si http, sinon URL signée)
      const map = {}
      await Promise.all(data.map(async m => {
        if (!m.media_url) return
        map[m.id] = m.media_url.startsWith('http') ? m.media_url : await getMediaSignedUrl(m.media_url).catch(() => null)
      }))
      setUrls(map)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function handleValidate(m) {
    setBusyId(m.id)
    try {
      const updated = await validatePayment(m.id, user.id)
      setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusyId(null) }
  }

  async function handleReject(m) {
    const reason = prompt('Motif du refus ? (ex. illisible, montant ne correspond pas, doublon)')
    if (reason === null) return // annulé
    setBusyId(m.id)
    try {
      const updated = await rejectPayment(m.id, user.id, reason)
      setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusyId(null) }
  }

  // pending = ni validé ni refusé ; traité = validé OU refusé
  const isPending = m => !m.payment_validated_at && !m.payment_rejected_at
  const term = q.trim().toLowerCase()
  const visible = items.filter(m => {
    if (tab === 'todo' && !isPending(m)) return false
    if (tab === 'done' && isPending(m)) return false
    if (moyenDe(m).cle !== moyen) return false
    if (!term) return true
    const haystack = [
      m.payment_order_ref,
      m.payment_client_name,
      m.conversation?.client_name,
      m.conversation?.client_phone,
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(term)
  })
  // Les comptes des deux onglets du haut suivent la famille choisie : sans ça,
  // « À valider (3) » promettrait trois lignes qu'on ne verrait pas.
  const duMoyen = items.filter(m => moyenDe(m).cle === moyen)
  const nbTodo = duMoyen.filter(isPending).length
  const nbDone = duMoyen.length - nbTodo
  /** Ce qui reste à valider dans une famille, et ce que ça pèse. */
  const enAttente = cle => items.filter(m => moyenDe(m).cle === cle && isPending(m))
  const sumDe = cle => enAttente(cle).reduce((t, m) => t + (Number(m.payment_amount) || 0), 0)
  // La famille « non précisé » n'existe que s'il en reste : ce sont les preuves
  // d'avant le 19/09, qu'on ne devine pas. Sans cette case, elles seraient
  // simplement invisibles — 570 lignes disparues sans un mot.
  const familles = [...MOYENS, ...(items.some(m => moyenDe(m).cle === NON_PRECISE.cle) ? [NON_PRECISE] : [])]
  const compteDe = cle => items.filter(m => moyenDe(m).cle === cle && (tab === 'todo' ? isPending(m) : !isPending(m))).length

  function Card({ m }) {
    const href = urls[m.id]
    const mt = m.media_type || ''
    const isImage = /image/i.test(mt) || (m.media_url && /\.(jpe?g|png|gif|webp)$/i.test(m.media_url))
    const validated = !!m.payment_validated_at
    const rejected = !!m.payment_rejected_at
    const pending = !validated && !rejected
    // ⚠️ LA COULEUR NE SUFFIT PAS (Layla, 2026-09-19) : la bande de gauche se
    // double toujours de l'étiquette écrite, juste au-dessus du nom.
    const mo = moyenDe(m)
    return (
      <div className={`rounded-2xl border border-l-4 p-3 flex gap-3 shadow-sm ${mo.bord} ${pending ? 'bg-cream-warm border-line' : 'bg-cream-warm/50 border-line opacity-80'}`}>
        {href ? (
          isImage ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0" title="Ouvrir en grand">
              <img src={href} alt="" className="w-20 h-20 object-cover rounded-xl border border-line" />
            </a>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-20 h-20 rounded-xl border border-line bg-cream flex flex-col items-center justify-center gap-1 text-[11px] text-ink-soft text-center px-1" title="Ouvrir le document"><Paperclip size={16} strokeWidth={1.8} /> PDF</a>
          )
        ) : (
          <div className="flex-shrink-0 w-20 h-20 rounded-xl border border-line bg-cream flex items-center justify-center text-[11px] text-ink-mute">…</div>
        )}
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wide
            px-2 py-0.5 rounded-full border mb-1 ${mo.pastille}`}>
            {mo.emoji} {mo.court}
          </span>
          <div className="text-[14px] font-medium text-ink truncate">{m.payment_client_name || m.conversation?.client_name || 'Client'}</div>
          <div className="text-[12px] text-ink-soft">{m.conversation?.client_phone || ''}</div>
          {m.payment_order_ref && <div className="text-[12px] text-ink mt-0.5">Commande : <span className="font-medium">{m.payment_order_ref}</span></div>}
          {m.payment_amount != null && <div className="text-[13px] text-ink font-semibold mt-0.5">{fmtAmount(m.payment_amount)}</div>}
          <div className="text-[10px] text-ink-mute mt-0.5">Reçu le {fmtDate(m.sent_at)}</div>
          {/* Le nom lu sur la pièce jointe : c'est lui qui relie le virement à la commande
              quand un proche a payé. Affiché pour être vérifiable à l'œil — un nom faux se
              repère bien plus vite qu'il ne se devine. */}
          {payeurs[m.id] && (payeurs[m.id].p && !/GOURMET/i.test(payeurs[m.id].p)
            ? <div className="text-[11px] text-ink-soft mt-1">💳 Payé par <span className="font-medium text-ink">{payeurs[m.id].p}</span></div>
            : <div className="text-[11px] text-ink-mute mt-1">💳 nom de l'émetteur illisible</div>
          )}
          {validated && (
            <div className="text-[11px] text-emerald-700 mt-1.5">Validé{m.validator?.full_name ? ` par ${m.validator.full_name}` : ''} · {fmtDate(m.payment_validated_at)}</div>
          )}
          {rejected && (
            <div className="text-[11px] text-bordeaux mt-1.5">Refusé{m.rejector?.full_name ? ` par ${m.rejector.full_name}` : ''}{m.payment_rejection_reason ? ` — ${m.payment_rejection_reason}` : ''}</div>
          )}
          {pending && (
            canValidate ? (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleValidate(m)}
                  disabled={busyId === m.id}
                  className="px-4 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-full hover:bg-bordeaux-deep disabled:opacity-50"
                >{busyId === m.id ? '…' : 'Valider'}</button>
                <button
                  onClick={() => handleReject(m)}
                  disabled={busyId === m.id}
                  className="px-4 py-1.5 text-[12px] font-medium border border-bordeaux text-bordeaux rounded-full hover:bg-bordeaux hover:text-cream disabled:opacity-50"
                >Refuser</button>
              </div>
            ) : (
              <div className="text-[11px] text-amber-700 mt-1.5">À valider</div>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-5">
      <h1 className="font-fraunces italic text-[26px] text-ink mb-1">Paiements à valider</h1>
      <p className="text-[12px] text-ink-mute mb-4">Preuves de virement transférées depuis les conversations.</p>

      {/* Ce qui reste à valider de chaque côté : d'un coup d'œil, ce que la
          banque doit confirmer, et ce qui est déjà encaissé. */}
      <div className="flex flex-wrap gap-2 mb-3">
        {MOYENS.map(mo => (
          <div key={mo.cle} className={`flex-1 min-w-[140px] rounded-2xl border px-3 py-2 shadow-sm ${mo.pastille}`}>
            <div className="text-[10px] uppercase tracking-wider font-bold">{mo.emoji} {mo.label} à valider</div>
            <div className="text-[16px] font-extrabold tabular-nums">{fmtAmount(sumDe(mo.cle)) || '0 DH'}</div>
          </div>
        ))}
      </div>

      {/* ⚠️ PAS DE « TOUT » : on ne mélange jamais les deux familles. */}
      <div className="flex flex-wrap gap-2 mb-2">
        {familles.map(mo => (
          <button
            key={mo.cle}
            onClick={() => setMoyen(mo.cle)}
            aria-pressed={moyen === mo.cle}
            className={`px-4 py-1.5 text-[12px] font-bold rounded-full border transition-all
              ${moyen === mo.cle ? mo.actif : 'border-line text-ink-soft hover:bg-cream-warm'}`}
          >{mo.emoji} {mo.label} ({compteDe(mo.cle)})</button>
        ))}
      </div>

      {/* Onglets À valider / Traités */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab('todo')}
          className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-all ${tab === 'todo' ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft hover:bg-cream-warm'}`}
        >À valider ({nbTodo})</button>
        <button
          onClick={() => setTab('done')}
          className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-all ${tab === 'done' ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft hover:bg-cream-warm'}`}
        >Traités ({nbDone})</button>
        <input
          type="month"
          value={moisLecture}
          onChange={e => setMoisLecture(e.target.value)}
          title="Laisse vide pour tout lire, ou choisis un mois précis"
          className="ml-auto px-3 py-1.5 text-[12px] rounded-full border border-line text-ink-soft bg-cream-warm"
        />
        <button
          onClick={handleLireJointes}
          disabled={!!lecture}
          title="Lit les pièces jointes pour y trouver le nom de la personne qui a payé — ce qui permet de rapprocher les virements faits par un proche"
          className="px-4 py-1.5 text-[12px] font-medium rounded-full border border-line text-ink-soft hover:bg-cream-warm disabled:opacity-60"
        >{lecture
          ? `⏳ Lecture ${lecture.fait}/${lecture.total || '…'}`
          : (moisLecture ? `🔎 Lire ${moisLecture}` : '🔎 Lire les pièces jointes')}</button>
      </div>

      {/* Recherche par n° de commande ou nom du client */}
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Chercher un n° (S-…) ou un nom de client…"
        className="w-full px-4 py-2 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux mb-4"
      />

      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded mb-4">{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <div className="text-center py-12 text-ink-mute italic">
          {term
            ? 'Aucun résultat pour cette recherche.'
            : `${tab === 'todo' ? 'Aucune preuve à valider' : 'Aucune preuve traitée'} en ${moyen === 'cb' ? 'CB en ligne' : moyen === 'virement' ? 'virement bancaire' : 'moyen non précisé'}.`}
        </div>
      )}

      <div className="space-y-2">
        {visible.map(m => <Card key={m.id} m={m} />)}
      </div>
    </div>
  )
}
