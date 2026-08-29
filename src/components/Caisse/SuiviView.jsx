import { useState, useEffect, useMemo } from 'react'
import { usePersistedState } from '../../lib/usePersistedState'
import { confirmDialog } from '../../lib/confirmDialog'
import { Landmark, User, ScrollText, Banknote, Calendar, Eye, Upload, ArrowLeftRight, FileText } from 'lucide-react'
import { loadDestinataires, loadEnveloppesForSuivi, updateEnveloppeDate, setEnveloppeProof, uploadPreuve, getPreuveSignedUrl, setEnveloppeReleve, loadConfirmedReleveLines, clearEnveloppeReleve, loadFreeReleveLines, attachReleveLine, loadAllFreeReleveLines, loadAllLinkedReleveLines, linkReleveLineToEnv, setReleveLineIgnore, loadIgnoredReleveLines, loadPendingBanqueEnvelopes, loadBanqueEnvelopesWithEcart, loadBanqueEcartsValides, setEcartValide, clearEnveloppeProof, setEnveloppeIgnore, loadReleveImports } from '../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtMois, fmtDateCourte, fmtDateLongue, COLOR_PALETTE } from './_helpers'
import UploadPreuveModal from './modals/UploadPreuveModal'
import ReleveImportModal from './modals/ReleveImportModal'

export default function SuiviView({ user }) {
  const [subTab, setSubTab] = usePersistedState('lily.suivi.subTab', 'banque')
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        <SubTabBtn active={subTab === 'banque'} onClick={() => setSubTab('banque')}><Landmark size={14} /> Banque</SubTabBtn>
        <SubTabBtn active={subTab === 'perso'}  onClick={() => setSubTab('perso')}><User size={14} /> Perso</SubTabBtn>
        <SubTabBtn active={subTab === 'nonlie'} onClick={() => setSubTab('nonlie')}><ArrowLeftRight size={14} /> Reçus banque non liés</SubTabBtn>
      </div>
      {subTab === 'banque' && <BanqueSection user={user} />}
      {subTab === 'perso'  && <PersoSection  user={user} />}
      {subTab === 'nonlie' && <NonLieSection />}
    </div>
  )
}

function SubTabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999,
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  )
}

// Pastille de méthode de paiement (espèces, chèque ou virement)
function MethodPill({ method }) {
  const map = {
    cheque:   { bg: '#DCEBFB', color: '#0C447C', border: '#B5D4F2', icon: <ScrollText size={11} />, label: 'Chèque' },
    virement: { bg: '#EDE4F6', color: '#5b2a86', border: '#D6C3EA', icon: <ArrowLeftRight size={11} />, label: 'Virement' },
    cash:     { bg: '#DCF0E2', color: '#085041', border: '#B6E2C8', icon: <Banknote size={11} />, label: 'Espèces' },
  }
  const m = map[method] || map.cash
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '3px 8px', borderRadius: 999, fontWeight: 500,
      background: m.bg, color: m.color, border: `0.5px solid ${m.border}`,
    }}>
      {m.icon} {m.label}
    </span>
  )
}

// Étiquette de statut de rapprochement (couleur)
function ReleveStatus({ env }) {
  if (env.releve_status === 'trouve') return <span style={statusTrouve}>✓ Rapprochée</span>
  if (env.releve_status === 'a_confirmer') return <span style={statusConfirmer}>À confirmer</span>
  if (env.proof_url) return <span style={statusDone}>Versée</span>
  return <span style={statusPending}>À verser</span>
}

