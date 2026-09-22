import { useEffect, useMemo, useState } from 'react'
import { loadPendingBanqueEnvelopes, loadAllFreeReleveLines, attachReleveLines, ECART_MINI } from '../../lib/caisse'
import { windowFor, nomDansLibelle } from '../../lib/releveBmci'
import { fmtMoney, fmtDateCourte, fmtMois } from './_helpers'

// Rapprocher : les deux côtés en même temps.
//
// Jusqu'ici, lier une caisse à son virement demandait de naviguer entre l'écran des
// caisses et « Reçus banque non liés », sans jamais voir les deux listes ensemble. Layla :
// « je ne comprends plus rien, c'est trop confus ». Ici, on choisit une caisse à gauche,
// les lignes qui peuvent lui correspondre remontent à droite, on clique, c'est lié.
//
// Aucune règle de rapprochement n'est réinventée : le montant (ECART_MINI) et la fenêtre
// de dates (windowFor) sont ceux du calcul automatique. Cet écran ne décide rien — il
// montre, et c'est Layla qui tranche.

const TYPE_MOYEN = { versement: 'cash', cheque_depot: 'cheque', virement_recu: 'virement', autre: 'virement' }

export default function RapprocherSection() {
  const [caisses, setCaisses] = useState(null)
  const [lignes, setLignes] = useState([])
  const [choisie, setChoisie] = useState(null)   // caisse sélectionnée
  const [qc, setQc] = useState('')
  const [ql, setQl] = useState('')
  const [tout, setTout] = useState(false)        // montrer aussi les lignes qui ne collent pas
  const [enCours, setEnCours] = useState(false)
  const [replies, setReplies] = useState(new Set())   // mois repliés (à gauche)

  useEffect(() => { recharger() }, [])
  async function recharger() {
    setCaisses(null)
    try {
      const [e, l] = await Promise.all([loadPendingBanqueEnvelopes(), loadAllFreeReleveLines()])
      setCaisses(e.filter(x => !x.deja_rapprochee))
      setLignes(l)
    } catch { setCaisses([]); setLignes([]) }
  }

  // Groupées par mois : à 141 caisses, une liste à plat ne se travaille pas. Un mois se
  // replie d'un clic, et son en-tête porte ce qui compte pour le contrôle — combien de
  // caisses, et combien d'argent.
  const moisDeCaisses = useMemo(() => {
    const t = qc.trim().toLowerCase()
    const gardees = (caisses || []).filter(e => !t
      || String(e.amount_cash).includes(t)
      || (e.virement_client || '').toLowerCase().includes(t)
      || (e.source || '').toLowerCase().includes(t))
    const par = new Map()
    for (const e of gardees) {
      const k = String(e.session_date || '').slice(0, 7)
      if (!par.has(k)) par.set(k, [])
      par.get(k).push(e)
    }
    return [...par.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, liste]) => ({
        mois: k,
        titre: /^\d{4}-\d{2}$/.test(k) ? `${fmtMois(Number(k.slice(5, 7)))} ${k.slice(0, 4)}` : 'Sans date',
        liste,
        total: liste.reduce((s, e) => s + Number(e.amount_cash || 0), 0),
      }))
  }, [caisses, qc])

  // Une ligne « va » avec la caisse choisie : même montant, même moyen, et dans la fenêtre
  // de dates du rapprochement automatique (élargie quand la cliente est nommée).
  function colle(l, e) {
    if (!e) return false
    if (Math.abs(Number(l.amount) - Number(e.amount_cash)) >= ECART_MINI) return false
    const moyen = e.payment_method || 'cash'
    if ((TYPE_MOYEN[l.type] || 'cash') !== moyen) return false
    const j = (new Date(l.ligne_date) - new Date(e.session_date)) / 86400000
    const w = windowFor(moyen, moyen === 'virement' && nomDansLibelle(e.virement_client, l.label))
    return j >= w.min && j <= w.max
  }

  const lignesVues = useMemo(() => {
    const t = ql.trim().toLowerCase()
    let l = lignes.filter(x => !t
      || String(x.amount).includes(t) || (x.label || '').toLowerCase().includes(t) || (x.ligne_date || '').includes(t))
    if (choisie && !tout) l = l.filter(x => colle(x, choisie))
    return l.slice(0, 200)
  }, [lignes, ql, choisie, tout])

  const nbQuiCollent = useMemo(
    () => (choisie ? lignes.filter(l => colle(l, choisie)).length : 0), [lignes, choisie])

  async function lier(ligne) {
    if (!choisie || enCours) return
    setEnCours(true)
    try {
      await attachReleveLines(choisie, [ligne])
      setChoisie(null)
      await recharger()
    } catch (e) { alert('Erreur : ' + (e?.message || e)) }
    setEnCours(false)
  }

  const colonne = { flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }
  const recherche = { padding: '8px 10px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 8 }

  if (caisses === null) return <div style={{ padding: 16, color: '#8a7a70' }}>Chargement…</div>

  return (
    <div>
      <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 12 }}>
        Choisis une <b>caisse</b> à gauche : les <b>reçus de la banque</b> qui peuvent lui correspondre
        remontent à droite. Un clic sur le reçu, et c'est lié.
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ---------------- Caisses ---------------- */}
        <div style={colonne}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Caisses en attente ({caisses.length})</div>
          <input value={qc} onChange={e => setQc(e.target.value)} placeholder="Chercher un montant, une cliente…" style={recherche} />
          <div style={{ maxHeight: '60dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {moisDeCaisses.map(g => {
              const replie = replies.has(g.mois)
              return (
                <div key={g.mois} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => setReplies(s => { const n = new Set(s); n.has(g.mois) ? n.delete(g.mois) : n.add(g.mois); return n })}
                    style={{ textAlign: 'left', padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: '#F4F0EA', color: '#4a3a30', fontSize: 12, fontWeight: 600,
                      display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{replie ? '▸' : '▾'} {g.titre}</span>
                    <span style={{ fontWeight: 500, color: '#8a7a70' }}>{g.liste.length} · {fmtMoney(g.total)}</span>
                  </button>
                  {!replie && g.liste.map(e => {
                    const on = choisie?.id === e.id
                    return (
                      <button key={e.id} onClick={() => setChoisie(on ? null : e)}
                        style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
                          border: on ? '2px solid #993556' : '1px solid #e5d8c3', background: on ? '#FBF0F3' : '#F9F6F1' }}>
                        <b>{fmtMoney(e.amount_cash)}</b>{e.virement_client ? ` · ${e.virement_client}` : ''}
                        <div style={{ fontSize: 11, color: '#8a7a70' }}>
                          {fmtDateCourte(e.session_date)} · {e.payment_method === 'virement' ? 'virement' : e.payment_method === 'cheque' ? 'chèque' : 'espèces'}
                          {e.a_confirmer ? ' · ⏳ à confirmer' : e.preuve_manuelle ? ' · 🧾 versée' : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            {!moisDeCaisses.length && <div style={{ fontSize: 12, color: '#8a7a70' }}>Aucune caisse en attente.</div>}
          </div>
        </div>

        {/* ---------------- Reçus banque ---------------- */}
        <div style={colonne}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            Reçus de la banque non liés ({lignes.length})
            {choisie && <span style={{ color: '#5b2a86' }}> · {nbQuiCollent} pour cette caisse</span>}
          </div>
          <input value={ql} onChange={e => setQl(e.target.value)} placeholder="Chercher un montant, un nom, une date…" style={recherche} />
          {choisie && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#4a3a30', cursor: 'pointer' }}>
              <input type="checkbox" checked={tout} onChange={e => setTout(e.target.checked)} />
              Montrer aussi les reçus qui ne correspondent pas
            </label>
          )}
          <div style={{ maxHeight: '60dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lignesVues.map(l => {
              const ok = colle(l, choisie)
              return (
                <button key={l.key} onClick={() => lier(l)} disabled={!choisie || enCours}
                  title={choisie ? `Lier à ${fmtMoney(choisie.amount_cash)} · ${choisie.virement_client || ''}` : 'Choisis d’abord une caisse à gauche'}
                  style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, fontSize: 13,
                    cursor: choisie && !enCours ? 'pointer' : 'default', opacity: choisie ? 1 : 0.55,
                    border: `1px solid ${choisie && ok ? '#0a7d3d' : '#e5d8c3'}`, background: choisie && ok ? '#e6f6ec' : '#F9F6F1' }}>
                  <b>{fmtMoney(l.amount)}</b> · {l.ligne_date}
                  <div style={{ fontSize: 11, color: '#8a7a70', lineHeight: 1.3 }}>{l.label}</div>
                  {choisie && !ok && <div style={{ fontSize: 11, color: '#a9620a' }}>⚠️ ne correspond pas (montant, moyen ou date)</div>}
                </button>
              )
            })}
            {!lignesVues.length && (
              <div style={{ fontSize: 12, color: '#8a7a70' }}>
                {choisie
                  ? 'Aucun reçu ne correspond à cette caisse. Coche « Montrer aussi… » pour les voir tous.'
                  : 'Aucun reçu non lié.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