function BanqueSection({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [statusFilter, setStatusFilter] = useState('pending')
  const [methodFilter, setMethodFilter] = useState('all') // 'all' | 'cash' | 'cheque' | 'virement'
  const [list, setList] = useState([])
  const [uploadEnv, setUploadEnv] = useState(null)
  const [editDate, setEditDate] = useState({})
  const [showImport, setShowImport] = useState(false)
  const [confirmEnv, setConfirmEnv] = useState(null)
  const [suggestEnv, setSuggestEnv] = useState(null)
  const [query, setQuery] = useState('')
  const [takenLines, setTakenLines] = useState([])
  const [freeLines, setFreeLines] = useState([])
  const [hideNoSugg, setHideNoSugg] = useState(false)
  const [ecartList, setEcartList] = useState([])
  const [ecartValidesList, setEcartValidesList] = useState([])
  const [linkFrom, setLinkFrom] = useState(null)   // 1er virement d'un lien manuel « 2 = 1 »
  const [imports, setImports] = useState([])       // historique des relevés importés
  const [showHistory, setShowHistory] = useState(false)
  const [ignoreEnv, setIgnoreEnv] = useState(null) // enveloppe en cours d'« ignorer » (saisie de la raison)
  const [ignoreReason, setIgnoreReason] = useState('')

  useEffect(() => { reload() }, [year, month, statusFilter])

  async function reload() {
    const data = await loadEnveloppesForSuivi({ type: 'banque', month, year, statusFilter })
    setList(data)
    try { setTakenLines(await loadConfirmedReleveLines()) } catch { /* ignore */ }
    try { setFreeLines(await loadAllFreeReleveLines()) } catch { /* ignore */ }
    try { setEcartList(await loadBanqueEnvelopesWithEcart()) } catch { /* ignore */ }
    try { setEcartValidesList(await loadBanqueEcartsValides()) } catch { /* ignore */ }
    try { setImports(await loadReleveImports()) } catch { /* ignore */ }
  }

  // Montants disponibles dans le relevé par type (pour savoir si « Suggérer » servira)
  const availByMethod = useMemo(() => {
    const cash = new Set(), cheque = new Set(), virement = new Set()
    for (const l of freeLines) {
      const a = Math.round(Number(l.amount) * 100) / 100
      if (l.type === 'versement') cash.add(a)
      else if (l.type === 'cheque_depot') cheque.add(a)
      else if (l.type === 'virement_recu' || l.type === 'autre') virement.add(a)
    }
    return { cash, cheque, virement }
  }, [freeLines])
  function hasSuggestion(env) {
    const a = Math.round(Number(env.amount_cash) * 100) / 100
    return (availByMethod[env.payment_method || 'cash'] || availByMethod.cash).has(a)
  }

  // Filtrer par méthode de paiement + recherche texte (montant, client, source)
  const filteredList = useMemo(() => {
    let l = methodFilter === 'ecart' ? ecartList
      : methodFilter === 'ecart_valide' ? ecartValidesList
      : methodFilter === 'all' ? list
      : list.filter(e => (e.payment_method || 'cash') === methodFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter(e =>
        String(e.amount_cash).includes(q) ||
        (e.virement_client || '').toLowerCase().includes(q) ||
        (e.source || '').toLowerCase().includes(q) ||
        (e.note_proof || '').toLowerCase().includes(q))
    }
    if (hideNoSugg && methodFilter !== 'ecart' && methodFilter !== 'ecart_valide') l = l.filter(e => e.releve_status || e.proof_url || hasSuggestion(e))
    return l
  }, [list, ecartList, ecartValidesList, methodFilter, query, hideNoSugg, availByMethod])

  const total = useMemo(() => filteredList.reduce((s, e) => s + Number(e.amount_cash), 0), [filteredList])
  const totalEcart = useMemo(() => filteredList.reduce((s, e) => {
    if (e.amount_proof == null) return s
    const dd = Number(e.amount_proof) - Number(e.amount_cash)
    return Math.abs(dd) >= 0.005 ? s + dd : s
  }, 0), [filteredList])

  // Comptage par méthode (pour afficher dans le filtre)
  const countCash = useMemo(() => list.filter(e => (e.payment_method || 'cash') === 'cash').length, [list])
  const countCheque = useMemo(() => list.filter(e => e.payment_method === 'cheque').length, [list])
  const countVirement = useMemo(() => list.filter(e => e.payment_method === 'virement').length, [list])

  async function handleSaveDate(envId, newDate) {
    await updateEnveloppeDate(envId, newDate)
    setEditDate(prev => ({ ...prev, [envId]: false }))
    reload()
  }

  async function handleIgnore(envId, ignore, reason = null) {
    try { await setEnveloppeIgnore(envId, ignore, reason); setIgnoreEnv(null); reload() }
    catch (e) { alert('Erreur : ' + (e?.message || e)) }
  }

  async function handleValiderEcart(envId, valide) {
    try { await setEcartValide(envId, valide, user?.id || null); reload() }
    catch (e) { alert('Erreur : ' + (e?.message || e)) }
  }

  async function handleUpload(file, proofDate, amountProof, noteProof) {
    if (!uploadEnv || !file) return
    const url = await uploadPreuve(file, uploadEnv.id)
    await setEnveloppeProof(uploadEnv.id, url, proofDate, amountProof, noteProof)
    setUploadEnv(null)
    reload()
  }

  // Confirmer une enveloppe orange en choisissant la bonne ligne du relevé
  async function handlePickLine(envId, choice) {
    await setEnveloppeReleve(envId, {
      status: 'trouve',
      proofDate: choice?.d || undefined,
      libelle: choice ? `${choice.d} · ${choice.l}` : 'Confirmé manuellement',
      candidates: null,
    })
    setConfirmEnv(null)
    reload()
  }

  // Lier manuellement 2 virements à 1 seule ligne du relevé : les deux passent
  // « Rapprochée » avec une note « lié manuellement » (la banque les a reçus en une fois).
  async function handleLink(a, b) {
    const total = Number(a.amount_cash) + Number(b.amount_cash)
    const note = `🔗 Lié manuellement · 2 virements = 1 ligne (total ${fmtMoney(total)} dh)`
    await setEnveloppeReleve(a.id, { status: 'trouve', libelle: note, candidates: null })
    await setEnveloppeReleve(b.id, { status: 'trouve', libelle: note, candidates: null })
    setLinkFrom(null)
    reload()
  }

  // Annuler un rapprochement (erreur) → remet en gris
  async function handleClearReleve(envId) {
    await clearEnveloppeReleve(envId)
    reload()
  }

  // Retirer la preuve manuelle (photo/PDF) → repasse en attente
  async function handleClearProof(envId) {
    if (!await confirmDialog('Retirer la preuve de ce versement ? Il repassera « en attente ».', { danger: true, confirmLabel: 'Retirer' })) return
    await clearEnveloppeProof(envId)
    reload()
  }

  // Rattacher manuellement une ligne libre du relevé à une enveloppe
  async function handleAttach(env, line) {
    await attachReleveLine(env, line)
    setSuggestEnv(null)
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => Math.max(2026, y - 1))} disabled={year <= 2026} style={{ ...btnSlim, opacity: year <= 2026 ? 0.4 : 1 }}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
        <button onClick={() => setMonth(0)} style={tabBtn(month === 0, '#E6F1FB', '#0C447C', '#378ADD')}>Année</button>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={tabBtn(month === m.idx, '#E6F1FB', '#0C447C', '#378ADD')}>{m.label}</button>
        ))}
      </div>

      {/* Filtre méthode de paiement */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setMethodFilter('all')} style={methodFilterBtn(methodFilter === 'all')}>
          Tout ({list.length})
        </button>
        <button onClick={() => setMethodFilter('cash')} style={methodFilterBtn(methodFilter === 'cash', 'cash')}>
          <Banknote size={14} /> Espèces ({countCash})
        </button>
        <button onClick={() => setMethodFilter('cheque')} style={methodFilterBtn(methodFilter === 'cheque', 'cheque')}>
          <ScrollText size={14} /> Chèques ({countCheque})
        </button>
        <button onClick={() => setMethodFilter('virement')} style={methodFilterBtn(methodFilter === 'virement', 'virement')}>
          <ArrowLeftRight size={14} /> Virements ({countVirement})
        </button>
        <button onClick={() => setMethodFilter('ecart')} style={methodFilterBtn(methodFilter === 'ecart')}>
          ⚠️ Écart ({ecartList.length})
        </button>
        <button onClick={() => setMethodFilter('ecart_valide')} style={methodFilterBtn(methodFilter === 'ecart_valide')}>
          ✅ Validés ({ecartValidesList.length})
        </button>
      </div>

      {/* Recherche (montant, client, source) */}
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="🔍 Chercher un montant, un client, une source…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 12, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10 }}
      />

      {/* Filtre statut */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {['pending', 'done', 'ignored', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: statusFilter === s ? '#1a0f0a' : '#F4F0EA',
            color:      statusFilter === s ? 'white'   : '#4a3a30',
          }}>{s === 'pending' ? 'En attente' : s === 'done' ? 'Versées' : s === 'ignored' ? '🚫 Ignorés' : 'Toutes'}</button>
        ))}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4a3a30', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={hideNoSugg} onChange={e => setHideNoSugg(e.target.checked)} />
          Masquer « sans suggestion »
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        {imports.length > 0 && (
          <button onClick={() => setShowHistory(v => !v)} style={btnNormal}>
            🕑 Relevés importés ({imports.length})
          </button>
        )}
        <button onClick={() => setShowImport(true)} style={{ ...btnNormal, background: '#993556', color: 'white', border: 'none' }}>
          <FileText size={14} /> Importer relevé bancaire
        </button>
      </div>

      {showHistory && (
        <div style={{ marginBottom: 14, border: '1px solid #e5d8c3', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#F4F0EA', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#4a3a30' }}>
            Historique des relevés importés
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {imports.map(im => (
              <div key={im.id} style={{ padding: '8px 12px', borderTop: '1px solid #efe7d9', fontSize: 12, color: '#4a3a30' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{fmtDateLongue(im.imported_at)}</span>
                  <span style={{ color: '#8a7a70' }}>
                    par {im.importer?.full_name || im.importer?.username || '—'}
                  </span>
                </div>
                <div style={{ marginTop: 2 }}>
                  📄 {im.files || '—'}{im.banks ? ` · 🏦 ${im.banks}` : ''}
                </div>
                {(im.period_start || im.period_end) && (
                  <div style={{ marginTop: 2, color: '#8a7a70' }}>
                    Période : {im.period_start ? fmtDateCourte(im.period_start) : '?'} → {im.period_end ? fmtDateCourte(im.period_end) : '?'}
                  </div>
                )}
                <div style={{ marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: '#0a7d3d' }}>✓ {im.nb_trouve} trouvés</span>
                  <span style={{ color: '#a9620a' }}>⚠ {im.nb_a_confirmer} à confirmer</span>
                  <span style={{ color: '#8a7a70' }}>○ {im.nb_absent} absents</span>
                  {im.recompute ? <span style={{ color: '#993556' }}>↻ recalcul</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: 8, marginBottom: 14, background: '#E6F1FB', color: '#0C447C' }}>
        <div style={{ fontSize: 15, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Landmark size={16} /> Versements bancaires</div>
        <div style={{ fontSize: 13 }}>{filteredList.length} {statusFilter === 'pending' ? 'en attente' : ''} · {fmtMoney(total)}{Math.abs(totalEcart) >= 0.005 ? <span style={{ color: '#99201E', fontWeight: 600 }}> · écart {totalEcart > 0 ? '+' : ''}{fmtMoney(totalEcart)}</span> : ''}</div>
      </div>

      {filteredList.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>
          Aucune enveloppe banque dans ce filtre.
        </div>
      )}

      {filteredList.map(env => (
        <div key={env.id} style={rowCard}>
          <div>
            <div style={{ fontSize: 11, color: '#4a3a30', display: 'flex', alignItems: 'center', gap: 6 }}>
              Enveloppe <MethodPill method={env.payment_method || 'cash'} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(env.amount_cash)}</div>
            {env.virement_client && <div style={{ fontSize: 11, color: '#5b2a86', marginTop: 2 }}>{env.virement_client}</div>}
            <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 2 }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
            {env.releve_status && env.note_proof && (
              <div style={{ fontSize: 10, color: env.releve_status === 'trouve' ? '#0a7d3d' : '#a9620a', marginTop: 4, lineHeight: 1.3 }}>
                {env.releve_status === 'a_confirmer' ? 'Lignes possibles : ' : 'Relevé : '}{env.note_proof}
              </div>
            )}
            {env.amount_proof != null && Math.abs(Number(env.amount_proof) - Number(env.amount_cash)) >= 0.005 && (
              <div style={{ fontSize: 11, color: '#99201E', fontWeight: 600, marginTop: 4 }}>
                ⚠️ Écart : relevé {fmtMoney(env.amount_proof)} ({Number(env.amount_proof) - Number(env.amount_cash) > 0 ? '+' : ''}{fmtMoney(Number(env.amount_proof) - Number(env.amount_cash))})
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a7a70' }}>Date du versement</div>
            {editDate[env.id] ? (
              <input type="date" defaultValue={env.proof_date || ''}
                onBlur={(e) => handleSaveDate(env.id, e.target.value)}
                style={{ padding: '4px 8px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 6 }} />
            ) : (
              <div onClick={() => setEditDate({ ...editDate, [env.id]: true })} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4BFB6', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a3a30' }}>
                <Calendar size={12} /> {env.proof_date ? fmtDateLongue(env.proof_date) : 'À définir'}
              </div>
            )}
          </div>
          <div>
            <ReleveStatus env={env} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {env.proof_url ? (
              <>
                <button onClick={async () => {
                  const url = await getPreuveSignedUrl(env.proof_url); window.open(url, '_blank')
                }} style={btnNormal}><Eye size={14} /> Voir preuve</button>
                {!env.releve_status && (
                  <button onClick={() => handleClearProof(env.id)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#99201E' }}>
                    🗑️ Retirer preuve
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => setUploadEnv(env)} style={btnNormal}><Upload size={14} /> Ajouter preuve</button>
            )}
            {env.releve_status === 'a_confirmer' && (
              <button onClick={() => setConfirmEnv(env)} style={{ ...btnNormal, background: '#FDF0DF', color: '#a9620a', border: '1px solid #f0d9b8' }}>
                ✓ Confirmer
              </button>
            )}
            {env.releve_status && (
              <button onClick={() => handleClearReleve(env.id)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#99201E' }}>
                ↺ Annuler
              </button>
            )}
            {(env.payment_method === 'virement') && env.releve_status !== 'trouve' && !env.releve_ignore && (
              <button onClick={() => setLinkFrom(env)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#5b2a86', border: '1px solid #D6C3EA' }}>
                🔗 Lier 2
              </button>
            )}
            {!env.releve_status && !env.proof_url && !env.releve_ignore && (
              hasSuggestion(env) ? (
                <button onClick={() => setSuggestEnv(env)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#5b2a86', border: '1px solid #D6C3EA' }}>
                  💡 Suggérer
                </button>
              ) : (
                <button disabled style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#9a8f86', border: '1px solid #e5d8c3', background: '#f3efe9', cursor: 'default', opacity: 0.75 }}>
                  Sans suggestion
                </button>
              )
            )}
            {!env.releve_status && !env.proof_url && !env.releve_ignore && (
              <button onClick={() => { setIgnoreEnv(env); setIgnoreReason('') }} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#8a7a70' }}>
                🚫 Ignorer
              </button>
            )}
            {env.releve_ignore && env.releve_ignore_reason && (
              <span style={{ fontSize: 11, color: '#8a7a70', fontStyle: 'italic', alignSelf: 'center' }}>🚫 {env.releve_ignore_reason}</span>
            )}
            {env.releve_ignore && (
              <button onClick={() => handleIgnore(env.id, false)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#0a7d3d', border: '1px solid #B6E2C8' }}>
                ↩ Réactiver
              </button>
            )}
            {methodFilter === 'ecart' && (
              <button onClick={() => handleValiderEcart(env.id, true)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#0a7d3d', border: '1px solid #B6E2C8' }}>
                ✓ Valider l'écart
              </button>
            )}
            {methodFilter === 'ecart_valide' && (
              <button onClick={() => handleValiderEcart(env.id, false)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#8a7a70' }}>
                ↩ Remettre en écart
              </button>
            )}
          </div>
        </div>
      ))}

      {uploadEnv && (
        <UploadPreuveModal env={uploadEnv} kind="banque"
          onClose={() => setUploadEnv(null)} onUpload={handleUpload} />
      )}

      {ignoreEnv && (
        <div onClick={() => setIgnoreEnv(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', border: '0.5px solid #e5d8c3' }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Ignorer ce versement</div>
            <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 14 }}>
              {fmtMoney(ignoreEnv.amount_cash)} · {ignoreEnv.virement_client || ignoreEnv.source || '—'}
            </div>
            <label style={{ fontSize: 12, color: '#4a3a30' }}>Raison (facultative)</label>
            <textarea value={ignoreReason} onChange={e => setIgnoreReason(e.target.value)} autoFocus rows={3}
              placeholder="Ex : rien à lier dans le relevé, versement jamais déposé…"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '8px 12px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setIgnoreEnv(null)} style={btnNormal}>Annuler</button>
              <button onClick={() => handleIgnore(ignoreEnv.id, true, ignoreReason.trim() || null)} style={{ ...btnNormal, background: '#993556', color: 'white', border: 'none' }}>🚫 Ignorer</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ReleveImportModal onClose={() => setShowImport(false)} onDone={reload} user={user} />
      )}

      {linkFrom && (
        <LinkTwoModal from={linkFrom} list={list} onClose={() => setLinkFrom(null)} onLink={handleLink} />
      )}

      {confirmEnv && (
        <ConfirmChoiceModal env={confirmEnv} takenLines={takenLines} onClose={() => setConfirmEnv(null)} onPick={handlePickLine} />
      )}

      {suggestEnv && (
        <SuggestModal env={suggestEnv} onClose={() => setSuggestEnv(null)} onAttach={handleAttach} />
      )}
    </div>
  )
}

// Onglet : virements/dépôts reçus en banque (dans les relevés) non liés à une enveloppe Odoo
function NonLieSection() {
  const [lines, setLines] = useState(null)
  const [pendingEnvs, setPendingEnvs] = useState([])
  const [linkLine, setLinkLine] = useState(null)
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | cash | cheque | virement
  const [view, setView] = useState('free')            // 'free' = non liés | 'linked' = déjà liés | 'ignored' = ignorés
  const [ignoreLine, setIgnoreLine] = useState(null)  // ligne en cours d'« ignorer » (saisie raison)
  const [ignoreReason, setIgnoreReason] = useState('')
  const [parMois, setParMois] = useState(false)       // regrouper les lignes par mois
  const [replies, setReplies] = useState([])          // mois repliés
  async function reload() {
    setLines(null)
    const loader = view === 'linked' ? loadAllLinkedReleveLines : view === 'ignored' ? loadIgnoredReleveLines : loadAllFreeReleveLines
    try { setLines(await loader()) } catch { setLines([]) }
    try { setPendingEnvs(await loadPendingBanqueEnvelopes()) } catch { setPendingEnvs([]) }
  }
  useEffect(() => { reload() }, [view])
  async function handleLink(env, line) {
    // Enveloppe déjà rapprochée : c'est souvent la MAUVAISE remise (relevés importés mois
    // par mois -> l'app a validé la seule ligne du fichier en cours). On détache d'abord,
    // ce qui renvoie l'ancienne ligne dans « non liés », puis on relie à la bonne.
    if (env.deja_rapprochee) {
      const quoi = env.note_proof ? `« ${env.note_proof} »` : 'une autre ligne du relevé'
      const ok = await confirmDialog(
        `Cette enveloppe est déjà rapprochée à ${quoi}.\n\nLa relier au dépôt du ${line.ligne_date} à la place ? L'ancienne ligne repartira dans « non liés ».`,
        { danger: true, confirmLabel: 'Remplacer' })
      if (!ok) return
      await clearEnveloppeReleve(env.id)
    }
    await linkReleveLineToEnv(env, line)
    setLinkLine(null)
    reload()
  }
  async function handleIgnore(key, ignore, reason = null) {
    try { await setReleveLineIgnore(key, ignore, reason); setIgnoreLine(null); reload() }
    catch (e) { alert('Erreur : ' + (e?.message || e)) }
  }
  async function handleDelier(l) {
    if (!l.used_by) return
    if (!await confirmDialog('Délier ce montant du versement ? (la ligne redevient « non liée »)', { danger: true, confirmLabel: 'Délier' })) return
    try { await clearEnveloppeReleve(l.used_by); reload() }
    catch (e) { alert('Erreur : ' + (e?.message || e)) }
  }
  const TYPE_GROUP = { versement: 'cash', cheque_depot: 'cheque', virement_recu: 'virement', autre: 'virement' }
  const count = useMemo(() => {
    const c = { cash: 0, cheque: 0, virement: 0 }
    for (const l of (lines || [])) { const g = TYPE_GROUP[l.type] || 'virement'; c[g]++ }
    return c
  }, [lines])
  const list = useMemo(() => {
    if (!lines) return []
    let l = typeFilter === 'all' ? lines : lines.filter(x => (TYPE_GROUP[x.type] || 'virement') === typeFilter)
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(x => String(x.amount).includes(s) || (x.label || '').toLowerCase().includes(s) || (x.ligne_date || '').includes(s))
    return l
  }, [lines, q, typeFilter])
  const total = useMemo(() => list.reduce((s, l) => s + Number(l.amount || 0), 0), [list])
  // Regroupement par mois (au choix) : avec plusieurs centaines de lignes, la liste
  // à plat est illisible. Chaque mois se replie d'un clic.
  const groupes = useMemo(() => {
    const m = new Map()
    for (const l of list) {
      const k = (l.ligne_date || '').slice(0, 7)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(l)
    }
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mois, lignes]) => ({
        mois,
        titre: /^\d{4}-\d{2}$/.test(mois) ? `${fmtMois(Number(mois.slice(5, 7)) - 1)} ${mois.slice(0, 4)}` : 'Sans date',
        lignes,
        total: lignes.reduce((s, l) => s + Number(l.amount || 0), 0),
      }))
  }, [list])
  const toggleMois = (m) => setReplies(r => (r.includes(m) ? r.filter(x => x !== m) : [...r, m]))
  const ligneCard = (l) => (
        <div key={l.key} style={{ ...rowCard, gridTemplateColumns: '1fr auto auto', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#8a7a70', display: 'flex', alignItems: 'center', gap: 6 }}>
              {l.ligne_date}
              {l.banque && <span style={{ padding: '1px 7px', borderRadius: 999, background: '#F4F0EA', color: '#4a3a30' }}>{l.banque}</span>}
            </div>
            <div style={{ fontSize: 13, color: '#1a0f0a' }}>{l.label || '—'}</div>
            {l.doublon_probable && (
              <div style={{ fontSize: 11, color: '#8a5a2a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>⚠ doublon probable — même montant le {l.doublon_probable.date} : « {l.doublon_probable.label} »</span>
                {view === 'free' && (
                  <button onClick={() => handleIgnore(l.key, true, `Doublon de la ligne du ${l.doublon_probable.date}`)}
                    style={{ ...btnNormal, fontSize: 10.5, padding: '2px 8px', color: '#8a5a2a', border: '1px solid #e5cfae' }}>
                    Ignorer ce doublon
                  </button>
                )}
              </div>
            )}
            {view === 'linked' && l.env && (
              <div style={{ fontSize: 11, color: '#0a7d3d', marginTop: 2 }}>
                → {l.env.destinataire?.name || l.env.source || 'enveloppe'} · {l.env.session_date}{l.env.amount_cash != null ? ` · ${fmtMoney(l.env.amount_cash)}` : ''}
              </div>
            )}
            {view === 'ignored' && l.ignore_reason && (
              <div style={{ fontSize: 11, color: '#8a7a70', fontStyle: 'italic', marginTop: 2 }}>🚫 {l.ignore_reason}</div>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#5b2a86' }}>{fmtMoney(l.amount)}</div>
          {view === 'linked' ? (
            <button onClick={() => handleDelier(l)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#A32D2D', border: '1px solid #f0c9c9', marginLeft: 8 }}>
              Délier
            </button>
          ) : view === 'ignored' ? (
            <button onClick={() => handleIgnore(l.key, false)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#0a7d3d', border: '1px solid #B6E2C8', marginLeft: 8 }}>
              ↩ Réactiver
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              <button onClick={() => setLinkLine(l)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#5b2a86', border: '1px solid #D6C3EA' }}>
                🔗 Lier
              </button>
              <button onClick={() => { setIgnoreLine(l); setIgnoreReason('') }} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#8a7a70' }}>
                🚫 Ignorer
              </button>
            </div>
          )}
        </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setView('free')} style={methodFilterBtn(view === 'free')}>Non liés</button>
        <button onClick={() => setView('linked')} style={methodFilterBtn(view === 'linked')}>Déjà liés</button>
        <button onClick={() => setView('ignored')} style={methodFilterBtn(view === 'ignored')}>🚫 Ignorés</button>
      </div>
      <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 10 }}>
        {view === 'linked'
          ? 'Lignes du relevé déjà rattachées à un versement (avec la destination). Tu peux les délier si besoin.'
          : <>Lignes reçues sur les relevés bancaires qui n'ont <b>pas</b> trouvé d'enveloppe Odoo correspondante. Rattache-les via « 💡 Suggérer » sur les enveloppes grises.</>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setTypeFilter('all')} style={methodFilterBtn(typeFilter === 'all')}>Tout ({(lines || []).length})</button>
        <button onClick={() => setTypeFilter('cash')} style={methodFilterBtn(typeFilter === 'cash')}><Banknote size={14} /> Espèces ({count.cash})</button>
        <button onClick={() => setTypeFilter('cheque')} style={methodFilterBtn(typeFilter === 'cheque')}><ScrollText size={14} /> Chèques ({count.cheque})</button>
        <button onClick={() => setTypeFilter('virement')} style={methodFilterBtn(typeFilter === 'virement')}><ArrowLeftRight size={14} /> Virements ({count.virement})</button>
        <button onClick={() => { setParMois(!parMois); setReplies([]) }} style={{ ...methodFilterBtn(parMois), marginLeft: 'auto' }}>
          <Calendar size={14} /> {parMois ? 'Tout afficher' : 'Par mois'}
        </button>
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)}
        placeholder="🔍 montant, nom, date…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 12, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: '#EDE4F6', color: '#5b2a86', fontSize: 13 }}>
        <span>{lines === null ? 'Chargement…' : `${list.length} ligne(s) ${view === 'linked' ? 'liée(s)' : 'non liée(s)'}`}</span>
        <span>{fmtMoney(total)}</span>
      </div>
      {lines !== null && list.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>
          Rien ici. (Ré-importe tes relevés pour remplir cette liste.)
        </div>
      )}
      {!parMois && list.map(l => ligneCard(l))}
      {parMois && groupes.map(g => {
        const replie = replies.includes(g.mois)
        return (
          <div key={g.mois} style={{ marginBottom: 10 }}>
            <button onClick={() => toggleMois(g.mois)} style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              padding: '9px 14px', marginBottom: 6, borderRadius: 10, cursor: 'pointer',
              background: '#F4F0EA', border: '0.5px solid #e5d8c3', color: '#4a3a30', fontSize: 13,
            }}>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{replie ? '▸' : '▾'} {g.titre}</span>
              <span>{g.lignes.length} ligne(s) · <b>{fmtMoney(g.total)}</b></span>
            </button>
            {!replie && g.lignes.map(l => ligneCard(l))}
          </div>
        )
      })}

      {linkLine && (
        <LinkLineModal line={linkLine} envs={pendingEnvs} onClose={() => setLinkLine(null)} onLink={handleLink} />
      )}

      {ignoreLine && (
        <div onClick={() => setIgnoreLine(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', border: '0.5px solid #e5d8c3' }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Ignorer ce versement</div>
            <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 14 }}>
              {fmtMoney(ignoreLine.amount)} · {ignoreLine.ligne_date}{ignoreLine.label ? ` · ${ignoreLine.label}` : ''}
            </div>
            <label style={{ fontSize: 12, color: '#4a3a30' }}>Raison (facultative)</label>
            <textarea value={ignoreReason} onChange={e => setIgnoreReason(e.target.value)} autoFocus rows={3}
              placeholder="Ex : encaissement TPE, remboursement, virement interne…"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '8px 12px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setIgnoreLine(null)} style={btnNormal}>Annuler</button>
              <button onClick={() => handleIgnore(ignoreLine.key, true, ignoreReason.trim() || null)} style={{ ...btnNormal, background: '#993556', color: 'white', border: 'none' }}>🚫 Ignorer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Lier une ligne du relevé (non liée) à l'enveloppe choisie ; écart si montants ≠.
function LinkLineModal({ line, envs, onClose, onLink }) {
  const [q, setQ] = useState('')
  const guess = ({ versement: 'cash', cheque_depot: 'cheque', virement_recu: 'virement', autre: 'virement' })[line.type] || 'virement'
  const [method, setMethod] = useState(guess)   // type d'enveloppe à lier — modifiable (espèces/chèque/virement)
  const methodLabel = method === 'cash' ? 'espèces' : method === 'cheque' ? 'chèque' : 'virement'
  const list = useMemo(() => {
    let l = envs.filter(e => (e.payment_method || 'cash') === method)
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(e => String(e.amount_cash).includes(s) || (e.virement_client || '').toLowerCase().includes(s) || (e.source || '').toLowerCase().includes(s))
    // Les enveloppes encore libres d'abord ; les déjà rapprochées à la fin (dépannage).
    return l.sort((a, b) =>
      (a.deja_rapprochee ? 1 : 0) - (b.deja_rapprochee ? 1 : 0) ||
      Math.abs(Number(a.amount_cash) - Number(line.amount)) - Math.abs(Number(b.amount_cash) - Number(line.amount)))
  }, [envs, q, method, line.amount])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 480, maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Lier ce reçu de {fmtMoney(line.amount)}</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 4 }}>{line.ligne_date} · {line.label}</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 8 }}>Choisis l'enveloppe <b>{methodLabel}</b> à qui appartient ce montant :</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setMethod('cash')} style={methodFilterBtn(method === 'cash')}><Banknote size={14} /> Espèces</button>
          <button onClick={() => setMethod('cheque')} style={methodFilterBtn(method === 'cheque')}><ScrollText size={14} /> Chèques</button>
          <button onClick={() => setMethod('virement')} style={methodFilterBtn(method === 'virement')}><ArrowLeftRight size={14} /> Virements</button>
        </div>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 nom du client, montant…" autoFocus
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 12, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10 }} />
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a7a70', padding: 8 }}>Aucune enveloppe {methodLabel} en attente. (Essaie un autre mot.)</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {list.slice(0, 60).map(e => {
              const diff = Number(line.amount) - Number(e.amount_cash)
              const hasGap = Math.abs(diff) >= 0.005
              return (
                <button key={e.id} onClick={() => onLink(e, line)}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: `1px solid ${e.deja_rapprochee ? '#f0d9b8' : '#e5d8c3'}`, background: e.deja_rapprochee ? '#FDF7EE' : '#F9F6F1', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>
                    {(e.virement_client || e.source || 'Enveloppe').trim()} · {fmtDateCourte(e.session_date)}
                    {e.deja_rapprochee && (
                      <span style={{ display: 'block', fontSize: 10.5, color: '#a9620a', marginTop: 2 }}>
                        ⚠ déjà rapprochée{e.note_proof ? ` au ${e.note_proof.slice(0, 10)}` : ''} — cliquer pour remplacer
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(e.amount_cash)}{hasGap ? <span style={{ color: '#99201E', fontWeight: 600 }}> · écart {diff > 0 ? '+' : ''}{fmtMoney(diff)}</span> : ''}</span>
                </button>
              )
            })}
          </div>
        )}
        <button onClick={onClose} style={{ ...btnNormal, width: '100%' }}>Fermer</button>
      </div>
    </div>
  )
}

// Suggestions de lignes LIBRES du relevé (même montant) pour rattacher une enveloppe grise
function SuggestModal({ env, onClose, onAttach }) {
  const [lines, setLines] = useState(null)
  useEffect(() => {
    (async () => {
      let ls
      try { ls = await loadFreeReleveLines(env.amount_cash, env.payment_method) } catch { ls = [] }
      // Auto : parmi les lignes du même montant, une SEULE "VIR INST RECU" à la
      // même date que l'enveloppe -> on l'attache et on l'accorde directement.
      const sameDayInst = ls.filter(l => l.type === 'virement_recu'
        && /\bINST\b/i.test(l.label || '') && l.ligne_date === env.session_date)
      if (sameDayInst.length === 1) {
        onAttach(env, sameDayInst[0])
        return
      }
      setLines(ls)
    })()
  }, [env.id])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 480, maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Lignes du relevé de {fmtMoney(env.amount_cash)} encore libres</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 12 }}>
          {env.virement_client ? `${env.virement_client} · ` : ''}{fmtDateCourte(env.session_date)} — choisis la ligne qui correspond :
        </div>
        {lines === null ? (
          <div style={{ fontSize: 13, color: '#8a7a70', padding: 8 }}>Chargement…</div>
        ) : lines.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a7a70', padding: 8 }}>Aucune ligne libre de ce montant dans les relevés importés.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {lines.map(l => (
              <button key={l.key} onClick={() => onAttach(env, l)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5d8c3', background: '#F9F6F1', cursor: 'pointer', fontSize: 13 }}>
                <b>{l.ligne_date}</b> · {l.label}
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ ...btnNormal, width: '100%' }}>Fermer</button>
      </div>
    </div>
  )
}

// Choix de la bonne ligne du relevé pour une enveloppe « à confirmer »
function ConfirmChoiceModal({ env, takenLines = [], onClose, onPick }) {
  const normLine = s => (s || '').replace(/\s+/g, ' ').trim().toUpperCase()
  const taken = takenLines.map(normLine)
  let candidates = []
  try { candidates = JSON.parse(env.releve_candidates || '[]') } catch { candidates = [] }
  // Retire les lignes déjà attribuées à une enveloppe verte
  candidates = candidates.filter(c => {
    const key = normLine(`${c.d} · ${c.l}`)
    return !taken.some(t => t.startsWith(key.slice(0, 40)) || key.startsWith(t.slice(0, 40)))
  })
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 460, maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Quelle ligne du relevé ?</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 12 }}>
          {fmtMoney(env.amount_cash)}{env.virement_client ? ` · ${env.virement_client}` : ''} — choisis la ligne qui correspond :
        </div>
        {candidates.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a7a70', marginBottom: 12 }}>Aucune ligne mémorisée. Tu peux confirmer sans choisir.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {candidates.map((c, i) => (
              <button key={i} onClick={() => onPick(env.id, c)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5d8c3', background: '#F9F6F1', cursor: 'pointer', fontSize: 13 }}>
                <b>{c.d}</b> · {c.l}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onPick(env.id, null)} style={{ ...btnNormal, flex: 1 }}>Confirmer sans choisir</button>
          <button onClick={onClose} style={{ ...btnNormal, flex: 1 }}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

function LinkTwoModal({ from, list, onClose, onLink }) {
  const candidates = list.filter(e => e.id !== from.id && (e.payment_method || 'cash') === 'virement' && e.releve_status !== 'trouve')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 460, maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🔗 Lier 2 virements = 1 ligne</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 6 }}>
          Virement 1 : <b>{fmtMoney(from.amount_cash)} dh</b>{from.virement_client ? ` · ${from.virement_client}` : ''}
        </div>
        <div style={{ fontSize: 12, color: '#8a7a70', marginBottom: 12 }}>Choisis le 2ᵉ virement (la banque les a reçus en un seul virement) :</div>
        {candidates.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a7a70', marginBottom: 12 }}>Aucun autre virement à lier.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {candidates.map(e => (
              <button key={e.id} onClick={() => onLink(from, e)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5d8c3', background: '#F9F6F1', cursor: 'pointer', fontSize: 13 }}>
                <b>{fmtMoney(e.amount_cash)} dh</b>{e.virement_client ? ` · ${e.virement_client}` : ''} · {fmtDateCourte(e.session_date)}
                <span style={{ color: '#5b2a86' }}> → total {fmtMoney(Number(from.amount_cash) + Number(e.amount_cash))} dh</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ ...btnNormal, width: '100%' }}>Annuler</button>
      </div>
    </div>
  )
}

function PersoSection({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [statusFilter, setStatusFilter] = useState('pending')
  const [persoDests, setPersoDests] = useState([])
  const [list, setList] = useState([])
  const [uploadEnv, setUploadEnv] = useState(null)
  const [editDate, setEditDate] = useState({})

  useEffect(() => { (async () => {
    const all = await loadDestinataires()
    setPersoDests(all.filter(d => d.type === 'perso'))
  })() }, [])

  useEffect(() => { reload() }, [year, month, statusFilter])

  async function reload() {
    const data = await loadEnveloppesForSuivi({ type: 'perso', month, year, statusFilter })
    setList(data)
  }

  async function handleSaveDate(envId, newDate) {
    await updateEnveloppeDate(envId, newDate); setEditDate(p => ({ ...p, [envId]: false })); reload()
  }

  async function handleUpload(file, proofDate, amountProof, noteProof) {
    if (!uploadEnv || !file) return
    const url = await uploadPreuve(file, uploadEnv.id)
    await setEnveloppeProof(uploadEnv.id, url, proofDate, amountProof, noteProof)
    setUploadEnv(null); reload()
  }

  async function handleClearProof(envId) {
    if (!await confirmDialog('Retirer la preuve de ce remboursement ? Il repassera « à rembourser ».', { danger: true, confirmLabel: 'Retirer' })) return
    await clearEnveloppeProof(envId)
    reload()
  }

  // Perso = espèces uniquement (les chèques vont tous à la Banque)
  const cashOnly = useMemo(() => list.filter(e => (e.payment_method || 'cash') === 'cash'), [list])

  const byPerson = useMemo(() => {
    const map = {}
    persoDests.forEach(d => { map[d.id] = { dest: d, list: [] } })
    cashOnly.forEach(e => {
      if (e.destinataire_id && map[e.destinataire_id]) map[e.destinataire_id].list.push(e)
    })
    return map
  }, [cashOnly, persoDests])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => Math.max(2026, y - 1))} disabled={year <= 2026} style={{ ...btnSlim, opacity: year <= 2026 ? 0.4 : 1 }}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
        <button onClick={() => setMonth(0)} style={tabBtn(month === 0, '#993556', 'white', '#993556')}>Année</button>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={tabBtn(month === m.idx, '#993556', 'white', '#993556')}>{m.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {['pending', 'done', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: statusFilter === s ? '#1a0f0a' : '#F4F0EA',
            color:      statusFilter === s ? 'white'   : '#4a3a30',
          }}>{s === 'pending' ? 'En attente' : s === 'done' ? 'Remboursées' : 'Toutes'}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {Object.values(byPerson).map(({ dest, list: items }) => {
          const c = COLOR_PALETTE[dest.color_key] || COLOR_PALETTE.gris
          const totalAttente = items.reduce((s, e) => s + Number(e.amount_cash), 0)
          return (
            <div key={dest.id}>
              <div style={{ background: c.bg, color: c.text, padding: '12px 16px', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={14} /> {dest.name}</div>
                <div style={{ fontSize: 12 }}>{items.length} · {fmtMoney(totalAttente)}</div>
              </div>
              {items.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: 8 }}>Aucune enveloppe</div>}
              {items.map(env => (
                <div key={env.id} style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 8, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(env.amount_cash)}</div>
                    <span style={env.proof_url ? statusDone : statusPending}>{env.proof_url ? 'Remboursée' : 'À rembourser'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 8 }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
                  <div style={{ fontSize: 10, color: '#8a7a70' }}>Date de prise</div>
                  {editDate[env.id] ? (
                    <input type="date" defaultValue={env.proof_date || ''}
                      onBlur={(e) => handleSaveDate(env.id, e.target.value)}
                      style={{ padding: '3px 8px', fontSize: 12, border: '1px solid #C4BFB6', borderRadius: 6, marginBottom: 8 }} />
                  ) : (
                    <div onClick={() => setEditDate({ ...editDate, [env.id]: true })} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4BFB6', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a3a30', marginBottom: 8 }}>
                      <Calendar size={12} /> {env.proof_date ? fmtDateLongue(env.proof_date) : 'À définir'}
                    </div>
                  )}
                  <div>
                    {env.proof_url ? (
                      <>
                        <button onClick={async () => { const url = await getPreuveSignedUrl(env.proof_url); window.open(url, '_blank') }} style={{ ...btnNormal, width: '100%' }}><Eye size={14} /> Voir preuve</button>
                        <button onClick={() => handleClearProof(env.id)} style={{ ...btnNormal, width: '100%', fontSize: 11, color: '#99201E' }}>🗑️ Retirer preuve</button>
                      </>
                    ) : (
                      <button onClick={() => setUploadEnv(env)} style={{ ...btnNormal, width: '100%' }}><Upload size={14} /> Preuve remboursement</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {uploadEnv && (
        <UploadPreuveModal env={uploadEnv} kind="perso"
          onClose={() => setUploadEnv(null)} onUpload={handleUpload} />
      )}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '8px 14px', borderRadius: 10, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const rowCard = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 130px 1fr', gap: 14, alignItems: 'center',
  padding: '14px 16px', borderRadius: 14, marginBottom: 8, background: 'white', border: '0.5px solid #e5d8c3',
  boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
}
const statusPending   = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#FCE9E8', color: '#99201E' }
const statusDone      = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#E1F5EE', color: '#085041' }
const statusTrouve    = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 600, background: '#E6F6EC', color: '#0a7d3d' }
const statusConfirmer = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 600, background: '#FDF0DF', color: '#a9620a' }

function tabBtn(active) {
  return {
    padding: '8px 16px', borderRadius: 999,
    border: active ? '1px solid #993556' : '1px solid #e5d8c3',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2' : '#1a0f0a',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

function methodFilterBtn(active) {
  return {
    fontSize: 13, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontWeight: 500,
    border: active ? '1px solid #993556' : '1px solid #e5d8c3',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2' : '#1a0f0a',
  }
}
